-- ============================================================
-- Restaurant Phase 5 — Consolidated B2C daily e-invoice
-- Covers spec EI-06 + AC-EI06.
--   * eod_einvoice_status   (per-branch, per-day status surface)
--   * run_consolidated_b2c  (idempotent: rolls a single submission per branch+date)
--   * preview_consolidated_b2c (read-only inspection before commit)
-- Idempotent. All in restaurant.* schema.
-- ============================================================

-- ---------- Status view ----------

create or replace view restaurant.eod_einvoice_status as
with day_orders as (
  select
    o.branch_id,
    date_trunc('day', o.created_at)::date as business_date,
    count(*)                              as order_count,
    sum(o.total)::numeric(12,2)           as total_amount,
    count(*) filter (where o.buyer_classification = 'b2c'
                       and o.total < coalesce(c.b2c_threshold_myr, 10000)) as eligible_count,
    sum(o.total) filter (where o.buyer_classification = 'b2c'
                       and o.total < coalesce(c.b2c_threshold_myr, 10000))::numeric(12,2) as eligible_amount
  from restaurant.orders o
  left join restaurant.myinvois_config c on c.branch_id = o.branch_id
  where o.status in ('paid','closed')
  group by o.branch_id, date_trunc('day', o.created_at), c.b2c_threshold_myr
)
select
  d.branch_id,
  d.business_date,
  d.order_count,
  d.total_amount,
  d.eligible_count,
  d.eligible_amount,
  r.id              as run_id,
  r.status          as run_status,
  s.uin             as run_uin,
  s.qr_code         as run_qr,
  s.submission_status as submission_status
from day_orders d
left join restaurant.einvoice_consolidation_run r
  on r.branch_id = d.branch_id and r.business_date = d.business_date
left join restaurant.myinvois_submission s
  on s.consolidation_run_id = r.id and s.invoice_type = 'consolidated';

-- ---------- Preview (read-only): show what would roll up if we ran today ----------

create or replace function restaurant.preview_consolidated_b2c(
  p_branch_id uuid,
  p_date      date default current_date
) returns jsonb
language plpgsql
stable
security definer
set search_path = restaurant, public
as $$
declare
  cfg          restaurant.myinvois_config%rowtype;
  v_threshold  numeric;
  v_orders     jsonb;
  v_total      numeric(12,2) := 0;
  v_count      int := 0;
begin
  select * into cfg from restaurant.myinvois_config where branch_id = p_branch_id;
  v_threshold := coalesce(cfg.b2c_threshold_myr, 10000);

  select coalesce(jsonb_agg(jsonb_build_object(
           'order_id', o.id,
           'total',    o.total,
           'tax',      o.tax,
           'created_at', to_char(o.created_at, 'YYYY-MM-DD"T"HH24:MI:SS')
         ) order by o.created_at), '[]'::jsonb),
         coalesce(sum(o.total), 0),
         count(*)
    into v_orders, v_total, v_count
  from restaurant.orders o
  where o.branch_id = p_branch_id
    and o.buyer_classification = 'b2c'
    and o.status in ('paid','closed')
    and date_trunc('day', o.created_at) = p_date
    and o.total < v_threshold
    -- Exclude orders already covered by an earlier run for the same date
    and not exists (
      select 1 from restaurant.myinvois_submission ms
      where ms.order_id = o.id
        and ms.invoice_type = 'sales'
        and ms.submission_status in ('validated','submitted','pending','pending_retry')
    );

  return jsonb_build_object(
    'branch_id', p_branch_id,
    'business_date', to_char(p_date, 'YYYY-MM-DD'),
    'order_count', v_count,
    'total_amount', v_total,
    'threshold_myr', v_threshold,
    'orders', v_orders
  );
end;
$$;

-- ---------- Run: create one consolidated submission for branch+date ----------

create or replace function restaurant.run_consolidated_b2c(
  p_branch_id uuid,
  p_date      date default current_date
) returns uuid
language plpgsql
security definer
set search_path = restaurant, public
as $$
declare
  cfg            restaurant.myinvois_config%rowtype;
  v_threshold    numeric;
  v_run_id       uuid;
  v_existing_run restaurant.einvoice_consolidation_run%rowtype;
  v_submission_id uuid;
  v_orders       uuid[];
  v_total        numeric(12,2) := 0;
  v_count        int := 0;
  v_idem_key     text;
begin
  select * into cfg from restaurant.myinvois_config where branch_id = p_branch_id;
  if not found or coalesce(cfg.is_active, false) = false
     or coalesce(cfg.consolidate_b2c, true) = false then
    return null;          -- consolidation disabled
  end if;

  v_threshold := coalesce(cfg.b2c_threshold_myr, 10000);

  -- If an existing run is already validated, refuse
  select * into v_existing_run from restaurant.einvoice_consolidation_run
    where branch_id = p_branch_id and business_date = p_date;
  if found and v_existing_run.status = 'validated' then
    raise notice 'Consolidated run already validated for branch %, date %', p_branch_id, p_date;
    return v_existing_run.id;
  end if;

  -- Mark a previous unfinished run as superseded
  if found and v_existing_run.status in ('pending','submitted','failed') then
    update restaurant.einvoice_consolidation_run
      set status = 'superseded'
      where id = v_existing_run.id;
    update restaurant.myinvois_submission
      set submission_status = 'cancelled'
      where consolidation_run_id = v_existing_run.id
        and submission_status in ('pending','pending_retry','failed');
  end if;

  -- Pick eligible orders
  select array_agg(o.id), coalesce(sum(o.total), 0), count(*)
    into v_orders, v_total, v_count
  from restaurant.orders o
  where o.branch_id = p_branch_id
    and o.buyer_classification = 'b2c'
    and o.status in ('paid','closed')
    and date_trunc('day', o.created_at) = p_date
    and o.total < v_threshold
    and not exists (
      select 1 from restaurant.myinvois_submission ms
      where ms.order_id = o.id
        and ms.invoice_type = 'sales'
        and ms.submission_status in ('validated','submitted','pending','pending_retry')
    );

  if v_count = 0 or v_orders is null then
    return null;          -- nothing to consolidate
  end if;

  insert into restaurant.einvoice_consolidation_run
    (branch_id, business_date, status, order_count, total_amount)
  values (p_branch_id, p_date, 'pending', v_count, v_total)
  on conflict (branch_id, business_date) do update
    set status        = 'pending',
        order_count   = excluded.order_count,
        total_amount  = excluded.total_amount,
        finalised_at  = null
  returning id into v_run_id;

  v_idem_key := 'cons:' || p_branch_id::text || ':' || to_char(p_date, 'YYYY-MM-DD');

  insert into restaurant.myinvois_submission
    (branch_id, invoice_type, consolidation_run_id, invoice_date, idempotency_key)
  values (p_branch_id, 'consolidated', v_run_id, p_date, v_idem_key)
  on conflict (idempotency_key) do update
    set submission_status = 'pending',
        attempt_count = 0,
        next_retry_at = null,
        error_message = null
  returning id into v_submission_id;

  -- Link individual orders to this run by tagging an internal pointer row each
  -- (we don't create per-order myinvois_submission rows for the b2c rollup —
  --  the consolidated submission is the single record. But we mark the orders
  --  via order_id on the same submission for traceability.)
  update restaurant.myinvois_submission
    set consolidation_run_id = v_run_id
    where id = v_submission_id;

  -- Optional traceability: stash covered order ids in request_payload.draft
  update restaurant.myinvois_submission
    set request_payload = jsonb_build_object(
      'draft_covered_orders', to_jsonb(v_orders),
      'draft_total', v_total,
      'draft_count', v_count
    )
    where id = v_submission_id;

  perform restaurant.emit_event(
    p_branch_id, 'EInvoiceConsolidatedQueued', 'einvoice_consolidation_run', v_run_id,
    jsonb_build_object('order_count', v_count, 'total', v_total, 'submission_id', v_submission_id)
  );

  return v_run_id;
end;
$$;

-- ---------- Convenience: run for every active branch ----------

create or replace function restaurant.run_consolidated_b2c_all(
  p_date date default current_date
) returns int
language plpgsql
security definer
set search_path = restaurant, public
as $$
declare
  rec record;
  v_count int := 0;
begin
  for rec in
    select c.branch_id
    from restaurant.myinvois_config c
    where c.is_active = true and c.consolidate_b2c = true
  loop
    if restaurant.run_consolidated_b2c(rec.branch_id, p_date) is not null then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

grant select on restaurant.eod_einvoice_status to authenticated;
