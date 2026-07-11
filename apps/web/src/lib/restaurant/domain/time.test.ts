import { describe, it, expect } from 'vitest'
import { mytDay, mytHhmm } from './time'

describe('restaurant domain — MYT time helpers (UTC+8, no DST)', () => {
  it('mytDay rolls over into the next MYT calendar day', () => {
    expect(mytDay('2026-07-11T16:30:00Z')).toBe('2026-07-12') // 00:30 MYT next day
  })

  it('mytDay stays on the same MYT calendar day', () => {
    expect(mytDay('2026-07-11T00:00:00Z')).toBe('2026-07-11')
  })

  it('mytHhmm converts a same-day UTC instant to MYT wall-clock time', () => {
    expect(mytHhmm('2026-07-11T14:00:00Z')).toBe('22:00')
  })

  it('mytHhmm converts a UTC instant that rolls into the next MYT day', () => {
    expect(mytHhmm('2026-07-11T18:00:00Z')).toBe('02:00')
  })
})
