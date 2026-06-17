-- ============================================================
-- 0150 — Generic, key-based rate limiting
--
-- Generalises the per-user chat limiter (0080) over an arbitrary
-- text key so any caller (the LLM Edge Functions, etc.) can share
-- one atomic check-and-increment primitive instead of bespoke
-- per-feature tables.
--
-- Rolling fixed-window counter: the window is the start of the
-- current p_window_seconds bucket (truncated against the epoch),
-- so all callers using the same window length share aligned
-- buckets. Atomic increment + check in a single function call to
-- prevent TOCTOU races. Stale buckets are pruned on write to keep
-- the table small without needing pg_cron.
--
-- Idempotent (create table/index/function if exists; do $$ guards
-- around policies).
-- ============================================================

create table if not exists public.rate_limits (
  key          text        not null,
  window_start timestamptz not null,
  count        int         not null default 1,
  primary key  (key, window_start)
);

-- Prune index — lets the per-key delete on write stay cheap.
create index if not exists idx_rate_limits_window
  on public.rate_limits (window_start);

alter table public.rate_limits enable row level security;

-- No direct row visibility for end users — only the SECURITY DEFINER
-- function below touches this table. Admins may inspect for ops.
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename  = 'rate_limits'
       and policyname = 'rate_limits_admin_all'
  ) then
    create policy rate_limits_admin_all on public.rate_limits
      for all using (public.is_admin()) with check (public.is_admin());
  end if;
end$$;

-- ── check_and_increment_rate ─────────────────────────────────
-- Returns TRUE when the call is allowed (counter still <= p_limit
-- for the current window) and FALSE when the limit is exceeded.
-- Atomically increments the counter for p_key within the current
-- fixed window of p_window_seconds. Prunes that key's stale windows
-- (older than 2 windows) as a side effect.
-- Called by Edge Functions before invoking external LLM providers.

create or replace function public.check_and_increment_rate(
  p_key            text,
  p_limit          int,
  p_window_seconds int default 3600
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secs   int := greatest(coalesce(p_window_seconds, 3600), 1);
  v_window timestamptz;
  v_count  int;
begin
  -- Align all callers of the same window length onto shared buckets:
  -- floor "now" to the start of the current p_window_seconds bucket.
  v_window := to_timestamp(floor(extract(epoch from now()) / v_secs) * v_secs);

  -- Prune this key's stale buckets (older than 2 windows).
  delete from public.rate_limits
   where key = p_key
     and window_start < now() - (v_secs * 2 || ' seconds')::interval;

  -- Atomic upsert increment.
  insert into public.rate_limits (key, window_start, count)
    values (p_key, v_window, 1)
    on conflict (key, window_start)
    do update set count = rate_limits.count + 1
    returning count into v_count;

  return v_count <= p_limit;
end;
$$;

-- Edge Functions call this with the user's JWT (authenticated) and,
-- for server-side flows, the service role.
revoke execute on function public.check_and_increment_rate(text, int, int) from public;
grant  execute on function public.check_and_increment_rate(text, int, int) to authenticated, service_role;
