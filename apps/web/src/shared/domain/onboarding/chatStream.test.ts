import { describe, it, expect } from 'vitest'
import {
  PROFILE_READY_SENTINEL,
  splitSseBuffer,
  accumulateSseLines,
  isProfileReady,
  displayText,
} from './chatStream'

/**
 * Golden-vector characterization suite for the onboarding SSE processor.
 * These pin the exact behavior lifted out of TalentOnboarding / HMOnboarding so
 * the extraction is provably behavior-preserving.
 */

const delta = (text: string) =>
  `data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text } })}`

describe('splitSseBuffer', () => {
  it('returns complete lines and carries the trailing partial line as rest', () => {
    const { lines, rest } = splitSseBuffer('a\nb\nc')
    expect(lines).toEqual(['a', 'b'])
    expect(rest).toBe('c')
  })

  it('a trailing newline yields an empty rest and no lost data', () => {
    const { lines, rest } = splitSseBuffer('a\nb\n')
    expect(lines).toEqual(['a', 'b'])
    expect(rest).toBe('')
  })

  it('a buffer with no newline is entirely carried over as rest', () => {
    const { lines, rest } = splitSseBuffer('partial')
    expect(lines).toEqual([])
    expect(rest).toBe('partial')
  })
})

describe('accumulateSseLines', () => {
  it('appends text_delta chunks in order', () => {
    const r1 = accumulateSseLines([delta('Hello')], '')
    expect(r1).toEqual({ accumulated: 'Hello', stop: false })
    const r2 = accumulateSseLines([delta(' world')], r1.accumulated)
    expect(r2).toEqual({ accumulated: 'Hello world', stop: false })
  })

  it('ignores non-data lines and blank lines', () => {
    const r = accumulateSseLines(['', 'event: ping', ':heartbeat', delta('x')], '')
    expect(r).toEqual({ accumulated: 'x', stop: false })
  })

  it('stops on a [DONE] frame without appending it', () => {
    const r = accumulateSseLines([delta('hi'), 'data: [DONE]', delta('never')], '')
    expect(r).toEqual({ accumulated: 'hi', stop: true })
  })

  it('stops on a message_stop frame', () => {
    const r = accumulateSseLines(
      [delta('done'), `data: ${JSON.stringify({ type: 'message_stop' })}`, delta('never')],
      '',
    )
    expect(r).toEqual({ accumulated: 'done', stop: true })
  })

  it('skips malformed JSON data frames silently', () => {
    const r = accumulateSseLines(['data: {not json', delta('ok')], '')
    expect(r).toEqual({ accumulated: 'ok', stop: false })
  })

  it('ignores non-text delta events (e.g. content_block_start)', () => {
    const r = accumulateSseLines(
      [`data: ${JSON.stringify({ type: 'content_block_start' })}`, delta('body')],
      '',
    )
    expect(r).toEqual({ accumulated: 'body', stop: false })
  })

  it('treats a text_delta with missing text as an empty append', () => {
    const r = accumulateSseLines(
      [`data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta' } })}`],
      'seed',
    )
    expect(r).toEqual({ accumulated: 'seed', stop: false })
  })
})

describe('isProfileReady', () => {
  it('is false until the full sentinel is present', () => {
    expect(isProfileReady('almost there [PROFILE_REA')).toBe(false)
    expect(isProfileReady('')).toBe(false)
  })

  it('is true once the full sentinel appears anywhere', () => {
    expect(isProfileReady(`great! ${PROFILE_READY_SENTINEL}`)).toBe(true)
    expect(isProfileReady(`${PROFILE_READY_SENTINEL} trailing`)).toBe(true)
  })
})

describe('displayText', () => {
  it('removes the full sentinel and trims trailing space', () => {
    expect(displayText(`All set.  ${PROFILE_READY_SENTINEL}`)).toBe('All set.')
  })

  it('hides a trailing partial sentinel while it streams in', () => {
    expect(displayText('Thanks![PROFILE_')).toBe('Thanks!')
    expect(displayText('Thanks![PROFILE_REA')).toBe('Thanks!')
    expect(displayText('Thanks![PROFILE_READY')).toBe('Thanks!')
  })

  it('leaves ordinary text untouched aside from trailing whitespace', () => {
    expect(displayText('Tell me about your last role.  ')).toBe('Tell me about your last role.')
    expect(displayText('no markers here')).toBe('no markers here')
  })

  it('does not strip a bracket fragment that is not at the end of the string', () => {
    expect(displayText('see [PROFILE_ then more')).toBe('see [PROFILE_ then more')
  })
})
