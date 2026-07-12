import { describe, it, expect } from 'vitest'
import { dobConfirmMatches } from './DobConfirmModal'

/**
 * onboarding-pii-3: the DOB double-check must validate the FULL date (month + day
 * + year), not just the birth year. Before the fix, a same-year month/day typo
 * (1990-07-15 vs the intended 1990-01-15) passed the year-only check and locked
 * the wrong, matching-critical month/day forever.
 */
describe('dobConfirmMatches (onboarding-pii-3)', () => {
  const dob = '1990-01-15'

  it('rejects a matching YEAR but wrong month/day (the exact regression)', () => {
    expect(dobConfirmMatches(dob, '1990')).toBe(false)      // year-only no longer passes
    expect(dobConfirmMatches(dob, '15/07/1990')).toBe(false) // right year+day, wrong month
    expect(dobConfirmMatches(dob, '16/01/1990')).toBe(false) // right year+month, wrong day
  })

  it('accepts the full date with separators or padded digits', () => {
    expect(dobConfirmMatches(dob, '15/01/1990')).toBe(true)
    expect(dobConfirmMatches(dob, '15-01-1990')).toBe(true)
    expect(dobConfirmMatches(dob, '15011990')).toBe(true)
  })

  it('is tolerant of missing leading zeros when separated', () => {
    expect(dobConfirmMatches(dob, '15/1/1990')).toBe(true)
    expect(dobConfirmMatches('1990-07-05', '5/7/1990')).toBe(true)
  })

  it('rejects incomplete or malformed input', () => {
    expect(dobConfirmMatches(dob, '')).toBe(false)
    expect(dobConfirmMatches(dob, '15/01')).toBe(false)
    expect(dobConfirmMatches(dob, 'not a date')).toBe(false)
  })
})
