-- ════════════════════════════════════════════════════════════════════════════
-- Migration 0128 — Closed-loop stale-match feedback (Phase A)
--
-- 3 days after a role goes live with no positive match progression, surface a
-- market-gap summary to the HM and let them revise. Mirror surface for talents
-- whose profile has sat idle 3+ days with no positive progression.
--
-- Phase A scope (this migration):
--   * stale_loop_nudges log + 7d cooldown
--   * v_stale_roles, v_stale_talents detection views
--   * fn_compute_role_market_gap, fn_compute_talent_market_gap
--   * daily pg_cron at 09:30 MYT triggering `stale-loop-nudge` Edge Function
--
-- BaZi secrecy: this file MUST NOT reference life_chart, bazi, character.
-- Only commercial signals (salary, work_arrangement, hard filters).
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Nudge log
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.stale_loop_nudges (
  id              uuid primary key default gen_random_uuid(),
  party           text not null check (party in ('hm','talent')),
  subject_id      uuid not null,                       -- role_id when party='hm', talent_id when party='talent'
  role_id         uuid references public.roles(id) on delete cascade,
  talent_id       uuid references public.talents(id) on delete cascade,
  gap_payload     jsonb not null default '{}'::jsonb,
  nudge_kind      text not null default 'stale_3d' check (nudge_kind in ('stale_3d','stale_7d','stale_14d')),
  channel         text[] not null default '{}',        -- e.g. {in_app, email, whatsapp}
  sent_at         timestamptz not null default now(),
  response_at     timestamptz,
  response_kind   text check (response_kind in ('revised','declined','requested_coaching','ignored')),
  response_payload jsonb
);

create index if not exists idx_stale_nudges_party_subject on public.stale_loop_nudges(party, subject_id);
create index if not exists idx_stale_nudges_role on public.stale_loop_nudges(role_id) where role_id is not null;
create index if not exists idx_stale_nudges_talent on public.stale_loop_nudges(talent_id) where talent_id is not null;
create index if not exists idx_stale_nudges_sent on public.stale_loop_nudges(sent_at desc);

comment on table public.stale_loop_nudges is
  'Closed-loop feedback: when a role/talent has no positive match progression after 3 days, log a market-gap nudge here so cooldown + response tracking work end-to-end.';

alter table public.stale_loop_nudges enable row level security;

-- HM can read their own role nudges (read-only).
drop policy if exists stale_nudge_hm_read on public.stale_loop_nudges;
create policy stale_nudge_hm_read on public.stale_loop_nudges
  for select to authenticated
  using (
    party = 'hm'
    and exists (
      select 1 from public.roles r
      join public.hiring_managers hm on hm.id = r.hiring_manager_id
      where r.id = stale_loop_nudges.subject_id
        and hm.profile_id = auth.uid()
    )
  );

-- Talent can read their own nudges (read-only).
drop policy if exists stale_nudge_talent_read on public.stale_loop_nudges;
create policy stale_nudge_talent_read on public.stale_loop_nudges
  for select to authenticated
  using (
    party = 'talent'
    and exists (
      select 1 from public.talents t
      where t.id = stale_loop_nudges.subject_id
        and t.profile_id = auth.uid()
    )
  );

-- Admin sees everything (uses standard is_admin helper).
drop policy if exists stale_nudge_admin_all on public.stale_loop_nudges;
create policy stale_nudge_admin_all on public.stale_loop_nudges
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- HM and talents can write response_at/response_kind via dedicated RPC only —
-- no direct update policy. The RPC is defined below as a SECURITY DEFINER fn.

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Detection views
-- "Positive progression" = match has moved past 'viewed' into accepted_by_*,
--   invited_by_*, hr_scheduling, interview_*, offer_*, or hired. Mere
--   'generated' or 'viewed' status does NOT count as progress.
-- ────────────────────────────────────────────────────────────────────────────
create or replace view public.v_stale_roles as
select r.id           as role_id,
       r.hiring_manager_id,
       r.title,
       r.location,
       r.experience_level,
       r.salary_max,
       r.work_arrangement,
       r.created_at
from public.roles r
where r.status = 'active'
  and r.created_at < (now() - interval '3 days')
  and not exists (
    select 1 from public.matches m
    where m.role_id = r.id
      and m.status in (
        'accepted_by_talent','invited_by_manager','hr_scheduling',
        'interview_scheduled','interview_completed','offer_made','hired'
      )
  )
  -- 7-day cooldown: skip roles nudged in the last 7d
  and not exists (
    select 1 from public.stale_loop_nudges n
    where n.party = 'hm'
      and n.subject_id = r.id
      and n.sent_at > (now() - interval '7 days')
  );

comment on view public.v_stale_roles is
  'Active roles created 3+ days ago with no positive match progression and no nudge in the last 7 days.';

create or replace view public.v_stale_talents as
select t.id           as talent_id,
       t.profile_id,
       t.expected_salary_min,
       t.expected_salary_max,
       t.created_at
from public.talents t
where t.is_open_to_offers = true
  and t.created_at < (now() - interval '3 days')
  and not exists (
    select 1 from public.matches m
    where m.talent_id = t.id
      and m.status in (
        'accepted_by_talent','invited_by_manager','hr_scheduling',
        'interview_scheduled','interview_completed','offer_made','hired'
      )
  )
  and not exists (
    select 1 from public.stale_loop_nudges n
    where n.party = 'talent'
      and n.subject_id = t.id
      and n.sent_at > (now() - interval '7 days')
  );

comment on view public.v_stale_talents is
  'Talents open to offers who joined 3+ days ago with no positive match progression and no nudge in the last 7 days.';

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Gap computation functions
-- ────────────────────────────────────────────────────────────────────────────

-- Role-side: salary, work arrangement, hard filter deltas vs comparable roles.
create or replace function public.fn_compute_role_market_gap(p_role_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role record;
  v_market_median numeric;
  v_market_max numeric;
  v_peer_count int;
  v_peer_remote_pct numeric;
  v_peer_hybrid_pct numeric;
  v_peer_onsite_pct numeric;
  v_peer_travel_pct numeric;
  v_peer_own_car_pct numeric;
  v_peer_overtime_pct numeric;
  v_peer_night_pct numeric;
  v_peer_commission_pct numeric;
  v_gaps jsonb := '[]'::jsonb;
begin
  select id, title, location, experience_level, salary_max, work_arrangement,
         requires_travel, requires_own_car, requires_overtime, has_night_shifts,
         is_commission_based, requires_relocation
    into v_role
  from public.roles where id = p_role_id;

  if not found then return jsonb_build_object('error','role_not_found'); end if;

  -- Salary benchmark from market_rate_cache (loose title match + same level + same city).
  select median_salary, max_salary
    into v_market_median, v_market_max
  from public.market_rate_cache
  where lower(job_title) = lower(v_role.title)
    and lower(location) = lower(coalesce(v_role.location,''))
    and experience_level = v_role.experience_level
  order by snapshot_date desc
  limit 1;

  if v_market_median is null then
    -- Fallback: same title + same level, any location.
    select median_salary, max_salary
      into v_market_median, v_market_max
    from public.market_rate_cache
    where lower(job_title) = lower(v_role.title)
      and experience_level = v_role.experience_level
    order by snapshot_date desc
    limit 1;
  end if;

  if v_market_median is not null and v_role.salary_max is not null
     and v_role.salary_max < v_market_median then
    v_gaps := v_gaps || jsonb_build_object(
      'kind','salary_below_median',
      'role_max', v_role.salary_max,
      'market_median', v_market_median,
      'market_max', v_market_max,
      'suggest_max', round(v_market_median)::int
    );
  end if;

  -- Peer roles in market: same title family (ILIKE), same level, status=active,
  -- created within last 90d, OTHER hiring managers (exclude this role's HM).
  select count(*)::int,
    round(100.0 * count(*) filter (where work_arrangement = 'remote')
          / nullif(count(*),0), 1),
    round(100.0 * count(*) filter (where work_arrangement = 'hybrid')
          / nullif(count(*),0), 1),
    round(100.0 * count(*) filter (where work_arrangement = 'onsite')
          / nullif(count(*),0), 1),
    round(100.0 * count(*) filter (where requires_travel)
          / nullif(count(*),0), 1),
    round(100.0 * count(*) filter (where requires_own_car)
          / nullif(count(*),0), 1),
    round(100.0 * count(*) filter (where requires_overtime)
          / nullif(count(*),0), 1),
    round(100.0 * count(*) filter (where has_night_shifts)
          / nullif(count(*),0), 1),
    round(100.0 * count(*) filter (where is_commission_based)
          / nullif(count(*),0), 1)
    into v_peer_count, v_peer_remote_pct, v_peer_hybrid_pct, v_peer_onsite_pct,
         v_peer_travel_pct, v_peer_own_car_pct, v_peer_overtime_pct,
         v_peer_night_pct, v_peer_commission_pct
  from public.roles
  where id <> v_role.id
    and status = 'active'
    and experience_level = v_role.experience_level
    and lower(title) ilike '%' || lower(v_role.title) || '%'
    and created_at > (now() - interval '90 days');

  v_peer_count := coalesce(v_peer_count, 0);

  -- Onsite-only role while majority of peers offer remote/hybrid: flag.
  if v_role.work_arrangement = 'onsite' and v_peer_count >= 3
     and coalesce(v_peer_remote_pct + v_peer_hybrid_pct, 0) >= 50 then
    v_gaps := v_gaps || jsonb_build_object(
      'kind','arrangement_stricter_than_peers',
      'role_arrangement', v_role.work_arrangement,
      'peer_remote_pct', v_peer_remote_pct,
      'peer_hybrid_pct', v_peer_hybrid_pct,
      'suggest','hybrid'
    );
  end if;

  -- Requires own car but most peers don't.
  if v_role.requires_own_car and v_peer_count >= 3
     and coalesce(v_peer_own_car_pct, 100) <= 30 then
    v_gaps := v_gaps || jsonb_build_object(
      'kind','requires_own_car_uncommon',
      'peer_own_car_pct', v_peer_own_car_pct,
      'suggest_drop','requires_own_car'
    );
  end if;

  -- Required overtime when most peers don't require it.
  if v_role.requires_overtime and v_peer_count >= 3
     and coalesce(v_peer_overtime_pct, 100) <= 30 then
    v_gaps := v_gaps || jsonb_build_object(
      'kind','requires_overtime_uncommon',
      'peer_overtime_pct', v_peer_overtime_pct,
      'suggest_drop','requires_overtime'
    );
  end if;

  -- Required travel when most peers don't.
  if v_role.requires_travel and v_peer_count >= 3
     and coalesce(v_peer_travel_pct, 100) <= 30 then
    v_gaps := v_gaps || jsonb_build_object(
      'kind','requires_travel_uncommon',
      'peer_travel_pct', v_peer_travel_pct,
      'suggest_drop','requires_travel'
    );
  end if;

  return jsonb_build_object(
    'role_id', p_role_id,
    'role_title', v_role.title,
    'role_location', v_role.location,
    'experience_level', v_role.experience_level,
    'peer_count', v_peer_count,
    'market_median', v_market_median,
    'gaps', v_gaps,
    'computed_at', now()
  );
end;
$$;

revoke all on function public.fn_compute_role_market_gap(uuid) from public;
grant execute on function public.fn_compute_role_market_gap(uuid) to authenticated, service_role;

-- Talent-side: are their stated expectations stricter than the active market?
create or replace function public.fn_compute_talent_market_gap(p_talent_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_talent record;
  v_active_role_count int;
  v_role_median_max numeric;
  v_role_min_median numeric;
  v_gaps jsonb := '[]'::jsonb;
begin
  select id, expected_salary_min, expected_salary_max
    into v_talent
  from public.talents where id = p_talent_id;

  if not found then return jsonb_build_object('error','talent_not_found'); end if;

  -- Active-role market snapshot (last 90d, any title/location for Phase A).
  select count(*)::int,
         percentile_cont(0.5) within group (order by salary_max),
         percentile_cont(0.5) within group (order by salary_min)
    into v_active_role_count, v_role_median_max, v_role_min_median
  from public.roles
  where status = 'active'
    and created_at > (now() - interval '90 days')
    and salary_max is not null;

  v_active_role_count := coalesce(v_active_role_count, 0);

  -- Talent's minimum salary exceeds what the typical role offers.
  if v_talent.expected_salary_min is not null and v_role_median_max is not null
     and v_talent.expected_salary_min > v_role_median_max then
    v_gaps := v_gaps || jsonb_build_object(
      'kind','salary_expectation_above_market',
      'expected_min', v_talent.expected_salary_min,
      'market_role_median_max', v_role_median_max,
      'suggest_min', round(coalesce(v_role_min_median, v_role_median_max * 0.85))::int
    );
  end if;

  return jsonb_build_object(
    'talent_id', p_talent_id,
    'active_role_count', v_active_role_count,
    'role_median_max', v_role_median_max,
    'gaps', v_gaps,
    'computed_at', now()
  );
end;
$$;

revoke all on function public.fn_compute_talent_market_gap(uuid) from public;
grant execute on function public.fn_compute_talent_market_gap(uuid) to authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Response capture RPC — owners record their response to a nudge.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.fn_stale_loop_record_response(
  p_nudge_id uuid,
  p_response_kind text,
  p_response_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_party text;
  v_subject_id uuid;
  v_caller_profile uuid := auth.uid();
  v_owner boolean := false;
begin
  if p_response_kind not in ('revised','declined','requested_coaching','ignored') then
    raise exception 'invalid response_kind';
  end if;

  select party, subject_id into v_party, v_subject_id
  from public.stale_loop_nudges where id = p_nudge_id;
  if v_party is null then raise exception 'nudge not found'; end if;

  -- Caller must own the nudge subject.
  if v_party = 'hm' then
    select true into v_owner
    from public.roles r
    join public.hiring_managers hm on hm.id = r.hiring_manager_id
    where r.id = v_subject_id and hm.profile_id = v_caller_profile;
  else
    select true into v_owner
    from public.talents t
    where t.id = v_subject_id and t.profile_id = v_caller_profile;
  end if;

  if not coalesce(v_owner, false) and not public.is_admin() then
    raise exception 'forbidden';
  end if;

  update public.stale_loop_nudges
     set response_at = now(),
         response_kind = p_response_kind,
         response_payload = coalesce(p_response_payload, '{}'::jsonb)
   where id = p_nudge_id;
end;
$$;

revoke all on function public.fn_stale_loop_record_response(uuid, text, jsonb) from public;
grant execute on function public.fn_stale_loop_record_response(uuid, text, jsonb) to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Daily cron — 09:30 MYT (= 01:30 UTC)
-- Invokes Edge Function `stale-loop-nudge` via pg_net.
-- ────────────────────────────────────────────────────────────────────────────
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Drop prior schedule if re-running migration.
do $$
begin
  perform cron.unschedule('bole-stale-loop-daily-0930mt');
exception when others then
  null;
end;
$$;

select cron.schedule(
  'bole-stale-loop-daily-0930mt',
  '30 1 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url')
           || '/functions/v1/stale-loop-nudge',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 180000
  );
  $$
);
