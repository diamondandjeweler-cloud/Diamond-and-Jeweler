-- Guest (unauthenticated) access for the public QR menu ordering flow.
-- Policies stack with existing rst_all_authenticated (RLS uses OR logic).

-- Table-level grants for anon
grant select on restaurant.branch             to anon;
grant select on restaurant.menu_category      to anon;
grant select on restaurant.menu_item          to anon;
grant select on restaurant.modifier           to anon;
grant select on restaurant.restaurant_table   to anon;
grant select on restaurant.promotion          to anon;
grant select on restaurant.orders             to anon;
grant select on restaurant.order_item         to anon;
grant insert on restaurant.orders             to anon;
grant insert on restaurant.order_item         to anon;
grant insert on restaurant.kitchen_ticket     to anon;

-- Anon can read public menu data
create policy rst_anon_branch on restaurant.branch
  for select using (auth.role() = 'anon');

create policy rst_anon_menu_category on restaurant.menu_category
  for select using (auth.role() = 'anon');

create policy rst_anon_menu_item on restaurant.menu_item
  for select using (auth.role() = 'anon' and is_active = true);

create policy rst_anon_modifier on restaurant.modifier
  for select using (auth.role() = 'anon' and is_active = true);

create policy rst_anon_table on restaurant.restaurant_table
  for select using (auth.role() = 'anon');

create policy rst_anon_promotion on restaurant.promotion
  for select using (auth.role() = 'anon' and is_active = true);

-- Anon can place orders (guest ordering)
create policy rst_anon_insert_orders on restaurant.orders
  for insert with check (auth.role() = 'anon');

create policy rst_anon_insert_order_item on restaurant.order_item
  for insert with check (auth.role() = 'anon');

create policy rst_anon_insert_kitchen_ticket on restaurant.kitchen_ticket
  for insert with check (auth.role() = 'anon');

-- Anon can read orders + items for order tracking (UUIDs are unguessable)
create policy rst_anon_read_orders on restaurant.orders
  for select using (auth.role() = 'anon');

create policy rst_anon_read_order_item on restaurant.order_item
  for select using (auth.role() = 'anon');
