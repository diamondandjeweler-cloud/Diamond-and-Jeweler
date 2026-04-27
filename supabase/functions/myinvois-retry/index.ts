/**
 * myinvois-retry
 *
 * Cron-driven (every 2 min). Reads restaurant.einvoice_due_for_retry,
 * dispatches each row to myinvois-submit (sales/consolidated/credit_note)
 * or myinvois-self-billed (self_billed), and lets those functions update
 * the submission state.
 *
 * Stays thin: the heavy lifting is in submit/self-billed; this file is
 * the scheduler. Limit per run keeps cron windows bounded.
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { adminClient } from '../_shared/supabase.ts'

const PER_RUN_LIMIT = 50

serve(async (req) => {
  const pre = handleOptions(req); if (pre) return pre

  const auth = req.headers.get('authorization') ?? ''
  const expected = `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}`
  if (auth !== expected) {
    return new Response(JSON.stringify({ error: 'forbidden' }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const admin = adminClient()
  const rest = (admin as unknown as { schema: (n: string) => ReturnType<typeof adminClient> }).schema('restaurant')

  const { data: due } = await rest.from('einvoice_due_for_retry')
    .select('id, branch_id, invoice_type, submission_status, attempt_count')
    .order('next_retry_at', { ascending: true, nullsFirst: true })
    .limit(PER_RUN_LIMIT)

  const rows = (due ?? []) as Array<{ id: string; invoice_type: string }>
  if (rows.length === 0) {
    return new Response(JSON.stringify({ ok: true, dispatched: 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  let dispatched = 0
  let failed = 0
  for (const r of rows) {
    const fn = r.invoice_type === 'self_billed' ? 'myinvois-self-billed' : 'myinvois-submit'
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/${fn}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ submission_id: r.id }),
      })
      if (res.ok) dispatched++; else failed++
    } catch {
      failed++
    }
  }

  return new Response(JSON.stringify({ ok: true, dispatched, failed, scanned: rows.length }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
