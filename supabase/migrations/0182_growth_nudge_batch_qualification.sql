-- ============================================================================
-- 0182 — get_growth_nudge_qualified: batch the proactive-nudge decrypt N+1
--
-- proactive-job-push called decrypt_dob ONCE PER CANDIDATE over the network
-- (edge→Postgres round-trip each), then re-implemented the age curve in JS to
-- compute the eligibility blend. At 50k opt-in candidates that is 50k serial
-- RPCs inside one monthly edge invocation — the same N+1 shape 0166 removed
-- from the matcher.
--
-- This function runs the WHOLE qualification loop server-side in one
-- round-trip: list_growth_nudge_candidates() → decrypt → age →
-- growth_age_weight() → threshold. It returns only ids + booleans:
-- the decrypted DOB and the age now NEVER leave Postgres at all (the edge fn
-- previously received the raw DOB text) — a strict privacy improvement on the
-- 0086 posture ("Age + DOB never persisted").
--
-- Behaviour fidelity vs the JS loop it replaces (proactive-job-push/index.ts):
--   • decrypt_dob failure or NULL  → JS did `typeof dob !== 'string'` →
--     errors++ + skip: surfaced here as decrypt_failed = true (never qualified).
--   • unparseable DOB text         → JS ageFromDob → NaN → ageWeight returned 1:
--     here the date-cast failure yields v_age = NULL and growth_age_weight(NULL,…)
--     returns 1.0 — same outcome.
--   • age curve — public.growth_age_weight (0086) is the SAME curve the JS
--     ageWeight() re-implemented (≤cutoff→1, ≥cutoff+ramp→floor, linear ramp).
--   • blend + threshold: fortune_score * weight >= score_threshold. SQL numeric
--     is exact where JS float64 rounds; divergence is only possible at sub-ulp
--     threshold boundaries (and numeric is the more correct of the two).
--   • age: extract(year from age(dob)) == the JS UTC calendar-age computation
--     (Supabase runs the DB in UTC).
--
-- SECURITY INVOKER (default), like 0166: the caller is service_role (edge fn
-- adminClient), so the inner decrypt_dob and the SECURITY DEFINER
-- list_growth_nudge_candidates() run in an authorized context without chaining
-- a new DEFINER through the encryption boundary (0086's explicit design note).
-- Granted to service_role only.
-- ============================================================================

create or replace function public.get_growth_nudge_qualified()
returns table(
  talent_id          uuid,
  profile_id         uuid,
  max_jobs_per_nudge integer,
  qualified          boolean,
  decrypt_failed     boolean
)
language plpgsql
set search_path = public, extensions, vault
as $$
declare
  r        record;
  v_dob    text;
  v_age    integer;
  v_weight numeric;
begin
  for r in select * from public.list_growth_nudge_candidates()
  loop
    talent_id          := r.talent_id;
    profile_id         := r.profile_id;
    max_jobs_per_nudge := r.max_jobs_per_nudge;
    qualified          := false;
    decrypt_failed     := false;

    -- decrypt (swallow errors → failed flag, like the JS `typeof dob !== 'string'` skip)
    begin
      v_dob := public.decrypt_dob(r.encrypted_dob);
    exception when others then v_dob := null;
    end;

    if v_dob is null then
      decrypt_failed := true;
      return next;
      continue;
    end if;

    -- unparseable DOB → NULL age → growth_age_weight(NULL,…) = 1.0 (JS NaN path)
    begin
      v_age := extract(year from age(v_dob::date))::integer;
    exception when others then v_age := null;
    end;

    v_weight  := public.growth_age_weight(v_age, r.age_cutoff, r.age_ramp_years, r.age_weight_floor);
    qualified := (r.fortune_score * v_weight) >= r.score_threshold;
    return next;
  end loop;
end;
$$;

revoke all on function public.get_growth_nudge_qualified() from public, anon, authenticated;
grant execute on function public.get_growth_nudge_qualified() to service_role;

notify pgrst, 'reload schema';
