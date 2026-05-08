import { Link } from 'react-router-dom'
import { useSeo } from '../lib/useSeo'

const POST_KEYWORDS =
  'urgent hiring near me, jobs near me, job vacancy near me, walk in interview, hiring immediately, apply job online, latest job vacancy 2026, part time job near me, full time job, fresh graduate job, no experience job, immediate hiring, hiring now, pilot job vacancy, jeweler job vacancy, diamond expert job vacancy, gemologist job, luxury retail job vacancy, job vacancy in Kuala Lumpur, job vacancy in PJ, job vacancy in Penang, work from home Kuala Lumpur, remote job Malaysia, fresh graduate Kuala Lumpur, no experience Kuala Lumpur, cadet pilot program, aviation job vacancy, graduate trainee program, SPM leaver job, diploma holder job, degree holder job, career opportunity, career growth job, stable job, good salary job, near my location'

const PUBLISHED = '2026-05-08'

export default function UrgentHiringPost() {
  useSeo({
    title: 'Urgent Hiring Near Me: Top Job Vacancies in Kuala Lumpur 2026',
    description:
      'Where to find urgent hiring near me in 2026. The top job vacancies in Kuala Lumpur, PJ and Penang — pilot, diamond and jeweler, sales, admin, finance, fresh graduate roles. Walk-in interview, immediate hiring, apply online today.',
    keywords: POST_KEYWORDS,
    canonicalPath: '/careers/urgent-hiring-malaysia-2026',
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://diamondandjeweler.com/' },
          { '@type': 'ListItem', position: 2, name: 'Careers', item: 'https://diamondandjeweler.com/careers' },
          {
            '@type': 'ListItem',
            position: 3,
            name: 'Urgent Hiring Near Me 2026',
            item: 'https://diamondandjeweler.com/careers/urgent-hiring-malaysia-2026',
          },
        ],
      },
      {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: 'Urgent Hiring Near Me: Top Job Vacancies in Kuala Lumpur 2026',
        description:
          'Guide to finding urgent hiring near me in Malaysia. Latest job vacancy in Kuala Lumpur, walk-in interview, immediate hiring, fresh graduate friendly roles.',
        datePublished: PUBLISHED,
        dateModified: PUBLISHED,
        inLanguage: 'en-MY',
        author: { '@type': 'Organization', name: 'DNJ — Diamond & Jeweler' },
        publisher: {
          '@type': 'Organization',
          name: 'DNJ — Diamond & Jeweler',
          logo: { '@type': 'ImageObject', url: 'https://diamondandjeweler.com/og-image.svg' },
        },
        mainEntityOfPage: 'https://diamondandjeweler.com/careers/urgent-hiring-malaysia-2026',
        about: 'Urgent hiring and job vacancy in Malaysia',
        keywords: POST_KEYWORDS,
      },
    ],
  })

  return (
    <div className="min-h-screen bg-white text-[#0B1220] font-sans">
      <header className="border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2" aria-label="DNJ home">
            <span className="font-extrabold tracking-tight text-[20px]">DNJ</span>
            <span className="text-[10px] tracking-[0.22em] text-gray-500">DIAMOND &amp; JEWELER</span>
          </Link>
          <Link to="/careers" className="text-sm text-[#1B2A6B] underline underline-offset-4">
            All careers
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        <nav aria-label="Breadcrumb" className="text-xs text-gray-500 mb-4">
          <Link to="/" className="hover:text-[#0B1220]">Home</Link>
          <span className="mx-2">/</span>
          <Link to="/careers" className="hover:text-[#0B1220]">Careers</Link>
          <span className="mx-2">/</span>
          <span aria-current="page" className="text-gray-700">Urgent Hiring Near Me 2026</span>
        </nav>

        <article>
          <p className="text-[#C9A24D] tracking-[0.3em] text-[11px] font-semibold mb-2">
            CAREERS · INSIGHTS · 2026
          </p>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">
            Urgent Hiring Near Me: Top Job Vacancies in Kuala Lumpur 2026
          </h1>
          <p className="text-xs text-gray-500 mb-6">
            Published <time dateTime={PUBLISHED}>{PUBLISHED}</time> · 6 min read
          </p>

          <p className="text-gray-700 leading-relaxed mb-4">
            Searching for <strong>urgent hiring near me</strong> in 2026? Whether you are a fresh
            graduate, SPM leaver, diploma holder or career changer, Malaysia's hiring market is moving
            fast — especially across Kuala Lumpur, Petaling Jaya (PJ) and Penang. This guide rounds
            up the latest job vacancy and walk-in interview options that are actively hiring now,
            with a focus on <strong>pilot job vacancy</strong>, <strong>diamond and jeweler
            careers</strong>, sales, admin, finance, marketing, customer service, software developer
            and graphic designer roles.
          </p>

          <h2 className="text-xl font-bold mt-8 mb-2">1. Pilot job vacancy &amp; cadet pilot program</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            Aviation hiring in Malaysia is back in a big way. The <strong>cadet pilot program</strong>
            is one of the top entry points for fresh graduates with zero experience — a structured
            graduate trainee program that takes you from classroom to airline first officer. If you
            are a degree or diploma holder with strong English and STEM aptitude, you can apply now
            and get matched with airline partners hiring immediately.
          </p>
          <p className="text-gray-700 leading-relaxed mb-3">
            Pilot fresh graduate routes typically include: cadet pilot program (no experience job),
            airline pilot trainee, and direct entry first officer for those with prior CPL/ATPL.
            Walk-in interview slots run regularly during peak hiring quarters — quick hiring with
            same day interview is common for shortlisted candidates.
          </p>

          <h2 className="text-xl font-bold mt-8 mb-2">2. Diamond &amp; jeweler career Malaysia</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            The luxury retail sector in Malaysia is a quiet powerhouse. Roles in demand: diamond
            grader, jeweler, jewelry designer, gemologist and luxury retail sales associate. These
            are stable jobs with good salary, career advancement and a clear path to senior bench
            jeweler or boutique manager. The diamond company hiring pipeline is friendly to fresh
            graduate Kuala Lumpur applicants — many openings list <em>with or without experience</em>
            considered.
          </p>
          <p className="text-gray-700 leading-relaxed mb-3">
            Jewellery shop hiring tends to favour candidates who can demonstrate attention to detail,
            customer empathy and a willingness to learn gemology. If you are looking for a new job
            opportunity with promotion potential, this is one of Malaysia's most underrated career
            growth jobs.
          </p>

          <h2 className="text-xl font-bold mt-8 mb-2">3. Sales executive, admin executive &amp; account assistant</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            For fast immediate hiring, the <strong>sales executive job vacancy</strong> and{' '}
            <strong>admin executive job vacancy</strong> categories consistently lead in volume across
            Malaysia. These roles welcome SPM leaver job seekers, diploma holder job applicants and
            degree holders — junior level and entry level positions are abundant. Account assistant
            job vacancy openings are especially strong in PJ and KL, with stable job benefits and
            career advancement.
          </p>

          <h2 className="text-xl font-bold mt-8 mb-2">4. Software developer, graphic designer &amp; marketing executive</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            Tech and creative continue to anchor remote job Malaysia and work from home Kuala Lumpur
            options. <strong>Software developer job vacancy</strong> postings often allow remote or
            hybrid arrangements. <strong>Graphic designer job vacancy</strong> and{' '}
            <strong>marketing executive job vacancy</strong> roles span freelance, contract and
            full time options. Submit resume with a portfolio link to apply online and increase your
            same-week interview chances.
          </p>

          <h2 className="text-xl font-bold mt-8 mb-2">5. Customer service, HR assistant, finance &amp; operation</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            <strong>Customer service job vacancy</strong> and <strong>HR assistant job vacancy</strong>
            roles dominate entry level urgent hiring near me searches. These are the fastest path
            into a stable job with good salary and clear promotion. Finance job vacancy and operation
            job vacancy roles offer the strongest career advancement for diploma and degree holders.
          </p>

          <h2 className="text-xl font-bold mt-8 mb-2">Where to apply online</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            DNJ (Diamond &amp; Jeweler) is a curated recruitment platform — three matches, zero noise.
            Instead of spamming you with hundreds of irrelevant openings, we use AI to match the
            right talent with the right hiring company. <Link to="/careers" className="text-[#1B2A6B] underline underline-offset-2">Browse open job vacancies</Link>{' '}
            or <Link to="/start/talent" className="text-[#1B2A6B] underline underline-offset-2">apply now as a talent</Link>.
          </p>

          <h2 className="text-xl font-bold mt-8 mb-2">Tips for landing urgent hiring roles</h2>
          <ul className="list-disc pl-5 text-gray-700 leading-relaxed space-y-1.5 mb-3">
            <li>Apply online within 24 hours of seeing a job opening near me — quick hiring favours fast applicants.</li>
            <li>Send resume in PDF, named clearly with your full name and the role.</li>
            <li>Mention if you can attend a walk-in interview or same day interview.</li>
            <li>For no experience job listings, highlight transferable skills and willingness to learn.</li>
            <li>Use precise location keywords (Kuala Lumpur, PJ, Penang, Cyberjaya, Shah Alam).</li>
          </ul>

          <h2 className="text-xl font-bold mt-8 mb-2">Final word</h2>
          <p className="text-gray-700 leading-relaxed mb-6">
            Urgent hiring is everywhere in 2026 — pilot job Malaysia, diamond company hiring, luxury
            brand jobs, software developer, sales executive, account assistant and more. The trick is
            to stop scrolling and start applying. New job opportunity, better career, career growth
            and a stable job are all closer than you think — and they're near your location.
          </p>

          <div className="rounded-2xl bg-[#0B1742] text-white p-6 text-center">
            <p className="text-base font-semibold mb-3">Ready to apply?</p>
            <Link
              to="/start/talent"
              className="inline-flex items-center px-5 py-2.5 rounded-xl bg-white text-[#0B1742] text-sm font-semibold hover:bg-gray-100"
            >
              Apply now — send resume in minutes
            </Link>
          </div>
        </article>

        <section className="mt-10 text-xs text-gray-500">
          <p className="font-semibold text-[#0B1220] mb-1">Related searches</p>
          <p className="leading-relaxed">
            Where to apply job near me · How to find urgent hiring · Company hiring immediately ·
            Walk in interview today · Part time job after work · Full time job for fresh graduate ·
            Job without experience near me · Career with growth opportunity · Stable job with good
            salary · Job near my house
          </p>
        </section>
      </main>

      <footer className="border-t border-gray-100 mt-10 py-6 text-center text-xs text-gray-500">
        <Link to="/" className="hover:text-[#0B1220]">Home</Link>
        <span className="mx-2">·</span>
        <Link to="/careers" className="hover:text-[#0B1220]">Careers</Link>
        <span className="mx-2">·</span>
        <Link to="/privacy" className="hover:text-[#0B1220]">Privacy</Link>
        <span className="mx-2">·</span>
        <Link to="/terms" className="hover:text-[#0B1220]">Terms</Link>
      </footer>
    </div>
  )
}
