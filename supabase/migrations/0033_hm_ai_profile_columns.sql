-- Add AI-extracted profile columns to hiring_managers.
-- These are populated by extract-hm-profile Edge Function after the Bo chat.

alter table public.hiring_managers
  add column if not exists industry          text,
  add column if not exists role_type         text,
  add column if not exists culture_offers    jsonb,
  add column if not exists required_traits   text[],
  add column if not exists salary_offer_min  integer,
  add column if not exists salary_offer_max  integer,
  add column if not exists ai_summary        text,
  add column if not exists interview_answers jsonb;
