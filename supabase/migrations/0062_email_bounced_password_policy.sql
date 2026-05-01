-- Migration 0062: email_bounced flag on profiles + document password policy upgrade

-- email_bounced column: set by resend-webhook when a hard bounce or complaint is received.
-- The notify Edge Function skips sending to bounced addresses.
alter table profiles add column if not exists email_bounced boolean not null default false;

-- Index for the bounce handler's update query.
create index if not exists idx_profiles_email_bounced on profiles (email) where email_bounced = false;

-- Supabase auth password minimum length (requires Supabase dashboard change AND client enforcement).
-- Document the policy requirement here for auditors.
comment on table profiles is
  'User profiles. Password policy: minimum 12 characters, enforced at client layer (SignUp.tsx) and Supabase auth settings (Dashboard → Auth → Password minimum length = 12).';
