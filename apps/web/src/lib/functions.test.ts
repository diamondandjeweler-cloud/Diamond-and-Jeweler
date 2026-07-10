import { describe, it, expect } from 'vitest'
import { coerceErrorMessage } from './functions'

// ---------------------------------------------------------------------------
// Guards the edge-function error envelope contract: backends must return a
// top-level STRING `error`, but if one ever returns an object the client
// wrapper must still surface something readable — never "[object Object]".
// (Pure string coercion — no network involved.)
// ---------------------------------------------------------------------------

describe('coerceErrorMessage', () => {
  it('returns a string value as-is', () => {
    expect(coerceErrorMessage('Insufficient points')).toBe('Insufficient points')
  })

  it('uses a string .message on object errors', () => {
    expect(coerceErrorMessage({ message: 'Role not found', code: 'P0002' }))
      .toBe('Role not found')
  })

  it('JSON-stringifies objects without a usable .message', () => {
    expect(coerceErrorMessage({ code: 'P0002', detail: 'missing row' }))
      .toBe('{"code":"P0002","detail":"missing row"}')
  })

  it('JSON-stringifies when .message is not a string', () => {
    expect(coerceErrorMessage({ message: { nested: true } }))
      .toBe('{"message":{"nested":true}}')
  })

  it('falls back to a generic message when stringification fails', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(coerceErrorMessage(circular)).toBe('Request failed — please try again.')
  })

  it('never produces "[object Object]"', () => {
    for (const raw of [{ error: 'x' }, { message: {} }, {}, [{}], new Map()]) {
      expect(coerceErrorMessage(raw)).not.toContain('[object Object]')
    }
  })
})
