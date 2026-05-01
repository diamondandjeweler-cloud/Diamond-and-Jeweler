-- ============================================================
-- BaZi Security Hardening
--
-- 1. Revoke decrypt_dob from authenticated — service_role only.
--    The function already rejects non-admins in its body, but
--    revoking the GRANT removes the attack surface entirely.
--
-- 2. Make get_life_chart_bucket and get_year_luck_stage
--    SECURITY DEFINER with an admin/service_role gate so
--    authenticated users can no longer probe the compatibility
--    matrix or cycle formula.
--
-- 3. Enable RLS on life_chart_compatibility and restrict SELECT
--    to service_role / admin — the 81-cell matrix is IP.
-- ============================================================

-- 1. Tighten decrypt_dob grant.
revoke execute on function public.decrypt_dob(bytea) from authenticated;
-- service_role retains execute via superuser privilege; Edge Functions unaffected.

-- 2a. Harden get_life_chart_bucket — add auth gate + SECURITY DEFINER.
create or replace function public.get_life_chart_bucket(hm_char text, talent_char text)
returns text
language plpgsql
security definer
stable
set search_path = public, auth
as $$
declare
  v_bucket text;
  claim_role text;
begin
  -- Allow service_role and admin; block all other authenticated users.
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
  where (char_a = hm_char and char_b = talent_char)
     or (char_a = talent_char and char_b = hm_char)
  limit 1;

  return coalesce(v_bucket, 'neutral');
end;
$$;

-- 2b. Harden get_year_luck_stage — add auth gate + SECURITY DEFINER.
create or replace function public.get_year_luck_stage(p_character text, p_year int)
returns int
language plpgsql
security definer
stable
set search_path = public, auth
as $$
declare
  v_anchor int;
  v_stage  int;
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
    raise exception 'get_year_luck_stage: not authorized'
      using errcode = '42501';
  end if;

  -- Anchor years per character (internal — not exposed in error messages).
  select anchor_year into v_anchor
  from public.character_anchor_years
  where character = p_character;

  if v_anchor is null then
    return null;
  end if;

  v_stage := (((p_year - v_anchor) % 9) + 9) % 9 + 1;
  return v_stage;
end;
$$;

-- 3. Enable RLS on life_chart_compatibility — lock down the matrix.
alter table public.life_chart_compatibility enable row level security;

-- Only service_role and admins can read the matrix.
-- (Service_role bypasses RLS by default; this policy covers admin + anon edge cases.)
drop policy if exists lcc_admin_only on public.life_chart_compatibility;
create policy lcc_admin_only on public.life_chart_compatibility
  for select using (public.is_admin());

-- Block all writes from non-service_role too.
drop policy if exists lcc_no_write on public.life_chart_compatibility;
create policy lcc_no_write on public.life_chart_compatibility
  for all using (public.is_admin()) with check (public.is_admin());

-- 4. Also lock down character_anchor_years if it exists.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'character_anchor_years'
  ) then
    execute 'alter table public.character_anchor_years enable row level security';
    execute 'drop policy if exists cay_admin_only on public.character_anchor_years';
    execute $p$
      create policy cay_admin_only on public.character_anchor_years
        for select using (public.is_admin())
    $p$;
  end if;
end;
$$;
