-- ============================================================
-- 0170 — Reconcile the denormalized profiles.points counter to the
--        point_transactions ledger.
--
-- profiles.points is a cached running balance maintained by award_points
-- (0056/0147:48): `set points = greatest(0, points + p_delta)`. That floor
-- at 0 is intentional (a balance must never go negative), but it makes the
-- counter LOSSY: when a delta would push the balance below 0 the counter
-- clamps to 0 while the point_transactions row still records the full
-- (negative-capable) delta. After such an event the cached counter can sit
-- ABOVE the true ledger sum, and the two drift apart permanently.
--
-- This one-shot resets every profile's counter to the clamped ledger sum:
--   profiles.points = greatest(0, coalesce(SUM(pt.delta), 0))
-- keyed on pt.user_id = profiles.id (point_transactions.user_id and
-- profiles.id are both the auth user id — see 0021:159 / 0056:63).
--
-- Idempotent + safe to re-run: it only writes rows whose cached counter
-- actually differs from the (clamped) ledger sum, so a second run is a no-op.
-- It does NOT change award_points behavior — the greatest(0, ...) floor in
-- the live path is deliberately preserved; this migration only repairs the
-- already-accumulated drift it produced.
--
-- NOTE: cannot be gated locally (Docker / local Supabase is down in this
-- worktree). Reviewed for idempotency + type-correctness by hand; the central
-- migrate step + CI run the actual apply.
-- ============================================================

update public.profiles p
   set points = greatest(0, coalesce(s.total, 0))
  from (
    select user_id, sum(delta)::int as total
      from public.point_transactions
     group by user_id
  ) s
 where s.user_id = p.id
   and p.points is distinct from greatest(0, coalesce(s.total, 0));

-- Profiles with no ledger rows at all but a non-zero cached counter would not
-- be touched by the join above (no matching aggregate row). Reconcile those to
-- 0 as well — their true ledger balance is 0.
update public.profiles p
   set points = 0
 where p.points <> 0
   and not exists (
     select 1 from public.point_transactions pt
      where pt.user_id = p.id
   );

-- Document the intended invariant for future readers:
--   profiles.points == greatest(0, SUM(point_transactions.delta WHERE user_id = id))
-- award_points (0147) keeps this true going forward except when a delta is
-- floored at 0; re-running this migration re-establishes it.
comment on column public.profiles.points is
  'Cached point balance. Invariant: = greatest(0, SUM(point_transactions.delta) for this user). Maintained incrementally by award_points (0147); reconciled one-shot by migration 0170.';
