-- ============================================================
-- 0059 — PDPA v2.0 hardening (lawyer review 2026-05-01)
--
--   1. Soft-delete columns on profiles, talents, hiring_managers
--   2. data_retention_log audit table
--   3. purge_soft_deleted_after_30d() — daily-cron-callable
--   4. notify_dpo_on_data_request() — trigger on data_requests insert
--   5. Cron job dnj-soft-delete-purge-daily
--
-- Pre-req: vault secret `resend_api_key` must exist.
-- Pre-req: pg_net + pg_cron extensions enabled.
-- ============================================================

alter table public.profiles          add column if not exists deleted_at timestamptz;
alter table public.talents           add column if not exists deleted_at timestamptz;
alter table public.hiring_managers   add column if not exists deleted_at timestamptz;

create index if not exists idx_profiles_deleted_at         on public.profiles (deleted_at) where deleted_at is not null;
create index if not exists idx_talents_deleted_at          on public.talents (deleted_at)  where deleted_at is not null;
create index if not exists idx_hiring_managers_deleted_at  on public.hiring_managers (deleted_at) where deleted_at is not null;

comment on column public.profiles.deleted_at is
  'Soft-delete marker. Set when user requests deletion. After 30 days, sensitive fields are hard-purged by data-retention cron, but row stays for audit.';

create table if not exists public.data_retention_log (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null,
  action      text not null check (action in ('soft_delete', 'hard_purge', 'restore')),
  occurred_at timestamptz not null default now(),
  details     jsonb
);
alter table public.data_retention_log enable row level security;

drop policy if exists data_retention_log_admin_select on public.data_retention_log;
create policy data_retention_log_admin_select
  on public.data_retention_log for select
  to authenticated
  using (public.is_admin());

create or replace function public.purge_soft_deleted_after_30d()
  returns table (purged_count int)
  language plpgsql
  security definer
  set search_path to 'public', 'extensions'
as $$
declare
  cutoff timestamptz := now() - interval '30 days';
  cnt int := 0;
  rec record;
begin
  for rec in
    select id, email from public.profiles
     where deleted_at is not null and deleted_at < cutoff
       and (full_name not like '[deleted%' or full_name is null)
  loop
    update public.profiles set
      full_name = '[deleted user]',
      email = '[deleted-' || rec.id::text || ']@deleted.local',
      phone = null,
      consent_ip_hash = null,
      interview_transcript = null,
      whatsapp_number = null
    where id = rec.id;

    update public.talents set
      dob_enc = null,
      birth_meta = null,
      ic_number_enc = null
    where profile_id = rec.id;

    insert into public.data_retention_log (profile_id, action, details)
      values (rec.id, 'hard_purge', jsonb_build_object('original_email_hash', md5(rec.email), 'purged_at', now()));

    cnt := cnt + 1;
  end loop;
  return query select cnt;
end $$;

comment on function public.purge_soft_deleted_after_30d is
  'Hard-purges sensitive fields from profiles/talents soft-deleted >30 days ago. Audit row remains.';

create or replace function public.notify_dpo_on_data_request()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public', 'extensions'
as $func$
declare
  dpo_email text;
  resend_api_key text;
  user_email text;
  payload jsonb;
begin
  select trim(both '"' from value::text) into dpo_email
    from public.system_config where key = 'legal_dpo_email';
  dpo_email := coalesce(dpo_email, 'dpo@diamondandjeweler.com');

  begin
    select decrypted_secret into resend_api_key
      from vault.decrypted_secrets where name = 'resend_api_key' limit 1;
  exception when others then resend_api_key := null;
  end;

  if resend_api_key is null or resend_api_key = '' then
    insert into public.data_retention_log (profile_id, action, details)
      values (new.user_id, 'soft_delete', jsonb_build_object(
        'note', 'data_request inserted but Resend api key missing',
        'request_id', new.id));
    return new;
  end if;

  select email into user_email from auth.users where id = new.user_id;

  payload := jsonb_build_object(
    'from', 'DNJ <noreply@diamondandjeweler.com>',
    'to', jsonb_build_array(dpo_email),
    'bcc', jsonb_build_array('diamondandjeweler@gmail.com'),
    'subject', 'New Data Subject Request: ' || coalesce(new.request_type, 'unknown'),
    'html',
      '<h2>New Data Subject Request</h2>' ||
      '<p>A user has submitted a data request via /data-requests.</p>' ||
      '<p><strong>Request ID:</strong> ' || new.id::text || '<br>' ||
      '<strong>Type:</strong> ' || coalesce(new.request_type, '-') || '<br>' ||
      '<strong>User email:</strong> ' || coalesce(user_email, new.user_id::text) || '<br>' ||
      '<strong>Submitted:</strong> ' || new.created_at::text || '<br>' ||
      '<strong>Notes:</strong> ' || coalesce(new.notes, '-') || '</p>' ||
      '<p>SLA: respond within <strong>21 days</strong>. Open admin panel to action.</p>' ||
      '<p style="font-size:11px;color:#71717a">Auto-sent by DNJ data-requests trigger.</p>'
  );

  perform net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || resend_api_key),
    body := payload,
    timeout_milliseconds := 5000
  );
  return new;
end $func$;

drop trigger if exists tg_data_requests_notify_dpo on public.data_requests;
create trigger tg_data_requests_notify_dpo
  after insert on public.data_requests
  for each row execute function public.notify_dpo_on_data_request();

do $$
begin
  if exists (select 1 from cron.job where jobname = 'dnj-soft-delete-purge-daily') then
    perform cron.unschedule('dnj-soft-delete-purge-daily');
  end if;
  perform cron.schedule(
    'dnj-soft-delete-purge-daily',
    '0 3 * * *',
    'select public.purge_soft_deleted_after_30d();'
  );
end $$;
