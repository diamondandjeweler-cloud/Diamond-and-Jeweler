/**
 * _shared/idempotency — key-scoping + non-2xx-skip tests (finding edge-infra-1)
 *
 * Run in CI's edge-tests job: deno test --allow-all --no-check supabase/functions/
 * Hermetic — no network, no DB, no secrets (only std/assert).
 *
 * REGRESSION GUARD (edge-infra-1): request_dedup's PK and the replay read were
 * keyed on the client `key` ALONE, so two callers (or two endpoints) presenting
 * the same Idempotency-Key collided and the second was served the first's stored
 * response (e.g. caller B gets caller A's live Billplz payment link). And a
 * non-2xx result was cached and replayed for 24h, so a keyed retry could never
 * recover. effectiveDedupKey namespaces by endpoint+user; isPersistableResult
 * gates caching to 2xx.
 */
import { assert, assertEquals, assertNotEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { effectiveDedupKey, isPersistableResult } from './idempotency.ts'

// ── effectiveDedupKey ────────────────────────────────────────────────────────

Deno.test('same client key, DIFFERENT users → different row keys (no cross-tenant replay)', () => {
  const a = effectiveDedupKey('buy-points', 'user-A', 'K')
  const b = effectiveDedupKey('buy-points', 'user-B', 'K')
  assertNotEquals(a, b)
})

Deno.test('same client key + user, DIFFERENT endpoints → different row keys (no cross-endpoint replay)', () => {
  const buy = effectiveDedupKey('buy-points', 'user-A', 'K')
  const redeem = effectiveDedupKey('redeem-points', 'user-A', 'K')
  assertNotEquals(buy, redeem)
})

Deno.test('same endpoint + user + client key → SAME row key (genuine retry still de-dupes)', () => {
  const first = effectiveDedupKey('buy-points', 'user-A', 'K')
  const retry = effectiveDedupKey('buy-points', 'user-A', 'K')
  assertEquals(first, retry)
})

Deno.test('null/undefined user is namespaced to a stable "anon" bucket, not merged with a real user', () => {
  assertEquals(effectiveDedupKey('buy-points', null, 'K'), 'buy-points:anon:K')
  assertEquals(effectiveDedupKey('buy-points', undefined, 'K'), 'buy-points:anon:K')
  assertNotEquals(effectiveDedupKey('buy-points', 'anon-real-id', 'K'), effectiveDedupKey('buy-points', null, 'K'))
})

// ── isPersistableResult ──────────────────────────────────────────────────────

Deno.test('a 2xx money-path result IS persistable', () => {
  assert(isPersistableResult({ _status: 200, _body: { ok: true } }))
  assert(isPersistableResult({ _status: 201, _body: {} }))
})

Deno.test('a non-2xx money-path result is NOT persistable (transient error not cached for 24h)', () => {
  assert(!isPersistableResult({ _status: 502, _body: { error: 'Billplz createBill failed' } }))
  assert(!isPersistableResult({ _status: 500, _body: {} }))
  assert(!isPersistableResult({ _status: 404, _body: {} }))
  assert(!isPersistableResult({ _status: 400, _body: {} }))
})

Deno.test('a result with no numeric _status persists as before (generic callers unaffected)', () => {
  assert(isPersistableResult({ ok: true }))
  assert(isPersistableResult({ _status: 'weird' }))
  assert(isPersistableResult(null))
})
