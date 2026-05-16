-- F-08: Server-side login rate-limiting / account lockout
-- Tracks sign-in failures per email (stored as sha256 hash — no plain-text email persisted).
-- After 5 failures within a 15-minute window, further sign-in attempts are blocked
-- until the window rolls forward.  Complements the client-side localStorage guard
-- already in Login.tsx, which can be bypassed by clearing storage or using incognito.

create table if not exists login_attempts (
  id           uuid        default gen_random_uuid() primary key,
  email_hash   text        not null,
  attempted_at timestamptz default now() not null,
  succeeded    boolean                               -- null = recorded before outcome known (unused path)
);

create index if not exists login_attempts_email_time_idx
  on login_attempts (email_hash, attempted_at desc);

-- ── check_login_rate_limit ────────────────────────────────────────────────────
-- Call BEFORE attempting sign-in.
-- Returns {"locked":true,"retry_after_seconds":N} when the email is locked out,
-- {"locked":false} otherwise.
-- SECURITY DEFINER so the anon role (unauthenticated callers) can invoke it.
create or replace function public.check_login_rate_limit(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash        text        := encode(sha256(lower(trim(p_email))::bytea), 'hex');
  v_fail_count  int;
  v_oldest_fail timestamptz;
  v_window      interval    := interval '15 minutes';
  v_max_fails   int         := 5;
begin
  select count(*), min(attempted_at)
    into v_fail_count, v_oldest_fail
    from login_attempts
   where email_hash   = v_hash
     and attempted_at > now() - v_window
     and succeeded    is not true;   -- count failures + unresolved; ignore successes

  if v_fail_count >= v_max_fails then
    return jsonb_build_object(
      'locked', true,
      'retry_after_seconds',
        greatest(0, ceil(extract(epoch from (v_oldest_fail + v_window - now()))))::int
    );
  end if;

  return jsonb_build_object('locked', false);
end;
$$;

-- ── record_login_attempt ──────────────────────────────────────────────────────
-- Call AFTER sign-in resolves (fire-and-forget is fine).
-- p_succeeded = true marks a success row (excluded from the failure count above).
-- p_succeeded = false marks a failure that counts toward lockout.
create or replace function public.record_login_attempt(p_email text, p_succeeded boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text := encode(sha256(lower(trim(p_email))::bytea), 'hex');
begin
  insert into login_attempts (email_hash, succeeded) values (v_hash, p_succeeded);
end;
$$;

-- Callable by unauthenticated users (they haven't signed in yet when these run)
grant execute on function public.check_login_rate_limit(text)        to anon, authenticated;
grant execute on function public.record_login_attempt(text, boolean) to anon, authenticated;

-- No direct row visibility needed — only the SECURITY DEFINER functions touch this table.
alter table login_attempts enable row level security;

-- Daily cleanup at 03:10 UTC to keep the table lean (7-day retention)
select cron.schedule(
  'cleanup-login-attempts-daily',
  '10 3 * * *',
  $$delete from login_attempts where attempted_at < now() - interval '7 days'$$
);
