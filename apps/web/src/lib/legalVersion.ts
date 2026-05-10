// Helpers for comparing the user's consented legal version against the
// platform's current legal version. Used by ConsentGate and the /consent
// page to decide whether to force a re-consent flow when the legal copy
// has been updated (e.g. v3.1 → v3.2 added §11 Refunds & Chargebacks).
//
// Storage shapes that this module reconciles:
//   profiles.consent_version          → "v2.1" or "v2.0-en" (with optional language suffix)
//   system_config.legal_version       → "3.2" (no v prefix)
//   consent_versions.version          → "v2.0-en" (with language suffix)
//
// We compare on the major+minor portion only, normalised with a "v" prefix.
//
// CACHE: legal_version is fetched once per session and cached in
// localStorage so we don't hit Supabase on every protected route render.

import { supabase } from './supabase'

const CACHE_KEY = 'dnj-legal-version-v1'
const CACHE_TTL_MS = 5 * 60 * 1000  // 5 minutes — short enough that a hotfix bump propagates within one session.

interface CacheEntry {
  value: string
  fetchedAt: number
}

/** Strip language suffix (-en, -ms, -zh) and ensure 'v' prefix. */
export function normaliseLegalVersion(raw: string | null | undefined): string | null {
  if (!raw) return null
  const stripped = String(raw).replace(/-(?:en|ms|zh)$/i, '').trim()
  if (!stripped) return null
  return stripped.startsWith('v') ? stripped : `v${stripped}`
}

/**
 * Fetch the platform's current legal_version from system_config. Cached in
 * localStorage for 5min. Returns the normalised "v<x.y>" string, or null
 * if the config row is missing.
 */
export async function getCurrentLegalVersion(): Promise<string | null> {
  try {
    const cached = localStorage.getItem(CACHE_KEY)
    if (cached) {
      const parsed = JSON.parse(cached) as CacheEntry
      if (Date.now() - parsed.fetchedAt < CACHE_TTL_MS) return parsed.value
    }
  } catch { /* tolerate parse errors */ }

  const { data, error } = await supabase
    .from('system_config')
    .select('value')
    .eq('key', 'legal_version')
    .single()
  if (error || !data) return null

  const raw = (data.value as unknown) as string | { value?: string } | null
  // system_config.value is jsonb — can be a quoted string "3.2" or a wrapped object.
  const rawStr = typeof raw === 'string' ? raw : (raw && typeof raw === 'object' && typeof raw.value === 'string') ? raw.value : null
  const normalised = normaliseLegalVersion(rawStr)
  if (!normalised) return null

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ value: normalised, fetchedAt: Date.now() } satisfies CacheEntry))
  } catch { /* tolerate quota errors */ }
  return normalised
}

/** True if the user's consent_version is at or above the current legal_version. */
export function consentSatisfiesVersion(consentVersion: string | null | undefined, currentLegal: string | null): boolean {
  if (!currentLegal) return true  // can't compare → fail open (don't block users on a config blip)
  const userV = normaliseLegalVersion(consentVersion)
  if (!userV) return false
  return userV === currentLegal
}

/** Clear the cache (used after a successful re-consent). */
export function clearLegalVersionCache(): void {
  try { localStorage.removeItem(CACHE_KEY) } catch { /* tolerate */ }
}
