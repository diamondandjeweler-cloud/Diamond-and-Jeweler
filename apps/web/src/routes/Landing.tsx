import { Link, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSession } from '../state/useSession'
import { useShallow } from 'zustand/react/shallow'
import { useSeo } from '../lib/useSeo'
import { ROLES, LOCATIONS, ROLE_SLUGS, LOCATION_SLUGS } from '../data/silo-data'
import DarkModeToggle from '../components/DarkModeToggle'
import {
  BackgroundDecor,
  BrandMark,
  DiamondIllustration,
  MagnifierIllustration,
  ShieldIcon,
  Arrow,
} from './landing/svg'
import { DecisionCard, OrDivider, PopularSearches } from './landing/Hero'
import {
  TrustStrip,
  HowItWorksSection,
  VideoSection,
  SocialProofStrip,
  BoleSection,
  PassiveTalentSection,
  ReferralSection,
  WhatsAppCTA,
} from './landing/sections'

const ORIGIN = 'https://diamondandjeweler.com'

// Build crawler-visible JSON-LD that mirrors every silo URL we publish.
// Massive ItemList + OccupationalCategory entries + extended FAQ — zero visual impact.
const HOMEPAGE_JSON_LD: Record<string, unknown>[] = [
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'DNJ',
    alternateName: ['DNJ Recruitment', 'DNJ Careers'],
    url: ORIGIN,
    description:
      'DNJ is an AI-powered curated recruitment platform for Malaysia. A general recruitment platform serving every industry — sales, admin, finance, marketing, IT, software, HR, customer service, operations, retail, hospitality, engineering, education, healthcare, banking, manufacturing, logistics, F&B, aviation and luxury retail. Three curated matches at a time, zero noise.',
    knowsAbout: [
      'AI-powered recruitment',
      'Curated talent matching',
      'General recruitment Malaysia',
      'Multi-industry hiring',
      'Sales recruitment',
      'Admin and finance recruitment',
      'IT and software recruitment',
      'Marketing recruitment',
      'HR recruitment',
      'Customer service recruitment',
      'Operations recruitment',
      'Retail and hospitality recruitment',
      'Engineering recruitment',
      'Healthcare and education recruitment',
      'Banking and insurance recruitment',
      'Manufacturing and logistics recruitment',
      'Aviation recruitment',
      'Luxury retail recruitment',
    ],
    areaServed: { '@type': 'Country', name: 'Malaysia' },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Roles available on DNJ — AI-curated recruitment Malaysia',
    description:
      'Examples of roles DNJ recruits for. DNJ is a general recruitment platform — these are a sample of the many positions matched through our AI-curated compatibility engine, not the entire scope.',
    itemListOrder: 'https://schema.org/ItemListOrderDescending',
    numberOfItems: ROLE_SLUGS.length,
    itemListElement: ROLE_SLUGS.map((slug, i) => {
      const r = ROLES[slug]
      return {
        '@type': 'ListItem',
        position: i + 1,
        item: {
          '@type': 'Occupation',
          name: r.name,
          description: r.description,
          url: `${ORIGIN}/jobs/${slug}`,
          occupationalCategory: r.occupationalCategory,
          industry: r.industry,
          occupationLocation: r.locations.map((locSlug) => ({
            '@type': 'Place',
            address: {
              '@type': 'PostalAddress',
              addressLocality: LOCATIONS[locSlug]?.name,
              addressRegion: LOCATIONS[locSlug]?.state,
              addressCountry: 'MY',
            },
          })),
        },
      }
    }),
  },
  {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Hiring locations on DNJ — Malaysia',
    numberOfItems: LOCATION_SLUGS.length,
    itemListElement: LOCATION_SLUGS.map((slug, i) => {
      const l = LOCATIONS[slug]
      return {
        '@type': 'ListItem',
        position: i + 1,
        item: {
          '@type': 'Place',
          name: l.name,
          alternateName: l.shortName,
          url: `${ORIGIN}/jobs-in-${slug}`,
          address: {
            '@type': 'PostalAddress',
            addressLocality: l.name,
            addressRegion: l.state,
            addressCountry: 'MY',
          },
          geo: {
            '@type': 'GeoCoordinates',
            latitude: l.geo.lat,
            longitude: l.geo.lng,
          },
        },
      }
    }),
  },
  {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'What is DNJ?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'DNJ is an AI-powered curated recruitment platform for Malaysia. It is a general recruitment platform serving every industry — including sales, admin, finance, marketing, IT and software, HR, customer service, operations, retail, hospitality, engineering, education, healthcare, banking, manufacturing, logistics, F&B, aviation and luxury retail. DNJ delivers up to three curated matches per role through a proprietary compatibility engine — quality over volume, zero noise.',
        },
      },
      {
        '@type': 'Question',
        name: 'Which industries does DNJ cover?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'DNJ is industry-agnostic and covers the full Malaysian job market — sales, administration, finance and accounting, marketing, IT and software, human resources, customer service, operations, retail, hospitality, engineering, healthcare, education, banking, insurance, e-commerce, manufacturing, logistics, F&B, aviation and luxury retail. We hire for fresh graduate, junior, mid-level, senior and trainee positions.',
        },
      },
      {
        '@type': 'Question',
        name: 'How does AI matching work on DNJ?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'DNJ uses a proprietary compatibility engine that scores skills, culture fit, career trajectory and compensation alignment beyond the résumé. Candidates and hiring managers each receive up to three curated matches per role — quality over volume, zero noise. Personal data is end-to-end encrypted and PDPA-compliant.',
        },
      },
      {
        '@type': 'Question',
        name: 'Is DNJ a recruitment agency?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'No. DNJ is an AI-curated recruitment platform, not a traditional agency. We match talent directly with hiring companies — passive talent included — without the CV pile or noise. Three matches at a time.',
        },
      },
      {
        '@type': 'Question',
        name: 'Do I need experience to apply?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'No experience needed for many roles. Fresh graduates, SPM leavers, diploma and degree holders are welcome for entry-level, junior and trainee positions across every industry we serve.',
        },
      },
      {
        '@type': 'Question',
        name: 'How is candidate confidentiality protected?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Employers see only what you choose to share until mutual interest is confirmed. Personal data is end-to-end encrypted, PDPA-compliant, and you control your visibility on the platform.',
        },
      },
      {
        '@type': 'Question',
        name: 'Can I apply for jobs without a resume on DNJ?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes. DNJ\'s career profile goes far beyond a résumé — multi-dimensional career analysis captures skills, culture preferences, trajectory and goals. Your profile works passively to attract matches without sending applications.',
        },
      },
      {
        '@type': 'Question',
        name: 'Are part time, remote and hybrid jobs available?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes. DNJ lists full time, part time, contract, temporary, internship, freelance, remote, hybrid, shift and permanent jobs across Malaysia.',
        },
      },
    ],
  },
  {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: 'AI-Curated Recruitment Platform Malaysia',
    description: 'DNJ is a general recruitment platform powered by AI, serving every industry in Malaysia. Three curated matches at a time, zero noise. For both talent and hiring managers across all sectors.',
    serviceType: 'Recruitment platform',
    areaServed: { '@type': 'Country', name: 'Malaysia' },
    provider: {
      '@type': 'Organization',
      name: 'DNJ',
      url: ORIGIN,
    },
    audience: { '@type': 'Audience', audienceType: 'Job seekers and hiring managers across all industries' },
  },
]

export default function Landing() {
  const { t } = useTranslation()
  const { session, profile, loading } = useSession(useShallow((s) => ({ session: s.session, profile: s.profile, loading: s.loading })))
  useSeo({
    title: 'DNJ — AI-Curated Recruitment Platform Malaysia | Jobs Across Every Industry',
    description: 'DNJ is an AI-powered curated recruitment platform for Malaysia. We match talent with hiring companies across every industry — sales, admin, finance, marketing, IT and software, HR, customer service, operations, retail, hospitality, engineering, education, healthcare, banking, manufacturing, logistics, F&B, aviation and more. Three curated matches at a time, zero noise. PDPA-compliant, end-to-end encrypted.',
    keywords: 'AI recruitment Malaysia, curated recruitment, recruitment platform Malaysia, AI job matching, job platform Malaysia, jobs in Malaysia, hiring now Malaysia, apply job online, fresh graduate jobs, no experience jobs, internship Malaysia, graduate trainee, sales executive job vacancy, admin executive job vacancy, finance job vacancy, marketing executive job vacancy, software developer job vacancy, IT job vacancy, customer service job vacancy, HR assistant job vacancy, operation job vacancy, retail job vacancy, hospitality job vacancy, engineering job vacancy, healthcare job vacancy, education job vacancy, banking job vacancy, logistics job vacancy, manufacturing job vacancy, jobs in Kuala Lumpur, jobs in PJ, jobs in Penang, jobs in Johor Bahru, jobs in Cyberjaya, work from home Kuala Lumpur, remote job Malaysia, hybrid job, walk in interview, immediate hiring, career opportunity, talent matching, hiring manager Malaysia, pilot job vacancy, aviation job vacancy, jeweler job vacancy, luxury retail job',
    jsonLd: HOMEPAGE_JSON_LD,
  })
  if (!loading && session && profile) return <Navigate to="/home" replace />

  return (
    <div className="bg-white dark:bg-navy-900 text-navy-900 dark:text-white font-sans">
      {/* ─── First screen ─── */}
      <div className="relative min-h-screen flex flex-col overflow-hidden">
        <a
          href="#landing-main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 bg-navy-900 text-white px-3 py-2 rounded z-50 text-sm"
        >
          {t('landing.skipToMain')}
        </a>
        <BackgroundDecor />

        {/* Top Bar */}
        <header className="relative z-10 px-6 md:px-12 pt-4 pb-2 flex items-center justify-between flex-shrink-0">
          <Link to="/" className="flex items-center gap-3" aria-label={t('landing.brandHomeAria')}>
            <BrandMark />
            <div className="leading-none">
              <div className="font-sans font-extrabold text-[26px] tracking-tight text-navy-900">DNJ</div>
              <div className="text-[10px] font-medium tracking-[0.22em] text-gray-500 mt-1">DIAMOND &amp; JEWELER</div>
            </div>
          </Link>

          {/* Primary navigation — visible on md+ */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-600" aria-label={t('landing.navAria')}>
            <Link to="/careers" className="hover:text-navy-900 transition-colors">{t('landing.navJobs')}</Link>
            <Link to="/pricing" className="hover:text-navy-900 transition-colors">{t('landing.navPricing')}</Link>
            <Link to="/about" className="hover:text-navy-900 transition-colors">{t('landing.navAbout')}</Link>
            <Link to="/careers/urgent-hiring-malaysia-2026" className="hover:text-navy-900 transition-colors">{t('landing.navBlog')}</Link>
          </nav>

          <div className="flex items-center gap-3">
            <DarkModeToggle />
            <div className="inline-flex items-center gap-2 border border-gray-300 dark:border-gray-600 px-3.5 py-1.5 rounded-full text-xs text-gray-700 dark:text-gray-300 bg-white dark:bg-navy-800 shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-gold-500" />
              {t('landing.pilot')}
            </div>
          </div>
        </header>

        <main id="landing-main" className="relative z-10 flex-1 flex flex-col items-center justify-start md:justify-center px-6 py-4 md:py-2 md:min-h-0">
          {/* Hero */}
          <div className="text-center max-w-3xl mx-auto mb-4 md:mb-6">
            <div className="text-gold-500 tracking-[0.3em] text-[11px] font-semibold mb-2">
              {t('landing.eyebrow').toUpperCase()}
            </div>
            <h1 className="font-sans font-bold text-[34px] md:text-[46px] leading-[1.05] tracking-tight text-navy-900 mb-2">
              {t('landing.titleLead')}{' '}
              <span className="text-[#A07D32]">{t('landing.titleHighlight')}</span>
              <br />
              {t('landing.titleTrail')}
            </h1>
            <div className="flex items-center justify-center gap-2 mb-1.5">
              <span className="h-px w-8 bg-gradient-to-r from-transparent to-midnight-400" />
              <span className="h-1.5 w-1.5 rounded-full bg-midnight-500" />
              <span className="h-px w-8 bg-gradient-to-l from-transparent to-midnight-400" />
            </div>
            <p className="text-gray-600 text-[14px] md:text-[15px] leading-snug">
              <span className="block">{t('landing.subtitleLine1')}</span>
              <span className="block">{t('landing.subtitleLine2')}</span>
            </p>
          </div>

          {/* Cards */}
          <div className="relative grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-12 max-w-4xl w-full">
            <DecisionCard
              to="/start/talent"
              title={t('landing.talent')}
              description={t('landing.talentDesc')}
              illustration={<DiamondIllustration />}
              cta={t('common.continue')}
            />
            <OrDivider />
            <DecisionCard
              to="/start/hiring"
              title={t('landing.hiring')}
              description={t('landing.hiringDesc')}
              illustration={<MagnifierIllustration />}
              cta={t('common.continue')}
            />
          </div>

          {/* Sign-in row */}
          <div className="mt-4 md:mt-5 flex items-center justify-center gap-2.5 text-sm">
            <ShieldIcon />
            <span className="text-gray-500">{t('landing.haveAccount')}</span>
            <Link
              to="/login"
              className="font-semibold text-navy-700 underline underline-offset-4 decoration-[1.5px] hover:text-navy-900 inline-flex items-center gap-1"
            >
              {t('landing.signInDashboard')}
              <Arrow />
            </Link>
          </div>
        </main>

        {/* Footer — text-xs (12px) for accessibility; includes Blog link */}
        <footer className="relative z-10 pt-2 pb-3 text-center text-xs text-gray-500 flex-shrink-0 flex flex-col items-center gap-1">
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5">
            <Link to="/about" className="hover:text-navy-900">{t('landing.navAbout')}</Link>
            <span aria-hidden>·</span>
            <Link to="/careers" className="hover:text-navy-900">{t('landing.navJobs')}</Link>
            <span aria-hidden>·</span>
            <Link to="/pricing" className="hover:text-navy-900">{t('landing.navPricing')}</Link>
            <span aria-hidden>·</span>
            <Link to="/careers/urgent-hiring-malaysia-2026" className="hover:text-navy-900">{t('landing.navBlog')}</Link>
            <span aria-hidden>·</span>
            <Link to="/privacy" className="hover:text-navy-900">{t('footer.privacy')}</Link>
            <span aria-hidden>·</span>
            <Link to="/terms" className="hover:text-navy-900">{t('footer.terms')}</Link>
            <span aria-hidden>·</span>
            <span>© 2026 DNJ</span>
          </div>
          <PopularSearches />
        </footer>
      </div>{/* end first-screen */}

      {/* ─── Below-the-fold content ─── */}
      <TrustStrip />
      <HowItWorksSection />
      <VideoSection />
      <SocialProofStrip />
      <BoleSection />
      <PassiveTalentSection />
      <ReferralSection />
      <WhatsAppCTA />
    </div>
  )
}
