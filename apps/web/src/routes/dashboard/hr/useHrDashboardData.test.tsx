import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

/**
 * Characterization tests for the HR dashboard data hook after the Phase 3
 * primitive extraction (it now composes useDashCacheSnapshot). These lock in
 * the load / empty / error branches of the multi-phase §1/§2 load and the
 * KPI-count derivation. HR has NO realtime channel, so no channel mocking is
 * needed — reloads go through the `loadRetry` counter, which is out of scope
 * here (see coverageGaps).
 *
 * Repos are mocked at the module level (the seam the hook already goes through)
 * so each phase resolves deterministically. supabase is mocked only for
 * auth.getSession (the token warm-up) — never .from/.rpc.
 */

// `t` must be a STABLE reference across renders: useHrDashboardData lists `t`
// in its load-effect dep array, so a fresh function each render would re-fire
// the effect on every state update (infinite reload loop). Freeze it once.
const stableT = (k: string) => k
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: stableT }),
}))

// Mutable session driven per-test. HR reads useSession().session + refreshIsHM.
const sessionState = {
  session: { user: { id: 'hr-user-1', email: 'hr@acme.test' } } as unknown,
  refreshIsHM: vi.fn(async () => {}),
}
vi.mock('../../../state/useSession', () => ({
  useSession: () => sessionState,
  bootstrapSession: vi.fn(),
}))

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) },
  },
}))

// Repo mocks — thenable builders resolving {data,error}. hrPendingMatches has a
// trailing .order() so it returns an object exposing order().
const companyIdByHrEmail = vi.fn()
const hmsWithNamesByCompanyId = vi.fn()
const listRolesForHms = vi.fn()
const hrPendingMatches = vi.fn()
const hrOutcomesPendingMatches = vi.fn()
const hrScheduledInterviewsForRoles = vi.fn()

vi.mock('../../../data/repositories/companies', () => ({
  companyIdByHrEmail: (...a: unknown[]) => companyIdByHrEmail(...a),
  companyIdById: vi.fn(),
}))
vi.mock('../../../data/repositories/hiringManagers', () => ({
  hmsWithNamesByCompanyId: (...a: unknown[]) => hmsWithNamesByCompanyId(...a),
  insertHm: vi.fn(),
}))
vi.mock('../../../data/repositories/roles', () => ({
  listRolesForHms: (...a: unknown[]) => listRolesForHms(...a),
}))
vi.mock('../../../data/repositories/matches', () => ({
  hrPendingMatches: (...a: unknown[]) => hrPendingMatches(...a),
  hrOutcomesPendingMatches: (...a: unknown[]) => hrOutcomesPendingMatches(...a),
  updateMatch: vi.fn(),
}))
vi.mock('../../../data/repositories/interviews', () => ({
  updateInterview: vi.fn(),
  insertInterview: vi.fn(),
  hrScheduledInterviewsForRoles: (...a: unknown[]) => hrScheduledInterviewsForRoles(...a),
}))

import { useHrDashboardData } from './useHrDashboardData'

const thenable = <T,>(value: T) => Promise.resolve(value)

beforeEach(() => {
  vi.clearAllMocks()
  try { localStorage.clear() } catch { /* jsdom */ }
  sessionState.session = { user: { id: 'hr-user-1', email: 'hr@acme.test' } }
})

describe('useHrDashboardData — load / empty / error characterization', () => {
  it('LOAD: full happy path populates hms, openRoles, pending, scheduled and outcomesPending', async () => {
    companyIdByHrEmail.mockReturnValue(thenable({ data: { id: 'co-1' }, error: null }))
    hmsWithNamesByCompanyId.mockReturnValue(thenable({
      data: [{ id: 'hm-1', profile_id: 'hr-user-1', job_title: 'HR Lead', profiles: { full_name: 'Ada HR' } }],
      error: null,
    }))
    listRolesForHms.mockReturnValue(thenable({
      data: [{ id: 'role-1', title: 'Goldsmith', hiring_manager_id: 'hm-1' }],
      error: null,
    }))
    hrPendingMatches.mockReturnValue({
      order: () => thenable({ data: [{ id: 'match-1', status: 'invited_by_manager' }], error: null }),
    })
    hrScheduledInterviewsForRoles.mockReturnValue(thenable({
      data: [{
        id: 'iv-1', scheduled_at: '2026-07-01T00:00:00Z', format: 'video', status: 'scheduled',
        match_id: 'match-9', meeting_url: null, meeting_provider: null,
        matches: { talent_id: 'tal-1', roles: { title: 'Goldsmith' } },
      }],
      error: null,
    }))
    hrOutcomesPendingMatches.mockReturnValue(thenable({
      data: [{ id: 'match-c1', match_feedback: [] }],
      error: null,
    }))

    const { result } = renderHook(() => useHrDashboardData())

    await waitFor(() => expect(result.current.hms).not.toBeNull())
    expect(result.current.companyId).toBe('co-1')
    expect(result.current.hms).toEqual([{
      id: 'hm-1', profile_id: 'hr-user-1', full_name: 'Ada HR', job_title: 'HR Lead',
      role_count: 1, is_self: true,
    }])
    expect(result.current.openRoles).toEqual([{ id: 'role-1', title: 'Goldsmith', hm_name: 'Ada HR' }])
    await waitFor(() => expect(result.current.pending).not.toBeNull())
    expect(result.current.pending).toEqual([{ id: 'match-1', status: 'invited_by_manager' }])
    expect(result.current.scheduled).toHaveLength(1)
    expect(result.current.scheduled?.[0]).toMatchObject({
      interview_id: 'iv-1', match_id: 'match-9', role_title: 'Goldsmith', talent_id: 'tal-1',
    })
    // One completed match with an empty feedback array counts as pending outcome.
    expect(result.current.outcomesPending).toBe(1)
  })

  it('EMPTY (no company): all list slots settle to [] and outcomesPending to 0', async () => {
    companyIdByHrEmail.mockReturnValue(thenable({ data: null, error: null }))

    const { result } = renderHook(() => useHrDashboardData())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.hms).toEqual([])
    expect(result.current.openRoles).toEqual([])
    expect(result.current.pending).toEqual([])
    expect(result.current.scheduled).toEqual([])
    expect(result.current.outcomesPending).toBe(0)
    expect(result.current.companyId).toBeNull()
  })

  it('EMPTY (company has no HMs): lists settle empty and no roles are queried', async () => {
    companyIdByHrEmail.mockReturnValue(thenable({ data: { id: 'co-2' }, error: null }))
    hmsWithNamesByCompanyId.mockReturnValue(thenable({ data: [], error: null }))

    const { result } = renderHook(() => useHrDashboardData())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.hms).toEqual([])
    expect(result.current.openRoles).toEqual([])
    expect(result.current.pending).toEqual([])
    expect(result.current.scheduled).toEqual([])
    expect(result.current.outcomesPending).toBe(0)
    expect(listRolesForHms).not.toHaveBeenCalled()
  })

  it('ERROR: a thrown repo error sets err and settles every still-null slot', async () => {
    companyIdByHrEmail.mockReturnValue(thenable({ data: { id: 'co-3' }, error: null }))
    hmsWithNamesByCompanyId.mockImplementation(() => Promise.reject(new Error('boom-hms')))

    const { result } = renderHook(() => useHrDashboardData())

    await waitFor(() => expect(result.current.err).toBe('boom-hms'))
    expect(result.current.hms).toEqual([])
    expect(result.current.openRoles).toEqual([])
    expect(result.current.pending).toEqual([])
    expect(result.current.scheduled).toEqual([])
    expect(result.current.outcomesPending).toBe(0)
    expect(result.current.loading).toBe(false)
  })
})
