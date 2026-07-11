-- =============================================================================
-- 0186 — lock down two live privilege-escalation holes (2026-07-11 audit)
-- =============================================================================
-- Found by the 9-session reconciliation audit; both are exploitable today with an
-- ordinary logged-in session + the public anon key. (Renumbered from 0183 —
-- session 9's PR #32 took 0183-0185.)
--
-- P0 — SELF-MINTED DIAMOND POINTS
--   information_schema.column_privileges (verified on prod 2026-07-11) shows
--   `authenticated` AND `anon` hold UPDATE on public.profiles.points and
--   .points_earned_total. profiles_update_self lets a user update their OWN row
--   and its WITH CHECK guards only role/is_banned; trg_prevent_role_self_change
--   only resets role. So  UPDATE profiles SET points = 999999 WHERE id = auth.uid()
--   succeeds over PostgREST — unlimited points (each paid extra-match = 21 pts).
--   FIX: revoke column UPDATE on the two balance columns from authenticated+anon.
--   All legitimate writes go through public.award_points() (SECURITY DEFINER, so it
--   bypasses column grants); the only client-side profiles UPDATE is updateProfile()
--   (profiles.ts:88) for profile fields, which never sets points. Mirrors the
--   ic_path column-grant lockdown (0091) and points_company_id lock (0184).
--
-- P1 — HR SELF-VERIFYING THEIR OWN COMPANY
--   Legacy policy companies_update_hr = USING user_is_hr_of_company(id), WITH CHECK
--   NULL (verified on prod). RLS policies are OR-ed, so despite
--   companies_update_creator_unverified restricting edits to verified=false, an
--   hr_admin can `UPDATE companies SET verified=true` on their own company via the
--   legacy policy — bypassing admin review. FIX: keep the policy (HR may still edit
--   other fields) but add a BEFORE UPDATE trigger reverting any `verified` change by
--   a non-admin/non-service_role caller — the exact analog of
--   prevent_role_self_change (0069) and prevent_company_id_self_change (0184).
--
-- Additive/reversible. ROLLBACK:
--   grant update (points, points_earned_total) on public.profiles to authenticated, anon;
--   drop trigger if exists trg_prevent_company_verify_self on public.companies;
--   drop function if exists public.prevent_company_verify_self_change();
-- =============================================================================

begin;

-- ---- P0: lock the points balance columns to award_points() only ----
revoke update (points, points_earned_total) on public.profiles from authenticated;
revoke update (points, points_earned_total) on public.profiles from anon;

-- ---- P1: prevent non-admin self-verification of a company ----
create or replace function public.prevent_company_verify_self_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if new.verified is distinct from old.verified then
    -- Only an admin (service_role Edge path, or a platform admin acting via the
    -- authenticated client under companies_all_admin) may flip verification.
    if coalesce((current_setting('request.jwt.claims', true)::jsonb) ->> 'role', '') <> 'service_role'
       and not public.is_admin() then
      new.verified := old.verified;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_company_verify_self on public.companies;
create trigger trg_prevent_company_verify_self
  before update on public.companies
  for each row execute function public.prevent_company_verify_self_change();

commit;
