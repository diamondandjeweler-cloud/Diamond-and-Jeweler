-- ============================================================
-- Restaurant Phase 4 — Money correctness layer
--   * tax_rule              (multiple GST/SST rules per branch, dinein/takeaway/alcohol-aware)
--   * compute_taxes()       (additive across applicable rules, inclusive/exclusive)
--   * tip_pool              (per-shift, per-employee tip distribution ledger)
--   * distribute_shift_tips (hours x tables-served weighting)
--   * payment_terminal      (card terminals registered to a branch)
--   * terminal_settlement   (EOD card reconciliation: expected vs actual)
--   * payment.terminal_id   (tag each card/QR payment to a physical terminal)
-- Idempotent. All in restaurant.* schema.
-- ============================================================

-- ---------- Tax rule ----------

create table if not exists restaurant.tax_rule (
  id          uuid primary key default gen_random_uuid(),
  branch_id   uuid references restaurant.branch(id) on delete cascade,
  name        text not null,
  percentage  numeric(6,4) not null check (percentage >= 0 and percentage <= 1),
  applies_to  text not null default 'all'
              check (applies_to in ('all','dinein','takeaway','delivery','alcohol','non_alcohol','bar')),
  inclusive   boolean not null default false,
  is_active   boolean not null default true,
  priority    int not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_tax_branch_active on restaurant.tax_rule(branch_id, is_active);

drop trigger if exists tg_tax_updated_at on restaurant.tax_rule;
create trigger tg_tax_updated_at before update on restaurant.tax_rule
  for each row execute function restaurant.tg_set_updated_at();

-- One-time backfill: convert existing branch.default_tax_rate -> a tax_rule row
insert into restaurant.tax_rule (branch_id, name, percentage, applies_to, inclusive)
select b.id,
       'Default ' || (b.default_tax_rate * 100)::text || '%',
       b.default_tax_rate,
       'all',
       false
from restaurant.branch b
where b.default_tax_rate > 0
  and not exists (
    select 1 from restaurant.tax_rule t
    where t.branch_id = b.id and t.applies_to = 'all'
  );

-- compute_taxes: sum of every rule that matches order_type / order_kind
create or replace function restaurant.compute_taxes(
  p_branch_id uuid,
  p_subtotal numeric,
  p_order_type text default 'dinein'
) returns numeric
language sql
stable
security definer
set search_path = restaurant, public
as $$
  select coalesce(sum(
           case when inclusive
                then 0
                else round(p_subtotal * percentage, 2)
           end
         ), 0)::numeric(10,2)
  from restaurant.tax_rule
  where (branch_id = p_branch_id or branch_id is null)
    and is_active = true
    and (applies_to = 'all'
         or applies_to = p_order_type
         or (p_order_type = 'bar' and applies_to = 'alcohol'));
$$;

-- ---------- Tip pool ----------

create table if not exists restaurant.tip_pool (
  id              uuid primary key default gen_random_uuid(),
  shift_id        uuid not null references restaurant.cashier_shift(id) on delete cascade,
  employee_id     uuid not null references restaurant.employee(id) on delete restrict,
  hours_worked   numeric(6,2) not null default 0,
  tables_served  int not null default 0,
  points         numeric(10,2) not null default 0,
  tip_amount     numeric(10,2) not null default 0,
  created_at     timestamptz not null default now(),
  unique (shift_id, employee_id)
);
create index if not exists idx_tp_shift on restaurant.tip_pool(shift_id);
create index if not exists idx_tp_emp   on restaurant.tip_pool(employee_id);

create or replace function restaurant.distribute_shift_tips(p_shift_id uuid)
returns int
language plpgsql
security definer
set search_path = restaurant, public
as $$
declare
  v_branch         uuid;
  v_open           timestamptz;
  v_close          timestamptz;
  v_total_tips     numeric := 0;
  v_total_points   numeric := 0;
  v_count          int := 0;
  rec              record;
begin
  select branch_id, opened_at, coalesce(closed_at, now())
    into v_branch, v_open, v_close
  from restaurant.cashier_shift where id = p_shift_id;
  if not found then return 0; end if;

  -- Pool size: tip_amount column on payments collected during shift
  select coalesce(sum(p.tip_amount), 0)
    into v_total_tips
  from restaurant.payment p
  join restaurant.orders o on o.id = p.order_id
  where o.branch_id = v_branch
    and p.created_at between v_open and v_close
    and p.status = 'completed';

  -- Reset existing rows for idempotency
  delete from restaurant.tip_pool where shift_id = p_shift_id;

  for rec in
    with hrs as (
      select t.employee_id,
             greatest(
               extract(epoch from (least(coalesce(t.clock_out, now()), v_close)
                                   - greatest(t.clock_in, v_open))) / 3600.0,
               0
             ) as h
      from restaurant.timesheet t
      where t.branch_id = v_branch
        and t.clock_in <= v_close
        and (t.clock_out is null or t.clock_out >= v_open)
    ),
    tabs as (
      select o.waiter_id, count(distinct o.table_id) as tc
      from restaurant.orders o
      where o.branch_id = v_branch
        and o.created_at between v_open and v_close
        and o.waiter_id is not null
      group by o.waiter_id
    )
    select hrs.employee_id,
           round(hrs.h::numeric, 2) as h,
           coalesce(tabs.tc, 0) as tc
    from hrs
    left join tabs on tabs.waiter_id = hrs.employee_id
  loop
    insert into restaurant.tip_pool
      (shift_id, employee_id, hours_worked, tables_served, points, tip_amount)
    values (
      p_shift_id, rec.employee_id, rec.h, rec.tc,
      round(rec.h * (1 + rec.tc * 0.1), 2),
      0
    );
    v_count := v_count + 1;
  end loop;

  select coalesce(sum(points), 0) into v_total_points
  from restaurant.tip_pool where shift_id = p_shift_id;

  if v_total_points > 0 and v_total_tips > 0 then
    update restaurant.tip_pool
      set tip_amount = round((points / v_total_points) * v_total_tips, 2)
      where shift_id = p_shift_id;
  end if;

  return v_count;
end;
$$;

-- ---------- Payment terminals + EOD reconciliation ----------

create table if not exists restaurant.payment_terminal (
  id          uuid primary key default gen_random_uuid(),
  branch_id   uuid not null references restaurant.branch(id) on delete cascade,
  name        text not null,
  provider    text,
  serial      text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (branch_id, name)
);
create index if not exists idx_pt_branch on restaurant.payment_terminal(branch_id, is_active);

alter table restaurant.payment
  add column if not exists terminal_id uuid references restaurant.payment_terminal(id) on delete set null;
create index if not exists idx_pay_terminal on restaurant.payment(terminal_id, created_at);

create table if not exists restaurant.terminal_settlement (
  id              uuid primary key default gen_random_uuid(),
  branch_id       uuid not null references restaurant.branch(id) on delete cascade,
  terminal_id     uuid references restaurant.payment_terminal(id) on delete set null,
  settlement_date date not null,
  expected_total  numeric(12,2) not null default 0,
  actual_total    numeric(12,2) not null default 0,
  variance        numeric(12,2) generated always as (actual_total - expected_total) stored,
  txn_count       int not null default 0,
  reconciled_by   uuid references restaurant.employee(id) on delete set null,
  reconciled_at   timestamptz,
  notes           text,
  created_at      timestamptz not null default now(),
  unique (branch_id, terminal_id, settlement_date)
);
create index if not exists idx_ts_branch_date
  on restaurant.terminal_settlement(branch_id, settlement_date desc);

-- View: what the POS thinks each terminal collected (per day)
create or replace view restaurant.v_terminal_expected as
select
  o.branch_id,
  p.terminal_id,
  date_trunc('day', p.created_at)::date as settlement_date,
  sum(p.amount)::numeric(12,2)          as expected_total,
  count(*)::int                         as txn_count
from restaurant.payment p
join restaurant.orders o on o.id = p.order_id
where p.method in ('card','qr')
  and p.status = 'completed'
group by o.branch_id, p.terminal_id, date_trunc('day', p.created_at);

-- Helper: prefill a settlement row from POS-side totals (cashier then enters actual_total)
create or replace function restaurant.start_terminal_settlement(
  p_branch_id uuid,
  p_terminal_id uuid,
  p_date date
) returns uuid
language plpgsql
security definer
set search_path = restaurant, public
as $$
declare
  v_id        uuid;
  v_expected  numeric := 0;
  v_count     int := 0;
begin
  select expected_total, txn_count
    into v_expected, v_count
  from restaurant.v_terminal_expected
  where branch_id = p_branch_id
    and ((terminal_id = p_terminal_id) or (terminal_id is null and p_terminal_id is null))
    and settlement_date = p_date;

  insert into restaurant.terminal_settlement
    (branch_id, terminal_id, settlement_date, expected_total, actual_total, txn_count)
  values (p_branch_id, p_terminal_id, p_date, coalesce(v_expected, 0), 0, coalesce(v_count, 0))
  on conflict (branch_id, terminal_id, settlement_date)
    do update set expected_total = excluded.expected_total,
                  txn_count = excluded.txn_count
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------- RLS for newly-added tables ----------

do $$
declare r record;
begin
  for r in
    select tablename from pg_tables
    where schemaname = 'restaurant'
      and tablename in ('tax_rule','tip_pool','payment_terminal','terminal_settlement')
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

grant all on restaurant.tax_rule              to authenticated;
grant all on restaurant.tip_pool              to authenticated;
grant all on restaurant.payment_terminal      to authenticated;
grant all on restaurant.terminal_settlement   to authenticated;
grant select on restaurant.v_terminal_expected to authenticated;
