-- 0092_fix_get_life_chart_bucket.sql
--
-- get_life_chart_bucket referenced stale column names (char_a / char_b) that
-- no longer exist on life_chart_compatibility. The table now uses
-- hm_character / talent_character. Every call from match-core was therefore
-- erroring out and returning NULL, which left the v2 diversity selection with
-- no bucket information to distinguish good from bad pairs. Recreating the
-- function with the correct columns. Asymmetric match (HM vs talent) is
-- correct here — the original bidirectional match was a stale assumption.

CREATE OR REPLACE FUNCTION public.get_life_chart_bucket(hm_char text, talent_char text)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
declare
  v_bucket text;
  claim_role text;
begin
  claim_role := coalesce(
    current_setting('request.jwt.claims', true)::jsonb ->> 'role',
    ''
  );
  if claim_role <> 'service_role'
     and not public.is_admin()
     and current_user not in ('postgres', 'supabase_admin')
  then
    raise exception 'get_life_chart_bucket: not authorized'
      using errcode = '42501';
  end if;

  select bucket into v_bucket
  from public.life_chart_compatibility
  where hm_character     = hm_char
    and talent_character = talent_char
  limit 1;

  return coalesce(v_bucket, 'neutral');
end;
$function$;
