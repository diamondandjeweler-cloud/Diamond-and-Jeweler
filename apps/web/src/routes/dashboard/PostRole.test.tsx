import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import TraitPicker from './postrole/TraitPicker'
import { buildTeamMemberCharacters } from './postrole/teamCharacters'
import { TRAITS } from './postrole/types'

// PostRole's transitive imports (role-form/index.tsx) touch the supabase
// module at import time. The extracted sub-views under test here do NOT call
// supabase, but mock it defensively — exactly as HMDashboard.test.tsx does —
// so no transitive import can reach a live client during the render smoke.
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
    rpc: async () => ({ data: null, error: null }),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: () => {},
  },
}))

/* ── Render smoke: TraitPicker (largest dependency-free extracted sub-view) ── */
describe('<TraitPicker /> (PostRole sub-view)', () => {
  it('renders the required-traits label and every trait chip', () => {
    render(<TraitPicker requiredTraits={[]} onToggle={() => {}} />)
    // The label div is "Required traits *" (text split by a child <span>); match
    // on a substring so the assertion is robust to the trailing required marker.
    expect(screen.getByText(/Required traits/)).toBeInTheDocument()
    // All 10 traits render as buttons, underscores rendered as spaces.
    expect(screen.getByText('self starter')).toBeInTheDocument()
    expect(screen.getByText('reliable')).toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(TRAITS.length)
  })

  it('THRESHOLD: at the 1–5 cap, unselected chips disable but selected ones stay enabled', () => {
    // Five selected traits = the documented cap. A sixth (unselected) chip must
    // be disabled; an already-selected chip must remain clickable.
    const selected = ['self_starter', 'reliable', 'collaborator', 'growth_minded', 'clear_communicator']
    render(<TraitPicker requiredTraits={selected} onToggle={() => {}} />)
    // 'detail_oriented' is NOT selected and we're at the cap → disabled.
    expect(screen.getByText('detail oriented').closest('button')).toBeDisabled()
    // 'reliable' IS selected → not disabled (can still be toggled off).
    expect(screen.getByText('reliable').closest('button')).not.toBeDisabled()
  })

  it('below the cap, no chip is disabled', () => {
    render(<TraitPicker requiredTraits={['reliable']} onToggle={() => {}} />)
    expect(screen.getByText('detail oriented').closest('button')).not.toBeDisabled()
  })
})

/* ── Pure helper: buildTeamMemberCharacters (relocated verbatim from submit) ── */
describe('buildTeamMemberCharacters()', () => {
  it('returns null when there are no valid rows', () => {
    expect(buildTeamMemberCharacters([])).toBeNull()
    expect(buildTeamMemberCharacters([{ dob: '', gender: '' }])).toBeNull()
    // Missing gender → skipped.
    expect(buildTeamMemberCharacters([{ dob: '1990', gender: '' }])).toBeNull()
  })

  it('drops out-of-range years (1950..2100 bound preserved)', () => {
    expect(buildTeamMemberCharacters([{ dob: '1900', gender: 'male' }])).toBeNull()
    expect(buildTeamMemberCharacters([{ dob: '2200', gender: 'female' }])).toBeNull()
  })

  it('returns a non-empty character array for valid rows', () => {
    const out = buildTeamMemberCharacters([
      { dob: '1985', gender: 'male' },
      { dob: '1990', gender: 'female' },
    ])
    expect(out).not.toBeNull()
    expect(Array.isArray(out)).toBe(true)
    expect((out as unknown[]).length).toBe(2)
  })

  it('skips invalid rows but keeps valid ones in the same call', () => {
    const out = buildTeamMemberCharacters([
      { dob: '1985', gender: 'male' },   // valid
      { dob: '', gender: 'female' },      // skipped (no dob)
      { dob: '1900', gender: 'male' },    // skipped (out of range)
    ])
    expect((out as unknown[]).length).toBe(1)
  })
})
