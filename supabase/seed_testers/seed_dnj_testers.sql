-- ============================================================
-- DNJ AI Tester Seed
-- Creates 1 admin (A01) + 9 hiring managers (H02..H10) + 20 talents (T01..T20)
-- All emails end in @dnj-test.my
-- All passwords: TestDNJ#2026
-- Re-runnable: deletes prior @dnj-test.my data first.
-- ============================================================

-- 1) CLEANUP (idempotent)
-- Order matters: hiring_managers RESTRICT-references companies; companies NO-ACTION-references
-- profiles (created_by + verified_by). So drop in dependency order before auth.users cascade.
DELETE FROM public.hiring_managers WHERE profile_id IN (SELECT id FROM public.profiles WHERE email LIKE '%@dnj-test.my');
DELETE FROM public.companies       WHERE primary_hr_email LIKE '%@dnj-test.my';
-- MFA factors don't cascade with auth.users in some Supabase versions and survive
-- a re-seed if left in place. Stale 'unverified' factors created by browsing
-- /mfa/enroll then trip "factor already exists" on every subsequent enrol.
DELETE FROM auth.mfa_factors       WHERE user_id IN (SELECT id FROM auth.users WHERE email LIKE '%@dnj-test.my');
-- Now auth.users can safely cascade to profiles -> talents.
DELETE FROM auth.users             WHERE email LIKE '%@dnj-test.my';

-- ============================================================
-- 2) CREATE auth.users + auth.identities for all 30 testers
--    profiles row is auto-created by handle_new_user() trigger.
-- ============================================================
WITH t(tester_id, email, full_name, user_role) AS (VALUES
  ('A01','a01.admin@dnj-test.my',                       'BoLe Test Admin',           'admin'),
  ('H02','h02.andrew.finance@dnj-test.my',              'Andrew Lee',                'hiring_manager'),
  ('H03','h03.anita.retail@dnj-test.my',                'Anita Selvaraj',            'hiring_manager'),
  ('H04','h04.khairul.fnb@dnj-test.my',                 'Khairul Anwar',             'hiring_manager'),
  ('H05','h05.meiling.health@dnj-test.my',              'Tan Mei Ling',              'hiring_manager'),
  ('H06','h06.faridah.edtech@dnj-test.my',              'Faridah Hashim',            'hiring_manager'),
  ('H07','h07.vijay.logistics@dnj-test.my',             'Vijay Raman',               'hiring_manager'),
  ('H08','h08.sofia.hospitality@dnj-test.my',           'Sofia Abdullah',            'hiring_manager'),
  ('H09','h09.kwanghoe.construction@dnj-test.my',       'Lee Kwang Hoe',             'hiring_manager'),
  ('H10','h10.chloe.design@dnj-test.my',                'Chloe Ng',                  'hiring_manager'),
  ('T01','t01.aiman.tech@dnj-test.my',                  'Aiman Rashid',              'talent'),
  ('T02','t02.weiming.finance@dnj-test.my',             'Tan Wei Ming',              'talent'),
  ('T03','t03.priya.retail@dnj-test.my',                'Priya Devi',                'talent'),
  ('T04','t04.hafiz.fnb@dnj-test.my',                   'Hafiz Bin Yusof',           'talent'),
  ('T05','t05.sueann.health@dnj-test.my',               'Lim Sue Ann',               'talent'),
  ('T06','t06.aisyah.edtech@dnj-test.my',               'Nurul Aisyah',              'talent'),
  ('T07','t07.ravi.logistics@dnj-test.my',              'Ravi Krishnan',             'talent'),
  ('T08','t08.hidayah.hospitality@dnj-test.my',         'Nurul Hidayah',             'talent'),
  ('T09','t09.kahleong.construction@dnj-test.my',       'Choo Kah Leong',            'talent'),
  ('T10','t10.sarah.design@dnj-test.my',                'Sarah Chong',               'talent'),
  ('T11','t11.faisal.manufacturing@dnj-test.my',        'Faisal Hakim',              'talent'),
  ('T12','t12.joanna.marketing@dnj-test.my',            'Joanna Yeoh',               'talent'),
  ('T13','t13.dharmendra.legal@dnj-test.my',            'Dharmendra Singh',          'talent'),
  ('T14','t14.suzanne.hr@dnj-test.my',                  'Suzanne Lim',               'talent'),
  ('T15','t15.rohan.consulting@dnj-test.my',            'Rohan Menon',               'talent'),
  ('T16','t16.adlina.telecom@dnj-test.my',              'Adlina Binti Ismail',       'talent'),
  ('T17','t17.razif.energy@dnj-test.my',                'Razif Bin Hamid',           'talent'),
  ('T18','t18.vinothini.pharma@dnj-test.my',            'Vinothini Suppiah',         'talent'),
  ('T19','t19.kokwei.automotive@dnj-test.my',           'Tan Kok Wei',               'talent'),
  ('T20','t20.nurin.sales@dnj-test.my',                 'Nurin Iskandar',            'talent')
), inserted AS (
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token,
    raw_app_meta_data, raw_user_meta_data
  )
  SELECT
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated','authenticated',
    t.email,
    crypt('TestDNJ#2026', gen_salt('bf')),
    now(), now(), now(),
    '', '', '', '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', t.full_name, 'role', t.user_role, 'tester_id', t.tester_id)
  FROM t
  RETURNING id, email
)
INSERT INTO auth.identities (
  provider_id, user_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
SELECT
  i.id::text, i.id,
  jsonb_build_object('sub', i.id::text, 'email', i.email, 'email_verified', true),
  'email', now(), now(), now()
FROM inserted i;

-- ============================================================
-- 3) Finalize profiles (trigger created the row already)
-- ============================================================
UPDATE public.profiles p
SET onboarding_complete = true,
    waitlist_approved   = true,
    consent_version     = 'v2.1',
    consent_signed_at   = now(),
    consents            = '{"pdpa":true,"terms":true,"ai_data":true,"marketing":false}'::jsonb,
    locale              = 'en',
    phone               = '+60' || (123450000 + (abs(hashtext(p.email)) % 99999))::text,
    whatsapp_number     = '+60' || (123450000 + (abs(hashtext(p.email)) % 99999))::text,
    whatsapp_opt_in     = true
FROM auth.users u
WHERE p.id = u.id AND u.email LIKE '%@dnj-test.my';

-- ============================================================
-- 4) Create one company per HM (H02..H10), HM is created_by + verified by self
-- ============================================================
INSERT INTO public.companies (
  name, registration_number, primary_hr_email,
  industry, size, website,
  verified, verified_at, verified_by,
  created_by
)
SELECT d.company_name, d.reg_no, d.hm_email,
       d.industry, d.size, d.website,
       true, now(), p.id,
       p.id
FROM (VALUES
  ('h02.andrew.finance@dnj-test.my',        'Pinnacle Capital Sdn Bhd',          '202401000002', 'Finance / Banking',           '51-200', 'https://pinnacle-capital.example.my'),
  ('h03.anita.retail@dnj-test.my',          'LumiRetail Sdn Bhd',                '202401000003', 'Retail / E-commerce',         '11-50',  'https://lumiretail.example.my'),
  ('h04.khairul.fnb@dnj-test.my',           'Saji Selera Group Sdn Bhd',         '202401000004', 'F&B / Restaurant',            '51-200', 'https://sajiselera.example.my'),
  ('h05.meiling.health@dnj-test.my',        'KlinikQ Holdings Sdn Bhd',          '202401000005', 'Healthcare / Medical',        '51-200', 'https://klinikq.example.my'),
  ('h06.faridah.edtech@dnj-test.my',        'Lumio Learning Sdn Bhd',            '202401000006', 'EdTech / Education',          '11-50',  'https://lumiolearning.example.my'),
  ('h07.vijay.logistics@dnj-test.my',       'KargoLink Logistics Sdn Bhd',       '202401000007', 'Logistics / Supply Chain',    '201-500','https://kargolink.example.my'),
  ('h08.sofia.hospitality@dnj-test.my',     'Heritage Hotels Group Sdn Bhd',     '202401000008', 'Hospitality / Hotel',         '201-500','https://heritagehotels.example.my'),
  ('h09.kwanghoe.construction@dnj-test.my', 'Granitebuild Engineering Sdn Bhd',  '202401000009', 'Construction / Real Estate',  '51-200', 'https://granitebuild.example.my'),
  ('h10.chloe.design@dnj-test.my',          'Studio Lumens Creative Sdn Bhd',    '202401000010', 'Design / Creative',           '11-50',  'https://studiolumens.example.my')
) AS d(hm_email, company_name, reg_no, industry, size, website)
JOIN public.profiles p ON p.email = d.hm_email;

-- ============================================================
-- 5) Insert hiring_managers rows linked to companies
-- ============================================================
INSERT INTO public.hiring_managers (
  profile_id, company_id, job_title,
  industry, role_type,
  salary_offer_min, salary_offer_max,
  hire_urgency, work_arrangement_offered, role_open_reason, career_growth_potential,
  team_size, interview_stages, panel_involved,
  required_traits, culture_offers, must_haves,
  ai_summary,
  gender,
  location_postcode, location_matters,
  required_work_authorization,
  budget_approved, salary_flex
)
SELECT p.id, c.id, d.job_title,
       d.industry, d.role_type,
       d.salary_min, d.salary_max,
       d.urgency, d.arrangement, d.open_reason, d.career_growth,
       d.team_size, d.stages, d.panel,
       d.required_traits::text[],
       d.culture_offers::jsonb,
       d.must_haves::jsonb,
       d.ai_summary,
       d.gender,
       d.postcode, true,
       d.work_auth::text[],
       'yes', d.salary_flex::boolean
FROM (VALUES
  ('h02.andrew.finance@dnj-test.my',        'Hiring Director, Risk & Compliance', 'Risk Manager',             'Finance / Banking',          12000, 16000, 'normal',    'hybrid',  'replacement',  'structured_path', 8,  4, true,  '{analytical,reliable,detail_oriented}',   '{"learning_budget":true,"hybrid":true,"medical_insurance":true}', '{"min_years_exp":7,"certifications":["FRM","CFA"]}',           'Mid-cap investment firm hiring a senior risk manager.',                          'male',   '50450', '{"citizen","pr"}',                'no'),
  ('h03.anita.retail@dnj-test.my',          'Head of HR & Operations',            'Operations Lead',          'Retail / E-commerce',         7000, 10000, 'urgent',    'on_site', 'new_headcount','structured_path', 12, 3, true,  '{self_starter,customer_focused,adaptable}',        '{"learning_budget":false,"hybrid":false,"medical_insurance":true}', '{"min_years_exp":4,"languages":["english","bahasa"]}',         'Fast-growing omnichannel retailer needs an ops lead.',                            'female', '47800', '{"citizen","pr","ep"}',           'yes'),
  ('h04.khairul.fnb@dnj-test.my',           'Operations Manager',                 'Restaurant Manager',       'F&B / Restaurant',            5500,  7500, 'urgent',    'on_site', 'replacement',  'ad_hoc',          25, 2, false, '{growth_minded,accountable,reliable}',       '{"learning_budget":false,"hybrid":false,"medical_insurance":false}', '{"min_years_exp":3}',                                          'Heritage Penang restaurant group hiring after recent expansion.',                 'male',   '11900', '{"citizen","pr"}',                'yes'),
  ('h05.meiling.health@dnj-test.my',        'Group Director, Operations',         'Clinic Operations Lead',   'Healthcare / Medical',        7000,  9500, 'normal',    'on_site', 'new_headcount','structured_path', 18, 3, true,  '{collaborator,detail_oriented,analytical}',         '{"learning_budget":true,"hybrid":false,"medical_insurance":true}', '{"min_years_exp":5,"licenses":["MOH"]}',                       'Multi-clinic group expanding to 4 new locations.',                                'female', '50100', '{"citizen","pr"}',                'no'),
  ('h06.faridah.edtech@dnj-test.my',        'Head of Curriculum',                 'Curriculum Lead',          'EdTech / Education',          6500,  9000, 'normal',    'hybrid',  'replacement',  'structured_path', 6,  3, true,  '{growth_minded,clear_communicator,analytical}',         '{"learning_budget":true,"hybrid":true,"medical_insurance":true}', '{"min_years_exp":4,"languages":["english","bahasa"]}',          'Edtech for B40 students; curriculum lead role.',                                  'female', '63000', '{"citizen","pr","ep"}',           'yes'),
  ('h07.vijay.logistics@dnj-test.my',       'Director of Operations',             'Warehouse Ops Manager',    'Logistics / Supply Chain',    7500, 10500, 'urgent',    'on_site', 'replacement',  'ad_hoc',          40, 2, false, '{self_starter,reliable,accountable}',    '{"learning_budget":false,"hybrid":false,"medical_insurance":true}', '{"min_years_exp":5,"languages":["english","bahasa"]}',          '3PL serving e-commerce; high-volume warehouse needing a hands-on manager.',       'male',   '40000', '{"citizen","pr"}',                'yes'),
  ('h08.sofia.hospitality@dnj-test.my',     'GM, Talent Management',              'F&B Director',             'Hospitality / Hotel',         8500, 12000, 'normal',    'on_site', 'replacement',  'structured_path', 30, 4, true,  '{self_starter,customer_focused,detail_oriented}',        '{"learning_budget":true,"hybrid":false,"medical_insurance":true}', '{"min_years_exp":7}',                                          '5-star city hotel chain hiring a senior F&B leader.',                             'female', '50250', '{"citizen","pr","ep"}',           'no'),
  ('h09.kwanghoe.construction@dnj-test.my', 'Hiring Lead, Engineering',           'Project Manager (M&E)',    'Construction / Real Estate',  9000, 13000, 'normal',    'on_site', 'new_headcount','structured_path', 15, 3, true,  '{analytical,detail_oriented,adaptable}',        '{"learning_budget":true,"hybrid":false,"medical_insurance":true}', '{"min_years_exp":6,"certifications":["BEM"]}',                  'Civil & M&E contractor with active JB and KL projects.',                          'male',   '80300', '{"citizen","pr"}',                'no'),
  ('h10.chloe.design@dnj-test.my',          'Studio Director',                    'Senior UX Designer',       'Design / Creative',           7500, 10500, 'exploring', 'remote',  'new_headcount','ad_hoc',          5,  3, false, '{detail_oriented,collaborator,reliable}',                '{"learning_budget":true,"hybrid":true,"medical_insurance":true}', '{"min_years_exp":5,"portfolio_required":true}',                'Boutique product studio working with regional fintech and edtech.',               'female', '50450', '{"citizen","pr","ep"}',           'yes')
) AS d(hm_email, job_title, role_type, industry, salary_min, salary_max,
       urgency, arrangement, open_reason, career_growth, team_size, stages, panel,
       required_traits, culture_offers, must_haves, ai_summary, gender, postcode, work_auth, salary_flex)
JOIN public.profiles p ON p.email = d.hm_email
JOIN public.companies c ON c.primary_hr_email = d.hm_email;

-- ============================================================
-- 5b) Seed encrypted DOB + life_chart_character + DOB consent for HMs
-- Without DOB, the HM dashboard shows the "Add a little more about you"
-- banner and the matching engine refuses to pitch the HM to talents.
-- date_of_birth_encrypted is bytea — we go through the SECURITY DEFINER
-- encrypt_dob() helper. life_chart_character is the same nine-code value
-- the AddHmDobModal computes client-side (see lifeChartCharacter.ts).
-- ============================================================
UPDATE public.hiring_managers hm
SET date_of_birth_encrypted = public.encrypt_dob(d.dob),
    life_chart_character    = d.character
FROM (VALUES
  ('h02.andrew.finance@dnj-test.my',         '1985-03-12'::text, 'G+'),
  ('h03.anita.retail@dnj-test.my',           '1988-07-22',       'W+'),
  ('h04.khairul.fnb@dnj-test.my',            '1980-11-04',       'E-'),
  ('h05.meiling.health@dnj-test.my',         '1983-05-19',       'G-'),
  ('h06.faridah.edtech@dnj-test.my',         '1990-09-08',       'E'),
  ('h07.vijay.logistics@dnj-test.my',        '1979-01-25',       'W-'),
  ('h08.sofia.hospitality@dnj-test.my',      '1986-04-30',       'W'),
  ('h09.kwanghoe.construction@dnj-test.my',  '1981-12-14',       'W'),
  ('h10.chloe.design@dnj-test.my',           '1992-08-03',       'G-')
) AS d(hm_email, dob, character)
JOIN public.profiles p ON p.email = d.hm_email
WHERE hm.profile_id = p.id;

UPDATE public.profiles p
SET consents = COALESCE(consents, '{}'::jsonb)
            || jsonb_build_object('dob', true, 'dob_consented_at', now())
WHERE email LIKE 'h%@dnj-test.my';

-- ============================================================
-- 6) Insert talents
-- ============================================================
INSERT INTO public.talents (
  profile_id,
  expected_salary_min, expected_salary_max,
  current_salary, current_employment_status, notice_period_days,
  highest_qualification, education_level,
  work_authorization, work_arrangement_preference,
  job_intention, career_goal_horizon,
  salary_structure_preference, role_scope_preference,
  preferred_management_style,
  privacy_mode, is_open_to_offers,
  gender, race, religion,
  location_postcode, location_matters,
  has_driving_license,
  has_management_experience, management_team_size,
  reason_for_leaving_category, reason_for_leaving_summary,
  noncompete_industry_scope, has_noncompete,
  shortest_tenure_months, avg_tenure_months,
  languages, employment_type_preferences,
  derived_tags
)
SELECT p.id,
       d.salary_min, d.salary_max,
       d.cur_salary, d.emp_status, d.notice_days,
       d.qualification, d.edu_level,
       d.work_auth, d.arrangement,
       d.intention, d.horizon,
       d.salary_struct, d.scope,
       d.mgmt_style,
       'public', true,
       d.gender, d.race, d.religion,
       d.postcode, true,
       d.has_license,
       d.has_mgmt, d.team_size,
       d.leaving_cat, d.leaving_summary,
       d.nc_scope, d.has_nc,
       d.short_tenure, d.avg_tenure,
       d.languages::jsonb, d.emp_types::text[],
       d.tags::jsonb
FROM (VALUES
  ('t01.aiman.tech@dnj-test.my',           9000, 13000,  8500, 'employed', 30,    'degree', 'degree',  'citizen', 'hybrid',  'long_term_commitment', 'senior_specialist', 'fixed_plus_variable', 'specialist', 'autonomous',    'male',   'Malay',   'Muslim',    '50450', true,  true,  false, 0,  'growth',     'Hit a ceiling at current employer; want exposure to distributed systems.',  'none', false, 24, 36,  '["english","bahasa"]', '{"full_time"}',           '["backend","postgres","aws","node"]'),
  ('t02.weiming.finance@dnj-test.my',     12000, 16000, 11500, 'employed', 60,    'masters','masters', 'citizen', 'hybrid',  'long_term_commitment', 'people_manager',    'fixed_plus_variable', 'generalist', 'collaborative', 'male',   'Chinese', 'Buddhist',  '50480', true,  true,  true,  4,  'growth',     'Reached director ceiling; seeking risk-leadership role at a growth firm.',   'same_industry', true, 30, 48, '["english","mandarin","bahasa"]', '{"full_time"}', '["risk","compliance","frm","banking"]'),
  ('t03.priya.retail@dnj-test.my',         7000, 10000,  6500, 'employed', 30,    'degree', 'degree',  'citizen', 'on_site', 'long_term_commitment', 'people_manager',    'fixed_plus_variable', 'generalist', 'hands_on',      'female', 'Indian',  'Hindu',     '47800', true,  true,  true,  6,  'salary',     'Salary stagnated despite store expansion; ready for a step-up.',             'none', false, 18, 30,  '["english","bahasa","tamil"]', '{"full_time"}',  '["retail_ops","p_l","staff_management"]'),
  ('t04.hafiz.fnb@dnj-test.my',            5500,  7500,  5000, 'employed', 30,    'diploma','diploma', 'citizen', 'on_site', 'skill_building',       'people_manager',    'fixed_only',          'generalist', 'hands_on',      'male',   'Malay',   'Muslim',    '11900', true,  true,  true,  10, 'culture',    'Owner-operator culture became toxic after acquisition.',                     'none', false, 14, 24,  '["english","bahasa"]', '{"full_time"}',           '["fnb_ops","customer_service","staff_scheduling"]'),
  ('t05.sueann.health@dnj-test.my',        7000,  9500,  6800, 'employed', 60,    'degree', 'degree',  'citizen', 'on_site', 'long_term_commitment', 'people_manager',    'fixed_only',          'specialist', 'collaborative', 'female', 'Chinese', 'Christian', '50100', true,  false, true,  3,  'growth',     'Want larger network; current single-clinic role limits scope.',              'none', false, 24, 42,  '["english","mandarin"]', '{"full_time"}',         '["clinic_ops","patient_journey","compliance"]'),
  ('t06.aisyah.edtech@dnj-test.my',        6500,  9000,  6200, 'employed', 30,    'masters','masters', 'citizen', 'hybrid',  'long_term_commitment', 'senior_specialist', 'fixed_only',          'specialist', 'collaborative', 'female', 'Malay',   'Muslim',    '63000', true,  true,  false, 0,  'growth',     'Burnt out doing pure content; want product/curriculum hybrid role.',         'none', false, 30, 36,  '["english","bahasa"]', '{"full_time"}',           '["curriculum","instructional_design","b40"]'),
  ('t07.ravi.logistics@dnj-test.my',       7500, 10500,  7000, 'employed', 30,    'degree', 'degree',  'citizen', 'on_site', 'long_term_commitment', 'people_manager',    'fixed_plus_variable', 'generalist', 'hands_on',      'male',   'Indian',  'Hindu',     '40000', true,  true,  true,  20, 'redundancy', 'Warehouse closure due to client loss; seeking stable 3PL role.',             'none', false, 12, 28,  '["english","tamil","bahasa"]', '{"full_time"}',   '["warehouse","wms","sap","kpi"]'),
  ('t08.hidayah.hospitality@dnj-test.my',  8500, 12000,  8000, 'employed', 60,    'degree', 'degree',  'citizen', 'on_site', 'long_term_commitment', 'people_manager',    'fixed_plus_variable', 'generalist', 'collaborative', 'female', 'Malay',   'Muslim',    '50250', true,  true,  true,  15, 'growth',     'Capped at AGM level; seeking director track at heritage brand.',             'none', false, 24, 48,  '["english","bahasa","arabic"]', '{"full_time"}', '["fnb_director","banquet","luxury"]'),
  ('t09.kahleong.construction@dnj-test.my',9000, 13000,  8500, 'employed', 60,    'degree', 'degree',  'citizen', 'on_site', 'long_term_commitment', 'senior_specialist', 'fixed_only',          'specialist', 'autonomous',    'male',   'Chinese', 'Christian', '80300', true,  true,  true,  8,  'salary',     'Mid-tier consultancy; want to own end-to-end projects at a contractor.',     'none', false, 36, 48,  '["english","mandarin","bahasa"]', '{"full_time"}','["m_e","project_management","bem","aconex"]'),
  ('t10.sarah.design@dnj-test.my',         7500, 10500,  7000, 'employed', 30,    'degree', 'degree',  'citizen', 'remote',  'skill_building',       'senior_specialist', 'fixed_only',          'specialist', 'autonomous',    'female', 'Chinese', 'Buddhist',  '50450', false, true,  false, 0,  'culture',    'Agency-style burnout; want product-team craft work.',                        'none', false, 18, 26,  '["english","mandarin"]', '{"full_time","contract"}',     '["ux","figma","research","fintech"]'),
  ('t11.faisal.manufacturing@dnj-test.my', 6500,  9000,  6200, 'employed', 30,    'degree', 'degree',  'citizen', 'on_site', 'long_term_commitment', 'senior_specialist', 'fixed_only',          'specialist', 'hands_on',      'male',   'Malay',   'Muslim',    '11800', true,  true,  false, 0,  'growth',     'Want exposure to advanced semiconductor process.',                           'none', false, 24, 30,  '["english","bahasa"]', '{"full_time"}',           '["production","sixsigma","semiconductor"]'),
  ('t12.joanna.marketing@dnj-test.my',     8000, 11000,  7500, 'employed', 30,    'degree', 'degree',  'citizen', 'hybrid',  'long_term_commitment', 'people_manager',    'fixed_plus_variable', 'generalist', 'collaborative', 'female', 'Chinese', 'Christian', '50480', true,  true,  true,  4,  'growth',     'Hit a ceiling on B2C side; want regional brand role.',                       'none', false, 22, 34,  '["english","mandarin"]', '{"full_time"}',         '["brand","performance","content","tiktok"]'),
  ('t13.dharmendra.legal@dnj-test.my',    11000, 15000, 10500, 'employed', 90,    'masters','masters', 'citizen', 'hybrid',  'long_term_commitment', 'senior_specialist', 'fixed_only',          'specialist', 'autonomous',    'male',   'Indian',  'Sikh',      '50250', true,  true,  false, 0,  'salary',     'In-house counsel salary stagnated; weighing private practice vs. inhouse.',  'same_industry', true, 36, 48, '["english","tamil","bahasa"]', '{"full_time"}', '["compliance","contracts","data_privacy"]'),
  ('t14.suzanne.hr@dnj-test.my',           7500, 10500,  7000, 'employed', 30,    'degree', 'degree',  'citizen', 'hybrid',  'long_term_commitment', 'people_manager',    'fixed_plus_variable', 'generalist', 'collaborative', 'female', 'Chinese', 'Christian', '47810', true,  true,  true,  3,  'culture',    'Boss departed and replacement is misaligned; quietly looking.',              'none', false, 18, 30, '["english","mandarin"]', '{"full_time"}',         '["talent_acquisition","employer_brand","ats"]'),
  ('t15.rohan.consulting@dnj-test.my',    12000, 17000, 11500, 'employed', 90,    'masters','masters', 'citizen', 'hybrid',  'skill_building',       'senior_specialist', 'fixed_plus_variable', 'specialist', 'autonomous',    'male',   'Indian',  'Hindu',     '50100', true,  true,  true,  4,  'growth',     'Big-4 burnout; seeking corporate strategy role with shorter project cycles.','same_industry', false, 24, 30, '["english","tamil"]', '{"full_time"}',           '["strategy","ma","financial_modelling"]'),
  ('t16.adlina.telecom@dnj-test.my',       7000,  9500,  6800, 'employed', 30,    'degree', 'degree',  'citizen', 'on_site', 'long_term_commitment', 'senior_specialist', 'fixed_only',          'specialist', 'hands_on',      'female', 'Malay',   'Muslim',    '50300', true,  true,  false, 0,  'growth',     'Want to move from 4G/5G ops to architect role.',                             'none', false, 28, 36, '["english","bahasa"]', '{"full_time"}',           '["network","5g","cisco","sdn"]'),
  ('t17.razif.energy@dnj-test.my',         8500, 11500,  8000, 'employed', 60,    'degree', 'degree',  'citizen', 'on_site', 'long_term_commitment', 'senior_specialist', 'fixed_only',          'specialist', 'hands_on',      'male',   'Malay',   'Muslim',    '97000', true,  true,  true,  6,  'relocation', 'Family relocating to KL; want similar engineering role in Klang Valley.',    'none', false, 30, 42, '["english","bahasa"]', '{"full_time"}',           '["plant_ops","gas","hse","permit_to_work"]'),
  ('t18.vinothini.pharma@dnj-test.my',     9000, 12500,  8500, 'employed', 90,    'masters','masters', 'citizen', 'hybrid',  'long_term_commitment', 'senior_specialist', 'fixed_only',          'specialist', 'autonomous',    'female', 'Indian',  'Hindu',     '46100', true,  true,  false, 0,  'growth',     'Want regulatory role with broader ASEAN scope.',                             'same_industry', true, 36, 48, '["english","tamil"]', '{"full_time"}',           '["regulatory","npra","quality"]'),
  ('t19.kokwei.automotive@dnj-test.my',    7000,  9500,  6500, 'employed', 30,    'diploma','diploma', 'citizen', 'on_site', 'long_term_commitment', 'people_manager',    'fixed_plus_variable', 'generalist', 'hands_on',      'male',   'Chinese', 'Buddhist',  '47500', true,  true,  true,  12, 'growth',     'Want flagship workshop manager role.',                                       'none', false, 24, 36, '["english","mandarin","bahasa"]', '{"full_time"}','["workshop","ev","aftersales","kpi"]'),
  ('t20.nurin.sales@dnj-test.my',          6500,  9500,  6200, 'employed', 30,    'degree', 'degree',  'citizen', 'hybrid',  'skill_building',       'people_manager',    'fixed_plus_variable', 'generalist', 'collaborative', 'female', 'Malay',   'Muslim',    '50470', true,  true,  false, 0,  'salary',     'Quota cleared but commission cut; testing market.',                          'none', false, 14, 22, '["english","bahasa"]', '{"full_time"}',           '["b2b_sales","saas","crm","hubspot"]')
) AS d(t_email, salary_min, salary_max, cur_salary, emp_status, notice_days,
       qualification, edu_level, work_auth, arrangement,
       intention, horizon, salary_struct, scope, mgmt_style,
       gender, race, religion, postcode, location_matters,
       has_license, has_mgmt, team_size,
       leaving_cat, leaving_summary, nc_scope, has_nc,
       short_tenure, avg_tenure,
       languages, emp_types, tags)
JOIN public.profiles p ON p.email = d.t_email;

-- ============================================================
-- 6b) Phase B enrichment — parsed_resume + interview_answers + derived_tags
-- for the finance trio that should match H02 Andrew's Risk Manager role.
--
-- Why these specific talents:
--   T02 Wei Ming   — gold candidate (in-house bank risk, FRM+CFA, 12 yrs)
--   T13 Dharmendra — strong-on-paper but correctly filtered out by the
--                    same-industry non-compete in his base seed; demonstrates
--                    that the engine's deal-breakers fire as designed
--   T15 Rohan      — strong second (Big-4 strategy → corporate risk pivot)
--
-- Two structural fixes applied here:
--   1. derived_tags shape: match-core casts to Record<string, number>
--      (trait → 0..1 score per the LLM extraction schema). The base seed
--      writes string arrays like ["risk","compliance"] which yield
--      tag_compatibility=0 because every required-trait lookup misses.
--   2. T02 has_noncompete is set to false because her seeded interview
--      narrative is to step UP within finance — same-industry non-compete
--      contradicts that. T13 keeps his to demonstrate the filter.
-- ============================================================
UPDATE public.talents t SET
  extraction_status = 'complete',
  derived_tags = jsonb_build_object(
    'analytical', 0.92, 'integrity', 0.88, 'detail_oriented', 0.85,
    'accountable', 0.82, 'leadership', 0.75, 'problem_solving', 0.85,
    'results_orientation', 0.80, 'reliable', 0.85, 'professional_attitude', 0.85,
    'self_starter', 0.75, 'communication_clarity', 0.80, 'growth_minded', 0.85
  ),
  has_noncompete = false,
  noncompete_industry_scope = 'none',
  parsed_resume = jsonb_build_object(
    'job_areas',     to_jsonb(ARRAY['risk_management','finance','banking','compliance','regulatory','investment_management']),
    'key_skills',    to_jsonb(ARRAY['FRM','CFA','enterprise risk frameworks','Basel III','ICAAP','VaR','stress testing','regulatory reporting','audit liaison','Bloomberg','Power BI']),
    'years_experience', 12,
    'career_goals',  'Step into a head-of-risk role at a mid-cap firm where I can build the function end-to-end rather than maintain someone else''s framework.',
    'ai_summary',    'Senior finance professional, 12 years across Big-4 audit and in-house bank risk. FRM and CFA credentials. Strong on enterprise risk frameworks, regulatory reporting, and senior-stakeholder management. Looking to step up from director to head-of-risk at a growth firm.'
  ),
  interview_answers = jsonb_build_object('transcript', to_jsonb(ARRAY[
    jsonb_build_object('role','assistant','content','Tell me about your current role and what you''re hoping to find next.'),
    jsonb_build_object('role','user','content','I''m a Senior Director of Risk at a mid-cap bank. Twelve years in finance — Big-4 audit then in-house. FRM since 2017, CFA charter 2020. I own enterprise risk and regulatory reporting. Hit the ceiling here — want a head-of-risk seat where I build the function rather than maintain someone else''s.'),
    jsonb_build_object('role','assistant','content','What kind of company would suit you?'),
    jsonb_build_object('role','user','content','Mid-cap, growth-stage, ideally hybrid. Twelve to sixteen thousand salary. Hybrid work matters — wife also has demanding role.'),
    jsonb_build_object('role','assistant','content','Any deal-breakers?'),
    jsonb_build_object('role','user','content','Not interested in pure-process compliance shops. I want a seat at the table on strategic risk decisions, not just signing off on policies.')
  ])),
  updated_at = now()
FROM public.profiles p
WHERE t.profile_id = p.id AND p.email = 't02.weiming.finance@dnj-test.my';

UPDATE public.talents t SET
  extraction_status = 'complete',
  derived_tags = jsonb_build_object(
    'analytical', 0.85, 'integrity', 0.92, 'detail_oriented', 0.90,
    'accountable', 0.85, 'professional_attitude', 0.90, 'reliable', 0.88,
    'communication_clarity', 0.82, 'problem_solving', 0.78, 'self_starter', 0.70
  ),
  parsed_resume = jsonb_build_object(
    'job_areas',     to_jsonb(ARRAY['legal','compliance','regulatory','contracts','data_privacy','corporate_governance','risk']),
    'key_skills',    to_jsonb(ARRAY['compliance frameworks','contract negotiation','data privacy (PDPA)','regulatory liaison','M&A due diligence','policy drafting','audit support','board reporting']),
    'years_experience', 14,
    'career_goals',  'Broaden from pure in-house counsel into a hybrid risk-and-compliance leadership role at a regulated financial institution.',
    'ai_summary',    'Senior in-house counsel, 14 years. Masters-qualified. Strong on financial-services regulatory work, complex contracts, and data-privacy compliance. Wants to widen scope into risk leadership rather than stay pure legal.'
  ),
  interview_answers = jsonb_build_object('transcript', to_jsonb(ARRAY[
    jsonb_build_object('role','assistant','content','Tell me about your current role and what you''re hoping for next.'),
    jsonb_build_object('role','user','content','In-house counsel for fourteen years, last six in financial services. Masters in commercial law. Cover regulatory, contracts, data privacy, board reporting. Salary stagnated and I want to broaden into risk and compliance leadership rather than pure legal.'),
    jsonb_build_object('role','assistant','content','What attracts you about a risk role specifically?'),
    jsonb_build_object('role','user','content','I''ve been adjacent to risk for years — drafting policy, advising on regulatory exposure, sitting on the audit committee. The natural next step is to own the framework end-to-end, not just review it.'),
    jsonb_build_object('role','assistant','content','Compensation and arrangement?'),
    jsonb_build_object('role','user','content','Eleven to fifteen thousand, hybrid. I have a non-compete in same-industry financial services for twelve months — would need to discuss carefully.')
  ])),
  updated_at = now()
FROM public.profiles p
WHERE t.profile_id = p.id AND p.email = 't13.dharmendra.legal@dnj-test.my';

UPDATE public.talents t SET
  extraction_status = 'complete',
  derived_tags = jsonb_build_object(
    'analytical', 0.90, 'integrity', 0.78, 'detail_oriented', 0.75,
    'problem_solving', 0.88, 'results_orientation', 0.82, 'self_starter', 0.85,
    'leadership', 0.72, 'communication_clarity', 0.85, 'growth_minded', 0.82
  ),
  parsed_resume = jsonb_build_object(
    'job_areas',     to_jsonb(ARRAY['strategy','corporate_finance','M&A','financial_modelling','investment_analysis','risk']),
    'key_skills',    to_jsonb(ARRAY['financial modelling','valuation','DCF','scenario analysis','M&A diligence','strategic planning','Excel','PowerPoint','board-pack writing']),
    'years_experience', 9,
    'career_goals',  'Pivot from Big-4 strategy into a corporate role with shorter cycle times and direct ownership of outcomes.',
    'ai_summary',    'Big-4 strategy senior manager, 9 years. Masters in Finance. Strong analytical, financial modelling, and exec-stakeholder communication. Considering a pivot to in-house corporate finance or risk strategy where the cadence is faster than client-services.'
  ),
  interview_answers = jsonb_build_object('transcript', to_jsonb(ARRAY[
    jsonb_build_object('role','assistant','content','What''s your background and what are you looking for?'),
    jsonb_build_object('role','user','content','Senior manager at a Big-4 strategy practice, nine years. Masters in Finance. Run M&A diligence and strategic planning engagements for financial-services clients. Burnt out on the consulting cycle — want shorter cycle times and direct ownership.'),
    jsonb_build_object('role','assistant','content','Risk function or strategy function?'),
    jsonb_build_object('role','user','content','Either, honestly. The analytical and financial-modelling work transfers. I''d be a strong fit for an enterprise-risk or corporate-strategy seat at a regulated firm.'),
    jsonb_build_object('role','assistant','content','Salary expectations?'),
    jsonb_build_object('role','user','content','Twelve to seventeen thousand. Hybrid. Three months notice.')
  ])),
  updated_at = now()
FROM public.profiles p
WHERE t.profile_id = p.id AND p.email = 't15.rohan.consulting@dnj-test.my';

-- ============================================================
-- 6c) Phase B continuation — T03..T10 enrichment for H03..H10
-- One talent per HM, derived_tags aligned to each role's required_traits
-- (canonical names per the LLM extraction schema), parsed_resume.job_areas
-- written as plain words so backgroundOverlaps()'s substring fallback fires
-- even when industry_synonyms hasn't been seeded for the alias. T08's plain
-- job_areas were specifically necessary because H08's haystack
-- ("Hotel F&B Director / Hospitality / Hotel") doesn't substring-match any
-- underscore-style alias and the synonyms table didn't cover them.
-- All have_noncompete=false here — these are test talents demoing the
-- happy path; T13's intentional non-compete in 6b above is the
-- deal-breaker filter demo.
-- ============================================================

-- T03 Priya Devi — H03 Operations Lead, Omnichannel (retail)
UPDATE public.talents t SET
  extraction_status = 'complete', has_noncompete = false, noncompete_industry_scope = 'none',
  derived_tags = jsonb_build_object(
    'adaptable', 0.88, 'self_starter', 0.85, 'customer_focused', 0.90, 'customer_focus', 0.90,
    'execution', 0.85, 'results_orientation', 0.85, 'accountable', 0.85, 'leadership', 0.78,
    'reliable', 0.85, 'problem_solving', 0.80, 'professional_attitude', 0.85, 'ownership', 0.80,
    'resilience', 0.82
  ),
  parsed_resume = jsonb_build_object(
    'job_areas',     to_jsonb(ARRAY['retail','operations','omnichannel','store management','inventory','ecommerce','P&L','retail operations']),
    'key_skills',    to_jsonb(ARRAY['P&L management','inventory control','store team leadership','KPI tracking','omnichannel fulfilment','returns management','customer experience']),
    'years_experience', 11,
    'career_goals',  'Step up from area-manager to head-of-operations at a fast-growing omnichannel retailer.',
    'ai_summary',    'Senior retail ops manager, 11 years across modern trade and omnichannel. Strong P&L, store-team leadership, and inventory ops. Wants a step-up to head-of-operations after stagnating salary at current employer.'
  ),
  interview_answers = jsonb_build_object('transcript', '[]'::jsonb),
  updated_at = now()
FROM public.profiles p WHERE t.profile_id = p.id AND p.email = 't03.priya.retail@dnj-test.my';

-- T04 Hafiz Bin Yusof — H04 Restaurant Manager (F&B)
UPDATE public.talents t SET
  extraction_status = 'complete', has_noncompete = false, noncompete_industry_scope = 'none',
  derived_tags = jsonb_build_object(
    'growth_minded', 0.85, 'accountable', 0.88, 'reliable', 0.88,
    'energy', 0.88, 'ownership', 0.90, 'calm_under_pressure', 0.85,
    'resilience', 0.82, 'self_starter', 0.85, 'emotional_maturity', 0.80,
    'results_orientation', 0.80, 'problem_solving', 0.80, 'leadership', 0.75,
    'customer_focused', 0.82
  ),
  parsed_resume = jsonb_build_object(
    'job_areas',     to_jsonb(ARRAY['restaurant_operations','F&B_management','guest_experience','staff_scheduling','P&L']),
    'key_skills',    to_jsonb(ARRAY['restaurant P&L','shift scheduling','staff training','POS systems','food safety','inventory ordering','guest service recovery']),
    'years_experience', 12,
    'career_goals',  'Move from owner-operator chaos to a heritage F&B brand where I can professionalise the floor.',
    'ai_summary',    'Hands-on restaurant manager, 12 years across fast-casual and heritage outlets. Strong on shift control, P&L discipline, and team building. Recently exited a toxic post-acquisition culture; ready for a structured operator.'
  ),
  interview_answers = jsonb_build_object('transcript', '[]'::jsonb),
  updated_at = now()
FROM public.profiles p WHERE t.profile_id = p.id AND p.email = 't04.hafiz.fnb@dnj-test.my';

-- T05 Lim Sue Ann — H05 Clinic Operations Lead (healthcare)
UPDATE public.talents t SET
  extraction_status = 'complete', has_noncompete = false, noncompete_industry_scope = 'none',
  derived_tags = jsonb_build_object(
    'analytical', 0.86, 'collaborator', 0.88, 'detail_oriented', 0.90,
    'empathy', 0.90, 'precision', 0.88, 'systems_thinking', 0.85,
    'emotional_maturity', 0.88, 'problem_solving', 0.85, 'professional_attitude', 0.88,
    'reliable', 0.85, 'communication_clarity', 0.82, 'accountable', 0.85
  ),
  parsed_resume = jsonb_build_object(
    'job_areas',     to_jsonb(ARRAY['healthcare','clinic','operations','patient','compliance','medical','admin','clinic operations']),
    'key_skills',    to_jsonb(ARRAY['clinic SOP design','patient flow optimisation','MOH compliance','roster management','medical supplies procurement','EMR systems']),
    'years_experience', 13,
    'career_goals',  'Standardise multi-site clinic operations as the group expands to new locations.',
    'ai_summary',    'Senior clinic ops lead, 13 years in primary care and specialist clinics. Strong on patient-journey design, MOH compliance, and SOP rollout. Wants broader scope than single-clinic management.'
  ),
  interview_answers = jsonb_build_object('transcript', '[]'::jsonb),
  updated_at = now()
FROM public.profiles p WHERE t.profile_id = p.id AND p.email = 't05.sueann.health@dnj-test.my';

-- T06 Nurul Aisyah — H06 Curriculum Lead (edtech)
UPDATE public.talents t SET
  extraction_status = 'complete', has_noncompete = false, noncompete_industry_scope = 'none',
  derived_tags = jsonb_build_object(
    'growth_minded', 0.90, 'clear_communicator', 0.88, 'analytical', 0.80,
    'curiosity', 0.90, 'writing', 0.88, 'systems_thinking', 0.85,
    'communication_clarity', 0.88, 'problem_solving', 0.85,
    'self_starter', 0.82, 'coachability', 0.85, 'detail_oriented', 0.78
  ),
  parsed_resume = jsonb_build_object(
    'job_areas',     to_jsonb(ARRAY['curriculum_design','instructional_design','edtech','B40_education','STEM_content']),
    'key_skills',    to_jsonb(ARRAY['grade-aligned curriculum design','learning-outcome mapping','B40 access programmes','STEM module authoring','cross-functional content production','BM/EN bilingual content']),
    'years_experience', 8,
    'career_goals',  'Move from pure content authoring to a curriculum lead role with cross-functional ownership.',
    'ai_summary',    'Curriculum designer with 8 years in B40-focused edtech. Strong on grade-aligned STEM and bahasa modules. Wants a hybrid product/curriculum lead role rather than pure authoring.'
  ),
  interview_answers = jsonb_build_object('transcript', '[]'::jsonb),
  updated_at = now()
FROM public.profiles p WHERE t.profile_id = p.id AND p.email = 't06.aisyah.edtech@dnj-test.my';

-- T07 Ravi Krishnan — H07 Warehouse Operations Manager (logistics)
UPDATE public.talents t SET
  extraction_status = 'complete', has_noncompete = false, noncompete_industry_scope = 'none',
  derived_tags = jsonb_build_object(
    'self_starter', 0.85, 'reliable', 0.88, 'accountable', 0.85,
    'execution', 0.90, 'calm_under_pressure', 0.88, 'ownership', 0.88,
    'resilience', 0.85, 'results_orientation', 0.85,
    'problem_solving', 0.78, 'professional_attitude', 0.82, 'leadership', 0.75,
    'detail_oriented', 0.80
  ),
  parsed_resume = jsonb_build_object(
    'job_areas',     to_jsonb(ARRAY['warehouse_operations','logistics','WMS','SAP','3PL','peak_season_planning']),
    'key_skills',    to_jsonb(ARRAY['WMS rollout','SAP MM','peak-season ramp-up','KPI dashboards','forklift safety','cross-dock operations','subcontractor management']),
    'years_experience', 11,
    'career_goals',  'Lead a 40+ headcount warehouse with full P&L and SLA ownership at a stable 3PL.',
    'ai_summary',    'Hands-on warehouse manager, 11 years across 3PL and own-fleet ops. Recently displaced by client loss. Strong on WMS, SAP, and KPI rigour. Looking for a stable mid-sized operator.'
  ),
  interview_answers = jsonb_build_object('transcript', '[]'::jsonb),
  updated_at = now()
FROM public.profiles p WHERE t.profile_id = p.id AND p.email = 't07.ravi.logistics@dnj-test.my';

-- T08 Nurul Hidayah — H08 Hotel F&B Director (hospitality)
-- Note: job_areas use plain words because the haystack
-- "hotel f&b director / hospitality / hotel" only substring-matches plain
-- tokens and the synonyms table doesn't cover hospitality aliases.
UPDATE public.talents t SET
  extraction_status = 'complete', has_noncompete = false, noncompete_industry_scope = 'none',
  derived_tags = jsonb_build_object(
    'self_starter', 0.85, 'customer_focused', 0.90, 'detail_oriented', 0.85,
    'leadership', 0.92, 'customer_focus', 0.90, 'precision', 0.85,
    'accountable', 0.88, 'professional_attitude', 0.90, 'emotional_maturity', 0.85,
    'communication_clarity', 0.85, 'results_orientation', 0.85, 'reliable', 0.85
  ),
  parsed_resume = jsonb_build_object(
    'job_areas',     to_jsonb(ARRAY['hospitality','hotel','F&B','food and beverage','banquet','luxury','operations','P&L','director']),
    'key_skills',    to_jsonb(ARRAY['multi-outlet F&B P&L','banquet sales','luxury service standards','culinary direction','brand partnerships','hospitality compliance']),
    'years_experience', 14,
    'career_goals',  'Step from AGM track to F&B Director at a heritage hospitality brand with cross-property scope.',
    'ai_summary',    'Senior hospitality F&B leader, 14 years across luxury and heritage brands. Strong on banquet P&L, multi-outlet operations, and culinary direction. Capped at AGM in current group; ready for director track.'
  ),
  interview_answers = jsonb_build_object('transcript', '[]'::jsonb),
  updated_at = now()
FROM public.profiles p WHERE t.profile_id = p.id AND p.email = 't08.hidayah.hospitality@dnj-test.my';

-- T09 Choo Kah Leong — H09 Project Manager M&E (construction)
UPDATE public.talents t SET
  extraction_status = 'complete', has_noncompete = false, noncompete_industry_scope = 'none',
  derived_tags = jsonb_build_object(
    'analytical', 0.88, 'detail_oriented', 0.82, 'adaptable', 0.80,
    'technical_depth', 0.90, 'planning', 0.88, 'resilience', 0.85,
    'problem_solving', 0.88, 'accountable', 0.85,
    'results_orientation', 0.85, 'professional_attitude', 0.85, 'reliable', 0.85,
    'ownership', 0.85
  ),
  parsed_resume = jsonb_build_object(
    'job_areas',     to_jsonb(ARRAY['M&E_engineering','project_management','construction','BEM_compliance','Aconex','mixed_use_developments']),
    'key_skills',    to_jsonb(ARRAY['M&E delivery','BEM compliance','subcontractor management','Aconex','cost control','commissioning','JKR liaison']),
    'years_experience', 11,
    'career_goals',  'Own end-to-end M&E delivery as PM at a mid-tier contractor instead of consultancy advisory.',
    'ai_summary',    'M&E senior engineer, 11 years split between consultancy and contractor side. BEM-registered. Strong on cost control, commissioning, and JKR/local-authority liaison. Ready to own delivery instead of advise.'
  ),
  interview_answers = jsonb_build_object('transcript', '[]'::jsonb),
  updated_at = now()
FROM public.profiles p WHERE t.profile_id = p.id AND p.email = 't09.kahleong.construction@dnj-test.my';

-- T10 Sarah Chong — H10 Senior UX Designer (design/creative)
UPDATE public.talents t SET
  extraction_status = 'complete', has_noncompete = false, noncompete_industry_scope = 'none',
  derived_tags = jsonb_build_object(
    'detail_oriented', 0.90, 'collaborator', 0.92, 'reliable', 0.85,
    'craft', 0.92, 'empathy', 0.88, 'collaboration', 0.90,
    'emotional_maturity', 0.85, 'professional_attitude', 0.85,
    'growth_minded', 0.82, 'communication_clarity', 0.82,
    'problem_solving', 0.80, 'adaptable', 0.85
  ),
  parsed_resume = jsonb_build_object(
    'job_areas',     to_jsonb(ARRAY['design','UX','user research','product','creative','fintech','edtech','designer','UX designer']),
    'key_skills',    to_jsonb(ARRAY['user research','IA','prototyping (Figma)','design system maintenance','usability testing','cross-functional collaboration','mobile-first design']),
    'years_experience', 8,
    'career_goals',  'Move from agency burnout to product-team craft work where I can mentor and shape design culture.',
    'ai_summary',    'Senior UX designer, 8 years split between agency and in-house. Strong on research, IA, and design systems for fintech and edtech. Wants product-team work after agency burnout.'
  ),
  interview_answers = jsonb_build_object('transcript', '[]'::jsonb),
  updated_at = now()
FROM public.profiles p WHERE t.profile_id = p.id AND p.email = 't10.sarah.design@dnj-test.my';

-- ============================================================
-- 6d) DOB + life_chart_character + wants_* enrichment
--
-- Without DOB, talents can't participate in BaZi-influenced scoring
-- (life_chart_score stays null). Without wants_* keys merged into
-- derived_tags, careerGoalFit and the pAccept estimate fall back to
-- safe defaults. culture_fit_score itself has weight=0 in match-core
-- ("qualitative only") so wants_* don't move the headline number, but
-- they DO move the secondary signals the engine uses for ranking.
--
-- Characters computed per apps/web/src/lib/lifeChartCharacter.ts:
--   slot = (chineseYear - 1950) % 9, then CYCLE[slot] = [male, female]
-- Years and genders are taken from each talent's seeded narrative.
-- ============================================================
WITH dob_data(email, dob, character) AS (VALUES
  ('t01.aiman.tech@dnj-test.my',           '1996-04-15'::text, 'W-'),
  ('t02.weiming.finance@dnj-test.my',      '1988-04-20', 'W+'),
  ('t03.priya.retail@dnj-test.my',         '1989-06-25', 'W-'),
  ('t04.hafiz.fnb@dnj-test.my',            '1987-02-15', 'W-'),
  ('t05.sueann.health@dnj-test.my',        '1986-09-08', 'W'),
  ('t06.aisyah.edtech@dnj-test.my',        '1991-12-03', 'G+'),
  ('t07.ravi.logistics@dnj-test.my',       '1988-03-18', 'W+'),
  ('t08.hidayah.hospitality@dnj-test.my',  '1985-05-12', 'F'),
  ('t09.kahleong.construction@dnj-test.my','1988-10-05', 'W+'),
  ('t10.sarah.design@dnj-test.my',         '1991-07-22', 'G+'),
  ('t11.faisal.manufacturing@dnj-test.my', '1990-08-10', 'W'),
  ('t12.joanna.marketing@dnj-test.my',     '1990-03-25', 'E'),
  ('t13.dharmendra.legal@dnj-test.my',     '1986-11-15', 'E'),
  ('t14.suzanne.hr@dnj-test.my',           '1989-11-08', 'W-'),
  ('t15.rohan.consulting@dnj-test.my',     '1991-08-10', 'F'),
  ('t16.adlina.telecom@dnj-test.my',       '1992-05-30', 'G-'),
  ('t17.razif.energy@dnj-test.my',         '1987-09-14', 'W-'),
  ('t18.vinothini.pharma@dnj-test.my',     '1988-12-22', 'W+'),
  ('t19.kokwei.automotive@dnj-test.my',    '1990-06-04', 'W'),
  ('t20.nurin.sales@dnj-test.my',          '1992-10-19', 'G-')
)
UPDATE public.talents t
SET date_of_birth_encrypted = public.encrypt_dob(d.dob),
    life_chart_character    = d.character,
    updated_at              = now()
FROM dob_data d
JOIN public.profiles p ON p.email = d.email
WHERE t.profile_id = p.id;

-- consents.dob = true on all 20 talent profiles (matches the AddHmDobModal flow)
UPDATE public.profiles
SET consents = COALESCE(consents,'{}'::jsonb)
            || jsonb_build_object('dob', true, 'dob_consented_at', now())
WHERE email LIKE 't%@dnj-test.my';

-- wants_* keys merged INTO derived_tags for the 11 enriched talents.
-- match-core's CULTURE_KEYS lookup reads tags['wants_growth'] etc., so the
-- values must live alongside the personality traits, not in a separate column.
WITH wants(email, w_wlb, w_fair, w_growth, w_stab, w_flex, w_recog, w_mission, w_team) AS (VALUES
  ('t02.weiming.finance@dnj-test.my',      0.50,0.70,0.92,0.70,0.85,0.50,0.40,0.60),
  ('t03.priya.retail@dnj-test.my',         0.60,0.85,0.90,0.70,0.50,0.60,0.50,0.70),
  ('t04.hafiz.fnb@dnj-test.my',            0.70,0.60,0.70,0.85,0.50,0.50,0.50,0.92),
  ('t05.sueann.health@dnj-test.my',        0.60,0.70,0.85,0.75,0.60,0.55,0.70,0.70),
  ('t06.aisyah.edtech@dnj-test.my',        0.70,0.60,0.90,0.65,0.75,0.50,0.85,0.70),
  ('t07.ravi.logistics@dnj-test.my',       0.65,0.75,0.65,0.92,0.50,0.55,0.50,0.70),
  ('t08.hidayah.hospitality@dnj-test.my',  0.55,0.75,0.92,0.65,0.55,0.70,0.55,0.70),
  ('t09.kahleong.construction@dnj-test.my',0.60,0.75,0.85,0.70,0.60,0.65,0.55,0.65),
  ('t10.sarah.design@dnj-test.my',         0.85,0.65,0.80,0.75,0.85,0.55,0.70,0.85),
  ('t13.dharmendra.legal@dnj-test.my',     0.60,0.85,0.85,0.65,0.70,0.60,0.50,0.70),
  ('t15.rohan.consulting@dnj-test.my',     0.85,0.70,0.85,0.70,0.80,0.55,0.60,0.70)
)
UPDATE public.talents t
SET derived_tags = COALESCE(t.derived_tags,'{}'::jsonb) || jsonb_build_object(
      'wants_wlb',          w.w_wlb,
      'wants_fair_pay',     w.w_fair,
      'wants_growth',       w.w_growth,
      'wants_stability',    w.w_stab,
      'wants_flexibility',  w.w_flex,
      'wants_recognition',  w.w_recog,
      'wants_mission',      w.w_mission,
      'wants_team_culture', w.w_team
    ),
    updated_at = now()
FROM wants w
JOIN public.profiles p ON p.email = w.email
WHERE t.profile_id = p.id;

-- ============================================================
-- 7) Open job role per HM (H02..H10), pre-approved for matching
-- ============================================================
INSERT INTO public.roles (
  hiring_manager_id, title, description,
  industry, location, location_postcode,
  work_arrangement, employment_type, experience_level,
  salary_min, salary_max, required_traits,
  status, moderation_status, moderation_score, moderation_category,
  moderation_provider, moderation_checked_at,
  accept_no_experience
)
SELECT hm.id, d.title, d.description,
       d.industry, d.location, d.postcode,
       d.arrangement, 'full_time', d.exp_level,
       d.sal_min, d.sal_max, d.traits::text[],
       'active', 'approved', 95, 'safe',
       'seed', now(),
       false
FROM (VALUES
  ('h02.andrew.finance@dnj-test.my',        'Risk Manager',                   'Lead the risk & compliance function for a mid-cap investment firm. Build and govern enterprise risk models, partner with audit and legal, and own regulatory reporting.', 'Finance / Banking',          'Kuala Lumpur',  '50450', 'hybrid',  'senior',     12000, 16000, '{analytical,reliable,detail_oriented}'),
  ('h03.anita.retail@dnj-test.my',          'Operations Lead, Omnichannel',   'Run day-to-day store and warehouse operations across 22 outlets and our online fulfilment hub. Own SKU velocity, returns, and CX. Hands-on, KPI-driven.',                'Retail / E-commerce',         'Petaling Jaya', '47800', 'onsite',  'senior',      7000, 10000, '{self_starter,customer_focused,adaptable}'),
  ('h04.khairul.fnb@dnj-test.my',           'Restaurant Manager',             'Own end-to-end operations of our flagship Penang outlet. Lead 25 staff, manage P&L, deliver guest experience, and grow weekday lunch programme.',                       'F&B / Restaurant',            'Penang',        '11900', 'onsite',  'mid',   5500,  7500, '{growth_minded,accountable,reliable}'),
  ('h05.meiling.health@dnj-test.my',        'Clinic Operations Lead',         'Standardise SOPs, staffing, and patient journey across 4 new clinics opening in 2026. Partner with medical directors and finance.',                                  'Healthcare / Medical',        'Kuala Lumpur',  '50100', 'onsite',  'senior',      7000,  9500, '{collaborator,detail_oriented,analytical}'),
  ('h06.faridah.edtech@dnj-test.my',        'Curriculum Lead',                'Design grade-aligned learning pathways for B40 students across STEM and bahasa modules. Work cross-functionally with product and content.',                          'EdTech / Education',          'Cyberjaya',     '63000', 'hybrid',  'senior',      6500,  9000, '{growth_minded,clear_communicator,analytical}'),
  ('h07.vijay.logistics@dnj-test.my',       'Warehouse Operations Manager',   'Own a 40-headcount warehouse serving 3 marketplace clients. Drive WMS rollout, peak-season planning, and SLA performance.',                                       'Logistics / Supply Chain',    'Shah Alam',     '40000', 'onsite',  'senior',      7500, 10500, '{self_starter,reliable,accountable}'),
  ('h08.sofia.hospitality@dnj-test.my',     'Hotel F&B Director',             'Lead the F&B function across 3 city hotels (banquet + 7 outlets). Set culinary direction, manage P&L, partner with brand and operations.',                       'Hospitality / Hotel',         'Kuala Lumpur',  '50250', 'onsite',  'lead',    8500, 12000, '{self_starter,customer_focused,detail_oriented}'),
  ('h09.kwanghoe.construction@dnj-test.my', 'Project Manager (M&E)',          'Run end-to-end M&E delivery for a mixed-use development in JB. Manage subcontractors, BEM compliance, and client interface.',                                    'Construction / Real Estate',  'Johor Bahru',   '80300', 'onsite',  'senior',      9000, 13000, '{analytical,detail_oriented,adaptable}'),
  ('h10.chloe.design@dnj-test.my',          'Senior UX Designer',             'Lead UX on regional fintech and edtech accounts. Own discovery, IA, prototypes, and design system. Mentor 2 mid-level designers.',                              'Design / Creative',           'Kuala Lumpur',  '50450', 'remote',  'senior',      7500, 10500, '{detail_oriented,collaborator,reliable}')
) AS d(hm_email, title, description, industry, location, postcode,
       arrangement, exp_level, sal_min, sal_max, traits)
JOIN public.profiles p ON p.email = d.hm_email
JOIN public.hiring_managers hm ON hm.profile_id = p.id;

-- ============================================================
-- 7b) Re-approve seeded roles
-- The tg_roles_moderation_on_insert trigger (migration 0090) overrides any
-- non-service-role insert: it forces moderation_status='pending' and
-- demotes status='active' to 'paused' so the role sits out of matching
-- until the moderate-role Edge Function runs. Test seeds bypass that
-- worker, so we drive moderation_status to 'approved' here — which fires
-- tg_roles_moderation_on_update and auto-restores status='active'.
-- ============================================================
UPDATE public.roles r
SET moderation_status   = 'approved',
    moderation_score    = 95,
    moderation_category = 'safe',
    moderation_provider = 'seed',
    moderation_reason   = 'pre-approved test role',
    moderation_checked_at = now()
FROM public.hiring_managers hm
JOIN public.profiles p ON p.id = hm.profile_id
WHERE r.hiring_manager_id = hm.id
  AND p.email LIKE '%@dnj-test.my'
  AND r.moderation_status = 'pending';

-- ============================================================
-- Final verification: counts
-- ============================================================
SELECT 'auth.users'      AS table_name, COUNT(*) AS rows FROM auth.users      WHERE email LIKE '%@dnj-test.my'
UNION ALL
SELECT 'profiles'        , COUNT(*)                  FROM public.profiles      WHERE email LIKE '%@dnj-test.my'
UNION ALL
SELECT 'talents'         , COUNT(*)                  FROM public.talents       WHERE profile_id IN (SELECT id FROM public.profiles WHERE email LIKE '%@dnj-test.my')
UNION ALL
SELECT 'hiring_managers' , COUNT(*)                  FROM public.hiring_managers WHERE profile_id IN (SELECT id FROM public.profiles WHERE email LIKE '%@dnj-test.my')
UNION ALL
SELECT 'companies'       , COUNT(*)                  FROM public.companies     WHERE primary_hr_email LIKE '%@dnj-test.my'
UNION ALL
SELECT 'roles'           , COUNT(*)                  FROM public.roles         WHERE hiring_manager_id IN (SELECT hm.id FROM public.hiring_managers hm JOIN public.profiles p ON p.id=hm.profile_id WHERE p.email LIKE '%@dnj-test.my');
