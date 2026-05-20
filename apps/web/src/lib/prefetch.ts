/**
 * Idle-time prefetch of the route chunk a user is most likely to navigate to
 * next, based on their current role. The chunks are already code-split via
 * `lazy(() => import(...))` in App.tsx — we just trigger that dynamic import
 * during browser idle so the network and parse happen before the user clicks.
 *
 * Why: lazy() chunks are fetched on first navigation. That's correct for cold
 * boot (smaller initial JS) but means the *first* dashboard click after login
 * waits for a network round-trip. Prefetching during the post-login idle window
 * cuts that wait to zero — by the time the user clicks "Dashboard", the chunk
 * is already parsed and ready.
 *
 * Uses `requestIdleCallback` with a 4s timeout fallback. Vite/Rollup handles
 * the actual chunk fetch via dynamic import — no magic comment needed.
 *
 * Safe to call multiple times: native dynamic imports dedupe by module URL.
 */

type Role = 'talent' | 'hiring_manager' | 'hr_admin' | 'admin' | 'restaurant_staff' | string

const ric = (cb: () => void): number => {
  const w = window as unknown as {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
  }
  if (w.requestIdleCallback) return w.requestIdleCallback(cb, { timeout: 4000 })
  return window.setTimeout(cb, 1500)
}

let prefetched = false

/**
 * Trigger prefetch of the user's likely-next-route chunk. Called once the
 * session is hydrated; no-op on subsequent calls in the same tab.
 */
export function prefetchRoleHome(role: Role | null | undefined) {
  if (prefetched || !role) return
  prefetched = true

  ric(() => {
    try {
      switch (role) {
        case 'talent':
          void import('../routes/dashboard/TalentDashboard')
          void import('../routes/dashboard/TalentProfile')
          break
        case 'hiring_manager':
          void import('../routes/dashboard/HMDashboard')
          void import('../routes/dashboard/MyRoles')
          break
        case 'hr_admin':
          void import('../routes/dashboard/HRDashboard')
          break
        case 'admin':
          void import('../routes/dashboard/AdminDashboard')
          break
        default:
          // unknown role — skip
          break
      }
    } catch {
      // Prefetch is best-effort; never throw into the idle callback.
    }
  })
}
