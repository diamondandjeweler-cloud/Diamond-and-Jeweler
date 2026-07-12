/**
 * admin-force-match — availability/ban/expiry gate tests (finding matcher-2)
 *
 * Run in CI's edge-tests job: deno test --allow-all --no-check supabase/functions/
 * Hermetic — no network, no DB, no secrets (only std/assert).
 *
 * REGRESSION GUARD (matcher-2): the handler selected is_open_to_offers but never
 * consulted it, and never checked is_banned or profile_expires_at, so an admin
 * could surface a moderated-off / opted-out / expired talent to a hiring manager
 * — bypassing every gate the candidate pool (get_match_candidates §1) enforces.
 * evaluateForceMatchGate reinstates those gates. These assertions FAIL against
 * the old "no guard" behavior (which always inserted) and PASS against the gate.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { evaluateForceMatchGate } from './gate.ts'

const NOW = Date.parse('2026-07-13T00:00:00Z')
const FUTURE = '2026-12-31T00:00:00Z'
const PAST = '2026-01-01T00:00:00Z'

Deno.test('an available, non-banned, unexpired talent is allowed (no override)', () => {
  const r = evaluateForceMatchGate({
    isBanned: false, isOpenToOffers: true, profileExpiresAt: FUTURE, nowMs: NOW,
  })
  assertEquals(r.ok, true)
  assertEquals(r.overrode, false)
})

Deno.test('a BANNED talent is a HARD reject — override cannot bypass it', () => {
  const withoutOverride = evaluateForceMatchGate({
    isBanned: true, isOpenToOffers: true, profileExpiresAt: FUTURE, override: false, nowMs: NOW,
  })
  assertEquals(withoutOverride.ok, false)
  assertEquals(withoutOverride.status, 409)

  const withOverride = evaluateForceMatchGate({
    isBanned: true, isOpenToOffers: true, profileExpiresAt: FUTURE, override: true, nowMs: NOW,
  })
  assertEquals(withOverride.ok, false, 'ban must never be overridable')
  assertEquals(withOverride.status, 409)
})

Deno.test('an opted-OUT talent is rejected without override', () => {
  const r = evaluateForceMatchGate({
    isBanned: false, isOpenToOffers: false, profileExpiresAt: FUTURE, override: false, nowMs: NOW,
  })
  assertEquals(r.ok, false)
  assertEquals(r.status, 409)
})

Deno.test('an opted-OUT talent is allowed WITH override, flagged as overrode', () => {
  const r = evaluateForceMatchGate({
    isBanned: false, isOpenToOffers: false, profileExpiresAt: FUTURE, override: true, nowMs: NOW,
  })
  assertEquals(r.ok, true)
  assertEquals(r.overrode, true)
})

Deno.test('an EXPIRED profile is rejected without override, allowed with override', () => {
  const blocked = evaluateForceMatchGate({
    isBanned: false, isOpenToOffers: true, profileExpiresAt: PAST, override: false, nowMs: NOW,
  })
  assertEquals(blocked.ok, false)
  assertEquals(blocked.status, 409)

  const allowed = evaluateForceMatchGate({
    isBanned: false, isOpenToOffers: true, profileExpiresAt: PAST, override: true, nowMs: NOW,
  })
  assertEquals(allowed.ok, true)
  assertEquals(allowed.overrode, true)
})

Deno.test('null profile_expires_at is treated as non-expiring (matches pool §1)', () => {
  const r = evaluateForceMatchGate({
    isBanned: false, isOpenToOffers: true, profileExpiresAt: null, nowMs: NOW,
  })
  assertEquals(r.ok, true)
  assertEquals(r.overrode, false)
})

Deno.test('null/undefined is_banned is not treated as banned', () => {
  assertEquals(
    evaluateForceMatchGate({ isBanned: null, isOpenToOffers: true, profileExpiresAt: FUTURE, nowMs: NOW }).ok,
    true,
  )
  assertEquals(
    evaluateForceMatchGate({ isOpenToOffers: true, profileExpiresAt: FUTURE, nowMs: NOW }).ok,
    true,
  )
})
