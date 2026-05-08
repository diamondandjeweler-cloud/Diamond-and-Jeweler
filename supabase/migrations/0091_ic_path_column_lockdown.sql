-- 0091_ic_path_column_lockdown.sql
--
-- Closes TC-255 (round 1 WARN): the talents.ic_path column was returned to
-- HMs with an active match because the row-level policy talents_select_hm_via_match
-- selects the whole row. The IC file itself is unreachable (storage RLS blocks),
-- but the path string ("ic-documents/<uuid>/file.pdf") is technically PII metadata
-- that an HM should never see.
--
-- Defense in depth: revoke column SELECT/UPDATE on the three IC columns from
-- the authenticated role, then re-grant only to admin (via SECURITY DEFINER)
-- and the talent themselves (via a SECURITY DEFINER helper).
--
-- Practically, talents read their own ic_path via the existing
-- talents_select_self policy + getOwnIcDocument() RPC; HMs never need it.
-- Admins read it through admin-only edge functions.
--
-- We REVOKE column-level SELECT from authenticated. Talent self-reads continue
-- to work because postgres column-level GRANTs are also column-checked, and we
-- re-grant the same columns to "self" via a security-definer view and an RPC.

-- ---------------------------------------------------------------------------
-- 1. Revoke column SELECT on ic_path / ic_verified / ic_purged_at from
--    authenticated. This means even if a row is selectable via talents_select_self
--    or talents_select_hm_via_match, these three columns are never returned.
-- ---------------------------------------------------------------------------

revoke select (ic_path, ic_verified, ic_purged_at) on public.talents from authenticated;
revoke update (ic_path, ic_verified, ic_purged_at) on public.talents from authenticated;

-- Anon was already restricted; keep it that way explicitly:
revoke select (ic_path, ic_verified, ic_purged_at) on public.talents from anon;
revoke update (ic_path, ic_verified, ic_purged_at) on public.talents from anon;

-- ---------------------------------------------------------------------------
-- 2. SECURITY DEFINER helper for talents to read their own IC metadata.
--    Use this from the talent UI when (rarely) the talent page needs to know
--    whether they uploaded an IC and where it sits.
-- ---------------------------------------------------------------------------

create or replace function public.get_own_ic_metadata()
  returns table(ic_path text, ic_verified boolean, ic_purged_at timestamptz)
  language sql
  security definer
  set search_path to 'public', 'auth'
as $function$
  select t.ic_path, t.ic_verified, t.ic_purged_at
  from public.talents t
  where t.profile_id = auth.uid()
  limit 1;
$function$;

grant execute on function public.get_own_ic_metadata() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. SECURITY DEFINER for admin to read any talent's IC metadata.
--    Wraps the existing is_admin() helper so the column grants don't matter.
-- ---------------------------------------------------------------------------

create or replace function public.admin_get_ic_metadata(p_talent_id uuid)
  returns table(ic_path text, ic_verified boolean, ic_purged_at timestamptz)
  language plpgsql
  security definer
  set search_path to 'public', 'auth'
as $function$
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  -- Audit the admin access — IC metadata is sensitive even when no file is fetched.
  perform public.log_audit_event(
    p_actor_id     => auth.uid(),
    p_actor_role   => 'admin',
    p_subject_id   => (select profile_id from public.talents where id = p_talent_id),
    p_action       => 'admin_ic_metadata_viewed',
    p_resource_type=> 'talent',
    p_resource_id  => p_talent_id::text
  );

  return query
    select t.ic_path, t.ic_verified, t.ic_purged_at
    from public.talents t
    where t.id = p_talent_id;
end;
$function$;

grant execute on function public.admin_get_ic_metadata(uuid) to authenticated;

-- End of 0091
