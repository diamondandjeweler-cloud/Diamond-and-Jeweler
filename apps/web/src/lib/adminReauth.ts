// Tracks when the user last actively re-entered credentials. Used by
// AdminGate to force re-auth on the /admin route after a window of inactivity,
// even when Supabase has a persisted session in localStorage.

const STAMP_KEY = 'bole.admin.verified_at'
export const REAUTH_WINDOW_MS = 30 * 60 * 1000 // 30 minutes

export function markAdminVerified(): void {
  try { localStorage.setItem(STAMP_KEY, String(Date.now())) } catch { /* tolerate */ }
}

export function clearAdminVerified(): void {
  try { localStorage.removeItem(STAMP_KEY) } catch { /* tolerate */ }
}

export function isAdminVerificationFresh(): boolean {
  try {
    const raw = localStorage.getItem(STAMP_KEY)
    if (!raw) return false
    const at = Number(raw)
    if (!Number.isFinite(at)) return false
    return Date.now() - at < REAUTH_WINDOW_MS
  } catch {
    return false
  }
}
