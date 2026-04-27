-- ============================================================
-- Phase 3 fix — loyalty trigger now fires on INSERT too.
-- The Cashier always inserts payments with status='completed',
-- but the original trigger was AFTER UPDATE only.
-- ============================================================

create or replace function restaurant.tg_payment_completed_award_points()
returns trigger
language plpgsql
security definer
set search_path = restaurant, public
as $$
declare
  v_order_total numeric;
  v_membership_id uuid;
  v_per_rm numeric := 0.1; -- 1 point per RM10 = 0.1 per RM1
begin
  -- Fire on INSERT-as-completed OR UPDATE flipping to completed.
  if new.status = 'completed'
     and (tg_op = 'INSERT' or old.status is distinct from 'completed') then
    select total, membership_id into v_order_total, v_membership_id
    from restaurant.orders where id = new.order_id;
    if v_membership_id is not null and v_order_total > 0 then
      update restaurant.membership
        set points = points + floor(v_order_total * v_per_rm)::int
        where id = v_membership_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists tg_payment_award_points on restaurant.payment;
create trigger tg_payment_award_points
  after insert or update on restaurant.payment
  for each row execute function restaurant.tg_payment_completed_award_points();
