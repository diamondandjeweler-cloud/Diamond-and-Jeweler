import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSeo } from '../lib/useSeo'

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
  const { t } = useTranslation()
  useSeo({
    title: t('careers.seoTitle'),
    description: t('careers.seoDescription'),
    keywords: t('careers.seoKeywords'),
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
    <div className="min-h-screen bg-white dark:bg-navy-900 text-navy-900 dark:text-white font-sans">
      <header className="border-b border-border dark:bg-navy-800">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2" aria-label={t('careers.homeAria')}>
            <span className="font-extrabold tracking-tight text-[20px]">DNJ</span>
            <span className="text-[10px] tracking-[0.22em] text-fg-muted">DIAMOND &amp; JEWELER</span>
          </Link>
          <nav aria-label={t('careers.navPrimaryAria')} className="flex items-center gap-5 text-sm">
            <Link to="/pricing" className="text-fg-muted hover:text-navy-900 dark:hover:text-white">{t('careers.navPricing')}</Link>
            <Link to="/about" className="text-fg-muted hover:text-navy-900 dark:hover:text-white">{t('careers.navAbout')}</Link>
            <Link to="/careers/urgent-hiring-malaysia-2026" className="text-fg-muted hover:text-navy-900 dark:hover:text-white">{t('careers.navBlog')}</Link>
            <Link to="/start/talent" className="text-navy-700 dark:text-midnight-400 font-semibold underline underline-offset-4">
              {t('careers.navApply')}
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <nav aria-label={t('careers.breadcrumbAria')} className="text-xs text-fg-muted mb-4">
          <Link to="/" className="hover:text-navy-900 dark:hover:text-white">{t('careers.breadcrumbHome')}</Link>
          <span className="mx-2">/</span>
          <span aria-current="page" className="text-gray-700 dark:text-fg-strong">{t('careers.breadcrumbCurrent')}</span>
        </nav>

        <section>
          <p className="text-gold-500 tracking-[0.3em] text-[11px] font-semibold mb-2">
            {t('careers.heroEyebrow')}
          </p>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight mb-3">
            {t('careers.heroTitle')}
          </h1>
          <p className="text-gray-600 max-w-3xl leading-relaxed">
            {t('careers.heroBody')}
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/start/talent"
              className="inline-flex items-center px-5 py-2.5 rounded-xl bg-navy-800 text-white text-sm font-semibold shadow hover:bg-navy-700"
            >
              {t('careers.heroCtaTalent')}
            </Link>
            <Link
              to="/start/hiring"
              className="inline-flex items-center px-5 py-2.5 rounded-xl border border-gray-300 text-sm font-semibold hover:border-navy-800"
            >
              {t('careers.heroCtaHiring')}
            </Link>
          </div>
        </section>

        <section className="mt-12">
          <p className="text-gold-500 tracking-[0.3em] text-[11px] font-semibold mb-2">
            {t('careers.whyEyebrow')}
          </p>
          <h2 className="text-xl md:text-2xl font-bold mb-4">{t('careers.whyTitle')}</h2>
          <p className="text-gray-700 leading-relaxed max-w-3xl mb-6">
            {t('careers.whyBody')}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="rounded-2xl ring-1 ring-midnight-100 bg-gradient-to-b from-white to-[#fafbff] p-6">
              <h3 className="font-bold text-navy-900 mb-1">{t('careers.talentCardTitle')}</h3>
              <p className="text-xs text-gray-500 mb-3">{t('careers.talentCardSub')}</p>
              <ul className="text-sm text-gray-700 space-y-2 leading-snug list-disc pl-5">
                <li><strong>{t('careers.talentBullet1Strong')}</strong>{t('careers.talentBullet1Trail')}</li>
                <li><strong>{t('careers.talentBullet2Strong')}</strong>{t('careers.talentBullet2Trail')}</li>
                <li>{t('careers.talentBullet3')}</li>
                <li>{t('careers.talentBullet4Lead')}<strong>{t('careers.talentBullet4Strong')}</strong>{t('careers.talentBullet4Trail')}</li>
                <li>{t('careers.talentBullet5')}</li>
                <li>{t('careers.talentBullet6')}</li>
                <li>{t('careers.talentBullet7Lead')}<strong>{t('careers.talentBullet7Strong')}</strong></li>
                <li>{t('careers.talentBullet8')}</li>
                <li>{t('careers.talentBullet9')}</li>
              </ul>
              <Link
                to="/start/talent"
                className="inline-flex items-center mt-4 text-sm font-semibold text-navy-700 hover:text-navy-900"
              >
                {t('careers.talentCta')}
              </Link>
            </div>

            <div className="rounded-2xl ring-1 ring-midnight-100 bg-gradient-to-b from-white to-[#fafbff] p-6">
              <h3 className="font-bold text-navy-900 mb-1">{t('careers.hmCardTitle')}</h3>
              <p className="text-xs text-gray-500 mb-3">{t('careers.hmCardSub')}</p>
              <ul className="text-sm text-gray-700 space-y-2 leading-snug list-disc pl-5">
                <li><strong>{t('careers.hmBullet1Strong')}</strong>{t('careers.hmBullet1Trail')}</li>
                <li>{t('careers.hmBullet2Lead')}<strong>{t('careers.hmBullet2Strong')}</strong>{t('careers.hmBullet2Trail')}</li>
                <li>{t('careers.hmBullet3')}</li>
                <li>{t('careers.hmBullet4Lead')}<strong>{t('careers.hmBullet4Strong')}</strong>{t('careers.hmBullet4Trail')}</li>
                <li>{t('careers.hmBullet5')}</li>
                <li>{t('careers.hmBullet6')}</li>
                <li><strong>{t('careers.hmBullet7Strong')}</strong>{t('careers.hmBullet7Trail')}</li>
                <li>{t('careers.hmBullet8')}</li>
                <li>{t('careers.hmBullet9')}</li>
              </ul>
              <Link
                to="/start/hiring"
                className="inline-flex items-center mt-4 text-sm font-semibold text-navy-700 hover:text-navy-900"
              >
                {t('careers.hmCta')}
              </Link>
            </div>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-xl md:text-2xl font-bold mb-4">{t('careers.rolesTitle')}</h2>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ROLES.map((r) => {
              const rk = r.slug ?? 'internship-students'
              return (
              <li
                key={r.title}
                className="rounded-xl border border-border bg-white dark:bg-midnight-800 p-5 hover:border-navy-800 dark:hover:border-brand-500 transition-colors group"
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h3 className="text-base font-semibold text-navy-900 dark:text-white">{t(`careers.roles.${rk}.title`)}</h3>
                  {/* Salary — #audit #4: visible salary ranges */}
                  <span className="flex-shrink-0 text-xs font-semibold text-[#0B6B3F] bg-[#ecfdf5] border border-[#86efac]/50 px-2 py-0.5 rounded-full whitespace-nowrap">
                    {t(`careers.roles.${rk}.salary`)}
                  </span>
                </div>
                <p className="text-xs text-fg-muted">
                  {t(`careers.roles.${rk}.type`)} · {t(`careers.roles.${rk}.location`)} · {t(`careers.roles.${rk}.level`)}
                </p>
                <p className="text-sm text-gray-700 dark:text-fg-strong mt-2 leading-snug">{t(`careers.roles.${rk}.blurb`)}</p>
                <div className="mt-3 flex items-center gap-4">
                  {r.slug && (
                    <Link
                      to={`/jobs/${r.slug}`}
                      className="inline-flex items-center text-sm text-fg-muted hover:text-navy-900 dark:hover:text-white"
                    >
                      {t('careers.viewRole')}
                    </Link>
                  )}
                  <Link
                    to="/start/talent"
                    className="inline-flex items-center text-sm font-semibold text-navy-700 dark:text-midnight-400 hover:text-navy-900 dark:hover:text-white"
                  >
                    {t('careers.applyNow')}
                  </Link>
                </div>
              </li>
              )
            })}
          </ul>
        </section>

        <section className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="rounded-xl bg-[#fafbff] ring-1 ring-midnight-100 p-5">
            <h2 className="font-semibold text-navy-900 mb-2">{t('careers.locationsTitle')}</h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              {t('careers.locationsBody')}
            </p>
          </div>
          <div className="rounded-xl bg-[#fafbff] ring-1 ring-midnight-100 p-5">
            <h2 className="font-semibold text-navy-900 mb-2">{t('careers.jobTypesTitle')}</h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              {t('careers.jobTypesBody')}
            </p>
          </div>
          <div className="rounded-xl bg-[#fafbff] ring-1 ring-midnight-100 p-5">
            <h2 className="font-semibold text-navy-900 mb-2">{t('careers.whoTitle')}</h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              {t('careers.whoBody')}
            </p>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-xl md:text-2xl font-bold mb-4">{t('careers.faqTitle')}</h2>
          <div className="space-y-3">
            {FAQS.map((_, i) => (
              <details key={i} className="group rounded-lg border border-gray-200 p-4">
                <summary className="cursor-pointer font-semibold text-navy-900 list-none flex items-center justify-between">
                  <span>{t(`careers.faq${i + 1}q`)}</span>
                  <span className="text-gray-400 group-open:rotate-45 transition-transform">+</span>
                </summary>
                <p className="text-sm text-gray-700 mt-2 leading-relaxed">{t(`careers.faq${i + 1}a`)}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mt-12 rounded-2xl bg-gradient-to-br from-navy-800 to-navy-700 text-white p-8 text-center">
          <h2 className="text-2xl font-bold mb-2">{t('careers.ctaTitle')}</h2>
          <p className="text-white/85 max-w-2xl mx-auto leading-relaxed">
            {t('careers.ctaBody')}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link
              to="/start/talent"
              className="inline-flex items-center px-5 py-2.5 rounded-xl bg-white text-navy-800 text-sm font-semibold hover:bg-gray-100"
            >
              {t('careers.ctaApply')}
            </Link>
            <Link
              to="/careers/urgent-hiring-malaysia-2026"
              className="inline-flex items-center px-5 py-2.5 rounded-xl border border-white/40 text-white text-sm font-semibold hover:bg-white/10"
            >
              {t('careers.ctaBlog')}
            </Link>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-base font-semibold text-navy-900 mb-2">{t('careers.popularTitle')}</h2>
          <p className="text-xs text-gray-500 leading-relaxed">
            {t('careers.popularBody')}
          </p>
          <p className="text-[10px] text-gray-400 mt-3 italic">
            {t('careers.disclaimer')}
          </p>
        </section>
      </main>

      <footer className="border-t border-gray-100 mt-10 py-6 text-center text-xs text-gray-500">
        <Link to="/" className="hover:text-navy-900">{t('careers.footerHome')}</Link>
        <span className="mx-2">·</span>
        <Link to="/privacy" className="hover:text-navy-900">{t('careers.footerPrivacy')}</Link>
        <span className="mx-2">·</span>
        <Link to="/terms" className="hover:text-navy-900">{t('careers.footerTerms')}</Link>
        <span className="mx-2">·</span>
        <span>© 2026 DNJ — Diamond &amp; Jeweler</span>
      </footer>
    </div>
  )
}
