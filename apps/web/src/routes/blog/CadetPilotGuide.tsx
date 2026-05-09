import { Link } from 'react-router-dom'
import { useSeo } from '../../lib/useSeo'
import RelatedLinks from '../../components/RelatedLinks'

const POST_KEYWORDS =
  'cadet pilot program, cadet pilot Malaysia, cadet pilot 2026, fresh graduate pilot, pilot trainee program, no experience pilot, SPM cadet pilot, diploma cadet pilot, pilot fresh graduate, aviation career Malaysia, airline pilot Malaysia, pilot job vacancy, pilot job Malaysia, AirAsia cadet, MAS cadet, Batik Air cadet, MyAirline cadet, class 1 medical, ATPL Malaysia, CPL Malaysia, frozen ATPL, ICAO English level 4'

const PUBLISHED = '2026-05-09'

export default function CadetPilotGuide() {
  useSeo({
    title: 'Cadet Pilot Program Malaysia 2026 — Full Guide',
    description:
      'Complete guide to the cadet pilot program in Malaysia 2026. Eligibility, training pathway, career progression, and how to apply with DNJ — AI-curated matching with airline partners.',
    keywords: POST_KEYWORDS,
    canonicalPath: '/careers/cadet-pilot-program-malaysia-guide',
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
            name: 'Cadet Pilot Program Malaysia Guide',
            item: 'https://diamondandjeweler.com/careers/cadet-pilot-program-malaysia-guide',
          },
        ],
      },
      {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: 'Cadet Pilot Program Malaysia 2026 — Full Guide',
        description:
          'Complete 2026 guide to becoming a cadet pilot in Malaysia. Eligibility, training, career path, and application.',
        datePublished: PUBLISHED,
        dateModified: PUBLISHED,
        inLanguage: 'en-MY',
        author: { '@type': 'Organization', name: 'DNJ — Diamond & Jeweler' },
        publisher: {
          '@type': 'Organization',
          name: 'DNJ — Diamond & Jeweler',
          logo: { '@type': 'ImageObject', url: 'https://diamondandjeweler.com/og-image.svg' },
        },
        mainEntityOfPage: 'https://diamondandjeweler.com/careers/cadet-pilot-program-malaysia-guide',
        about: 'Cadet pilot program Malaysia 2026',
        keywords: POST_KEYWORDS,
      },
      {
        '@context': 'https://schema.org',
        '@type': 'EducationalOccupationalProgram',
        name: 'Cadet Pilot Program Malaysia',
        description:
          'Structured airline cadet programme for fresh graduates, SPM leavers, diploma and degree holders. From classroom to commercial airline first officer.',
        url: 'https://diamondandjeweler.com/jobs/cadet-pilot',
        occupationalCategory: '53-2011 Airline Pilots, Copilots, and Flight Engineers',
        programType: 'Cadet pilot program',
        educationalCredentialAwarded: 'CPL (Commercial Pilot Licence) progression to ATPL',
        provider: {
          '@type': 'Organization',
          name: 'DNJ — Airline partner network',
          url: 'https://diamondandjeweler.com',
        },
        timeOfDay: 'Full time',
        offers: { '@type': 'Offer', category: 'Trainee programme' },
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
          <Link to="/careers" className="text-sm text-[#1B2A6B] underline underline-offset-4">All careers</Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        <nav aria-label="Breadcrumb" className="text-xs text-gray-500 mb-4">
          <Link to="/" className="hover:text-[#0B1220]">Home</Link>
          <span className="mx-2">/</span>
          <Link to="/careers" className="hover:text-[#0B1220]">Careers</Link>
          <span className="mx-2">/</span>
          <span aria-current="page" className="text-gray-700">Cadet Pilot Program Guide</span>
        </nav>

        <article>
          <p className="text-[#C9A24D] tracking-[0.3em] text-[11px] font-semibold mb-2">CAREERS · AVIATION · 2026</p>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">
            Cadet Pilot Program Malaysia 2026 — Full Guide
          </h1>
          <p className="text-xs text-gray-500 mb-6">Published <time dateTime={PUBLISHED}>{PUBLISHED}</time> · 8 min read</p>

          <p className="text-gray-700 leading-relaxed mb-4">
            Wanted to be a pilot but unsure where to start? The <strong>cadet pilot program</strong> is Malaysia's
            most structured route into commercial aviation — designed specifically for fresh graduates, SPM
            leavers, diploma and degree holders with <em>no flight experience required</em>. This 2026 guide
            covers everything: eligibility, training stages, career path, and how to apply through DNJ's
            AI-curated airline matching.
          </p>

          <h2 className="text-xl font-bold mt-8 mb-2">What is a cadet pilot program?</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            A cadet pilot program is a structured airline-sponsored or airline-affiliated training pathway that
            takes a candidate with zero flying experience and trains them — over roughly 18–24 months — into a
            commercial airline first officer. Unlike self-funded private flight school routes, cadet schemes
            usually offer:
          </p>
          <ul className="list-disc pl-5 text-gray-700 leading-relaxed space-y-1.5 mb-4">
            <li>Structured curriculum (theory → simulator → line training)</li>
            <li>Bond/scholarship arrangements that defer cost</li>
            <li>Conditional placement with the sponsoring airline</li>
            <li>Type rating on a specific aircraft (A320, B737, ATR-72)</li>
            <li>ICAO-recognised CPL/IR, with progression to frozen ATPL</li>
          </ul>

          <h2 className="text-xl font-bold mt-8 mb-2">Eligibility — who can apply</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            Cadet pilot eligibility varies slightly by airline, but the typical baseline in Malaysia 2026 is:
          </p>
          <ul className="list-disc pl-5 text-gray-700 leading-relaxed space-y-1.5 mb-4">
            <li><strong>Age</strong>: 18–28 (some schemes accept up to 30)</li>
            <li><strong>Education</strong>: SPM with credits in English, Mathematics, Physics — or diploma/degree (any field, but STEM helps)</li>
            <li><strong>Medical</strong>: Class 1 medical fitness from a CAAM-approved AME</li>
            <li><strong>English</strong>: ICAO English Level 4 or higher</li>
            <li><strong>Height &amp; vision</strong>: vary by airline; corrective lenses generally accepted</li>
            <li><strong>Citizenship</strong>: Malaysian citizen or permanent resident (most schemes)</li>
          </ul>

          <h2 className="text-xl font-bold mt-8 mb-2">Training pathway — what to expect</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            A typical Malaysian cadet pilot programme runs in three phases over ~18–24 months:
          </p>
          <ol className="list-decimal pl-5 text-gray-700 leading-relaxed space-y-2 mb-4">
            <li>
              <strong>Ground school + PPL</strong> (6–9 months): theory of flight, navigation, meteorology,
              human factors. Single-engine private pilot licence flight training begins.
            </li>
            <li>
              <strong>CPL + IR</strong> (6–9 months): commercial pilot licence and instrument rating. Multi-engine
              type training. Cross-country flights, complex aircraft hours.
            </li>
            <li>
              <strong>Type rating + line training</strong> (3–6 months): full-flight simulator on the airline's
              fleet (A320, B737, ATR-72). Then supervised line flying with a training captain on revenue flights.
            </li>
          </ol>

          <h2 className="text-xl font-bold mt-8 mb-2">Career path — first officer to captain</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            Upon completion, you'll be released to line operations as a <strong>First Officer (FO)</strong>. From
            there, the typical Malaysian airline trajectory looks like:
          </p>
          <ul className="list-disc pl-5 text-gray-700 leading-relaxed space-y-1.5 mb-4">
            <li>Year 1–4: Junior First Officer — building hours, gaining confidence</li>
            <li>Year 4–8: Senior First Officer — line authority, training upgrade prep</li>
            <li>Year 8+: Captain upgrade (depends on hours, command-rated checks, and seniority)</li>
            <li>Year 12+: Type Rating Examiner / Line Training Captain / fleet manager paths</li>
          </ul>

          <h2 className="text-xl font-bold mt-8 mb-2">Cost &amp; bond structures</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            Cadet schemes in Malaysia generally come in three flavours:
          </p>
          <ul className="list-disc pl-5 text-gray-700 leading-relaxed space-y-1.5 mb-4">
            <li><strong>Self-sponsored</strong>: cadet pays fees (RM 350k–600k), airline provides placement</li>
            <li><strong>Bonded</strong>: airline finances training, cadet commits to a multi-year bond (typically 7–10 years)</li>
            <li><strong>Hybrid</strong>: partial sponsorship, partial cadet contribution, shorter bond</li>
          </ul>
          <p className="text-gray-700 leading-relaxed mb-4">
            Speak to a financial advisor before committing — bonds are legally enforceable and have material
            implications if you exit early.
          </p>

          <h2 className="text-xl font-bold mt-8 mb-2">How to apply through DNJ</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            DNJ matches eligible cadet candidates with Malaysian airline partners running active cadet
            programmes. Three matches at a time, AI-curated by your profile (academic record, English level,
            medical eligibility, geographic preference, bond willingness). You don't need a CV — your career
            profile works passively.
          </p>
          <ul className="list-disc pl-5 text-gray-700 leading-relaxed space-y-1.5 mb-4">
            <li>End-to-end encrypted personal data, fully PDPA-compliant</li>
            <li>Candidate confidentiality until mutual interest is confirmed</li>
            <li>Three vetted airline matches, not 50 mass applications</li>
            <li>Hiring intelligence reports with every match</li>
          </ul>

          <div className="rounded-2xl bg-[#0B1742] text-white p-6 text-center mt-6">
            <p className="text-base font-semibold mb-3">Ready to start?</p>
            <Link
              to="/start/talent"
              className="inline-flex items-center px-5 py-2.5 rounded-xl bg-white text-[#0B1742] text-sm font-semibold hover:bg-gray-100"
            >
              Apply now — match with airline partners
            </Link>
          </div>
        </article>

        <RelatedLinks
          roles={['pilot', 'cadet-pilot', 'customer-service', 'admin-executive']}
          locations={['kuala-lumpur', 'penang', 'johor-bahru']}
          hires={[{ slug: 'pilot', label: 'Hire pilots' }]}
          blog={[
            { slug: 'urgent-hiring-malaysia-2026', label: 'Urgent Hiring Near Me 2026' },
            { slug: 'diamond-grader-vs-gemologist', label: 'Diamond Grader vs Gemologist' },
          ]}
        />
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
