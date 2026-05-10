-- 0101 — record_consent() RPC (F21 fix)
--
-- Consent.tsx's PostgREST UPDATE on `profiles` was hanging past the 15s
-- timeout (× 3 retries) for both admins and HMs. Same root cause cluster
-- as F1's KpiPanel 503s: profiles has 4+ RLS policies (profiles_select_admin,
-- profiles_select_self, profiles_select_hr_for_hms, profiles_update_*) and
-- the WITH CHECK chain stalls under planner load even for a single-row
-- update on the caller's own profile.
--
-- Fix: dedicated SECURITY DEFINER RPC that writes consent fields and runs
-- as postgres (no RLS evaluation). Authorisation is preserved by gating on
-- auth.uid() — the function only writes to the row whose id matches the
-- caller, so a malicious caller can't update someone else's consent.
--
-- This mirrors 0100's pattern for get_admin_kpis().

create or replace function public.record_consent(
  p_version  text,
  p_ip_hash  text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
begin
  -- Anonymous callers can't sign consent — must be authenticated.
  if v_uid is null then
    raise exception 'record_consent: not authenticated' using errcode = '42501';
  end if;

  -- Sanity-check the version string. Reject empty / overly long values.
  if p_version is null or length(p_version) = 0 or length(p_version) > 32 then
    raise exception 'record_consent: invalid version' using errcode = '22023';
  end if;

  -- Update the caller's own profile only. SECURITY DEFINER bypasses RLS,
  -- but the where-clause restricts the write to auth.uid()'s row, which is
  -- the same boundary the (broken-under-load) profiles_update_self policy
  -- enforces.
  update public.profiles
     set consent_version   = p_version,
         consent_signed_at = now(),
         consent_ip_hash   = p_ip_hash
   where id = v_uid;

  if not found then
    raise exception 'record_consent: profile not found for caller' using errcode = '02000';
  end if;
end;
$$;

revoke all on function public.record_consent(text, text) from public;
grant execute on function public.record_consent(text, text) to authenticated;

notify pgrst, 'reload schema';
