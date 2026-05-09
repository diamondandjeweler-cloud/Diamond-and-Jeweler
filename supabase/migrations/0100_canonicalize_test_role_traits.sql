-- 0100 — Canonicalize test-seed role traits (F11)
--
-- Closes F11 from 11_master_findings_index.md. The 9 H02–H10 test-seed
-- roles (created by supabase/seed_testers/seed_dnj_testers.sql) used
-- free-text trait slugs that are not in the canonical 10-tag
-- boss_expectation list defined in apps/web/src/routes/dashboard/PostRole.tsx
-- (TRAITS const). The matching engine and the candidate-card UI both
-- expect canonical slugs; non-canonical labels show as-is and don't
-- participate in scoring.
--
-- Real production roles entered through PostRole.tsx are already
-- canonical-only (the form is a checkbox-only picker). This migration
-- fixes the 9 seeded test rows in place. It is idempotent.
--
-- Mapping (legacy → canonical):
--   integrity              → reliable
--   attention_to_detail    → detail_oriented
--   execution              → self_starter
--   customer_focus         → customer_focused
--   resilience             → adaptable
--   energy                 → growth_minded
--   ownership              → accountable
--   calm_under_pressure    → reliable
--   empathy                → collaborator
--   precision              → detail_oriented
--   systems_thinking       → analytical
--   curiosity              → growth_minded
--   writing                → clear_communicator
--   leadership             → self_starter
--   technical_depth        → analytical
--   planning               → detail_oriented
--   craft                  → detail_oriented
--   collaboration          → collaborator
--
-- Scoped to the @dnj-test.my domain so production data is untouched.

with mapping(legacy, canonical) as (
  values
    ('integrity',           'reliable'),
    ('attention_to_detail', 'detail_oriented'),
    ('execution',           'self_starter'),
    ('customer_focus',      'customer_focused'),
    ('resilience',          'adaptable'),
    ('energy',              'growth_minded'),
    ('ownership',           'accountable'),
    ('calm_under_pressure', 'reliable'),
    ('empathy',             'collaborator'),
    ('precision',           'detail_oriented'),
    ('systems_thinking',    'analytical'),
    ('curiosity',           'growth_minded'),
    ('writing',             'clear_communicator'),
    ('leadership',          'self_starter'),
    ('technical_depth',     'analytical'),
    ('planning',            'detail_oriented'),
    ('craft',               'detail_oriented'),
    ('collaboration',       'collaborator')
),
test_roles as (
  select r.id, r.required_traits
  from public.roles r
  join public.hiring_managers hm on hm.id = r.hiring_manager_id
  join public.profiles p          on p.id = hm.profile_id
  where p.email like '%@dnj-test.my'
),
remapped as (
  select
    tr.id,
    -- For each trait, swap legacy → canonical when present, then dedup.
    array(
      select distinct coalesce(m.canonical, t)
      from unnest(tr.required_traits) as t
      left join mapping m on m.legacy = t
    ) as new_traits
  from test_roles tr
)
update public.roles r
   set required_traits = rm.new_traits
  from remapped rm
 where r.id = rm.id
   and r.required_traits is distinct from rm.new_traits;

-- Also rename the H08 Sofia role title to clarify the hotel context (F3).
update public.roles r
   set title = 'Hotel F&B Director'
  from public.hiring_managers hm
  join public.profiles p on p.id = hm.profile_id
 where r.hiring_manager_id = hm.id
   and p.email = 'h08.sofia.hospitality@dnj-test.my'
   and r.title = 'F&B Director';
