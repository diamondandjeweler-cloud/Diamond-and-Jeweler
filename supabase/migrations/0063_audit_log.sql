-- Migration 0063: Centralised append-only audit log
-- Covers TC-9-25 to TC-9-28, TC-2-31, TC-1-45, TC-16-3
--
-- Design principles:
--   • No PII in this table — IPs and emails are SHA-256 hashed before insert.
--   • Append-only: RLS blocks UPDATE and DELETE for all roles incl. service_role.
--   • Users can read rows where subject_id = auth.uid() (own access history).
--   • Admins can read all rows.
--   • Retained for 730 days (2 years); purge job added to pg_cron.

-- ── Table ──────────────────────────────────────────────────────────────────

create table if not exists public.audit_log (
  id            bigserial       primary key,
  created_at    timestamptz     not null default now(),

  -- Who performed the action
  actor_id      uuid            references auth.users(id) on delete set null,
  actor_role    text,                         -- 'talent' | 'hiring_manager' | 'hr_admin' | 'admin' | 'system' | 'service_role'

  -- Who was affected (may equal actor_id for self-service actions)
  subject_id    uuid            references auth.users(id) on delete set null,

  -- What happened
  action        text            not null,     -- see action enum comment below
  resource_type text,                         -- 'profile' | 'talent' | 'match' | 'company' | 'file' | 'session' | 'consent' | 'dsr' | 'notification'
  resource_id   text,                         -- UUID or path string of the affected resource

  -- Context (no PII — hash externally before storing)
  ip_hash       text,                         -- SHA-256(ip_address)
  ua_hash       text,                         -- SHA-256(user_agent)

  -- Flexible payload for additional context; must NOT contain raw PII
  metadata      jsonb           default '{}'
);

-- Action enum (enforced by check constraint — extend as needed):
alter table public.audit_log
  add constraint audit_log_action_check check (action in (
    -- Authentication
    'login', 'logout', 'login_failed', 'session_expired',
    'password_changed', 'password_reset_requested',
    'mfa_enrolled', 'mfa_challenge_passed', 'mfa_challenge_failed',
    -- Account lifecycle
    'account_created', 'account_soft_deleted', 'account_restored',
    'profile_updated',
    -- Consent
    'consent_granted', 'consent_revoked', 'consent_renewed',
    -- Data subject rights
    'dsr_submitted', 'dsr_completed', 'dsr_export_downloaded',
    -- Admin access to user data
    'admin_profile_view', 'admin_talent_view', 'admin_file_view',
    'admin_action',
    -- File operations
    'file_uploaded', 'file_deleted', 'file_viewed',
    -- Matching
    'match_generated', 'match_accepted', 'match_declined', 'match_expired',
    -- Offers
    'offer_made', 'offer_accepted', 'offer_declined',
    -- Compliance
    'breach_detected', 'breach_notified_dpo', 'breach_notified_user',
    -- System
    'data_purged', 'cron_run'
  ));

-- ── Indexes ────────────────────────────────────────────────────────────────

-- Fast lookup: all events for a specific user (for user-facing access log)
create index if not exists idx_audit_log_subject_id   on public.audit_log (subject_id, created_at desc);
-- Fast lookup: all events by an actor (admin investigation)
create index if not exists idx_audit_log_actor_id     on public.audit_log (actor_id, created_at desc);
-- Time-range scans for compliance reports
create index if not exists idx_audit_log_created_at   on public.audit_log (created_at desc);
-- Action filtering
create index if not exists idx_audit_log_action       on public.audit_log (action, created_at desc);

-- ── RLS: append-only ───────────────────────────────────────────────────────

alter table public.audit_log enable row level security;

-- Anyone can INSERT (via service-role or trigger) — no SELECT policy needed for inserts.
create policy audit_log_insert
  on public.audit_log for insert
  with check (true);

-- Users see only rows where they are the subject.
create policy audit_log_select_own
  on public.audit_log for select
  using (subject_id = auth.uid());

-- Admins see everything.
create policy audit_log_select_admin
  on public.audit_log for select
  using (exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ));

-- No UPDATE or DELETE policies — intentionally absent to make the table append-only.
-- Even service_role bypasses RLS by default; lock it down explicitly:
alter table public.audit_log force row level security;

-- ── Trigger helper: log consent changes on profiles ────────────────────────

create or replace function public.trg_audit_consent_change()
returns trigger language plpgsql security definer as $$
begin
  if (old.consent_version is distinct from new.consent_version) then
    insert into public.audit_log (actor_id, actor_role, subject_id, action, resource_type, resource_id, metadata)
    values (
      new.id, coalesce(new.role, 'talent'), new.id,
      case when new.consent_version is not null then 'consent_granted' else 'consent_revoked' end,
      'consent', new.id::text,
      jsonb_build_object(
        'old_version', old.consent_version,
        'new_version', new.consent_version,
        'signed_at',   new.consent_signed_at
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_consent_audit on public.profiles;
create trigger trg_profiles_consent_audit
  after update of consent_version on public.profiles
  for each row execute function public.trg_audit_consent_change();

-- ── Trigger helper: log soft-delete / restore on profiles ─────────────────

create or replace function public.trg_audit_profile_delete()
returns trigger language plpgsql security definer as $$
begin
  if (old.deleted_at is null and new.deleted_at is not null) then
    insert into public.audit_log (actor_id, actor_role, subject_id, action, resource_type, resource_id, metadata)
    values (
      new.id, coalesce(new.role,'talent'), new.id,
      'account_soft_deleted', 'profile', new.id::text,
      jsonb_build_object('deleted_at', new.deleted_at)
    );
  elsif (old.deleted_at is not null and new.deleted_at is null) then
    insert into public.audit_log (actor_id, actor_role, subject_id, action, resource_type, resource_id, metadata)
    values (
      auth.uid(), 'admin', new.id,
      'account_restored', 'profile', new.id::text,
      jsonb_build_object('restored_at', now())
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_delete_audit on public.profiles;
create trigger trg_profiles_delete_audit
  after update of deleted_at on public.profiles
  for each row execute function public.trg_audit_profile_delete();

-- ── Trigger helper: log DSR submissions ───────────────────────────────────

create or replace function public.trg_audit_dsr_insert()
returns trigger language plpgsql security definer as $$
begin
  insert into public.audit_log (actor_id, actor_role, subject_id, action, resource_type, resource_id, metadata)
  values (
    new.user_id, 'talent', new.user_id,
    'dsr_submitted', 'dsr', new.id::text,
    jsonb_build_object('request_type', new.request_type)
  );
  return new;
end;
$$;

drop trigger if exists trg_data_requests_audit on public.data_requests;
create trigger trg_data_requests_audit
  after insert on public.data_requests
  for each row execute function public.trg_audit_dsr_insert();

-- ── Trigger helper: log DSR completion ────────────────────────────────────

create or replace function public.trg_audit_dsr_complete()
returns trigger language plpgsql security definer as $$
begin
  if (old.status <> 'completed' and new.status = 'completed') then
    insert into public.audit_log (actor_id, actor_role, subject_id, action, resource_type, resource_id, metadata)
    values (
      auth.uid(), 'admin', new.user_id,
      'dsr_completed', 'dsr', new.id::text,
      jsonb_build_object('request_type', new.request_type, 'resolved_at', new.resolved_at)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_data_requests_complete_audit on public.data_requests;
create trigger trg_data_requests_complete_audit
  after update of status on public.data_requests
  for each row execute function public.trg_audit_dsr_complete();

-- ── Convenience RPC: log an event from Edge Functions ─────────────────────
-- Called with service-role key; accepts pre-hashed ip/ua.

create or replace function public.log_audit_event(
  p_actor_id      uuid,
  p_actor_role    text,
  p_subject_id    uuid,
  p_action        text,
  p_resource_type text default null,
  p_resource_id   text default null,
  p_ip_hash       text default null,
  p_ua_hash       text default null,
  p_metadata      jsonb default '{}'
) returns void language plpgsql security definer as $$
begin
  insert into public.audit_log
    (actor_id, actor_role, subject_id, action, resource_type, resource_id, ip_hash, ua_hash, metadata)
  values
    (p_actor_id, p_actor_role, p_subject_id, p_action, p_resource_type, p_resource_id, p_ip_hash, p_ua_hash, p_metadata);
end;
$$;

-- ── 2-year retention purge (runs monthly via pg_cron) ─────────────────────

select cron.schedule(
  'purge-old-audit-log',
  '0 3 1 * *',   -- 1st of every month at 03:00 UTC (11:00 MYT)
  $$
    delete from public.audit_log
    where created_at < now() - interval '730 days';
  $$
);

-- ── Backfill: pull existing admin_actions into audit_log ──────────────────

insert into public.audit_log
  (created_at, actor_id, actor_role, subject_id, action, resource_type, resource_id, metadata)
select
  aa.created_at,
  aa.admin_id,
  'admin',
  null::uuid,
  'admin_action',
  aa.target_type,
  aa.target_id::text,
  jsonb_build_object('action_type', aa.action_type, 'reason', aa.reason)
from public.admin_actions aa
on conflict do nothing;

-- ── Backfill: pull existing data_retention_log events ─────────────────────

insert into public.audit_log
  (created_at, actor_id, actor_role, subject_id, action, resource_type, resource_id, metadata)
select
  drl.occurred_at,
  null,
  'system',
  drl.profile_id,
  case drl.action
    when 'soft_delete'  then 'account_soft_deleted'
    when 'hard_purge'   then 'data_purged'
    when 'restore'      then 'account_restored'
    else 'admin_action'
  end,
  'profile',
  drl.profile_id::text,
  jsonb_build_object('details', drl.details)
from public.data_retention_log drl
on conflict do nothing;
