/**
 * Post-build script: generates per-route HTML files in dist/ with
 * route-specific <title>, <meta description>, <link canonical>, and OG tags.
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

/** Public routes that need unique metadata. Key = URL path. */
const ROUTES = {
  // ----- Original public pages -----
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

  // ----- Careers + blog -----
  '/careers': {
    title: 'AI-Curated Careers Malaysia — Pilot, Diamond & Jeweler Job Vacancy | DNJ',
    description:
      'Precision recruitment powered by AI. Three matches at a time, zero noise. Apply online for pilot, diamond grader, jeweler, gemologist, sales executive, admin executive, software developer, graphic designer, marketing, finance, customer service and fresh graduate roles. PDPA-compliant, end-to-end encrypted.',
  },
  '/job-vacancy': {
    title: 'Job Vacancy Malaysia — AI-Matched Roles, Urgent Hiring in KL, PJ, Penang | DNJ',
    description:
      'Latest job vacancy in Malaysia matched by AI to your career profile. Three curated offers at a time. Pilot, diamond and jeweler, sales, admin, finance, customer service, fresh graduate roles. Walk-in interview, same day interview, immediate hiring — apply online today.',
  },
  '/careers/urgent-hiring-malaysia-2026': {
    title: 'Urgent Hiring Near Me: Top Job Vacancies in Kuala Lumpur 2026 | DNJ AI Recruitment',
    description:
      'Where to find urgent hiring near me in 2026. AI-curated guide to top job vacancies in Kuala Lumpur, PJ and Penang — pilot, diamond and jeweler, sales, admin, finance, fresh graduate roles. Walk-in interview, immediate hiring, apply online today.',
  },
  '/careers/cadet-pilot-program-malaysia-guide': {
    title: 'Cadet Pilot Program Malaysia 2026 — Full Guide | DNJ Careers',
    description:
      'Complete guide to the cadet pilot program in Malaysia 2026. Eligibility, training pathway, career progression, and how to apply with DNJ — AI-curated matching with airline partners.',
  },
  '/careers/diamond-grader-vs-gemologist': {
    title: 'Diamond Grader vs Gemologist — Career Path in Malaysia | DNJ',
    description:
      'Diamond grader vs gemologist — what\'s the difference, what they do, salary range, training, certification, and which path is right for you in Malaysia.',
  },

  // ----- Role silo pages -----
  '/jobs/pilot': {
    title: 'Pilot Job Vacancy Malaysia — Cadet & Airline Pilot Hiring | DNJ',
    description:
      'Pilot job vacancy in Malaysia. Cadet pilot program for fresh graduates with no experience, plus experienced first officer and captain roles. AI-curated matching, walk-in interview, immediate hiring — apply online via DNJ.',
  },
  '/jobs/cadet-pilot': {
    title: 'Cadet Pilot Program Malaysia — Fresh Graduate, No Experience | DNJ',
    description:
      'Cadet pilot program in Malaysia for fresh graduate, SPM leaver, diploma and degree holder. No experience needed. Structured trainee programme from classroom to airline first officer. Apply online today.',
  },
  '/jobs/jeweler': {
    title: 'Jeweler Job Vacancy Malaysia — Bench Jeweler & Setter Hiring | DNJ',
    description:
      'Jeweler job vacancy in Kuala Lumpur, PJ and Penang. Bench jeweler, setter, polisher and apprentice roles. With or without experience considered. Apply online — walk-in interview, stable career.',
  },
  '/jobs/diamond-grader': {
    title: 'Diamond Grader Job Vacancy Malaysia — Hiring Now | DNJ',
    description:
      'Diamond grader job vacancy in Kuala Lumpur and PJ. Grade the 4Cs (cut, color, clarity, carat), build appraisal expertise, work with luxury brands. Diploma + degree holders welcome.',
  },
  '/jobs/gemologist': {
    title: 'Gemologist Job Malaysia — GIA Path, Lab & Appraisal | DNJ',
    description:
      'Gemologist job in Malaysia. Lab work, appraisal, certification support. GIA path, structured career growth. Walk-in interview and graduate trainee options. Apply online via DNJ.',
  },
  '/jobs/jewelry-designer': {
    title: 'Jewelry Designer Job Malaysia — CAD & Bespoke Hiring | DNJ',
    description:
      'Jewelry designer job vacancy in Kuala Lumpur. CAD design (Rhino/Matrix), bespoke commissions, luxury collections. Diploma/degree + portfolio. Hybrid options available.',
  },
  '/jobs/luxury-retail': {
    title: 'Luxury Retail Job Vacancy Malaysia — Sales Associate Hiring | DNJ',
    description:
      'Luxury retail job vacancy in Kuala Lumpur, PJ and Penang. Sales associate, clienteling, boutique manager roles in jewelry, watches and luxury goods. Walk-in interview, immediate hiring.',
  },
  '/jobs/sales-executive': {
    title: 'Sales Executive Job Vacancy Malaysia — Hiring Now | DNJ',
    description:
      'Sales executive job vacancy in Kuala Lumpur, PJ, Penang and Malaysia. Strong commission, career growth, walk-in interview. Fresh graduate, junior and mid-level openings.',
  },
  '/jobs/admin-executive': {
    title: 'Admin Executive Job Vacancy Malaysia — Hiring Now | DNJ',
    description:
      'Admin executive job vacancy in Kuala Lumpur, PJ and Penang. Hybrid options, full time, stable career. Fresh graduate, diploma and degree holders welcome.',
  },
  '/jobs/account-assistant': {
    title: 'Account Assistant Job Vacancy Malaysia — Fresh Graduate | DNJ',
    description:
      'Account assistant job vacancy in Kuala Lumpur and PJ. Fresh graduate, SPM and diploma holder friendly. Stable career, finance progression path, immediate hiring.',
  },
  '/jobs/software-developer': {
    title: 'Software Developer Job Vacancy Malaysia — Remote & Hybrid | DNJ',
    description:
      'Software developer job vacancy in Malaysia with remote and hybrid options. Junior, mid and senior roles. Fresh graduate to senior. Apply online and send portfolio.',
  },
  '/jobs/graphic-designer': {
    title: 'Graphic Designer Job Vacancy Malaysia — Full Time & Freelance | DNJ',
    description:
      'Graphic designer job vacancy in Kuala Lumpur and Petaling Jaya. Full time, freelance and contract options. Portfolio-first hiring. Fresh graduate friendly.',
  },
  '/jobs/marketing-executive': {
    title: 'Marketing Executive Job Vacancy Malaysia — Hiring Now | DNJ',
    description:
      'Marketing executive job vacancy in Kuala Lumpur and Petaling Jaya. Digital marketing, brand, content and social media tracks. Fresh graduate to senior.',
  },
  '/jobs/customer-service': {
    title: 'Customer Service Job Vacancy Malaysia — Walk-in Interview | DNJ',
    description:
      'Customer service job vacancy in Kuala Lumpur, PJ, Penang. Walk-in interview, immediate hiring, fresh graduate friendly. Shift and full time options.',
  },
  '/jobs/hr-assistant': {
    title: 'HR Assistant Job Vacancy Malaysia — Junior to Mid-Level | DNJ',
    description:
      'HR assistant job vacancy in Kuala Lumpur and Petaling Jaya. Recruitment, payroll and HR ops exposure. Career growth to HR executive and manager.',
  },
  '/jobs/finance': {
    title: 'Finance Job Vacancy Malaysia — Stable Career Growth | DNJ',
    description:
      'Finance job vacancy in Kuala Lumpur and Petaling Jaya. Junior to senior accountant, financial analyst and finance manager roles. Stable career, good salary, ACCA-friendly.',
  },

  // ----- Location silo pages -----
  '/jobs-in-kuala-lumpur': {
    title: 'Jobs in Kuala Lumpur — Latest Hiring | DNJ Careers',
    description:
      'Latest job vacancy in Kuala Lumpur. AI-curated matches for pilot, jeweler, diamond grader, gemologist, sales, admin, finance, software developer roles. Walk-in interview, immediate hiring.',
  },
  '/jobs-in-petaling-jaya': {
    title: 'Jobs in Petaling Jaya (PJ) — Latest Hiring | DNJ Careers',
    description:
      'Job vacancy in Petaling Jaya (PJ) and Selangor. AI-curated matches for jeweler, sales, admin, finance, marketing, software developer roles. Walk-in interview, immediate hiring.',
  },
  '/jobs-in-penang': {
    title: 'Jobs in Penang — Latest Hiring | DNJ Careers',
    description:
      'Job vacancy in Penang (George Town and Bayan Lepas). AI-curated matches for jeweler, luxury retail, sales, customer service, admin roles. Walk-in interview, immediate hiring.',
  },
  '/jobs-in-johor-bahru': {
    title: 'Jobs in Johor Bahru (JB) — Latest Hiring | DNJ Careers',
    description:
      'Job vacancy in Johor Bahru. Aviation, luxury retail and sales hiring. Walk-in interview options, immediate hiring, fresh graduate friendly.',
  },
  '/jobs-in-cyberjaya': {
    title: 'Jobs in Cyberjaya — Tech & BPO Hiring | DNJ Careers',
    description:
      'Job vacancy in Cyberjaya. Software developer, customer service, admin and BPO roles. Hybrid and remote options. Fresh graduate friendly.',
  },
  '/jobs-in-shah-alam': {
    title: 'Jobs in Shah Alam — Latest Hiring | DNJ Careers',
    description:
      'Job vacancy in Shah Alam, Selangor. Admin, sales, finance and customer service hiring. Fresh graduate friendly. Walk-in interview options.',
  },
  '/jobs-in-subang-jaya': {
    title: 'Jobs in Subang Jaya — Latest Hiring | DNJ Careers',
    description:
      'Job vacancy in Subang Jaya and USJ. Sales, admin, finance, customer service hiring. Walk-in interview, fresh graduate friendly.',
  },

  // ----- Hire (HM-side) silo pages -----
  '/hire-pilot': {
    title: 'Hire Pilots in Malaysia — AI-Curated Aviation Talent | DNJ',
    description:
      'Hire pilots in Malaysia through AI-curated matching. Three vetted profiles per role, no CV pile. Cadet program graduates, first officers and captains. PDPA-compliant.',
  },
  '/hire-jeweler': {
    title: 'Hire Jewelers in Malaysia — Bench, Setter, Designer | DNJ',
    description:
      'Hire bench jewelers, setters, polishers and designers in Malaysia. AI-curated matching delivers three vetted profiles per role. PDPA-compliant, end-to-end encrypted.',
  },
  '/hire-diamond-grader': {
    title: 'Hire Diamond Graders in Malaysia | DNJ',
    description:
      'Hire diamond graders in Kuala Lumpur and PJ. AI-matched candidates with 4Cs expertise — cut, color, clarity, carat. Three curated profiles per role.',
  },
  '/hire-gemologist': {
    title: 'Hire Gemologists in Malaysia — GIA & Lab Talent | DNJ',
    description:
      'Hire gemologists in Malaysia. GIA / AIGS / HRD certified or graduate trainees. AI-curated matching, three profiles per role, PDPA-compliant.',
  },
  '/hire-sales-team': {
    title: 'Hire Sales Teams in Malaysia — AI-Curated Talent | DNJ',
    description:
      'Hire sales executives and sales teams in Malaysia through AI-matched curated profiles. Three matches per role, culture and trajectory scored.',
  },
  '/hire-luxury-retail-staff': {
    title: 'Hire Luxury Retail Staff in Malaysia | DNJ',
    description:
      'Hire luxury retail sales associates and boutique managers in Kuala Lumpur, PJ and Penang. AI-curated, three profiles per role, PDPA-compliant.',
  },
}

function escapeAttr(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

function injectMeta(html, route, title, description) {
  const canonical = `${BASE}${route}`
  const t = escapeAttr(title)
  const d = escapeAttr(description)
  const c = escapeAttr(canonical)
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${t}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/,       `$1${d}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/,      `$1${t}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/,`$1${d}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/,        `$1${c}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(")/,     `$1${t}$2`)
    .replace(/(<meta name="twitter:description" content=")[^"]*(")/,`$1${d}$2`)
    .replace(/(<link rel="canonical" href=")[^"]*(")/,             `$1${c}$2`)
}

const baseHtml = readFileSync(join(DIST, 'index.html'), 'utf-8')

for (const [route, { title, description }] of Object.entries(ROUTES)) {
  const html = injectMeta(baseHtml, route, title, description)
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
