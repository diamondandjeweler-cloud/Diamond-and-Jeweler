-- 0105 — get_admin_audit_log() RPC for the Admin → Audit log tab (F14 read).
--
-- AuditLogPanel reports "0 rows" despite 135 events in the table. Same
-- root cause as F8: PostgREST occasionally treats the request as anon,
-- and the audit_log RLS policies (`audit_log_select_admin: is_admin()` +
-- `audit_log_select_own: subject_id = auth.uid()`) both return 0 rows
-- when auth.uid() is null and is_admin() is false — silent empty
-- result, no error.
--
-- Fix mirrors 0100/0104: a SECURITY DEFINER RPC that bypasses RLS,
-- gates on is_admin() in the body, and supports the panel's filters
-- (action, actor/subject UUID search, page).
--
-- Idempotent. Safe to re-run.

create or replace function public.get_admin_audit_log(
  p_action       text default null,
  p_actor_id     uuid default null,
  p_subject_id   uuid default null,
  p_page         int  default 0,
  p_page_size    int  default 50
)
returns table (
  id            bigint,
  created_at    timestamptz,
  actor_id      uuid,
  actor_role    text,
  subject_id    uuid,
  action        text,
  resource_type text,
  resource_id   text,
  metadata      jsonb
)
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_offset int;
  v_limit  int;
begin
  -- Admin-only entry; same shape as get_admin_kpis / get_admin_matches.
  if not public.is_admin() then
    raise exception 'get_admin_audit_log: not authorized' using errcode = '42501';
  end if;

  -- Clamp pagination so a fat-finger value can't load the whole table.
  if p_page is null or p_page < 0 then p_page := 0; end if;
  if p_page_size is null or p_page_size <= 0 then p_page_size := 50; end if;
  if p_page_size > 200 then p_page_size := 200; end if;
  v_offset := p_page * p_page_size;
  v_limit  := p_page_size;

  return query
    select
      a.id,
      a.created_at,
      a.actor_id,
      a.actor_role,
      a.subject_id,
      a.action,
      a.resource_type,
      a.resource_id,
      a.metadata
    from public.audit_log a
    where (p_action is null or a.action = p_action)
      -- actor / subject filters are OR'd: the panel surfaces one input
      -- and matches it against either side. Caller can pass the same UUID
      -- to both params to search "this user as actor or subject".
      and (
        (p_actor_id is null and p_subject_id is null)
        or (p_actor_id   is not null and a.actor_id   = p_actor_id)
        or (p_subject_id is not null and a.subject_id = p_subject_id)
      )
    order by a.created_at desc
    offset v_offset
    limit v_limit;
end;
$$;

revoke all on function public.get_admin_audit_log(text, uuid, uuid, int, int) from public;
grant execute on function public.get_admin_audit_log(text, uuid, uuid, int, int) to authenticated;

notify pgrst, 'reload schema';
