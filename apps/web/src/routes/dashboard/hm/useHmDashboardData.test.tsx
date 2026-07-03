import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'

/**
 * Characterization tests for the HM dashboard data hook after the Phase 3
 * primitive extraction (it now composes useMountedRef / useReloadTimer /
 * useDashCacheSnapshot). The HM hook takes `userId` as a param (no useSession),
 * which makes its load path the easiest to drive deterministically.
 *
 * These lock in: the no-userId early-out, the "no HM row" empty branch, the
 * full happy-path candidate load with derived KPI counts, and the query-level
 * error branch. Repos are mocked at the seam; supabase is mocked for the single
 * matches channel (.channel().on().subscribe() + removeChannel) only — never
 * .from/.rpc. The realtime handleMatchChange resubscribe logic and the
 * optimistic action reverts are NOT exercised (see coverageGaps).
 */

const stableT = (k: string, def?: string) => (typeof def === 'string' ? def : k)
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: stableT }) }))

vi.mock('../../../lib/supabase', () => {
  const chan = { on: () => chan, subscribe: () => chan }
  return {
    supabase: {
      channel: () => chan,
      removeChannel: () => {},
      auth: { getSession: async () => ({ data: { session: null } }) },
    },
  }
})

const hmDashboardRowByProfileId = vi.fn()
const profilePointsById = vi.fn()
const companyVerifiedById = vi.fn()
const pendingLinkRequestForHm = vi.fn()
const countActiveRolesForHm = vi.fn()
const listRolesForHmDashboard = vi.fn()
const getOnboardingDraftRoleForHm = vi.fn()
const hiredMatchCountForRoles = vi.fn()
const hmCandidatesForManager = vi.fn()
const activeMatchRoleIds = vi.fn()
const pendingColdStartRoleIds = vi.fn()
const getMatchProfilePreviews = vi.fn()
const interviewRoundsForMatches = vi.fn()
const hmInterviewProposalsForMatches = vi.fn()

vi.mock('../../../data/repositories/matches', () => ({
  hmCandidatesForManager: (...a: unknown[]) => hmCandidatesForManager(...a),
  hmCandidateById: vi.fn(),
  updateMatch: vi.fn(),
  hiredMatchCountForRoles: (...a: unknown[]) => hiredMatchCountForRoles(...a),
  activeMatchRoleIds: (...a: unknown[]) => activeMatchRoleIds(...a),
  getMatchProfilePreviews: (...a: unknown[]) => getMatchProfilePreviews(...a),
  getTalentContact: vi.fn(),
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

beforeEach(() => {
  vi.clearAllMocks()
  try { localStorage.clear() } catch { /* jsdom */ }
  profilePointsById.mockReturnValue(pointsBuilder(30))
  pendingLinkRequestForHm.mockReturnValue(Promise.resolve({ data: null }))
  companyVerifiedById.mockReturnValue(Promise.resolve({ data: null }))
  countActiveRolesForHm.mockReturnValue(Promise.resolve({ count: 0 }))
  listRolesForHmDashboard.mockReturnValue(Promise.resolve({ data: [] }))
  getOnboardingDraftRoleForHm.mockReturnValue(Promise.resolve({ data: null }))
  hiredMatchCountForRoles.mockReturnValue(Promise.resolve({ count: 0 }))
  activeMatchRoleIds.mockReturnValue(Promise.resolve({ data: [] }))
  pendingColdStartRoleIds.mockReturnValue(Promise.resolve({ data: [] }))
  getMatchProfilePreviews.mockReturnValue(Promise.resolve({ data: [] }))
  interviewRoundsForMatches.mockReturnValue(Promise.resolve({ data: [], error: null }))
  hmInterviewProposalsForMatches.mockReturnValue(Promise.resolve({ data: [], error: null }))
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
