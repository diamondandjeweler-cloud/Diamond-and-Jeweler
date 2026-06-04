-- 0136_onboarding_reminder_cron.sql
-- Auto-send a single onboarding reminder email to talents who haven't completed
-- onboarding after 48 hours. Runs hourly via pg_cron, uses Resend via pg_net.
-- Test domains (@dnj-test.my, @yopmail.com, @sharklasers.com, etc.) are excluded.
--
-- Requires vault secret `resend_api_key` (added 2026-05-26).

alter table public.profiles
  add column if not exists onboarding_reminder_sent_at timestamptz;

alter table public.profiles
  add column if not exists onboarding_reminder_count smallint default 0 not null;

create or replace function public.send_onboarding_reminders()
returns table(profile_id uuid, email text, request_id bigint)
language plpgsql
security definer
set search_path = public, pg_catalog
as $f$
declare
  r record;
  resend_key text;
  req_id bigint;
begin
  select decrypted_secret into resend_key
    from vault.decrypted_secrets
   where name = 'resend_api_key'
   limit 1;

  if resend_key is null then
    raise notice 'resend_api_key not in vault yet - skipping';
    return;
  end if;

  for r in
    select id, email,
           coalesce(nullif(split_part(coalesce(full_name, ''), ' ', 1), ''), 'there') as first_name
      from profiles
     where role = 'talent'
       and onboarding_complete = false
       and deleted_at is null
       and is_banned = false
       and coalesce(email_bounced, false) = false
       and onboarding_reminder_sent_at is null
       and created_at < now() - interval '48 hours'
       and email is not null
       and email not ilike '%@dnj-test.my'
       and email not ilike '%@dnjtest.mock'
       and email not ilike '%@dnjtest.local'
       and email not ilike '%@yopmail.com'
       and email not ilike '%@sharklasers.com'
       and email not ilike '%@example.com'
       and email not ilike '%@dnj-demo.my'
     limit 50
  loop
    select net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || resend_key,
        'Content-Type',  'application/json'
      ),
      body := jsonb_build_object(
        'from',    'DNJ <noreply@diamondandjeweler.com>',
        'to',      jsonb_build_array(r.email),
        'subject', 'Finish your DNJ profile - takes 2 minutes',
        'html',    format(
          '<p>Hi %s,</p><p>You started creating your DNJ profile but didn''t finish - your account is sitting half-complete.</p><p>Employers can only match with you after your profile is done. It takes about 2 minutes.</p><p><a href="https://diamondandjeweler.com/onboarding">Finish my profile</a></p><p>If you ran into a problem, just reply to this email and we''ll sort it.</p><p>- Team DNJ<br/>Diamond and Jeweler &middot; <a href="https://diamondandjeweler.com">diamondandjeweler.com</a></p>',
          r.first_name
        )
      )
    ) into req_id;

    update profiles
       set onboarding_reminder_sent_at = now(),
           onboarding_reminder_count   = onboarding_reminder_count + 1
     where id = r.id;

    profile_id := r.id;
    email      := r.email;
    request_id := req_id;
    return next;
  end loop;
end
$f$;

-- Schedule hourly (idempotent: unschedule existing first if present)
do $$
begin
  if exists (select 1 from cron.job where jobname = 'dnj-onboarding-reminder-hourly') then
    perform cron.unschedule('dnj-onboarding-reminder-hourly');
  end if;
  perform cron.schedule(
    'dnj-onboarding-reminder-hourly',
    '0 * * * *',
    $cron$select public.send_onboarding_reminders();$cron$
  );
end $$;
