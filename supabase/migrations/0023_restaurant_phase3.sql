-- ============================================================
-- Restaurant Phase 3 — Production-blockers + service polish + analytics
-- Sprint 1: atomic ops, stock auto-deduction, manager-PIN gate, menu availability
-- Sprint 2: section assignment, tip pool, SMS reminders, table merge/transfer
-- Sprint 3: BOGO evaluators, multi-branch global menu, schedule, payroll
-- ============================================================
-- Idempotent. All in restaurant.* schema.

-- ---------- Schema additions ----------

-- Tip pool / payment refinements
alter table restaurant.payment
  add column if not exists tip_amount numeric(10,2) not null default 0;

-- Course pacing timer marks
alter table restaurant.course_firing
  add column if not exists pacing_alert_sent_at timestamptz;

-- Multi-branch employee assignment (single employee → many branches)
create table if not exists restaurant.employee_branch (
  employee_id uuid not null references restaurant.employee(id) on delete cascade,
  branch_id   uuid not null references restaurant.branch(id) on delete cascade,
  is_primary  boolean not null default false,
  primary key (employee_id, branch_id)
);

-- Worker schedule
create table if not exists restaurant.shift_schedule (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references restaurant.employee(id) on delete cascade,
  branch_id   uuid not null references restaurant.branch(id) on delete cascade,
  shift_start timestamptz not null,
  shift_end   timestamptz not null,
  section_id  uuid references restaurant.section(id) on delete set null,
  notes       text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_sched_emp on restaurant.shift_schedule(employee_id, shift_start);

-- Manager approvals for sensitive ops
create table if not exists restaurant.manager_approval (
  id          uuid primary key default gen_random_uuid(),
  branch_id   uuid not null references restaurant.branch(id) on delete cascade,
  manager_id  uuid not null references restaurant.employee(id) on delete restrict,
  action      text not null check (action in (
                 'void_item','refund','discount_override','shift_variance','price_change','time_edit','remake')),
  entity_type text,
  entity_id   uuid,
  reason      text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_mgr_appr on restaurant.manager_approval(action, created_at);

-- Tax rate per branch (drives tax report)
alter table restaurant.branch
  add column if not exists default_tax_rate numeric(5,4) not null default 0.06;

-- Menu sync — branch_id NULL means "global menu" overridable per-branch
alter table restaurant.menu_item
  alter column branch_id drop not null;

-- Section auto-assign metadata
alter table restaurant.section
  add column if not exists auto_assign boolean not null default true;

-- Membership cross-branch optional pool
alter table restaurant.membership
  alter column branch_id drop not null;

-- Reservation reminder bookkeeping
alter table restaurant.reservation
  add column if not exists reminder_at timestamptz;

-- ---------- Helper: which menu items are currently available (stock-wise) ----------

create or replace function restaurant.menu_item_in_stock(p_menu_item_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = restaurant, public
as $$
declare
  short_count int := 0;
begin
  select count(*) into short_count
  from restaurant.recipe r
  join restaurant.ingredient ing on ing.id = r.ingredient_id
  where r.menu_item_id = p_menu_item_id
    and (ing.current_stock < r.quantity or coalesce(ing.is_active, true) = false);
  return short_count = 0;
end;
$$;

-- ---------- Atomic order placement ----------

create or replace function restaurant.place_order_atomic(
  p_branch_id uuid,
  p_table_id uuid,
  p_order_type text,
  p_customer_name text,
  p_customer_phone text,
  p_membership_id uuid,
  p_items jsonb,        -- [{ menu_item_id, quantity, unit_price, modifiers_total, modifier_ids, special_instruction, course_type }]
  p_subtotal numeric,
  p_discount numeric,
  p_tax numeric,
  p_total numeric
)
returns uuid
language plpgsql
security definer
set search_path = restaurant, public
as $$
declare
  v_order_id uuid;
  v_item     jsonb;
  v_item_id  uuid;
  v_ingredient_short text;
begin
  -- Insert order
  insert into restaurant.orders (
    branch_id, table_id, order_type, customer_name, customer_phone,
    membership_id, status, subtotal, discount, tax, total
  ) values (
    p_branch_id, p_table_id, p_order_type, p_customer_name, p_customer_phone,
    p_membership_id, 'sent', p_subtotal, p_discount, p_tax, p_total
  ) returning id into v_order_id;

  -- Pre-flight stock check across all items + their recipes
  select string_agg(ing.name, ', ') into v_ingredient_short
  from jsonb_array_elements(p_items) it
  join restaurant.recipe r on r.menu_item_id = (it->>'menu_item_id')::uuid
  join restaurant.ingredient ing on ing.id = r.ingredient_id
  group by ing.id, ing.name, ing.current_stock
  having sum(r.quantity * (it->>'quantity')::int) > min(ing.current_stock);
  if v_ingredient_short is not null then
    raise exception 'Insufficient stock: %', v_ingredient_short;
  end if;

  -- Insert items + tickets
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into restaurant.order_item (
      order_id, menu_item_id, quantity, unit_price, modifier_ids, modifiers_total,
      special_instruction, course_type, status
    ) values (
      v_order_id,
      (v_item->>'menu_item_id')::uuid,
      coalesce((v_item->>'quantity')::int, 1),
      (v_item->>'unit_price')::numeric,
      coalesce(v_item->'modifier_ids', '[]'::jsonb),
      coalesce((v_item->>'modifiers_total')::numeric, 0),
      v_item->>'special_instruction',
      coalesce(v_item->>'course_type', 'any'),
      case when coalesce(v_item->>'course_type','any') in ('main','dessert') and p_order_type = 'dinein'
           then 'held' else 'fired' end
    ) returning id into v_item_id;

    -- Create kitchen ticket per item, station from menu_item
    insert into restaurant.kitchen_ticket (branch_id, order_id, order_item_id, station, status)
    select p_branch_id, v_order_id, v_item_id, coalesce(mi.station, 'kitchen'),
           case when coalesce(v_item->>'course_type','any') in ('main','dessert') and p_order_type = 'dinein'
                then 'pending' else 'pending' end
    from restaurant.menu_item mi where mi.id = (v_item->>'menu_item_id')::uuid;
  end loop;

  -- Mark table as occupied
  if p_table_id is not null then
    update restaurant.restaurant_table set status = 'occupied', last_status_change = now()
      where id = p_table_id and status in ('free','reserved','cleaning');
  end if;

  return v_order_id;
end;
$$;

-- ---------- Auto-deduct stock when ticket completes ----------

create or replace function restaurant.tg_ticket_completed_deduct_stock()
returns trigger
language plpgsql
security definer
set search_path = restaurant, public
as $$
declare
  v_order_branch uuid;
  rec record;
begin
  if new.status = 'completed' and (old.status is distinct from 'completed') then
    select branch_id into v_order_branch from restaurant.orders where id = new.order_id;
    -- Walk the recipe and deduct each ingredient
    for rec in
      select r.ingredient_id, r.quantity * coalesce(oi.quantity, 1) as qty, ing.cost_per_unit
      from restaurant.order_item oi
      join restaurant.recipe r on r.menu_item_id = oi.menu_item_id
      join restaurant.ingredient ing on ing.id = r.ingredient_id
      where oi.id = new.order_item_id
    loop
      update restaurant.ingredient
        set current_stock = current_stock - rec.qty, updated_at = now()
        where id = rec.ingredient_id;
      insert into restaurant.inventory_transaction (
        branch_id, ingredient_id, quantity, type, unit_cost, reference_order_id
      ) values (
        v_order_branch, rec.ingredient_id, -rec.qty, 'sale', rec.cost_per_unit, new.order_id
      );
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists tg_ticket_complete_deduct on restaurant.kitchen_ticket;
create trigger tg_ticket_complete_deduct
  after update on restaurant.kitchen_ticket
  for each row
  when (new.status = 'completed')
  execute function restaurant.tg_ticket_completed_deduct_stock();

-- ---------- Manager PIN check (used by void/refund/discount-override) ----------

create or replace function restaurant.verify_manager_pin(p_branch_id uuid, p_pin text)
returns uuid
language plpgsql
security definer
set search_path = restaurant, public
as $$
declare
  v_emp_id uuid;
begin
  select id into v_emp_id
  from restaurant.employee
  where branch_id = p_branch_id
    and pin = p_pin
    and role in ('shift_manager','admin','owner')
    and is_active = true
  limit 1;
  return v_emp_id;
end;
$$;

-- ---------- Loyalty auto-earn on payment ----------

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
  if new.status = 'completed' and (old.status is distinct from 'completed') then
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
  after update on restaurant.payment
  for each row execute function restaurant.tg_payment_completed_award_points();

-- ---------- BOGO / combo / birthday promo evaluator ----------
-- Returns the discount amount that should apply to a cart.

create or replace function restaurant.evaluate_promotion(
  p_promotion_id uuid,
  p_cart jsonb,         -- [{ menu_item_id, quantity, unit_price }]
  p_subtotal numeric,
  p_membership_id uuid,
  p_table_area text default null
)
returns numeric
language plpgsql
stable
security definer
set search_path = restaurant, public
as $$
declare
  p record;
  v_discount numeric := 0;
  v_min_spend numeric;
  v_pct numeric;
  v_amt numeric;
  v_now timestamptz := now();
  v_local time := (now() at time zone 'Asia/Kuala_Lumpur')::time;
  v_st time;
  v_et time;
  v_member_birthday date;
begin
  select promotion.* into p from restaurant.promotion where id = p_promotion_id and is_active = true;
  if not found then return 0; end if;
  if p.start_date is not null and v_now < p.start_date then return 0; end if;
  if p.end_date   is not null and v_now > p.end_date   then return 0; end if;
  if p.usage_limit is not null and p.usage_count >= p.usage_limit then return 0; end if;

  v_min_spend := coalesce((p.rule_json->>'min_spend')::numeric, 0);
  if p_subtotal < v_min_spend then return 0; end if;
  v_pct := coalesce((p.rule_json->>'discount_pct')::numeric, 0);
  v_amt := coalesce((p.rule_json->>'discount_amount')::numeric, 0);

  if p.type = 'time_based' then
    v_st := coalesce((p.rule_json->>'start_time')::time, '00:00'::time);
    v_et := coalesce((p.rule_json->>'end_time')::time,   '23:59'::time);
    if v_local between v_st and v_et then
      v_discount := v_amt + p_subtotal * v_pct / 100.0;
    end if;
  elsif p.type in ('coupon','percent_off','flat_off') then
    v_discount := v_amt + p_subtotal * v_pct / 100.0;
  elsif p.type = 'membership' and p_membership_id is not null then
    v_discount := v_amt + p_subtotal * v_pct / 100.0;
  elsif p.type = 'table_area' and p_table_area is not null
        and p_table_area = (p.rule_json->>'area') then
    v_discount := v_amt + p_subtotal * v_pct / 100.0;
  elsif p.type = 'bogo' then
    -- Buy one get one free on cart-line with quantity >= 2
    select coalesce(sum(floor((it->>'quantity')::int / 2.0) * (it->>'unit_price')::numeric), 0)
      into v_discount
      from jsonb_array_elements(p_cart) it
      where (p.rule_json->>'menu_item_id') is null
         or it->>'menu_item_id' = p.rule_json->>'menu_item_id';
  elsif p.type = 'combo' then
    -- Flat discount when cart contains all menu_item_ids in rule_json->'items'
    if (select bool_and(exists (
          select 1 from jsonb_array_elements(p_cart) c
          where c->>'menu_item_id' = req
        )) from jsonb_array_elements_text(p.rule_json->'items') req) then
      v_discount := v_amt;
    end if;
  end if;

  -- Birthday boost
  if p_membership_id is not null then
    select birthday into v_member_birthday from restaurant.membership where id = p_membership_id;
    if v_member_birthday is not null
       and extract(month from v_member_birthday) = extract(month from v_now)
       and extract(day   from v_member_birthday) = extract(day   from v_now) then
      v_discount := greatest(v_discount, p_subtotal * 0.10); -- 10% on birthday
    end if;
  end if;

  return greatest(0, least(p_subtotal, v_discount));
end;
$$;

-- ---------- Tax report view ----------

create or replace view restaurant.v_tax_report as
select
  o.branch_id,
  date_trunc('day', o.created_at) as period_day,
  sum(o.subtotal) as gross_sales,
  sum(o.discount) as discounts,
  sum(o.tax)      as tax_collected,
  sum(o.total)    as net_sales,
  count(*)        as orders_count
from restaurant.orders o
where o.status in ('paid','closed')
group by o.branch_id, date_trunc('day', o.created_at);

-- ---------- Pacing timer alert: emit notification if held > 15 min ----------

create or replace function restaurant.find_pacing_breaches(p_branch_id uuid)
returns table (order_id uuid, course_type text, held_minutes int)
language sql
stable
as $$
  select o.id,
         oi.course_type,
         extract(epoch from (now() - o.created_at))::int / 60
  from restaurant.orders o
  join restaurant.order_item oi on oi.order_id = o.id
  where o.branch_id = p_branch_id
    and o.status in ('active','sent','partial')
    and oi.status = 'held'
    and extract(epoch from (now() - o.created_at)) > 15 * 60;
$$;
