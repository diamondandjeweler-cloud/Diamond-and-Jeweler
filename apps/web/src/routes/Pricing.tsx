import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSeo } from '../lib/useSeo'

const ORIGIN = 'https://diamondandjeweler.com'

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
  const { t } = useTranslation()
  useSeo({
    title: t('pricing.seoTitle'),
    description: t('pricing.seoDescription'),
    keywords: t('pricing.seoKeywords'),
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
    <div className="min-h-screen bg-white dark:bg-navy-900 text-navy-900 dark:text-white font-sans">
      <header className="border-b border-gray-100 dark:border-gray-700 dark:bg-navy-800">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2" aria-label={t('pricing.homeAria')}>
            <span className="font-extrabold tracking-tight text-[20px]">DNJ</span>
            <span className="text-[10px] tracking-[0.22em] text-gray-500 dark:text-gray-400">DIAMOND &amp; JEWELER</span>
          </Link>
          <nav className="flex items-center gap-5 text-sm" aria-label={t('pricing.navAria')}>
            <Link to="/careers" className="text-gray-600 dark:text-gray-400 hover:text-navy-900 dark:hover:text-white">{t('pricing.navJobs')}</Link>
            <Link to="/about" className="text-gray-600 dark:text-gray-400 hover:text-navy-900 dark:hover:text-white">{t('pricing.navAbout')}</Link>
            <Link to="/careers/urgent-hiring-malaysia-2026" className="text-gray-600 dark:text-gray-400 hover:text-navy-900 dark:hover:text-white">{t('pricing.navBlog')}</Link>
            <Link to="/start/talent" className="text-navy-700 dark:text-midnight-400 font-semibold underline underline-offset-4">
              {t('pricing.navApply')}
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <nav aria-label={t('pricing.breadcrumbAria')} className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          <Link to="/" className="hover:text-navy-900 dark:hover:text-white">{t('pricing.breadcrumbHome')}</Link>
          <span className="mx-2">/</span>
          <span aria-current="page" className="text-gray-700 dark:text-gray-300">{t('pricing.breadcrumbCurrent')}</span>
        </nav>

        {/* Hero */}
        <section className="text-center mb-12">
          <p className="text-gold-500 tracking-[0.3em] text-[11px] font-semibold mb-2 uppercase">{t('pricing.heroEyebrow')}</p>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight mb-3">
            {t('pricing.heroTitle')}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 max-w-xl mx-auto text-sm leading-relaxed">
            {t('pricing.heroSubtitle')}
          </p>
        </section>

        {/* Two-column pricing */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-14" aria-label={t('pricing.plansAria')}>

          {/* Talent — Free */}
          <div className="rounded-2xl ring-1 ring-midnight-100 dark:ring-midnight-700 bg-gradient-to-b from-white to-[#fafbff] dark:from-midnight-800 dark:to-navy-900 p-8 flex flex-col">
            <p className="text-[11px] font-bold tracking-[0.2em] text-gray-400 uppercase mb-2">{t('pricing.talentLabel')}</p>
            <div className="flex items-end gap-2 mb-1">
              <span className="text-4xl font-extrabold tracking-tight text-navy-900 dark:text-white">{t('pricing.talentPrice')}</span>
              <span className="text-sm text-gray-500 dark:text-gray-400 mb-1">{t('pricing.talentPriceSuffix')}</span>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">
              {t('pricing.talentBody')}
            </p>
            <ul className="space-y-2.5 flex-1 mb-8">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <li key={n} className="flex items-start gap-2.5 text-sm text-gray-700 dark:text-gray-300">
                  <span className="text-gold-500 mt-0.5 flex-shrink-0" aria-hidden>✦</span>
                  {t(`pricing.talentFeature${n}`)}
                </li>
              ))}
            </ul>
            <Link
              to="/start/talent"
              className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-navy-800 dark:bg-brand-500 text-white font-semibold text-sm hover:bg-navy-700 dark:hover:bg-[#4357d8] transition-colors"
            >
              {t('pricing.talentCta')}
            </Link>
          </div>

          {/* Hiring Manager — Enquiry */}
          <div
            className="rounded-2xl p-8 flex flex-col"
            style={{ background: 'linear-gradient(160deg,#0B1742 0%,#0B1220 100%)', border: '1px solid #5468ef33' }}
          >
            <p className="text-[11px] font-bold tracking-[0.2em] text-gold-500 uppercase mb-2">{t('pricing.hmLabel')}</p>
            <div className="flex items-end gap-2 mb-1">
              <span className="text-4xl font-extrabold tracking-tight text-white">{t('pricing.hmPrice')}</span>
              <span className="text-sm text-white/60 mb-1">{t('pricing.hmPriceSuffix')}</span>
            </div>
            <p className="text-sm text-white/75 mb-6 leading-relaxed">
              {t('pricing.hmBody')}
            </p>
            <ul className="space-y-2.5 flex-1 mb-8">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <li key={n} className="flex items-start gap-2.5 text-sm text-white/80">
                  <span className="text-gold-500 mt-0.5 flex-shrink-0" aria-hidden>✦</span>
                  {t(`pricing.hmFeature${n}`)}
                </li>
              ))}
            </ul>
            <div className="flex flex-col gap-3">
              <a
                href="mailto:support@diamondandjeweler.com?subject=Hiring%20enquiry"
                className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-gold-500 text-navy-900 font-bold text-sm hover:bg-[#d8b15a] transition-colors"
              >
                {t('pricing.hmCtaContact')}
              </a>
              <Link
                to="/start/hiring"
                className="inline-flex items-center justify-center px-6 py-3 rounded-xl border border-white/30 text-white text-sm font-semibold hover:bg-white/10 transition-colors"
              >
                {t('pricing.hmCtaPost')}
              </Link>
            </div>
          </div>
        </section>

        {/* Trust strip */}
        <section className="rounded-2xl bg-[#fafbff] dark:bg-midnight-800 ring-1 ring-midnight-100 dark:ring-midnight-700 px-8 py-6 mb-14">
          <ul className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center text-sm">
            {[1, 2, 3, 4].map((n) => (
              <li key={n}>
                <div className="font-semibold text-navy-900 dark:text-white text-sm leading-snug whitespace-pre-line">{t(`pricing.trust${n}Title`)}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t(`pricing.trust${n}Sub`)}</div>
              </li>
            ))}
          </ul>
        </section>

        {/* FAQ */}
        <section className="mb-14">
          <h2 className="text-xl md:text-2xl font-bold mb-6">{t('pricing.faqTitle')}</h2>
          <div className="space-y-3">
            {FAQS.map((_, i) => (
              <details key={i} className="group rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                <summary className="cursor-pointer font-semibold text-navy-900 dark:text-white list-none flex items-center justify-between">
                  <span>{t(`pricing.faq${i + 1}q`)}</span>
                  <span className="text-gray-400 group-open:rotate-45 transition-transform">+</span>
                </summary>
                <p className="text-sm text-gray-700 dark:text-gray-300 mt-2 leading-relaxed">{t(`pricing.faq${i + 1}a`)}</p>
              </details>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section
          className="rounded-2xl text-white p-8 text-center"
          style={{ background: 'radial-gradient(100% 140% at 50% 0%, #1B2A6B, #0B1742)' }}
        >
          <h2 className="text-2xl font-bold mb-2">{t('pricing.ctaTitle')}</h2>
          <p className="text-white/80 text-sm max-w-lg mx-auto mb-6 leading-relaxed">
            {t('pricing.ctaBody')}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <a
              href="mailto:support@diamondandjeweler.com?subject=Hiring%20enquiry"
              className="inline-flex items-center px-5 py-2.5 rounded-xl bg-gold-500 text-navy-900 font-bold text-sm hover:bg-[#d8b15a]"
            >
              {t('pricing.ctaEmail')}
            </a>
            <Link
              to="/start/hiring"
              className="inline-flex items-center px-5 py-2.5 rounded-xl border border-white/35 text-white text-sm font-semibold hover:bg-white/10"
            >
              {t('pricing.ctaPost')}
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-gray-100 dark:border-gray-700 mt-10 py-6 text-center text-xs text-gray-500 dark:text-gray-400 dark:bg-navy-800">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5">
          <Link to="/" className="hover:text-navy-900 dark:hover:text-white">{t('pricing.footerHome')}</Link>
          <span aria-hidden>·</span>
          <Link to="/careers" className="hover:text-navy-900 dark:hover:text-white">{t('pricing.footerJobs')}</Link>
          <span aria-hidden>·</span>
          <Link to="/about" className="hover:text-navy-900 dark:hover:text-white">{t('pricing.footerAbout')}</Link>
          <span aria-hidden>·</span>
          <Link to="/careers/urgent-hiring-malaysia-2026" className="hover:text-navy-900 dark:hover:text-white">{t('pricing.footerBlog')}</Link>
          <span aria-hidden>·</span>
          <Link to="/privacy" className="hover:text-navy-900 dark:hover:text-white">{t('pricing.footerPrivacy')}</Link>
          <span aria-hidden>·</span>
          <Link to="/terms" className="hover:text-navy-900 dark:hover:text-white">{t('pricing.footerTerms')}</Link>
          <span aria-hidden>·</span>
          <span>© 2026 DNJ</span>
        </div>
      </footer>
    </div>
  )
}
