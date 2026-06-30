-- ============================================================================
-- 0166 — get_age_peak_scores: batch the per-candidate age/peak/DOB N+1
--
-- The matcher's hot loop (scoreTalent in _shared/match-core.ts) called THREE
-- network RPCs PER CANDIDATE across up to 500 candidates (~1,500 edge→Postgres
-- round-trips per generation):
--   decrypt_dob(date_of_birth_encrypted)            — per row
--   compute_age_match_score(hm_dob, talent_dob)     — per row
--   get_peak_age_score(dob, character, born_day, …) — per row
--
-- This function does all three for the whole candidate pool in ONE round-trip
-- (the loop runs server-side, not over the network). It is BYTE-IDENTICAL to
-- the prior per-candidate behaviour:
--   • calls the exact same three functions with the same inputs;
--   • born_day = day-of-month of the decrypted DOB (DOB is stored YYYY-MM-DD, so
--     extract(day …) == JS `new Date(dob).getUTCDate()`);
--   • uses_lunar = (uses_lunar_calendar IS TRUE)  (== JS `=== true`);
--   • age_score only when BOTH HM DOB and talent DOB are non-empty
--     (== `if (hmDobText && talentDobText)`); peak only when talent DOB AND
--     life_chart_character are non-empty (== `if (talentDobText && talentCharacter)`);
--   • CRITICALLY: each of the three calls is wrapped so a per-row failure yields
--     NULL for that field — exactly what the JS did (`const {data} = await rpc();
--     if (typeof data === 'number') …` swallows an RPC error to null). Without
--     this, one corrupt row would fail the whole generation; the per-candidate
--     path tolerated it.
--
-- SECURITY INVOKER (default): match-core calls it as service_role, so the inner
-- decrypt_dob sees role=service_role (authorized) — as the prior call did.
-- Granted to service_role only (decrypted DOB never leaves SQL).
-- ============================================================================

create or replace function public.get_age_peak_scores(
  p_hm_dob     text,
  p_talent_ids uuid[]
)
returns table(talent_id uuid, age_score int, peak_age_score int)
language plpgsql
set search_path = public, extensions, vault
as $$
declare
  r      record;
  v_dob  text;
  v_age  int;
  v_peak int;
begin
  for r in
    select t.id,
           t.life_chart_character,
           (t.uses_lunar_calendar is true) as uses_lunar,
           t.date_of_birth_encrypted       as enc
    from public.talents t
    where t.id = any(p_talent_ids)
  loop
    -- decrypt DOB (swallow errors → null, like the per-candidate decrypt_dob call)
    begin
      v_dob := public.decrypt_dob(r.enc);
    exception when others then v_dob := null;
    end;

    -- age score
    v_age := null;
    if nullif(p_hm_dob, '') is not null and nullif(v_dob, '') is not null then
      begin
        v_age := public.compute_age_match_score(p_hm_dob::date, v_dob::date);
      exception when others then v_age := null;
      end;
    end if;

    -- peak-age-window score
    v_peak := null;
    if nullif(v_dob, '') is not null and nullif(r.life_chart_character, '') is not null then
      begin
        v_peak := public.get_peak_age_score(
          v_dob, r.life_chart_character, extract(day from v_dob::date)::int, r.uses_lunar);
      exception when others then v_peak := null;
      end;
    end if;

    talent_id := r.id; age_score := v_age; peak_age_score := v_peak;
    return next;
  end loop;
end;
$$;

revoke all on function public.get_age_peak_scores(text, uuid[]) from public, anon, authenticated;
grant execute on function public.get_age_peak_scores(text, uuid[]) to service_role;

notify pgrst, 'reload schema';
