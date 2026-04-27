/**
 * reservation-reminder
 *
 * Cron-driven. Finds restaurant.reservation rows with reservation_time
 * between now+90 min and now+150 min that haven't had a reminder sent yet,
 * and dispatches via WhatsApp (WATI) or falls back to nothing.
 *
 * Service-role only.
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { adminClient } from '../_shared/supabase.ts'

serve(async (req) => {
  const pre = handleOptions(req); if (pre) return pre
  const auth = req.headers.get('authorization') ?? ''
  const expected = `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}`
  if (auth !== expected) {
    return new Response(JSON.stringify({ error: 'forbidden' }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const db = adminClient() as unknown as {
    schema: (n: string) => ReturnType<typeof adminClient>
  }
  // We're querying restaurant schema, not public.
  const r = adminClient()
  const rest = (r as unknown as { schema: (n: string) => ReturnType<typeof adminClient> }).schema('restaurant')

  const fromISO = new Date(Date.now() + 90 * 60_000).toISOString()
  const toISO   = new Date(Date.now() + 150 * 60_000).toISOString()

  const { data: due } = await rest.from('reservation')
    .select('id, customer_name, phone, party_size, reservation_time')
    .gte('reservation_time', fromISO)
    .lte('reservation_time', toISO)
    .eq('status', 'confirmed')
    .is('reminder_at', null)

  let sent = 0
  const watiKey = Deno.env.get('WATI_API_KEY')
  const watiUrl = Deno.env.get('WATI_API_URL')

  for (const res of (due ?? [])) {
    if (watiKey && watiUrl && res.phone) {
      try {
        const phone = res.phone.replace(/[^\d]/g, '')
        const at = new Date(res.reservation_time as string).toLocaleString('en-MY', {
          timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'medium', timeStyle: 'short',
        })
        const body = `Hi ${res.customer_name}, this is a reminder of your reservation at ${at} for ${res.party_size}. See you soon!`
        await fetch(`${watiUrl}/sendSessionMessage/${phone}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${watiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageText: body }),
        })
        sent++
      } catch { /* ignore */ }
    }
    // Mark reminder dispatched even when we have no provider — so we don't loop.
    await rest.from('reservation').update({ reminder_at: new Date().toISOString() }).eq('id', res.id)
  }

  return new Response(JSON.stringify({ ok: true, due: (due ?? []).length, sent }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
