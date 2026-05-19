-- Add flag so dashboard can show a "review your pre-filled role" banner
-- for roles auto-created at the end of HM onboarding.
alter table roles add column if not exists from_onboarding boolean not null default false;
