import { describe, it, expect } from 'vitest'
import { LEADERSHIP_QUESTIONS } from './leadership-questions'

describe('leadership-questions', () => {
  it('has exactly 10 questions (matches spec)', () => {
    expect(LEADERSHIP_QUESTIONS).toHaveLength(10)
  })

  it('every question has at least 2 options', () => {
    for (const q of LEADERSHIP_QUESTIONS) {
      expect(q.options.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('all option tag weights are within [0, 1]', () => {
    for (const q of LEADERSHIP_QUESTIONS) {
      for (const opt of q.options) {
        for (const [tag, weight] of Object.entries(opt.tags)) {
          expect(weight).toBeGreaterThanOrEqual(0)
          expect(weight, `${tag} in ${q.text}`).toBeLessThanOrEqual(1)
        }
      }
    }
  })
})
