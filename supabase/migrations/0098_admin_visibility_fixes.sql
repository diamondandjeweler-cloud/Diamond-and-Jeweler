-- 0098 — admin visibility fixes (F1, F8, F10, F14)
--
-- Closes the cluster of admin-side regressions reported in
-- 11_master_findings_index.md (2026-05-09):
--
--   F10 — Support tab "Could not find a relationship between 'support_tickets'
--         and 'profiles'". support_tickets.user_id was wired to auth.users(id)
--         in 0072, but PostgREST embeds via FKs in public.*. Add a parallel FK
--         to public.profiles (1:1 with auth.users by primary key, so safe).
--
--   F14 — Audit log shows 0 rows. The audit_log_select_admin policy from 0063
--         used an inline EXISTS on profiles, which is harder for the planner
--         to cache. Replace with the SECURITY DEFINER is_admin() helper for
--         consistency with the rest of the RLS surface (talents_all_admin,
--         hm_all_admin, companies_all_admin already use it).
--
--   F1, F8 — Admin Overview empty / Admin Matches RLS deny. The admin-allow
--         policies on talents (talents_all_admin), hm (hm_all_admin),
--         companies (companies_all_admin), profiles (profiles_select_admin)
--         already exist (0003). If F1/F8 still surface after this migration,
--         the cause is data, not policy: confirm the test admin's
--         profiles.role is exactly 'admin' and is_banned=false.

-- ── F10 — support_tickets ↔ profiles relationship for PostgREST embed.
-- profiles.id and auth.users(id) share a UUID space (1:1 via the
-- on_auth_user_created trigger), so the parallel FK is unambiguous.
alter table public.support_tickets
  drop constraint if exists support_tickets_user_id_profiles_fkey;

alter table public.support_tickets
  add constraint support_tickets_user_id_profiles_fkey
  foreign key (user_id) references public.profiles(id) on delete set null;

-- ── F14 — restate audit_log_select_admin via the is_admin() helper.
drop policy if exists audit_log_select_admin on public.audit_log;
create policy audit_log_select_admin on public.audit_log
  for select using (public.is_admin());

-- ── Refresh PostgREST schema cache so the new FK is exposed in /rest/v1.
notify pgrst, 'reload schema';
