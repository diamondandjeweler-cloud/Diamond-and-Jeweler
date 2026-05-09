import { Link } from 'react-router-dom'
import { useSeo } from '../../lib/useSeo'
import RelatedLinks from '../../components/RelatedLinks'

const POST_KEYWORDS =
  'diamond grader vs gemologist, diamond grader Malaysia, gemologist Malaysia, GIA diamond grader, GIA gemologist, gemology career Malaysia, diamond grading career, gemology certification, jewelry career path, 4Cs grading, diamond appraiser, gem appraiser, AIGS gemologist, HRD diamond grader, jewelry industry careers'

const PUBLISHED = '2026-05-09'

export default function DiamondGraderVsGemologist() {
  useSeo({
    title: 'Diamond Grader vs Gemologist — Career Path in Malaysia',
    description:
      'Diamond grader vs gemologist — what is the difference, what they do, salary range, training, certification, and which path is right for you in Malaysia.',
    keywords: POST_KEYWORDS,
    canonicalPath: '/careers/diamond-grader-vs-gemologist',
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
            name: 'Diamond Grader vs Gemologist',
            item: 'https://diamondandjeweler.com/careers/diamond-grader-vs-gemologist',
          },
        ],
      },
      {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: 'Diamond Grader vs Gemologist — Career Path in Malaysia',
        description:
          'Compare the diamond grader and gemologist career paths in Malaysia. Roles, salary, training, certification, and progression.',
        datePublished: PUBLISHED,
        dateModified: PUBLISHED,
        inLanguage: 'en-MY',
        author: { '@type': 'Organization', name: 'DNJ — Diamond & Jeweler' },
        publisher: {
          '@type': 'Organization',
          name: 'DNJ — Diamond & Jeweler',
          logo: { '@type': 'ImageObject', url: 'https://diamondandjeweler.com/og-image.svg' },
        },
        mainEntityOfPage: 'https://diamondandjeweler.com/careers/diamond-grader-vs-gemologist',
        about: 'Diamond grader and gemologist career comparison',
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
          <Link to="/careers" className="text-sm text-[#1B2A6B] underline underline-offset-4">All careers</Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        <nav aria-label="Breadcrumb" className="text-xs text-gray-500 mb-4">
          <Link to="/" className="hover:text-[#0B1220]">Home</Link>
          <span className="mx-2">/</span>
          <Link to="/careers" className="hover:text-[#0B1220]">Careers</Link>
          <span className="mx-2">/</span>
          <span aria-current="page" className="text-gray-700">Diamond Grader vs Gemologist</span>
        </nav>

        <article>
          <p className="text-[#C9A24D] tracking-[0.3em] text-[11px] font-semibold mb-2">CAREERS · LUXURY · 2026</p>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">
            Diamond Grader vs Gemologist — Career Path in Malaysia
          </h1>
          <p className="text-xs text-gray-500 mb-6">Published <time dateTime={PUBLISHED}>{PUBLISHED}</time> · 7 min read</p>

          <p className="text-gray-700 leading-relaxed mb-4">
            Two of the most respected — and most confused — careers in Malaysia's luxury and jewelry industry are
            <strong> diamond grader</strong> and <strong>gemologist</strong>. They sound similar. They sometimes
            work in the same labs. But their day-to-day work, training, and career trajectory are different.
            Here's how to tell them apart and choose the right path.
          </p>

          <h2 className="text-xl font-bold mt-8 mb-2">Quick comparison</h2>
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm border border-gray-200">
              <thead className="bg-[#fafbff]">
                <tr>
                  <th className="text-left p-3 border-b border-gray-200">Aspect</th>
                  <th className="text-left p-3 border-b border-gray-200">Diamond grader</th>
                  <th className="text-left p-3 border-b border-gray-200">Gemologist</th>
                </tr>
              </thead>
              <tbody className="text-gray-700">
                <tr>
                  <td className="p-3 border-b border-gray-200 font-semibold">Focus</td>
                  <td className="p-3 border-b border-gray-200">Diamonds only — 4Cs grading</td>
                  <td className="p-3 border-b border-gray-200">All gemstones — identification &amp; certification</td>
                </tr>
                <tr>
                  <td className="p-3 border-b border-gray-200 font-semibold">Tools</td>
                  <td className="p-3 border-b border-gray-200">Loupe, microscope, master stones, color cards</td>
                  <td className="p-3 border-b border-gray-200">Refractometer, polariscope, spectroscope, microscope</td>
                </tr>
                <tr>
                  <td className="p-3 border-b border-gray-200 font-semibold">Typical employer</td>
                  <td className="p-3 border-b border-gray-200">Diamond houses, jewelry retailers, certification labs</td>
                  <td className="p-3 border-b border-gray-200">Gem labs, auction houses, insurance, education</td>
                </tr>
                <tr>
                  <td className="p-3 border-b border-gray-200 font-semibold">Cert path</td>
                  <td className="p-3 border-b border-gray-200">GIA Diamond Grading / HRD / IGI</td>
                  <td className="p-3 border-b border-gray-200">GIA GG / AIGS GG / FGA</td>
                </tr>
                <tr>
                  <td className="p-3 border-b border-gray-200 font-semibold">Entry salary (KL)</td>
                  <td className="p-3 border-b border-gray-200">RM 3,500–5,500</td>
                  <td className="p-3 border-b border-gray-200">RM 4,000–6,500</td>
                </tr>
                <tr>
                  <td className="p-3 font-semibold">Senior salary</td>
                  <td className="p-3">RM 8,000–12,000+</td>
                  <td className="p-3">RM 10,000–14,000+</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h2 className="text-xl font-bold mt-8 mb-2">Diamond grader — what they actually do</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            A <strong>diamond grader</strong> is a specialist who evaluates polished diamonds against the four
            internationally-standardised criteria — the <em>4Cs</em>:
          </p>
          <ul className="list-disc pl-5 text-gray-700 leading-relaxed space-y-1.5 mb-4">
            <li><strong>Cut</strong> — proportions, symmetry, polish (impacts brilliance)</li>
            <li><strong>Color</strong> — D (colorless) to Z (light yellow), graded against master stones</li>
            <li><strong>Clarity</strong> — FL (flawless) to I3 (heavily included), via 10x loupe and microscope</li>
            <li><strong>Carat</strong> — weight measured to 0.001 ct precision</li>
          </ul>
          <p className="text-gray-700 leading-relaxed mb-3">
            The day-to-day is methodical and detail-driven: dozens of stones graded under controlled lighting,
            recorded against quality-assurance protocols, sometimes peer-reviewed by senior graders. Many
            graders progress into appraisal, lab management, or specialised areas like fancy color diamonds.
          </p>

          <h2 className="text-xl font-bold mt-8 mb-2">Gemologist — broader scientific scope</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            A <strong>gemologist</strong> studies <em>all</em> gemstones — diamonds plus colored stones (ruby,
            sapphire, emerald), organic gems (pearl, coral, amber), and synthetic / treated materials. The work
            spans:
          </p>
          <ul className="list-disc pl-5 text-gray-700 leading-relaxed space-y-1.5 mb-4">
            <li>Species and variety identification (e.g., distinguishing natural vs lab-grown)</li>
            <li>Treatment and enhancement detection (heat, fracture-filling, irradiation)</li>
            <li>Certification authoring and signing</li>
            <li>Origin determination for high-value stones</li>
            <li>Education and training within firms or schools</li>
          </ul>
          <p className="text-gray-700 leading-relaxed mb-3">
            Gemologists tend to have broader scientific exposure (mineralogy, crystallography, optics) and the
            certifications take longer to earn. The career arc often runs senior gemologist → lab director or
            independent consultant.
          </p>

          <h2 className="text-xl font-bold mt-8 mb-2">Which path is right for you?</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            Both careers reward precision, patience and a quiet temperament. Pick <strong>diamond grader</strong> if you
            want focused expertise, faster entry, and a clear career ladder inside diamond houses or retailers.
            Pick <strong>gemologist</strong> if you're drawn to broader scientific work, want longer-term independence,
            and don't mind a longer certification path.
          </p>

          <h2 className="text-xl font-bold mt-8 mb-2">Getting started in Malaysia</h2>
          <ul className="list-disc pl-5 text-gray-700 leading-relaxed space-y-1.5 mb-4">
            <li>Diploma/degree in any field — STEM helps but isn't required</li>
            <li>Trainee programmes available at established diamond houses in KL and PJ</li>
            <li>GIA / AIGS / HRD certification often funded after probation</li>
            <li>Apply through DNJ for AI-curated matching with hiring labs and houses</li>
          </ul>

          <div className="rounded-2xl bg-[#0B1742] text-white p-6 text-center mt-6">
            <p className="text-base font-semibold mb-3">Apply for diamond grading or gemology roles</p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link
                to="/jobs/diamond-grader"
                className="inline-flex items-center px-5 py-2.5 rounded-xl bg-white text-[#0B1742] text-sm font-semibold hover:bg-gray-100"
              >
                Diamond grader jobs
              </Link>
              <Link
                to="/jobs/gemologist"
                className="inline-flex items-center px-5 py-2.5 rounded-xl border border-white/40 text-white text-sm font-semibold hover:bg-white/10"
              >
                Gemologist jobs
              </Link>
            </div>
          </div>
        </article>

        <RelatedLinks
          roles={['diamond-grader', 'gemologist', 'jeweler', 'jewelry-designer']}
          locations={['kuala-lumpur', 'petaling-jaya']}
          hires={[
            { slug: 'diamond-grader', label: 'Hire diamond graders' },
            { slug: 'gemologist', label: 'Hire gemologists' },
          ]}
          blog={[
            { slug: 'urgent-hiring-malaysia-2026', label: 'Urgent Hiring Near Me 2026' },
            { slug: 'cadet-pilot-program-malaysia-guide', label: 'Cadet Pilot Program Malaysia 2026' },
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
