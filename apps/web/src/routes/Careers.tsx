import { Link } from 'react-router-dom'
import { useSeo } from '../lib/useSeo'

const CAREERS_KEYWORDS =
  'jobs near me, job vacancy near me, urgent hiring near me, walk in interview, hiring immediately, apply job online, latest job vacancy, part time job near me, full time job, fresh graduate job, no experience job, immediate hiring, hiring now, walk-in interview, vacancy near me, job opening near me, now hiring, apply now, send resume, job seeking, job search, account assistant job vacancy, admin executive job vacancy, software developer job vacancy, sales executive job vacancy, graphic designer job vacancy, marketing executive job vacancy, customer service job vacancy, hr assistant job vacancy, finance job vacancy, operation job vacancy, pilot job vacancy, jeweler job vacancy, diamond expert job vacancy, luxury retail job vacancy, job vacancy in Kuala Lumpur, job vacancy in PJ, job vacancy in Penang, job vacancy in Malaysia, jobs near KL, hiring in Kuala Lumpur, hiring in Malaysia, work from home Kuala Lumpur, remote job Malaysia, part time Kuala Lumpur, full time Kuala Lumpur, fresh graduate Kuala Lumpur, no experience Kuala Lumpur, urgent, immediate, hiring now, walk-in, freshers welcome, no experience needed, same day interview, quick hiring, direct hiring, without experience, with or without experience, graduate trainee, entry level, junior level, career opportunity, looking for job, better career, career growth job, stable job, career advancement, job with promotion, good salary job, near my location, best company to work for, job satisfaction, career change, new job opportunity, job vacancy, job hiring, job opening, employment, recruitment, career, vacancy, hiring, job posting, apply online, submit resume, full time job vacancy, part time job vacancy, contract job, temporary job, internship, freelance job, remote job, hybrid job, shift job, permanent job, fresh graduate job vacancy, no experience job vacancy, internship for students, entry level job Kuala Lumpur, junior executive, trainee program, graduate trainee program, 0 experience job, spm leaver job, diploma holder job, degree holder job, diamond company hiring, jeweler career Malaysia, luxury brand job, pilot job Malaysia, aviation job vacancy, diamond grader job, jewelry designer job, sales associate luxury, retail job diamond, pilot fresh graduate, cadet pilot program, airline job Malaysia, gemologist job, jewellery shop hiring'

const ROLES: Array<{ title: string; type: string; location: string; level: string; blurb: string }> = [
  {
    title: 'Pilot — Cadet Pilot Program',
    type: 'Full time · Trainee program',
    location: 'Kuala Lumpur, Malaysia',
    level: 'Fresh graduate · No experience needed',
    blurb:
      'Cadet pilot program for fresh graduates and SPM leavers. Aviation career opportunity with structured trainee programme, career growth and promotion path. Walk-in interview for shortlisted candidates.',
  },
  {
    title: 'Airline Pilot — Experienced',
    type: 'Full time',
    location: 'Kuala Lumpur, Malaysia',
    level: 'Mid-level / Senior',
    blurb:
      'Pilot job vacancy for experienced first officers and captains. Stable job with good salary, hybrid roster options, immediate hiring for qualified applicants.',
  },
  {
    title: 'Jeweler / Diamond Grader',
    type: 'Full time · Permanent',
    location: 'Kuala Lumpur, PJ',
    level: 'Diploma holder · Degree holder',
    blurb:
      'Diamond grader and jeweler career in Malaysia. Luxury retail environment, with or without experience considered. Career advancement to gemologist and senior bench jeweler.',
  },
  {
    title: 'Gemologist',
    type: 'Full time',
    location: 'Kuala Lumpur',
    level: 'Junior to senior',
    blurb:
      'Gemologist job for graduate trainees and certified professionals. Same day interview available. Career growth job with stable salary and benefits.',
  },
  {
    title: 'Luxury Retail Sales Associate',
    type: 'Full time · Part time · Shift job',
    location: 'Kuala Lumpur, PJ, Penang',
    level: 'Entry level · No experience welcome',
    blurb:
      'Luxury retail job vacancy in Malaysia. Sales associate luxury, customer service and clienteling. Freshers welcome — quick hiring with same day interview.',
  },
  {
    title: 'Jewelry Designer',
    type: 'Full time · Hybrid',
    location: 'Kuala Lumpur',
    level: 'Diploma · Degree',
    blurb:
      'Jewelry designer job for creative talents. Hybrid job with portfolio review interview. Send resume and design portfolio to apply online.',
  },
  {
    title: 'Sales Executive',
    type: 'Full time',
    location: 'Kuala Lumpur, PJ',
    level: 'Junior · Mid-level',
    blurb:
      'Sales executive job vacancy with attractive commission and good salary. Career with promotion and clear growth path. Walk-in interview available.',
  },
  {
    title: 'Account Assistant',
    type: 'Full time · Permanent',
    location: 'Kuala Lumpur',
    level: 'SPM · Diploma · Fresh graduate',
    blurb:
      'Account assistant job vacancy for fresh graduate and SPM leaver. Stable job near you with finance career growth.',
  },
  {
    title: 'Admin Executive',
    type: 'Full time · Hybrid',
    location: 'Kuala Lumpur, Penang',
    level: 'Junior · Mid-level',
    blurb:
      'Admin executive job vacancy with hybrid work options. Apply online today — immediate hiring for shortlisted applicants.',
  },
  {
    title: 'Software Developer',
    type: 'Full time · Remote · Hybrid',
    location: 'Malaysia (remote-friendly)',
    level: 'Junior · Mid · Senior',
    blurb:
      'Software developer job vacancy. Work from home Kuala Lumpur option. Remote job Malaysia for the right candidate. Apply now and send resume.',
  },
  {
    title: 'Graphic Designer',
    type: 'Full time · Freelance',
    location: 'Kuala Lumpur',
    level: 'Junior · Mid-level',
    blurb:
      'Graphic designer job vacancy with full time and freelance options. Career change friendly — show portfolio, submit resume online.',
  },
  {
    title: 'Marketing Executive',
    type: 'Full time',
    location: 'Kuala Lumpur',
    level: 'Junior · Mid-level',
    blurb:
      'Marketing executive job vacancy for diploma and degree holders. Career growth job with promotion path and new job opportunity in luxury brand marketing.',
  },
  {
    title: 'Customer Service',
    type: 'Full time · Shift job',
    location: 'Kuala Lumpur',
    level: 'Entry level',
    blurb:
      'Customer service job vacancy with no experience job opportunity. Direct hiring with quick hiring process. Walk-in interview daily.',
  },
  {
    title: 'HR Assistant',
    type: 'Full time',
    location: 'Kuala Lumpur',
    level: 'Junior · Mid-level',
    blurb:
      'HR assistant job vacancy. Career opportunity in human resources with mentorship and recruitment exposure.',
  },
  {
    title: 'Finance / Operation',
    type: 'Full time',
    location: 'Kuala Lumpur',
    level: 'Junior · Mid · Senior',
    blurb:
      'Finance job vacancy and operation job vacancy. Stable job with good salary, career advancement and job satisfaction.',
  },
  {
    title: 'Internship — Students',
    type: 'Internship · Part time',
    location: 'Kuala Lumpur',
    level: 'Internship for students',
    blurb:
      'Internship for students across pilot, jewelry, design, marketing and tech tracks. Stipend provided. New job opportunity converts to full time for top performers.',
  },
]

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: 'Is DNJ hiring immediately in Malaysia?',
    a: 'Yes — DNJ has urgent hiring for pilot, diamond and jeweler, sales executive, admin executive, account assistant, finance, marketing, customer service and graphic designer roles across Kuala Lumpur, PJ and Penang. Walk-in interview options and same day interview available.',
  },
  {
    q: 'Do I need experience to apply?',
    a: 'No experience needed for many roles. We welcome fresh graduates, SPM leavers, diploma holders and degree holders. Cadet pilot program and luxury retail trainee programme accept candidates with 0 experience.',
  },
  {
    q: 'Where can I find job vacancy near me?',
    a: 'Browse this Careers page or visit /job-vacancy for the latest job vacancy near you in Kuala Lumpur, PJ, Penang and across Malaysia. Apply online, send resume, and get matched with hiring companies through AI-powered curated matching.',
  },
  {
    q: 'Are part time, remote and hybrid jobs available?',
    a: 'Yes. DNJ lists full time, part time, contract, temporary, internship, freelance, remote, hybrid, shift and permanent jobs in Malaysia.',
  },
  {
    q: 'How quickly can I get an interview?',
    a: 'For urgent hiring roles, same day interview and walk-in interview are available. For curated matches, expect quick hiring with three matches at a time and zero noise.',
  },
]

export default function Careers() {
  useSeo({
    title: 'Careers — Job Vacancy Malaysia | Pilot, Diamond & Jeweler Hiring Now',
    description:
      'Latest job vacancy near me in Malaysia. Apply online for pilot, diamond grader, jeweler, gemologist, sales executive, admin executive, software developer, graphic designer, marketing, finance, customer service and fresh graduate roles. Walk-in interview, immediate hiring.',
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
        about: 'Urgent hiring in Kuala Lumpur, PJ, Penang and across Malaysia',
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
    <div className="min-h-screen bg-white text-[#0B1220] font-sans">
      <header className="border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2" aria-label="DNJ home">
            <span className="font-extrabold tracking-tight text-[20px]">DNJ</span>
            <span className="text-[10px] tracking-[0.22em] text-gray-500">DIAMOND &amp; JEWELER</span>
          </Link>
          <nav aria-label="Primary" className="text-sm">
            <Link to="/start/talent" className="text-[#1B2A6B] font-semibold underline underline-offset-4">
              Apply now
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <nav aria-label="Breadcrumb" className="text-xs text-gray-500 mb-4">
          <Link to="/" className="hover:text-[#0B1220]">Home</Link>
          <span className="mx-2">/</span>
          <span aria-current="page" className="text-gray-700">Careers</span>
        </nav>

        <section>
          <p className="text-[#C9A24D] tracking-[0.3em] text-[11px] font-semibold mb-2">
            URGENT HIRING · MALAYSIA
          </p>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight mb-3">
            Job Vacancy Malaysia — Pilot, Diamond &amp; Jeweler Hiring Now
          </h1>
          <p className="text-gray-600 max-w-3xl leading-relaxed">
            Looking for a job near you? DNJ Careers lists the latest job vacancy in Kuala Lumpur,
            Petaling Jaya, Penang and across Malaysia. Apply job online, send resume, and meet hiring
            companies through AI-curated matches — three matches, zero noise. Walk-in interview and
            same day interview available for urgent hiring roles. Fresh graduates, SPM leavers, diploma
            and degree holders welcome — no experience needed for selected positions including the
            cadet pilot program and luxury retail trainee programme.
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
          <h2 className="text-xl md:text-2xl font-bold mb-4">Open job vacancies</h2>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ROLES.map((r) => (
              <li
                key={r.title}
                className="rounded-xl border border-gray-200 bg-white p-5 hover:border-[#0B1742] transition-colors"
              >
                <h3 className="text-base font-semibold text-[#0B1220]">{r.title}</h3>
                <p className="text-xs text-gray-500 mt-1">
                  {r.type} · {r.location} · {r.level}
                </p>
                <p className="text-sm text-gray-700 mt-2 leading-snug">{r.blurb}</p>
                <Link
                  to="/start/talent"
                  className="inline-flex items-center mt-3 text-sm font-semibold text-[#1B2A6B] hover:text-[#0B1220]"
                >
                  Apply online →
                </Link>
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
          <h2 className="text-2xl font-bold mb-2">Apply online — quick hiring, same day interview</h2>
          <p className="text-white/85 max-w-2xl mx-auto leading-relaxed">
            Submit resume in minutes and get matched with the right hiring company. New job
            opportunity, career growth, good salary and stable job — all near your location.
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
            Jobs near me · Job vacancy near me · Urgent hiring near me · Walk in interview · Hiring
            immediately · Apply job online · Latest job vacancy · Part time job near me · Full time
            job · Fresh graduate job · No experience job · Immediate hiring · Hiring now · Pilot job
            vacancy · Cadet pilot program · Aviation job vacancy · Jeweler job vacancy · Diamond
            expert job vacancy · Gemologist job · Luxury retail job vacancy · Sales executive job
            vacancy · Account assistant job vacancy · Admin executive job vacancy · Software
            developer job vacancy · Graphic designer job vacancy · Marketing executive job vacancy ·
            Customer service job vacancy · HR assistant job vacancy · Finance job vacancy · Operation
            job vacancy · Job vacancy in Kuala Lumpur · Job vacancy in PJ · Job vacancy in Penang ·
            Job vacancy in Malaysia · Jobs near KL · Hiring in Kuala Lumpur · Hiring in Malaysia ·
            Work from home Kuala Lumpur · Remote job Malaysia · Internship · Internship for students
            · Graduate trainee program · Diploma holder job · SPM leaver job · 0 experience job ·
            Career opportunity · Career growth job · Career advancement · Job with promotion · Good
            salary job · Stable job · Best company to work for
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
