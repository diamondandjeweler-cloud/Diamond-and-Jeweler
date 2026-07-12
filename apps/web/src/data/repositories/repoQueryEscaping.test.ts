import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Mock } from 'vitest'

/**
 * data-access-1 / data-access-2: two PostgREST reads interpolate free text into
 * `.ilike(...)`. This pins the corrected query shape at the supabase seam:
 *   - getMarketRate escapes `%`/`_` in the title (else 'Sales%' wildcard-matches
 *     an arbitrary benchmark band).
 *   - companyIdByHrEmail matches the normalized RLS binding (auth_hr_company_id
 *     uses lower(trim(primary_hr_email))): case-insensitive ILIKE on the trimmed,
 *     escaped email instead of a case-sensitive `.eq`, so an 'HR@Acme.com' login
 *     resolves the 'hr@acme.com' company the RLS policy already grants.
 */

const h = vi.hoisted(() => {
  const state: { ilikeArgs: Array<[string, string]>; eqArgs: Array<[string, unknown]>; limitArgs: number[] } = {
    ilikeArgs: [], eqArgs: [], limitArgs: [],
  }
  const builder: Record<string, unknown> = {}
  const self = () => builder
  builder.select = vi.fn(self)
  builder.eq = vi.fn((col: string, val: unknown) => { state.eqArgs.push([col, val]); return builder })
  builder.ilike = vi.fn((col: string, val: string) => { state.ilikeArgs.push([col, val]); return builder })
  builder.limit = vi.fn((n: number) => { state.limitArgs.push(n); return builder })
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }))
  return { state, builder }
})

vi.mock('../../lib/supabase', () => ({ supabase: { from: () => h.builder } }))

import { getMarketRate } from './marketRates'
import { companyIdByHrEmail } from './companies'

beforeEach(() => {
  h.state.ilikeArgs = []
  h.state.eqArgs = []
  h.state.limitArgs = []
  ;(h.builder.ilike as Mock).mockClear()
  ;(h.builder.eq as Mock).mockClear()
})

describe('getMarketRate — LIKE metacharacter escaping (data-access-2)', () => {
  it('escapes a percent wildcard in the title', async () => {
    await getMarketRate('Sales%', 'Kuala Lumpur', 'senior')
    expect(h.state.ilikeArgs).toContainEqual(['job_title', 'Sales\\%'])
  })

  it('escapes an underscore in the title', async () => {
    await getMarketRate('C_Level', 'Kuala Lumpur', 'senior')
    expect(h.state.ilikeArgs).toContainEqual(['job_title', 'C\\_Level'])
  })

  it('leaves a plain title untouched', async () => {
    await getMarketRate('Sales Executive', 'Kuala Lumpur', 'senior')
    expect(h.state.ilikeArgs).toContainEqual(['job_title', 'Sales Executive'])
  })
})

describe('companyIdByHrEmail — normalized to the RLS binding (data-access-1)', () => {
  it('uses a trimmed, case-insensitive ILIKE (not a case-sensitive eq)', async () => {
    await companyIdByHrEmail('  HR@Acme.com ')
    // Trimmed + escaped; case is handled by ILIKE itself, so the value keeps its
    // original casing but the match is case-insensitive.
    expect(h.state.ilikeArgs).toContainEqual(['primary_hr_email', 'HR@Acme.com'])
    // Must NOT fall back to the old case-sensitive equality on this column.
    expect(h.state.eqArgs.some(([col]) => col === 'primary_hr_email')).toBe(false)
    // Bounded to a single row so a rare duplicate can't surface a PGRST116 error.
    expect(h.state.limitArgs).toContain(1)
  })

  it('escapes an underscore in the email local-part', async () => {
    await companyIdByHrEmail('first_last@acme.com')
    expect(h.state.ilikeArgs).toContainEqual(['primary_hr_email', 'first\\_last@acme.com'])
  })
})
