import { Link } from 'react-router-dom'
import { useSeo } from '../lib/useSeo'

// Keywords meta — search-intent terms only. Removed: walk-in interview,
// same day interview, quick hiring, immediate hiring, hiring immediately,
// no experience job. DNJ does not deliver those experiences (curated
// matching is ~14-day pilot), and listing them in keywords misleads
// search intent and creates Consumer Protection Act 1999 §10 exposure.
const CAREERS_KEYWORDS =
  'jobs near me, job vacancy near me, apply job online, latest job vacancy, part time job near me, full time job, fresh graduate job, vacancy near me, job opening near me, apply now, send resume, job seeking, job search, jobs in Malaysia, recruitment Malaysia, job portal Malaysia, sales job vacancy, admin executive job vacancy, account assistant job vacancy, finance job vacancy, banking job vacancy, software developer job vacancy, IT job vacancy, engineering job vacancy, marketing executive job vacancy, graphic designer job vacancy, customer service job vacancy, hr job vacancy, healthcare job vacancy, nursing job vacancy, education job vacancy, teaching job vacancy, hospitality job vacancy, hotel job vacancy, construction job vacancy, logistics job vacancy, supply chain job, manufacturing job vacancy, production job vacancy, f&b job vacancy, restaurant job vacancy, job vacancy in Kuala Lumpur, job vacancy in PJ, job vacancy in Penang, job vacancy in Johor Bahru, job vacancy in Malaysia, jobs near KL, hiring in Kuala Lumpur, hiring in Malaysia, work from home Kuala Lumpur, remote job Malaysia, fresh graduate Kuala Lumpur, graduate trainee, entry level, junior level, career opportunity, career growth job, stable job, career advancement, new job opportunity, job vacancy, job hiring, job opening, employment, recruitment, career, vacancy, hiring, job posting, apply online, submit resume, contract job, temporary job, internship, freelance job, remote job, hybrid job, shift job, permanent job, internship for students, spm leaver job, diploma holder job, degree holder job, luxury retail job, pilot job Malaysia, cadet pilot program, jeweler job vacancy, gemologist job, ai curated matching, ai recruitment Malaysia, curated matching, three matches per role'

// #audit #3 — slug links each card to its public silo page (/jobs/[slug])
// so visitors can browse detailed role info without creating an account.
const ROLES: Array<{ title: string; type: string; location: string; level: string; blurb: string; salary: string; slug?: string }> = [
  {
    title: 'Sales Executive',
    slug: 'sales-executive',
    type: 'Full time',
    location: 'Kuala Lumpur, PJ, nationwide',
    level: 'Fresh graduate · Junior · Mid-level',
    salary: 'RM 2,800 – 6,000 base + commission',
    blurb:
      'Sales executive roles with commission and a clear growth path. Get matched directly with companies recruiting sales professionals across every industry.',
  },
  {
    title: 'Admin Executive',
    slug: 'admin-executive',
    type: 'Full time · Hybrid',
    location: 'Kuala Lumpur, PJ, nationwide',
    level: 'Fresh graduate · Junior · Mid-level',
    salary: 'RM 2,500 – 4,500',
    blurb:
      'Admin and office executive roles with hybrid options. Your profile is matched to companies hiring administrative professionals.',
  },
  {
    title: 'Account Assistant',
    slug: 'account-assistant',
    type: 'Full time · Permanent',
    location: 'Kuala Lumpur, PJ',
    level: 'SPM · Diploma · Fresh graduate',
    salary: 'RM 2,200 – 3,800',
    blurb:
      'Account assistant roles for fresh graduates and SPM leavers — a stable entry point into a finance career.',
  },
  {
    title: 'Finance & Accounting',
    slug: 'finance',
    type: 'Full time',
    location: 'Kuala Lumpur, PJ',
    level: 'Junior · Mid · Senior',
    salary: 'RM 3,500 – 10,000',
    blurb:
      'Accountant, financial analyst and finance manager roles. ACCA / CIMA-friendly employers, predictable salary progression.',
  },
  {
    title: 'Banking',
    slug: 'banking',
    type: 'Full time',
    location: 'Kuala Lumpur, PJ, Penang',
    level: 'Fresh graduate · Junior · Mid-level',
    salary: 'RM 3,000 – 8,000',
    blurb:
      'Bank officer, relationship manager, credit and operations roles. Structured career paths with strong benefits and management-trainee schemes.',
  },
  {
    title: 'Software Developer',
    slug: 'software-developer',
    type: 'Full time · Remote · Hybrid',
    location: 'Malaysia (remote-friendly)',
    level: 'Junior · Mid · Senior',
    salary: 'RM 4,000 – 15,000',
    blurb:
      'Frontend, backend and full-stack roles with remote and hybrid options. Matched by stack, culture and career goals.',
  },
  {
    title: 'Engineering',
    slug: 'engineering',
    type: 'Full time · Contract',
    location: 'KL, Shah Alam, Penang, JB',
    level: 'Fresh graduate · Junior · Senior',
    salary: 'RM 3,000 – 9,000',
    blurb:
      'Mechanical, electrical, civil, chemical and process engineering roles across manufacturing, construction, oil and gas and electronics.',
  },
  {
    title: 'Marketing Executive',
    slug: 'marketing-executive',
    type: 'Full time',
    location: 'Kuala Lumpur, PJ',
    level: 'Fresh graduate · Junior · Mid-level',
    salary: 'RM 2,800 – 6,000',
    blurb:
      'Digital, brand, content and social marketing roles. Matched with teams that fit your strengths and trajectory.',
  },
  {
    title: 'Graphic Designer',
    slug: 'graphic-designer',
    type: 'Full time · Freelance',
    location: 'Kuala Lumpur, PJ',
    level: 'Junior · Mid-level',
    salary: 'RM 2,500 – 5,500',
    blurb:
      'Brand, packaging, digital and print design roles — full time and freelance. Portfolio-first matching.',
  },
  {
    title: 'Customer Service',
    slug: 'customer-service',
    type: 'Full time · Shift',
    location: 'Kuala Lumpur, PJ, Penang',
    level: 'Fresh graduate · Entry level',
    salary: 'RM 2,200 – 3,800',
    blurb:
      'Customer service and support roles, shift and full time. Matched on communication skills and availability.',
  },
  {
    title: 'HR Assistant',
    slug: 'hr-assistant',
    type: 'Full time',
    location: 'Kuala Lumpur, PJ',
    level: 'Junior · Mid-level',
    salary: 'RM 2,500 – 4,500',
    blurb:
      'HR assistant and executive roles with recruitment, payroll and HR-ops exposure. Career path to HR manager.',
  },
  {
    title: 'Healthcare & Nursing',
    slug: 'healthcare',
    type: 'Full time · Part time · Shift',
    location: 'KL, PJ, Penang, JB',
    level: 'Fresh graduate · Experienced',
    salary: 'RM 2,500 – 7,000',
    blurb:
      'Nurse, medical assistant, pharmacy and allied-health roles in hospitals, clinics and specialist centres.',
  },
  {
    title: 'Education & Teaching',
    slug: 'education',
    type: 'Full time · Part time · Contract',
    location: 'KL, PJ, Penang, Subang',
    level: 'Fresh graduate · Experienced',
    salary: 'RM 2,500 – 6,500',
    blurb:
      'Teacher, tutor and lecturer roles across schools, colleges, universities and the private-tuition and edtech sectors.',
  },
  {
    title: 'Hospitality & Hotel',
    slug: 'hospitality',
    type: 'Full time · Part time · Shift',
    location: 'KL, Penang, JB, Subang',
    level: 'Fresh graduate · Experienced',
    salary: 'RM 2,000 – 6,000',
    blurb:
      'Front office, housekeeping, events and guest-services roles in hotels, resorts and tourism operators.',
  },
  {
    title: 'Construction',
    slug: 'construction',
    type: 'Full time · Contract',
    location: 'KL, Shah Alam, JB, PJ',
    level: 'Fresh graduate · Experienced',
    salary: 'RM 3,000 – 9,000',
    blurb:
      'Site supervisor, quantity surveyor, project and safety roles across residential, commercial and infrastructure projects.',
  },
  {
    title: 'Logistics & Supply Chain',
    slug: 'logistics',
    type: 'Full time · Contract',
    location: 'KL, Shah Alam, JB, Penang',
    level: 'Fresh graduate · Experienced',
    salary: 'RM 2,800 – 7,000',
    blurb:
      'Warehouse, procurement, shipping, fleet and planning roles — a fast-growing category fuelled by e-commerce.',
  },
  {
    title: 'Manufacturing & Production',
    slug: 'manufacturing',
    type: 'Full time · Shift · Contract',
    location: 'Penang, Shah Alam, JB',
    level: 'Fresh graduate · Experienced',
    salary: 'RM 2,500 – 6,000',
    blurb:
      'Production, QA/QC, planning and supervisor roles across electronics, semiconductor, FMCG and industrial sectors.',
  },
  {
    title: 'Food & Beverage (F&B)',
    slug: 'f-and-b',
    type: 'Full time · Part time · Shift',
    location: 'KL, PJ, Penang, Subang',
    level: 'Fresh graduate · Experienced',
    salary: 'RM 1,800 – 5,500',
    blurb:
      'Chef, kitchen, barista, service and outlet-management roles across restaurants, cafes, hotels and F&B chains.',
  },
  {
    title: 'Luxury Retail',
    slug: 'luxury-retail',
    type: 'Full time · Part time · Shift',
    location: 'Kuala Lumpur, PJ, Penang',
    level: 'Entry level · Experienced',
    salary: 'RM 2,800 – 8,000 + commission',
    blurb:
      'Sales associate, clienteling and boutique-management roles in jewelry, watches and luxury fashion.',
  },
  {
    title: 'Jeweler / Diamond Grader / Gemologist',
    slug: 'jeweler',
    type: 'Full time · Permanent',
    location: 'Kuala Lumpur, PJ',
    level: 'Diploma · Degree · Trade-certified',
    salary: 'RM 2,500 – 7,500',
    blurb:
      'Specialist jewelry-trade roles — bench jeweler, diamond grader, gemologist and jewelry designer — with GIA / HRD pathway support.',
  },
  {
    title: 'Pilot / Cadet Pilot',
    slug: 'pilot',
    type: 'Full time · Trainee program',
    location: 'Kuala Lumpur, Penang, JB',
    level: 'Fresh graduate · Experienced',
    salary: 'RM 8,000 – 25,000+',
    blurb:
      'Cadet pilot program for fresh graduates plus direct-entry roles for experienced first officers and captains.',
  },
  {
    title: 'Internship — Students',
    type: 'Internship · Part time',
    location: 'Nationwide',
    level: 'Internship for students',
    salary: 'RM 800 – 1,500 / month',
    blurb:
      'Internships across business, tech, design, engineering and more. Many convert to full time for strong performers.',
  },
]

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: 'How does DNJ hiring work in Malaysia?',
    a: 'DNJ is an AI-curated recruitment platform — not a job board and not a walk-in service. It is a general recruitment platform serving every industry, including sales, admin, finance, banking, IT and software, engineering, marketing, HR, customer service, healthcare, education, hospitality, construction, logistics, manufacturing, F&B, retail and more. Complete your profile and our AI engine reviews new talent regularly. You receive up to 3 curated matches as companies aligned to your profile are identified. Typical pilot timeline: ~14 days from profile completion.',
  },
  {
    q: 'Which industries does DNJ cover?',
    a: 'DNJ is industry-agnostic and covers the full Malaysian job market — sales, administration, finance and accounting, banking, IT and software, engineering, marketing, human resources, customer service, operations, healthcare, education, hospitality, construction, logistics and supply chain, manufacturing, F&B, retail, aviation and more. We hire for fresh graduate, junior, mid-level, senior and trainee positions.',
  },
  {
    q: 'Do I need experience to apply?',
    a: 'No experience needed for many roles. We welcome fresh graduates, SPM leavers, diploma holders and degree holders for entry-level, junior and trainee positions across every industry we serve.',
  },
  {
    q: 'Where can I find job vacancy near me?',
    a: 'Browse this Careers page for the latest job vacancy near you in Kuala Lumpur, PJ, Penang and across Malaysia. Apply online, send resume, and get matched with hiring companies through AI-powered curated matching.',
  },
  {
    q: 'Are part time, remote and hybrid jobs available?',
    a: 'Yes. DNJ lists full time, part time, contract, temporary, internship, freelance, remote, hybrid, shift and permanent jobs in Malaysia.',
  },
  {
    q: 'How quickly can I get an interview?',
    a: 'DNJ\'s curated matching typically delivers up to 3 relevant profiles within the first 14 days. Once matched and connected with a company, interview arrangements are between you and the employer — timelines vary by role and company. Our matching focuses on quality: three right fits, not a hundred applications.',
  },
]

export default function Careers() {
  useSeo({
    title: 'Careers — Job Vacancy Malaysia, All Industries | AI-Curated Recruitment | DNJ',
    description:
      'Latest job vacancy in Malaysia across every industry — sales, admin, finance, banking, IT and software, engineering, marketing, HR, customer service, healthcare, education, hospitality, construction, logistics, manufacturing, F&B and more. AI-curated matching — three picks per role, no cold CV pile.',
    keywords: CAREERS_KEYWORDS,
    canonicalPath: '/careers',
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://diamondandjeweler.com/' },
          { '@type': 'ListItem', position: 2, name: 'Careers', item: 'https://diamondandjeweler.com/careers' },
        ],
      },
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: 'DNJ Careers — Job Vacancy Malaysia',
        url: 'https://diamondandjeweler.com/careers',
        inLanguage: 'en-MY',
        about: 'Job vacancies across every industry in Kuala Lumpur, PJ, Penang, Johor Bahru and across Malaysia',
      },
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: FAQS.map(({ q, a }) => ({
          '@type': 'Question',
          name: q,
          acceptedAnswer: { '@type': 'Answer', text: a },
        })),
      },
      {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: 'Open job vacancies — DNJ Careers Malaysia',
        itemListElement: ROLES.map((r, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: r.title,
          description: r.blurb,
        })),
      },
    ],
  })

  return (
    <div className="min-h-screen bg-white dark:bg-[#0B1220] text-[#0B1220] dark:text-white font-sans">
      <header className="border-b border-gray-100 dark:border-gray-700 dark:bg-[#0B1742]">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2" aria-label="DNJ home">
            <span className="font-extrabold tracking-tight text-[20px]">DNJ</span>
            <span className="text-[10px] tracking-[0.22em] text-gray-500 dark:text-gray-400">DIAMOND &amp; JEWELER</span>
          </Link>
          <nav aria-label="Primary" className="flex items-center gap-5 text-sm">
            <Link to="/about" className="text-gray-600 dark:text-gray-400 hover:text-[#0B1220] dark:hover:text-white">About</Link>
            <Link to="/careers/urgent-hiring-malaysia-2026" className="text-gray-600 dark:text-gray-400 hover:text-[#0B1220] dark:hover:text-white">Blog</Link>
            <Link to="/start/talent" className="text-[#1B2A6B] dark:text-[#a6b6ff] font-semibold underline underline-offset-4">
              Apply now
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <nav aria-label="Breadcrumb" className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          <Link to="/" className="hover:text-[#0B1220] dark:hover:text-white">Home</Link>
          <span className="mx-2">/</span>
          <span aria-current="page" className="text-gray-700 dark:text-gray-300">Careers</span>
        </nav>

        <section>
          <p className="text-[#C9A24D] tracking-[0.3em] text-[11px] font-semibold mb-2">
            CURATED MATCHING · MALAYSIA
          </p>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight mb-3">
            Job Vacancy Malaysia — AI-Curated Matches Across Every Industry
          </h1>
          <p className="text-gray-600 max-w-3xl leading-relaxed">
            Looking for a job near you? DNJ is a general recruitment platform for Malaysia, listing
            the latest job vacancy in Kuala Lumpur, Petaling Jaya, Penang, Johor Bahru and nationwide —
            across sales, finance, banking, IT, engineering, marketing, HR, healthcare, education,
            hospitality, construction, logistics, manufacturing, F&amp;B and more. Complete your profile
            once and our AI engine matches you with hiring companies — three curated picks, zero noise,
            no cold applications. Fresh graduates, SPM leavers, diploma and degree holders all welcome.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/start/talent"
              className="inline-flex items-center px-5 py-2.5 rounded-xl bg-[#0B1742] text-white text-sm font-semibold shadow hover:bg-[#1B2A6B]"
            >
              Apply now — I'm a talent
            </Link>
            <Link
              to="/start/hiring"
              className="inline-flex items-center px-5 py-2.5 rounded-xl border border-gray-300 text-sm font-semibold hover:border-[#0B1742]"
            >
              I'm hiring — find talent
            </Link>
          </div>
        </section>

        <section className="mt-12">
          <p className="text-[#C9A24D] tracking-[0.3em] text-[11px] font-semibold mb-2">
            PRECISION RECRUITMENT · POWERED BY AI
          </p>
          <h2 className="text-xl md:text-2xl font-bold mb-4">Why DNJ — AI-curated matching, not endless scrolling</h2>
          <p className="text-gray-700 leading-relaxed max-w-3xl mb-6">
            DNJ is an AI-powered recruitment platform built for Malaysia. Our proprietary
            compatibility engine goes far beyond the résumé — multi-dimensional career analysis that
            matches the right talent with the right company. Three matches at a time. Zero noise.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="rounded-2xl ring-1 ring-[#e8edff] bg-gradient-to-b from-white to-[#fafbff] p-6">
              <h3 className="font-bold text-[#0B1220] mb-1">For talents — your career, on autopilot</h3>
              <p className="text-xs text-gray-500 mb-3">Precision recruitment, powered by AI</p>
              <ul className="text-sm text-gray-700 space-y-2 leading-snug list-disc pl-5">
                <li><strong>AI-curated matches</strong> — only roles genuinely aligned to your career profile</li>
                <li><strong>Three offers at a time</strong> — quality over volume, zero application fatigue</li>
                <li>Proprietary compatibility engine that goes far beyond the résumé</li>
                <li>Your profile works <strong>passively</strong> — no job boards, no cold applications</li>
                <li>Advanced multi-dimensional career analysis for precision employer fit</li>
                <li>Candidate confidentiality — employers see only what you choose to share</li>
                <li>End-to-end encrypted personal data, fully <strong>PDPA-compliant</strong></li>
                <li>Early visibility into roles before they reach the open market</li>
                <li>Personalised career trajectory insights delivered over time</li>
              </ul>
              <Link
                to="/start/talent"
                className="inline-flex items-center mt-4 text-sm font-semibold text-[#1B2A6B] hover:text-[#0B1220]"
              >
                Apply as a talent →
              </Link>
            </div>

            <div className="rounded-2xl ring-1 ring-[#e8edff] bg-gradient-to-b from-white to-[#fafbff] p-6">
              <h3 className="font-bold text-[#0B1220] mb-1">For hiring managers — find the right hire, not just any hire</h3>
              <p className="text-xs text-gray-500 mb-3">AI-matched candidates · zero CV pile</p>
              <ul className="text-sm text-gray-700 space-y-2 leading-snug list-disc pl-5">
                <li><strong>AI-matched candidates</strong> — only talent genuinely aligned to your requirements</li>
                <li>Receive up to <strong>three curated profiles per role</strong> — no CV pile, no noise</li>
                <li>Proprietary compatibility engine that scores culture fit, trajectory, and compensation</li>
                <li>Access <strong>passive talent</strong> — your next hire may not be actively job-hunting</li>
                <li>Multi-dimensional analysis: skills, culture alignment, career goals</li>
                <li>Full candidate confidentiality until mutual interest is confirmed</li>
                <li><strong>PDPA-compliant</strong> data handling with end-to-end encryption</li>
                <li>Early access to talent before they reach the open market</li>
                <li>Hiring intelligence reports delivered with every match</li>
              </ul>
              <Link
                to="/start/hiring"
                className="inline-flex items-center mt-4 text-sm font-semibold text-[#1B2A6B] hover:text-[#0B1220]"
              >
                Hire with DNJ →
              </Link>
            </div>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-xl md:text-2xl font-bold mb-4">Open job vacancies</h2>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ROLES.map((r) => (
              <li
                key={r.title}
                className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#0d1528] p-5 hover:border-[#0B1742] dark:hover:border-[#5468ef] transition-colors group"
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h3 className="text-base font-semibold text-[#0B1220] dark:text-white">{r.title}</h3>
                  {/* Salary — #audit #4: visible salary ranges */}
                  <span className="flex-shrink-0 text-xs font-semibold text-[#0B6B3F] bg-[#ecfdf5] border border-[#86efac]/50 px-2 py-0.5 rounded-full whitespace-nowrap">
                    {r.salary}
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {r.type} · {r.location} · {r.level}
                </p>
                <p className="text-sm text-gray-700 dark:text-gray-300 mt-2 leading-snug">{r.blurb}</p>
                <div className="mt-3 flex items-center gap-4">
                  {r.slug && (
                    <Link
                      to={`/jobs/${r.slug}`}
                      className="inline-flex items-center text-sm text-gray-500 dark:text-gray-400 hover:text-[#0B1220] dark:hover:text-white"
                    >
                      View role →
                    </Link>
                  )}
                  <Link
                    to="/start/talent"
                    className="inline-flex items-center text-sm font-semibold text-[#1B2A6B] dark:text-[#a6b6ff] hover:text-[#0B1220] dark:hover:text-white"
                  >
                    Apply now →
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="rounded-xl bg-[#fafbff] ring-1 ring-[#e8edff] p-5">
            <h2 className="font-semibold text-[#0B1220] mb-2">Locations we hire in</h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              Kuala Lumpur · Petaling Jaya (PJ) · Penang · Selangor · Johor Bahru · Cyberjaya ·
              Putrajaya · Shah Alam. Work from home Kuala Lumpur and remote job Malaysia options for
              selected roles.
            </p>
          </div>
          <div className="rounded-xl bg-[#fafbff] ring-1 ring-[#e8edff] p-5">
            <h2 className="font-semibold text-[#0B1220] mb-2">Job types</h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              Full time job · Part time job · Contract job · Temporary job · Internship · Freelance
              job · Remote job · Hybrid job · Shift job · Permanent job. Apply now and send resume.
            </p>
          </div>
          <div className="rounded-xl bg-[#fafbff] ring-1 ring-[#e8edff] p-5">
            <h2 className="font-semibold text-[#0B1220] mb-2">Who we hire</h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              Fresh graduate, SPM leaver, diploma holder, degree holder, junior executive, mid-level
              and senior. With or without experience considered. Career change friendly. Best company
              to work for in luxury and aviation hiring.
            </p>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-xl md:text-2xl font-bold mb-4">Frequently asked questions</h2>
          <div className="space-y-3">
            {FAQS.map(({ q, a }) => (
              <details key={q} className="group rounded-lg border border-gray-200 p-4">
                <summary className="cursor-pointer font-semibold text-[#0B1220] list-none flex items-center justify-between">
                  <span>{q}</span>
                  <span className="text-gray-400 group-open:rotate-45 transition-transform">+</span>
                </summary>
                <p className="text-sm text-gray-700 mt-2 leading-relaxed">{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mt-12 rounded-2xl bg-gradient-to-br from-[#0B1742] to-[#1B2A6B] text-white p-8 text-center">
          <h2 className="text-2xl font-bold mb-2">Apply online — AI-curated matches, three picks, zero noise</h2>
          <p className="text-white/85 max-w-2xl mx-auto leading-relaxed">
            Complete your profile in minutes and let the AI match you with the right hiring company.
            Career growth, good salary and stable job — curated to your location, skills, and goals.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link
              to="/start/talent"
              className="inline-flex items-center px-5 py-2.5 rounded-xl bg-white text-[#0B1742] text-sm font-semibold hover:bg-gray-100"
            >
              Apply now
            </Link>
            <Link
              to="/careers/urgent-hiring-malaysia-2026"
              className="inline-flex items-center px-5 py-2.5 rounded-xl border border-white/40 text-white text-sm font-semibold hover:bg-white/10"
            >
              Read: Urgent Hiring Near Me 2026
            </Link>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-base font-semibold text-[#0B1220] mb-2">Popular searches</h2>
          <p className="text-xs text-gray-500 leading-relaxed">
            Jobs near me · Job vacancy near me · Apply job online · Latest job vacancy · Part time
            job near me · Full time job · Fresh graduate job · Pilot job vacancy · Cadet pilot
            program · Aviation job vacancy · Jeweler job vacancy · Diamond grader job · Gemologist
            job · Luxury retail job vacancy · Sales executive job vacancy · Account assistant job
            vacancy · Admin executive job vacancy · Software developer job vacancy · Graphic
            designer job vacancy · Marketing executive job vacancy · Customer service job vacancy ·
            HR assistant job vacancy · Finance job vacancy · Operation job vacancy · Job vacancy in
            Kuala Lumpur · Job vacancy in PJ · Job vacancy in Penang · Job vacancy in Malaysia ·
            Jobs near KL · Hiring in Kuala Lumpur · Hiring in Malaysia · Work from home Kuala
            Lumpur · Remote job Malaysia · Internship · Internship for students · Graduate trainee
            program · Diploma holder job · SPM leaver job · Career opportunity · Career growth job ·
            Career advancement · Job with promotion · Good salary job · Stable job · Best company
            to work for
          </p>
          <p className="text-[10px] text-gray-400 mt-3 italic">
            DNJ does not run walk-in interviews or same-day hiring. We curate up to three matches
            per role; typical pilot timeline is around 14 days from profile completion. Interviews
            are arranged directly between you and the matched company.
          </p>
        </section>
      </main>

      <footer className="border-t border-gray-100 mt-10 py-6 text-center text-xs text-gray-500">
        <Link to="/" className="hover:text-[#0B1220]">Home</Link>
        <span className="mx-2">·</span>
        <Link to="/privacy" className="hover:text-[#0B1220]">Privacy</Link>
        <span className="mx-2">·</span>
        <Link to="/terms" className="hover:text-[#0B1220]">Terms</Link>
        <span className="mx-2">·</span>
        <span>© 2026 DNJ — Diamond &amp; Jeweler</span>
      </footer>
    </div>
  )
}
