-- ============================================================
-- Restaurant Phase 4 — Scale layer: events + forecasting + offline
--   * event_store           (immutable event log; idempotent via idempotency_key)
--   * emit_event()          (insert helper, conflict-skip on idempotency_key)
--   * tg_emit_*             (auto-emit on orders / kitchen_ticket / payment / inventory_transaction)
--   * forecast_input        (per-day signals: weather, reservations, holiday)
--   * forecast_output       (per-day-per-item predicted_qty + confidence)
--   * sync_queue            (offline ops queue + conflict resolution surface)
--   * apply_sync_op()       (server-side apply; idempotent via client_op_id)
-- Idempotent. All in restaurant.* schema.
-- ============================================================

-- ---------- Event store ----------

create table if not exists restaurant.event_store (
  id                 uuid primary key default gen_random_uuid(),
  branch_id          uuid references restaurant.branch(id) on delete cascade,
  event_type         text not null,
  entity_type        text,
  entity_id          uuid,
  actor_user_id      uuid references auth.users(id) on delete set null,
  actor_employee_id  uuid references restaurant.employee(id) on delete set null,
  payload            jsonb not null default '{}'::jsonb,
  idempotency_key    text unique,
  created_at         timestamptz not null default now()
);
create index if not exists idx_es_branch_time on restaurant.event_store(branch_id, created_at desc);
create index if not exists idx_es_entity      on restaurant.event_store(entity_type, entity_id);
create index if not exists idx_es_type        on restaurant.event_store(event_type, created_at desc);

create or replace function restaurant.emit_event(
  p_branch_id        uuid,
  p_event_type       text,
  p_entity_type      text,
  p_entity_id        uuid,
  p_payload          jsonb default '{}'::jsonb,
  p_idempotency_key  text default null
) returns uuid
language plpgsql
security definer
set search_path = restaurant, public
as $$
declare
  v_id uuid;
begin
  insert into restaurant.event_store
    (branch_id, event_type, entity_type, entity_id, payload, idempotency_key)
  values
    (p_branch_id, p_event_type, p_entity_type, p_entity_id, p_payload, p_idempotency_key)
  on conflict (idempotency_key) do nothing
  returning id into v_id;
  return v_id;
end;
$$;

-- ----- order events -----
create or replace function restaurant.tg_emit_order_event()
returns trigger language plpgsql security definer set search_path = restaurant, public as $$
begin
  if tg_op = 'INSERT' then
    perform restaurant.emit_event(new.branch_id, 'OrderCreated', 'orders', new.id,
      jsonb_build_object('table_id', new.table_id, 'order_type', new.order_type, 'total', new.total));
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    perform restaurant.emit_event(new.branch_id, 'OrderStatusChanged', 'orders', new.id,
      jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  return new;
end;
$$;
drop trigger if exists tg_emit_order_event on restaurant.orders;
create trigger tg_emit_order_event
  after insert or update on restaurant.orders
  for each row execute function restaurant.tg_emit_order_event();

-- ----- kitchen_ticket events -----
create or replace function restaurant.tg_emit_ticket_event()
returns trigger language plpgsql security definer set search_path = restaurant, public as $$
begin
  if tg_op = 'INSERT' then
    perform restaurant.emit_event(new.branch_id, 'TicketCreated', 'kitchen_ticket', new.id,
      jsonb_build_object('order_id', new.order_id, 'station', new.station));
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    perform restaurant.emit_event(
      new.branch_id,
      case new.status
        when 'started'   then 'TicketStarted'
        when 'ready'     then 'TicketReady'
        when 'completed' then 'TicketCompleted'
        when 'rejected'  then 'TicketRejected'
        else 'TicketStatusChanged'
      end,
      'kitchen_ticket', new.id,
      jsonb_build_object('from', old.status, 'to', new.status, 'station', new.station));
  end if;
  return new;
end;
$$;
drop trigger if exists tg_emit_ticket_event on restaurant.kitchen_ticket;
create trigger tg_emit_ticket_event
  after insert or update on restaurant.kitchen_ticket
  for each row execute function restaurant.tg_emit_ticket_event();

-- ----- payment events -----
create or replace function restaurant.tg_emit_payment_event()
returns trigger language plpgsql security definer set search_path = restaurant, public as $$
declare v_branch uuid;
begin
  select branch_id into v_branch from restaurant.orders where id = new.order_id;
  if tg_op = 'INSERT' then
    perform restaurant.emit_event(v_branch, 'PaymentCreated', 'payment', new.id,
      jsonb_build_object('order_id', new.order_id, 'amount', new.amount, 'method', new.method));
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    perform restaurant.emit_event(v_branch, 'PaymentStatusChanged', 'payment', new.id,
      jsonb_build_object('from', old.status, 'to', new.status, 'amount', new.amount));
  end if;
  return new;
end;
$$;
drop trigger if exists tg_emit_payment_event on restaurant.payment;
create trigger tg_emit_payment_event
  after insert or update on restaurant.payment
  for each row execute function restaurant.tg_emit_payment_event();

-- ----- inventory events -----
create or replace function restaurant.tg_emit_inventory_event()
returns trigger language plpgsql security definer set search_path = restaurant, public as $$
begin
  perform restaurant.emit_event(new.branch_id, 'InventoryTxn', 'inventory_transaction', new.id,
    jsonb_build_object('ingredient_id', new.ingredient_id, 'quantity', new.quantity, 'type', new.type));
  return new;
end;
$$;
drop trigger if exists tg_emit_inventory_event on restaurant.inventory_transaction;
create trigger tg_emit_inventory_event
  after insert on restaurant.inventory_transaction
  for each row execute function restaurant.tg_emit_inventory_event();

-- ---------- Forecasting tables (population deferred to model worker) ----------

create table if not exists restaurant.forecast_input (
  id                  uuid primary key default gen_random_uuid(),
  branch_id           uuid not null references restaurant.branch(id) on delete cascade,
  date                date not null,
  day_of_week         int generated always as (extract(isodow from date)::int) stored,
  weather_code        text,
  reservations_count  int default 0,
  holiday_flag        boolean default false,
  notes               text,
  created_at          timestamptz not null default now(),
  unique (branch_id, date)
);
create index if not exists idx_fi_branch_date on restaurant.forecast_input(branch_id, date);

create table if not exists restaurant.forecast_output (
  id              uuid primary key default gen_random_uuid(),
  branch_id       uuid not null references restaurant.branch(id) on delete cascade,
  date            date not null,
  menu_item_id    uuid not null references restaurant.menu_item(id) on delete cascade,
  predicted_qty   numeric(10,2) not null,
  confidence      numeric(5,4),
  model_version   text,
  created_at      timestamptz not null default now(),
  unique (branch_id, date, menu_item_id)
);
create index if not exists idx_fo_branch_date on restaurant.forecast_output(branch_id, date);

-- Helper: recent-history demand baseline (8-week rolling avg per weekday)
create or replace view restaurant.v_demand_baseline as
select
  o.branch_id,
  oi.menu_item_id,
  extract(isodow from o.created_at)::int as day_of_week,
  round(sum(oi.quantity)::numeric / 8.0, 2) as eight_week_avg_qty
from restaurant.orders o
join restaurant.order_item oi on oi.order_id = o.id
where o.status in ('paid','closed')
  and o.created_at >= now() - interval '8 weeks'
  and oi.status not in ('voided','rejected')
group by o.branch_id, oi.menu_item_id, extract(isodow from o.created_at);

-- ---------- Offline sync queue + conflict resolution ----------

create table if not exists restaurant.sync_queue (
  id                 uuid primary key default gen_random_uuid(),
  branch_id          uuid not null references restaurant.branch(id) on delete cascade,
  device_id          text not null,
  client_op_id       text not null,
  op_type            text not null,
  payload            jsonb not null,
  status             text not null default 'pending'
                     check (status in ('pending','applied','conflict','rejected','resolved')),
  conflict_reason    text,
  applied_at         timestamptz,
  resolved_by        uuid references restaurant.employee(id) on delete set null,
  resolved_at        timestamptz,
  resolution_action  text,
  created_at         timestamptz not null default now(),
  unique (device_id, client_op_id)
);
create index if not exists idx_sq_status      on restaurant.sync_queue(status, created_at);
create index if not exists idx_sq_branch_pend on restaurant.sync_queue(branch_id, status)
  where status in ('pending','conflict');

-- Apply a queued operation; on failure, mark conflict and surface to cashier
create or replace function restaurant.apply_sync_op(p_id uuid)
returns text
language plpgsql
security definer
set search_path = restaurant, public
as $$
declare
  q          record;
  v_idem_key text;
begin
  select * into q from restaurant.sync_queue where id = p_id and status = 'pending' for update;
  if not found then return 'not_found_or_not_pending'; end if;

  v_idem_key := 'sync:' || q.client_op_id;

  -- Fast duplicate skip: previous successful apply already emitted this event
  if exists (select 1 from restaurant.event_store where idempotency_key = v_idem_key) then
    update restaurant.sync_queue set status = 'applied', applied_at = now() where id = p_id;
    return 'duplicate_skipped';
  end if;

  if q.op_type = 'OrderCreated' then
    begin
      perform restaurant.place_order_atomic(
        q.branch_id,
        nullif(q.payload->>'table_id','')::uuid,
        q.payload->>'order_type',
        q.payload->>'customer_name',
        q.payload->>'customer_phone',
        nullif(q.payload->>'membership_id','')::uuid,
        q.payload->'items',
        coalesce((q.payload->>'subtotal')::numeric, 0),
        coalesce((q.payload->>'discount')::numeric, 0),
        coalesce((q.payload->>'tax')::numeric, 0),
        coalesce((q.payload->>'total')::numeric, 0)
      );
      perform restaurant.emit_event(q.branch_id, 'SyncOpApplied', 'sync_queue', q.id,
        q.payload, v_idem_key);
      update restaurant.sync_queue set status = 'applied', applied_at = now() where id = p_id;
      return 'applied';
    exception when others then
      update restaurant.sync_queue
        set status = 'conflict', conflict_reason = sqlerrm
        where id = p_id;
      return 'conflict:' || sqlerrm;
    end;
  end if;

  update restaurant.sync_queue
    set status = 'rejected', conflict_reason = 'unknown_op_type: ' || q.op_type
    where id = p_id;
  return 'rejected_unknown_op_type';
end;
$$;

-- Manual cashier override: accept the conflict and mark resolved without re-applying
create or replace function restaurant.resolve_sync_conflict(
  p_id uuid,
  p_employee_id uuid,
  p_action text,
  p_reason text default null
) returns void
language plpgsql
security definer
set search_path = restaurant, public
as $$
begin
  update restaurant.sync_queue
    set status = 'resolved',
        resolved_by = p_employee_id,
        resolved_at = now(),
        resolution_action = p_action,
        conflict_reason = coalesce(p_reason, conflict_reason)
    where id = p_id and status = 'conflict';
end;
$$;

-- ---------- RLS for newly-added tables ----------

do $$
declare r record;
begin
  for r in
    select tablename from pg_tables
    where schemaname = 'restaurant'
      and tablename in ('event_store','forecast_input','forecast_output','sync_queue')
  loop
    execute format('alter table restaurant.%I enable row level security', r.tablename);
    execute format('drop policy if exists rst_all_authenticated on restaurant.%I', r.tablename);
    execute format($p$
      create policy rst_all_authenticated on restaurant.%I
        for all
        using (auth.role() = 'authenticated')
        with check (auth.role() = 'authenticated')
    $p$, r.tablename);
  end loop;
end $$;

grant all    on restaurant.event_store        to authenticated;
grant all    on restaurant.forecast_input     to authenticated;
grant all    on restaurant.forecast_output    to authenticated;
grant all    on restaurant.sync_queue         to authenticated;
grant select on restaurant.v_demand_baseline  to authenticated;
