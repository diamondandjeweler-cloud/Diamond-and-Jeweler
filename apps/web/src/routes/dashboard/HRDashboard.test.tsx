import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import SchedulingSection from './hr/SchedulingSection'
import type { PendingRow, ScheduledRow } from './hr/types'

// react-i18next is not initialized in the test env. Mock it so `t(key, opts)`
// echoes the key and, when an interpolation value is provided, appends it —
// this lets us assert the *rounded* compatibility score deterministically
// (the only threshold/derived value rendered by this sub-view).
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts && 'pct' in opts ? `${key}:${opts.pct}` : key,
  }),
}))

// SchedulingSection does not touch supabase directly, but the sibling hook does
// and the task asks the supabase module to be mocked. Mock it defensively so no
// transitive import can reach a live client during the render smoke.
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
    rpc: async () => ({ data: null, error: null }),
    auth: { getSession: async () => ({ data: { session: null } }) },
  },
}))

const pendingRow: PendingRow = {
  id: 'match-1',
  status: 'invited_by_manager',
  // 81.6 must surface as 82 — exercises the Math.round() in the badge.
  compatibility_score: 81.6,
  roles: { id: 'role-1', title: 'Senior Goldsmith' },
  talents: { id: 'talent-1', profile_id: 'profile-1' },
}

const scheduledRow: ScheduledRow = {
  match_id: 'match-2',
  interview_id: 'iv-1',
  status: 'scheduled',
  scheduled_at: '2026-07-01T03:00:00.000Z',
  format: 'video',
  role_title: 'Master Diamond Setter',
  talent_id: 'talent-2',
  meeting_url: null,
  meeting_provider: null,
}

function renderSection(overrides: Partial<React.ComponentProps<typeof SchedulingSection>> = {}) {
  const noop = () => {}
  return render(
    <MemoryRouter>
      <SchedulingSection
        pending={[pendingRow]}
        scheduled={[scheduledRow]}
        schedulingId={null}
        scheduledAt=""
        format="video"
        onSetScheduledAt={noop}
        onSetFormat={noop}
        onStartScheduling={noop}
        onCancelScheduling={noop}
        onConfirmSchedule={noop}
        onCreateMeetingLink={noop}
        onCompleteInterview={noop}
        {...overrides}
      />
    </MemoryRouter>,
  )
}

describe('<SchedulingSection /> (HR dashboard sub-view)', () => {
  it('renders the role titles for both upcoming and pending rows', () => {
    renderSection()
    expect(screen.getByText('Master Diamond Setter')).toBeInTheDocument()
    expect(screen.getByText('Senior Goldsmith')).toBeInTheDocument()
  })

  it('ROUNDING: compatibility 81.6 is surfaced as a rounded 82% match badge', () => {
    renderSection()
    // Math.round(81.6) === 82, interpolated via the mocked t() as "key:82".
    expect(screen.getByText('hrDash.percentMatch:82')).toBeInTheDocument()
  })

  it('shows "create meeting link" when the upcoming interview has no meeting_url', () => {
    renderSection()
    expect(screen.getByText('hrDash.createMeetingLink')).toBeInTheDocument()
  })

  it('shows "join meeting" (not the create button) once a meeting_url exists', () => {
    renderSection({ scheduled: [{ ...scheduledRow, meeting_url: 'https://meet.example/x' }] })
    expect(screen.queryByText('hrDash.createMeetingLink')).not.toBeInTheDocument()
    expect(screen.getByText(/hrDash\.joinMeeting/)).toBeInTheDocument()
  })

  it('GATING: the schedule button shows when no row is being scheduled, and is replaced by the date/format form when schedulingId matches', () => {
    const { rerender } = renderSection({ schedulingId: null })
    expect(screen.getByText('hrDash.scheduleInterview')).toBeInTheDocument()
    expect(screen.queryByText('hrDash.confirm')).not.toBeInTheDocument()

    rerender(
      <MemoryRouter>
        <SchedulingSection
          pending={[pendingRow]}
          scheduled={[scheduledRow]}
          schedulingId="match-1"
          scheduledAt=""
          format="video"
          onSetScheduledAt={() => {}}
          onSetFormat={() => {}}
          onStartScheduling={() => {}}
          onCancelScheduling={() => {}}
          onConfirmSchedule={() => {}}
          onCreateMeetingLink={() => {}}
          onCompleteInterview={() => {}}
        />
      </MemoryRouter>,
    )
    // The inline picker (Confirm / Cancel) replaces the Schedule button for the
    // matching row.
    expect(screen.queryByText('hrDash.scheduleInterview')).not.toBeInTheDocument()
    expect(screen.getByText('hrDash.confirm')).toBeInTheDocument()
  })

  it('renders the empty state when there is nothing pending to schedule', () => {
    renderSection({ pending: [], scheduled: [] })
    expect(screen.getByText('hrDash.nothingToSchedule')).toBeInTheDocument()
  })
})
