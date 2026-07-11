-- =============================================================================
-- 0185 — pin search_path on restaurant SECURITY DEFINER functions  (L1)
--        (2026-07-11)
-- =============================================================================
-- The multi-tenancy helpers/RPCs created in 0047_restaurant_multitenancy.sql are
-- SECURITY DEFINER but omit `SET search_path`, so they resolve unqualified names
-- against the caller's search_path. A caller who prepends a schema they control
-- could shadow a referenced object and hijack execution under the definer's
-- (elevated) privileges. Verified in 0047 — none of these carry a search_path:
--
--   restaurant.my_org_id()                                   0047:80-84
--   restaurant.is_platform_admin()                           0047:87-93
--   restaurant.is_org_owner()                                0047:96-102
--   restaurant.create_org(text, text)                        0047:108-137
--   restaurant.add_org_member(uuid, text, boolean)           0047:142-177
--   restaurant.remove_org_member(uuid, uuid)                 0047:182-203
--
-- FIX: ALTER FUNCTION ... SET search_path = restaurant, public, pg_temp on each
-- (matches the definer hygiene used by 0173 / restaurant.get_order_tracking in
-- 0183). ALTER only — bodies are not recreated. Guarded by to_regprocedure() so
-- a since-dropped function is skipped (with a NOTICE) rather than erroring.
-- ALTER ... SET is naturally idempotent (re-applies the same setting).
--
-- Not applied to any DB by this file.
--
-- ROLLBACK: alter function <sig> reset search_path;  (per function)
-- =============================================================================

do $$
declare
  sig  text;
  sigs text[] := array[
    'restaurant.my_org_id()',
    'restaurant.is_platform_admin()',
    'restaurant.is_org_owner()',
    'restaurant.create_org(text, text)',
    'restaurant.add_org_member(uuid, text, boolean)',
    'restaurant.remove_org_member(uuid, uuid)'
  ];
begin
  foreach sig in array sigs loop
    if to_regprocedure(sig) is not null then
      execute format('alter function %s set search_path = restaurant, public, pg_temp', sig);
      raise notice '0185: pinned search_path on %', sig;
    else
      raise notice '0185: % not found — skipped', sig;
    end if;
  end loop;
end $$;
