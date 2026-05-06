-- ============================================================
-- Launch readiness: missing indexes identified in pre-launch audit
-- ============================================================

-- roles.title: searched/filtered heavily on the job-listing page
create index if not exists idx_roles_title
  on public.roles (title);

-- roles: full-text search on title + description for job discovery
create index if not exists idx_roles_title_fts
  on public.roles using gin (
    to_tsvector('english', title || ' ' || coalesce(description, ''))
  );

-- hiring_managers.job_title: used in profile display and HM search filters
create index if not exists idx_hm_job_title
  on public.hiring_managers (job_title);

-- interviews.status: pipeline views filter heavily by stage
create index if not exists idx_interviews_status
  on public.interviews (status);

-- interviews.scheduled_at: calendar/agenda views order by date
create index if not exists idx_interviews_scheduled_at
  on public.interviews (scheduled_at);
