-- ════════════════════════════════════════════════════════════════════════════
-- Migration 0054 — HM Quality Factor
--
-- Philosophy: outcomes are two-sided.
-- Good talent can look "bad" if they were matched to bad employers who:
--   • cancel interviews after inviting
--   • post roles with misleading JDs
--   • make offers that get rejected (salary bait-and-switch)
--   • create environments where hires quit early
--
-- This migration adds employer-side reliability metrics so match-generate
-- can apply an hm_quality_factor multiplier alongside the talent PHS
-- multiplier — making the scoring symmetric and fair.
--
-- Formula (computed in submit-feedback → recomputeHMQuality):
--   hm_quality_factor = 0.70 + 0.30 × composite
--   composite = reliability(0.30) + offer_accept_rate(0.25)
--             + retention_rate(0.30) + truthfulness(0.15)
--   reliability = 1.0 − hm_cancel_rate
--
-- 0.70 floor: new HMs default to 1.0 (no penalty until proven);
--             composite=0 worst case → 0.70 (never zeroes out a good talent).
-- ════════════════════════════════════════════════════════════════════════════

alter table hiring_managers
  add column if not exists hm_cancel_rate    float,   -- P(cancelled/ghosted after inviting talent)
  add column if not exists hm_offer_rate     float,   -- P(made offer after interview completed)
  add column if not exists hm_quality_factor float;   -- 0.70–1.00 composite (null = new HM, defaults to 1.0 in engine)
