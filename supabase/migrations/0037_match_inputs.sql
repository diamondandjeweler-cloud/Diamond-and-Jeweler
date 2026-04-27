-- ============================================================
-- BoLe Platform — Match-engine inputs (character matrix, age, location)
--
-- 1. life_chart_compatibility — 9x9 lookup keyed on
--    (hm_character, talent_character) -> bucket
--    bucket in (priority, two_match, neutral, bad).
--    Hard-fail: bad => never pair this HM with this talent.
-- 2. compute_age_match_score(hm_dob, talent_dob) — piecewise score
--    where HM same age or older = 100, sliding penalty as HM gets younger.
-- 3. talents.location_matters / location_postcode — applicant says whether
--    distance matters; postcode optional.
-- 4. roles.location_postcode — coarse proximity input.
-- 5. weight_character / weight_age / weight_location seeds in system_config.
-- ============================================================

create table if not exists public.life_chart_compatibility (
  hm_character     text not null
    check (hm_character in ('E','W','F','E+','E-','W+','W-','G+','G-')),
  talent_character text not null
    check (talent_character in ('E','W','F','E+','E-','W+','W-','G+','G-')),
  bucket           text not null
    check (bucket in ('priority','two_match','neutral','bad')),
  primary key (hm_character, talent_character)
);

-- Seed the matrix. Pairs that the source matrix lists in TWO buckets
-- (intentional duplication per row 1, plus one accidental row-8 conflict)
-- resolve to the BETTER bucket via `on conflict do nothing` ordering.
-- Pairs the matrix doesn't enumerate (W↔W+, W↔W-, E+↔G-) default to neutral.

-- Pass 1: priority pairs
insert into public.life_chart_compatibility (hm_character, talent_character, bucket) values
  ('W','F','priority'),  ('W','W','priority'),
  ('E-','W','priority'), ('E-','E-','priority'),
  ('W+','E+','priority'),('W+','E-','priority'),
  ('W-','E+','priority'),('W-','E-','priority'),
  ('E','W','priority'),  ('E','E','priority'),
  ('G+','W-','priority'),('G+','W+','priority'),
  ('G-','W-','priority'),('G-','G-','priority'),
  ('E+','W','priority'), ('E+','E+','priority'),
  ('F','G-','priority'), ('F','G+','priority')
on conflict (hm_character, talent_character) do nothing;

-- Pass 2: two_match pairs
insert into public.life_chart_compatibility (hm_character, talent_character, bucket) values
  ('W','G+','two_match'), ('W','G-','two_match'),
  ('E-','F','two_match'), ('E-','E+','two_match'),
  ('W+','E','two_match'), ('W+','W-','two_match'),
  ('W-','W','two_match'), ('W-','W-','two_match'),
  ('E','E-','two_match'), ('E','E+','two_match'),
  ('G+','G+','two_match'),('G+','E-','two_match'),
  ('G-','G+','two_match'),('G-','E+','two_match'),
  ('E+','F','two_match'), ('E+','W-','two_match'),
  ('F','F','two_match'),  ('F','W-','two_match')
on conflict (hm_character, talent_character) do nothing;

-- Pass 3: neutral pairs
insert into public.life_chart_compatibility (hm_character, talent_character, bucket) values
  ('E-','G+','neutral'),('E-','G-','neutral'),
  ('W+','W+','neutral'),('W+','W','neutral'),
  ('W-','F','neutral'), ('W-','W+','neutral'),
  ('E','F','neutral'),  ('E','G+','neutral'),
  ('G+','W','neutral'), ('G+','E+','neutral'),
  ('G-','W','neutral'), ('G-','E-','neutral'),
  ('E+','E-','neutral'),('E+','G+','neutral'),
  ('F','E-','neutral'), ('F','W+','neutral')
on conflict (hm_character, talent_character) do nothing;

-- Pass 4: bad pairs (hard-fail)
insert into public.life_chart_compatibility (hm_character, talent_character, bucket) values
  ('W','E-','bad'),  ('W','E','bad'),  ('W','E+','bad'),
  ('E-','W-','bad'), ('E-','W+','bad'),('E-','E','bad'),
  ('W+','G+','bad'), ('W+','G-','bad'),('W+','F','bad'),
  ('W-','E','bad'),  ('W-','G-','bad'),('W-','G+','bad'),
  ('E','G-','bad'),  ('E','W+','bad'), ('E','W-','bad'),
  ('G+','E','bad'),  ('G+','G-','bad'),('G+','F','bad'),
  ('G-','E','bad'),  ('G-','W+','bad'),('G-','F','bad'),
  ('E+','E','bad'),  ('E+','W+','bad'),
  ('F','E','bad'),   ('F','E+','bad'), ('F','W','bad')
on conflict (hm_character, talent_character) do nothing;

-- Pass 5: fill any missing (hm, talent) pairs with neutral.
-- This protects against future schema changes and the row-1/row-8 gaps.
insert into public.life_chart_compatibility (hm_character, talent_character, bucket)
select hm.c, t.c, 'neutral'
from
  (values ('E'),('W'),('F'),('E+'),('E-'),('W+'),('W-'),('G+'),('G-')) as hm(c),
  (values ('E'),('W'),('F'),('E+'),('E-'),('W+'),('W-'),('G+'),('G-')) as t(c)
on conflict (hm_character, talent_character) do nothing;

-- ---------- helpers ----------

create or replace function public.get_life_chart_bucket(hm_char text, talent_char text)
returns text language sql stable as $$
  select bucket
  from public.life_chart_compatibility
  where hm_character = hm_char and talent_character = talent_char
$$;

grant execute on function public.get_life_chart_bucket(text, text) to authenticated, service_role;

-- HM same-age-or-older = 100. Sliding penalty as HM gets younger:
--   < 5 years younger        -> 70
--   5 to <10 years younger   -> 30
--   >= 10 years younger      -> 0
-- Either DOB null -> 50 (no signal).
create or replace function public.compute_age_match_score(hm_dob date, talent_dob date)
returns int language sql immutable as $$
  select case
    when hm_dob is null or talent_dob is null then 50
    when hm_dob <= talent_dob then 100
    when extract(year from age(hm_dob, talent_dob))::int >= 10 then 0
    when extract(year from age(hm_dob, talent_dob))::int >= 5 then 30
    else 70
  end
$$;

grant execute on function public.compute_age_match_score(date, date) to authenticated, service_role;

-- ---------- talents: location preference ----------

alter table public.talents
  add column if not exists location_matters boolean not null default false,
  add column if not exists location_postcode text;

-- ---------- roles: postcode for proximity ----------

alter table public.roles
  add column if not exists location_postcode text;

-- ---------- match-engine weights ----------

insert into public.system_config (key, value) values
  ('weight_character', '0.20'::jsonb),
  ('weight_age',       '0.10'::jsonb),
  ('weight_location',  '0.10'::jsonb)
on conflict (key) do nothing;
