-- ============================================================
-- Restaurant Phase 4 — Order State Machine + Guest / Seat Model
-- Adds:
--   * order_status_history  (every status transition logged)
--   * validate_status_transition(from, to)  (FSM gate)
--   * tg_orders_status_log  (auto-log + enforce on UPDATE/INSERT)
--   * order_guest           (first-class per-seat guest entity)
--   * order_item.guest_id   (link line item to a specific guest)
-- Idempotent. All in restaurant.* schema.
-- ============================================================

-- ---------- Order status FSM ----------

create or replace function restaurant.validate_status_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select case
    when p_from is null      then p_to in ('active','sent')
    when p_from = p_to       then true
    when p_from = 'active'   then p_to in ('sent','voided','closed')
    when p_from = 'sent'     then p_to in ('partial','ready','served','voided','paid')
    when p_from = 'partial'  then p_to in ('ready','served','voided','paid')
    when p_from = 'ready'    then p_to in ('served','voided','paid')
    when p_from = 'served'   then p_to in ('paid','voided')
    when p_from = 'paid'     then p_to in ('closed')
    when p_from = 'closed'   then false
    when p_from = 'voided'   then false
    else false
  end;
$$;

create table if not exists restaurant.order_status_history (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references restaurant.orders(id) on delete cascade,
  from_status     text,
  to_status       text not null,
  by_employee_id  uuid references restaurant.employee(id) on delete set null,
  by_user_id      uuid references auth.users(id) on delete set null,
  reason          text,
  at              timestamptz not null default now()
);
create index if not exists idx_osh_order on restaurant.order_status_history(order_id, at desc);
create index if not exists idx_osh_to    on restaurant.order_status_history(to_status, at desc);

create or replace function restaurant.tg_orders_status_log()
returns trigger
language plpgsql
security definer
set search_path = restaurant, public
as $$
begin
  if tg_op = 'INSERT' then
    insert into restaurant.order_status_history (order_id, from_status, to_status)
    values (new.id, null, new.status);
    return new;
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    if not restaurant.validate_status_transition(old.status, new.status) then
      raise exception 'Illegal order status transition: % -> % (order %)',
        old.status, new.status, new.id
        using errcode = 'check_violation';
    end if;
    insert into restaurant.order_status_history (order_id, from_status, to_status)
    values (new.id, old.status, new.status);
    return new;
  end if;
  return new;
end;
$$;

drop trigger if exists tg_orders_status_log on restaurant.orders;
create trigger tg_orders_status_log
  after insert or update of status on restaurant.orders
  for each row execute function restaurant.tg_orders_status_log();

-- Backfill: seed history for any pre-existing rows with a single "initial" entry
insert into restaurant.order_status_history (order_id, from_status, to_status, at)
select o.id, null, o.status, o.created_at
from restaurant.orders o
left join restaurant.order_status_history h on h.order_id = o.id
where h.id is null;

-- ---------- Guest / Seat model ----------

create table if not exists restaurant.order_guest (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references restaurant.orders(id) on delete cascade,
  seat_no     int not null check (seat_no > 0),
  name        text,
  allergies   jsonb not null default '[]'::jsonb,
  vip         boolean not null default false,
  notes       text,
  created_at  timestamptz not null default now(),
  unique (order_id, seat_no)
);
create index if not exists idx_og_order on restaurant.order_guest(order_id);

-- Per-line-item guest link (nullable: existing items don't have to be assigned)
alter table restaurant.order_item
  add column if not exists guest_id uuid references restaurant.order_guest(id) on delete set null;
create index if not exists idx_oi_guest on restaurant.order_item(guest_id);

-- Helper: upsert a seat number on an order (auto-create guest row if missing)
create or replace function restaurant.ensure_order_guest(p_order_id uuid, p_seat_no int)
returns uuid
language plpgsql
security definer
set search_path = restaurant, public
as $$
declare
  v_id uuid;
begin
  select id into v_id from restaurant.order_guest
    where order_id = p_order_id and seat_no = p_seat_no;
  if v_id is null then
    insert into restaurant.order_guest (order_id, seat_no)
    values (p_order_id, p_seat_no)
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

-- Helper: split-by-seat subtotal view (rows where guest_id is null = unassigned items)
create or replace view restaurant.v_order_seat_totals as
select
  oi.order_id,
  og.id      as guest_id,
  og.seat_no as seat_no,
  count(oi.id) as item_count,
  sum(oi.unit_price * oi.quantity + coalesce(oi.modifiers_total, 0)) as subtotal
from restaurant.order_item oi
left join restaurant.order_guest og on og.id = oi.guest_id
where oi.status not in ('voided','rejected')
group by oi.order_id, og.id, og.seat_no;

-- ---------- RLS for newly-added tables ----------

do $$
declare r record;
begin
  for r in
    select tablename from pg_tables
    where schemaname = 'restaurant'
      and tablename in ('order_status_history','order_guest')
  loop
    execute format('alter table restaurant.%I enable row level security', r.tablename);
    -- Drop+create to be idempotent across re-runs
    execute format('drop policy if exists rst_all_authenticated on restaurant.%I', r.tablename);
    execute format($p$
      create policy rst_all_authenticated on restaurant.%I
        for all
        using (auth.role() = 'authenticated')
        with check (auth.role() = 'authenticated')
    $p$, r.tablename);
  end loop;
end $$;

-- Privileges for new objects
grant all on restaurant.order_status_history to authenticated;
grant all on restaurant.order_guest to authenticated;
grant select on restaurant.v_order_seat_totals to authenticated;
