import { describe, it, expect } from 'vitest'
import { parseGivenName, getDisplayName } from './displayName'

describe('parseGivenName', () => {
  it('returns the only token when there is one', () => {
    expect(parseGivenName('Aiman')).toBe('Aiman')
  })

  it('returns the leading token for non-Chinese names', () => {
    expect(parseGivenName('Andrew Lee')).toBe('Andrew')
    expect(parseGivenName('Sarah Chong')).toBe('Sarah')
    expect(parseGivenName('Aiman Rashid')).toBe('Aiman')
  })

  it('skips Chinese family names and uses the given name', () => {
    expect(parseGivenName('Tan Wei Ming')).toBe('Wei Ming')
    expect(parseGivenName('Lim Sue Ann')).toBe('Sue Ann')
    expect(parseGivenName('Lee Kwang Hoe')).toBe('Kwang Hoe')
    expect(parseGivenName('Choo Kah Leong')).toBe('Kah Leong')
    expect(parseGivenName('Tan Kok Wei')).toBe('Kok Wei')
  })

  it('handles Malay names with the leading personal name', () => {
    expect(parseGivenName('Hafiz Bin Yusof')).toBe('Hafiz')
    expect(parseGivenName('Nurul Aisyah')).toBe('Nurul')
  })

  it('case-normalizes', () => {
    expect(parseGivenName('TAN WEI MING')).toBe('Wei Ming')
    expect(parseGivenName('andrew lee')).toBe('Andrew')
  })

  it('handles whitespace gracefully', () => {
    expect(parseGivenName('  Tan   Wei Ming  ')).toBe('Wei Ming')
    expect(parseGivenName('')).toBe('')
  })
})

describe('getDisplayName', () => {
  it('prefers display_name when set', () => {
    expect(getDisplayName({
      display_name: 'Wei',
      full_name: 'Tan Wei Ming',
      email: 'tan@example.com',
    })).toBe('Wei')
  })

  it('falls back to parsed full_name when display_name is null', () => {
    expect(getDisplayName({
      display_name: null,
      full_name: 'Tan Wei Ming',
      email: 'tan@example.com',
    })).toBe('Wei Ming')
  })

  it('falls back to email local-part as last resort', () => {
    expect(getDisplayName({
      display_name: null,
      full_name: '',
      email: 'jane.doe@example.com',
    })).toBe('Jane Doe')
  })

  it('returns empty string for null profile', () => {
    expect(getDisplayName(null)).toBe('')
    expect(getDisplayName(undefined)).toBe('')
  })

  it('treats whitespace-only display_name as empty', () => {
    expect(getDisplayName({
      display_name: '   ',
      full_name: 'Andrew Lee',
      email: 'andrew@example.com',
    })).toBe('Andrew')
  })
})
