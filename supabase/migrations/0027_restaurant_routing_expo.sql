-- ============================================================
-- Restaurant Phase 4 — Operations brain: routing + expo
--   * printer            (registered output devices: kitchen/bar/receipt/expo/label/backup)
--   * printer_rule       (station -> primary + fallback printer)
--   * routing_rule       (rich match -> station + printer; replaces hardcoded menu_item.station)
--   * resolve_route()    (deterministic: rule priority, then menu_item.station fallback)
--   * order_item.expo_status + v_expo_board (food-runner pass screen)
-- Idempotent. All in restaurant.* schema.
-- ============================================================

-- ---------- Printers ----------

create table if not exists restaurant.printer (
  id          uuid primary key default gen_random_uuid(),
  branch_id   uuid not null references restaurant.branch(id) on delete cascade,
  name        text not null,
  ip          text,
  port        int,
  type        text not null check (type in ('kitchen','bar','receipt','expo','label','backup')),
  is_active   boolean not null default true,
  notes       text,
  created_at  timestamptz not null default now(),
  unique (branch_id, name)
);
create index if not exists idx_pr_branch on restaurant.printer(branch_id, is_active);

create table if not exists restaurant.printer_rule (
  id                     uuid primary key default gen_random_uuid(),
  branch_id              uuid not null references restaurant.branch(id) on delete cascade,
  station                text not null,
  printer_id             uuid not null references restaurant.printer(id) on delete cascade,
  fallback_printer_id    uuid references restaurant.printer(id) on delete set null,
  unique (branch_id, station)
);
create index if not exists idx_prr_branch on restaurant.printer_rule(branch_id);

-- ---------- Routing rule (matches order line context -> station/printer) ----------

create table if not exists restaurant.routing_rule (
  id                  uuid primary key default gen_random_uuid(),
  branch_id           uuid not null references restaurant.branch(id) on delete cascade,
  name                text not null,
  match_jsonb         jsonb not null default '{}'::jsonb,
    -- supported keys: category_id, course_type, area, menu_item_id
  target_station      text not null,
  target_printer_id   uuid references restaurant.printer(id) on delete set null,
  priority            int not null default 100,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now()
);
create index if not exists idx_rr_branch_priority
  on restaurant.routing_rule(branch_id, priority) where is_active = true;

-- Resolver: highest-priority active rule wins; falls back to menu_item.station + printer_rule
create or replace function restaurant.resolve_route(
  p_branch_id     uuid,
  p_menu_item_id  uuid,
  p_table_id      uuid default null
) returns table (station text, printer_id uuid)
language plpgsql
stable
security definer
set search_path = restaurant, public
as $$
declare
  v_cat            uuid;
  v_course         text;
  v_area           text;
  v_default_stn    text;
begin
  select mi.category_id, mi.course_type, mi.station
    into v_cat, v_course, v_default_stn
  from restaurant.menu_item mi where mi.id = p_menu_item_id;

  if p_table_id is not null then
    select rt.area into v_area
      from restaurant.restaurant_table rt where rt.id = p_table_id;
  end if;

  return query
  select rr.target_station,
         coalesce(rr.target_printer_id, pr.printer_id)
  from restaurant.routing_rule rr
  left join restaurant.printer_rule pr
    on pr.branch_id = p_branch_id and pr.station = rr.target_station
  where rr.branch_id = p_branch_id
    and rr.is_active = true
    and (rr.match_jsonb->>'category_id'  is null or rr.match_jsonb->>'category_id'  = v_cat::text)
    and (rr.match_jsonb->>'course_type'  is null or rr.match_jsonb->>'course_type'  = v_course)
    and (rr.match_jsonb->>'area'         is null or rr.match_jsonb->>'area'         = v_area)
    and (rr.match_jsonb->>'menu_item_id' is null or rr.match_jsonb->>'menu_item_id' = p_menu_item_id::text)
  order by rr.priority asc
  limit 1;

  if not found then
    return query
    select coalesce(v_default_stn, 'kitchen')::text,
           (select printer_id from restaurant.printer_rule
              where branch_id = p_branch_id
                and station = coalesce(v_default_stn, 'kitchen')
              limit 1);
  end if;
end;
$$;

-- ---------- Expo / Pass screen ----------

alter table restaurant.order_item
  add column if not exists expo_status text not null default 'waiting'
    check (expo_status in ('waiting','at_pass','served')),
  add column if not exists expo_at timestamptz;

create index if not exists idx_oi_expo on restaurant.order_item(expo_status);

-- When a ticket goes ready, its order_item.expo_status moves to at_pass
create or replace function restaurant.tg_ticket_ready_to_pass()
returns trigger
language plpgsql
security definer
set search_path = restaurant, public
as $$
begin
  if new.status = 'ready' and (old.status is distinct from 'ready') and new.order_item_id is not null then
    update restaurant.order_item
       set expo_status = case when expo_status = 'waiting' then 'at_pass' else expo_status end,
           expo_at     = coalesce(expo_at, now())
     where id = new.order_item_id;
  end if;
  return new;
end;
$$;

drop trigger if exists tg_ticket_ready_to_pass on restaurant.kitchen_ticket;
create trigger tg_ticket_ready_to_pass
  after update of status on restaurant.kitchen_ticket
  for each row execute function restaurant.tg_ticket_ready_to_pass();

-- Mark item served (expo runner clicks "delivered to table")
create or replace function restaurant.mark_item_served(p_order_item_id uuid, p_employee_id uuid default null)
returns void
language plpgsql
security definer
set search_path = restaurant, public
as $$
begin
  update restaurant.order_item
     set status = 'served',
         expo_status = 'served'
   where id = p_order_item_id
     and status in ('ready','preparing');
end;
$$;

-- Expo board: per active order, totals + all_ready flag for "don't serve until everything ready"
create or replace view restaurant.v_expo_board as
select
  o.id                                                              as order_id,
  o.branch_id,
  o.table_id,
  rt.table_number,
  rt.area                                                           as table_area,
  o.created_at                                                      as order_at,
  count(oi.id)                                                      as total_items,
  count(*) filter (where oi.status = 'ready')                       as ready_items,
  count(*) filter (where oi.status in ('preparing','fired','held','pending')) as in_flight_items,
  count(*) filter (where oi.expo_status = 'at_pass')                as at_pass_items,
  count(*) filter (where oi.status = 'served')                      as served_items,
  bool_and(oi.status in ('ready','served','voided','rejected'))     as all_ready,
  bool_and(oi.status = 'served')                                    as all_served,
  extract(epoch from (now() - min(oi.created_at)))::int / 60        as oldest_minutes
from restaurant.orders o
join restaurant.order_item oi on oi.order_id = o.id
left join restaurant.restaurant_table rt on rt.id = o.table_id
where o.status in ('active','sent','partial','ready','served')
  and oi.status not in ('voided','rejected')
group by o.id, o.branch_id, o.table_id, rt.table_number, rt.area, o.created_at;

-- ---------- RLS for newly-added tables ----------

do $$
declare r record;
begin
  for r in
    select tablename from pg_tables
    where schemaname = 'restaurant'
      and tablename in ('printer','printer_rule','routing_rule')
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

grant all    on restaurant.printer       to authenticated;
grant all    on restaurant.printer_rule  to authenticated;
grant all    on restaurant.routing_rule  to authenticated;
grant select on restaurant.v_expo_board  to authenticated;
