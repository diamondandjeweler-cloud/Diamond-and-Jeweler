import { Link } from 'react-router-dom'
import { useSeo } from '../../lib/useSeo'
import RelatedLinks from '../../components/RelatedLinks'

const POST_KEYWORDS =
  'luxury retail jobs Malaysia, luxury retail jobs Kuala Lumpur, jewelry sales associate job, watch sales associate, boutique manager job, luxury brand job Malaysia, clienteling, retail sales luxury, KLCC retail jobs, Pavilion KL retail jobs, luxury retail career, sales associate luxury, retail job diamond, jewellery retail Malaysia'

const PUBLISHED = '2026-05-10'

export default function LuxuryRetailJobsPost() {
  useSeo({
    title: 'Luxury Retail Jobs in Kuala Lumpur — Hiring Guide 2026',
    description:
      'Guide to luxury retail jobs in Kuala Lumpur — sales associate, clienteling, boutique manager roles in jewelry, watches and fashion. Salary ranges, what brands look for, and the career ladder.',
    keywords: POST_KEYWORDS,
    canonicalPath: '/careers/luxury-retail-jobs-malaysia',
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
            name: 'Luxury Retail Jobs in Kuala Lumpur',
            item: 'https://diamondandjeweler.com/careers/luxury-retail-jobs-malaysia',
          },
        ],
      },
      {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: 'Luxury Retail Jobs in Kuala Lumpur — Hiring Guide 2026',
        description:
          'What luxury retail jobs in Kuala Lumpur involve — sales associate, clienteling, boutique manager — plus salary ranges, what brands look for, and the career ladder.',
        datePublished: PUBLISHED,
        dateModified: PUBLISHED,
        inLanguage: 'en-MY',
        author: { '@type': 'Organization', name: 'DNJ — Diamond & Jeweler' },
        publisher: {
          '@type': 'Organization',
          name: 'DNJ — Diamond & Jeweler',
          logo: { '@type': 'ImageObject', url: 'https://diamondandjeweler.com/og-image.svg' },
        },
        mainEntityOfPage: 'https://diamondandjeweler.com/careers/luxury-retail-jobs-malaysia',
        about: 'Luxury retail careers in Kuala Lumpur, Malaysia',
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
          <span aria-current="page" className="text-gray-700">Luxury Retail Jobs in Kuala Lumpur</span>
        </nav>

        <article>
          <p className="text-[#C9A24D] tracking-[0.3em] text-[11px] font-semibold mb-2">CAREERS · LUXURY · 2026</p>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">
            Luxury Retail Jobs in Kuala Lumpur — Hiring Guide 2026
          </h1>
          <p className="text-xs text-gray-500 mb-6">Published <time dateTime={PUBLISHED}>{PUBLISHED}</time> · 7 min read</p>

          <p className="text-gray-700 leading-relaxed mb-4">
            Luxury retail is one of Kuala Lumpur's most stable — and most underrated — career paths. Behind every
            jewelry counter at Pavilion, Suria KLCC or The Exchange TRX is a team of trained professionals whose
            work is far more skilled than the "shop assistant" label suggests. This guide covers what luxury
            retail jobs actually involve, what brands look for, salary ranges, and how the career ladder works.
          </p>

          <h2 className="text-xl font-bold mt-8 mb-2">The main luxury retail roles</h2>
          <ul className="list-disc pl-5 text-gray-700 leading-relaxed space-y-1.5 mb-4">
            <li><strong>Sales associate</strong> — the front line: product knowledge, styling advice, closing sales, after-care</li>
            <li><strong>Clienteling specialist</strong> — builds long-term relationships with VIP clients, manages a personal book</li>
            <li><strong>Boutique supervisor</strong> — runs a shift, handles escalations, coaches juniors</li>
            <li><strong>Boutique manager</strong> — full P&amp;L, inventory, team hiring, brand standards</li>
            <li><strong>Visual merchandiser</strong> — window and in-store display, brand-mandated layouts</li>
          </ul>

          <h2 className="text-xl font-bold mt-8 mb-2">Salary ranges in Kuala Lumpur</h2>
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm border border-gray-200">
              <thead className="bg-[#fafbff]">
                <tr>
                  <th className="text-left p-3 border-b border-gray-200">Role</th>
                  <th className="text-left p-3 border-b border-gray-200">Monthly base (KL)</th>
                  <th className="text-left p-3 border-b border-gray-200">With commission</th>
                </tr>
              </thead>
              <tbody className="text-gray-700">
                <tr>
                  <td className="p-3 border-b border-gray-200 font-semibold">Sales associate</td>
                  <td className="p-3 border-b border-gray-200">RM 2,800–4,500</td>
                  <td className="p-3 border-b border-gray-200">RM 4,000–7,000</td>
                </tr>
                <tr>
                  <td className="p-3 border-b border-gray-200 font-semibold">Senior associate</td>
                  <td className="p-3 border-b border-gray-200">RM 4,000–6,000</td>
                  <td className="p-3 border-b border-gray-200">RM 6,000–9,500</td>
                </tr>
                <tr>
                  <td className="p-3 border-b border-gray-200 font-semibold">Boutique supervisor</td>
                  <td className="p-3 border-b border-gray-200">RM 5,000–7,500</td>
                  <td className="p-3 border-b border-gray-200">RM 7,000–11,000</td>
                </tr>
                <tr>
                  <td className="p-3 font-semibold">Boutique manager</td>
                  <td className="p-3">RM 8,000–14,000</td>
                  <td className="p-3">RM 11,000–18,000+</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-gray-700 leading-relaxed mb-3">
            Figures are indicative ranges for the Klang Valley luxury segment and vary by brand tier, foot
            traffic and individual performance. Commission structures differ — jewelry and watch boutiques
            typically pay stronger incentives than fashion.
          </p>

          <h2 className="text-xl font-bold mt-8 mb-2">What luxury brands actually look for</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            Contrary to popular belief, most luxury houses do <em>not</em> require prior luxury experience for
            entry-level roles. They hire for traits that are hard to train:
          </p>
          <ul className="list-disc pl-5 text-gray-700 leading-relaxed space-y-1.5 mb-4">
            <li><strong>Language range</strong> — English plus Bahasa Malaysia; Mandarin or Cantonese is a strong advantage with tourist and VIP clientele</li>
            <li><strong>Composure</strong> — calm, unhurried presence; comfort with high-value transactions</li>
            <li><strong>Genuine curiosity</strong> — willingness to learn product heritage, materials and craftsmanship</li>
            <li><strong>Service instinct</strong> — reading a client, not pushing a sale</li>
            <li><strong>Reliability</strong> — consistent attendance, grooming standards, shift commitment</li>
          </ul>
          <p className="text-gray-700 leading-relaxed mb-3">
            Product training, brand history and selling ceremony are taught on the job. Diploma or degree holders
            and SPM leavers are both welcome — what matters is attitude and polish.
          </p>

          <h2 className="text-xl font-bold mt-8 mb-2">The career ladder</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            Luxury retail rewards people who stay. A typical progression: sales associate → senior associate →
            clienteling specialist or supervisor → assistant boutique manager → boutique manager → area or
            retail operations manager. Strong performers can also move sideways into training, visual
            merchandising, or wholesale and brand roles. The jewelry and watch segments additionally open doors
            into product, buying and gemology-adjacent specialisms.
          </p>

          <h2 className="text-xl font-bold mt-8 mb-2">Where the jobs are</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            The Klang Valley concentration is in Suria KLCC, Pavilion KL, The Exchange TRX, Starhill Gallery and
            Mid Valley / The Gardens. Penang's Gurney area and Johor Bahru's premium malls also recruit. Luxury
            retail roles are some of the most consistent listings in Malaysia's job market across the year.
          </p>

          <h2 className="text-xl font-bold mt-8 mb-2">How to apply through DNJ</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            DNJ matches luxury retail talent with hiring brands using a curated, AI-powered compatibility engine —
            you receive a small set of genuinely aligned roles rather than a flood of listings. Build a profile
            once and it works passively. Your data is end-to-end encrypted and PDPA-compliant, and brands see
            only what you choose to share until there's mutual interest.
          </p>

          <div className="rounded-2xl bg-[#0B1742] text-white p-6 text-center mt-6">
            <p className="text-base font-semibold mb-3">Explore luxury retail roles</p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link
                to="/jobs/luxury-retail"
                className="inline-flex items-center px-5 py-2.5 rounded-xl bg-white text-[#0B1742] text-sm font-semibold hover:bg-gray-100"
              >
                Luxury retail jobs
              </Link>
              <Link
                to="/start/talent"
                className="inline-flex items-center px-5 py-2.5 rounded-xl border border-white/40 text-white text-sm font-semibold hover:bg-white/10"
              >
                Create your profile
              </Link>
            </div>
          </div>
        </article>

        <RelatedLinks
          roles={['luxury-retail', 'jeweler', 'sales-executive', 'customer-service']}
          locations={['kuala-lumpur', 'petaling-jaya', 'penang']}
          hires={[{ slug: 'luxury-retail-staff', label: 'Hire luxury retail staff' }]}
          blog={[
            { slug: 'jewellery-shop-hiring-malaysia', label: 'Jewellery Shop Hiring Malaysia' },
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
