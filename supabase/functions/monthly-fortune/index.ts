/**
 * monthly-fortune
 *
 * Computes a yearly-fortune row for every active talent + HM, then nudges
 * those flagged as having a "favourable month" with an in-app + (opt-in)
 * WhatsApp notification.
 *
 * Triggered by pg_cron (0 1 1 * * UTC = 09:00 1st-of-month MYT).
 * Service-role only.
 *
 * Privacy posture: same as bazi-score — the proprietary calc lives in the
 * private bazi-score Edge Function. We pass DOBs server-to-server and never
 * persist intermediate factors. Only the final score lands in
 * life_chart_yearly_fortune.
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { adminClient } from '../_shared/supabase.ts'

serve(async (req) => {
  const pre = handleOptions(req); if (pre) return pre
  // Service role only. We compare the full bearer to allow the cron job to
  // call us with the same key used elsewhere.
  const auth = req.headers.get('authorization') ?? ''
  const expected = `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}`
  if (auth !== expected) {
    return new Response(JSON.stringify({ error: 'forbidden' }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const db = adminClient()
  const year = new Date().getUTCFullYear()

  // Pull every profile that has a DOB encrypted (talents + HMs).
  const [{ data: talents }, { data: hms }] = await Promise.all([
    db.from('talents').select('profile_id, date_of_birth_encrypted').not('date_of_birth_encrypted', 'is', null),
    db.from('hiring_managers').select('profile_id, date_of_birth_encrypted').not('date_of_birth_encrypted', 'is', null),
  ])
  const subjects: Array<{ profile_id: string; encrypted: string }> = [
    ...(talents ?? []).map((t) => ({ profile_id: t.profile_id, encrypted: t.date_of_birth_encrypted })),
    ...(hms ?? []).map((h) => ({ profile_id: h.profile_id, encrypted: h.date_of_birth_encrypted })),
  ]

  let computed = 0
  let notified = 0

  for (const s of subjects) {
    try {
      const { data: dob } = await db.rpc('decrypt_dob', { encrypted: s.encrypted })
      if (typeof dob !== 'string') continue

      // "Yearly self-compatibility": pair DOB with itself across the year boundary.
      // Real proprietary engine should override this — set BAZI_REMOTE_URL.
      const baziUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/bazi-score`
      const baziKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const r = await fetch(baziUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${baziKey}` },
        body: JSON.stringify({ dob1: dob, dob2: `${year}-${String(((new Date()).getUTCMonth() + 1)).padStart(2, '0')}-01` }),
      })
      if (!r.ok) continue
      const j = await r.json() as { score: number }

      // Upsert yearly fortune row
      await db.from('life_chart_yearly_fortune').upsert({
        profile_id: s.profile_id,
        fortune_year: year,
        fortune_score: j.score,
        fortune_summary: j.score >= 70
          ? 'Favourable window — good month to act on opportunities.'
          : j.score >= 40
            ? 'Steady — keep current direction; small adjustments only.'
            : 'Cautious month — let big decisions wait if you can.',
        computed_at: new Date().toISOString(),
      })
      computed++

      // Nudge profiles with favourable months
      if (j.score >= 70) {
        await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/notify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${baziKey}` },
          body: JSON.stringify({
            user_id: s.profile_id,
            type: 'match_ready',
            data: { reason: 'monthly_fortune_favourable', month: new Date().getUTCMonth() + 1 },
          }),
        }).catch(() => { /* best effort */ })
        notified++
      }
    } catch {
      // skip individual failures
    }
  }

  return new Response(JSON.stringify({ ok: true, year, computed, notified }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
