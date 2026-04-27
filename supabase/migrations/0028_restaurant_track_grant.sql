-- ============================================================
-- Phase 3 fix — anon role needs GRANT to read public-trackable tables.
-- RLS was already permitting reads, but PostgREST's anon role didn't have
-- table-level SELECT grants on the restaurant schema.
-- ============================================================

grant usage on schema restaurant to anon;
grant select on restaurant.orders to anon;
grant select on restaurant.order_item to anon;
grant select on restaurant.menu_item to anon;
