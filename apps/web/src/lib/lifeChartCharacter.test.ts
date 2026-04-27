import { describe, it, expect } from 'vitest'
import { getLifeChartCharacter } from './lifeChartCharacter'

describe('getLifeChartCharacter', () => {
  it('1950 male = E, female = W (cycle base)', () => {
    expect(getLifeChartCharacter('1950-06-01', 'male')).toBe('E')
    expect(getLifeChartCharacter('1950-06-01', 'female')).toBe('W')
  })

  it('1959 male = E, female = W (9-year cycle wraps)', () => {
    expect(getLifeChartCharacter('1959-06-01', 'male')).toBe('E')
    expect(getLifeChartCharacter('1959-06-01', 'female')).toBe('W')
  })

  it('1989 (offset 39 = slot 3) male = E-, female = W-', () => {
    expect(getLifeChartCharacter('1989-06-01', 'male')).toBe('E-')
    expect(getLifeChartCharacter('1989-06-01', 'female')).toBe('W-')
  })

  it('1991 (offset 41 = slot 5) male = F, female = G+', () => {
    expect(getLifeChartCharacter('1991-06-01', 'male')).toBe('F')
    expect(getLifeChartCharacter('1991-06-01', 'female')).toBe('G+')
  })

  it('2026 (offset 76 = slot 4) male = W, female = E', () => {
    expect(getLifeChartCharacter('2026-06-01', 'male')).toBe('W')
    expect(getLifeChartCharacter('2026-06-01', 'female')).toBe('E')
  })

  it('crosses solar boundary: 3 Feb 1990 belongs to solar year 1989 (boundary 4 Feb)', () => {
    // 1989 is slot 3 → male E-, female W-
    expect(getLifeChartCharacter('1990-02-03', 'male')).toBe('E-')
    expect(getLifeChartCharacter('1990-02-03', 'female')).toBe('W-')
  })

  it('crosses solar boundary: 4 Feb 1990 belongs to solar year 1990 (slot 4)', () => {
    // 1990 is slot 4 → male W, female E
    expect(getLifeChartCharacter('1990-02-04', 'male')).toBe('W')
    expect(getLifeChartCharacter('1990-02-04', 'female')).toBe('E')
  })

  it('uses Feb 5 boundary for 1952 (table override)', () => {
    // 1951 is slot 1 → male W-, female E-
    expect(getLifeChartCharacter('1952-02-04', 'male')).toBe('W-')
    expect(getLifeChartCharacter('1952-02-04', 'female')).toBe('E-')
    // 1952 is slot 2 → male W+, female W+
    expect(getLifeChartCharacter('1952-02-05', 'male')).toBe('W+')
    expect(getLifeChartCharacter('1952-02-05', 'female')).toBe('W+')
  })

  it('uses Feb 3 boundary for 2017 (table override)', () => {
    // 2016 is slot 66 % 9 = 3 → male E-, female W-
    expect(getLifeChartCharacter('2017-02-02', 'male')).toBe('E-')
    expect(getLifeChartCharacter('2017-02-02', 'female')).toBe('W-')
    // 2017 is slot 67 % 9 = 4 → male W, female E
    expect(getLifeChartCharacter('2017-02-03', 'male')).toBe('W')
    expect(getLifeChartCharacter('2017-02-03', 'female')).toBe('E')
  })

  it('January always belongs to the previous solar year', () => {
    // 31 Jan 1991 → solar year 1990 (slot 4 → male W, female E)
    expect(getLifeChartCharacter('1991-01-31', 'male')).toBe('W')
    expect(getLifeChartCharacter('1991-01-31', 'female')).toBe('E')
  })

  it('returns null for unsupported years', () => {
    expect(getLifeChartCharacter('1949-12-31', 'male')).toBe(null)
    expect(getLifeChartCharacter('2105-01-01', 'female')).toBe(null)
  })

  it('returns null for missing or invalid input', () => {
    expect(getLifeChartCharacter(null, 'male')).toBe(null)
    expect(getLifeChartCharacter('1990-06-01', '')).toBe(null)
    expect(getLifeChartCharacter('1990-06-01', 'other')).toBe(null)
    expect(getLifeChartCharacter('not-a-date', 'male')).toBe(null)
  })
})
