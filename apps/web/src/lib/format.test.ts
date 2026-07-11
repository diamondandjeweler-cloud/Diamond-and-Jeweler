import { describe, it, expect } from 'vitest'
import { fmtNumber, fmtMoneyMYR, fmt } from './format'

describe('fmtNumber', () => {
  it('renders an em dash for null', () => {
    expect(fmtNumber(null)).toBe('—')
  })

  it('renders an em dash for undefined', () => {
    expect(fmtNumber(undefined)).toBe('—')
  })

  it('formats zero', () => {
    expect(fmtNumber(0)).toBe('0')
  })

  it('formats a number using the default locale', () => {
    expect(fmtNumber(1234)).toBe((1234).toLocaleString())
  })
})

describe('fmtMoneyMYR', () => {
  it('renders an em dash for null', () => {
    expect(fmtMoneyMYR(null)).toBe('—')
  })

  it('formats a number using the en-MY locale', () => {
    expect(fmtMoneyMYR(1234)).toBe((1234).toLocaleString('en-MY'))
  })
})

describe('fmt', () => {
  it('is the same reference as fmtNumber', () => {
    expect(fmt).toBe(fmtNumber)
  })

  it('behaves like fmtNumber', () => {
    expect(fmt(5)).toBe(fmtNumber(5))
  })
})
