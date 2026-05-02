/**
 * interview-action
 *
 * Atomic HM-side (and talent-side) operations for the post-match interview flow.
 *
 * Authorization: authenticated users only.
 *   - HM actions: schedule_round, complete_round, complete_interviews, make_offer, mark_hired, cancel_match
 *   - Talent actions: accept_offer, decline_offer
 *   - Admin: all of the above
 *
 * Body: { action, match_id, ...action-specific fields }
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { handleOptions } from '../_shared/cors.ts'
import { authenticate, json } from '../_shared/auth.ts'
import { adminClient } from '../_shared/supabase.ts'

const SITE = Deno.env.get('SITE_URL') ?? 'https://diamondandjeweler.com'
const SELF_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

type Action =
  | 'schedule_round'
  | 'complete_round'
  | 'complete_interviews'
  | 'make_offer'
  | 'mark_hired'
  | 'cancel_match'
  | 'accept_offer'
  | 'decline_offer'

interface Body {
  action: Action
  match_id: string
  // schedule_round
  scheduled_at?: string
  // complete_round
  round_id?: string
  hm_notes?: string
}

serve(async (req) => {
  const pre = handleOptions(req); if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const auth = await authenticate(req, {
    requiredRoles: ['hiring_manager', 'hr_admin', 'talent', 'admin'],
  })
  if (auth instanceof Response) return auth

  const body = (await req.json().catch(() => ({}))) as Partial<Body>
  const { action, match_id } = body
  if (!action || !match_id) return json({ error: 'Missing action or match_id' }, 400)

  const db = adminClient()

  // ── load match with role + talent + company context ──────────────────────
  const { data: match, error: mErr } = await db
    .from('matches')
    .select(`
      id, status, talent_id, role_id,
      roles!inner(
        id, title,
        hiring_managers!inner(
          id, profile_id,
          companies!inner(name)
        )
      ),
      talents!inner(id, profile_id)
    `)
    .eq('id', match_id)
    .maybeSingle()

  if (mErr || !match) return json({ error: 'Match not found' }, 404)

  const hmProfileId: string = (match.roles as any).hiring_managers.profile_id
  const talentProfileId: string = (match.talents as any).profile_id
  const roleTitle: string = (match.roles as any).title
  const companyName: string = (match.roles as any).hiring_managers.companies.name
  const isHM = auth.userId === hmProfileId
  const isTalent = auth.userId === talentProfileId
  const isAdmin = auth.role === 'admin'

  // ── route action ──────────────────────────────────────────────────────────
  switch (action) {
    // ── HM: schedule a new interview round ───────────────────────────────
    case 'schedule_round': {
      if (!isHM && !isAdmin) return json({ error: 'Only the hiring manager can schedule rounds' }, 403)
      if (!body.scheduled_at) return json({ error: 'scheduled_at required' }, 400)

      const allowedStatuses = ['invited_by_manager', 'interview_scheduled']
      if (!allowedStatuses.includes(match.status)) {
        return json({ error: `Cannot schedule round from status: ${match.status}` }, 422)
      }

      // Count existing rounds to get round_number
      const { count } = await db
        .from('interview_rounds')
        .select('id', { count: 'exact', head: true })
        .eq('match_id', match_id)

      const roundNumber = (count ?? 0) + 1
      const token = crypto.randomUUID()
      const meetUrl = `https://meet.jit.si/DNJ-${token}`

      const { data: round, error: rErr } = await db
        .from('interview_rounds')
        .insert({
          match_id,
          round_number: roundNumber,
          scheduled_at: body.scheduled_at,
          interview_url: meetUrl,
          interview_token: token,
          status: 'scheduled',
        })
        .select('id, round_number, scheduled_at, interview_url, interview_token')
        .single()

      if (rErr) return json({ error: rErr.message }, 500)

      // Transition match status to interview_scheduled if needed
      if (match.status !== 'interview_scheduled') {
        await db
          .from('matches')
          .update({ status: 'interview_scheduled' })
          .eq('id', match_id)
      }

      // Notify talent
      await callNotify(talentProfileId, 'interview_round_scheduled', {
        round_number: roundNumber,
        scheduled_at: body.scheduled_at,
        interview_url: meetUrl,
        role_title: roleTitle,
        company_name: companyName,
      })

      return json({ ok: true, round })
    }

    // ── HM: mark one round completed ─────────────────────────────────────
    case 'complete_round': {
      if (!isHM && !isAdmin) return json({ error: 'Only the hiring manager can complete rounds' }, 403)
      if (!body.round_id) return json({ error: 'round_id required' }, 400)

      const update: Record<string, unknown> = { status: 'completed' }
      if (body.hm_notes) update.hm_notes = body.hm_notes

      const { error: rErr } = await db
        .from('interview_rounds')
        .update(update)
        .eq('id', body.round_id)
        .eq('match_id', match_id)

      if (rErr) return json({ error: rErr.message }, 500)
      return json({ ok: true })
    }

    // ── HM: mark all interviews done → interview_completed ───────────────
    case 'complete_interviews': {
      if (!isHM && !isAdmin) return json({ error: 'Only the hiring manager can complete interviews' }, 403)
      if (match.status !== 'interview_scheduled') {
        return json({ error: `Cannot complete interviews from status: ${match.status}` }, 422)
      }

      await db
        .from('matches')
        .update({ status: 'interview_completed', interview_completed_at: new Date().toISOString() })
        .eq('id', match_id)

      return json({ ok: true })
    }

    // ── HM: make an offer → offer_made ───────────────────────────────────
    case 'make_offer': {
      if (!isHM && !isAdmin) return json({ error: 'Only the hiring manager can make an offer' }, 403)
      if (!['interview_completed'].includes(match.status)) {
        return json({ error: `Cannot make offer from status: ${match.status}` }, 422)
      }

      await db
        .from('matches')
        .update({ status: 'offer_made', offer_made_at: new Date().toISOString() })
        .eq('id', match_id)

      await callNotify(talentProfileId, 'offer_made_notify', {
        role_title: roleTitle,
        company_name: companyName,
      })

      return json({ ok: true })
    }

    // ── HM / Admin: confirm hired ─────────────────────────────────────────
    case 'mark_hired': {
      if (!isHM && !isAdmin) return json({ error: 'Only the hiring manager can mark as hired' }, 403)
      if (!['offer_made', 'interview_completed'].includes(match.status)) {
        return json({ error: `Cannot mark hired from status: ${match.status}` }, 422)
      }

      await db
        .from('matches')
        .update({ status: 'hired' })
        .eq('id', match_id)

      return json({ ok: true })
    }

    // ── HM or Talent: cancel match ───────────────────────────────────────
    case 'cancel_match': {
      if (!isHM && !isTalent && !isAdmin) {
        return json({ error: 'Not authorized to cancel this match' }, 403)
      }
      const cancellableStatuses = [
        'invited_by_manager', 'hr_scheduling',
        'interview_scheduled', 'interview_completed', 'offer_made',
      ]
      if (!cancellableStatuses.includes(match.status)) {
        return json({ error: `Cannot cancel from status: ${match.status}` }, 422)
      }

      await db
        .from('matches')
        .update({ status: 'cancelled' })
        .eq('id', match_id)

      // Notify the other party
      const notifyUserId = isHM ? talentProfileId : hmProfileId
      await callNotify(notifyUserId, 'interview_cancelled', {
        role_title: roleTitle,
        company_name: companyName,
      })

      // Consolation: when HM cancels after at least one interview round,
      // credit the talent +5 (interviewer_rejects). Idempotent per match.
      if (isHM && ['interview_scheduled', 'interview_completed', 'offer_made'].includes(match.status)) {
        const { data: cfg } = await db.from('system_config').select('value')
          .eq('key', 'earn_interviewer_rejects').maybeSingle()
        const pts = typeof cfg?.value === 'number' ? cfg.value : 5
        if (pts > 0) {
          await db.rpc('award_points', {
            p_user_id: talentProfileId,
            p_delta: pts,
            p_reason: 'interviewer_rejects',
            p_reference: { match_id },
            p_idempotency_key: `interviewer_rejects:${match_id}`,
          })
        }
      }

      return json({ ok: true })
    }

    // ── Talent: accept offer → hired ─────────────────────────────────────
    case 'accept_offer': {
      if (!isTalent && !isAdmin) return json({ error: 'Only the talent can accept an offer' }, 403)
      if (match.status !== 'offer_made') {
        return json({ error: `No active offer to accept (status: ${match.status})` }, 422)
      }

      await db
        .from('matches')
        .update({ status: 'hired' })
        .eq('id', match_id)

      // Get talent's name for the notification
      const { data: talentProfile } = await db
        .from('profiles')
        .select('full_name')
        .eq('id', talentProfileId)
        .maybeSingle()

      await callNotify(hmProfileId, 'offer_accepted', {
        talent_name: talentProfile?.full_name ?? 'The candidate',
        role_title: roleTitle,
      })

      return json({ ok: true })
    }

    // ── Talent: decline offer → cancelled ────────────────────────────────
    case 'decline_offer': {
      if (!isTalent && !isAdmin) return json({ error: 'Only the talent can decline an offer' }, 403)
      if (match.status !== 'offer_made') {
        return json({ error: `No active offer to decline (status: ${match.status})` }, 422)
      }

      await db
        .from('matches')
        .update({ status: 'cancelled' })
        .eq('id', match_id)

      const { data: talentProfile } = await db
        .from('profiles')
        .select('full_name')
        .eq('id', talentProfileId)
        .maybeSingle()

      await callNotify(hmProfileId, 'offer_declined', {
        talent_name: talentProfile?.full_name ?? 'The candidate',
        role_title: roleTitle,
      })

      return json({ ok: true })
    }

    default:
      return json({ error: `Unknown action: ${action}` }, 400)
  }
})

async function callNotify(
  userId: string,
  type: string,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    await fetch(`${SELF_URL}/functions/v1/notify`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ user_id: userId, type, data }),
    })
  } catch (e) {
    console.error('callNotify failed', e)
  }
}
