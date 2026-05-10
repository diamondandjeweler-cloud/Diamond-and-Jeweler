-- One-shot seed for parsed_resume + interview_answers on T02, T13, T15.
-- Unblocks S08–S12 (matching/interview/contact-share scenarios) without
-- requiring a fresh chat-onboard run for these test accounts.
-- Idempotent: re-running overwrites the same JSON.

update public.talents set
  parsed_resume = jsonb_build_object(
    'summary', 'Senior finance professional, 9 yrs in commercial banking risk and compliance. Led credit-risk model validation for SME loan book at Maybank. CFA Level 3.',
    'skills', jsonb_build_array('credit risk', 'compliance', 'BNM regulations', 'SAS', 'Python', 'SQL', 'risk modelling', 'AML/CFT', 'Basel III'),
    'experience', jsonb_build_array(
      jsonb_build_object('company','Maybank','title','Senior Risk Analyst','years','2020-2026','summary','Validated PD/LGD models, led Basel III implementation for SME segment'),
      jsonb_build_object('company','CIMB','title','Credit Risk Analyst','years','2017-2020','summary','Built early-warning indicators for corporate loan book')
    ),
    'education', jsonb_build_array(jsonb_build_object('school','Universiti Malaya','degree','BSc Actuarial Science','year','2017')),
    'languages', jsonb_build_array('English','Bahasa Malaysia','Mandarin')
  ),
  interview_answers = jsonb_build_object(
    'why_change', 'Looking for a senior risk leadership role with exposure to retail credit, ideally moving into a Head of Risk track within 3-5 yrs.',
    'strengths', 'Quantitative rigour, regulatory fluency, ability to translate model outputs for non-technical stakeholders.',
    'work_style', 'Independent on analysis, collaborative on cross-functional projects. Prefer structured, deadline-driven environments.',
    'deal_breakers', 'Pure tech roles with no business context; firms without clear risk governance.',
    'compensation', 'RM 14,000 - RM 18,000 monthly, open to performance bonus.'
  )
where id = 'f6798bcd-6b74-4505-a572-d203579b48f7';

update public.talents set
  parsed_resume = jsonb_build_object(
    'summary', '7-yr corporate lawyer turned data-protection specialist. Led PDPA compliance overhaul at AirAsia Digital. Active member of Malaysian Bar.',
    'skills', jsonb_build_array('PDPA 2010','GDPR','contract negotiation','data protection','privacy impact assessment','compliance audit','litigation','M&A'),
    'experience', jsonb_build_array(
      jsonb_build_object('company','AirAsia Digital','title','Senior Legal Counsel','years','2022-2026','summary','Built privacy programme, ran PIAs for 12 product launches'),
      jsonb_build_object('company','Skrine','title','Associate, Corporate','years','2019-2022','summary','M&A and commercial contracts')
    ),
    'education', jsonb_build_array(
      jsonb_build_object('school','Universiti Malaya','degree','LLB Hons','year','2018'),
      jsonb_build_object('school','CIPP/E','degree','IAPP Certified','year','2023')
    ),
    'languages', jsonb_build_array('English','Bahasa Malaysia','Tamil')
  ),
  interview_answers = jsonb_build_object(
    'why_change', 'Want to move in-house at a firm where privacy is a board-level priority, not an afterthought.',
    'strengths', 'Clear writing, calm under pressure, can translate legal risk into business decisions.',
    'work_style', 'Detail-obsessed on review, decisive on advice. Prefer firms that ship.',
    'deal_breakers', 'Roles where privacy is a checkbox; companies pre-IPO with no compliance maturity.',
    'compensation', 'RM 16,000 - RM 22,000 monthly.'
  )
where id = 'aae6ead4-4898-4aef-abc7-df6368706c0e';

update public.talents set
  parsed_resume = jsonb_build_object(
    'summary', 'Ex-McKinsey associate, 5 yrs total. Strategy + ops engagements across Malaysian banks, telcos, and SE Asian e-commerce. INSEAD MBA.',
    'skills', jsonb_build_array('strategy','operations','financial modelling','market entry','PMO','transformation','stakeholder management','SQL','Tableau'),
    'experience', jsonb_build_array(
      jsonb_build_object('company','McKinsey & Company','title','Associate','years','2023-2026','summary','Led 6 engagements across SEA banking + e-commerce; specialised in cost transformation'),
      jsonb_build_object('company','Boston Consulting Group','title','Senior Consultant','years','2021-2023','summary','Strategy work for Malaysian telco; drove KL office DEI workstream')
    ),
    'education', jsonb_build_array(
      jsonb_build_object('school','INSEAD','degree','MBA','year','2021'),
      jsonb_build_object('school','Imperial College London','degree','BEng Mechanical','year','2019')
    ),
    'languages', jsonb_build_array('English','Bahasa Malaysia','Hindi')
  ),
  interview_answers = jsonb_build_object(
    'why_change', 'Done with the consulting model; want to own a P&L or build a function from scratch in a high-growth firm.',
    'strengths', 'Speed, structure, comfort with ambiguity. Strong client communication.',
    'work_style', 'Hypothesis-driven; iterate fast. Equally comfortable in slides or SQL.',
    'deal_breakers', 'Pure-play strategy roles with no operating accountability.',
    'compensation', 'RM 20,000 - RM 28,000 monthly + equity if early-stage.'
  )
where id = '59b190c3-f3e7-458b-afe6-f2a94299906c';
