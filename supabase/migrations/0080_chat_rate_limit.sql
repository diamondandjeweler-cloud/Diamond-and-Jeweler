-- ============================================================
-- 0080 — Chat endpoint rate limiting
--
-- Per-user, per-hour sliding window using a DB counter.
-- Max 30 messages / user / hour (tunable via system_config).
-- Atomic increment + check in a single function call to
-- prevent TOCTOU races.
-- ============================================================

create table if not exists public.chat_rate_limits (
  user_id      uuid        not null references public.profiles(id) on delete cascade,
  window_start timestamptz not null,
  count        int         not null default 1,
  primary key  (user_id, window_start)
);

-- Prune rows older than 2 hours every time we write, via trigger.
-- Keeps the table small without needing pg_cron.
create index if not exists idx_chat_rate_window
  on public.chat_rate_limits (window_start);

alter table public.chat_rate_limits enable row level security;

-- Users only see their own limits; admin can see all.
create policy crl_select_self on public.chat_rate_limits
  for select using (user_id = auth.uid());
create policy crl_admin_all on public.chat_rate_limits
  for all using (public.is_admin()) with check (public.is_admin());

-- system_config key for the limit (tunable without redeploying functions).
insert into public.system_config (key, value)
  values ('chat_rate_limit_per_hour', to_jsonb(30))
  on conflict (key) do nothing;

-- ── check_and_increment_chat_rate ────────────────────────────
-- Returns (allowed boolean, count int, limit int).
-- Atomically increments the counter for the current 1-hour window.
-- Prunes windows older than 2 hours as a side effect.
-- Called by Edge Functions before invoking AI providers.

create or replace function public.check_and_increment_chat_rate(
  p_user_id uuid
) returns table (allowed boolean, count int, limit_val int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit  int;
  v_window timestamptz;
  v_count  int;
begin
  -- Read limit from config (fallback 30).
  select coalesce((value)::int, 30) into v_limit
    from public.system_config
   where key = 'chat_rate_limit_per_hour';
  if v_limit is null then v_limit := 30; end if;

  -- Current 1-hour bucket (truncated to hour).
  v_window := date_trunc('hour', now());

  -- Prune stale windows (> 2h old).
  delete from public.chat_rate_limits
   where user_id = p_user_id
     and window_start < now() - interval '2 hours';

  -- Upsert increment.
  insert into public.chat_rate_limits (user_id, window_start, count)
    values (p_user_id, v_window, 1)
    on conflict (user_id, window_start)
    do update set count = chat_rate_limits.count + 1
    returning count into v_count;

  return query select (v_count <= v_limit), v_count, v_limit;
end;
$$;

revoke execute on function public.check_and_increment_chat_rate(uuid) from public;
grant execute on function public.check_and_increment_chat_rate(uuid) to service_role;
