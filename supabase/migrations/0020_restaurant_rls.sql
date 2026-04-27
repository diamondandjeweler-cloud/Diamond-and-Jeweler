-- ============================================================
-- Restaurant Operating System — RLS + seed
-- Policy: any authenticated BoLe user can read/write restaurant.*
-- (temporary dev feature — admin-style access for all authed users).
-- Tightened policies can be added when the feature migrates out.
-- ============================================================

-- Expose `restaurant` schema to PostgREST / supabase-js
grant usage on schema restaurant to anon, authenticated;
grant all on all tables in schema restaurant to authenticated;
grant all on all sequences in schema restaurant to authenticated;
grant all on all functions in schema restaurant to authenticated;
alter default privileges in schema restaurant
  grant all on tables to authenticated;
alter default privileges in schema restaurant
  grant all on sequences to authenticated;
alter default privileges in schema restaurant
  grant all on functions to authenticated;

-- Enable RLS on every table in restaurant schema
do $$
declare r record;
begin
  for r in
    select tablename from pg_tables where schemaname = 'restaurant'
  loop
    execute format('alter table restaurant.%I enable row level security', r.tablename);
  end loop;
end $$;

-- One-policy-per-table: any authenticated user can do anything.
-- (Will tighten when feature migrates to its own Supabase.)
do $$
declare r record;
begin
  for r in
    select tablename from pg_tables where schemaname = 'restaurant'
  loop
    execute format($p$
      create policy rst_all_authenticated on restaurant.%I
        for all
        using (auth.role() = 'authenticated')
        with check (auth.role() = 'authenticated')
    $p$, r.tablename);
  end loop;
end $$;

-- ============================================================
-- SEED DATA — one demo branch with menu + ingredients + tables
-- ============================================================

do $$
declare
  v_branch uuid;
  v_cat_starters uuid; v_cat_mains uuid; v_cat_drinks uuid; v_cat_desserts uuid;
  v_ing_beef uuid; v_ing_bun uuid; v_ing_cheese uuid; v_ing_potato uuid;
  v_ing_coffee uuid; v_ing_milk uuid; v_ing_sugar uuid; v_ing_icecream uuid;
  v_ing_chicken uuid; v_ing_rice uuid; v_ing_tomato uuid; v_ing_lettuce uuid;
  v_mi_burger uuid; v_mi_fries uuid; v_mi_chicken_rice uuid; v_mi_salad uuid;
  v_mi_latte uuid; v_mi_espresso uuid; v_mi_ice_cream uuid; v_mi_tiramisu uuid;
  v_supplier uuid;
begin
  -- Only seed if no branch exists yet
  if exists (select 1 from restaurant.branch limit 1) then
    return;
  end if;

  insert into restaurant.branch (name, address, timezone, status)
  values ('Dev Kitchen · KL', 'Jalan Dev, Kuala Lumpur', 'Asia/Kuala_Lumpur', 'active')
  returning id into v_branch;

  -- Supplier
  insert into restaurant.supplier (branch_id, name, contact_name, phone, email, lead_time_days)
  values (v_branch, 'KL Fresh Supply', 'Ahmad', '+60-12-3456789', 'orders@klfresh.my', 2)
  returning id into v_supplier;

  -- Categories
  insert into restaurant.menu_category (branch_id, name, sort_order, icon) values
    (v_branch, 'Starters', 1, 'starter'),
    (v_branch, 'Mains',    2, 'main'),
    (v_branch, 'Drinks',   3, 'drink'),
    (v_branch, 'Desserts', 4, 'dessert');

  select id into v_cat_starters from restaurant.menu_category where branch_id=v_branch and name='Starters';
  select id into v_cat_mains    from restaurant.menu_category where branch_id=v_branch and name='Mains';
  select id into v_cat_drinks   from restaurant.menu_category where branch_id=v_branch and name='Drinks';
  select id into v_cat_desserts from restaurant.menu_category where branch_id=v_branch and name='Desserts';

  -- Ingredients
  insert into restaurant.ingredient (branch_id, name, unit, current_stock, reorder_level, cost_per_unit, supplier_id) values
    (v_branch, 'Beef patty',    'g',   10000, 2000, 0.08, v_supplier),
    (v_branch, 'Burger bun',    'pcs',   200,   50, 1.20, v_supplier),
    (v_branch, 'Cheese slice',  'pcs',   300,  100, 0.80, v_supplier),
    (v_branch, 'Potato',        'g',   15000, 3000, 0.02, v_supplier),
    (v_branch, 'Coffee beans',  'g',    5000, 1000, 0.15, v_supplier),
    (v_branch, 'Milk',          'ml',  10000, 2000, 0.01, v_supplier),
    (v_branch, 'Sugar',         'g',    8000, 1000, 0.005, v_supplier),
    (v_branch, 'Ice cream',     'ml',   6000, 1500, 0.04, v_supplier),
    (v_branch, 'Chicken breast','g',   12000, 2500, 0.05, v_supplier),
    (v_branch, 'Jasmine rice',  'g',   20000, 5000, 0.008, v_supplier),
    (v_branch, 'Tomato',        'g',    4000, 1000, 0.015, v_supplier),
    (v_branch, 'Lettuce',       'g',    3000,  800, 0.020, v_supplier);

  select id into v_ing_beef     from restaurant.ingredient where branch_id=v_branch and name='Beef patty';
  select id into v_ing_bun      from restaurant.ingredient where branch_id=v_branch and name='Burger bun';
  select id into v_ing_cheese   from restaurant.ingredient where branch_id=v_branch and name='Cheese slice';
  select id into v_ing_potato   from restaurant.ingredient where branch_id=v_branch and name='Potato';
  select id into v_ing_coffee   from restaurant.ingredient where branch_id=v_branch and name='Coffee beans';
  select id into v_ing_milk     from restaurant.ingredient where branch_id=v_branch and name='Milk';
  select id into v_ing_sugar    from restaurant.ingredient where branch_id=v_branch and name='Sugar';
  select id into v_ing_icecream from restaurant.ingredient where branch_id=v_branch and name='Ice cream';
  select id into v_ing_chicken  from restaurant.ingredient where branch_id=v_branch and name='Chicken breast';
  select id into v_ing_rice     from restaurant.ingredient where branch_id=v_branch and name='Jasmine rice';
  select id into v_ing_tomato   from restaurant.ingredient where branch_id=v_branch and name='Tomato';
  select id into v_ing_lettuce  from restaurant.ingredient where branch_id=v_branch and name='Lettuce';

  -- Menu items
  insert into restaurant.menu_item (branch_id, category_id, name, description, price, station, course_type, is_active) values
    (v_branch, v_cat_mains,    'Cheeseburger',      'Grilled beef patty, cheddar, lettuce, tomato, brioche bun', 22.90, 'grill', 'main', true),
    (v_branch, v_cat_starters, 'Fries',             'Hand-cut, double-fried golden fries',                        8.90, 'fry',   'appetizer', true),
    (v_branch, v_cat_mains,    'Chicken Rice',      'Steamed jasmine rice with poached chicken',                 15.90, 'wok',   'main', true),
    (v_branch, v_cat_starters, 'Garden Salad',      'Fresh greens, tomato, house dressing',                       9.90, 'salad', 'appetizer', true),
    (v_branch, v_cat_drinks,   'Cafe Latte',        'Double espresso with steamed milk',                         12.00, 'bar',   'drink', true),
    (v_branch, v_cat_drinks,   'Espresso',          'Single shot, robust & bold',                                 8.00, 'bar',   'drink', true),
    (v_branch, v_cat_desserts, 'Vanilla Ice Cream', 'Two scoops of premium vanilla',                              6.50, 'bar',   'dessert', true),
    (v_branch, v_cat_desserts, 'Tiramisu',          'Classic Italian layered dessert',                           14.90, 'bar',   'dessert', true);

  select id into v_mi_burger       from restaurant.menu_item where branch_id=v_branch and name='Cheeseburger';
  select id into v_mi_fries        from restaurant.menu_item where branch_id=v_branch and name='Fries';
  select id into v_mi_chicken_rice from restaurant.menu_item where branch_id=v_branch and name='Chicken Rice';
  select id into v_mi_salad        from restaurant.menu_item where branch_id=v_branch and name='Garden Salad';
  select id into v_mi_latte        from restaurant.menu_item where branch_id=v_branch and name='Cafe Latte';
  select id into v_mi_espresso     from restaurant.menu_item where branch_id=v_branch and name='Espresso';
  select id into v_mi_ice_cream    from restaurant.menu_item where branch_id=v_branch and name='Vanilla Ice Cream';
  select id into v_mi_tiramisu     from restaurant.menu_item where branch_id=v_branch and name='Tiramisu';

  -- Recipes (BOM)
  insert into restaurant.recipe (menu_item_id, ingredient_id, quantity) values
    (v_mi_burger, v_ing_beef,    150),
    (v_mi_burger, v_ing_bun,     1),
    (v_mi_burger, v_ing_cheese,  1),
    (v_mi_burger, v_ing_lettuce, 20),
    (v_mi_burger, v_ing_tomato,  30),
    (v_mi_fries,  v_ing_potato,  200),
    (v_mi_chicken_rice, v_ing_chicken, 180),
    (v_mi_chicken_rice, v_ing_rice,    150),
    (v_mi_salad,  v_ing_lettuce, 80),
    (v_mi_salad,  v_ing_tomato,  50),
    (v_mi_latte,  v_ing_coffee,  18),
    (v_mi_latte,  v_ing_milk,    200),
    (v_mi_latte,  v_ing_sugar,   5),
    (v_mi_espresso, v_ing_coffee, 18),
    (v_mi_ice_cream, v_ing_icecream, 200),
    (v_mi_tiramisu,  v_ing_icecream,  100),
    (v_mi_tiramisu,  v_ing_coffee,    10),
    (v_mi_tiramisu,  v_ing_sugar,     15);

  -- Modifiers
  insert into restaurant.modifier (menu_item_id, name, price_delta) values
    (v_mi_burger, 'Extra cheese',     3.00),
    (v_mi_burger, 'Extra patty',      8.00),
    (v_mi_burger, 'No onion',         0.00),
    (v_mi_burger, 'Gluten-free bun',  2.50),
    (v_mi_fries,  'Truffle oil',      4.00),
    (v_mi_fries,  'Extra salt',       0.00),
    (v_mi_latte,  'Extra shot',       3.00),
    (v_mi_latte,  'Oat milk',         2.00),
    (v_mi_latte,  'Decaf',            0.00),
    (v_mi_chicken_rice, 'Spicy sauce', 0.00),
    (v_mi_chicken_rice, 'Extra chicken', 5.00);

  -- Tables
  insert into restaurant.restaurant_table (branch_id, table_number, capacity, shape, area, status, pos_x, pos_y) values
    (v_branch, 'T1',  2, 'round',     'indoor', 'free', 50, 50),
    (v_branch, 'T2',  2, 'round',     'indoor', 'free', 150, 50),
    (v_branch, 'T3',  4, 'square',    'indoor', 'free', 250, 50),
    (v_branch, 'T4',  4, 'square',    'indoor', 'free', 350, 50),
    (v_branch, 'T5',  6, 'rectangle', 'indoor', 'free', 50, 180),
    (v_branch, 'T6',  6, 'rectangle', 'indoor', 'free', 200, 180),
    (v_branch, 'T7',  4, 'booth',     'indoor', 'free', 50, 310),
    (v_branch, 'T8',  4, 'booth',     'indoor', 'free', 200, 310),
    (v_branch, 'P1',  4, 'round',     'patio',  'free', 450, 50),
    (v_branch, 'P2',  4, 'round',     'patio',  'free', 450, 180),
    (v_branch, 'B1',  2, 'square',    'bar',    'free', 600, 50),
    (v_branch, 'B2',  2, 'square',    'bar',    'free', 600, 130);

  -- Sections
  insert into restaurant.section (branch_id, name) values
    (v_branch, 'Section A'),
    (v_branch, 'Section B'),
    (v_branch, 'Patio'),
    (v_branch, 'Bar');

  -- Demo promotion (happy hour 5-7pm, 20% off drinks)
  insert into restaurant.promotion (branch_id, name, type, rule_json, start_date, is_active) values
    (v_branch, 'Happy Hour', 'time_based',
     '{"start_time":"17:00","end_time":"19:00","discount_pct":20,"categories":["Drinks"]}'::jsonb,
     now(), true),
    (v_branch, 'WELCOME10', 'coupon',
     '{"discount_pct":10,"min_spend":20}'::jsonb,
     now(), true);

  update restaurant.promotion set code = 'WELCOME10' where branch_id = v_branch and type = 'coupon';

  -- Demo employees (not linked to auth users — for kitchen/cashier PIN login)
  insert into restaurant.employee (branch_id, name, role, hourly_rate, pin) values
    (v_branch, 'Alex Lim',      'waiter',        18.00, '1111'),
    (v_branch, 'Sam Tan',       'kitchen',       22.00, '2222'),
    (v_branch, 'Jordan Wong',   'bar',           20.00, '3333'),
    (v_branch, 'Riley Chen',    'cashier',       19.00, '4444'),
    (v_branch, 'Morgan Yap',    'host',          17.00, '5555'),
    (v_branch, 'Casey Ng',      'shift_manager', 28.00, '9999');
end $$;
