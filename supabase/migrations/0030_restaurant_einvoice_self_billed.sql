-- ============================================================
-- Restaurant Phase 5 — Self-billed e-invoice for purchasing
-- Covers spec EI-10..EI-17 + AC-EI04.
--   * supplier extensions       (TIN, foreign flag, auto self-billed config, einvoice email)
--   * purchase_order extensions (auto_self_billed, self_billed_status)
--   * self_billed_invoice       (linkage row between PO and the unified myinvois_submission)
--   * tg_po_self_billed         (fires on PO sent or received per supplier config)
--   * einvoice_build_payload_self_billed()  (UBL-shaped jsonb for PO)
--   * einvoice_build_payload override       (delegates self_billed branch to the new fn)
-- Idempotent. All in restaurant.* schema.
-- ============================================================

-- ---------- Supplier extensions ----------

alter table restaurant.supplier
  add column if not exists tin                  text,
  add column if not exists is_foreign           boolean not null default false,
  add column if not exists foreign_tax_id       text,
  add column if not exists country_code         text not null default 'MY',
  add column if not exists address              text,
  add column if not exists city                 text,
  add column if not exists state                text,
  add column if not exists postcode             text,
  add column if not exists einvoice_email       text,
  add column if not exists auto_self_billed     boolean not null default false,
  add column if not exists self_billed_trigger  text not null default 'goods_receipt'
    check (self_billed_trigger in ('po_creation','goods_receipt'));

-- ---------- Purchase order extensions ----------

alter table restaurant.purchase_order
  add column if not exists auto_self_billed boolean not null default false,
  add column if not exists self_billed_status text not null default 'not_required'
    check (self_billed_status in
      ('not_required','pending','submitted','validated','failed','shared','escalated'));

-- ---------- Linkage table ----------

create table if not exists restaurant.self_billed_invoice (
  id                      uuid primary key default gen_random_uuid(),
  branch_id               uuid not null references restaurant.branch(id) on delete cascade,
  purchase_order_id       uuid not null references restaurant.purchase_order(id) on delete cascade,
  supplier_id             uuid references restaurant.supplier(id) on delete set null,
  submission_id           uuid references restaurant.myinvois_submission(id) on delete set null,
  supplier_name           text,
  supplier_tin            text,
  supplier_address        text,
  total_amount            numeric(12,2) not null default 0,
  shared_with_supplier_at timestamptz,
  shared_via              text check (shared_via in ('email','portal','manual')),
  status                  text not null default 'pending'
                          check (status in ('pending','submitted','validated','failed','shared','escalated','cancelled')),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (purchase_order_id)
);
create index if not exists idx_sbi_branch_status
  on restaurant.self_billed_invoice(branch_id, status);

drop trigger if exists tg_sbi_updated_at on restaurant.self_billed_invoice;
create trigger tg_sbi_updated_at before update on restaurant.self_billed_invoice
  for each row execute function restaurant.tg_set_updated_at();

-- Late-bind FK from myinvois_submission.purchase_order_id (declared in 0029 without FK)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'mis_po_fk'
  ) then
    alter table restaurant.myinvois_submission
      add constraint mis_po_fk foreign key (purchase_order_id)
      references restaurant.purchase_order(id) on delete set null;
  end if;
end $$;

-- ---------- Trigger: enqueue self-billed submission on PO transitions ----------

create or replace function restaurant.tg_po_self_billed()
returns trigger
language plpgsql
security definer
set search_path = restaurant, public
as $$
declare
  v_supplier         restaurant.supplier%rowtype;
  v_cfg              restaurant.myinvois_config%rowtype;
  v_should_enqueue   boolean := false;
  v_total            numeric(12,2) := 0;
  v_submission_id    uuid;
  v_idem_key         text;
  v_trigger_event    text;       -- 'po_creation' or 'goods_receipt'
begin
  -- Only fire when the PO actually transitions out of draft
  if tg_op = 'INSERT' then
    if new.status = 'sent' then
      v_trigger_event := 'po_creation';
    else
      return new;          -- ignore inserts of drafts/cancelled etc.
    end if;
  elsif tg_op = 'UPDATE' then
    if old.status = 'draft' and new.status = 'sent' then
      v_trigger_event := 'po_creation';
    elsif old.status <> 'received' and new.status = 'received' then
      v_trigger_event := 'goods_receipt';
    else
      return new;
    end if;
  else
    return new;
  end if;

  select * into v_supplier from restaurant.supplier where id = new.supplier_id;
  if not found then return new; end if;

  -- Only auto-enqueue if supplier opted in AND trigger event matches their preference
  if not coalesce(v_supplier.auto_self_billed, false) then return new; end if;
  if v_supplier.self_billed_trigger <> v_trigger_event then return new; end if;

  select * into v_cfg from restaurant.myinvois_config where branch_id = new.branch_id;
  if not found or coalesce(v_cfg.is_active, false) = false then return new; end if;

  -- Compute total from lines (PO header may not be authoritative yet)
  select coalesce(sum(coalesce(received_qty, ordered_qty) * unit_cost), 0)
    into v_total
  from restaurant.purchase_order_line where po_id = new.id;

  v_idem_key := 'po:' || new.id::text;

  insert into restaurant.myinvois_submission
    (branch_id, invoice_type, purchase_order_id, invoice_date, idempotency_key)
  values (new.branch_id, 'self_billed', new.id, current_date, v_idem_key)
  on conflict (idempotency_key) do nothing
  returning id into v_submission_id;

  -- Find existing submission if conflict happened
  if v_submission_id is null then
    select id into v_submission_id from restaurant.myinvois_submission
      where idempotency_key = v_idem_key;
  end if;

  insert into restaurant.self_billed_invoice
    (branch_id, purchase_order_id, supplier_id, submission_id,
     supplier_name, supplier_tin, supplier_address, total_amount, status)
  values
    (new.branch_id, new.id, v_supplier.id, v_submission_id,
     v_supplier.name,
     coalesce(v_supplier.tin, v_supplier.foreign_tax_id),
     v_supplier.address,
     v_total,
     'pending')
  on conflict (purchase_order_id) do update
    set submission_id = excluded.submission_id,
        total_amount  = excluded.total_amount,
        updated_at    = now();

  update restaurant.purchase_order
    set self_billed_status = 'pending'
    where id = new.id;

  return new;
end;
$$;

drop trigger if exists tg_po_self_billed on restaurant.purchase_order;
create trigger tg_po_self_billed
  after insert or update of status on restaurant.purchase_order
  for each row execute function restaurant.tg_po_self_billed();

-- ---------- Self-billed payload builder ----------

create or replace function restaurant.einvoice_build_payload_self_billed(p_submission_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = restaurant, public
as $$
declare
  s        restaurant.myinvois_submission%rowtype;
  cfg      restaurant.myinvois_config%rowtype;
  po       restaurant.purchase_order%rowtype;
  sup      restaurant.supplier%rowtype;
  sbi      restaurant.self_billed_invoice%rowtype;
  v_lines  jsonb := '[]'::jsonb;
  v_total  numeric(12,2) := 0;
begin
  select * into s   from restaurant.myinvois_submission where id = p_submission_id;
  if not found or s.invoice_type <> 'self_billed' then return null; end if;
  select * into cfg from restaurant.myinvois_config     where branch_id = s.branch_id;
  select * into po  from restaurant.purchase_order      where id = s.purchase_order_id;
  if not found then return null; end if;
  select * into sup from restaurant.supplier            where id = po.supplier_id;
  select * into sbi from restaurant.self_billed_invoice where purchase_order_id = po.id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'line_id',     pol.id,
           'ingredient_id', pol.ingredient_id,
           'description',   ing.name,
           'unit',          ing.unit,
           'quantity',      coalesce(pol.received_qty, pol.ordered_qty),
           'unit_cost',     pol.unit_cost,
           'line_total',    coalesce(pol.received_qty, pol.ordered_qty) * pol.unit_cost
         )), '[]'::jsonb),
         coalesce(sum(coalesce(pol.received_qty, pol.ordered_qty) * pol.unit_cost), 0)
    into v_lines, v_total
  from restaurant.purchase_order_line pol
  join restaurant.ingredient ing on ing.id = pol.ingredient_id
  where pol.po_id = po.id;

  return jsonb_build_object(
    'document_type',  '11',                         -- LHDN code for self-billed
    'invoice_number', 'SBI-' || substr(replace(po.id::text,'-',''), 1, 12),
    'invoice_date',   to_char(s.invoice_date, 'YYYY-MM-DD'),
    'currency',       'MYR',
    -- For self-billed, "supplier" in LHDN parlance = the BUYER (us); the actual vendor goes under "buyer"
    'supplier', jsonb_build_object(
      'tin',          cfg.tin,
      'name',         cfg.business_name,
      'sst_no',       cfg.sst_no,
      'reg_no',       cfg.registration_no,
      'address',      cfg.address_line,
      'city',         cfg.city, 'state', cfg.state, 'postcode', cfg.postcode,
      'country_code', cfg.country_code,
      'role',         'self_billed_issuer'
    ),
    'buyer', jsonb_build_object(
      'is_foreign',     coalesce(sup.is_foreign, false),
      'tin',            sup.tin,
      'foreign_tax_id', sup.foreign_tax_id,
      'name',           sup.name,
      'address',        sup.address,
      'city',           sup.city, 'state', sup.state, 'postcode', sup.postcode,
      'country_code',   sup.country_code,
      'email',          sup.einvoice_email,
      'phone',          sup.phone
    ),
    'lines',           v_lines,
    'subtotal',        v_total,
    'tax_total',       0,                           -- caller can override per line tax_classification
    'total',           v_total,
    'reference', jsonb_build_object(
      'purchase_order_id', po.id,
      'submission_id',     s.id,
      'self_billed_invoice_id', sbi.id,
      'parent_uin',        (select uin from restaurant.myinvois_submission where id = s.parent_submission_id)
    )
  );
end;
$$;

-- ---------- Wrapper: route by invoice_type so edge fn calls a single name ----------

create or replace function restaurant.einvoice_build_payload_any(p_submission_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = restaurant, public
as $$
declare
  v_type text;
begin
  select invoice_type into v_type from restaurant.myinvois_submission where id = p_submission_id;
  if v_type = 'self_billed' then
    return restaurant.einvoice_build_payload_self_billed(p_submission_id);
  else
    return restaurant.einvoice_build_payload(p_submission_id);
  end if;
end;
$$;

-- ---------- Mirror submission status onto self_billed_invoice + purchase_order ----------

create or replace function restaurant.tg_mis_mirror_self_billed()
returns trigger
language plpgsql
security definer
set search_path = restaurant, public
as $$
begin
  if new.invoice_type <> 'self_billed' or new.purchase_order_id is null then
    return new;
  end if;
  update restaurant.self_billed_invoice
    set status = case new.submission_status
                   when 'validated' then 'validated'
                   when 'failed'    then 'failed'
                   when 'escalated' then 'escalated'
                   else 'pending' end
    where purchase_order_id = new.purchase_order_id;
  update restaurant.purchase_order
    set self_billed_status = case new.submission_status
                               when 'validated' then 'validated'
                               when 'failed'    then 'failed'
                               when 'escalated' then 'escalated'
                               when 'pending_retry' then 'pending'
                               else self_billed_status end
    where id = new.purchase_order_id;
  return new;
end;
$$;

drop trigger if exists tg_mis_mirror_self_billed on restaurant.myinvois_submission;
create trigger tg_mis_mirror_self_billed
  after update of submission_status on restaurant.myinvois_submission
  for each row execute function restaurant.tg_mis_mirror_self_billed();

-- ---------- Mark self-billed as shared with supplier ----------

create or replace function restaurant.mark_self_billed_shared(
  p_purchase_order_id uuid,
  p_via text default 'email'
) returns void
language plpgsql
security definer
set search_path = restaurant, public
as $$
begin
  update restaurant.self_billed_invoice
    set status = 'shared',
        shared_with_supplier_at = now(),
        shared_via = p_via
    where purchase_order_id = p_purchase_order_id
      and status = 'validated';
  update restaurant.purchase_order
    set self_billed_status = 'shared'
    where id = p_purchase_order_id
      and self_billed_status = 'validated';
end;
$$;

-- ---------- RLS for new table ----------

do $$
declare r record;
begin
  for r in
    select tablename from pg_tables
    where schemaname = 'restaurant'
      and tablename = 'self_billed_invoice'
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

grant all on restaurant.self_billed_invoice to authenticated;
