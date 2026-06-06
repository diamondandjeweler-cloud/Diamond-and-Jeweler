-- 0139 — fix profiles_update_self WITH CHECK missing 'admin' role
--
-- Migration 0138 wrote the role allowlist as ['talent','hiring_manager','hr_admin']
-- but omitted 'admin'. Admins are therefore blocked by their own WITH CHECK from
-- updating their own name, phone, avatar, etc.

ALTER POLICY "profiles_update_self" ON public.profiles
  WITH CHECK (
    ((select auth.uid()) = id)
    AND (role = ANY (ARRAY['talent'::text, 'hiring_manager'::text, 'hr_admin'::text, 'admin'::text]))
    AND (is_banned = false)
  );
