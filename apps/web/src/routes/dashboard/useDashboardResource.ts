import { useEffect, useRef, useState } from 'react'
import { readDashCache } from '../../lib/dashboardCache'

/**
 * Shared dashboard-orchestration primitives (Phase 3 clean-arch).
 *
 * The three dashboard hooks (HM / Talent / HR) each own a large, divergent
 * load + realtime + action surface that CANNOT be safely collapsed into one
 * generic hook without a config-heavy abstraction that would obscure the
 * documented realtime tenant-isolation semantics (HM's `role_id=in.(…)` filter
 * with resubscribe-on-unknown-role, Talent's dual `talent_id=eq.` +
 * `interview_rounds` channels, HR's no-channel/`loadRetry` model). So instead
 * of a monolithic `useDashboardResource`, this module extracts only the small,
 * byte-identical scaffold the hooks genuinely share:
 *
 *   - `useMountedRef()`    — the `mountedRef` guard (HM + Talent, verbatim).
 *   - `useReloadTimer()`   — the self-clearing `reloadTimerRef` (HM + Talent).
 *   - `useDashCacheSnapshot()` — the `useState(() => readDashCache(...))[0]`
 *                            hydrate helper (all three).
 *
 * Each hook keeps its own `load()` phases, realtime channel wiring, optimistic-
 * update-with-revert action handlers, watchdog, and return bag intact — a safe
 * PARTIAL extraction. The PDPA cache carve-outs are unchanged: this module only
 * READS the cache snapshot; hooks continue to write aggregate-only snapshots
 * (never CV URLs / scores / points) via `writeDashCache` themselves.
 */

/**
 * `true` while the owning component is mounted, flipped to `false` on unmount.
 *
 * Used by async action handlers to skip state updates that would land after the
 * component has gone away (post-`await` `if (!mountedRef.current) return`).
 * This is the verbatim `mountedRef` pattern previously inlined in the HM and
 * Talent hooks — behaviour-identical.
 */
export function useMountedRef() {
  const mountedRef = useRef(true)
  useEffect(() => () => { mountedRef.current = false }, [])
  return mountedRef
}

/**
 * A `setTimeout` handle ref whose pending timer is cleared on unmount, so a
 * deferred `window.location.reload()` (scheduled after a redeem/unlock) can't
 * fire against an unmounted tree. Assign to `.current` exactly as before:
 *
 *   reloadTimerRef.current = setTimeout(() => window.location.reload(), 1500)
 *
 * Verbatim relocation of the `reloadTimerRef` + cleanup effect that lived in
 * the HM and Talent hooks.
 */
export function useReloadTimer() {
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (reloadTimerRef.current !== null) clearTimeout(reloadTimerRef.current) }, [])
  return reloadTimerRef
}

/**
 * Hydrate a dashboard's KPI snapshot from localStorage exactly ONCE at mount
 * (lazy `useState` initializer, value only — the setter is discarded), so the
 * headline numbers don't shimmer on a returning visit before the live queries
 * resolve. Identical to the `useState(() => readDashCache<T>(surface, userId))[0]`
 * idiom the three hooks each inlined.
 *
 * Read-only: never writes the cache, so the PDPA carve-outs (aggregate counts
 * only, never CV URLs / candidate ids / scores / points) stay owned by each
 * hook's own `writeDashCache` call.
 */
export function useDashCacheSnapshot<T>(surface: string, userId?: string | null): T | null {
  return useState(() => readDashCache<T>(surface, userId))[0]
}
