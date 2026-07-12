import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'

/**
 * Characterization tests for the HM dashboard data hook.
 *
 * The hook (`useHmDashboardData(userId)`) owns: the multi-phase initial load, the
 * `matches` realtime channel (with the resubscribe-on-unknown-role coalescing
 * dance), a watchdog that force-settles a stalled load, the aggregate-only
 * localStorage snapshot (writeDashCache / readDashCache hydrate), and NINE async
 * action handlers each with its own optimistic-update / rollback-on-error shape.
 *
 * This suite PINS TODAY'S BEHAVIOUR before any decomposition. It exercises, at
 * the repo/edge-fn/realtime seams (never `.from`/`.rpc` directly):
 *   - load / empty / error  (the original 4)
 *   - the realtime handleMatchChange path: UPDATE-merge, DELETE-filter,
 *     known-role INSERT reload, and the unknown-role INSERT reload+resubscribe
 *     COALESCING (two racing inserts → exactly one reload + one resubscribe)
 *   - the load watchdog (a stalled query settles the skeleton + sets the timeout
 *     error after 20s)
 *   - the dashboard-cache write (aggregate snapshot after load) and read
 *     (KPI hydration from a pre-seeded snapshot before the live queries return)
 *   - every action handler: handleUrgentSearch, handleUnlockExtra,
 *     handleRedeemExtra, viewResume, respond, doAction, revealContact,
 *     submitFeedback, respondToLinkRequest — including the optimistic status
 *     write AND the ordered rollback on error (respond's preceding-status
 *     advance, doAction's revert-to-prev).
 *
 * Supabase is mocked for the single matches channel only; the realtime handler
 * passed to `.on()` is captured (`rt.handler`) so tests can drive it directly.
 * callFunction (edge fns), confirmDialog, and the match write repos are mocked at
 * the seam; formatError + the pure lifecycle module run for real.
 */

const stableT = (k: string, def?: string) => (typeof def === 'string' ? def : k)
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: stableT }) }))

// Shared realtime capture — hoisted so the supabase mock factory can close over
// it. `handler` is the postgres_changes callback the hook registers via
// `.on(...)`; the counters observe channel churn (create / remove / subscribe).
const rt = vi.hoisted(() => ({
  handler: null as null | ((payload: unknown) => void),
  channelCount: 0,
  removeCount: 0,
  subscribeCount: 0,
}))

vi.mock('../../../lib/supabase', () => {
  const chan = {
    on: (_evt: unknown, _cfg: unknown, handler: (payload: unknown) => void) => {
      rt.handler = handler
      return chan
    },
    subscribe: () => { rt.subscribeCount++; return chan },
  }
  return {
    supabase: {
      channel: () => { rt.channelCount++; return chan },
      removeChannel: () => { rt.removeCount++ },
      auth: { getSession: async () => ({ data: { session: null } }) },
    },
  }
})

const callFunction = vi.fn()
vi.mock('../../../lib/functions', () => ({
  callFunction: (...a: unknown[]) => callFunction(...a),
}))

const confirmDialog = vi.fn()
vi.mock('../../../components/Modal', () => ({
  confirmDialog: (...a: unknown[]) => confirmDialog(...a),
}))

const hmDashboardRowByProfileId = vi.fn()
const profilePointsById = vi.fn()
const companyVerifiedById = vi.fn()
const pendingLinkRequestForHm = vi.fn()
const countActiveRolesForHm = vi.fn()
const listRolesForHmDashboard = vi.fn()
const getOnboardingDraftRoleForHm = vi.fn()
const hiredMatchCountForRoles = vi.fn()
const hmCandidatesForManager = vi.fn()
const hmCandidateCountForManager = vi.fn()
const activeMatchRoleIds = vi.fn()
const pendingColdStartRoleIds = vi.fn()
const getMatchProfilePreviews = vi.fn()
const interviewRoundsForMatches = vi.fn()
const hmInterviewProposalsForMatches = vi.fn()
const updateMatch = vi.fn()
const hmCandidateById = vi.fn()
const getTalentContact = vi.fn()

vi.mock('../../../data/repositories/matches', () => ({
  hmCandidatesForManager: (...a: unknown[]) => hmCandidatesForManager(...a),
  hmCandidateCountForManager: (...a: unknown[]) => hmCandidateCountForManager(...a),
  hmCandidateById: (...a: unknown[]) => hmCandidateById(...a),
  updateMatch: (...a: unknown[]) => updateMatch(...a),
  hiredMatchCountForRoles: (...a: unknown[]) => hiredMatchCountForRoles(...a),
  activeMatchRoleIds: (...a: unknown[]) => activeMatchRoleIds(...a),
  getMatchProfilePreviews: (...a: unknown[]) => getMatchProfilePreviews(...a),
  getTalentContact: (...a: unknown[]) => getTalentContact(...a),
}))
vi.mock('../../../data/repositories/coldStart', () => ({
  pendingColdStartRoleIds: (...a: unknown[]) => pendingColdStartRoleIds(...a),
}))
vi.mock('../../../data/repositories/interviews', () => ({
  interviewRoundsForMatches: (...a: unknown[]) => interviewRoundsForMatches(...a),
  hmInterviewProposalsForMatches: (...a: unknown[]) => hmInterviewProposalsForMatches(...a),
}))
vi.mock('../../../data/repositories/systemConfig', () => ({
  getConfigValue: vi.fn(() => Promise.resolve({ data: null })),
}))
vi.mock('../../../data/repositories/talents', () => ({
  activeTalentCount: vi.fn(() => Promise.resolve(0)),
}))
vi.mock('../../../data/repositories/roles', () => ({
  countActiveRolesForHm: (...a: unknown[]) => countActiveRolesForHm(...a),
  listRolesForHmDashboard: (...a: unknown[]) => listRolesForHmDashboard(...a),
  getOnboardingDraftRoleForHm: (...a: unknown[]) => getOnboardingDraftRoleForHm(...a),
}))
vi.mock('../../../data/repositories/companies', () => ({
  companyVerifiedById: (...a: unknown[]) => companyVerifiedById(...a),
  pendingLinkRequestForHm: (...a: unknown[]) => pendingLinkRequestForHm(...a),
}))
vi.mock('../../../data/repositories/profiles', () => ({
  profilePointsById: (...a: unknown[]) => profilePointsById(...a),
}))
vi.mock('../../../data/repositories/hiringManagers', () => ({
  hmDashboardRowByProfileId: (...a: unknown[]) => hmDashboardRowByProfileId(...a),
}))

import { useHmDashboardData } from './useHmDashboardData'

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(MemoryRouter, null, children)

// hmCandidatesForManager(...).order(...).order(...) → thenable {data,error}
const candidatesBuilder = (data: unknown, error: unknown = null) => ({
  order: () => ({ order: () => Promise.resolve({ data, error }) }),
})
const pointsBuilder = (points: number | null) => ({
  maybeSingle: () => Promise.resolve({ data: points == null ? null : { points } }),
})

const hmRow = {
  id: 'hm-1', company_id: null, reputation_score: null, feedback_volume: 0,
  phs_offer_accept_rate: null, hm_quality_factor: null, hm_cancel_rate: null,
  date_of_birth_encrypted: null,
}

// A verified-company HM with one active role — the setup shared by the action-
// handler tests, since respond/doAction/viewResume/revealContact all gate on
// `companyVerified === false`. Returns the rendered hook (candidates not yet
// settled — callers await that).
type Cand = { id: string; status: string }
function renderLoaded(opts?: { candidates?: Cand[]; points?: number; verified?: boolean }) {
  const cands = opts?.candidates ?? [{ id: 'c1', status: 'viewed' }]
  hmDashboardRowByProfileId.mockReturnValue(Promise.resolve({ data: { ...hmRow, company_id: 'co-1' } }))
  profilePointsById.mockReturnValue(pointsBuilder(opts?.points ?? 30))
  companyVerifiedById.mockReturnValue(Promise.resolve({ data: { verified: opts?.verified ?? true } }))
  countActiveRolesForHm.mockReturnValue(Promise.resolve({ count: 1 }))
  listRolesForHmDashboard.mockReturnValue(Promise.resolve({
    data: [{ id: 'role-1', title: 'Goldsmith', status: 'active', created_at: new Date().toISOString(), extra_matches_used: 0 }],
  }))
  hiredMatchCountForRoles.mockReturnValue(Promise.resolve({ count: 4 }))
  hmCandidatesForManager.mockReturnValue(candidatesBuilder(cands))
  return renderHook(() => useHmDashboardData('u1'), { wrapper })
}

beforeEach(() => {
  vi.clearAllMocks()
  try { localStorage.clear() } catch { /* jsdom */ }
  rt.handler = null; rt.channelCount = 0; rt.removeCount = 0; rt.subscribeCount = 0
  profilePointsById.mockReturnValue(pointsBuilder(30))
  pendingLinkRequestForHm.mockReturnValue(Promise.resolve({ data: null }))
  companyVerifiedById.mockReturnValue(Promise.resolve({ data: null }))
  countActiveRolesForHm.mockReturnValue(Promise.resolve({ count: 0 }))
  listRolesForHmDashboard.mockReturnValue(Promise.resolve({ data: [] }))
  getOnboardingDraftRoleForHm.mockReturnValue(Promise.resolve({ data: null }))
  hiredMatchCountForRoles.mockReturnValue(Promise.resolve({ count: 0 }))
  // Best-effort head-count: default to null so KPIs fall back to the loaded-page
  // length (overflow 0) — i.e. the pre-pagination behaviour these tests pin.
  hmCandidateCountForManager.mockReturnValue(Promise.resolve({ count: null }))
  activeMatchRoleIds.mockReturnValue(Promise.resolve({ data: [] }))
  pendingColdStartRoleIds.mockReturnValue(Promise.resolve({ data: [] }))
  getMatchProfilePreviews.mockReturnValue(Promise.resolve({ data: [] }))
  interviewRoundsForMatches.mockReturnValue(Promise.resolve({ data: [], error: null }))
  hmInterviewProposalsForMatches.mockReturnValue(Promise.resolve({ data: [], error: null }))
  // Handler-path seams — reset (clears any *Once queue) then set benign defaults.
  callFunction.mockReset(); callFunction.mockResolvedValue({})
  confirmDialog.mockReset(); confirmDialog.mockResolvedValue(true)
  updateMatch.mockReset(); updateMatch.mockResolvedValue({ error: null })
  hmCandidateById.mockReset(); hmCandidateById.mockReturnValue({ maybeSingle: () => Promise.resolve({ data: null }) })
  getTalentContact.mockReset(); getTalentContact.mockResolvedValue({ data: null, error: null })
})

describe('useHmDashboardData — load / empty / error characterization', () => {
  it('NO userId: candidates and roleCount settle to empty without querying', async () => {
    const { result } = renderHook(() => useHmDashboardData(undefined), { wrapper })
    await waitFor(() => expect(result.current.candidates).not.toBeNull())
    expect(result.current.candidates).toEqual([])
    expect(result.current.roleCount).toBe(0)
    expect(hmDashboardRowByProfileId).not.toHaveBeenCalled()
  })

  it('EMPTY (no HM row): candidates settle to [] and roleCount to 0', async () => {
    hmDashboardRowByProfileId.mockReturnValue(Promise.resolve({ data: null }))
    const { result } = renderHook(() => useHmDashboardData('u1'), { wrapper })
    await waitFor(() => expect(result.current.candidates).not.toBeNull())
    expect(result.current.candidates).toEqual([])
    expect(result.current.roleCount).toBe(0)
    // Phase-2 role queries never run when there is no HM row.
    expect(countActiveRolesForHm).not.toHaveBeenCalled()
  })

  it('LOAD: candidates populate and KPI counts derive from status buckets', async () => {
    hmDashboardRowByProfileId.mockReturnValue(Promise.resolve({ data: hmRow }))
    countActiveRolesForHm.mockReturnValue(Promise.resolve({ count: 2 }))
    listRolesForHmDashboard.mockReturnValue(Promise.resolve({
      data: [{ id: 'role-1', title: 'Goldsmith', status: 'active', created_at: new Date().toISOString(), extra_matches_used: 0 }],
    }))
    hiredMatchCountForRoles.mockReturnValue(Promise.resolve({ count: 4 }))
    // 'generated' + 'viewed' → actionNeeded (2); 'hired' is not in the active
    // set surfaced by the query, so use in-flight statuses. Two need action.
    hmCandidatesForManager.mockReturnValue(candidatesBuilder([
      { id: 'c1', status: 'generated' },
      { id: 'c2', status: 'viewed' },
      { id: 'c3', status: 'interview_scheduled' },
    ]))

    const { result } = renderHook(() => useHmDashboardData('u1'), { wrapper })

    await waitFor(() => expect(result.current.candidates).not.toBeNull())
    expect(result.current.candidates).toHaveLength(3)
    expect(result.current.candidatesCount).toBe(3)
    // generated + viewed + accepted_by_talent bucket → 2 need action.
    expect(result.current.actionNeeded).toBe(2)
    expect(result.current.roleCount).toBe(2)
    expect(result.current.roleCountForStat).toBe(2)
    // hiredAllTime is surfaced once candidates load.
    expect(result.current.hiredAllTimeForStat).toBe(4)
  })

  it('ERROR (candidates query returns {error}): err is set, candidates stay null', async () => {
    hmDashboardRowByProfileId.mockReturnValue(Promise.resolve({ data: hmRow }))
    listRolesForHmDashboard.mockReturnValue(Promise.resolve({
      data: [{ id: 'role-1', title: 'Goldsmith', status: 'active', created_at: new Date().toISOString(), extra_matches_used: 0 }],
    }))
    hmCandidatesForManager.mockReturnValue(candidatesBuilder(null, { message: 'cand-boom' }))

    const { result } = renderHook(() => useHmDashboardData('u1'), { wrapper })

    await waitFor(() => expect(result.current.err).toBe('cand-boom'))
    // A query-level error sets err but leaves candidates null (the catch only
    // settles on a thrown exception, not a returned {error}).
    expect(result.current.candidates).toBeNull()
  })
})

describe('useHmDashboardData — realtime matches channel', () => {
  // Load, then wait for the post-load subscribe so the captured handler exists.
  async function renderSubscribed(candidates: Cand[]) {
    const rendered = renderLoaded({ candidates })
    await waitFor(() => expect(rendered.result.current.candidates).not.toBeNull())
    await waitFor(() => expect(rt.handler).not.toBeNull())
    return rendered
  }

  it('UPDATE on a known role_id merges the patch into the existing candidate row', async () => {
    const { result } = await renderSubscribed([{ id: 'c1', status: 'viewed' }, { id: 'c2', status: 'viewed' }])
    await act(async () => {
      rt.handler!({ eventType: 'UPDATE', new: { id: 'c1', role_id: 'role-1', status: 'invited_by_manager' }, old: { id: 'c1', role_id: 'role-1' } })
    })
    expect(result.current.candidates?.find((c) => c.id === 'c1')?.status).toBe('invited_by_manager')
    // Sibling row untouched; no reload triggered by a same-page UPDATE.
    expect(result.current.candidates?.find((c) => c.id === 'c2')?.status).toBe('viewed')
    expect(hmCandidatesForManager.mock.calls.length).toBe(1)
  })

  it('DELETE on a known role_id removes the candidate from the list', async () => {
    const { result } = await renderSubscribed([{ id: 'c1', status: 'viewed' }, { id: 'c2', status: 'viewed' }])
    await act(async () => {
      rt.handler!({ eventType: 'DELETE', new: null, old: { id: 'c1', role_id: 'role-1' } })
    })
    expect(result.current.candidates?.map((c) => c.id)).toEqual(['c2'])
    expect(hmCandidatesForManager.mock.calls.length).toBe(1)
  })

  it('INSERT on a known role_id triggers a full reload (payload lacks the joins)', async () => {
    await renderSubscribed([{ id: 'c1', status: 'viewed' }])
    expect(hmCandidatesForManager.mock.calls.length).toBe(1)
    await act(async () => {
      rt.handler!({ eventType: 'INSERT', new: { id: 'c9', role_id: 'role-1', status: 'generated' }, old: null })
    })
    await waitFor(() => expect(hmCandidatesForManager.mock.calls.length).toBe(2))
  })

  it('INSERT on an UNKNOWN role_id coalesces two racing events into ONE reload + resubscribe', async () => {
    await renderSubscribed([{ id: 'c1', status: 'viewed' }])
    expect(hmCandidatesForManager.mock.calls.length).toBe(1)
    const channelsBefore = rt.channelCount // 1 (initial subscribe)
    await act(async () => {
      // Two unknown-role INSERTs fired synchronously — the `resubscribing` guard
      // must collapse them into a single reload, not two racing channel swaps.
      rt.handler!({ eventType: 'INSERT', new: { id: 'x1', role_id: 'role-NEW' }, old: null })
      rt.handler!({ eventType: 'INSERT', new: { id: 'x2', role_id: 'role-NEW' }, old: null })
    })
    // Exactly one extra load (coalesced), and exactly one resubscribe afterward.
    await waitFor(() => expect(hmCandidatesForManager.mock.calls.length).toBe(2))
    await waitFor(() => expect(rt.channelCount).toBe(channelsBefore + 1))
  })

  it('a change on a role_id-less payload is ignored (no reload, no mutation)', async () => {
    const { result } = await renderSubscribed([{ id: 'c1', status: 'viewed' }])
    await act(async () => {
      rt.handler!({ eventType: 'UPDATE', new: { id: 'c1' }, old: { id: 'c1' } })
    })
    expect(result.current.candidates?.find((c) => c.id === 'c1')?.status).toBe('viewed')
    expect(hmCandidatesForManager.mock.calls.length).toBe(1)
  })
})

describe('useHmDashboardData — load watchdog', () => {
  afterEach(() => { vi.useRealTimers() })

  it('a stalled Phase-1 query settles the skeleton and sets the timeout error after 20s', async () => {
    vi.useFakeTimers()
    // hiring_managers lookup never resolves → Promise.all hangs → try/catch never
    // fires → the 20s watchdog is the only thing that can settle the UI.
    hmDashboardRowByProfileId.mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useHmDashboardData('u1'), { wrapper })
    await act(async () => { await vi.advanceTimersByTimeAsync(20000) })

    expect(result.current.err).toBe('hmDash.loadingTimedOut')
    expect(result.current.candidates).toEqual([])
    expect(result.current.roleCount).toBe(0)
  })
})

describe('useHmDashboardData — dashboard cache (write / read hydrate)', () => {
  it('WRITE: a successful load persists an aggregate-only snapshot to localStorage', async () => {
    const { result } = renderLoaded({
      candidates: [{ id: 'c1', status: 'generated' }, { id: 'c2', status: 'viewed' }, { id: 'c3', status: 'interview_scheduled' }],
    })
    await waitFor(() => expect(result.current.candidates).not.toBeNull())

    const raw = localStorage.getItem('dnj.dash:hm_dashboard:u1')
    expect(raw).not.toBeNull()
    const env = JSON.parse(raw as string) as { ts: number; data: Record<string, number> }
    // roleCount(1) from countActiveRolesForHm; candidatesCount(3) falls back to
    // page length (head-count null); actionNeededCount(2)=generated+viewed;
    // hiredAllTime(4). No PDPA fields (ids/scores) — aggregates only.
    expect(env.data).toEqual({ roleCount: 1, candidatesCount: 3, actionNeededCount: 2, hiredAllTime: 4 })
  })

  it('READ: a pre-seeded snapshot hydrates the KPI values on mount before the live load resolves', () => {
    localStorage.setItem('dnj.dash:hm_dashboard:u1', JSON.stringify({
      ts: Date.now(),
      data: { roleCount: 7, candidatesCount: 5, actionNeededCount: 3, hiredAllTime: 9 },
    }))
    // Hang the load so the cached values are what the first render exposes.
    hmDashboardRowByProfileId.mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useHmDashboardData('u1'), { wrapper })

    // candidates is null (skeletoned) → KPIs read straight from the cached snapshot.
    expect(result.current.candidates).toBeNull()
    expect(result.current.roleCount).toBe(7)
    expect(result.current.candidatesCount).toBe(5)
    expect(result.current.actionNeeded).toBe(3)
    expect(result.current.hiredAllTimeForStat).toBe(9)
  })
})

describe('useHmDashboardData — action handlers (optimistic + rollback)', () => {
  it('respond(invite): happy path advances status, calls updateMatch + award-points, shows green', async () => {
    const { result } = renderLoaded({ candidates: [{ id: 'c1', status: 'viewed' }] })
    await waitFor(() => expect(result.current.candidates).not.toBeNull())

    await act(async () => { await result.current.respond('c1', 'invited_by_manager') })

    expect(result.current.candidates?.find((c) => c.id === 'c1')?.status).toBe('invited_by_manager')
    // 'viewed' needs no preceding advance, so exactly one updateMatch (the final).
    expect(updateMatch).toHaveBeenCalledTimes(1)
    expect(updateMatch).toHaveBeenCalledWith('c1', expect.objectContaining({ status: 'invited_by_manager' }))
    expect(callFunction).toHaveBeenCalledWith('award-points', { event_type: 'accept_interview', match_id: 'c1' })
    expect(result.current.respondMsg?.tone).toBe('green')
    expect(result.current.actionBusy).toBeNull()
  })

  it('respond(invite) from generated: advances through viewed FIRST, then rolls back to generated when that write fails', async () => {
    const { result } = renderLoaded({ candidates: [{ id: 'c1', status: 'generated' }] })
    await waitFor(() => expect(result.current.candidates).not.toBeNull())
    // First updateMatch (the 'viewed' preceding step) fails.
    updateMatch.mockResolvedValueOnce({ error: { message: 'view-boom' } })

    await act(async () => { await result.current.respond('c1', 'invited_by_manager') })

    // Preceding-status write was attempted first, with 'viewed'...
    expect(updateMatch).toHaveBeenCalledTimes(1)
    expect(updateMatch).toHaveBeenCalledWith('c1', { status: 'viewed' })
    // ...it failed, so the optimistic 'invited_by_manager' is rolled back to the
    // captured prevStatus and the final write is never issued.
    expect(result.current.err).toBe('view-boom')
    expect(result.current.candidates?.find((c) => c.id === 'c1')?.status).toBe('generated')
    expect(callFunction).not.toHaveBeenCalledWith('award-points', expect.anything())
    expect(result.current.actionBusy).toBeNull()
  })

  it('respond(invite): gated when company unverified — sets err, no optimistic mutation', async () => {
    const { result } = renderLoaded({ candidates: [{ id: 'c1', status: 'viewed' }], verified: false })
    await waitFor(() => expect(result.current.candidates).not.toBeNull())

    await act(async () => { await result.current.respond('c1', 'invited_by_manager') })

    expect(result.current.err).toBe('hmDash.askHrUpload')
    expect(result.current.respondMsg?.tone).toBe('red')
    expect(result.current.candidates?.find((c) => c.id === 'c1')?.status).toBe('viewed')
    expect(updateMatch).not.toHaveBeenCalled()
  })

  it('doAction(make_offer): optimistic status flips to offer_made and the edge fn is called', async () => {
    const { result } = renderLoaded({ candidates: [{ id: 'c1', status: 'invited_by_manager' }] })
    await waitFor(() => expect(result.current.candidates).not.toBeNull())

    await act(async () => { await result.current.doAction('c1', 'make_offer') })

    expect(result.current.candidates?.find((c) => c.id === 'c1')?.status).toBe('offer_made')
    expect(callFunction).toHaveBeenCalledWith('interview-action', { action: 'make_offer', match_id: 'c1' })
    expect(result.current.actionBusy).toBeNull()
  })

  it('doAction(make_offer): rolls the optimistic status back to prev when the edge fn throws', async () => {
    const { result } = renderLoaded({ candidates: [{ id: 'c1', status: 'invited_by_manager' }] })
    await waitFor(() => expect(result.current.candidates).not.toBeNull())
    callFunction.mockRejectedValueOnce(new Error('offer-boom'))

    await act(async () => { await result.current.doAction('c1', 'make_offer') })

    expect(result.current.candidates?.find((c) => c.id === 'c1')?.status).toBe('invited_by_manager')
    expect(result.current.err).toBe('offer-boom')
    expect(result.current.actionBusy).toBeNull()
  })

  it('handleUrgentSearch: confirmed search debits points and shows a green ready message', async () => {
    callFunction.mockResolvedValue({
      success: true, cost: 9, balance_after: 21,
      result: { kind: 'match', match_id: 'm1', talent_id: 't1', compatibility_score: 88 },
    })
    const { result } = renderLoaded({ candidates: [{ id: 'c1', status: 'viewed' }], points: 30 })
    await waitFor(() => expect(result.current.candidates).not.toBeNull())

    await act(async () => { await result.current.handleUrgentSearch('role-1') })

    expect(confirmDialog).toHaveBeenCalledTimes(1)
    expect(callFunction).toHaveBeenCalledWith('urgent-priority-search', { request_type: 'find_worker', role_id: 'role-1' })
    expect(result.current.pointsBalance).toBe(21)
    expect(result.current.urgentMsg?.tone).toBe('green')
    expect(result.current.urgentBusy).toBe(false)
    expect(result.current.urgentRoleId).toBeNull()
  })

  it('handleUrgentSearch: insufficient balance short-circuits before confirm/charge', async () => {
    const { result } = renderLoaded({ candidates: [{ id: 'c1', status: 'viewed' }], points: 5 })
    await waitFor(() => expect(result.current.candidates).not.toBeNull())

    await act(async () => { await result.current.handleUrgentSearch('role-1') })

    expect(result.current.urgentMsg?.tone).toBe('amber')
    expect(confirmDialog).not.toHaveBeenCalled()
    expect(callFunction).not.toHaveBeenCalledWith('urgent-priority-search', expect.anything())
  })

  it('handleUnlockExtra: a response without a paymentUrl shows a red message and clears the spinner', async () => {
    callFunction.mockResolvedValue({}) // no paymentUrl
    const { result } = renderLoaded({ candidates: [{ id: 'c1', status: 'viewed' }] })
    await waitFor(() => expect(result.current.candidates).not.toBeNull())

    await act(async () => { await result.current.handleUnlockExtra('role-1') })

    expect(callFunction).toHaveBeenCalledWith('unlock-extra-match', { match_type: 'hm_extra', role_id: 'role-1' })
    expect(result.current.unlockMsg).toEqual({ roleId: 'role-1', tone: 'red', text: 'hmDash.paymentNoUrl' })
    expect(result.current.unlockingRoleId).toBeNull()
  })

  it('handleRedeemExtra: happy path debits points, bumps the role extraUsed, shows green', async () => {
    callFunction.mockResolvedValue({ message: 'ok', cost: 21 })
    const { result } = renderLoaded({ candidates: [{ id: 'c1', status: 'viewed' }], points: 30 })
    await waitFor(() => expect(result.current.candidates).not.toBeNull())
    // The active role surfaces in roleExtras once loaded.
    await waitFor(() => expect(result.current.roleExtras.find((r) => r.id === 'role-1')).toBeTruthy())

    await act(async () => { await result.current.handleRedeemExtra('role-1', 'Goldsmith') })

    expect(callFunction).toHaveBeenCalledWith('redeem-points', { target_type: 'role', role_id: 'role-1' })
    expect(result.current.unlockMsg?.tone).toBe('green')
    expect(result.current.pointsBalance).toBe(9) // 30 - 21
    expect(result.current.roleExtras.find((r) => r.id === 'role-1')?.extraUsed).toBe(1)
    expect(result.current.redeemingRoleId).toBeNull()
  })

  it('viewResume: a response without a signed_url surfaces the error and clears actionBusy', async () => {
    callFunction.mockResolvedValue({ message: 'resume-nope' })
    const { result } = renderLoaded({ candidates: [{ id: 'c1', status: 'viewed' }] })
    await waitFor(() => expect(result.current.candidates).not.toBeNull())

    await act(async () => { await result.current.viewResume('c1') })

    expect(callFunction).toHaveBeenCalledWith('get-resume-url', { match_id: 'c1' })
    expect(result.current.err).toBe('resume-nope')
    expect(result.current.actionBusy).toBeNull()
  })

  it('revealContact: stores the fetched contact row keyed by match id', async () => {
    getTalentContact.mockResolvedValue({ data: { full_name: 'Ada', email: 'ada@x.co', phone: '0123' }, error: null })
    const { result } = renderLoaded({ candidates: [{ id: 'c1', status: 'viewed' }] })
    await waitFor(() => expect(result.current.candidates).not.toBeNull())

    await act(async () => { await result.current.revealContact('c1') })

    expect(getTalentContact).toHaveBeenCalledWith('c1')
    expect(result.current.contactByMatch['c1']).toEqual({ full_name: 'Ada', email: 'ada@x.co', phone: '0123' })
  })

  it('revealContact: a query error sets err and leaves contactByMatch untouched', async () => {
    getTalentContact.mockResolvedValue({ data: null, error: { message: 'contact-boom' } })
    const { result } = renderLoaded({ candidates: [{ id: 'c1', status: 'viewed' }] })
    await waitFor(() => expect(result.current.candidates).not.toBeNull())

    await act(async () => { await result.current.revealContact('c1') })

    expect(result.current.err).toBe('contact-boom')
    expect(result.current.contactByMatch['c1']).toBeUndefined()
  })

  it('submitFeedback: posts the rating, marks saved, records points and credits the balance', async () => {
    callFunction.mockResolvedValue({ success: true, points_awarded: 10 })
    const { result } = renderLoaded({ candidates: [{ id: 'c1', status: 'interview_completed' }], points: 30 })
    await waitFor(() => expect(result.current.candidates).not.toBeNull())
    act(() => {
      result.current.setFeedbackState({
        c1: { rating: 5, hired: false, notes: '', outcome: '', freeText: '', saving: false, saved: false },
      })
    })

    await act(async () => { await result.current.submitFeedback('c1') })

    expect(callFunction).toHaveBeenCalledWith('submit-feedback', expect.objectContaining({
      match_id: 'c1', stage: 'interview', from_party: 'hm', rating: 5,
    }))
    expect(result.current.feedbackState['c1'].saved).toBe(true)
    expect(result.current.feedbackState['c1'].pointsAwarded).toBe(10)
    expect(result.current.feedbackState['c1'].saving).toBe(false)
    expect(result.current.pointsBalance).toBe(40) // 30 + 10
  })

  it('submitFeedback: a 0-rating entry is a no-op (no edge call)', async () => {
    const { result } = renderLoaded({ candidates: [{ id: 'c1', status: 'interview_completed' }] })
    await waitFor(() => expect(result.current.candidates).not.toBeNull())
    act(() => {
      result.current.setFeedbackState({
        c1: { rating: 0, hired: false, notes: '', outcome: '', freeText: '', saving: false, saved: false },
      })
    })

    await act(async () => { await result.current.submitFeedback('c1') })

    expect(callFunction).not.toHaveBeenCalledWith('submit-feedback', expect.anything())
  })

  it('respondToLinkRequest(decline): calls link-hm, clears the pending request and the busy flag', async () => {
    // company_id null + a pending link request → linkRequest is populated by load().
    hmDashboardRowByProfileId.mockReturnValue(Promise.resolve({ data: hmRow }))
    pendingLinkRequestForHm.mockReturnValue(Promise.resolve({ data: { id: 'lr-1', companies: { name: 'ACME' } } }))
    listRolesForHmDashboard.mockReturnValue(Promise.resolve({ data: [] }))
    hmCandidatesForManager.mockReturnValue(candidatesBuilder([]))

    const { result } = renderHook(() => useHmDashboardData('u1'), { wrapper })
    await waitFor(() => expect(result.current.linkRequest).toEqual({ id: 'lr-1', companyName: 'ACME' }))

    await act(async () => { await result.current.respondToLinkRequest('decline') })

    expect(callFunction).toHaveBeenCalledWith('link-hm', { request_id: 'lr-1', action: 'decline' })
    expect(result.current.linkRequest).toBeNull()
    expect(result.current.linkBusy).toBe(false)
  })
})
