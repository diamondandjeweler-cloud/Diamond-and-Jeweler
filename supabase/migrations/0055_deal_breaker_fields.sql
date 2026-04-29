-- ════════════════════════════════════════════════════════════════════════════
-- Migration 0055 — Structured role deal-breaker fields
--
-- Adds hard-requirement columns to roles so HM entries from PostRole (and
-- LLM-extracted from free-text "non-negotiables") can be matched against
-- talent deal_breakers JSONB in match-generate as hard filters.
--
-- Talent-side flags are stored in talents.deal_breakers JSONB (no schema
-- change needed — new keys are added at write time by extract-deal-breakers).
-- ════════════════════════════════════════════════════════════════════════════

alter table roles
  add column if not exists requires_travel      boolean not null default false,
  add column if not exists has_night_shifts      boolean not null default false,
  add column if not exists requires_own_car      boolean not null default false,
  add column if not exists requires_relocation   boolean not null default false,
  add column if not exists requires_overtime     boolean not null default false,
  add column if not exists is_commission_based   boolean not null default false;
