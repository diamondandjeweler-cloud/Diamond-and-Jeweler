import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDraftForm } from './useDraftForm'

const KEY = 'test_draft'

beforeEach(() => {
  localStorage.clear()
  vi.useRealTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useDraftForm — restore-on-mount', () => {
  it('parses the stored draft and hands it to restore() exactly once', () => {
    localStorage.setItem(KEY, JSON.stringify({ title: 'Hello', n: 3 }))
    const restore = vi.fn()
    const { rerender } = renderHook(
      ({ v }) => useDraftForm({ key: KEY, collect: () => ({ v }), deps: [v], restore }),
      { initialProps: { v: 1 } },
    )
    expect(restore).toHaveBeenCalledTimes(1)
    expect(restore).toHaveBeenCalledWith({ title: 'Hello', n: 3 })
    // A subsequent dep change must NOT re-run restore.
    rerender({ v: 2 })
    expect(restore).toHaveBeenCalledTimes(1)
  })

  it('does not call restore when nothing is stored', () => {
    const restore = vi.fn()
    renderHook(() => useDraftForm({ key: KEY, collect: () => ({}), deps: [], restore }))
    expect(restore).not.toHaveBeenCalled()
  })

  it('calls onRestoreError when the stored draft is malformed', () => {
    localStorage.setItem(KEY, '{not json')
    const restore = vi.fn()
    const onRestoreError = vi.fn()
    renderHook(() => useDraftForm({ key: KEY, collect: () => ({}), deps: [], restore, onRestoreError }))
    expect(restore).not.toHaveBeenCalled()
    expect(onRestoreError).toHaveBeenCalledTimes(1)
  })

  it('is inert when disabled or key is null', () => {
    localStorage.setItem(KEY, JSON.stringify({ a: 1 }))
    const restore = vi.fn()
    renderHook(() => useDraftForm({ key: KEY, enabled: false, collect: () => ({}), deps: [], restore }))
    renderHook(() => useDraftForm({ key: null, collect: () => ({}), deps: [], restore }))
    expect(restore).not.toHaveBeenCalled()
  })
})

describe('useDraftForm — autosave (overwrite, debounced)', () => {
  it('skips the first mount, then debounces a write and fires onSaved', () => {
    vi.useFakeTimers()
    const onSaved = vi.fn()
    const { rerender } = renderHook(
      ({ v }) => useDraftForm({
        key: KEY, collect: () => ({ v }), deps: [v],
        debounceMs: 600, skipFirstMount: true, onSaved,
      }),
      { initialProps: { v: 1 } },
    )
    // First mount is skipped — nothing written, even after the debounce window.
    act(() => { vi.advanceTimersByTime(600) })
    expect(localStorage.getItem(KEY)).toBeNull()
    expect(onSaved).not.toHaveBeenCalled()

    // A real change schedules a write; it lands only after the debounce window.
    rerender({ v: 2 })
    expect(localStorage.getItem(KEY)).toBeNull()
    act(() => { vi.advanceTimersByTime(600) })
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ v: 2 })
    expect(onSaved).toHaveBeenCalledTimes(1)
  })

  it('cancels a pending debounced write when deps change again before it fires', () => {
    vi.useFakeTimers()
    const { rerender } = renderHook(
      ({ v }) => useDraftForm({
        key: KEY, collect: () => ({ v }), deps: [v],
        debounceMs: 600, skipFirstMount: true,
      }),
      { initialProps: { v: 1 } },
    )
    rerender({ v: 2 })
    act(() => { vi.advanceTimersByTime(300) }) // not enough to flush
    rerender({ v: 3 })                          // resets the timer
    act(() => { vi.advanceTimersByTime(300) })  // 600 since first change, but only 300 since reset
    expect(localStorage.getItem(KEY)).toBeNull()
    act(() => { vi.advanceTimersByTime(300) })  // now the reset timer flushes
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ v: 3 })
  })

  it('overwrites — does not retain prior unrelated keys when merge is off', () => {
    vi.useFakeTimers()
    localStorage.setItem(KEY, JSON.stringify({ keep: 'me', v: 0 }))
    const { rerender } = renderHook(
      ({ v }) => useDraftForm({
        key: KEY, collect: () => ({ v }), deps: [v],
        debounceMs: 600, skipFirstMount: true,
      }),
      { initialProps: { v: 1 } },
    )
    rerender({ v: 2 })
    act(() => { vi.advanceTimersByTime(600) })
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ v: 2 })
  })
})

describe('useDraftForm — autosave (immediate, merge)', () => {
  it('merges the snapshot over the existing stored object on every run', () => {
    localStorage.setItem(KEY, JSON.stringify({ apiMessages: ['x'], stale: true }))
    const { rerender } = renderHook(
      ({ phase }) => useDraftForm({
        key: KEY, merge: true,
        collect: () => ({ phase, fullName: 'Ada' }),
        deps: [phase],
      }),
      { initialProps: { phase: 'chat' } },
    )
    // Immediate write (no debounce, no skip-first-mount): runs on mount.
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({
      apiMessages: ['x'], stale: true, phase: 'chat', fullName: 'Ada',
    })
    rerender({ phase: 'dob' })
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({
      apiMessages: ['x'], stale: true, phase: 'dob', fullName: 'Ada',
    })
  })

  it('does not write while disabled, then resumes when enabled flips on', () => {
    const { rerender } = renderHook(
      ({ enabled }) => useDraftForm({
        key: KEY, enabled, merge: true,
        collect: () => ({ phase: 'chat' }),
        deps: [],
      }),
      { initialProps: { enabled: false } },
    )
    expect(localStorage.getItem(KEY)).toBeNull()
    rerender({ enabled: true })
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ phase: 'chat' })
  })

  it('swallows storage write errors', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded')
    })
    expect(() =>
      renderHook(() => useDraftForm({ key: KEY, collect: () => ({ a: 1 }), deps: [] })),
    ).not.toThrow()
    spy.mockRestore()
  })
})
