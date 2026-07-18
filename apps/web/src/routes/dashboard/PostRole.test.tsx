import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import TraitPicker from './postrole/TraitPicker'
import { buildTeamMemberInputs } from './postrole/teamCharacters'
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

/* ── Pure helper: buildTeamMemberInputs (raw inputs; server derives characters,
      migration 0210 — H5 keeps the algorithm off the client) ── */
describe('buildTeamMemberInputs()', () => {
  it('returns null when there are no valid rows', () => {
    expect(buildTeamMemberInputs([])).toBeNull()
    expect(buildTeamMemberInputs([{ dob: '', gender: '' }])).toBeNull()
    // Missing gender → skipped.
    expect(buildTeamMemberInputs([{ dob: '1990', gender: '' }])).toBeNull()
  })

  it('drops out-of-range years (1950..2100 bound preserved)', () => {
    expect(buildTeamMemberInputs([{ dob: '1900', gender: 'male' }])).toBeNull()
    expect(buildTeamMemberInputs([{ dob: '2200', gender: 'female' }])).toBeNull()
  })

  it('returns raw {y,g} inputs for valid rows (no character derivation client-side)', () => {
    const out = buildTeamMemberInputs([
      { dob: '1985', gender: 'male' },
      { dob: '1990', gender: 'female' },
    ])
    expect(out).toEqual([
      { y: 1985, g: 'male' },
      { y: 1990, g: 'female' },
    ])
  })

  it('skips invalid rows but keeps valid ones in the same call', () => {
    const out = buildTeamMemberInputs([
      { dob: '1985', gender: 'male' },   // valid
      { dob: '', gender: 'female' },      // skipped (no dob)
      { dob: '1900', gender: 'male' },    // skipped (out of range)
    ])
    expect(out).toEqual([{ y: 1985, g: 'male' }])
  })
})
