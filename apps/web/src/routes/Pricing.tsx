import { Link } from 'react-router-dom'
import { useSeo } from '../lib/useSeo'

const ORIGIN = 'https://diamondandjeweler.com'

const TALENT_FEATURES = [
  'Create your career profile — free, always',
  'Bole AI scans roles across every industry',
  'Receive up to 3 curated matches per cycle',
  'Passive matching — no cold applications needed',
  'Candidate confidentiality until mutual interest',
  'End-to-end encrypted personal data',
  'PDPA-compliant data handling',
  'Career trajectory insights over time',
  'Early access to roles before the open market',
]

const HM_FEATURES = [
  'Post roles and receive 3 curated candidates',
  'Culture fit, skills and trajectory scoring',
  'Access to passive talent (not actively job-hunting)',
  'Hiring intelligence report with every match',
  'Candidate data PDPA-compliant, end-to-end encrypted',
  'No CV pile — only pre-screened, aligned profiles',
  'Dedicated support from the DNJ team',
  'Flexible volume: one role or a full hiring pipeline',
]

const FAQS = [
  {
    q: 'Is DNJ free for talent?',
    a: 'Yes — completely free for job seekers, always. Create your profile, let Bole match you, and receive curated opportunities at no cost.',
  },
  {
    q: 'How does hiring manager pricing work?',
    a: 'We quote per engagement based on the number of roles, seniority level, and hiring volume. Contact us and we will come back within 1 business day with a tailored proposal.',
  },
  {
    q: 'Are there placement fees or success fees?',
    a: 'Our pricing model is discussed during the initial consultation. We do not charge hidden fees — everything is agreed upfront before any matching begins.',
  },
  {
    q: 'Can I try DNJ before committing?',
    a: 'Yes. As a hiring manager, you can post one role and review the matching process before deciding on a longer engagement. Contact us to get started.',
  },
  {
    q: 'Do you offer volume discounts?',
    a: 'Yes — companies hiring for multiple roles or on an ongoing basis receive preferential rates. Speak to us about a retainer or volume arrangement.',
  },
]

export default function Pricing() {
  useSeo({
    title: 'Pricing — DNJ AI-Curated Recruitment Malaysia | Free for Talent',
    description:
      'Talent joins DNJ for free — always. Hiring managers pay per engagement with no hidden fees and no CV pile. Three curated matches per role. PDPA-compliant. Contact DNJ for a custom hiring proposal.',
    keywords:
      'DNJ pricing, recruitment platform pricing Malaysia, free job search Malaysia, AI recruitment cost, hiring manager pricing, curated recruitment fee, no placement fee recruitment Malaysia',
    canonicalPath: '/pricing',
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${ORIGIN}/` },
          { '@type': 'ListItem', position: 2, name: 'Pricing', item: `${ORIGIN}/pricing` },
        ],
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
          <nav className="flex items-center gap-5 text-sm" aria-label="Site navigation">
            <Link to="/careers" className="text-gray-600 dark:text-gray-400 hover:text-[#0B1220] dark:hover:text-white">Jobs</Link>
            <Link to="/about" className="text-gray-600 dark:text-gray-400 hover:text-[#0B1220] dark:hover:text-white">About</Link>
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
          <span aria-current="page" className="text-gray-700 dark:text-gray-300">Pricing</span>
        </nav>

        {/* Hero */}
        <section className="text-center mb-12">
          <p className="text-[#C9A24D] tracking-[0.3em] text-[11px] font-semibold mb-2 uppercase">Pricing</p>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight mb-3">
            Simple, transparent pricing
          </h1>
          <p className="text-gray-600 dark:text-gray-400 max-w-xl mx-auto text-sm leading-relaxed">
            Talent joins free — always. Hiring managers pay per engagement with no hidden fees and no CV pile.
          </p>
        </section>

        {/* Two-column pricing */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-14" aria-label="Pricing plans">

          {/* Talent — Free */}
          <div className="rounded-2xl ring-1 ring-[#e8edff] dark:ring-[#1e2d52] bg-gradient-to-b from-white to-[#fafbff] dark:from-[#0d1528] dark:to-[#0B1220] p-8 flex flex-col">
            <p className="text-[11px] font-bold tracking-[0.2em] text-gray-400 uppercase mb-2">For Talent</p>
            <div className="flex items-end gap-2 mb-1">
              <span className="text-4xl font-extrabold tracking-tight text-[#0B1220] dark:text-white">Free</span>
              <span className="text-sm text-gray-500 dark:text-gray-400 mb-1">forever</span>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">
              Create your profile once. Bole matches you passively with the right opportunities — no applications, no job-board scrolling.
            </p>
            <ul className="space-y-2.5 flex-1 mb-8">
              {TALENT_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-gray-700 dark:text-gray-300">
                  <span className="text-[#C9A24D] mt-0.5 flex-shrink-0" aria-hidden>✦</span>
                  {f}
                </li>
              ))}
            </ul>
            <Link
              to="/start/talent"
              className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-[#0B1742] dark:bg-[#5468ef] text-white font-semibold text-sm hover:bg-[#1B2A6B] dark:hover:bg-[#4357d8] transition-colors"
            >
              Create my free profile →
            </Link>
          </div>

          {/* Hiring Manager — Enquiry */}
          <div
            className="rounded-2xl p-8 flex flex-col"
            style={{ background: 'linear-gradient(160deg,#0B1742 0%,#0B1220 100%)', border: '1px solid #5468ef33' }}
          >
            <p className="text-[11px] font-bold tracking-[0.2em] text-[#C9A24D] uppercase mb-2">For Hiring Managers</p>
            <div className="flex items-end gap-2 mb-1">
              <span className="text-4xl font-extrabold tracking-tight text-white">Custom</span>
              <span className="text-sm text-white/60 mb-1">per engagement</span>
            </div>
            <p className="text-sm text-white/75 mb-6 leading-relaxed">
              Priced by role, seniority and volume. No CV pile — three curated, pre-screened profiles per role. Contact us for a tailored proposal.
            </p>
            <ul className="space-y-2.5 flex-1 mb-8">
              {HM_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-white/80">
                  <span className="text-[#C9A24D] mt-0.5 flex-shrink-0" aria-hidden>✦</span>
                  {f}
                </li>
              ))}
            </ul>
            <div className="flex flex-col gap-3">
              <a
                href="mailto:support@diamondandjeweler.com?subject=Hiring%20enquiry"
                className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-[#C9A24D] text-[#0B1220] font-bold text-sm hover:bg-[#d8b15a] transition-colors"
              >
                Contact us for pricing →
              </a>
              <Link
                to="/start/hiring"
                className="inline-flex items-center justify-center px-6 py-3 rounded-xl border border-white/30 text-white text-sm font-semibold hover:bg-white/10 transition-colors"
              >
                Post a role →
              </Link>
            </div>
          </div>
        </section>

        {/* Trust strip */}
        <section className="rounded-2xl bg-[#fafbff] dark:bg-[#0d1528] ring-1 ring-[#e8edff] dark:ring-[#1e2d52] px-8 py-6 mb-14">
          <ul className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center text-sm">
            {[
              ['No placement\nagency fees', 'Transparent pricing only'],
              ['No hidden charges', 'Everything agreed upfront'],
              ['PDPA-compliant', 'Data protected end-to-end'],
              ['Reply in 1 business day', 'Contact us anytime'],
            ].map(([title, sub]) => (
              <li key={title}>
                <div className="font-semibold text-[#0B1220] dark:text-white text-sm leading-snug whitespace-pre-line">{title}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{sub}</div>
              </li>
            ))}
          </ul>
        </section>

        {/* FAQ */}
        <section className="mb-14">
          <h2 className="text-xl md:text-2xl font-bold mb-6">Pricing FAQ</h2>
          <div className="space-y-3">
            {FAQS.map(({ q, a }) => (
              <details key={q} className="group rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                <summary className="cursor-pointer font-semibold text-[#0B1220] dark:text-white list-none flex items-center justify-between">
                  <span>{q}</span>
                  <span className="text-gray-400 group-open:rotate-45 transition-transform">+</span>
                </summary>
                <p className="text-sm text-gray-700 dark:text-gray-300 mt-2 leading-relaxed">{a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section
          className="rounded-2xl text-white p-8 text-center"
          style={{ background: 'radial-gradient(100% 140% at 50% 0%, #1B2A6B, #0B1742)' }}
        >
          <h2 className="text-2xl font-bold mb-2">Ready to find the right hire?</h2>
          <p className="text-white/80 text-sm max-w-lg mx-auto mb-6 leading-relaxed">
            Three curated candidates per role. No CV pile. No noise. Contact us for a custom proposal or post your first role today.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <a
              href="mailto:support@diamondandjeweler.com?subject=Hiring%20enquiry"
              className="inline-flex items-center px-5 py-2.5 rounded-xl bg-[#C9A24D] text-[#0B1220] font-bold text-sm hover:bg-[#d8b15a]"
            >
              Email us now →
            </a>
            <Link
              to="/start/hiring"
              className="inline-flex items-center px-5 py-2.5 rounded-xl border border-white/35 text-white text-sm font-semibold hover:bg-white/10"
            >
              Post a role
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-gray-100 dark:border-gray-700 mt-10 py-6 text-center text-xs text-gray-500 dark:text-gray-400 dark:bg-[#0B1742]">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5">
          <Link to="/" className="hover:text-[#0B1220] dark:hover:text-white">Home</Link>
          <span aria-hidden>·</span>
          <Link to="/careers" className="hover:text-[#0B1220] dark:hover:text-white">Jobs</Link>
          <span aria-hidden>·</span>
          <Link to="/about" className="hover:text-[#0B1220] dark:hover:text-white">About</Link>
          <span aria-hidden>·</span>
          <Link to="/privacy" className="hover:text-[#0B1220] dark:hover:text-white">Privacy</Link>
          <span aria-hidden>·</span>
          <Link to="/terms" className="hover:text-[#0B1220] dark:hover:text-white">Terms</Link>
          <span aria-hidden>·</span>
          <span>© 2026 DNJ</span>
        </div>
      </footer>
    </div>
  )
}
