import { describe, it, expect } from 'vitest'
import { formatError } from './errors'

describe('formatError', () => {
  it('returns "Unknown error" for null', () => {
    expect(formatError(null)).toBe('Unknown error')
  })

  it('returns "Unknown error" for undefined', () => {
    expect(formatError(undefined)).toBe('Unknown error')
  })

  it('returns the string as-is for a plain string', () => {
    expect(formatError('boom')).toBe('boom')
  })

  it('returns the message for an Error instance', () => {
    expect(formatError(new Error('x'))).toBe('x')
  })

  it('returns the message field from a plain object', () => {
    expect(formatError({ message: 'm' })).toBe('m')
  })

  it('returns the error field when it is a string', () => {
    expect(formatError({ error: 'e' })).toBe('e')
  })

  it('returns the error_description field when present', () => {
    expect(formatError({ error_description: 'ed' })).toBe('ed')
  })

  it('returns the nested error.message when error is an object', () => {
    expect(formatError({ error: { message: 'nested' } })).toBe('nested')
  })

  it('returns "[code]" when only code is present', () => {
    expect(formatError({ code: '42501' })).toBe('[42501]')
  })

  it('returns "[code] details (hint: hint)" when code, details, and hint are all present', () => {
    expect(formatError({ code: 'X', details: 'd', hint: 'h' })).toBe('[X] d (hint: h)')
  })

  it('returns the RLS-denial message for an empty message string', () => {
    expect(formatError({ message: '' })).toBe(
      'Empty error from server (likely RLS denial — check that your account has the required role).'
    )
  })

  it('returns the RLS-denial message for an empty object', () => {
    expect(formatError({})).toBe(
      'Empty error from server (likely RLS denial — check that your account has the required role).'
    )
  })

  it('falls back to JSON.stringify for an object with no recognized fields', () => {
    expect(formatError({ foo: 1 })).toBe('{"foo":1}')
  })
})
