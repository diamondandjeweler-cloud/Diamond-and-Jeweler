-- ============================================================
-- Restaurant Operating System — Schema (temporary dev feature)
-- Isolated in its own `restaurant` Postgres schema so it does not
-- pollute BoLe's recruitment tables. When this feature migrates
-- to its own Supabase project, this single schema can be dumped
-- and restored cleanly.
-- ============================================================

create schema if not exists restaurant;

-- ---------- Generic updated_at trigger (schema-local) ----------

create or replace function restaurant.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------- BRANCH ----------
create table restaurant.branch (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  address      text,
  timezone     text default 'Asia/Kuala_Lumpur',
  status       text not null default 'active' check (status in ('active','inactive','archived')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger tg_branch_updated_at before update on restaurant.branch
  for each row execute function restaurant.tg_set_updated_at();

-- ---------- TABLES & SEATING ----------
create table restaurant.restaurant_table (
  id                  uuid primary key default gen_random_uuid(),
  branch_id           uuid not null references restaurant.branch(id) on delete cascade,
  table_number        text not null,
  capacity            int not null check (capacity > 0),
  shape               text check (shape in ('round','square','rectangle','booth')),
  area                text check (area in ('indoor','outdoor','bar','patio','private')),
  status              text not null default 'free'
                      check (status in ('free','occupied','reserved','cleaning','out_of_service')),
  pos_x               int default 0,
  pos_y               int default 0,
  last_status_change  timestamptz default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (branch_id, table_number)
);
create index idx_rt_branch on restaurant.restaurant_table(branch_id);
create index idx_rt_status on restaurant.restaurant_table(status);
create trigger tg_rt_updated_at before update on restaurant.restaurant_table
  for each row execute function restaurant.tg_set_updated_at();

create table restaurant.section (
  id         uuid primary key default gen_random_uuid(),
  branch_id  uuid not null references restaurant.branch(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);

create table restaurant.table_section (
  table_id   uuid references restaurant.restaurant_table(id) on delete cascade,
  section_id uuid references restaurant.section(id) on delete cascade,
  primary key (table_id, section_id)
);

create table restaurant.reservation (
  id                uuid primary key default gen_random_uuid(),
  branch_id         uuid not null references restaurant.branch(id) on delete cascade,
  table_id          uuid references restaurant.restaurant_table(id) on delete set null,
  customer_name     text not null,
  phone             text,
  party_size        int not null check (party_size > 0),
  reservation_time  timestamptz not null,
  duration_minutes  int not null default 90,
  status            text not null default 'confirmed'
                    check (status in ('confirmed','seated','cancelled','no_show','completed')),
  notes             text,
  reminder_sent_at  timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index idx_res_time on restaurant.reservation(reservation_time);
create index idx_res_branch on restaurant.reservation(branch_id);
create trigger tg_res_updated_at before update on restaurant.reservation
  for each row execute function restaurant.tg_set_updated_at();

create table restaurant.waitlist (
  id                     uuid primary key default gen_random_uuid(),
  branch_id              uuid not null references restaurant.branch(id) on delete cascade,
  customer_name          text not null,
  phone                  text,
  party_size             int not null check (party_size > 0),
  requested_at           timestamptz not null default now(),
  estimated_wait_minutes int,
  seated_at              timestamptz,
  status                 text not null default 'waiting'
                         check (status in ('waiting','notified','seated','abandoned','cancelled'))
);
create index idx_wl_status on restaurant.waitlist(status);
create index idx_wl_branch on restaurant.waitlist(branch_id);

-- ---------- SUPPLIER ----------
create table restaurant.supplier (
  id           uuid primary key default gen_random_uuid(),
  branch_id    uuid references restaurant.branch(id) on delete cascade,
  name         text not null,
  contact_name text,
  phone        text,
  email        text,
  lead_time_days int default 3,
  notes        text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

-- ---------- MENU & RECIPE ----------
create table restaurant.menu_category (
  id         uuid primary key default gen_random_uuid(),
  branch_id  uuid references restaurant.branch(id) on delete cascade,
  name       text not null,
  sort_order int default 0,
  icon       text,
  is_active  boolean not null default true
);

create table restaurant.menu_item (
  id           uuid primary key default gen_random_uuid(),
  branch_id    uuid not null references restaurant.branch(id) on delete cascade,
  category_id  uuid references restaurant.menu_category(id) on delete set null,
  name         text not null,
  description  text,
  price        numeric(10,2) not null check (price >= 0),
  station      text,
  image_url    text,
  is_active    boolean not null default true,
  course_type  text check (course_type in ('appetizer','main','dessert','drink','side','any')) default 'any',
  available_from time,
  available_until time,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index idx_mi_branch on restaurant.menu_item(branch_id);
create index idx_mi_category on restaurant.menu_item(category_id);
create trigger tg_mi_updated_at before update on restaurant.menu_item
  for each row execute function restaurant.tg_set_updated_at();

create table restaurant.modifier (
  id           uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references restaurant.menu_item(id) on delete cascade,
  name         text not null,
  price_delta  numeric(10,2) not null default 0,
  is_active    boolean not null default true
);
create index idx_mod_menu on restaurant.modifier(menu_item_id);

create table restaurant.ingredient (
  id             uuid primary key default gen_random_uuid(),
  branch_id      uuid not null references restaurant.branch(id) on delete cascade,
  name           text not null,
  unit           text not null,
  current_stock  numeric(12,3) not null default 0,
  reorder_level  numeric(12,3) default 0,
  cost_per_unit  numeric(10,4) not null default 0,
  supplier_id    uuid references restaurant.supplier(id) on delete set null,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index idx_ing_branch on restaurant.ingredient(branch_id);
create trigger tg_ing_updated_at before update on restaurant.ingredient
  for each row execute function restaurant.tg_set_updated_at();

create table restaurant.recipe (
  menu_item_id  uuid references restaurant.menu_item(id) on delete cascade,
  ingredient_id uuid references restaurant.ingredient(id) on delete restrict,
  quantity      numeric(12,3) not null check (quantity >= 0),
  primary key (menu_item_id, ingredient_id)
);

-- ---------- EMPLOYEE & STAFF ----------
create table restaurant.employee (
  id           uuid primary key default gen_random_uuid(),
  branch_id    uuid not null references restaurant.branch(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  name         text not null,
  role         text not null check (role in (
                 'waiter','kitchen','bar','cashier','host','storekeeper',
                 'shift_manager','admin','owner')),
  hourly_rate  numeric(10,2) default 0,
  pin          text,
  rfid         text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index idx_emp_branch on restaurant.employee(branch_id);
create index idx_emp_role on restaurant.employee(role);
create trigger tg_emp_updated_at before update on restaurant.employee
  for each row execute function restaurant.tg_set_updated_at();

create table restaurant.waiter_section (
  employee_id uuid references restaurant.employee(id) on delete cascade,
  section_id  uuid references restaurant.section(id) on delete cascade,
  shift_start timestamptz not null,
  shift_end   timestamptz,
  primary key (employee_id, section_id, shift_start)
);

create table restaurant.timesheet (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references restaurant.employee(id) on delete cascade,
  branch_id    uuid not null references restaurant.branch(id) on delete cascade,
  clock_in     timestamptz not null default now(),
  clock_out    timestamptz,
  total_hours  numeric(6,2),
  overtime_hours numeric(6,2) default 0,
  break_minutes int default 0,
  approved_by  uuid references restaurant.employee(id) on delete set null,
  notes        text,
  created_at   timestamptz not null default now()
);
create index idx_ts_emp on restaurant.timesheet(employee_id);
create index idx_ts_branch on restaurant.timesheet(branch_id);

-- ---------- CUSTOMERS & MEMBERSHIP ----------
create table restaurant.membership (
  id         uuid primary key default gen_random_uuid(),
  branch_id  uuid references restaurant.branch(id) on delete cascade,
  name       text,
  phone      text,
  email      text,
  points     int not null default 0,
  birthday   date,
  tier       text default 'bronze' check (tier in ('bronze','silver','gold','platinum')),
  created_at timestamptz not null default now(),
  unique (branch_id, phone)
);

-- ---------- ORDERS & COURSES ----------
create table restaurant.orders (
  id              uuid primary key default gen_random_uuid(),
  branch_id       uuid not null references restaurant.branch(id) on delete cascade,
  table_id        uuid references restaurant.restaurant_table(id) on delete set null,
  seat_number     int,
  order_type      text not null check (order_type in ('dinein','takeaway','delivery','bar')),
  customer_name   text,
  customer_phone  text,
  membership_id   uuid references restaurant.membership(id) on delete set null,
  waiter_id       uuid references restaurant.employee(id) on delete set null,
  status          text not null default 'active'
                  check (status in ('active','sent','partial','ready','served','paid','closed','voided')),
  subtotal        numeric(10,2) not null default 0,
  discount        numeric(10,2) not null default 0,
  tax             numeric(10,2) not null default 0,
  tip             numeric(10,2) not null default 0,
  total           numeric(10,2) not null default 0,
  pickup_time     timestamptz,
  delivery_address text,
  delivery_fee    numeric(10,2) default 0,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  closed_at       timestamptz
);
create index idx_ord_branch on restaurant.orders(branch_id);
create index idx_ord_table on restaurant.orders(table_id);
create index idx_ord_status on restaurant.orders(status);
create index idx_ord_created on restaurant.orders(created_at);
create trigger tg_ord_updated_at before update on restaurant.orders
  for each row execute function restaurant.tg_set_updated_at();

create table restaurant.order_item (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references restaurant.orders(id) on delete cascade,
  menu_item_id        uuid not null references restaurant.menu_item(id) on delete restrict,
  quantity            int not null default 1 check (quantity > 0),
  unit_price          numeric(10,2) not null,
  modifier_ids        jsonb default '[]'::jsonb,
  modifiers_total     numeric(10,2) default 0,
  special_instruction text,
  course_type         text check (course_type in ('appetizer','main','dessert','drink','side','any')) default 'any',
  status              text not null default 'pending'
                      check (status in ('pending','held','fired','preparing','ready','served','voided','rejected')),
  voided_reason       text,
  voided_by           uuid references restaurant.employee(id) on delete set null,
  voided_at           timestamptz,
  created_at          timestamptz not null default now()
);
create index idx_oi_order on restaurant.order_item(order_id);
create index idx_oi_status on restaurant.order_item(status);
create index idx_oi_course on restaurant.order_item(course_type);

create table restaurant.course_firing (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references restaurant.orders(id) on delete cascade,
  course_number int not null,
  course_type   text not null,
  fired_at      timestamptz,
  cleared_at    timestamptz,
  status        text not null default 'held'
                check (status in ('held','fired','served','cleared')),
  fired_by      uuid references restaurant.employee(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index idx_cf_order on restaurant.course_firing(order_id);

-- ---------- KITCHEN TICKETS ----------
create table restaurant.kitchen_ticket (
  id             uuid primary key default gen_random_uuid(),
  branch_id      uuid not null references restaurant.branch(id) on delete cascade,
  order_id       uuid not null references restaurant.orders(id) on delete cascade,
  order_item_id  uuid references restaurant.order_item(id) on delete cascade,
  station        text not null,
  status         text not null default 'pending'
                 check (status in ('pending','acknowledged','started','ready','completed','rejected')),
  acknowledged_at timestamptz,
  started_at     timestamptz,
  ready_at       timestamptz,
  completed_at   timestamptz,
  rejected_reason text,
  assigned_to    uuid references restaurant.employee(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index idx_kt_station on restaurant.kitchen_ticket(station, status);
create index idx_kt_order on restaurant.kitchen_ticket(order_id);
create index idx_kt_branch on restaurant.kitchen_ticket(branch_id);

-- ---------- INVENTORY TRANSACTIONS ----------
create table restaurant.inventory_transaction (
  id                  uuid primary key default gen_random_uuid(),
  branch_id           uuid not null references restaurant.branch(id) on delete cascade,
  ingredient_id       uuid not null references restaurant.ingredient(id) on delete restrict,
  quantity            numeric(12,3) not null,
  type                text not null check (type in (
                        'sale','receive','waste','transfer_out','transfer_in',
                        'adjustment','reserve','release')),
  unit_cost           numeric(10,4),
  reference_order_id  uuid references restaurant.orders(id) on delete set null,
  reference_po_id     uuid,
  reason              text,
  created_by          uuid references restaurant.employee(id) on delete set null,
  created_at          timestamptz not null default now()
);
create index idx_inv_ingredient on restaurant.inventory_transaction(ingredient_id);
create index idx_inv_type on restaurant.inventory_transaction(type);
create index idx_inv_created on restaurant.inventory_transaction(created_at);

-- ---------- PURCHASE ORDER ----------
create table restaurant.purchase_order (
  id             uuid primary key default gen_random_uuid(),
  branch_id      uuid not null references restaurant.branch(id) on delete cascade,
  supplier_id    uuid references restaurant.supplier(id) on delete set null,
  status         text not null default 'draft'
                 check (status in ('draft','sent','partial','received','cancelled')),
  expected_date  date,
  sent_at        timestamptz,
  received_at    timestamptz,
  total_cost     numeric(12,2) default 0,
  created_by     uuid references restaurant.employee(id) on delete set null,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index idx_po_branch on restaurant.purchase_order(branch_id);
create index idx_po_status on restaurant.purchase_order(status);
create trigger tg_po_updated_at before update on restaurant.purchase_order
  for each row execute function restaurant.tg_set_updated_at();

create table restaurant.purchase_order_line (
  id             uuid primary key default gen_random_uuid(),
  po_id          uuid not null references restaurant.purchase_order(id) on delete cascade,
  ingredient_id  uuid not null references restaurant.ingredient(id) on delete restrict,
  ordered_qty    numeric(12,3) not null,
  received_qty   numeric(12,3) default 0,
  unit_cost      numeric(10,4) not null default 0,
  line_total     numeric(12,2) generated always as (ordered_qty * unit_cost) stored
);
create index idx_pol_po on restaurant.purchase_order_line(po_id);

-- Add FK now that purchase_order exists
alter table restaurant.inventory_transaction
  add constraint inv_tx_po_fk foreign key (reference_po_id)
  references restaurant.purchase_order(id) on delete set null;

-- ---------- STOCK TAKE ----------
create table restaurant.stock_take (
  id          uuid primary key default gen_random_uuid(),
  branch_id   uuid not null references restaurant.branch(id) on delete cascade,
  status      text not null default 'draft' check (status in ('draft','counting','adjusted','cancelled')),
  counted_by  uuid references restaurant.employee(id) on delete set null,
  approved_by uuid references restaurant.employee(id) on delete set null,
  created_at  timestamptz not null default now(),
  completed_at timestamptz
);

create table restaurant.stock_take_line (
  id            uuid primary key default gen_random_uuid(),
  stock_take_id uuid not null references restaurant.stock_take(id) on delete cascade,
  ingredient_id uuid not null references restaurant.ingredient(id) on delete restrict,
  system_qty    numeric(12,3) not null,
  counted_qty   numeric(12,3),
  variance      numeric(12,3) generated always as (coalesce(counted_qty,0) - system_qty) stored,
  variance_reason text
);

-- ---------- PAYMENTS & SHIFT ----------
create table restaurant.payment (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references restaurant.orders(id) on delete cascade,
  amount      numeric(10,2) not null,
  method      text not null check (method in ('cash','card','qr','gift_card','loyalty','voucher','bank_transfer')),
  status      text not null default 'completed' check (status in ('pending','completed','refunded','failed','voided')),
  receipt_no  text,
  reference   text,
  processed_by uuid references restaurant.employee(id) on delete set null,
  refunded_by uuid references restaurant.employee(id) on delete set null,
  refunded_at timestamptz,
  refund_reason text,
  created_at  timestamptz not null default now()
);
create index idx_pay_order on restaurant.payment(order_id);
create index idx_pay_created on restaurant.payment(created_at);

create table restaurant.cashier_shift (
  id              uuid primary key default gen_random_uuid(),
  branch_id       uuid not null references restaurant.branch(id) on delete cascade,
  employee_id     uuid not null references restaurant.employee(id) on delete restrict,
  opened_at       timestamptz not null default now(),
  closed_at       timestamptz,
  opening_float   numeric(10,2) not null default 0,
  expected_cash   numeric(10,2),
  actual_cash     numeric(10,2),
  variance        numeric(10,2),
  x_report_json   jsonb,
  z_report_json   jsonb,
  approved_by     uuid references restaurant.employee(id) on delete set null,
  notes           text
);
create index idx_shift_branch on restaurant.cashier_shift(branch_id);
create index idx_shift_emp on restaurant.cashier_shift(employee_id);

-- ---------- PROMOTIONS ----------
create table restaurant.promotion (
  id         uuid primary key default gen_random_uuid(),
  branch_id  uuid references restaurant.branch(id) on delete cascade,
  name       text not null,
  type       text not null check (type in (
               'time_based','bogo','combo','coupon','membership','table_area','percent_off','flat_off')),
  rule_json  jsonb not null default '{}'::jsonb,
  start_date timestamptz,
  end_date   timestamptz,
  is_active  boolean not null default true,
  code       text,
  usage_limit int,
  usage_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_promo_active on restaurant.promotion(is_active);
create index idx_promo_code on restaurant.promotion(code);
create trigger tg_promo_updated_at before update on restaurant.promotion
  for each row execute function restaurant.tg_set_updated_at();

create table restaurant.promotion_redemption (
  id           uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references restaurant.promotion(id) on delete cascade,
  order_id     uuid references restaurant.orders(id) on delete set null,
  membership_id uuid references restaurant.membership(id) on delete set null,
  discount_amount numeric(10,2) not null,
  created_at   timestamptz not null default now()
);

-- ---------- AUDIT & WASTE ----------
create table restaurant.audit_log (
  id           uuid primary key default gen_random_uuid(),
  branch_id    uuid references restaurant.branch(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete set null,
  employee_id  uuid references restaurant.employee(id) on delete set null,
  action       text not null,
  entity_type  text,
  entity_id    uuid,
  old_value    jsonb,
  new_value    jsonb,
  reason       text,
  ip_address   text,
  created_at   timestamptz not null default now()
);
create index idx_audit_entity on restaurant.audit_log(entity_type, entity_id);
create index idx_audit_created on restaurant.audit_log(created_at);
create index idx_audit_branch on restaurant.audit_log(branch_id);

create table restaurant.waste_log (
  id            uuid primary key default gen_random_uuid(),
  branch_id     uuid not null references restaurant.branch(id) on delete cascade,
  ingredient_id uuid references restaurant.ingredient(id) on delete set null,
  order_id      uuid references restaurant.orders(id) on delete set null,
  quantity      numeric(12,3) not null,
  reason        text not null check (reason in ('expired','remake','broken','spill','overcook','customer_return','prep_error','other')),
  value_cost    numeric(10,2),
  created_by    uuid references restaurant.employee(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index idx_waste_branch on restaurant.waste_log(branch_id);
create index idx_waste_created on restaurant.waste_log(created_at);

-- ---------- CROSS-BRANCH TRANSFER ----------
create table restaurant.stock_transfer (
  id              uuid primary key default gen_random_uuid(),
  from_branch_id  uuid not null references restaurant.branch(id) on delete restrict,
  to_branch_id    uuid not null references restaurant.branch(id) on delete restrict,
  status          text not null default 'draft'
                  check (status in ('draft','sent','received','cancelled')),
  ingredient_id   uuid not null references restaurant.ingredient(id) on delete restrict,
  quantity        numeric(12,3) not null,
  unit_cost       numeric(10,4) not null default 0,
  created_by      uuid references restaurant.employee(id) on delete set null,
  received_by     uuid references restaurant.employee(id) on delete set null,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz,
  received_at     timestamptz,
  notes           text
);
create index idx_xfer_from on restaurant.stock_transfer(from_branch_id);
create index idx_xfer_to on restaurant.stock_transfer(to_branch_id);

-- ---------- NOTIFICATIONS (in-app) ----------
create table restaurant.notification (
  id          uuid primary key default gen_random_uuid(),
  branch_id   uuid references restaurant.branch(id) on delete cascade,
  employee_id uuid references restaurant.employee(id) on delete cascade,
  type        text not null,
  title       text not null,
  body        text,
  payload     jsonb default '{}'::jsonb,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index idx_notif_emp on restaurant.notification(employee_id, read_at);

-- ---------- Helper: current user's membership in restaurant ----------
-- (stub for access-control; refined in RLS migration)

create or replace function restaurant.current_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, restaurant
as $$
  select coalesce((
    select role = 'admin' from public.profiles where id = auth.uid()
  ), false);
$$;
