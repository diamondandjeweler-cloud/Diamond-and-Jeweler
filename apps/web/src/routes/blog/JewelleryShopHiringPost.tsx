import { Link } from 'react-router-dom'
import { useSeo } from '../../lib/useSeo'
import RelatedLinks from '../../components/RelatedLinks'

const POST_KEYWORDS =
  'jewellery shop hiring Malaysia, jewelry shop hiring, jewellery shop jobs, jewelry retail hiring, hire jewellery staff, jewellery sales associate, bench jeweler hiring, jewellery shop career, jewelry store jobs Malaysia, jewellery retail Kuala Lumpur, what jewellery shops look for'

const PUBLISHED = '2026-05-10'

export default function JewelleryShopHiringPost() {
  useSeo({
    title: 'Jewellery Shop Hiring Malaysia — What Companies Look For',
    description:
      'What jewellery shops in Malaysia look for when hiring — roles, traits, training, and the trust factor. A practical guide for job seekers and a hiring checklist for shop owners.',
    keywords: POST_KEYWORDS,
    canonicalPath: '/careers/jewellery-shop-hiring-malaysia',
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
            name: 'Jewellery Shop Hiring Malaysia',
            item: 'https://diamondandjeweler.com/careers/jewellery-shop-hiring-malaysia',
          },
        ],
      },
      {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: 'Jewellery Shop Hiring Malaysia — What Companies Look For',
        description:
          'What jewellery shops in Malaysia look for when hiring — roles, traits, training and the trust factor. A guide for job seekers and shop owners.',
        datePublished: PUBLISHED,
        dateModified: PUBLISHED,
        inLanguage: 'en-MY',
        author: { '@type': 'Organization', name: 'DNJ — Diamond & Jeweler' },
        publisher: {
          '@type': 'Organization',
          name: 'DNJ — Diamond & Jeweler',
          logo: { '@type': 'ImageObject', url: 'https://diamondandjeweler.com/og-image.svg' },
        },
        mainEntityOfPage: 'https://diamondandjeweler.com/careers/jewellery-shop-hiring-malaysia',
        about: 'Jewellery shop hiring and careers in Malaysia',
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
          <span aria-current="page" className="text-gray-700">Jewellery Shop Hiring Malaysia</span>
        </nav>

        <article>
          <p className="text-[#C9A24D] tracking-[0.3em] text-[11px] font-semibold mb-2">CAREERS · JEWELRY · 2026</p>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">
            Jewellery Shop Hiring Malaysia — What Companies Look For
          </h1>
          <p className="text-xs text-gray-500 mb-6">Published <time dateTime={PUBLISHED}>{PUBLISHED}</time> · 6 min read</p>

          <p className="text-gray-700 leading-relaxed mb-4">
            Jewellery shops are a distinctive corner of Malaysia's retail world. The products are high-value, the
            clientele is relationship-driven, and trust matters more than in almost any other shopfront. That
            shapes who jewellery shops hire — and what they look for. This guide works two ways: a practical map
            for job seekers, and a hiring checklist for shop owners.
          </p>

          <h2 className="text-xl font-bold mt-8 mb-2">The roles inside a jewellery shop</h2>
          <ul className="list-disc pl-5 text-gray-700 leading-relaxed space-y-1.5 mb-4">
            <li><strong>Sales associate</strong> — advises customers, handles the counter, manages displays and after-sales</li>
            <li><strong>Bench jeweler</strong> — repairs, resizing, setting, custom fabrication at the workbench</li>
            <li><strong>Stone setter</strong> — a specialist craft: securing diamonds and gems into mounts</li>
            <li><strong>Appraiser / grader</strong> — values pieces and assesses diamond and gem quality</li>
            <li><strong>Shop supervisor / manager</strong> — runs operations, inventory, security and the team</li>
          </ul>

          <h2 className="text-xl font-bold mt-8 mb-2">What jewellery shops look for</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            Because every transaction involves significant value, jewellery employers weigh character heavily
            alongside skill. The recurring priorities:
          </p>
          <ul className="list-disc pl-5 text-gray-700 leading-relaxed space-y-1.5 mb-4">
            <li><strong>Trustworthiness</strong> — a clean record and references; comfort handling valuable stock and cash</li>
            <li><strong>Attention to detail</strong> — accuracy in counting, recording, and inspecting pieces</li>
            <li><strong>Patience and warmth</strong> — jewellery purchases are emotional and unhurried</li>
            <li><strong>Manual dexterity</strong> — essential for bench and setting roles; testable on the spot</li>
            <li><strong>Willingness to learn</strong> — gemology, hallmarks and product knowledge are taught over time</li>
            <li><strong>Language range</strong> — English, Bahasa Malaysia, and often Mandarin for the customer base</li>
          </ul>
          <p className="text-gray-700 leading-relaxed mb-3">
            For sales roles, prior jewellery experience is a bonus but not a requirement — many shops prefer to
            train attitude and polish in-house. For bench and setting roles, a trade certificate or demonstrable
            hand skill carries the most weight.
          </p>

          <h2 className="text-xl font-bold mt-8 mb-2">The trust factor — why hiring is careful</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            Jewellery shops tend to hire deliberately rather than quickly. Expect reference checks, a probation
            period, and sometimes a practical assessment for bench roles. This is not a barrier — it is the
            nature of the trade. Candidates who present honestly, dress neatly, and show genuine interest in the
            craft tend to do well. Stability matters too: shops value people who intend to stay and grow.
          </p>

          <h2 className="text-xl font-bold mt-8 mb-2">For shop owners — a hiring checklist</h2>
          <ul className="list-disc pl-5 text-gray-700 leading-relaxed space-y-1.5 mb-4">
            <li>Define the role precisely — sales, bench and setting attract very different candidates</li>
            <li>Test hand skill for bench roles; test service instinct for sales roles</li>
            <li>Check references properly — the trade is small and reputations travel</li>
            <li>Be clear on probation, security procedures and growth path up front</li>
            <li>Look for retention signals, not just the strongest CV on the day</li>
          </ul>

          <h2 className="text-xl font-bold mt-8 mb-2">A career worth considering</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            Jewellery shop work is steady, skilled and surprisingly future-proof. Sales associates can grow into
            clienteling, appraisal and management. Bench jewelers and setters hold a craft that stays in demand
            for decades. It is one of Malaysia's quieter career-growth paths — and DNJ matches talent with
            jewellery shops, ateliers and luxury houses through curated, AI-powered matching.
          </p>

          <div className="rounded-2xl bg-[#0B1742] text-white p-6 text-center mt-6">
            <p className="text-base font-semibold mb-3">Jewellery careers — both sides</p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link
                to="/jobs/jeweler"
                className="inline-flex items-center px-5 py-2.5 rounded-xl bg-white text-[#0B1742] text-sm font-semibold hover:bg-gray-100"
              >
                Jeweler jobs
              </Link>
              <Link
                to="/hire-jeweler"
                className="inline-flex items-center px-5 py-2.5 rounded-xl border border-white/40 text-white text-sm font-semibold hover:bg-white/10"
              >
                Hire jewellery staff
              </Link>
            </div>
          </div>
        </article>

        <RelatedLinks
          roles={['jeweler', 'diamond-grader', 'gemologist', 'luxury-retail']}
          locations={['kuala-lumpur', 'petaling-jaya', 'penang']}
          hires={[
            { slug: 'jeweler', label: 'Hire jewellers' },
            { slug: 'luxury-retail-staff', label: 'Hire luxury retail staff' },
          ]}
          blog={[
            { slug: 'diamond-grader-vs-gemologist', label: 'Diamond Grader vs Gemologist' },
            { slug: 'luxury-retail-jobs-malaysia', label: 'Luxury Retail Jobs in KL' },
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
