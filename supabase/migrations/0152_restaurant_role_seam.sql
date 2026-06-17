-- ============================================================================
-- 0152 — Restaurant role seam (decouple-in-place; NON-BREAKING)
--
-- Background: 0042_restaurant_staff_role.sql DROPped + re-CREATEd the CORE
-- public.profiles role CHECK to append 'restaurant_staff', entangling the
-- recruitment role model with the (flag-gated, in-repo) Restaurant OS module.
-- It also used a bare `drop constraint` (no IF EXISTS), so a replay on a fresh
-- DB that hasn't yet applied 0042 would error.
--
-- This migration re-asserts profiles_role_check idempotently and documents the
-- seam: the RECRUITMENT core roles are the canonical set; 'restaurant_staff' is
-- a clearly-isolated Restaurant-OS addendum. The accepted-role SET is UNCHANGED
-- (talent, hiring_manager, hr_admin, admin, restaurant_staff) — this is the
-- decouple-IN-PLACE seam, not the eventual extraction. When the Restaurant OS
-- is extracted to its own project, the addendum role is removed here in one
-- place instead of being hunted across the schema.
--
-- Idempotent: drop constraint IF EXISTS (unlike 0042), then re-add by name.
-- ============================================================================

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check check (
    role in (
      -- recruitment core (canonical)
      'talent', 'hiring_manager', 'hr_admin', 'admin',
      -- restaurant-OS module addendum (removed on extraction)
      'restaurant_staff'
    )
  );
