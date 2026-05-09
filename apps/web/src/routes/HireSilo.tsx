import { Link, useParams, Navigate } from 'react-router-dom'
import { useSeo } from '../lib/useSeo'
import RelatedLinks from '../components/RelatedLinks'
import { HIRES, type HireSlug } from '../data/silo-data'

const ORIGIN = 'https://diamondandjeweler.com'

export default function HireSilo() {
  const { slug } = useParams<{ slug: string }>()
  const hire = slug ? HIRES[slug as HireSlug] : undefined

  if (!hire) return <Navigate to="/careers" replace />

  const canonicalPath = `/hire-${hire.slug}`
  const url = ORIGIN + canonicalPath

  const jsonLd: Record<string, unknown>[] = [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${ORIGIN}/` },
        { '@type': 'ListItem', position: 2, name: 'For employers', item: `${ORIGIN}/start/hiring` },
        { '@type': 'ListItem', position: 3, name: `Hire ${hire.role}`, item: url },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: `Hire ${hire.role} in Malaysia — DNJ AI Recruitment`,
      description: hire.description,
      url,
      areaServed: { '@type': 'Country', name: 'Malaysia' },
      provider: {
        '@type': 'Organization',
        name: 'DNJ — Diamond & Jeweler',
        url: ORIGIN,
      },
      serviceType: 'AI-curated recruitment',
      audience: { '@type': 'BusinessAudience', name: 'Hiring managers and HR' },
    },
  ]

  useSeo({
    title: hire.title,
    description: hire.description,
    keywords: hire.keywords,
    canonicalPath,
    jsonLd,
  })

  return (
    <div className="min-h-screen bg-white text-[#0B1220] font-sans">
      <header className="border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2" aria-label="DNJ home">
            <span className="font-extrabold tracking-tight text-[20px]">DNJ</span>
            <span className="text-[10px] tracking-[0.22em] text-gray-500">DIAMOND &amp; JEWELER</span>
          </Link>
          <Link to="/start/hiring" className="text-sm text-[#1B2A6B] font-semibold underline underline-offset-4">
            Start hiring
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <nav aria-label="Breadcrumb" className="text-xs text-gray-500 mb-4">
          <Link to="/" className="hover:text-[#0B1220]">Home</Link>
          <span className="mx-2">/</span>
          <Link to="/start/hiring" className="hover:text-[#0B1220]">For employers</Link>
          <span className="mx-2">/</span>
          <span aria-current="page" className="text-gray-700">Hire {hire.role}</span>
        </nav>

        <section>
          <p className="text-[#C9A24D] tracking-[0.3em] text-[11px] font-semibold mb-2">
            FOR HIRING MANAGERS · MALAYSIA
          </p>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight mb-3 capitalize">
            Hire {hire.role} in Malaysia
          </h1>
          <p className="text-gray-600 max-w-3xl leading-relaxed">{hire.intro}</p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/start/hiring"
              className="inline-flex items-center px-5 py-2.5 rounded-xl bg-[#0B1742] text-white text-sm font-semibold shadow hover:bg-[#1B2A6B]"
            >
              Start hiring with DNJ
            </Link>
            <Link
              to="/careers"
              className="inline-flex items-center px-5 py-2.5 rounded-xl border border-gray-300 text-sm font-semibold hover:border-[#0B1742]"
            >
              See talent applying
            </Link>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-xl md:text-2xl font-bold mb-3">Why DNJ for hiring {hire.role}</h2>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {hire.bullets.map((b, i) => (
              <li key={i} className="rounded-xl border border-gray-200 p-4 text-sm text-gray-700 leading-relaxed">
                {b}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-10 rounded-2xl bg-gradient-to-br from-[#0B1742] to-[#1B2A6B] text-white p-8 text-center">
          <h2 className="text-2xl font-bold mb-2">Three matches per role · zero CV pile</h2>
          <p className="text-white/85 max-w-2xl mx-auto leading-relaxed">
            Our proprietary AI compatibility engine scores skills, culture fit, trajectory and compensation alignment — not just CV keywords. PDPA-compliant, end-to-end encrypted, and full candidate confidentiality until mutual interest is confirmed.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link
              to="/start/hiring"
              className="inline-flex items-center px-5 py-2.5 rounded-xl bg-white text-[#0B1742] text-sm font-semibold hover:bg-gray-100"
            >
              Start hiring
            </Link>
          </div>
        </section>

        <RelatedLinks roles={hire.relatedRoles} locations={['kuala-lumpur', 'petaling-jaya', 'penang']} />

        <section className="mt-12">
          <h2 className="text-base font-semibold text-[#0B1220] mb-2">Related services</h2>
          <p className="text-xs text-gray-500 leading-relaxed">{hire.keywords}</p>
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
