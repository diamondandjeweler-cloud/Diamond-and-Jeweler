import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'

/**
 * Characterization tests for the Talent dashboard data hook after the Phase 3
 * primitive extraction (it now composes useMountedRef / useReloadTimer /
 * useDashCacheSnapshot). These lock in the load / empty / error branches of the
 * two-phase load and the derived KPI counts (openCount / inFlight / totalActive
 * / slotsAvailable).
 *
 * Repos are mocked at the seam; supabase is mocked for the realtime channel
 * (chainable .on().on().subscribe()) + removeChannel only — never .from/.rpc.
 * The realtime payload handlers and optimistic-action reverts are NOT exercised
 * here (see coverageGaps).
 */

const stableT = (k: string) => k
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: stableT }) }))

const sessionState = {
  session: { user: { id: 'tal-user-1' } } as unknown,
  profile: { id: 'profile-1', full_name: 'Tia Talent' } as unknown,
}
vi.mock('../../../state/useSession', () => ({
  useSession: () => sessionState,
  bootstrapSession: vi.fn(),
}))

// Realtime channel stub: .on() is chainable (talent registers two), .subscribe()
// returns the channel. removeChannel is a no-op. auth is present for completeness.
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

const talentMatchesForTalent = vi.fn()
const talentDashboardSnapshotByProfileId = vi.fn()
const profilePointsById = vi.fn()
const lastCompletedFindJobRequest = vi.fn()
const getUrgentRoleCard = vi.fn()
const interviewRoundsForMatches = vi.fn()
const talentInterviewProposalsForMatches = vi.fn()

vi.mock('../../../data/repositories/matches', () => ({
  talentMatchesForTalent: (...a: unknown[]) => talentMatchesForTalent(...a),
  talentMatchById: vi.fn(),
  updateMatch: vi.fn(),
}))
vi.mock('../../../data/repositories/interviews', () => ({
  interviewRoundsForMatches: (...a: unknown[]) => interviewRoundsForMatches(...a),
  talentInterviewProposalsForMatches: (...a: unknown[]) => talentInterviewProposalsForMatches(...a),
}))
vi.mock('../../../data/repositories/profiles', () => ({
  profilePointsById: (...a: unknown[]) => profilePointsById(...a),
}))
vi.mock('../../../data/repositories/roles', () => ({
  getUrgentRoleCard: (...a: unknown[]) => getUrgentRoleCard(...a),
}))
vi.mock('../../../data/repositories/talents', () => ({
  talentDashboardSnapshotByProfileId: (...a: unknown[]) => talentDashboardSnapshotByProfileId(...a),
  talentExtractionStatusByProfileId: vi.fn(() => Promise.resolve({ data: null })),
  talentIdByProfileId: vi.fn(),
  updateTalentById: vi.fn(),
}))
vi.mock('../../../data/repositories/urgentRequests', () => ({
  lastCompletedFindJobRequest: (...a: unknown[]) => lastCompletedFindJobRequest(...a),
}))

import { useTalentDashboardData } from './useTalentDashboardData'

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(MemoryRouter, null, children)

// talentMatchesForTalent(...).order(...) → thenable {data,error}
const matchesBuilder = (data: unknown, error: unknown = null) => ({
  order: () => Promise.resolve({ data, error }),
})
// profilePointsById(...).maybeSingle() → thenable {data}
const pointsBuilder = (points: number | null) => ({
  maybeSingle: () => Promise.resolve({ data: points == null ? null : { points } }),
})

beforeEach(() => {
  vi.clearAllMocks()
  try { localStorage.clear() } catch { /* jsdom */ }
  sessionState.session = { user: { id: 'tal-user-1' } }
  // Defaults so a test that doesn't need them still resolves cleanly.
  profilePointsById.mockReturnValue(pointsBuilder(50))
  lastCompletedFindJobRequest.mockReturnValue(Promise.resolve({ data: null }))
  getUrgentRoleCard.mockReturnValue(Promise.resolve({ data: null }))
  interviewRoundsForMatches.mockReturnValue(Promise.resolve({ data: [], error: null }))
  talentInterviewProposalsForMatches.mockReturnValue(Promise.resolve({ data: [], error: null }))
})

describe('useTalentDashboardData — load / empty / error characterization', () => {
  it('LOAD: matches populate and KPI counts derive from status buckets', async () => {
    talentDashboardSnapshotByProfileId.mockReturnValue(Promise.resolve({
      data: { id: 'tal-1', extra_matches_used: 0, extraction_status: 'complete' },
      error: null,
    }))
    // generated + viewed → open (2); interview_scheduled → in-flight (1); total 3.
    talentMatchesForTalent.mockReturnValue(matchesBuilder([
      { id: 'm1', status: 'generated', roles: null },
      { id: 'm2', status: 'viewed', roles: null },
      { id: 'm3', status: 'interview_scheduled', roles: null },
    ]))

    const { result } = renderHook(() => useTalentDashboardData(), { wrapper })

    await waitFor(() => expect(result.current.matches).not.toBeNull())
    expect(result.current.matches).toHaveLength(3)
    expect(result.current.openCount).toBe(2)
    expect(result.current.inFlight).toBe(1)
    expect(result.current.totalActive).toBe(3)
    // slotsAvailable = max(0, 3 - totalActive) → 0 when three active.
    expect(result.current.slotsAvailable).toBe(0)
    // profile flows straight through from useSession.
    expect(result.current.profile).toEqual({ id: 'profile-1', full_name: 'Tia Talent' })
  })

  it('EMPTY (no talents row): matches settle to [] and counts are all zero', async () => {
    talentDashboardSnapshotByProfileId.mockReturnValue(Promise.resolve({ data: null, error: null }))

    const { result } = renderHook(() => useTalentDashboardData(), { wrapper })

    await waitFor(() => expect(result.current.matches).not.toBeNull())
    expect(result.current.matches).toEqual([])
    expect(result.current.openCount).toBe(0)
    expect(result.current.inFlight).toBe(0)
    expect(result.current.totalActive).toBe(0)
    // No active matches → all three slots available.
    expect(result.current.slotsAvailable).toBe(3)
  })

  it('ERROR (matches query returns {error}): err is set and matches settle to []', async () => {
    talentDashboardSnapshotByProfileId.mockReturnValue(Promise.resolve({
      data: { id: 'tal-1', extra_matches_used: 0, extraction_status: 'complete' },
      error: null,
    }))
    talentMatchesForTalent.mockReturnValue(matchesBuilder(null, { message: 'matches-boom' }))

    const { result } = renderHook(() => useTalentDashboardData(), { wrapper })

    await waitFor(() => expect(result.current.err).toBe('matches-boom'))
    // On a query-level error the hook sets err but never assigns matches, so the
    // KPI counts fall back to the (empty) cached snapshot → null.
    expect(result.current.matches).toBeNull()
  })
})
