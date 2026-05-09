-- 0096 — auth_events telemetry
--
-- Captures every failed sign-in attempt so we can spot regressions like the
-- Phase B "first-click ignored" race without requiring a 30-account manual
-- sweep. We deliberately store no PII beyond email_domain — the full email
-- and password never reach this table.
--
-- Anonymous callers can insert through the SECURITY DEFINER function
-- log_auth_failure(); only admins can read.

create table if not exists public.auth_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('signin_failure', 'captcha_timeout', 'mfa_failure')),
  email_domain text,
  reason text,
  user_agent text,
  ip_hash text,
  created_at timestamptz not null default now()
);

create index if not exists auth_events_created_at_idx on public.auth_events (created_at desc);
create index if not exists auth_events_event_type_idx on public.auth_events (event_type, created_at desc);

alter table public.auth_events enable row level security;

-- No direct insert/select from anon or authenticated. All writes go through
-- the SECURITY DEFINER RPC below; reads are admin-only.

drop policy if exists auth_events_admin_select on public.auth_events;
create policy auth_events_admin_select
  on public.auth_events
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create or replace function public.log_auth_failure(
  p_email_domain text,
  p_reason text,
  p_user_agent text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Cap field lengths defensively; the client already truncates but we don't
  -- trust input. ip_hash is computed in the function from a request header
  -- when available — Supabase doesn't expose request.ip to plpgsql, so we
  -- leave it null for now. Hooking up an Edge Function would let us hash the
  -- client IP without storing the raw value.
  insert into public.auth_events (event_type, email_domain, reason, user_agent)
  values (
    'signin_failure',
    nullif(left(coalesce(p_email_domain, ''), 64), ''),
    nullif(left(coalesce(p_reason, ''), 200), ''),
    nullif(left(coalesce(p_user_agent, ''), 200), '')
  );
end;
$$;

revoke all on function public.log_auth_failure(text, text, text) from public;
grant execute on function public.log_auth_failure(text, text, text) to anon, authenticated;

comment on function public.log_auth_failure is
  'Records an anonymous sign-in failure for telemetry. No PII beyond domain is stored.';
