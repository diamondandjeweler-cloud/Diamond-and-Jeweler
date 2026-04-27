/**
 * match-expire
 *
 * Called by pg_cron every 6 hours. Flips stale matches to 'expired',
 * logs them to match_history, and re-triggers match-generate for each affected
 * role (which enforces its own refresh_limit_per_role — so no infinite loop).
 *
 * Authorization: admin or service-role only (cron uses service-role key).
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { handleOptions } from '../_shared/cors.ts'
import { authenticate, json } from '../_shared/auth.ts'
import { adminClient } from '../_shared/supabase.ts'

const EXPIRABLE = [
  'generated','viewed','accepted_by_talent','invited_by_manager','hr_scheduling',
]

serve(async (req) => {
  const pre = handleOptions(req); if (pre) return pre

  const auth = await authenticate(req, { requiredRoles: ['admin'] })
  if (auth instanceof Response) return auth

  const db = adminClient()
  const nowIso = new Date().toISOString()
  const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const notifyUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/notify`

  // ---------- Pass A: 24 h expiry warnings ----------
  // Cron runs every 6 h, so we pick up any match expiring within the next
  // 23–29 h that hasn't been warned yet (overlap guards against timing drift).
  const warnFromIso = new Date(Date.now() + 23 * 3600 * 1000).toISOString()
  const warnToIso   = new Date(Date.now() + 29 * 3600 * 1000).toISOString()
  const { data: warnable } = await db.from('matches')
    .select('id, role_id, talent_id, status')
    .in('status', EXPIRABLE)
    .is('expiry_warning_sent_at', null)
    .gte('expires_at', warnFromIso)
    .lte('expires_at', warnToIso)

  let warned = 0
  for (const m of warnable ?? []) {
    const recipients: string[] = []
    const { data: t } = await db.from('talents')
      .select('profile_id').eq('id', m.talent_id).maybeSingle()
    if (t?.profile_id) recipients.push(t.profile_id)

    const { data: r } = await db.from('roles')
      .select('hiring_manager_id').eq('id', m.role_id).maybeSingle()
    if (r?.hiring_manager_id) {
      const { data: hm } = await db.from('hiring_managers')
        .select('profile_id').eq('id', r.hiring_manager_id).maybeSingle()
      if (hm?.profile_id) recipients.push(hm.profile_id)
    }

    for (const uid of recipients) {
      fetch(notifyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${svcKey}` },
        body: JSON.stringify({
          user_id: uid,
          type: 'match_expiring',
          data: { match_id: m.id },
        }),
      }).catch(() => { /* best effort */ })
    }
    await db.from('matches').update({ expiry_warning_sent_at: new Date().toISOString() }).eq('id', m.id)
    warned++
  }

  // ---------- Pass A2: 48h no-action reminders (v4 §14) ----------
  // Scan every 6h for matches a user viewed/accepted 48–54h ago and never
  // acted on further. Window is [48h, 54h] so consecutive cron runs don't
  // double-fire; the reminder_48h_sent_at column also guards against
  // re-sending if the window is widened later.
  const reminderCutoffOldIso = new Date(Date.now() - 54 * 3600 * 1000).toISOString()
  const reminderCutoffNewIso = new Date(Date.now() - 48 * 3600 * 1000).toISOString()

  async function sendNoActionReminder(matchId: string, userId: string, audience: 'talent' | 'hiring_manager') {
    fetch(notifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${svcKey}` },
      body: JSON.stringify({
        user_id: userId,
        type: 'match_no_action_48h',
        data: { match_id: matchId, audience },
      }),
    }).catch(() => { /* best effort */ })
    await db.from('matches').update({ reminder_48h_sent_at: new Date().toISOString() }).eq('id', matchId)
  }

  // Talent side: status='viewed' and viewed_at 48–54h ago.
  const { data: talentNudge } = await db.from('matches')
    .select('id, talent_id')
    .eq('status', 'viewed')
    .is('reminder_48h_sent_at', null)
    .gte('viewed_at', reminderCutoffOldIso)
    .lt('viewed_at', reminderCutoffNewIso)
  let reminded = 0
  for (const m of talentNudge ?? []) {
    const { data: t } = await db.from('talents')
      .select('profile_id').eq('id', m.talent_id).maybeSingle()
    if (t?.profile_id) {
      await sendNoActionReminder(m.id, t.profile_id, 'talent')
      reminded++
    }
  }

  // HM side: status='accepted_by_talent' and accepted_at 48–54h ago.
  const { data: hmNudge } = await db.from('matches')
    .select('id, role_id')
    .eq('status', 'accepted_by_talent')
    .is('reminder_48h_sent_at', null)
    .gte('accepted_at', reminderCutoffOldIso)
    .lt('accepted_at', reminderCutoffNewIso)
  for (const m of hmNudge ?? []) {
    const { data: r } = await db.from('roles')
      .select('hiring_manager_id').eq('id', m.role_id).maybeSingle()
    if (!r?.hiring_manager_id) continue
    const { data: hm } = await db.from('hiring_managers')
      .select('profile_id').eq('id', r.hiring_manager_id).maybeSingle()
    if (hm?.profile_id) {
      await sendNoActionReminder(m.id, hm.profile_id, 'hiring_manager')
      reminded++
    }
  }

  // ---------- Pass B: expire anything past its deadline ----------
  const { data: expired, error: expErr } = await db.from('matches')
    .update({ status: 'expired', updated_at: nowIso })
    .in('status', EXPIRABLE)
    .lt('expires_at', nowIso)
    .select('id, role_id, talent_id')
  if (expErr) return json({ error: expErr.message }, 500)

  const expiredCount = expired?.length ?? 0
  if (expiredCount === 0) return json({ expired: 0, regenerated: 0, warned, reminded })

  await db.from('match_history').insert(
    (expired ?? []).map((m) => ({
      role_id: m.role_id,
      talent_id: m.talent_id,
      action: 'expired_auto',
      previous_match_id: m.id,
    })),
  )

  // ---------- v4 §16: ghost-score auto-increment ----------
  // For each talent or HM whose match just expired with no acceptance,
  // count their total "ghosted" matches (status=expired + accepted_at NULL)
  // and bump profiles.ghost_score to floor(ghosted/3), capped at 10. We use a
  // read-modify-write rather than a raw UPDATE so we only bump upward.
  const uniqueTalentIds = [...new Set((expired ?? []).map((m) => m.talent_id).filter(Boolean))]
  const uniqueRoleIds   = [...new Set((expired ?? []).map((m) => m.role_id).filter(Boolean))]
  const ghostThreshold = 3

  async function bumpProfileGhostScore(profileId: string, ghostedCount: number) {
    const target = Math.min(10, Math.floor(ghostedCount / ghostThreshold))
    if (target <= 0) return
    const { data: cur } = await db.from('profiles')
      .select('ghost_score').eq('id', profileId).maybeSingle()
    if ((cur?.ghost_score ?? 0) < target) {
      await db.from('profiles').update({ ghost_score: target }).eq('id', profileId)
    }
  }

  for (const talentId of uniqueTalentIds) {
    if (!talentId) continue
    const { count: ghosted } = await db.from('matches')
      .select('id', { count: 'exact', head: true })
      .eq('talent_id', talentId).eq('status', 'expired').is('accepted_at', null)
    if ((ghosted ?? 0) < ghostThreshold) continue
    const { data: t } = await db.from('talents')
      .select('profile_id').eq('id', talentId).maybeSingle()
    if (t?.profile_id) await bumpProfileGhostScore(t.profile_id, ghosted ?? 0)
  }

  for (const roleId of uniqueRoleIds) {
    if (!roleId) continue
    // Ghost an HM when 3+ of their matches across any role expired without an invite.
    const { data: hmLink } = await db.from('roles')
      .select('hiring_manager_id').eq('id', roleId).maybeSingle()
    const hmId = hmLink?.hiring_manager_id
    if (!hmId) continue
    const { data: hm } = await db.from('hiring_managers')
      .select('profile_id').eq('id', hmId).maybeSingle()
    if (!hm?.profile_id) continue
    const { count: hmGhosted } = await db.from('matches')
      .select('id, roles!inner(hiring_manager_id)', { count: 'exact', head: true })
      .eq('status', 'expired').is('invited_at', null)
      .eq('roles.hiring_manager_id', hmId)
    if ((hmGhosted ?? 0) < ghostThreshold) continue
    await bumpProfileGhostScore(hm.profile_id, hmGhosted ?? 0)
  }

  // Regenerate per affected role (match-generate respects refresh_limit).
  const generateUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/match-generate`
  const roleIds = [...new Set((expired ?? []).map((m) => m.role_id).filter(Boolean))]

  let regenerated = 0
  for (const roleId of roleIds) {
    const { data: role } = await db.from('roles')
      .select('status').eq('id', roleId!).maybeSingle()
    if (!role || role.status !== 'active') continue

    try {
      const res = await fetch(generateUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${svcKey}` },
        body: JSON.stringify({ role_id: roleId }),
      })
      if (res.ok) {
        const payload = await res.json().catch(() => ({ matches_added: 0 }))
        regenerated += payload.matches_added ?? 0
      }
    } catch (e) {
      console.error('regenerate failed for', roleId, e)
    }
  }

  return json({ expired: expiredCount, regenerated, warned, reminded })
})
