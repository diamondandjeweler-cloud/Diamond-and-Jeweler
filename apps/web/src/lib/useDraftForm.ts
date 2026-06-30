import { useEffect, useRef } from 'react'

/**
 * useDraftForm — shared localStorage draft serialize / restore / autosave.
 *
 * Extracted verbatim from the duplicated draft plumbing in PostRole.tsx and
 * TalentOnboarding.tsx. It owns three mechanics that both wizards repeated:
 *
 *   1. restore-on-mount — read `key`, JSON.parse, hand the parsed object to
 *      `restore()` exactly once. A parse failure calls `onRestoreError()`.
 *   2. autosave — when any entry in `deps` changes, snapshot via `collect()`
 *      and persist it. Optionally debounced, optionally skipping the first
 *      mount, optionally shallow-merged over whatever is already stored.
 *   3. enable/disable gate — when `enabled` is false (or `key` is null) the
 *      hook is inert: it neither restores nor autosaves.
 *
 * The options exist purely so the two call sites keep their *exact* prior
 * behaviour — this is a pure refactor, nothing observable changes:
 *
 *   PostRole          — debounceMs 600, skipFirstMount, overwrite, onSaved flash.
 *   TalentOnboarding  — immediate write, merge over prior, no restore (its
 *                       restore is bespoke / Supabase-coupled and stays inline).
 */
export interface UseDraftFormOptions {
  /** localStorage key. `null` disables the hook entirely. */
  key: string | null
  /** Snapshot the current form state into the object to persist. */
  collect: () => unknown
  /** Dependency list that drives the autosave effect. */
  deps: React.DependencyList
  /** When false the hook is inert (no restore, no autosave). Defaults to true. */
  enabled?: boolean
  /** Debounce the write by this many ms. 0 (default) writes synchronously. */
  debounceMs?: number
  /** Skip the very first autosave run (mount). Defaults to false. */
  skipFirstMount?: boolean
  /** Shallow-merge the snapshot over the object already in storage. Defaults to false (overwrite). */
  merge?: boolean
  /** Called after each successful write — e.g. to flash a "saved" indicator. */
  onSaved?: () => void
  /** Called once on mount with the parsed draft, if one was stored. */
  restore?: (data: Record<string, unknown>) => void
  /** Called when the stored draft fails to parse — e.g. to clear the bad key. */
  onRestoreError?: () => void
}

export function useDraftForm({
  key,
  collect,
  deps,
  enabled = true,
  debounceMs = 0,
  skipFirstMount = false,
  merge = false,
  onSaved,
  restore,
  onRestoreError,
}: UseDraftFormOptions) {
  const didMount = useRef(false)
  const restoredRef = useRef(false)

  // ── Restore-on-mount ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || !key || !restore || restoredRef.current) return
    restoredRef.current = true
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return
      restore(JSON.parse(raw) as Record<string, unknown>)
    } catch {
      onRestoreError?.()
    }
    // Restore runs once; intentionally not re-run when callbacks change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key])

  // ── Autosave ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || !key) return
    if (skipFirstMount && !didMount.current) { didMount.current = true; return }

    const data = collect()
    const write = () => {
      try {
        if (merge) {
          const prev = JSON.parse(localStorage.getItem(key) || '{}') as Record<string, unknown>
          localStorage.setItem(key, JSON.stringify({ ...prev, ...(data as Record<string, unknown>) }))
        } else {
          localStorage.setItem(key, JSON.stringify(data))
        }
        onSaved?.()
      } catch { /* ignore storage errors */ }
    }

    if (debounceMs > 0) {
      const timer = setTimeout(write, debounceMs)
      return () => clearTimeout(timer)
    }
    write()
    // The caller's `deps` are the real triggers; `enabled`/`key` gate the hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key, ...deps])
}
