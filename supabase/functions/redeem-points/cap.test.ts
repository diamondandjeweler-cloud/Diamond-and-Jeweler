/**
 * redeem-points — extra-match cap clamp tests (finding money-4)
 *
 * Run in CI's edge-tests job: deno test --allow-all --no-check supabase/functions/
 * Hermetic — no network, no DB, no secrets (only std/assert).
 *
 * REGRESSION GUARD (money-4): the app read the quota cap straight from
 * system_config (`cap = capCfg.value`), while the DB CHECK hard-caps
 * extra_matches_used at 3 (migration 0018). Raising the config above 3 let a 4th
 * redemption pass the `used >= cap` gate, deduct points, then blow the DB CHECK
 * (swallowed 23514) — a charged-but-uncounted state. effectiveExtraMatchCap()
 * clamps the config to the DB cap. These assertions FAIL against the old
 * `cap = capCfg.value` behavior and PASS against the clamp.
 */
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { DB_EXTRA_MATCH_CAP, effectiveExtraMatchCap } from './cap.ts'

Deno.test('DB cap constant matches the migration 0018 CHECK (0..3)', () => {
  assertEquals(DB_EXTRA_MATCH_CAP, 3)
})

Deno.test('a config ABOVE the DB cap is clamped down to 3 (closes the swallowed-violation hole)', () => {
  assertEquals(effectiveExtraMatchCap(5), 3)
  assertEquals(effectiveExtraMatchCap(4), 3)
  assertEquals(effectiveExtraMatchCap(100), 3)
})

Deno.test('a config at or below the DB cap is honored as-is', () => {
  assertEquals(effectiveExtraMatchCap(3), 3)
  assertEquals(effectiveExtraMatchCap(2), 2)
  assertEquals(effectiveExtraMatchCap(1), 1)
  assertEquals(effectiveExtraMatchCap(0), 0)
})

Deno.test('a missing / non-numeric config falls back to the DB cap', () => {
  assertEquals(effectiveExtraMatchCap(undefined), 3)
  assertEquals(effectiveExtraMatchCap(null), 3)
  assertEquals(effectiveExtraMatchCap('5'), 3)
  assertEquals(effectiveExtraMatchCap(NaN), 3)
  assertEquals(effectiveExtraMatchCap({}), 3)
})

Deno.test('a negative config is floored to 0 (never negative)', () => {
  assertEquals(effectiveExtraMatchCap(-1), 0)
  assertEquals(effectiveExtraMatchCap(-100), 0)
})

Deno.test('the used>=cap gate now blocks a 4th redemption even when config was raised to 5', () => {
  // Mirror of index.ts: cap = effectiveExtraMatchCap(configValue); reject when used >= cap.
  const cap = effectiveExtraMatchCap(5) // admin raised config to 5
  const usedAt3 = 3
  const blocked = usedAt3 >= cap
  assertEquals(cap, 3)
  assertEquals(blocked, true) // a 4th redemption is now refused BEFORE any deduction
})
