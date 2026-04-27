-- ============================================================
-- BoLe Platform — DEMO seed data for LOCAL DEV ONLY.
--
-- DO NOT run this in production. It creates fake companies, talents,
-- hiring managers, and matches so the UI has something to show right after
-- `supabase start`.
--
-- Prerequisites:
--   1. All migrations applied.
--   2. Create four auth users manually via Studio (http://localhost:54323):
--        - admin@diamondandjeweler.com         (role in metadata: admin)
--        - hr@techco.my          (role: hr_admin)
--        - hm@techco.my          (role: hiring_manager)
--        - talent.alice@gmail.my (role: talent)
--        - talent.bob@gmail.my   (role: talent)
--      (The on_auth_user_created trigger creates public.profiles rows from
--      raw_user_meta_data; the admin elevation is manual — see below.)
--   3. Run this script.
--
-- After running, log in as any of the demo accounts to see the platform with
-- populated data.
-- ============================================================

-- Elevate admin role.
update public.profiles
set role = 'admin', onboarding_complete = true
where email = 'admin@diamondandjeweler.com';

-- Mark HR onboarding complete (HR completes onboarding via CompanyRegister
-- in the app, but for demo data we fast-forward).
update public.profiles
set onboarding_complete = true
where email in ('hr@techco.my', 'hm@techco.my', 'talent.alice@gmail.my', 'talent.bob@gmail.my');

-- Demo company (needs created_by to reference HR's profile id).
do $$
declare
  hr_id uuid;
  hm_id uuid;
  alice_id uuid;
  bob_id uuid;
  company_id uuid;
  hm_row_id uuid;
  alice_talent_id uuid;
  bob_talent_id uuid;
  role_eng_id uuid;
  role_pm_id uuid;
begin
  select id into hr_id    from public.profiles where email = 'hr@techco.my';
  select id into hm_id    from public.profiles where email = 'hm@techco.my';
  select id into alice_id from public.profiles where email = 'talent.alice@gmail.my';
  select id into bob_id   from public.profiles where email = 'talent.bob@gmail.my';

  if hr_id is null or hm_id is null or alice_id is null or bob_id is null then
    raise notice 'Skipping demo seed: one or more auth users not found. Create them in Studio first.';
    return;
  end if;

  -- Company.
  insert into public.companies (name, registration_number, primary_hr_email, verified, size, industry, created_by, verified_at, verified_by)
  values ('TechCo Malaysia', 'SSM-202601-DEMO', 'hr@techco.my', true, '11-50', 'Software', hr_id, now(), (select id from public.profiles where email = 'admin@diamondandjeweler.com'))
  on conflict (registration_number) do update set verified = true
  returning id into company_id;

  -- Hiring manager.
  insert into public.hiring_managers (profile_id, company_id, job_title, leadership_tags, date_of_birth_encrypted)
  values (
    hm_id, company_id, 'Engineering Manager',
    jsonb_build_object('supportive', 1.0, 'clear_communicator', 0.9, 'collaborator', 0.8),
    public.encrypt_dob('1985-03-12')
  )
  on conflict (profile_id) do update set company_id = excluded.company_id
  returning id into hm_row_id;

  -- Talents.
  insert into public.talents (
    profile_id, date_of_birth_encrypted, privacy_mode, is_open_to_offers,
    expected_salary_min, expected_salary_max, derived_tags,
    preference_ratings, interview_answers
  ) values (
    alice_id,
    public.encrypt_dob('1993-07-21'),
    'public', true, 8000, 13000,
    jsonb_build_object('self_starter', 0.9, 'reliable', 0.8, 'growth_minded', 0.85, 'clear_communicator', 0.8),
    jsonb_build_object('Work–life balance', 5, 'Career growth / clear path', 5, 'Competitive salary & benefits', 4),
    jsonb_build_object('Tell me about yourself in brief.', 'Backend engineer, 5 years building payment systems in Malaysia.')
  ) on conflict (profile_id) do update set is_open_to_offers = true
  returning id into alice_talent_id;

  insert into public.talents (
    profile_id, date_of_birth_encrypted, privacy_mode, is_open_to_offers,
    expected_salary_min, expected_salary_max, derived_tags,
    preference_ratings, interview_answers
  ) values (
    bob_id,
    public.encrypt_dob('1990-11-02'),
    'anonymous', true, 9000, 14000,
    jsonb_build_object('collaborator', 0.9, 'detail_oriented', 0.8, 'accountable', 0.85),
    jsonb_build_object('Work–life balance', 4, 'Flexible work arrangements', 5, 'Team dynamics / colleagues', 5),
    jsonb_build_object('Tell me about yourself in brief.', 'Full-stack developer transitioning to product-focused work.')
  ) on conflict (profile_id) do update set is_open_to_offers = true
  returning id into bob_talent_id;

  -- Active role.
  insert into public.roles (
    hiring_manager_id, title, description, department, location,
    work_arrangement, experience_level, salary_min, salary_max,
    required_traits, status
  ) values (
    hm_row_id, 'Senior Backend Engineer',
    'Own our payments integrations end-to-end.',
    'Engineering', 'Kuala Lumpur', 'hybrid', 'senior',
    9000, 14000,
    array['self_starter','reliable','clear_communicator'],
    'active'
  ) returning id into role_eng_id;

  insert into public.roles (
    hiring_manager_id, title, description, department, location,
    work_arrangement, experience_level, salary_min, salary_max,
    required_traits, status
  ) values (
    hm_row_id, 'Product Manager, Growth',
    'Drive activation and retention for our new consumer product.',
    'Product', 'Kuala Lumpur', 'hybrid', 'mid',
    8000, 12000,
    array['collaborator','detail_oriented','clear_communicator'],
    'active'
  ) returning id into role_pm_id;

  -- Matches.
  insert into public.matches (
    role_id, talent_id, compatibility_score, tag_compatibility, life_chart_score,
    internal_reasoning, status, expires_at
  ) values
    (role_eng_id, alice_talent_id, 82, 82, null,
     jsonb_build_object('role_traits', array['self_starter','reliable','clear_communicator'], 'note', 'demo seed'),
     'generated', now() + interval '5 days'),
    (role_pm_id, bob_talent_id, 75, 75, null,
     jsonb_build_object('role_traits', array['collaborator','detail_oriented','clear_communicator'], 'note', 'demo seed'),
     'generated', now() + interval '5 days')
  on conflict (role_id, talent_id) do nothing;
end
$$;

-- Waitlist sample.
insert into public.waitlist (email, full_name, intended_role, note) values
  ('waitlist.carol@example.com', 'Carol Tan', 'talent', 'UX designer, 8 yrs'),
  ('waitlist.hr@acme.my',        'Dina Rahim', 'hr_admin', 'Series B HR lead, 120 headcount')
on conflict (email) do nothing;
