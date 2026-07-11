-- ============================================================
-- 0192 — Reconcile the denormalized profiles.points counter to the
--        point_transactions ledger, replaying award_points' clamp semantics.
--
-- profiles.points is a cached running balance maintained by award_points
-- (0056/0147:48): `set points = greatest(0, points + p_delta)`. That floor
-- at 0 is intentional (a balance must never go negative), but it makes the
-- counter PATH-DEPENDENT: a naive greatest(0, SUM(delta)) reconcile is WRONG
-- for any user who was ever clamped and later re-credited.
--
--   Example: +100 buy, -80 spend (bal 20), -100 refund clawback (clamps to 0,
--   ledger sum -80), +50 new buy (bal 50, ledger sum -30).
--   greatest(0, SUM) = 0 would DESTROY the 50 legitimately purchased points.
--
-- The only faithful reconcile is to REPLAY the ledger per user in order,
-- applying the same clamped fold award_points applies incrementally:
--   bal := greatest(0, bal + delta)   for each row in created_at order.
-- This recomputes exactly what the counter would hold had award_points
-- processed every ledger row without ever crashing mid-write.
--
-- Idempotent + safe to re-run: the fold is deterministic (ordered by
-- created_at, then id for ties) and rows are only written when the cached
-- counter differs from the replayed balance. It does NOT change award_points
-- behavior; it only repairs already-accumulated drift.
-- ============================================================

do $$
declare
  u   record;
  r   record;
  bal integer;
begin
  for u in select distinct user_id from public.point_transactions loop
    bal := 0;
    for r in
      select delta
        from public.point_transactions
       where user_id = u.user_id
       order by created_at, id
    loop
      bal := greatest(0, bal + coalesce(r.delta, 0));
    end loop;

    update public.profiles p
       set points = bal
     where p.id = u.user_id
       and p.points is distinct from bal;
  end loop;
end $$;

-- Profiles with no ledger rows at all but a non-zero cached counter: their
-- true replayed balance is 0.
update public.profiles p
   set points = 0
 where p.points <> 0
   and not exists (
     select 1 from public.point_transactions pt
      where pt.user_id = p.id
   );

-- Document the intended invariant for future readers:
--   profiles.points == ordered clamped fold of point_transactions.delta
--   (bal := greatest(0, bal + delta), rows in created_at order)
-- award_points (0147) maintains this incrementally; re-running this migration
-- re-establishes it after any drift (e.g. crash between ledger write and
-- counter update).
comment on column public.profiles.points is
  'Cached point balance. Invariant: ordered clamped fold of point_transactions.delta (bal := greatest(0, bal + delta), created_at order). Maintained incrementally by award_points (0147); reconciled one-shot by migration 0192.';
