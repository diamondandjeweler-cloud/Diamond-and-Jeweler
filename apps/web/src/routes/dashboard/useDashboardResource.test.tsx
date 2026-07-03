import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useMountedRef, useReloadTimer, useDashCacheSnapshot } from './useDashboardResource'
import { writeDashCache, clearAllDashCaches } from '../../lib/dashboardCache'

/**
 * Characterization for the shared dashboard primitives extracted in Phase 3.
 * These lock in the exact behaviour the HM / Talent / HR hooks depended on when
 * the logic was inlined, so the thin compositions can't silently regress.
 */

describe('useMountedRef()', () => {
  it('starts true and flips to false only after unmount', () => {
    const { result, unmount } = renderHook(() => useMountedRef())
    expect(result.current.current).toBe(true)
    unmount()
    // The cleanup effect ran on unmount — post-await guards now short-circuit.
    expect(result.current.current).toBe(false)
  })

  it('returns a stable ref object across re-renders (safe as a useCallback dep)', () => {
    const { result, rerender } = renderHook(() => useMountedRef())
    const first = result.current
    rerender()
    expect(result.current).toBe(first)
  })
})

describe('useReloadTimer()', () => {
  beforeEach(() => { vi.useRealTimers() })

  it('exposes a null-initialised timer ref that survives re-renders', () => {
    const { result, rerender } = renderHook(() => useReloadTimer())
    expect(result.current.current).toBeNull()
    const first = result.current
    rerender()
    expect(result.current).toBe(first)
  })

  it('clears a pending timer on unmount so a queued reload cannot fire', () => {
    vi.useFakeTimers()
    try {
      const fired = vi.fn()
      const { result, unmount } = renderHook(() => useReloadTimer())
      result.current.current = setTimeout(fired, 1500) as unknown as ReturnType<typeof setTimeout>
      unmount()
      vi.advanceTimersByTime(5000)
      expect(fired).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('useDashCacheSnapshot()', () => {
  beforeEach(() => { clearAllDashCaches() })

  it('returns null when no snapshot is cached', () => {
    const { result } = renderHook(() => useDashCacheSnapshot<{ n: number }>('hm_dashboard', 'user-1'))
    expect(result.current).toBeNull()
  })

  it('hydrates the cached snapshot for the matching surface+user', () => {
    writeDashCache('hm_dashboard', 'user-1', { roleCount: 3, candidatesCount: 5 })
    const { result } = renderHook(() =>
      useDashCacheSnapshot<{ roleCount: number; candidatesCount: number }>('hm_dashboard', 'user-1'),
    )
    expect(result.current).toEqual({ roleCount: 3, candidatesCount: 5 })
  })

  it('does NOT read across users (per-user cache isolation)', () => {
    writeDashCache('hm_dashboard', 'user-1', { roleCount: 9 })
    const { result } = renderHook(() =>
      useDashCacheSnapshot<{ roleCount: number }>('hm_dashboard', 'user-2'),
    )
    expect(result.current).toBeNull()
  })

  it('reads once at mount and does not re-read on re-render (lazy init)', () => {
    writeDashCache('talent_dashboard', 'u', { matchesCount: 1 })
    const { result, rerender } = renderHook(() =>
      useDashCacheSnapshot<{ matchesCount: number }>('talent_dashboard', 'u'),
    )
    const first = result.current
    // Mutating the cache after mount must NOT be observed — the snapshot is
    // captured exactly once so the KPI strip stays stable for the session.
    writeDashCache('talent_dashboard', 'u', { matchesCount: 999 })
    rerender()
    expect(result.current).toBe(first)
    expect(result.current).toEqual({ matchesCount: 1 })
  })
})
