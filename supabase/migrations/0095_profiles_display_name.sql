-- 0095 — profiles.display_name
--
-- Adds an opt-in display name so users can be addressed as they prefer (e.g.
-- a Chinese family-name-first user can ask to be greeted by their given name,
-- or a Western user can use a nickname).
--
-- The column is nullable; the frontend falls back to a Chinese-surname-aware
-- parse of full_name when display_name is null.

alter table public.profiles
  add column if not exists display_name text;

comment on column public.profiles.display_name is
  'Optional preferred display name. Falls back to a parse of full_name when null.';

-- No RLS change needed — the existing profile self-read/write policies cover
-- this column under "select/update own profile".
