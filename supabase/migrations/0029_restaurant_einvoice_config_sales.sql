-- ============================================================
-- Restaurant Phase 5 — MyInvois e-invoice (sales)
-- Covers spec EI-01..EI-09 + AC-EI01..AC-EI03, AC-EI05.
--   * myinvois_config            (per-branch TIN/SST/env/secret-names)
--   * myinvois_submission        (every submission attempt: per-payment, consolidated, credit-note)
--   * einvoice_consolidation_run (one row per branch+business_date for B2C roll-up)
--   * orders.buyer_*             (B2B identification fields)
--   * tg_payment_enqueue_einvoice (fires on payment->completed)
--   * einvoice_build_payload()   (canonical UBL-2.1-shaped jsonb assembled in PG)
--   * einvoice_record_response() (single transition fn used by edge fn)
-- Idempotent. All in restaurant.* schema.
-- ============================================================

-- ---------- Per-branch config ----------

create table if not exists restaurant.myinvois_config (
  branch_id              uuid primary key references restaurant.branch(id) on delete cascade,
  tin                    text,                  -- LHDN-assigned Tax Identification Number
  sst_no                 text,                  -- SST registration number, if registered
  business_name          text,
  registration_no        text,                  -- SSM no.
  address_line           text,
  city                   text,
  state                  text,
  postcode               text,
  country_code           text not null default 'MY',
  environment            text not null default 'sandbox'
                         check (environment in ('sandbox','production')),
  client_id_secret_name  text,                  -- references vault.decrypted_secrets.name
  client_secret_secret_name text,
  cert_secret_name       text,                  -- p12 cert stored in Vault
  cert_password_secret_name text,
  consolidate_b2c        boolean not null default true,
  b2c_threshold_myr      numeric(12,2) not null default 10000.00,
  is_active              boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

drop trigger if exists tg_myic_updated_at on restaurant.myinvois_config;
create trigger tg_myic_updated_at before update on restaurant.myinvois_config
  for each row execute function restaurant.tg_set_updated_at();

-- ---------- Buyer fields on orders (B2B / B2C / B2G) ----------

alter table restaurant.orders
  add column if not exists buyer_classification text not null default 'b2c'
    check (buyer_classification in ('b2b','b2c','b2g')),
  add column if not exists buyer_tin       text,
  add column if not exists buyer_name      text,
  add column if not exists buyer_address   text,
  add column if not exists buyer_email     text,
  add column if not exists buyer_phone     text,
  add column if not exists buyer_reg_no    text,
  add column if not exists einvoice_required boolean not null default true;

create index if not exists idx_orders_buyer_class on restaurant.orders(buyer_classification);

-- ---------- Consolidation run (one per branch per business date) ----------

create table if not exists restaurant.einvoice_consolidation_run (
  id              uuid primary key default gen_random_uuid(),
  branch_id       uuid not null references restaurant.branch(id) on delete cascade,
  business_date   date not null,
  status          text not null default 'pending'
                  check (status in ('pending','submitted','validated','failed','superseded')),
  order_count     int not null default 0,
  total_amount    numeric(12,2) not null default 0,
  created_at      timestamptz not null default now(),
  finalised_at    timestamptz,
  unique (branch_id, business_date)
);
create index if not exists idx_ecr_branch_date
  on restaurant.einvoice_consolidation_run(branch_id, business_date desc);

-- ---------- Submission record (sales / self-billed / consolidated / credit-note) ----------

create table if not exists restaurant.myinvois_submission (
  id                     uuid primary key default gen_random_uuid(),
  branch_id              uuid not null references restaurant.branch(id) on delete cascade,
  invoice_type           text not null
                         check (invoice_type in ('sales','self_billed','consolidated','credit_note','debit_note')),
  -- Polymorphic source: exactly one of (order_id, purchase_order_id, consolidation_run_id, parent_submission_id) is meaningful
  order_id               uuid references restaurant.orders(id) on delete set null,
  payment_id             uuid references restaurant.payment(id) on delete set null,
  purchase_order_id      uuid,                                   -- FK added in 0030
  consolidation_run_id   uuid references restaurant.einvoice_consolidation_run(id) on delete set null,
  parent_submission_id   uuid references restaurant.myinvois_submission(id) on delete set null,
  invoice_date           date not null default current_date,
  submission_status      text not null default 'pending'
                         check (submission_status in
                           ('pending','submitted','validated','failed','pending_retry','escalated','cancelled')),
  attempt_count          int not null default 0,
  next_retry_at          timestamptz,
  last_attempt_at        timestamptz,
  uin                    text,
  qr_code                text,
  request_payload        jsonb,
  validation_response    jsonb,
  error_message          text,
  idempotency_key        text unique,
  event_id               uuid references restaurant.event_store(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists idx_mis_branch_status
  on restaurant.myinvois_submission(branch_id, submission_status);
create index if not exists idx_mis_due_retry
  on restaurant.myinvois_submission(next_retry_at)
  where submission_status in ('pending','pending_retry');
create index if not exists idx_mis_order on restaurant.myinvois_submission(order_id);
create index if not exists idx_mis_run   on restaurant.myinvois_submission(consolidation_run_id);

drop trigger if exists tg_mis_updated_at on restaurant.myinvois_submission;
create trigger tg_mis_updated_at before update on restaurant.myinvois_submission
  for each row execute function restaurant.tg_set_updated_at();

-- ---------- View: rows due for retry (used by myinvois-retry edge fn) ----------

create or replace view restaurant.einvoice_due_for_retry as
select s.*
from restaurant.myinvois_submission s
where s.submission_status in ('pending','pending_retry')
  and (s.next_retry_at is null or s.next_retry_at <= now())
  and s.attempt_count < 5;

-- ---------- Trigger: enqueue submission on payment.completed ----------
-- Skip B2C-consolidated orders below threshold — those get rolled up by EOD.
-- Always enqueue B2B, B2G, and high-value B2C.

create or replace function restaurant.tg_payment_enqueue_einvoice()
returns trigger
language plpgsql
security definer
set search_path = restaurant, public
as $$
declare
  v_order            restaurant.orders%rowtype;
  v_cfg              restaurant.myinvois_config%rowtype;
  v_should_enqueue   boolean := false;
begin
  if not (new.status = 'completed' and (old.status is distinct from 'completed')) then
    return new;
  end if;

  select * into v_order from restaurant.orders where id = new.order_id;
  if not found or coalesce(v_order.einvoice_required, true) = false then
    return new;
  end if;

  select * into v_cfg from restaurant.myinvois_config where branch_id = v_order.branch_id;
  if not found or coalesce(v_cfg.is_active, false) = false then
    return new;          -- e-invoicing not enabled for this branch
  end if;

  if v_order.buyer_classification in ('b2b','b2g') then
    v_should_enqueue := true;
  elsif coalesce(v_cfg.consolidate_b2c, true) = false then
    v_should_enqueue := true;
  elsif v_order.total >= coalesce(v_cfg.b2c_threshold_myr, 10000) then
    v_should_enqueue := true;
  end if;

  if not v_should_enqueue then
    return new;
  end if;

  insert into restaurant.myinvois_submission
    (branch_id, invoice_type, order_id, payment_id, invoice_date, idempotency_key)
  values
    (v_order.branch_id, 'sales', v_order.id, new.id, current_date, 'pay:' || new.id::text)
  on conflict (idempotency_key) do nothing;

  return new;
end;
$$;

drop trigger if exists tg_payment_enqueue_einvoice on restaurant.payment;
create trigger tg_payment_enqueue_einvoice
  after update of status on restaurant.payment
  for each row execute function restaurant.tg_payment_enqueue_einvoice();

-- ---------- Payload builder (UBL 2.1 - shaped jsonb) ----------
-- Edge fn fetches this jsonb, signs it, sends to LHDN. Keeping shape close to the
-- LHDN sample so the edge fn only has to add signature + envelope.

create or replace function restaurant.einvoice_build_payload(p_submission_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = restaurant, public
as $$
declare
  s        restaurant.myinvois_submission%rowtype;
  cfg      restaurant.myinvois_config%rowtype;
  ord      restaurant.orders%rowtype;
  v_lines  jsonb := '[]'::jsonb;
  v_total  numeric(12,2) := 0;
  v_tax    numeric(12,2) := 0;
begin
  select * into s from restaurant.myinvois_submission where id = p_submission_id;
  if not found then return null; end if;
  select * into cfg from restaurant.myinvois_config where branch_id = s.branch_id;

  if s.invoice_type in ('sales','credit_note') and s.order_id is not null then
    select * into ord from restaurant.orders where id = s.order_id;
    select coalesce(jsonb_agg(jsonb_build_object(
             'line_id',           oi.id,
             'menu_item_id',      oi.menu_item_id,
             'description',       mi.name,
             'quantity',          oi.quantity,
             'unit_price',        oi.unit_price,
             'modifiers_total',   coalesce(oi.modifiers_total, 0),
             'line_total',        oi.unit_price * oi.quantity + coalesce(oi.modifiers_total, 0),
             'tax_classification','01',
             'special_instruction', oi.special_instruction
           )), '[]'::jsonb)
      into v_lines
    from restaurant.order_item oi
    join restaurant.menu_item mi on mi.id = oi.menu_item_id
    where oi.order_id = ord.id and oi.status not in ('voided','rejected');

    v_total := ord.total;
    v_tax   := ord.tax;

    return jsonb_build_object(
      'document_type',      case s.invoice_type when 'credit_note' then '02' else '01' end,
      'invoice_number',     'INV-' || substr(replace(ord.id::text,'-',''), 1, 12),
      'invoice_date',       to_char(s.invoice_date, 'YYYY-MM-DD'),
      'currency',           'MYR',
      'supplier', jsonb_build_object(
        'tin',          cfg.tin,
        'name',         cfg.business_name,
        'sst_no',       cfg.sst_no,
        'reg_no',       cfg.registration_no,
        'address',      cfg.address_line,
        'city',         cfg.city,
        'state',        cfg.state,
        'postcode',     cfg.postcode,
        'country_code', cfg.country_code
      ),
      'buyer', jsonb_build_object(
        'classification', ord.buyer_classification,
        'tin',            ord.buyer_tin,
        'name',           coalesce(ord.buyer_name, ord.customer_name, 'Retail Customer'),
        'reg_no',         ord.buyer_reg_no,
        'address',        ord.buyer_address,
        'email',          ord.buyer_email,
        'phone',          coalesce(ord.buyer_phone, ord.customer_phone)
      ),
      'lines',              v_lines,
      'subtotal',           ord.subtotal,
      'discount',           ord.discount,
      'tax_total',          v_tax,
      'tip',                ord.tip,
      'total',              v_total,
      'payment', jsonb_build_object(
        'method',           coalesce((select method from restaurant.payment where id = s.payment_id), 'cash'),
        'reference',        coalesce((select reference from restaurant.payment where id = s.payment_id), '')
      ),
      'reference', jsonb_build_object(
        'order_id',         ord.id,
        'submission_id',    s.id,
        'parent_uin',       (select uin from restaurant.myinvois_submission where id = s.parent_submission_id)
      )
    );
  end if;

  if s.invoice_type = 'consolidated' and s.consolidation_run_id is not null then
    select * into ord from restaurant.orders limit 0;       -- not used
    select coalesce(jsonb_agg(jsonb_build_object(
             'order_id',  o.id,
             'date',      to_char(o.created_at, 'YYYY-MM-DD"T"HH24:MI:SS'),
             'total',     o.total,
             'tax',       o.tax,
             'subtotal',  o.subtotal
           )), '[]'::jsonb),
           coalesce(sum(o.total), 0),
           coalesce(sum(o.tax),   0)
      into v_lines, v_total, v_tax
    from restaurant.orders o
    join restaurant.myinvois_submission ms
      on ms.consolidation_run_id = s.consolidation_run_id
     and ms.id = s.id            -- only this run's submission
    where o.id in (
      select order_id from restaurant.myinvois_submission
       where consolidation_run_id = s.consolidation_run_id
         and order_id is not null
    );

    return jsonb_build_object(
      'document_type',  '01',
      'invoice_number', 'CONS-' || substr(replace(s.id::text,'-',''), 1, 12),
      'invoice_date',   to_char(s.invoice_date, 'YYYY-MM-DD'),
      'currency',       'MYR',
      'supplier', jsonb_build_object(
        'tin',  cfg.tin, 'name', cfg.business_name, 'sst_no', cfg.sst_no,
        'reg_no', cfg.registration_no, 'address', cfg.address_line,
        'city', cfg.city, 'state', cfg.state, 'postcode', cfg.postcode,
        'country_code', cfg.country_code
      ),
      'buyer', jsonb_build_object(
        'classification', 'b2c',
        'name',           'General Public (Consolidated)'
      ),
      'consolidated_orders', v_lines,
      'subtotal',           v_total - v_tax,
      'tax_total',          v_tax,
      'total',              v_total,
      'reference', jsonb_build_object('consolidation_run_id', s.consolidation_run_id)
    );
  end if;

  return null;       -- self_billed handled by 0030 wrapper
end;
$$;

-- ---------- Single transition fn used by edge function ----------

create or replace function restaurant.einvoice_record_response(
  p_submission_id uuid,
  p_ok            boolean,
  p_uin           text,
  p_qr            text,
  p_response      jsonb,
  p_error         text default null
) returns void
language plpgsql
security definer
set search_path = restaurant, public
as $$
declare
  s            restaurant.myinvois_submission%rowtype;
  v_next_status text;
  v_next_at    timestamptz;
  v_attempt    int;
begin
  select * into s from restaurant.myinvois_submission where id = p_submission_id for update;
  if not found then return; end if;

  v_attempt := s.attempt_count + 1;

  if p_ok then
    v_next_status := 'validated';
    update restaurant.myinvois_submission
      set submission_status   = v_next_status,
          attempt_count       = v_attempt,
          last_attempt_at     = now(),
          uin                 = p_uin,
          qr_code             = p_qr,
          validation_response = p_response,
          error_message       = null,
          next_retry_at       = null
      where id = p_submission_id;

    -- Mirror onto consolidation_run if applicable
    if s.consolidation_run_id is not null then
      update restaurant.einvoice_consolidation_run
        set status = 'validated', finalised_at = now()
        where id = s.consolidation_run_id;
    end if;

    -- Notify cashier / admin
    insert into restaurant.notification (branch_id, type, title, body, payload)
    values (s.branch_id, 'einvoice.validated',
            'E-invoice validated',
            'UIN ' || p_uin,
            jsonb_build_object('submission_id', p_submission_id, 'uin', p_uin));

    perform restaurant.emit_event(s.branch_id, 'EInvoiceValidated', 'myinvois_submission', p_submission_id,
      jsonb_build_object('uin', p_uin, 'invoice_type', s.invoice_type));

  else
    if v_attempt >= 5 then
      v_next_status := 'escalated';
      v_next_at := null;
      insert into restaurant.notification (branch_id, type, title, body, payload)
      values (s.branch_id, 'einvoice.escalated',
              'E-invoice escalated to admin',
              coalesce(p_error, 'Submission failed 5 times'),
              jsonb_build_object('submission_id', p_submission_id));
      perform restaurant.emit_event(s.branch_id, 'EInvoiceEscalated', 'myinvois_submission', p_submission_id,
        jsonb_build_object('error', p_error));
    else
      v_next_status := 'pending_retry';
      -- Exponential backoff: 30s, 2m, 8m, 32m
      v_next_at := now() + (power(4, v_attempt) * interval '30 seconds');
      perform restaurant.emit_event(s.branch_id, 'EInvoiceRetryQueued', 'myinvois_submission', p_submission_id,
        jsonb_build_object('attempt', v_attempt, 'next_at', v_next_at, 'error', p_error));
    end if;

    update restaurant.myinvois_submission
      set submission_status   = v_next_status,
          attempt_count       = v_attempt,
          last_attempt_at     = now(),
          validation_response = p_response,
          error_message       = p_error,
          next_retry_at       = v_next_at
      where id = p_submission_id;

    if v_next_status = 'escalated' then
      insert into restaurant.manager_approval
        (branch_id, manager_id, action, entity_type, entity_id, reason)
      select s.branch_id,
             (select id from restaurant.employee
                where branch_id = s.branch_id and role in ('admin','owner','shift_manager')
                limit 1),
             'shift_variance', 'myinvois_submission', s.id,
             'E-invoice failed validation: ' || coalesce(p_error, 'unknown')
      where exists (select 1 from restaurant.employee
                      where branch_id = s.branch_id and role in ('admin','owner','shift_manager'));
    end if;
  end if;
end;
$$;

-- ---------- RLS for new tables ----------

do $$
declare r record;
begin
  for r in
    select tablename from pg_tables
    where schemaname = 'restaurant'
      and tablename in ('myinvois_config','myinvois_submission','einvoice_consolidation_run')
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

grant all    on restaurant.myinvois_config            to authenticated;
grant all    on restaurant.myinvois_submission        to authenticated;
grant all    on restaurant.einvoice_consolidation_run to authenticated;
grant select on restaurant.einvoice_due_for_retry     to authenticated;
