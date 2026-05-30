import { describe, it, expect } from 'vitest'
import { sanitiseClientText } from './orgChartSanitiser'

describe('sanitiseClientText — BaZi-secrecy invariant', () => {
  it('rewrites the standard term map', () => {
    expect(sanitiseClientText('Based on BaZi')).toContain('temperament pattern')
    expect(sanitiseClientText('八字 analysis')).toContain('temperament pattern')
    expect(sanitiseClientText('Life Chart shows')).toContain('role-fit profile')
    expect(sanitiseClientText('life-chart shows')).toContain('role-fit profile')
    expect(sanitiseClientText('Day Master is wood')).toContain('core trait')
    expect(sanitiseClientText('day-master is wood')).toContain('core trait')
    expect(sanitiseClientText('Feng Shui audit')).toContain('workplace harmony')
    expect(sanitiseClientText('feng-shui audit')).toContain('workplace harmony')
    expect(sanitiseClientText('Bagua framework')).toContain('eight-area framework')
    expect(sanitiseClientText('八卦 framework')).toContain('eight-area framework')
    expect(sanitiseClientText('Heavenly Stem alignment')).toContain('foundation trait')
    expect(sanitiseClientText('earthly-branch dominance')).toContain('expression trait')
  })

  it('is case-insensitive', () => {
    expect(sanitiseClientText('BAZI')).toContain('temperament pattern')
    expect(sanitiseClientText('bazi')).toContain('temperament pattern')
    expect(sanitiseClientText('BaZi')).toContain('temperament pattern')
  })

  it('replaces all instances within a single string', () => {
    const r = sanitiseClientText('Her BaZi shows that her bazi alignment is strong')
    expect(r.match(/temperament pattern/g)?.length).toBe(2)
    expect(r.toLowerCase()).not.toContain('bazi')
  })

  it('does not introduce any forbidden terms', () => {
    const out = sanitiseClientText('Team summary with mixed traits')
    expect(out).not.toMatch(/bazi|八字|life[\s-]?chart|day[\s-]?master|feng[\s-]?shui|bagua|八卦|heavenly[\s-]?stem|earthly[\s-]?branch/i)
  })

  it('handles null / undefined / empty input', () => {
    expect(sanitiseClientText(null)).toBe('')
    expect(sanitiseClientText(undefined)).toBe('')
    expect(sanitiseClientText('')).toBe('')
  })

  it('leaves unrelated text intact', () => {
    expect(sanitiseClientText('Strategic Leader, Operational Driver, People Connector'))
      .toBe('Strategic Leader, Operational Driver, People Connector')
  })

  it('preserves HTML markup around sanitised words', () => {
    const html = '<p>Result based on <strong>BaZi</strong> analysis.</p>'
    const out = sanitiseClientText(html)
    expect(out).toContain('<strong>temperament pattern</strong>')
    expect(out).toContain('<p>')
    expect(out).toContain('</p>')
  })
})
