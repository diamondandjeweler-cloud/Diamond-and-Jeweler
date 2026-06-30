-- ============================================================================
-- 0167 — enqueue_roles_for_rematch: collapse match-expire's serial regen N+1
--
-- match-expire (the 6h cron) regenerated matches by firing a SYNCHRONOUS
-- match-generate HTTP call PER affected role, serially (index.ts ~L222-240).
-- N expired roles → N blocking full generations inside one cron invocation —
-- a second Performance N+1 (the first being the per-candidate batch in 0166).
--
-- This RPC enqueues the affected roles into match_queue instead; the existing
-- process-match-queue cron (every 1m) drains it with bounded concurrency,
-- calling the SAME matchForRole — so refresh_limit_per_role is still enforced.
--
-- Mirrors the proven enqueue_active_roles_for_rematch / enqueue_unmatched_roles
-- pattern exactly: active + non-expired vacancy, dedup via NOT EXISTS against
-- pending/processing rows, and ON CONFLICT DO NOTHING as a backstop against the
-- partial-unique index idx_match_queue_role_active (one active item per role).
-- Scoped to an explicit role_id list (the roles whose matches just expired).
-- ============================================================================

create or replace function public.enqueue_roles_for_rematch(
  p_role_ids uuid[],
  p_priority integer default 5
)
returns integer
language plpgsql
as $function$
declare
  v_count int;
begin
  insert into public.match_queue (role_id, priority)
  select r.id, p_priority
  from   public.roles r
  where  r.id = any(p_role_ids)
    and  r.status = 'active'
    and  (r.vacancy_expires_at is null or r.vacancy_expires_at > now())
    and  not exists (
      select 1 from public.match_queue q
      where  q.role_id = r.id
        and  q.status in ('pending','processing')
    )
  on conflict do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

revoke all on function public.enqueue_roles_for_rematch(uuid[], integer) from public, anon, authenticated;
grant execute on function public.enqueue_roles_for_rematch(uuid[], integer) to service_role;

notify pgrst, 'reload schema';
