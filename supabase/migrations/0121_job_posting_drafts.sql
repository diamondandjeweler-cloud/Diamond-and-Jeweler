-- F-10: Server-side job posting draft persistence
-- One row per hiring manager, upserted on "Save draft" click in PostRole.tsx.
-- Survives localStorage clears, browser switches, and device changes.
-- The fast-path autosave to localStorage (already in PostRole.tsx) is unaffected —
-- this is a durable backup layer on top of it.

create table if not exists job_posting_drafts (
  id         uuid        default gen_random_uuid() primary key,
  hm_id      uuid        not null references hiring_managers(id) on delete cascade,
  draft_data jsonb       not null default '{}'::jsonb,
  updated_at timestamptz default now() not null,
  unique (hm_id)
);

-- set_updated_at may already exist from earlier migrations; CREATE OR REPLACE is safe.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists job_posting_drafts_updated_at on job_posting_drafts;
create trigger job_posting_drafts_updated_at
  before update on job_posting_drafts
  for each row execute function public.set_updated_at();

alter table job_posting_drafts enable row level security;

-- HMs can only read and write their own draft row
create policy "hm own draft" on job_posting_drafts
  for all using (
    hm_id = (select id from hiring_managers where profile_id = auth.uid())
  );
