-- Migration 0051: Employment type preferences + feedback score + match_feedback table

-- ── talents ──────────────────────────────────────────────────────────────────
alter table public.talents
  add column if not exists employment_type_preferences text[] not null default '{}',
  add column if not exists feedback_score float
    check (feedback_score is null or (feedback_score >= 0.0 and feedback_score <= 1.0));

comment on column public.talents.employment_type_preferences is
  'Preferred employment types from onboarding: full_time, part_time, contract, gig, internship';
comment on column public.talents.feedback_score is
  'Rolling HM feedback score 0.0–1.0 (avg_rating/5.0). null = no feedback yet.';

-- ── match_feedback ────────────────────────────────────────────────────────────
create table if not exists public.match_feedback (
  id         uuid        primary key default gen_random_uuid(),
  match_id   uuid        not null references public.matches(id) on delete cascade,
  rating     smallint    not null check (rating between 1 and 5),
  hired      boolean     not null default false,
  notes      text,
  created_at timestamptz not null default now(),
  unique (match_id)
);

comment on table public.match_feedback is
  'HM star rating (1–5) + hire outcome per match. Feeds talent.feedback_score via trigger.';

alter table public.match_feedback enable row level security;

create policy "hm_manage_own_feedback" on public.match_feedback
  for all to authenticated
  using (
    exists (
      select 1 from public.matches m
      join public.roles r on r.id = m.role_id
      join public.hiring_managers hm on hm.id = r.hiring_manager_id
      where m.id = match_feedback.match_id
        and hm.profile_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.matches m
      join public.roles r on r.id = m.role_id
      join public.hiring_managers hm on hm.id = r.hiring_manager_id
      where m.id = match_id
        and hm.profile_id = auth.uid()
    )
  );

create policy "admin_all_feedback" on public.match_feedback
  for all to authenticated
  using (is_admin())
  with check (is_admin());

-- ── trigger: recompute talent.feedback_score on every feedback upsert ─────────
create or replace function public.recompute_talent_feedback_score()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_talent_id uuid;
  v_avg       float;
begin
  select m.talent_id into v_talent_id
  from public.matches m
  where m.id = coalesce(new.match_id, old.match_id);

  if v_talent_id is null then return coalesce(new, old); end if;

  select avg(mf.rating)::float / 5.0
  into v_avg
  from public.match_feedback mf
  join public.matches m on m.id = mf.match_id
  where m.talent_id = v_talent_id;

  update public.talents set feedback_score = v_avg where id = v_talent_id;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_match_feedback_score on public.match_feedback;
create trigger trg_match_feedback_score
  after insert or update or delete on public.match_feedback
  for each row execute function public.recompute_talent_feedback_score();
