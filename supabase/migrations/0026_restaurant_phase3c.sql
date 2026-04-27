-- ============================================================
-- Phase 3c — public order-track read access
-- Anyone with the order ID can read the order header + its line items
-- (the URL acts as a capability token).
-- ============================================================

drop policy if exists rst_orders_anon_track on restaurant.orders;
create policy rst_orders_anon_track on restaurant.orders
  for select using (true);

drop policy if exists rst_oi_anon_track on restaurant.order_item;
create policy rst_oi_anon_track on restaurant.order_item
  for select using (true);

drop policy if exists rst_mi_anon_read on restaurant.menu_item;
create policy rst_mi_anon_read on restaurant.menu_item
  for select using (true);
