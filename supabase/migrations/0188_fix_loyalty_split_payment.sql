-- ============================================================================
-- 0188_fix_loyalty_split_payment.sql
--
-- P1 FIX — Restaurant loyalty points multiplied on split / partial payments.
--
-- WHAT WAS WRONG
--   restaurant.tg_payment_completed_award_points() (fired by trigger
--   tg_payment_award_points, AFTER INSERT OR UPDATE ON restaurant.payment,
--   FOR EACH ROW) awarded points based on the ORDER total for EVERY payment
--   row that reached status='completed':
--
--       select total ... into v_order_total from restaurant.orders ...
--       update restaurant.membership
--         set points = points + floor(v_order_total * v_per_rm)::int ...
--
--   An order settled in N installments (split bill / partial payments) inserts
--   N completed payment rows, so the member was credited N x floor(total*rate)
--   instead of floor(total*rate). Full-amount single payments happened to be
--   correct; only split/partial payments over-credited.
--
-- THE EXACT FIX
--   Award points for the PAYMENT ROW'S OWN amount, not the order total:
--       floor(NEW.amount * v_per_rm)
--   Summed across N split rows this equals floor of the paid total (modulo the
--   intended per-row rounding), never N times it.
--
--   Idempotency per payment row is preserved by the existing edge-guard: points
--   are credited ONLY on the transition INTO 'completed'
--   (tg_op='INSERT' OR old.status IS DISTINCT FROM 'completed'), so re-saving an
--   already-completed row (receipt edit, unrelated column update) never
--   re-credits.
--
--   New refund branch: on an UPDATE that flips a previously-completed row to
--   status='refunded', debit floor(OLD.amount * v_per_rm) — reversing exactly
--   what that row credited. Guarded on old.status='completed' so a refund of a
--   row that never credited (e.g. pending -> refunded) does not debit phantom
--   points, and the completed->refunded transition makes a refunded->refunded
--   re-save a no-op.
--
-- WHAT IS PRESERVED (unchanged behavior)
--   * Same trigger (tg_payment_award_points), same timing (AFTER INSERT OR
--     UPDATE), same firing rows — only the function body is replaced.
--   * Same crediting mechanism: UPDATE restaurant.membership SET points = ...
--   * Same rate/config source: v_per_rm numeric := 0.1  (1 point / RM10).
--   * Same membership resolution: membership_id read from restaurant.orders
--     (payment carries no membership_id).
--   * SECURITY DEFINER + search_path = restaurant, public unchanged.
--
-- WHY IT IS SAFE
--   * Additive/forward-only: replaces one function body in place; no schema
--     change, no data backfill, no historical rewrite. Points already granted
--     before this deploy are untouched (this fixes future awards only).
--   * No new column/table: idempotency comes from the status-transition guard
--     that already existed, so there is no recursion risk and nothing to
--     migrate.
--   * membership.points has no non-negative CHECK (verified on prod), so a
--     refund debit cannot violate a constraint; it mirrors the credit exactly.
--   * Fully transactional and re-runnable (CREATE OR REPLACE FUNCTION).
--
-- ROLLBACK (restore prior — buggy — behavior)
--   BEGIN;
--   CREATE OR REPLACE FUNCTION restaurant.tg_payment_completed_award_points()
--   RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
--   SET search_path = restaurant, public AS $rb$
--   declare
--     v_order_total numeric;
--     v_membership_id uuid;
--     v_per_rm numeric := 0.1;
--   begin
--     if new.status = 'completed'
--        and (tg_op = 'INSERT' or old.status is distinct from 'completed') then
--       select total, membership_id into v_order_total, v_membership_id
--       from restaurant.orders where id = new.order_id;
--       if v_membership_id is not null and v_order_total > 0 then
--         update restaurant.membership
--           set points = points + floor(v_order_total * v_per_rm)::int
--           where id = v_membership_id;
--       end if;
--     end if;
--     return new;
--   end;
--   $rb$;
--   COMMIT;
-- ============================================================================

begin;

create or replace function restaurant.tg_payment_completed_award_points()
returns trigger
language plpgsql
security definer
set search_path = restaurant, public
as $$
declare
  v_membership_id uuid;
  v_per_rm numeric := 0.1; -- 1 point per RM10 = 0.1 per RM1 (unchanged rate/config)
  v_points int;
begin
  -- CREDIT: only on the transition INTO 'completed' (insert-as-completed or a
  -- status flip). Award proportional to THIS payment row's amount, not the
  -- order total, so split/partial payments no longer multiply the award.
  if new.status = 'completed'
     and (tg_op = 'INSERT' or old.status is distinct from 'completed') then
    select membership_id into v_membership_id
    from restaurant.orders where id = new.order_id;
    if v_membership_id is not null then
      v_points := floor(new.amount * v_per_rm)::int;
      if v_points <> 0 then
        update restaurant.membership
          set points = points + v_points
          where id = v_membership_id;
      end if;
    end if;

  -- REFUND: reverse exactly what this row credited, only when a previously
  -- completed row is refunded (guards against debiting rows that never
  -- credited, and against refunded->refunded re-saves).
  elsif tg_op = 'UPDATE'
        and new.status = 'refunded'
        and old.status = 'completed' then
    select membership_id into v_membership_id
    from restaurant.orders where id = new.order_id;
    if v_membership_id is not null then
      v_points := floor(old.amount * v_per_rm)::int;
      if v_points <> 0 then
        update restaurant.membership
          set points = points - v_points
          where id = v_membership_id;
      end if;
    end if;
  end if;

  return new;
end;
$$;

-- Trigger already binds to this function (AFTER INSERT OR UPDATE); CREATE OR
-- REPLACE keeps the binding, so no trigger change is required. Re-asserted here
-- idempotently for self-containment.
drop trigger if exists tg_payment_award_points on restaurant.payment;
create trigger tg_payment_award_points
  after insert or update on restaurant.payment
  for each row execute function restaurant.tg_payment_completed_award_points();

commit;