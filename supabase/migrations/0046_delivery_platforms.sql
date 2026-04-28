-- Delivery platform integration support for restaurant orders.
-- Platforms: GrabFood, FoodPanda, Shopee Food (Malaysia)
--
-- Webhook handlers run as Edge Functions using the service-role key,
-- which bypasses RLS automatically — no additional grants needed.

ALTER TABLE restaurant.orders
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'waiter'
    CONSTRAINT orders_source_check
    CHECK (source IN ('waiter','kiosk','qr','grab','foodpanda','shopee')),
  ADD COLUMN IF NOT EXISTS external_order_id text;

-- Prevent duplicate platform orders being inserted twice (platform retries)
CREATE UNIQUE INDEX IF NOT EXISTS orders_external_order_id_uniq
  ON restaurant.orders (external_order_id)
  WHERE external_order_id IS NOT NULL;

-- Platform item ID mappings stored per menu item.
-- Format: {"grab": "GF-ITEM-123", "foodpanda": "FP456", "shopee": "SE789"}
-- Used by webhook handlers to match incoming items to our menu_item rows.
ALTER TABLE restaurant.menu_item
  ADD COLUMN IF NOT EXISTS platform_ids jsonb NOT NULL DEFAULT '{}'::jsonb;
