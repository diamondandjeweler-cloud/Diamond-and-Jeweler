import { Link, useLocation, Navigate } from 'react-router-dom'
import { useSeo } from '../lib/useSeo'
import RelatedLinks from '../components/RelatedLinks'
import { LOCATIONS, ROLES, type LocationSlug } from '../data/silo-data'

const ORIGIN = 'https://diamondandjeweler.com'

export default function LocationSilo() {
  // Route is literal `/jobs-in-<slug>` (React Router can't bind `:slug` after a hyphen),
  // so derive the slug from the URL path instead of useParams.
  const { pathname } = useLocation()
  const slug = pathname.replace(/^\/jobs-in-/, '').replace(/\/$/, '') as LocationSlug
  const loc = LOCATIONS[slug]

  // Hooks must run unconditionally — call useSeo before any early return.
  // When `loc` is missing the values are empty placeholders for the one render
  // before <Navigate> swaps the route.
  const canonicalPath = loc ? `/jobs-in-${loc.slug}` : ''
  const url = ORIGIN + canonicalPath

  const jsonLd: Record<string, unknown>[] = loc ? [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${ORIGIN}/` },
        { '@type': 'ListItem', position: 2, name: 'Careers', item: `${ORIGIN}/careers` },
        { '@type': 'ListItem', position: 3, name: `Jobs in ${loc.name}`, item: url },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: loc.title,
      description: loc.description,
      url,
      inLanguage: 'en-MY',
      about: `Jobs and hiring in ${loc.name}, ${loc.state}, Malaysia`,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Place',
      name: loc.name,
      address: {
        '@type': 'PostalAddress',
        addressLocality: loc.name,
        addressRegion: loc.state,
        addressCountry: 'MY',
      },
      geo: {
        '@type': 'GeoCoordinates',
        latitude: loc.geo.lat,
        longitude: loc.geo.lng,
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: `Top job categories in ${loc.name}`,
      itemListElement: loc.topRoles.map((roleSlug, i) => {
        const r = ROLES[roleSlug]
        return {
          '@type': 'ListItem',
          position: i + 1,
          name: r ? `${r.name} jobs in ${loc.name}` : roleSlug,
          url: r ? `${ORIGIN}/jobs/${roleSlug}` : url,
        }
      }),
    },
  ] : []

  useSeo({
    title: loc?.title ?? '',
    description: loc?.description ?? '',
    keywords: loc?.keywords,
    canonicalPath,
    jsonLd,
  })

  if (!loc) return <Navigate to="/careers" replace />

  return (
    <div className="min-h-screen bg-white dark:bg-navy-900 text-navy-900 dark:text-white font-sans">
      <header className="border-b border-gray-100 dark:border-gray-700 dark:bg-navy-800">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2" aria-label="DNJ home">
            <span className="font-extrabold tracking-tight text-[20px]">DNJ</span>
            <span className="text-[10px] tracking-[0.22em] text-gray-500">DIAMOND &amp; JEWELER</span>
          </Link>
          <Link to="/start/talent" className="text-sm text-navy-700 font-semibold underline underline-offset-4">
            Apply now
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <nav aria-label="Breadcrumb" className="text-xs text-gray-500 mb-4">
          <Link to="/" className="hover:text-navy-900">Home</Link>
          <span className="mx-2">/</span>
          <Link to="/careers" className="hover:text-navy-900">Careers</Link>
          <span className="mx-2">/</span>
          <span aria-current="page" className="text-gray-700">Jobs in {loc.name}</span>
        </nav>

        <section>
          <p className="text-gold-500 tracking-[0.3em] text-[11px] font-semibold mb-2">
            URGENT HIRING · {loc.name.toUpperCase()}
          </p>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight mb-3">
            Jobs in {loc.name} — Latest Hiring 2026
          </h1>
          <p className="text-gray-600 max-w-3xl leading-relaxed">{loc.intro}</p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/start/talent"
              className="inline-flex items-center px-5 py-2.5 rounded-xl bg-navy-800 text-white text-sm font-semibold shadow hover:bg-navy-700"
            >
              Apply now — get matched
            </Link>
            <Link
              to="/start/hiring"
              className="inline-flex items-center px-5 py-2.5 rounded-xl border border-gray-300 text-sm font-semibold hover:border-navy-800"
            >
              I'm hiring in {loc.shortName}
            </Link>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-xl md:text-2xl font-bold mb-3">Why hire and apply in {loc.name}</h2>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {loc.highlights.map((h, i) => (
              <li key={i} className="rounded-xl border border-gray-200 p-4 text-sm text-gray-700 leading-relaxed">
                {h}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="text-xl md:text-2xl font-bold mb-3">Top job categories in {loc.name}</h2>
          <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {loc.topRoles.map((roleSlug) => {
              const r = ROLES[roleSlug]
              if (!r) return null
              return (
                <li key={roleSlug} className="rounded-xl border border-gray-200 p-5 hover:border-navy-800 transition-colors">
                  <h3 className="font-semibold text-navy-900 mb-1">{r.name} jobs in {loc.name}</h3>
                  <p className="text-xs text-gray-500 mb-2">
                    {r.industry} · {r.jobTypes.map((t) => t.replace('_', ' ').toLowerCase()).join(' · ')}
                  </p>
                  <Link
                    to={`/jobs/${roleSlug}`}
                    className="text-sm font-semibold text-navy-700 hover:text-navy-900"
                  >
                    View {r.name.toLowerCase()} roles →
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>

        <section className="mt-10 rounded-2xl bg-gradient-to-br from-navy-800 to-navy-700 text-white p-8 text-center">
          <h2 className="text-2xl font-bold mb-2">
            AI-curated matching — three jobs in {loc.name}, zero noise
          </h2>
          <p className="text-white/85 max-w-2xl mx-auto leading-relaxed">
            DNJ matches you with the right hiring company in {loc.name} — multi-dimensional career analysis, candidate confidentiality, end-to-end encrypted, PDPA-compliant.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link
              to="/start/talent"
              className="inline-flex items-center px-5 py-2.5 rounded-xl bg-white text-navy-800 text-sm font-semibold hover:bg-gray-100"
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
          roles={loc.topRoles.slice(0, 4)}
          locations={(['kuala-lumpur', 'petaling-jaya', 'penang', 'cyberjaya'] as const).filter((s) => s !== loc.slug).slice(0, 4)}
        />

        <section className="mt-12">
          <h2 className="text-base font-semibold text-navy-900 mb-2">Popular searches in {loc.name}</h2>
          <p className="text-xs text-gray-500 leading-relaxed">{loc.keywords}</p>
        </section>
      </main>

      <footer className="border-t border-gray-100 mt-10 py-6 text-center text-xs text-gray-500">
        <Link to="/" className="hover:text-navy-900">Home</Link>
        <span className="mx-2">·</span>
        <Link to="/careers" className="hover:text-navy-900">Careers</Link>
        <span className="mx-2">·</span>
        <Link to="/privacy" className="hover:text-navy-900">Privacy</Link>
        <span className="mx-2">·</span>
        <Link to="/terms" className="hover:text-navy-900">Terms</Link>
      </footer>
    </div>
  )
}
