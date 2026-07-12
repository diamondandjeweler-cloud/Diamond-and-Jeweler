-- 0197_cron_deadman_external_alert.sql
-- ============================================================================
-- B6 — Dead-man check fires an EXTERNAL alert (Slack/webhook), not just in-app.
--
-- cron_deadman_check() (0151, extended by 0154) inserts an in-app notification
-- for every admin when a monitored job's heartbeat goes stale. But the whole
-- point of a dead-man switch is that it fires when the platform is degraded —
-- exactly when nobody is watching the in-app bell. This redefinition ADDS an
-- out-of-band alert: when any job is stale it net.http_post's the same message
-- to a Slack (or generic) incoming webhook whose URL lives in Vault, mirroring
-- the Vault-key + net.http_post pattern from 0151.
--
-- Fully backward-compatible + additive:
--   * The existing per-admin in-app notifications are unchanged.
--   * The external post only happens when the Vault secret
--     `deadman_alert_webhook_url` is present. If it is absent (e.g. before the
--     owner sets it), the post is skipped — behaviour is identical to 0154.
--   * The webhook call is wrapped so a network/DNS failure never aborts the
--     dead-man check (the in-app notifications must still be written).
--
-- Monitored jobs unchanged from 0154: data-retention, match-expire,
-- process-match-queue. CREATE OR REPLACE — idempotent, no data change.
--
-- POST-DEPLOY (owner): add a Vault secret named `deadman_alert_webhook_url`
-- holding a Slack incoming-webhook URL (or any endpoint that accepts a JSON
-- {text} body). Until then this behaves exactly like 0154.
-- ============================================================================

create extension if not exists pg_net;

create or replace function public.cron_deadman_check()
returns void
language plpgsql
security definer
set search_path = public, extensions, vault, net, pg_catalog
as $f$
declare
  v_jobs        text[] := array['data-retention', 'match-expire', 'process-match-queue'];
  v_job         text;
  v_last        timestamptz;
  v_stale       text[] := array[]::text[];
  v_body        text;
  v_webhook_url text;
begin
  foreach v_job in array v_jobs loop
    select last_run_at into v_last
      from public.cron_heartbeat
     where job_name = v_job;

    if v_last is null or v_last < now() - interval '36 hours' then
      v_stale := array_append(v_stale, v_job);
    end if;
  end loop;

  if array_length(v_stale, 1) is null then
    return;
  end if;

  v_body := 'Scheduled job(s) have not reported a heartbeat in over 36 hours: '
            || array_to_string(v_stale, ', ')
            || '. They may be silently failing (e.g. a missing service credential). Please investigate.';

  -- (1) Existing behaviour — notify every active admin in-app (unchanged).
  insert into public.notifications (user_id, type, channel, subject, body, data)
  select p.id,
         'cron_deadman',
         'in_app',
         'Scheduled job not running',
         v_body,
         jsonb_build_object('stale_jobs', to_jsonb(v_stale))
    from public.profiles p
   where p.role = 'admin'
     and p.is_banned = false;

  -- (2) NEW — out-of-band alert to a Slack/webhook URL stored in Vault. Skipped
  --     entirely when the secret is unset. Wrapped so a delivery failure can
  --     never roll back the in-app notifications above.
  begin
    select decrypted_secret into v_webhook_url
      from vault.decrypted_secrets
     where name = 'deadman_alert_webhook_url'
     limit 1;

    if v_webhook_url is not null and v_webhook_url <> '' then
      perform net.http_post(
        url     := v_webhook_url,
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body    := jsonb_build_object(
          'text', '[DNJ dead-man] ' || v_body,
          'stale_jobs', to_jsonb(v_stale)
        ),
        timeout_milliseconds := 10000
      );
    end if;
  exception when others then
    -- Never let alerting failures abort the dead-man check.
    raise warning 'cron_deadman_check: external alert failed: %', sqlerrm;
  end;
end
$f$;

revoke execute on function public.cron_deadman_check() from public;
grant execute on function public.cron_deadman_check() to service_role;

comment on function public.cron_deadman_check() is
  'Dead-man switch: in-app admin notification + optional Vault-gated external webhook alert when a monitored cron heartbeat is >36h stale. Redefined by 0197 (B6).';
