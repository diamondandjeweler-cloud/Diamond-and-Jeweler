import { Link, useParams, Navigate } from 'react-router-dom'
import { useSeo } from '../lib/useSeo'
import RelatedLinks from '../components/RelatedLinks'
import { ROLES, LOCATIONS, type RoleSlug } from '../data/silo-data'

const ORIGIN = 'https://diamondandjeweler.com'

export default function RoleSilo() {
  const { slug } = useParams<{ slug: string }>()
  const role = slug ? ROLES[slug as RoleSlug] : undefined

  // Hooks must run unconditionally — call useSeo before any early return.
  // When `role` is missing the values are empty placeholders for the one render
  // before <Navigate> swaps the route.
  const canonicalPath = role ? `/jobs/${role.slug}` : ''
  const url = ORIGIN + canonicalPath

  const jsonLd: Record<string, unknown>[] = role ? [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${ORIGIN}/` },
        { '@type': 'ListItem', position: 2, name: 'Careers', item: `${ORIGIN}/careers` },
        { '@type': 'ListItem', position: 3, name: `${role.name} jobs`, item: url },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: role.title,
      description: role.description,
      inLanguage: 'en-MY',
      url,
      about: {
        '@type': 'Occupation',
        name: role.name,
        occupationLocation: {
          '@type': 'Country',
          name: 'Malaysia',
        },
        occupationalCategory: role.occupationalCategory,
      },
    },
  ] : []

  if (role?.hasJobPosting) {
    const jobPosting: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'JobPosting',
      title: `${role.name} job vacancy in Malaysia`,
      description: role.description,
      identifier: {
        '@type': 'PropertyValue',
        name: 'DNJ Careers',
        value: `dnj-${role.slug}-2026`,
      },
      datePosted: '2026-05-08',
      validThrough: '2026-12-31T23:59',
      employmentType: role.jobTypes,
      hiringOrganization: {
        '@type': 'Organization',
        name: 'DNJ — Diamond & Jeweler',
        sameAs: ORIGIN,
        logo: `${ORIGIN}/og-image.svg`,
      },
      jobLocation: role.locations.map((locSlug) => ({
        '@type': 'Place',
        address: {
          '@type': 'PostalAddress',
          addressLocality: LOCATIONS[locSlug]?.name ?? 'Kuala Lumpur',
          addressRegion: LOCATIONS[locSlug]?.state ?? 'Federal Territory of Kuala Lumpur',
          addressCountry: 'MY',
        },
      })),
      applicantLocationRequirements: {
        '@type': 'Country',
        name: 'Malaysia',
      },
      directApply: true,
      url,
      industry: role.industry,
      occupationalCategory: role.occupationalCategory,
      qualifications: role.qualifications,
      responsibilities: role.bullets.join('. '),
      skills: role.keywords,
    }

    if (role.baseSalaryMin && role.baseSalaryMax) {
      jobPosting.baseSalary = {
        '@type': 'MonetaryAmount',
        currency: 'MYR',
        value: {
          '@type': 'QuantitativeValue',
          minValue: role.baseSalaryMin,
          maxValue: role.baseSalaryMax,
          unitText: 'MONTH',
        },
      }
    }

    jsonLd.push(jobPosting)
  }

  useSeo({
    title: role?.title ?? '',
    description: role?.description ?? '',
    keywords: role?.keywords,
    canonicalPath,
    jsonLd,
  })

  if (!role) return <Navigate to="/careers" replace />

  return (
    <div className="min-h-screen bg-white text-[#0B1220] font-sans">
      <header className="border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2" aria-label="DNJ home">
            <span className="font-extrabold tracking-tight text-[20px]">DNJ</span>
            <span className="text-[10px] tracking-[0.22em] text-gray-500">DIAMOND &amp; JEWELER</span>
          </Link>
          <Link to="/start/talent" className="text-sm text-[#1B2A6B] font-semibold underline underline-offset-4">
            Apply now
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <nav aria-label="Breadcrumb" className="text-xs text-gray-500 mb-4">
          <Link to="/" className="hover:text-[#0B1220]">Home</Link>
          <span className="mx-2">/</span>
          <Link to="/careers" className="hover:text-[#0B1220]">Careers</Link>
          <span className="mx-2">/</span>
          <span aria-current="page" className="text-gray-700">{role.name} jobs</span>
        </nav>

        <section>
          <p className="text-[#C9A24D] tracking-[0.3em] text-[11px] font-semibold mb-2">
            URGENT HIRING · {role.industry.toUpperCase()}
          </p>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight mb-3">
            {role.name} Job Vacancy Malaysia
          </h1>
          <p className="text-gray-600 max-w-3xl leading-relaxed">{role.hookCopy}</p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/start/talent"
              className="inline-flex items-center px-5 py-2.5 rounded-xl bg-[#0B1742] text-white text-sm font-semibold shadow hover:bg-[#1B2A6B]"
            >
              Apply now — get matched
            </Link>
            <Link
              to={`/hire-${role.slug}`}
              className="inline-flex items-center px-5 py-2.5 rounded-xl border border-gray-300 text-sm font-semibold hover:border-[#0B1742]"
            >
              I'm hiring {role.name.toLowerCase()}s
            </Link>
          </div>
        </section>

        <section className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="rounded-xl bg-[#fafbff] ring-1 ring-[#e8edff] p-5">
            <h2 className="font-semibold text-[#0B1220] mb-2">Job types</h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              {role.jobTypes
                .map((t) => t.replace('_', ' ').toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase()))
                .join(' · ')}
            </p>
          </div>
          <div className="rounded-xl bg-[#fafbff] ring-1 ring-[#e8edff] p-5">
            <h2 className="font-semibold text-[#0B1220] mb-2">Locations hiring</h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              {role.locations.map((s) => LOCATIONS[s]?.name ?? s).join(' · ')}
            </p>
          </div>
          <div className="rounded-xl bg-[#fafbff] ring-1 ring-[#e8edff] p-5">
            <h2 className="font-semibold text-[#0B1220] mb-2">Qualifications</h2>
            <p className="text-sm text-gray-700 leading-relaxed">{role.qualifications}</p>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-xl md:text-2xl font-bold mb-3">Why apply for {role.name.toLowerCase()} jobs through DNJ</h2>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {role.bullets.map((b, i) => (
              <li
                key={i}
                className="rounded-xl border border-gray-200 p-4 text-sm text-gray-700 leading-relaxed"
              >
                {b}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-10 rounded-2xl bg-gradient-to-br from-[#0B1742] to-[#1B2A6B] text-white p-8 text-center">
          <h2 className="text-2xl font-bold mb-2">
            Precision recruitment, powered by AI
          </h2>
          <p className="text-white/85 max-w-2xl mx-auto leading-relaxed">
            DNJ matches you with the right hiring company — three curated offers at a time, zero noise. Multi-dimensional career analysis goes far beyond the résumé. Your profile works passively, end-to-end encrypted and PDPA-compliant.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link
              to="/start/talent"
              className="inline-flex items-center px-5 py-2.5 rounded-xl bg-white text-[#0B1742] text-sm font-semibold hover:bg-gray-100"
            >
              Apply now
            </Link>
            <Link
              to="/careers"
              className="inline-flex items-center px-5 py-2.5 rounded-xl border border-white/40 text-white text-sm font-semibold hover:bg-white/10"
            >
              Browse all careers
            </Link>
          </div>
        </section>

        <RelatedLinks
          roles={role.relatedRoles}
          locations={role.relatedLocations}
          hires={[
            { slug: role.slug, label: `Hire ${role.name.toLowerCase()}` },
          ]}
        />

        <section className="mt-12">
          <h2 className="text-base font-semibold text-[#0B1220] mb-2">Related searches</h2>
          <p className="text-xs text-gray-500 leading-relaxed">{role.keywords}</p>
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
