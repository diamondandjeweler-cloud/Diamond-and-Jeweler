/**
 * Silo data — drives the keyword-rich SEO pages without bloating route files.
 * Each entry is a self-contained config rendered by RoleSilo / LocationSilo / HireSilo.
 *
 * Only roles + locations DNJ actually recruits for. No fake industries.
 */

export type RoleSlug =
  | 'pilot'
  | 'cadet-pilot'
  | 'jeweler'
  | 'diamond-grader'
  | 'gemologist'
  | 'jewelry-designer'
  | 'luxury-retail'
  | 'sales-executive'
  | 'admin-executive'
  | 'account-assistant'
  | 'software-developer'
  | 'graphic-designer'
  | 'marketing-executive'
  | 'customer-service'
  | 'hr-assistant'
  | 'finance'

export type LocationSlug =
  | 'kuala-lumpur'
  | 'petaling-jaya'
  | 'penang'
  | 'johor-bahru'
  | 'cyberjaya'
  | 'shah-alam'
  | 'subang-jaya'

export type HireSlug =
  | 'pilot'
  | 'jeweler'
  | 'diamond-grader'
  | 'gemologist'
  | 'sales-team'
  | 'luxury-retail-staff'

export interface RoleConfig {
  slug: RoleSlug
  name: string                  // human-readable role
  title: string                 // <title> tag
  description: string           // meta description
  keywords: string              // meta keywords
  industry: string              // schema industry
  occupationalCategory: string  // O*NET-SOC code + name
  jobTypes: string[]            // FULL_TIME / PART_TIME / etc
  locations: LocationSlug[]     // where DNJ hires for this
  qualifications: string
  bullets: string[]             // talking points
  hookCopy: string              // opener paragraph
  baseSalaryMin?: number
  baseSalaryMax?: number
  hasJobPosting: boolean        // only true for real recruiting tracks
  relatedRoles: RoleSlug[]
  relatedLocations: LocationSlug[]
}

export interface LocationConfig {
  slug: LocationSlug
  name: string                  // "Kuala Lumpur"
  shortName: string             // "KL"
  state: string                 // "Federal Territory of Kuala Lumpur"
  title: string
  description: string
  keywords: string
  intro: string                 // opener paragraph
  highlights: string[]          // talking points
  topRoles: RoleSlug[]
  geo: { lat: number; lng: number }
}

export interface HireConfig {
  slug: HireSlug
  role: string                  // "pilot" / "jeweler" etc.
  title: string
  description: string
  keywords: string
  intro: string
  bullets: string[]
  relatedRoles: RoleSlug[]
}

// ---------- ROLES ----------

export const ROLES: Record<RoleSlug, RoleConfig> = {
  pilot: {
    slug: 'pilot',
    name: 'Pilot',
    title: 'Pilot Job Vacancy Malaysia — Cadet & Airline Pilot Hiring | DNJ',
    description:
      'Pilot job vacancy in Malaysia. Cadet pilot program for fresh graduates with no experience, plus experienced first officer and captain roles. AI-curated matching, walk-in interview, immediate hiring — apply online via DNJ.',
    keywords:
      'pilot job vacancy, pilot job Malaysia, cadet pilot program, cadet pilot Malaysia, airline pilot hiring, aviation job vacancy, pilot fresh graduate, first officer job, captain pilot job, airline job Malaysia, pilot job Kuala Lumpur, no experience pilot job, pilot trainee program',
    industry: 'Aviation',
    occupationalCategory: '53-2011 Airline Pilots, Copilots, and Flight Engineers',
    jobTypes: ['FULL_TIME', 'CONTRACTOR'],
    locations: ['kuala-lumpur', 'penang', 'johor-bahru'],
    qualifications:
      'Cadet pilot program: open to fresh graduate, SPM leaver, diploma holder, degree holder. Experienced track: CPL/ATPL with current type rating preferred.',
    bullets: [
      'Cadet pilot program — fresh graduate friendly, no experience needed',
      'Direct entry first officer for CPL/ATPL holders',
      'Captain upgrade path with airline partners across Malaysia',
      'Same day interview for shortlisted candidates',
      'Stable career, good salary, structured progression',
      'AI-curated matching with airline hiring partners',
    ],
    hookCopy:
      'Aviation hiring in Malaysia is booming. The cadet pilot program is one of the top entry points for fresh graduates with zero experience — a structured graduate trainee program from classroom to airline first officer. Experienced first officers and captains find direct-entry placements through DNJ\'s curated matching.',
    baseSalaryMin: 4500,
    baseSalaryMax: 25000,
    hasJobPosting: true,
    relatedRoles: ['cadet-pilot', 'sales-executive', 'customer-service'],
    relatedLocations: ['kuala-lumpur', 'penang', 'johor-bahru'],
  },

  'cadet-pilot': {
    slug: 'cadet-pilot',
    name: 'Cadet Pilot',
    title: 'Cadet Pilot Program Malaysia — Fresh Graduate, No Experience | DNJ',
    description:
      'Cadet pilot program in Malaysia for fresh graduate, SPM leaver, diploma and degree holder. No experience needed. Structured trainee programme from classroom to airline first officer. Apply online today.',
    keywords:
      'cadet pilot program, cadet pilot Malaysia, cadet pilot 2026, pilot trainee program, no experience pilot, fresh graduate pilot, pilot fresh graduate, SPM cadet pilot, diploma cadet pilot, graduate trainee aviation',
    industry: 'Aviation',
    occupationalCategory: '53-2011 Airline Pilots, Copilots, and Flight Engineers',
    jobTypes: ['FULL_TIME'],
    locations: ['kuala-lumpur', 'penang'],
    qualifications:
      'Open to fresh graduates, SPM leavers, diploma and degree holders. No flight experience required. Strong English and STEM aptitude preferred. Class 1 medical fitness needed.',
    bullets: [
      'No experience needed — full training provided',
      'SPM, diploma and degree holders welcome',
      'Class 1 medical assessment guidance',
      'Theory + simulator + line training',
      'Bond/scholarship options with select airline partners',
      'Career path to first officer and captain',
    ],
    hookCopy:
      'Wanted to be a pilot but didn\'t know where to start? The cadet pilot program is a structured, employer-sponsored route from classroom to commercial airline cockpit. DNJ matches eligible candidates with airline cadet schemes hiring in Malaysia in 2026.',
    hasJobPosting: true,
    relatedRoles: ['pilot', 'customer-service', 'admin-executive'],
    relatedLocations: ['kuala-lumpur', 'penang'],
  },

  jeweler: {
    slug: 'jeweler',
    name: 'Jeweler',
    title: 'Jeweler Job Vacancy Malaysia — Bench Jeweler & Setter Hiring | DNJ',
    description:
      'Jeweler job vacancy in Kuala Lumpur, PJ and Penang. Bench jeweler, setter, polisher and apprentice roles. With or without experience considered. Apply online — walk-in interview, stable career.',
    keywords:
      'jeweler job vacancy, jeweler career Malaysia, bench jeweler job, jewelry maker job, jewellery shop hiring, diamond jeweler hiring, jeweler Kuala Lumpur, jeweler PJ, jeweler Penang, jewelry apprentice job',
    industry: 'Luxury Retail / Jewelry',
    occupationalCategory: '51-9071 Jewelers and Precious Stone and Metal Workers',
    jobTypes: ['FULL_TIME', 'PART_TIME'],
    locations: ['kuala-lumpur', 'petaling-jaya', 'penang'],
    qualifications:
      'Diploma or trade certificate preferred. SPM leavers welcome for apprentice path. With or without experience considered. Manual dexterity and attention to detail required.',
    bullets: [
      'Bench jeweler, setter, polisher and apprentice tracks',
      'Career path to senior bench jeweler or atelier lead',
      'Stable job, good salary, retirement-friendly career',
      'Walk-in interview for select boutiques',
      'Apprenticeship route for SPM leavers and diploma holders',
      'Family-business and luxury-house openings',
    ],
    hookCopy:
      'Jeweler jobs in Malaysia are quietly some of the most career-stable roles in luxury retail. Whether you\'re an experienced bench jeweler, setter, polisher, or an apprentice looking to learn the trade, DNJ matches you with jewellery shops, ateliers and luxury brands hiring across Kuala Lumpur, PJ and Penang.',
    baseSalaryMin: 2800,
    baseSalaryMax: 9000,
    hasJobPosting: true,
    relatedRoles: ['diamond-grader', 'gemologist', 'jewelry-designer', 'luxury-retail'],
    relatedLocations: ['kuala-lumpur', 'petaling-jaya', 'penang'],
  },

  'diamond-grader': {
    slug: 'diamond-grader',
    name: 'Diamond Grader',
    title: 'Diamond Grader Job Vacancy Malaysia — Hiring Now | DNJ',
    description:
      'Diamond grader job vacancy in Kuala Lumpur and PJ. Grade the 4Cs (cut, color, clarity, carat), build appraisal expertise, work with luxury brands. Diploma + degree holders welcome.',
    keywords:
      'diamond grader job, diamond grader Malaysia, diamond expert job vacancy, 4Cs grader hiring, diamond appraiser job, diamond company hiring, diamond grader Kuala Lumpur, gem grader job',
    industry: 'Luxury Retail / Jewelry',
    occupationalCategory: '51-9071 Jewelers and Precious Stone and Metal Workers',
    jobTypes: ['FULL_TIME'],
    locations: ['kuala-lumpur', 'petaling-jaya'],
    qualifications:
      'Diploma/degree holder preferred. GIA/HRD/IGI certification a plus but not required for entry. Trainee program available. Strong attention to detail and color discrimination needed.',
    bullets: [
      'Grade the 4Cs: cut, color, clarity, carat',
      'Build path to senior grader and appraiser',
      'Trainee program with on-the-job certification support',
      'Career growth into gemology and lab work',
      'Stable industry, good salary, low turnover',
      'AI-curated matching with diamond houses in KL',
    ],
    hookCopy:
      'Diamond grader is one of Malaysia\'s most respected — and underrated — career-growth roles in luxury retail. You\'ll learn the 4Cs of diamond evaluation under senior graders, build appraisal expertise, and progress into gemology or lab certification work. DNJ matches eligible talent with diamond houses hiring in Kuala Lumpur and PJ.',
    baseSalaryMin: 3500,
    baseSalaryMax: 12000,
    hasJobPosting: true,
    relatedRoles: ['gemologist', 'jeweler', 'jewelry-designer', 'luxury-retail'],
    relatedLocations: ['kuala-lumpur', 'petaling-jaya'],
  },

  gemologist: {
    slug: 'gemologist',
    name: 'Gemologist',
    title: 'Gemologist Job Malaysia — GIA Path, Lab & Appraisal | DNJ',
    description:
      'Gemologist job in Malaysia. Lab work, appraisal, certification support. GIA path, structured career growth. Walk-in interview and graduate trainee options. Apply online via DNJ.',
    keywords:
      'gemologist job, gemologist Malaysia, GIA gemologist, gem appraiser job, gemology career Malaysia, gemological lab job, gemologist Kuala Lumpur, certified gemologist hiring',
    industry: 'Luxury Retail / Jewelry',
    occupationalCategory: '51-9071 Jewelers and Precious Stone and Metal Workers',
    jobTypes: ['FULL_TIME'],
    locations: ['kuala-lumpur', 'petaling-jaya'],
    qualifications:
      'Diploma/degree preferred. GIA/AIGS/HRD certification valuable but trainee program available. Microscopy, refractometry and crystallography aptitude.',
    bullets: [
      'Lab work — refractometer, polariscope, microscope',
      'Appraisal and certification support',
      'GIA / AIGS / HRD certification mentorship',
      'Career path to senior gemologist and lab director',
      'Stable career with good salary',
      'Quiet, focused, high-skill work environment',
    ],
    hookCopy:
      'Gemology is the science behind every luxury jewel. As a gemologist, you\'ll work in labs and appraisal rooms identifying gemstones, certifying authenticity and grading quality. DNJ matches certified gemologists and graduate trainees with hiring labs and luxury houses in Malaysia.',
    baseSalaryMin: 4000,
    baseSalaryMax: 14000,
    hasJobPosting: true,
    relatedRoles: ['diamond-grader', 'jeweler', 'jewelry-designer'],
    relatedLocations: ['kuala-lumpur', 'petaling-jaya'],
  },

  'jewelry-designer': {
    slug: 'jewelry-designer',
    name: 'Jewelry Designer',
    title: 'Jewelry Designer Job Malaysia — CAD & Bespoke Hiring | DNJ',
    description:
      'Jewelry designer job vacancy in Kuala Lumpur. CAD design (Rhino/Matrix), bespoke commissions, luxury collections. Diploma/degree + portfolio. Hybrid options available.',
    keywords:
      'jewelry designer job, jewelry designer Malaysia, jewellery designer hiring, CAD jewelry designer, Rhino jewelry, Matrix jewelry, bespoke jewelry designer, jewelry design Kuala Lumpur',
    industry: 'Luxury Retail / Jewelry',
    occupationalCategory: '27-1024 Graphic Designers',
    jobTypes: ['FULL_TIME', 'CONTRACTOR'],
    locations: ['kuala-lumpur', 'petaling-jaya'],
    qualifications:
      'Diploma/degree in jewelry design, fine arts or product design. CAD (Rhino, Matrix, JewelCAD) experience preferred. Strong portfolio required.',
    bullets: [
      'CAD design with Rhino, Matrix or JewelCAD',
      'Bespoke commissions and collection design',
      'Hybrid work options for senior designers',
      'Career path to creative director',
      'Portfolio-first hiring — show your work',
      'Match with luxury houses, ateliers and bridal brands',
    ],
    hookCopy:
      'Jewelry designers in Malaysia are in growing demand as luxury houses expand bespoke services. From CAD modeling in Rhino and Matrix to hand-rendered bridal collections, DNJ connects designers with the right ateliers and brands.',
    hasJobPosting: true,
    relatedRoles: ['jeweler', 'diamond-grader', 'gemologist', 'graphic-designer'],
    relatedLocations: ['kuala-lumpur', 'petaling-jaya'],
  },

  'luxury-retail': {
    slug: 'luxury-retail',
    name: 'Luxury Retail Sales Associate',
    title: 'Luxury Retail Job Vacancy Malaysia — Sales Associate Hiring | DNJ',
    description:
      'Luxury retail job vacancy in Kuala Lumpur, PJ and Penang. Sales associate, clienteling, boutique manager roles in jewelry, watches and luxury goods. Walk-in interview, immediate hiring.',
    keywords:
      'luxury retail job vacancy, luxury retail Malaysia, luxury sales associate, jewelry sales associate, watch sales associate, boutique manager hiring, luxury brand job, retail job diamond, luxury retail Kuala Lumpur',
    industry: 'Luxury Retail',
    occupationalCategory: '41-2031 Retail Salespersons',
    jobTypes: ['FULL_TIME', 'PART_TIME'],
    locations: ['kuala-lumpur', 'petaling-jaya', 'penang'],
    qualifications:
      'SPM and above. Strong English/Bahasa/Mandarin. Customer-first attitude. With or without experience considered.',
    bullets: [
      'Sales associate, clienteling, boutique manager tracks',
      'Same day interview, immediate hiring for shortlisted',
      'Career path to boutique lead and area manager',
      'Commission and luxury staff perks',
      'Cross-train in jewelry, watches, leather goods',
      'AI-curated matching with luxury houses across Malaysia',
    ],
    hookCopy:
      'Luxury retail is Malaysia\'s quiet career growth engine — stable hours, strong commission, structured training and a clear promotion path from sales associate to boutique manager. DNJ matches you with the right luxury brand based on your strengths.',
    baseSalaryMin: 2800,
    baseSalaryMax: 8500,
    hasJobPosting: true,
    relatedRoles: ['jeweler', 'diamond-grader', 'sales-executive', 'customer-service'],
    relatedLocations: ['kuala-lumpur', 'petaling-jaya', 'penang'],
  },

  'sales-executive': {
    slug: 'sales-executive',
    name: 'Sales Executive',
    title: 'Sales Executive Job Vacancy Malaysia — Hiring Now | DNJ',
    description:
      'Sales executive job vacancy in Kuala Lumpur, PJ, Penang and Malaysia. Strong commission, career growth, walk-in interview. Fresh graduate, junior and mid-level openings.',
    keywords:
      'sales executive job vacancy, sales executive Malaysia, sales job Kuala Lumpur, sales job PJ, sales job Penang, B2B sales hiring, retail sales executive, junior sales executive',
    industry: 'Sales',
    occupationalCategory: '41-3099 Sales Representatives, Services',
    jobTypes: ['FULL_TIME'],
    locations: ['kuala-lumpur', 'petaling-jaya', 'penang', 'johor-bahru'],
    qualifications: 'SPM and above. Strong communication. Fresh graduate friendly. Junior to mid-level.',
    bullets: [
      'Attractive commission and incentive structure',
      'Career path to senior sales and team lead',
      'Walk-in interview options',
      'B2B and retail tracks available',
      'Fresh graduate trainee programme',
    ],
    hookCopy:
      'Sales executive is Malaysia\'s most-hired role — and one of the fastest paths to a high-income career for fresh graduates and career changers. DNJ matches you with companies hiring across KL, PJ, Penang and beyond.',
    hasJobPosting: false,
    relatedRoles: ['luxury-retail', 'customer-service', 'marketing-executive', 'admin-executive'],
    relatedLocations: ['kuala-lumpur', 'petaling-jaya', 'penang'],
  },

  'admin-executive': {
    slug: 'admin-executive',
    name: 'Admin Executive',
    title: 'Admin Executive Job Vacancy Malaysia — Hiring Now | DNJ',
    description:
      'Admin executive job vacancy in Kuala Lumpur, PJ and Penang. Hybrid options, full time, stable career. Fresh graduate, diploma and degree holders welcome.',
    keywords:
      'admin executive job vacancy, admin job Malaysia, admin job Kuala Lumpur, office admin job, administrative assistant job, fresh graduate admin job',
    industry: 'Administration',
    occupationalCategory: '43-6011 Executive Secretaries and Executive Administrative Assistants',
    jobTypes: ['FULL_TIME'],
    locations: ['kuala-lumpur', 'petaling-jaya', 'penang'],
    qualifications: 'SPM, diploma or degree. Strong organisation. Fresh graduate friendly.',
    bullets: [
      'Hybrid work options',
      'Stable, predictable hours',
      'Career path to office manager',
      'Walk-in interview at select employers',
      'Fresh graduate friendly',
    ],
    hookCopy:
      'Admin executive roles are the backbone of every well-run company — and one of Malaysia\'s most consistent hiring categories. DNJ matches admin talent with hiring companies across KL, PJ and Penang.',
    hasJobPosting: false,
    relatedRoles: ['account-assistant', 'hr-assistant', 'customer-service', 'finance'],
    relatedLocations: ['kuala-lumpur', 'petaling-jaya', 'penang'],
  },

  'account-assistant': {
    slug: 'account-assistant',
    name: 'Account Assistant',
    title: 'Account Assistant Job Vacancy Malaysia — Fresh Graduate | DNJ',
    description:
      'Account assistant job vacancy in Kuala Lumpur and PJ. Fresh graduate, SPM and diploma holder friendly. Stable career, finance progression path, immediate hiring.',
    keywords:
      'account assistant job vacancy, account assistant Malaysia, junior account assistant, accounting clerk job, finance assistant job, account assistant Kuala Lumpur, fresh graduate accounting',
    industry: 'Accounting',
    occupationalCategory: '43-3031 Bookkeeping, Accounting, and Auditing Clerks',
    jobTypes: ['FULL_TIME'],
    locations: ['kuala-lumpur', 'petaling-jaya'],
    qualifications: 'SPM, diploma or degree in accounting/finance. Fresh graduate welcome.',
    bullets: [
      'Stable career path into senior accountant',
      'Audit, AP/AR, payroll exposure',
      'Fresh graduate trainee programme',
      'Career growth toward CPA/ACCA',
      'Good salary progression',
    ],
    hookCopy:
      'Account assistant is one of the safest career-growth paths in Malaysia — stable salary, clear promotion ladder and exposure to every part of a business. DNJ matches you with finance teams hiring in KL and PJ.',
    hasJobPosting: false,
    relatedRoles: ['finance', 'admin-executive', 'hr-assistant'],
    relatedLocations: ['kuala-lumpur', 'petaling-jaya'],
  },

  'software-developer': {
    slug: 'software-developer',
    name: 'Software Developer',
    title: 'Software Developer Job Vacancy Malaysia — Remote & Hybrid | DNJ',
    description:
      'Software developer job vacancy in Malaysia with remote and hybrid options. Junior, mid and senior roles. Fresh graduate to senior. Apply online and send portfolio.',
    keywords:
      'software developer job vacancy, software engineer Malaysia, remote job Malaysia, work from home Kuala Lumpur, frontend developer job, backend developer job, full stack developer job',
    industry: 'Software / Technology',
    occupationalCategory: '15-1252 Software Developers',
    jobTypes: ['FULL_TIME', 'CONTRACTOR'],
    locations: ['kuala-lumpur', 'petaling-jaya', 'cyberjaya'],
    qualifications: 'Diploma/degree or strong portfolio. Junior to senior welcome.',
    bullets: [
      'Remote and hybrid options',
      'Frontend, backend, full stack tracks',
      'Career path to tech lead and architect',
      'Strong commission/equity at startups',
      'Portfolio-first hiring',
    ],
    hookCopy:
      'Software developer roles continue to lead remote and hybrid work in Malaysia. DNJ matches you with the right team based on stack, culture, and career goals — three matches at a time, zero noise.',
    hasJobPosting: false,
    relatedRoles: ['graphic-designer', 'marketing-executive'],
    relatedLocations: ['kuala-lumpur', 'petaling-jaya', 'cyberjaya'],
  },

  'graphic-designer': {
    slug: 'graphic-designer',
    name: 'Graphic Designer',
    title: 'Graphic Designer Job Vacancy Malaysia — Full Time & Freelance | DNJ',
    description:
      'Graphic designer job vacancy in Kuala Lumpur and Petaling Jaya. Full time, freelance and contract options. Portfolio-first hiring. Fresh graduate friendly.',
    keywords:
      'graphic designer job vacancy, graphic designer Malaysia, junior graphic designer, freelance graphic designer, graphic designer Kuala Lumpur, brand designer job',
    industry: 'Design / Creative',
    occupationalCategory: '27-1024 Graphic Designers',
    jobTypes: ['FULL_TIME', 'CONTRACTOR', 'PART_TIME'],
    locations: ['kuala-lumpur', 'petaling-jaya'],
    qualifications: 'Diploma/degree in design or strong portfolio. Junior to mid-level.',
    bullets: [
      'Portfolio-first hiring',
      'Full time, freelance and contract options',
      'Career path to senior and creative director',
      'Brand, packaging, digital and print tracks',
    ],
    hookCopy:
      'Graphic designers are in steady demand across Malaysia\'s luxury, F&B and tech sectors. DNJ matches your portfolio with the right brand culture and creative direction.',
    hasJobPosting: false,
    relatedRoles: ['jewelry-designer', 'marketing-executive', 'software-developer'],
    relatedLocations: ['kuala-lumpur', 'petaling-jaya'],
  },

  'marketing-executive': {
    slug: 'marketing-executive',
    name: 'Marketing Executive',
    title: 'Marketing Executive Job Vacancy Malaysia — Hiring Now | DNJ',
    description:
      'Marketing executive job vacancy in Kuala Lumpur and Petaling Jaya. Digital marketing, brand, content and social media tracks. Fresh graduate to senior.',
    keywords:
      'marketing executive job vacancy, digital marketing job Malaysia, brand executive job, content marketing job, social media executive, marketing job Kuala Lumpur',
    industry: 'Marketing',
    occupationalCategory: '13-1161 Market Research Analysts and Marketing Specialists',
    jobTypes: ['FULL_TIME'],
    locations: ['kuala-lumpur', 'petaling-jaya'],
    qualifications: 'Diploma/degree. Fresh graduate welcome.',
    bullets: [
      'Digital, brand, content and social tracks',
      'Career path to marketing manager',
      'Cross-functional with sales and product',
      'Portfolio of campaigns helps',
    ],
    hookCopy:
      'Marketing executive is one of Malaysia\'s most expansive career growth paths — touching strategy, creative, analytics and commerce. DNJ matches your strengths with the right team.',
    hasJobPosting: false,
    relatedRoles: ['graphic-designer', 'sales-executive', 'software-developer'],
    relatedLocations: ['kuala-lumpur', 'petaling-jaya'],
  },

  'customer-service': {
    slug: 'customer-service',
    name: 'Customer Service',
    title: 'Customer Service Job Vacancy Malaysia — Walk-in Interview | DNJ',
    description:
      'Customer service job vacancy in Kuala Lumpur, PJ, Penang. Walk-in interview, immediate hiring, fresh graduate friendly. Shift and full time options.',
    keywords:
      'customer service job vacancy, customer service Malaysia, customer service Kuala Lumpur, call center job, customer support job, fresh graduate customer service',
    industry: 'Customer Service',
    occupationalCategory: '43-4051 Customer Service Representatives',
    jobTypes: ['FULL_TIME', 'PART_TIME'],
    locations: ['kuala-lumpur', 'petaling-jaya', 'penang'],
    qualifications: 'SPM and above. Multilingual a plus. Fresh graduate welcome.',
    bullets: [
      'Walk-in interview, same day decisions',
      'Shift and full time options',
      'Career path to team lead and operations',
      'Multilingual roles in luxury retail',
    ],
    hookCopy:
      'Customer service roles dominate Malaysia\'s urgent-hiring listings — and they\'re one of the fastest paths into a stable career. DNJ matches you with employers hiring immediately.',
    hasJobPosting: false,
    relatedRoles: ['sales-executive', 'admin-executive', 'luxury-retail'],
    relatedLocations: ['kuala-lumpur', 'petaling-jaya', 'penang'],
  },

  'hr-assistant': {
    slug: 'hr-assistant',
    name: 'HR Assistant',
    title: 'HR Assistant Job Vacancy Malaysia — Junior to Mid-Level | DNJ',
    description:
      'HR assistant job vacancy in Kuala Lumpur and Petaling Jaya. Recruitment, payroll and HR ops exposure. Career growth to HR executive and manager.',
    keywords:
      'hr assistant job vacancy, hr job Malaysia, junior HR job, HR executive Kuala Lumpur, recruitment assistant job',
    industry: 'Human Resources',
    occupationalCategory: '13-1071 Human Resources Specialists',
    jobTypes: ['FULL_TIME'],
    locations: ['kuala-lumpur', 'petaling-jaya'],
    qualifications: 'Diploma/degree. Fresh graduate welcome.',
    bullets: [
      'Recruitment, payroll, HR ops exposure',
      'Career path to HR executive and manager',
      'Hybrid options at mature companies',
    ],
    hookCopy:
      'HR is the engine room of every growing company. DNJ matches HR assistants and executives with employers hiring across KL and PJ.',
    hasJobPosting: false,
    relatedRoles: ['admin-executive', 'account-assistant', 'finance'],
    relatedLocations: ['kuala-lumpur', 'petaling-jaya'],
  },

  finance: {
    slug: 'finance',
    name: 'Finance',
    title: 'Finance Job Vacancy Malaysia — Stable Career Growth | DNJ',
    description:
      'Finance job vacancy in Kuala Lumpur and Petaling Jaya. Junior to senior accountant, financial analyst and finance manager roles. Stable career, good salary, ACCA-friendly.',
    keywords:
      'finance job vacancy, accountant job Malaysia, financial analyst job, finance manager job, finance Kuala Lumpur, ACCA job, audit job',
    industry: 'Finance',
    occupationalCategory: '13-2011 Accountants and Auditors',
    jobTypes: ['FULL_TIME'],
    locations: ['kuala-lumpur', 'petaling-jaya'],
    qualifications: 'Degree in accounting/finance or part-qualified ACCA/CIMA.',
    bullets: [
      'Stable career, good salary',
      'ACCA / CIMA / CPA mentorship',
      'Career path to finance manager and CFO',
      'Hybrid options',
    ],
    hookCopy:
      'Finance careers in Malaysia offer some of the most predictable salary progressions — accountant, senior, manager, controller, CFO. DNJ matches you with finance teams that match your trajectory.',
    hasJobPosting: false,
    relatedRoles: ['account-assistant', 'admin-executive', 'hr-assistant'],
    relatedLocations: ['kuala-lumpur', 'petaling-jaya'],
  },
}

// ---------- LOCATIONS ----------

export const LOCATIONS: Record<LocationSlug, LocationConfig> = {
  'kuala-lumpur': {
    slug: 'kuala-lumpur',
    name: 'Kuala Lumpur',
    shortName: 'KL',
    state: 'Federal Territory of Kuala Lumpur',
    title: 'Jobs in Kuala Lumpur — Latest Hiring | DNJ Careers',
    description:
      'Latest job vacancy in Kuala Lumpur. AI-curated matches for pilot, jeweler, diamond grader, gemologist, sales, admin, finance, software developer roles. Walk-in interview, immediate hiring.',
    keywords:
      'jobs in Kuala Lumpur, job vacancy Kuala Lumpur, hiring in Kuala Lumpur, Kuala Lumpur jobs, jobs near KL, jobs near me KL, KL job vacancy, KLCC jobs, Bukit Bintang jobs, Mont Kiara jobs, fresh graduate Kuala Lumpur',
    intro:
      'Kuala Lumpur is Malaysia\'s biggest hiring market — and the easiest place to land a job near you. From luxury retail in Bukit Bintang and KLCC to corporate finance in KL Sentral and tech in Bangsar South, hiring across DNJ\'s vertical spans every level — fresh graduate, junior, mid-level and senior.',
    highlights: [
      'Largest job market in Malaysia',
      'Strongest concentration of luxury retail and aviation',
      'Walk-in interview at select boutiques and offices',
      'Hybrid and remote roles available',
      'Fresh graduate friendly across most categories',
      'Public transport (LRT/MRT/Monorail) coverage',
    ],
    topRoles: ['pilot', 'jeweler', 'diamond-grader', 'gemologist', 'luxury-retail', 'sales-executive', 'software-developer', 'finance'],
    geo: { lat: 3.139003, lng: 101.686855 },
  },

  'petaling-jaya': {
    slug: 'petaling-jaya',
    name: 'Petaling Jaya',
    shortName: 'PJ',
    state: 'Selangor',
    title: 'Jobs in Petaling Jaya (PJ) — Latest Hiring | DNJ Careers',
    description:
      'Job vacancy in Petaling Jaya (PJ) and Selangor. AI-curated matches for jeweler, sales, admin, finance, marketing, software developer roles. Walk-in interview, immediate hiring.',
    keywords:
      'jobs in PJ, job vacancy in PJ, hiring in Petaling Jaya, PJ jobs, jobs in Petaling Jaya, jobs in Selangor, fresh graduate PJ, PJ job vacancy',
    intro:
      'Petaling Jaya is the operational and tech heart of Selangor — and one of the most balanced hiring markets in Malaysia. Strong on jeweler, finance, software, marketing and admin roles with reasonable rents and great LRT access.',
    highlights: [
      'Strong tech and finance hiring',
      'Hybrid-friendly companies',
      'LRT (Kelana Jaya line) coverage',
      'Cheaper cost of living than KL',
      'Active luxury retail in 1 Utama and Sunway',
      'Walk-in interview options',
    ],
    topRoles: ['jeweler', 'diamond-grader', 'sales-executive', 'admin-executive', 'account-assistant', 'software-developer', 'marketing-executive', 'finance'],
    geo: { lat: 3.10726, lng: 101.60671 },
  },

  penang: {
    slug: 'penang',
    name: 'Penang',
    shortName: 'Penang',
    state: 'Penang',
    title: 'Jobs in Penang — Latest Hiring | DNJ Careers',
    description:
      'Job vacancy in Penang (George Town and Bayan Lepas). AI-curated matches for jeweler, luxury retail, sales, customer service, admin roles. Walk-in interview, immediate hiring.',
    keywords:
      'jobs in Penang, job vacancy in Penang, hiring in Penang, Penang jobs, fresh graduate Penang, George Town jobs, Bayan Lepas jobs, Penang job vacancy',
    intro:
      'Penang is a hidden hiring gem — strong tech and manufacturing in Bayan Lepas, growing luxury retail in George Town, and a high quality of life. DNJ surfaces curated matches across pilot, jeweler, luxury retail, sales and customer service tracks.',
    highlights: [
      'Tech hub in Bayan Lepas',
      'Luxury retail growing in Gurney and George Town',
      'Lower cost of living than KL',
      'Walk-in interview at select luxury boutiques',
      'Fresh graduate friendly',
    ],
    topRoles: ['pilot', 'jeweler', 'luxury-retail', 'sales-executive', 'customer-service', 'admin-executive'],
    geo: { lat: 5.41123, lng: 100.33543 },
  },

  'johor-bahru': {
    slug: 'johor-bahru',
    name: 'Johor Bahru',
    shortName: 'JB',
    state: 'Johor',
    title: 'Jobs in Johor Bahru (JB) — Latest Hiring | DNJ Careers',
    description:
      'Job vacancy in Johor Bahru. Aviation, luxury retail and sales hiring. Walk-in interview options, immediate hiring, fresh graduate friendly.',
    keywords:
      'jobs in Johor, jobs in Johor Bahru, JB jobs, job vacancy Johor, hiring in Johor, fresh graduate Johor Bahru',
    intro:
      'Johor Bahru\'s job market is growing fast on the back of Iskandar development. Strong aviation, manufacturing and cross-border luxury retail hiring.',
    highlights: [
      'Growing aviation hub at Senai',
      'Cross-border (Singapore commute) opportunities',
      'Luxury retail at Mid Valley Southkey and KSL',
      'Walk-in interview options',
    ],
    topRoles: ['pilot', 'sales-executive', 'luxury-retail', 'customer-service'],
    geo: { lat: 1.49273, lng: 103.74142 },
  },

  cyberjaya: {
    slug: 'cyberjaya',
    name: 'Cyberjaya',
    shortName: 'Cyberjaya',
    state: 'Selangor',
    title: 'Jobs in Cyberjaya — Tech & BPO Hiring | DNJ Careers',
    description:
      'Job vacancy in Cyberjaya. Software developer, customer service, admin and BPO roles. Hybrid and remote options. Fresh graduate friendly.',
    keywords:
      'jobs in Cyberjaya, job vacancy Cyberjaya, Cyberjaya jobs, MSC Cyberjaya hiring, tech job Cyberjaya, BPO job Cyberjaya',
    intro:
      'Cyberjaya is Malaysia\'s purpose-built tech and BPO city. Strong on software developer, customer service and admin hiring. Many hybrid and remote-flex roles.',
    highlights: [
      'Tech and MSC-status companies',
      'Hybrid + remote-flex roles',
      'Major BPO hiring',
      'Lower commute load than KL',
    ],
    topRoles: ['software-developer', 'customer-service', 'admin-executive', 'hr-assistant'],
    geo: { lat: 2.92238, lng: 101.65066 },
  },

  'shah-alam': {
    slug: 'shah-alam',
    name: 'Shah Alam',
    shortName: 'Shah Alam',
    state: 'Selangor',
    title: 'Jobs in Shah Alam — Latest Hiring | DNJ Careers',
    description:
      'Job vacancy in Shah Alam, Selangor. Admin, sales, finance and customer service hiring. Fresh graduate friendly. Walk-in interview options.',
    keywords:
      'jobs in Shah Alam, job vacancy Shah Alam, hiring in Shah Alam, Shah Alam jobs, fresh graduate Shah Alam',
    intro:
      'Shah Alam is the administrative capital of Selangor and a major manufacturing and logistics hub. Steady hiring in admin, finance, customer service and sales.',
    highlights: [
      'Manufacturing and logistics hub',
      'Stable admin and finance hiring',
      'Hybrid-friendly employers',
      'Walk-in interview options',
    ],
    topRoles: ['admin-executive', 'sales-executive', 'customer-service', 'account-assistant', 'finance'],
    geo: { lat: 3.0738, lng: 101.5183 },
  },

  'subang-jaya': {
    slug: 'subang-jaya',
    name: 'Subang Jaya',
    shortName: 'Subang',
    state: 'Selangor',
    title: 'Jobs in Subang Jaya — Latest Hiring | DNJ Careers',
    description:
      'Job vacancy in Subang Jaya and USJ. Sales, admin, finance, customer service hiring. Walk-in interview, fresh graduate friendly.',
    keywords:
      'jobs in Subang Jaya, jobs USJ, job vacancy Subang Jaya, hiring Subang Jaya, fresh graduate Subang',
    intro:
      'Subang Jaya is a key Klang Valley hiring market — strong on sales, customer service, admin and finance, with active luxury retail at Sunway Pyramid.',
    highlights: [
      'Sunway Pyramid luxury retail',
      'Strong sales and customer service hiring',
      'LRT (Kelana Jaya line) coverage',
      'Hybrid-friendly employers',
    ],
    topRoles: ['sales-executive', 'admin-executive', 'customer-service', 'luxury-retail'],
    geo: { lat: 3.0567, lng: 101.5851 },
  },
}

// ---------- HIRE PAGES (HM-side) ----------

export const HIRES: Record<HireSlug, HireConfig> = {
  pilot: {
    slug: 'pilot',
    role: 'pilot',
    title: 'Hire Pilots in Malaysia — AI-Curated Aviation Talent | DNJ',
    description:
      'Hire pilots in Malaysia through AI-curated matching. Three vetted profiles per role, no CV pile. Cadet program graduates, first officers and captains. PDPA-compliant.',
    keywords:
      'hire pilot Malaysia, hire pilots, recruit pilot, aviation recruitment, pilot recruitment agency Malaysia, hire cadet pilot, hire first officer, hire captain pilot',
    intro:
      'Hiring a pilot in Malaysia is hard. The pool is small, the qualifications are specific and the timing matters. DNJ delivers up to three AI-matched pilot profiles per role — vetted for licensing, type rating, English proficiency and cultural fit. No CV pile, no noise.',
    bullets: [
      'AI-matched candidates aligned to your fleet and route',
      'Three curated profiles per role — no CV pile, no noise',
      'Compatibility scored on licensing, type rating, hours, culture',
      'Access passive talent — pilots not actively job-hunting',
      'Full candidate confidentiality until mutual interest',
      'PDPA-compliant data handling, end-to-end encrypted',
      'Hiring intelligence reports with every match',
    ],
    relatedRoles: ['pilot', 'cadet-pilot'],
  },

  jeweler: {
    slug: 'jeweler',
    role: 'jeweler',
    title: 'Hire Jewelers in Malaysia — Bench, Setter, Designer | DNJ',
    description:
      'Hire bench jewelers, setters, polishers and designers in Malaysia. AI-curated matching delivers three vetted profiles per role. PDPA-compliant, end-to-end encrypted.',
    keywords:
      'hire jeweler Malaysia, hire bench jeweler, jewelry recruitment, hire setter, hire polisher, jewellery hiring agency Malaysia',
    intro:
      'Bench jewelers, setters and polishers are some of the hardest roles to fill — long apprenticeships, fragmented training pipelines, and a closed industry. DNJ matches your atelier with three carefully-vetted profiles per role — by skill, dexterity, materials and culture fit.',
    bullets: [
      'Three vetted profiles per role — no CV pile',
      'Skill-tested matching: bench, setting, polishing, CAD',
      'Apprentice + mid-career + senior bench tracks',
      'Access passive talent — quiet artisans not on job boards',
      'Full candidate confidentiality',
      'PDPA-compliant data handling',
    ],
    relatedRoles: ['jeweler', 'diamond-grader', 'gemologist', 'jewelry-designer'],
  },

  'diamond-grader': {
    slug: 'diamond-grader',
    role: 'diamond grader',
    title: 'Hire Diamond Graders in Malaysia | DNJ',
    description:
      'Hire diamond graders in Kuala Lumpur and PJ. AI-matched candidates with 4Cs expertise — cut, color, clarity, carat. Three curated profiles per role.',
    keywords:
      'hire diamond grader Malaysia, hire 4Cs grader, recruit diamond appraiser, diamond grader recruitment, hire diamond expert',
    intro:
      'Diamond grading talent is rare. DNJ matches you with diamond graders — trained on the 4Cs, with appraisal and lab experience — three curated profiles per role.',
    bullets: [
      'Three vetted profiles per role',
      'Skill-matched on 4Cs grading and appraisal',
      'Trainee + experienced grader pipeline',
      'PDPA-compliant data handling',
    ],
    relatedRoles: ['diamond-grader', 'gemologist', 'jeweler'],
  },

  gemologist: {
    slug: 'gemologist',
    role: 'gemologist',
    title: 'Hire Gemologists in Malaysia — GIA & Lab Talent | DNJ',
    description:
      'Hire gemologists in Malaysia. GIA / AIGS / HRD certified or graduate trainees. AI-curated matching, three profiles per role, PDPA-compliant.',
    keywords:
      'hire gemologist Malaysia, recruit gemologist, hire GIA gemologist, gemology hiring agency, hire gem appraiser',
    intro:
      'Gemology talent is concentrated, certified and quiet. DNJ matches you with certified gemologists and graduate trainees — three curated profiles per role.',
    bullets: [
      'Certified (GIA / AIGS / HRD) or graduate trainee tracks',
      'Lab work and appraisal expertise',
      'Three vetted profiles per role',
      'Access passive talent',
    ],
    relatedRoles: ['gemologist', 'diamond-grader', 'jeweler'],
  },

  'sales-team': {
    slug: 'sales-team',
    role: 'sales team',
    title: 'Hire Sales Teams in Malaysia — AI-Curated Talent | DNJ',
    description:
      'Hire sales executives and sales teams in Malaysia through AI-matched curated profiles. Three matches per role, culture and trajectory scored.',
    keywords:
      'hire sales executive Malaysia, hire sales team, sales recruitment Malaysia, hire sales rep, build sales team Malaysia',
    intro:
      'Hiring sales talent is fast — but hiring the *right* sales talent is hard. DNJ matches roles to candidates by trajectory, comp expectation and culture fit, not just CV keywords.',
    bullets: [
      'Three vetted profiles per role',
      'Trajectory + comp + culture scored',
      'B2B and retail tracks',
      'Junior to senior',
    ],
    relatedRoles: ['sales-executive', 'luxury-retail', 'customer-service'],
  },

  'luxury-retail-staff': {
    slug: 'luxury-retail-staff',
    role: 'luxury retail staff',
    title: 'Hire Luxury Retail Staff in Malaysia | DNJ',
    description:
      'Hire luxury retail sales associates and boutique managers in Kuala Lumpur, PJ and Penang. AI-curated, three profiles per role, PDPA-compliant.',
    keywords:
      'hire luxury retail staff, hire boutique manager, luxury retail recruitment Malaysia, hire jewelry sales associate, hire watch sales associate',
    intro:
      'Luxury retail clienteling is its own craft. DNJ matches your boutique with three vetted profiles — culture, language, clientele type and progression goals.',
    bullets: [
      'Three vetted profiles per role',
      'Multilingual matching (English / Bahasa / Mandarin / Cantonese)',
      'Boutique manager + sales associate + clienteling tracks',
      'Access passive talent from competitor brands',
    ],
    relatedRoles: ['luxury-retail', 'jeweler', 'sales-executive'],
  },
}

// Convenience arrays for sitemap and inject-meta generation
export const ROLE_SLUGS = Object.keys(ROLES) as RoleSlug[]
export const LOCATION_SLUGS = Object.keys(LOCATIONS) as LocationSlug[]
export const HIRE_SLUGS = Object.keys(HIRES) as HireSlug[]
