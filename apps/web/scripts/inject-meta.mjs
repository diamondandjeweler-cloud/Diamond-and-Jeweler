/**
 * Post-build script: generates per-route HTML files in dist/ with
 * route-specific <title>, <meta description>, <link canonical>, OG tags,
 * and a <noscript> body block for silo pages so crawlers see meaningful
 * content before JS hydrates (fixes soft-404 classification).
 *
 * Vercel's `handle: filesystem` routing serves these files for direct URL
 * access and browser refreshes. React Router handles client-side navigation
 * without hitting Vercel routing at all, so there's no conflict.
 *
 * Usage: node scripts/inject-meta.mjs  (runs after `vite build`)
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST = resolve(__dirname, '../dist')

const BASE = 'https://diamondandjeweler.com'

/**
 * Public routes that need unique metadata.
 * `bullets` is optional — if present, a <noscript> content block is injected
 * into <div id="root"> so crawlers see meaningful HTML before JS loads.
 */
const ROUTES = {
  // ----- Utility pages (no noscript body needed) -----
  '/start/talent': {
    title: 'Find your next role · DNJ',
    description:
      'DNJ matches talent in Malaysia with exactly three curated roles at a time. Zero noise, three real opportunities.',
  },
  '/start/hiring': {
    title: 'Hire with precision · DNJ',
    description:
      'DNJ delivers exactly three qualified candidates per open role to hiring managers and HR teams across Malaysia.',
  },
  '/login': {
    title: 'Sign in · DNJ',
    description:
      'Sign in to your DNJ account to view your curated matches, manage your profile, or post new roles.',
  },
  '/signup': {
    title: 'Create an account · DNJ',
    description:
      "Join DNJ — Malaysia's curated recruitment platform. Three matches, zero noise.",
  },
  '/privacy': {
    title: 'Privacy notice · DNJ',
    description:
      'How DNJ collects, uses, and protects your personal data under PDPA (Malaysia) and applicable privacy laws.',
  },
  '/terms': {
    title: 'Terms of service · DNJ',
    description:
      "Terms and conditions governing use of DNJ — Malaysia's curated recruitment platform.",
  },
  '/password-reset': {
    title: 'Reset your password · DNJ',
    description: 'Request a secure password reset link for your DNJ account.',
  },
  '/about': {
    title: 'About DNJ — Bole, the AI That Recognises Your Brilliance',
    description:
      "DNJ is an AI-curated recruitment platform for Malaysia. Meet Bole — our advanced AI talent scout that recognises your potential and matches you with the leader who brings out your brilliance. You're already a diamond; let the world see it.",
    bullets: [
      "You're already a diamond — most job boards just can't see it",
      'Bole is DNJ’s advanced AI talent scout — it recognises potential, it doesn’t manufacture it',
      'Named after the legendary Bole (伯樂), who could spot an extraordinary talent in any crowd',
      'Bole reads six facets: skills, career trajectory, character, working style, growth potential and culture fit',
      'You receive three curated matches — quality over volume, zero noise',
      'The right leader doesn’t create talent — they reveal the brilliance you already carry',
    ],
  },

  // ----- Careers hub + blog -----
  '/careers': {
    title: 'Careers — Job Vacancy Malaysia, All Industries | AI-Curated Recruitment | DNJ',
    description:
      'Precision recruitment powered by AI. Three matches at a time, zero noise. Job vacancy across every industry in Malaysia — sales, admin, finance, banking, IT and software, engineering, marketing, HR, customer service, healthcare, education, hospitality, construction, logistics, manufacturing, F&B and more. PDPA-compliant, end-to-end encrypted.',
    bullets: [
      'A general recruitment platform — sales, admin, finance, banking, IT, engineering, marketing, HR, customer service, healthcare, education, hospitality, construction, logistics, manufacturing, F&B, retail and more',
      'AI-curated matching — up to three vetted candidates or roles per match cycle',
      'Active hiring in Kuala Lumpur, Petaling Jaya, Penang, Johor Bahru, Cyberjaya and nationwide',
      'Fresh graduate, junior, mid-level and senior tracks available',
      'PDPA-compliant, end-to-end encrypted — your data stays private',
      'Apply online — no walk-in required',
    ],
  },
  '/careers/urgent-hiring-malaysia-2026': {
    title: 'Urgent Hiring in Malaysia 2026 — Top AI-Curated Job Vacancies in KL, PJ, Penang | DNJ',
    description:
      'Where to find AI-curated job vacancies in Malaysia 2026. Pilot, diamond and jeweler, sales, admin, finance, fresh graduate roles in Kuala Lumpur, PJ and Penang. Three curated picks per role — apply online today.',
    bullets: [
      'Pilot, jeweler, diamond grader, gemologist, sales, admin and finance roles in KL, PJ and Penang',
      'AI-curated matching — three vetted profiles per role, not a CV pile',
      'Fresh graduate and no-experience tracks available across multiple categories',
      'Cadet pilot program open to SPM leavers, diploma and degree holders',
      'Apply online — structured interview process for all shortlisted candidates',
    ],
  },
  '/careers/cadet-pilot-program-malaysia-guide': {
    title: 'Cadet Pilot Program Malaysia 2026 — Full Guide | DNJ Careers',
    description:
      'Complete guide to the cadet pilot program in Malaysia 2026. Eligibility, training pathway, career progression, and how to apply with DNJ — AI-curated matching with airline partners.',
    bullets: [
      'Open to fresh graduates, SPM leavers, diploma and degree holders — no experience needed',
      'Structured pathway from ground school to airline first officer',
      'Linked to airline hiring partners across Malaysia via DNJ AI matching',
      'Medical fitness (Class 1), English proficiency, aptitude screening covered',
      'Experienced CPL/ATPL holders also matched to direct-entry first officer and captain roles',
    ],
  },
  '/careers/diamond-grader-vs-gemologist': {
    title: 'Diamond Grader vs Gemologist — Career Path in Malaysia | DNJ',
    description:
      "Diamond grader vs gemologist — what's the difference, what they do, salary range, training, certification, and which path is right for you in Malaysia.",
    bullets: [
      'Diamond grader: grades cut, color, clarity and carat weight — lab and retail settings',
      'Gemologist: broader gem science covering colored stones, appraisal and certification support',
      'GIA, AIGS and HRD certification paths available for both tracks',
      'Both roles active in Kuala Lumpur, PJ and Penang luxury jewellery sector',
      'Fresh graduates and diploma holders welcome for trainee and junior positions',
    ],
  },

  '/careers/luxury-retail-jobs-malaysia': {
    title: 'Luxury Retail Jobs in Kuala Lumpur — Hiring Guide 2026 | DNJ',
    description:
      'Guide to luxury retail jobs in Kuala Lumpur — sales associate, clienteling, boutique manager roles in jewelry, watches and fashion. Salary ranges, what brands look for, and the career ladder.',
    bullets: [
      'Sales associate, clienteling specialist, boutique supervisor and manager roles',
      'Indicative KL salary ranges from RM 2,800 base to RM 18,000+ for managers with commission',
      'Brands hire for language range, composure, service instinct — prior luxury experience optional',
      'Career ladder: associate to senior to clienteling to boutique manager to retail operations',
      'Concentrated in Suria KLCC, Pavilion KL, The Exchange TRX, Starhill and Mid Valley',
    ],
  },
  '/careers/ai-recruitment-explained': {
    title: 'How AI Recruitment Works — Three Matches Beat Hundreds | DNJ',
    description:
      'How AI-curated recruitment works, and why three well-matched roles beat a hundred cold applications. A plain-English explanation of compatibility matching for talent and hiring managers.',
    bullets: [
      'AI handles matching and shortlisting — interviews and hiring decisions stay fully human',
      'A compatibility engine scores skills, trajectory, culture fit and compensation alignment',
      'Three genuinely-aligned matches beat three hundred listings — quality of attention wins',
      'Personal data is end-to-end encrypted and PDPA-compliant; employers see only what you share',
      'Employers receive vetted, compatibility-scored profiles including passive talent',
    ],
  },
  '/careers/jewellery-shop-hiring-malaysia': {
    title: 'Jewellery Shop Hiring Malaysia — What Companies Look For | DNJ',
    description:
      'What jewellery shops in Malaysia look for when hiring — roles, traits, training, and the trust factor. A practical guide for job seekers and a hiring checklist for shop owners.',
    bullets: [
      'Roles: sales associate, bench jeweler, stone setter, appraiser/grader, shop manager',
      'Jewellery employers weigh trustworthiness and attention to detail alongside skill',
      'Prior jewellery experience optional for sales — attitude and polish trained in-house',
      'Bench and setting roles favour trade certificates and demonstrable hand skill',
      'A steady, skilled, future-proof career path across KL, PJ and Penang',
    ],
  },

  // ----- Role silo pages -----
  '/jobs/pilot': {
    title: 'Pilot Job Vacancy Malaysia — Cadet & Airline Pilot Hiring | DNJ',
    description:
      'Pilot job vacancy in Malaysia. Cadet pilot program for fresh graduates with no experience, plus experienced first officer and captain roles. AI-curated matching — apply online via DNJ.',
    bullets: [
      'Cadet pilot program — fresh graduate friendly, no experience needed',
      'Direct entry first officer for CPL/ATPL holders with current type rating',
      'Captain upgrade path with airline partners across Malaysia',
      'Structured interview process for all shortlisted candidates',
      'Stable career, good salary, structured progression to captain',
      'AI-curated matching with airline and charter hiring partners',
    ],
  },
  '/jobs/cadet-pilot': {
    title: 'Cadet Pilot Program Malaysia — Fresh Graduate, No Experience | DNJ',
    description:
      'Cadet pilot program in Malaysia for fresh graduate, SPM leaver, diploma and degree holder. No experience needed. Structured trainee programme from classroom to airline first officer. Apply online today.',
    bullets: [
      'No flying experience required — all training provided',
      'Open to SPM leavers, diploma and degree holders',
      'Ground school, simulator and type rating pathway',
      'Medical Class 1 screening and English proficiency support',
      'Pathway to airline first officer and captain with partner airlines',
      'AI-curated matching with cadet program partners across Malaysia',
    ],
  },
  '/jobs/jeweler': {
    title: 'Jeweler Job Vacancy Malaysia — Bench Jeweler & Setter Hiring | DNJ',
    description:
      'Jeweler job vacancy in Kuala Lumpur, PJ and Penang. Bench jeweler, setter, polisher and apprentice roles. With or without experience considered. Apply online — stable career with growth path.',
    bullets: [
      'Bench jeweler, setter, polisher and apprentice tracks',
      'Career path to senior bench jeweler or atelier lead',
      'Stable job, good salary, retirement-friendly career',
      'Apprenticeship and direct-hire tracks available',
      'Apprenticeship route for SPM leavers and diploma holders',
      'Family-business and luxury-house openings across KL, PJ and Penang',
    ],
  },
  '/jobs/diamond-grader': {
    title: 'Diamond Grader Job Vacancy Malaysia — Hiring Now | DNJ',
    description:
      'Diamond grader job vacancy in Kuala Lumpur and PJ. Grade the 4Cs (cut, color, clarity, carat), build appraisal expertise, work with luxury brands. Diploma and degree holders welcome.',
    bullets: [
      'Grade cut, color, clarity and carat weight in lab and retail settings',
      'Work with luxury jewelry brands, appraisal labs and diamond traders',
      'GIA / AIGS training pathway supported',
      'Diploma and degree holders welcome — fresh graduate trainee track available',
      'Career path to senior grader, appraisal manager and gemologist',
      'AI-curated matching with jewelry and diamond trading companies',
    ],
  },
  '/jobs/gemologist': {
    title: 'Gemologist Job Malaysia — GIA Path, Lab & Appraisal | DNJ',
    description:
      'Gemologist job in Malaysia. Lab work, appraisal, certification support. GIA path, structured career growth, graduate trainee options. Apply online via DNJ.',
    bullets: [
      'Lab work, gem appraisal and certification support roles',
      'GIA, AIGS and HRD certification path supported',
      'Graduate trainee track for diploma and degree holders',
      'Career progression to senior gemologist and appraisal lead',
      'Work with luxury jewellery brands and certified appraisal labs',
      'AI-curated matching with gemological labs and luxury houses',
    ],
  },
  '/jobs/jewelry-designer': {
    title: 'Jewelry Designer Job Malaysia — CAD & Bespoke Hiring | DNJ',
    description:
      'Jewelry designer job vacancy in Kuala Lumpur. CAD design (Rhino/Matrix), bespoke commissions, luxury collections. Diploma/degree and portfolio. Hybrid options available.',
    bullets: [
      'CAD design (Rhino, Matrix) and hand-sketch bespoke commission roles',
      'Luxury collection design for jewelry brands and ateliers',
      'Diploma or degree in jewelry design, fine arts or related field',
      'Portfolio-first hiring — creative track with growth to design lead',
      'Hybrid work options available in Kuala Lumpur',
      'AI-curated matching with luxury jewellery houses and custom ateliers',
    ],
  },
  '/jobs/luxury-retail': {
    title: 'Luxury Retail Job Vacancy Malaysia — Sales Associate Hiring | DNJ',
    description:
      'Luxury retail job vacancy in Kuala Lumpur, PJ and Penang. Sales associate, clienteling, boutique manager roles in jewelry, watches and luxury goods. Apply online via AI-curated matching.',
    bullets: [
      'Sales associate, clienteling specialist and boutique manager tracks',
      'Roles across jewelry, watches, leather goods and luxury fashion',
      'Career path to boutique lead and area manager',
      'Commission and luxury staff perks included',
      'Cross-train in jewelry, watches and leather goods',
      'AI-curated matching with luxury houses across Malaysia',
    ],
  },
  '/jobs/sales-executive': {
    title: 'Sales Executive Job Vacancy Malaysia — Hiring Now | DNJ',
    description:
      'Sales executive job vacancy in Kuala Lumpur, PJ, Penang and Malaysia. Strong commission, career growth, AI-curated matching. Fresh graduate, junior and mid-level openings.',
    bullets: [
      'Attractive commission and incentive structure',
      'Career path to senior sales executive and team lead',
      'Structured interview process for shortlisted candidates',
      'B2B and retail sales tracks available',
      'Fresh graduate trainee programme',
      'AI-curated matching with companies across KL, PJ, Penang and Malaysia',
    ],
  },
  '/jobs/admin-executive': {
    title: 'Admin Executive Job Vacancy Malaysia — Hiring Now | DNJ',
    description:
      'Admin executive job vacancy in Kuala Lumpur, PJ and Penang. Hybrid options, full time, stable career. Fresh graduate, diploma and degree holders welcome.',
    bullets: [
      'Hybrid and full-time options across KL, PJ and Penang',
      'Stable, predictable hours — good work-life balance',
      'Career path to office manager and operations lead',
      'Fresh graduate, diploma and degree holders welcome',
      'AI-curated matching — apply online, no walk-in required',
    ],
  },
  '/jobs/account-assistant': {
    title: 'Account Assistant Job Vacancy Malaysia — Fresh Graduate | DNJ',
    description:
      'Account assistant job vacancy in Kuala Lumpur and PJ. Fresh graduate, SPM and diploma holder friendly. Stable career, finance progression path — apply online via DNJ.',
    bullets: [
      'Full set accounts, AP/AR, bank reconciliation and GL exposure',
      'Fresh graduate, SPM and diploma holder friendly',
      'Career progression to accounts executive and finance manager',
      'ACCA and accounting degree holders welcome',
      'Stable career with structured salary progression',
      'AI-curated matching with companies in KL and PJ',
    ],
  },
  '/jobs/software-developer': {
    title: 'Software Developer Job Vacancy Malaysia — Remote & Hybrid | DNJ',
    description:
      'Software developer job vacancy in Malaysia with remote and hybrid options. Junior, mid and senior roles. Fresh graduate to senior. Apply online and send portfolio.',
    bullets: [
      'Remote and hybrid options across Malaysia',
      'Full-stack, frontend, backend and mobile tracks',
      'Junior, mid-level and senior roles — fresh graduate friendly',
      'Portfolio and GitHub profile reviewed — no whiteboard interviews',
      'Competitive salary and tech stack exposure',
      'AI-curated matching with product companies and agencies',
    ],
  },
  '/jobs/graphic-designer': {
    title: 'Graphic Designer Job Vacancy Malaysia — Full Time & Freelance | DNJ',
    description:
      'Graphic designer job vacancy in Kuala Lumpur and Petaling Jaya. Full time, freelance and contract options. Portfolio-first hiring. Fresh graduate friendly.',
    bullets: [
      'Full time, freelance and contract roles in KL and PJ',
      'Brand, digital, print and social media design tracks',
      'Portfolio-first — no rigid degree requirement',
      'Fresh graduate friendly with mentorship in agencies',
      'Career path to senior designer and creative director',
      'AI-curated matching with agencies and in-house brand teams',
    ],
  },
  '/jobs/marketing-executive': {
    title: 'Marketing Executive Job Vacancy Malaysia — Hiring Now | DNJ',
    description:
      'Marketing executive job vacancy in Kuala Lumpur and Petaling Jaya. Digital marketing, brand, content and social media tracks. Fresh graduate to senior.',
    bullets: [
      'Digital marketing, brand, content, SEO/SEM and social media tracks',
      'Fresh graduate to mid-level and senior roles in KL and PJ',
      'Hybrid and full-time options available',
      'Growth to marketing manager and head of marketing',
      'Work with FMCG, luxury, tech and e-commerce brands',
      'AI-curated matching with brand teams and agencies',
    ],
  },
  '/jobs/customer-service': {
    title: 'Customer Service Job Vacancy Malaysia — Fresh Graduate Welcome | DNJ',
    description:
      'Customer service job vacancy in Kuala Lumpur, PJ, Penang. Fresh graduate friendly, AI-curated matching. Shift and full time options — apply online via DNJ.',
    bullets: [
      'Shift and full-time options in KL, PJ and Penang',
      'Fresh graduate and SPM leaver friendly',
      'Multilingual roles available — English, Bahasa and Mandarin',
      'Career path to team lead, supervisor and operations manager',
      'In-house and outsourced contact centre tracks',
      'AI-curated matching — apply online, structured process for shortlisted candidates',
    ],
  },
  '/jobs/hr-assistant': {
    title: 'HR Assistant Job Vacancy Malaysia — Junior to Mid-Level | DNJ',
    description:
      'HR assistant job vacancy in Kuala Lumpur and Petaling Jaya. Recruitment, payroll and HR ops exposure. Career growth to HR executive and manager.',
    bullets: [
      'Recruitment, onboarding, payroll and HR operations exposure',
      'Junior to mid-level roles in KL and PJ',
      'Career path to HR executive, HRBP and HR manager',
      'Fresh graduate and diploma holder friendly',
      'Work with HR systems (Info-Tech, SAP HR, SuccessFactors)',
      'AI-curated matching with companies across Malaysia',
    ],
  },
  '/jobs/finance': {
    title: 'Finance Job Vacancy Malaysia — Stable Career Growth | DNJ',
    description:
      'Finance job vacancy in Kuala Lumpur and Petaling Jaya. Junior to senior accountant, financial analyst and finance manager roles. Stable career, good salary, ACCA-friendly.',
    bullets: [
      'Junior to senior accountant, financial analyst and finance manager roles',
      'ACCA, CIMA, CPA and accounting degree holders welcome',
      'Stable career with structured salary progression',
      'Work with Big 4, GLCs, MNCs and listed companies',
      'Corporate finance, audit, tax and treasury tracks',
      'AI-curated matching with companies in KL and PJ',
    ],
  },
  '/jobs/banking': {
    title: 'Banking Jobs Malaysia — Bank Officer & Relationship Manager | DNJ',
    description:
      'Banking jobs in Malaysia. Bank officer, relationship manager, credit, operations and branch roles. Fresh graduate to senior. AI-curated matching — apply online via DNJ.',
    bullets: [
      'Bank officer, relationship manager, credit and operations tracks',
      'Branch, corporate and digital banking roles',
      'Structured career path with strong benefits',
      'Fresh graduate management-trainee schemes',
      'Career growth to branch manager and regional roles',
      'AI-curated matching with banks across Malaysia',
    ],
  },
  '/jobs/engineering': {
    title: 'Engineering Jobs Malaysia — Mechanical, Electrical & Civil | DNJ',
    description:
      'Engineering jobs in Malaysia. Mechanical, electrical, civil, chemical and process engineer roles. Fresh graduate to senior. AI-curated matching — apply online via DNJ.',
    bullets: [
      'Mechanical, electrical, civil, chemical and process tracks',
      'Site, plant, design and project engineering roles',
      'Fresh graduate and graduate-trainee positions',
      'Career path to senior engineer, lead and engineering manager',
      'BEM / IEM professional pathway support at many employers',
      'AI-curated matching across manufacturing, construction and oil and gas',
    ],
  },
  '/jobs/healthcare': {
    title: 'Healthcare Jobs Malaysia — Nurse, Medical & Clinic Roles | DNJ',
    description:
      'Healthcare jobs in Malaysia. Nurse, medical assistant, pharmacy, clinic and allied-health roles. Fresh graduate to senior. AI-curated matching — apply online via DNJ.',
    bullets: [
      'Nursing, medical assistant, pharmacy and allied-health roles',
      'Hospital, clinic and specialist-centre settings',
      'Fresh graduate and experienced practitioner tracks',
      'Shift and full time options',
      'Stable, in-demand careers with clear progression',
      'AI-curated matching with hospitals and clinics nationwide',
    ],
  },
  '/jobs/education': {
    title: 'Education Jobs Malaysia — Teacher, Tutor & Lecturer Roles | DNJ',
    description:
      'Education jobs in Malaysia. Teacher, tutor, lecturer, training and academic-support roles. Fresh graduate to senior. AI-curated matching — apply online via DNJ.',
    bullets: [
      'Teacher, tutor, lecturer and academic-support roles',
      'Schools, colleges, universities and training providers',
      'Full time, part time and contract options',
      'Fresh graduate and experienced educator tracks',
      'Career path to senior teacher, head of department and principal',
      'AI-curated matching with education institutions',
    ],
  },
  '/jobs/hospitality': {
    title: 'Hospitality Jobs Malaysia — Hotel & Tourism Careers | DNJ',
    description:
      'Hospitality jobs in Malaysia. Hotel, front office, housekeeping, events and tourism roles. Fresh graduate to senior. AI-curated matching — apply online via DNJ.',
    bullets: [
      'Front office, housekeeping, events, F&B and guest-services roles',
      'Hotels, resorts, serviced apartments and tourism operators',
      'Shift, full time and part time options',
      'Fresh graduate and management-trainee tracks',
      'Career path to supervisor, department head and hotel management',
      'AI-curated matching with hotels and tourism employers',
    ],
  },
  '/jobs/construction': {
    title: 'Construction Jobs Malaysia — Site, QS & Project Roles | DNJ',
    description:
      'Construction jobs in Malaysia. Site supervisor, quantity surveyor, project and safety roles. Fresh graduate to senior. AI-curated matching — apply online via DNJ.',
    bullets: [
      'Site supervisor, quantity surveyor, project and safety roles',
      'Residential, commercial and infrastructure projects',
      'Fresh graduate and experienced tracks',
      'CIDB and safety certification support at many employers',
      'Career path to project manager and construction director',
      'AI-curated matching with developers and contractors',
    ],
  },
  '/jobs/logistics': {
    title: 'Logistics & Supply Chain Jobs Malaysia | DNJ',
    description:
      'Logistics and supply chain jobs in Malaysia. Warehouse, procurement, shipping, fleet and supply-chain roles. Fresh graduate to senior. AI-curated matching via DNJ.',
    bullets: [
      'Warehouse, procurement, shipping, fleet and planning roles',
      'Third-party logistics, e-commerce and manufacturing employers',
      'Fresh graduate and experienced supply-chain tracks',
      'Career path to logistics executive, manager and head of supply chain',
      'Growing demand from e-commerce and regional distribution hubs',
      'AI-curated matching across the logistics network',
    ],
  },
  '/jobs/manufacturing': {
    title: 'Manufacturing & Production Jobs Malaysia | DNJ',
    description:
      'Manufacturing and production jobs in Malaysia. Production, QA/QC, planning, supervisor and plant roles. Fresh graduate to senior. AI-curated matching via DNJ.',
    bullets: [
      'Production, QA/QC, planning and supervisor roles',
      'Electronics, semiconductor, FMCG and industrial sectors',
      'Shift and full time options',
      'Fresh graduate and experienced tracks',
      'Career path to production manager and plant management',
      'AI-curated matching with manufacturers in Penang, Selangor and Johor',
    ],
  },
  '/jobs/f-and-b': {
    title: 'F&B Jobs Malaysia — Restaurant, Chef & Service Careers | DNJ',
    description:
      'F&B jobs in Malaysia. Chef, kitchen, barista, restaurant service and outlet-management roles. Fresh graduate to senior. AI-curated matching — apply online via DNJ.',
    bullets: [
      'Chef, kitchen crew, barista, service and outlet-management roles',
      'Restaurants, cafes, hotels and F&B chains',
      'Shift, full time and part time options',
      'Fresh graduate and experienced tracks',
      'Career path to head chef, outlet manager and operations',
      'AI-curated matching with F&B employers',
    ],
  },

  // ----- Location silo pages -----
  '/jobs-in-kuala-lumpur': {
    title: 'Jobs in Kuala Lumpur — Latest Hiring | DNJ Careers',
    description:
      'Latest job vacancy in Kuala Lumpur. AI-curated matches for pilot, jeweler, diamond grader, gemologist, sales, admin, finance, software developer roles. Apply online via DNJ.',
    bullets: [
      'Largest job market in Malaysia — pilot, luxury retail, finance, tech and more',
      'Strong concentration of luxury retail in KLCC, Bukit Bintang and Mont Kiara',
      'Corporate finance and tech roles in KL Sentral and Bangsar South',
      'Hybrid and remote-friendly roles available across categories',
      'Fresh graduate friendly — multiple trainee tracks across industries',
      'AI-curated matching — apply online, up to three curated matches per cycle',
    ],
  },
  '/jobs-in-petaling-jaya': {
    title: 'Jobs in Petaling Jaya (PJ) — Latest Hiring | DNJ Careers',
    description:
      'Job vacancy in Petaling Jaya (PJ) and Selangor. AI-curated matches for jeweler, sales, admin, finance, marketing, software developer roles. Apply online via DNJ.',
    bullets: [
      'Strong tech, finance and marketing hiring market in PJ and Selangor',
      'Hybrid-friendly companies with LRT Kelana Jaya line access',
      'Active luxury retail at 1 Utama and Sunway Pyramid',
      'Cheaper cost of living than KL with strong career options',
      'Fresh graduate tracks across admin, finance and software development',
      'AI-curated matching — apply online, structured process for shortlisted candidates',
    ],
  },
  '/jobs-in-penang': {
    title: 'Jobs in Penang — Latest Hiring | DNJ Careers',
    description:
      'Job vacancy in Penang (George Town and Bayan Lepas). AI-curated matches for jeweler, luxury retail, sales, customer service, admin roles. Apply online via DNJ.',
    bullets: [
      'Tech and manufacturing hub in Bayan Lepas — MNC and semiconductor roles',
      'Growing luxury retail and jewellery sector in George Town',
      'Lower cost of living than KL with high quality of life',
      'Structured interview process for all shortlisted candidates',
      'Fresh graduate friendly across most hiring categories',
      'AI-curated matching — apply online via DNJ',
    ],
  },
  '/jobs-in-johor-bahru': {
    title: 'Jobs in Johor Bahru (JB) — Latest Hiring | DNJ Careers',
    description:
      'Job vacancy in Johor Bahru. Aviation, luxury retail and sales hiring. AI-curated matching, fresh graduate friendly — apply online via DNJ.',
    bullets: [
      'Growing aviation hub at Senai International Airport',
      'Cross-border Singapore commute opportunities in logistics and finance',
      'Luxury retail at Mid Valley Southkey and KSL City',
      'Structured interview process for shortlisted candidates',
      'Fresh graduate and junior roles across multiple industries',
      'AI-curated matching — apply online, three curated picks per cycle',
    ],
  },
  '/jobs-in-cyberjaya': {
    title: 'Jobs in Cyberjaya — Tech & BPO Hiring | DNJ Careers',
    description:
      'Job vacancy in Cyberjaya. Software developer, customer service, admin and BPO roles. Hybrid and remote options. Fresh graduate friendly.',
    bullets: [
      'Software developer, data, BPO and customer service hub',
      'MNC and shared services centre hiring',
      'Hybrid and remote-friendly roles',
      'Fresh graduate and diploma holder friendly',
      'Shuttle and transport links to KL and Putrajaya',
      'AI-curated matching — apply online via DNJ',
    ],
  },
  '/jobs-in-shah-alam': {
    title: 'Jobs in Shah Alam — Latest Hiring | DNJ Careers',
    description:
      'Job vacancy in Shah Alam, Selangor. Admin, sales, finance and customer service hiring. Fresh graduate friendly. Apply online via DNJ.',
    bullets: [
      'Manufacturing and logistics hub — admin, finance and ops roles',
      'Stable admin and finance hiring across SMEs and MNCs',
      'Hybrid-friendly employers in Shah Alam industrial areas',
      'Fresh graduate, diploma and degree holders welcome',
      'Structured AI-curated matching process — apply online',
    ],
  },
  '/jobs-in-subang-jaya': {
    title: 'Jobs in Subang Jaya — Latest Hiring | DNJ Careers',
    description:
      'Job vacancy in Subang Jaya and USJ. Sales, admin, finance, customer service hiring. AI-curated matching, fresh graduate friendly — apply online via DNJ.',
    bullets: [
      'Active luxury retail and F&B hiring at Sunway Pyramid',
      'Sales, admin, customer service and finance roles across Subang and USJ',
      'Fresh graduate and SPM leaver friendly',
      'LRT and bus connectivity to KL and PJ',
      'AI-curated matching — apply online, structured process for shortlisted candidates',
    ],
  },

  // ----- Hire (HM-side) silo pages -----
  '/hire-pilot': {
    title: 'Hire Pilots in Malaysia — AI-Curated Aviation Talent | DNJ',
    description:
      'Hire pilots in Malaysia through AI-curated matching. Three vetted profiles per role, no CV pile. Cadet program graduates, first officers and captains. PDPA-compliant.',
    bullets: [
      'Cadet program graduates, first officers and captain-track candidates',
      'AI screening covers medical fitness history, type rating, logbook hours',
      'Three curated, vetted profiles per open role — no CV pile',
      'Confidential — candidate data is PDPA-compliant and end-to-end encrypted',
      'Post as a hiring manager in minutes, matches generated within 24h',
    ],
  },
  '/hire-jeweler': {
    title: 'Hire Jewelers in Malaysia — Bench, Setter, Designer | DNJ',
    description:
      'Hire bench jewelers, setters, polishers and designers in Malaysia. AI-curated matching delivers three vetted profiles per role. PDPA-compliant, end-to-end encrypted.',
    bullets: [
      'Bench jeweler, setter, polisher, designer and apprentice tracks',
      'AI matching covers craft experience, stone-setting specialisation and salary fit',
      'Three curated profiles per role — no CV pile, no agency fees',
      'Active talent pool across KL, PJ and Penang',
      'PDPA-compliant — candidate data protected end-to-end',
    ],
  },
  '/hire-diamond-grader': {
    title: 'Hire Diamond Graders in Malaysia | DNJ',
    description:
      'Hire diamond graders in Kuala Lumpur and PJ. AI-matched candidates with 4Cs expertise — cut, color, clarity, carat. Three curated profiles per role.',
    bullets: [
      'Candidates screened for 4Cs grading expertise and lab experience',
      'GIA, AIGS and HRD certified talent in the pool',
      'Three curated profiles per role — vetted before you see them',
      'Active talent in KL and PJ diamond and jewellery sector',
      'PDPA-compliant — end-to-end encrypted candidate data',
    ],
  },
  '/hire-gemologist': {
    title: 'Hire Gemologists in Malaysia — GIA & Lab Talent | DNJ',
    description:
      'Hire gemologists in Malaysia. GIA / AIGS / HRD certified or graduate trainees. AI-curated matching, three profiles per role, PDPA-compliant.',
    bullets: [
      'GIA Graduate Gemologist, AIGS and HRD certified talent available',
      'Graduate trainees matched for entry-level appraisal and lab roles',
      'AI screening covers certification, lab experience and salary alignment',
      'Three curated profiles per role — no recruiter noise',
      'PDPA-compliant matching — candidate data fully protected',
    ],
  },
  '/hire-sales-team': {
    title: 'Hire Sales Teams in Malaysia — AI-Curated Talent | DNJ',
    description:
      'Hire sales executives and sales teams in Malaysia through AI-matched curated profiles. Three matches per role, culture and trajectory scored.',
    bullets: [
      'B2B, retail and luxury sales executive tracks available',
      'Culture fit and career trajectory scored alongside skills',
      'Three curated profiles per role — shortlist ready in under 24h',
      'Fresh graduate trainee and junior to senior hiring tracks',
      'PDPA-compliant — candidates\' data is end-to-end encrypted',
    ],
  },
  '/hire-luxury-retail-staff': {
    title: 'Hire Luxury Retail Staff in Malaysia | DNJ',
    description:
      'Hire luxury retail sales associates and boutique managers in Kuala Lumpur, PJ and Penang. AI-curated, three profiles per role, PDPA-compliant.',
    bullets: [
      'Sales associate, clienteling specialist and boutique manager roles',
      'Candidates screened for luxury brand knowledge and customer service standard',
      'Active talent pool in KL, PJ and Penang luxury malls',
      'Three curated profiles per role — no agency, no CV pile',
      'PDPA-compliant — end-to-end encrypted candidate data',
    ],
  },
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Build a <noscript> block with semantic content so crawlers see meaningful
 * HTML before JS hydrates. React replaces <div id="root"> on mount so JS
 * users never see this. Googlebot indexes <noscript> content.
 */
function buildNoscriptBlock(title, description, bullets) {
  if (!bullets || bullets.length === 0) return ''
  const items = bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')
  return [
    '<noscript>',
    '<article style="font-family:sans-serif;max-width:680px;margin:2rem auto;padding:1rem">',
    `<h1>${escapeHtml(title)}</h1>`,
    `<p>${escapeHtml(description)}</p>`,
    `<ul>${items}</ul>`,
    '<p><a href="/careers">Browse all jobs on DNJ</a></p>',
    '</article>',
    '</noscript>',
  ].join('')
}

function injectMeta(html, route, title, description, bullets) {
  const canonical = `${BASE}${route}`
  const t = escapeHtml(title)
  const d = escapeHtml(description)
  const c = escapeHtml(canonical)
  let out = html
    .replace(/<title>[^<]*<\/title>/, `<title>${t}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/,        `$1${d}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/,       `$1${t}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/,  `$1${d}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/,          `$1${c}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(")/,       `$1${t}$2`)
    .replace(/(<meta name="twitter:description" content=")[^"]*(")/,  `$1${d}$2`)
    .replace(/(<link rel="canonical" href=")[^"]*(")/,               `$1${c}$2`)

  const noscript = buildNoscriptBlock(title, description, bullets)
  if (noscript) {
    out = out.replace('<div id="root"></div>', `<div id="root">${noscript}</div>`)
  }
  return out
}

const baseHtml = readFileSync(join(DIST, 'index.html'), 'utf-8')

for (const [route, { title, description, bullets }] of Object.entries(ROUTES)) {
  const html = injectMeta(baseHtml, route, title, description, bullets)
  // /start/talent  → dist/start/talent.html
  // /login         → dist/login.html
  const relPath = route.slice(1) + '.html' // strip leading /
  const outPath = join(DIST, relPath)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, html, 'utf-8')
  process.stdout.write(`  ✓ ${route} → dist/${relPath}\n`)
}

process.stdout.write(`inject-meta: ${Object.keys(ROUTES).length} routes written.\n`)

// QA harness: write the build's git SHA to dist/version.txt so prod/main drift
// can be verified by qa/scripts/08-vercel-sha.mjs (DNJ has no git integration,
// so this file is the source of truth for "what's actually deployed").
try {
  const sha = (process.env.VERCEL_GIT_COMMIT_SHA || execSync('git rev-parse HEAD').toString())
    .trim()
  writeFileSync(join(DIST, 'version.txt'), sha + '\n', 'utf-8')
  process.stdout.write(`inject-meta: version.txt = ${sha.slice(0, 7)}\n`)
} catch (err) {
  process.stdout.write(`inject-meta: failed to write version.txt: ${err.message}\n`)
}
