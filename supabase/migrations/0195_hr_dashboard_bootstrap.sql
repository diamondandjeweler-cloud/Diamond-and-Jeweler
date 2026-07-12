-- 0195_hr_dashboard_bootstrap.sql
-- ============================================================================
-- B5 — hr_dashboard_bootstrap(p_email): single-round-trip HR dashboard loader.
--
-- The HR dashboard hook (apps/web/src/routes/dashboard/hr/useHrDashboardData.tsx)
-- currently runs a 5+ phase client-side waterfall:
--   company-by-hr-email → HMs+names → roles-for-HMs → (pending matches +
--   scheduled interviews + outcomes-pending) in parallel.
-- On the nano pooler that is up to 5 serial RTTs before the dashboard paints.
-- This SECURITY DEFINER RPC assembles the identical data in ONE call and
-- returns it as JSON. The client hook can PREFER this RPC and fall back to the
-- existing waterfall when it is absent (backward-compatible) — that hook swap
-- is STAGED (see docs/STAGED_DEPLOYS.md), so applying this migration alone
-- changes nothing until the client opts in.
--
-- AUTHORIZATION (critical — SECURITY DEFINER bypasses RLS):
--   The caller must be the company's own primary HR contact (their
--   profiles.email == companies.primary_hr_email == p_email) OR a platform
--   admin. Any other caller gets an authz error — this RPC can NEVER be used to
--   read a different company's pipeline by passing someone else's email.
--
-- The projections below are copied verbatim from the repository query builders
-- they replace so the JSON shape maps 1:1 onto the hook's existing mappers:
--   companies.companyIdByHrEmail, hiringManagers.hmsWithNamesByCompanyId,
--   roles.listRolesForHms, matches.hrPendingMatches / hrOutcomesPendingMatches,
--   interviews.hrScheduledInterviewsForRoles.
--
-- Idempotent (CREATE OR REPLACE). Additive — no schema change.
-- ============================================================================

create or replace function public.hr_dashboard_bootstrap(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid          uuid := auth.uid();
  v_caller_email text;
  v_company_id   uuid;
  v_hm_ids       uuid[];
  v_role_ids     uuid[];
  v_result       jsonb;
begin
  if v_uid is null then
    raise exception 'hr_dashboard_bootstrap: not authenticated' using errcode = '28000';
  end if;

  -- Resolve the caller's own email + admin flag from their profile.
  select email into v_caller_email from public.profiles where id = v_uid;

  -- Authz: caller must be an admin, or be querying their OWN email.
  if not public.is_admin()
     and (v_caller_email is null or lower(v_caller_email) is distinct from lower(p_email)) then
    raise exception 'hr_dashboard_bootstrap: forbidden' using errcode = '42501';
  end if;

  -- §0 — Company by primary HR email (mirrors companyIdByHrEmail).
  select id into v_company_id
  from public.companies
  where primary_hr_email = p_email
  limit 1;

  if v_company_id is null then
    -- No company row yet — return the empty-but-loaded shape the hook expects
    -- (company:null with materialised empty lists so it renders EmptyState).
    return jsonb_build_object(
      'company',          null,
      'hms',              '[]'::jsonb,
      'open_roles',       '[]'::jsonb,
      'pending',          '[]'::jsonb,
      'scheduled',        '[]'::jsonb,
      'outcomes_pending', 0
    );
  end if;

  -- §1 — Hiring managers in the company, with profile names
  --       (mirrors hmsWithNamesByCompanyId + the client role_count rollup).
  select coalesce(array_agg(hm.id), array[]::uuid[])
  into v_hm_ids
  from public.hiring_managers hm
  where hm.company_id = v_company_id;

  -- §2 — Role ids across those HMs (mirrors listRolesForHms).
  select coalesce(array_agg(r.id), array[]::uuid[])
  into v_role_ids
  from public.roles r
  where r.hiring_manager_id = any(v_hm_ids);

  select jsonb_build_object(
    'company', jsonb_build_object('id', v_company_id),

    -- HMs with names + per-HM role_count.
    'hms', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',         hm.id,
        'profile_id', hm.profile_id,
        'full_name',  coalesce(pr.full_name, '(unknown)'),
        'job_title',  hm.job_title,
        'role_count', coalesce(rc.cnt, 0)
      ) order by hm.id)
      from public.hiring_managers hm
      join public.profiles pr on pr.id = hm.profile_id
      left join (
        select r.hiring_manager_id, count(*)::int as cnt
        from public.roles r
        where r.hiring_manager_id = any(v_hm_ids)
        group by r.hiring_manager_id
      ) rc on rc.hiring_manager_id = hm.id
      where hm.company_id = v_company_id
    ), '[]'::jsonb),

    -- Open roles (mirrors listRolesForHms projection + order).
    'open_roles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',                 r.id,
        'title',              r.title,
        'hiring_manager_id',  r.hiring_manager_id
      ) order by r.created_at desc)
      from public.roles r
      where r.hiring_manager_id = any(v_hm_ids)
    ), '[]'::jsonb),

    -- Pending matches (mirrors hrPendingMatches: invited_by_manager|hr_scheduling).
    'pending', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',                  m.id,
        'status',              m.status,
        'compatibility_score', m.compatibility_score,
        'role',                jsonb_build_object('id', ro.id, 'title', ro.title),
        'talent',              jsonb_build_object('id', ta.id, 'profile_id', ta.profile_id)
      ) order by m.invited_at asc nulls last)
      from public.matches m
      left join public.roles ro   on ro.id = m.role_id
      left join public.talents ta on ta.id = m.talent_id
      where m.role_id = any(v_role_ids)
        and m.status in ('invited_by_manager', 'hr_scheduling')
    ), '[]'::jsonb),

    -- Scheduled interviews (mirrors hrScheduledInterviewsForRoles).
    'scheduled', coalesce((
      select jsonb_agg(jsonb_build_object(
        'interview_id',     iv.id,
        'match_id',         iv.match_id,
        'status',           iv.status,
        'scheduled_at',     iv.scheduled_at,
        'format',           iv.format,
        'meeting_url',      iv.meeting_url,
        'meeting_provider', iv.meeting_provider,
        'role_title',       coalesce(ro.title, '(role gone)'),
        'talent_id',        coalesce(m.talent_id::text, '')
      ) order by iv.scheduled_at asc nulls last)
      from public.interviews iv
      join public.matches m on m.id = iv.match_id
      left join public.roles ro on ro.id = m.role_id
      where m.role_id = any(v_role_ids)
        and iv.status in ('scheduled', 'confirmed')
    ), '[]'::jsonb),

    -- Outcomes-pending count (mirrors hrOutcomesPendingMatches: completed/hired
    -- matches that have NO match_feedback row yet).
    'outcomes_pending', coalesce((
      select count(*)::int
      from public.matches m
      where m.role_id = any(v_role_ids)
        and m.status in ('interview_completed', 'hired')
        and not exists (
          select 1 from public.match_feedback mf where mf.match_id = m.id
        )
    ), 0)
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.hr_dashboard_bootstrap(text) from public;
grant execute on function public.hr_dashboard_bootstrap(text) to authenticated;

comment on function public.hr_dashboard_bootstrap(text) is
  'Single-round-trip HR dashboard loader. Authz: caller must own the company (profiles.email == companies.primary_hr_email) or be admin. Mirrors the useHrDashboardData waterfall. Added by 0195 (B5).';
