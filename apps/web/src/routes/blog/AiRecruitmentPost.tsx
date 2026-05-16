import { Link } from 'react-router-dom'
import { useSeo } from '../../lib/useSeo'
import RelatedLinks from '../../components/RelatedLinks'

const POST_KEYWORDS =
  'AI recruitment, AI recruitment Malaysia, AI job matching, curated recruitment, how AI hiring works, AI-curated matching, recruitment platform Malaysia, talent matching, three matches per role, passive talent, AI compatibility engine, modern recruitment, job matching platform'

const PUBLISHED = '2026-05-10'

export default function AiRecruitmentPost() {
  useSeo({
    title: 'How AI Recruitment Works — Three Matches Beat Hundreds',
    description:
      'How AI-curated recruitment works, and why three well-matched roles beat a hundred cold applications. A plain-English explanation of compatibility matching for talent and hiring managers.',
    keywords: POST_KEYWORDS,
    canonicalPath: '/careers/ai-recruitment-explained',
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
            name: 'How AI Recruitment Works',
            item: 'https://diamondandjeweler.com/careers/ai-recruitment-explained',
          },
        ],
      },
      {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: 'How AI Recruitment Works — Three Matches Beat Hundreds',
        description:
          'A plain-English explanation of how AI-curated recruitment matches talent and hiring managers — and why a small set of strong matches beats mass applications.',
        datePublished: PUBLISHED,
        dateModified: PUBLISHED,
        inLanguage: 'en-MY',
        author: { '@type': 'Organization', name: 'DNJ — Diamond & Jeweler' },
        publisher: {
          '@type': 'Organization',
          name: 'DNJ — Diamond & Jeweler',
          logo: { '@type': 'ImageObject', url: 'https://diamondandjeweler.com/og-image.svg' },
        },
        mainEntityOfPage: 'https://diamondandjeweler.com/careers/ai-recruitment-explained',
        about: 'AI-curated recruitment and job matching',
        keywords: POST_KEYWORDS,
      },
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'Does AI recruitment replace human hiring decisions?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'No. AI handles matching and shortlisting — surfacing the most compatible candidates or roles. The interview, judgement and final decision stay fully human. AI removes the noise so people can focus on the conversations that matter.',
            },
          },
          {
            '@type': 'Question',
            name: 'Why only three matches at a time?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'A small, high-quality set is easier to evaluate properly than a hundred listings. Three strong, genuinely-aligned matches respect everyone’s time and lead to better outcomes than mass applications.',
            },
          },
          {
            '@type': 'Question',
            name: 'Is my data safe with AI recruitment?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'On DNJ, personal data is end-to-end encrypted and PDPA-compliant. Employers see only what you choose to share, and only after mutual interest is confirmed.',
            },
          },
        ],
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
          <span aria-current="page" className="text-gray-700">How AI Recruitment Works</span>
        </nav>

        <article>
          <p className="text-[#C9A24D] tracking-[0.3em] text-[11px] font-semibold mb-2">CAREERS · INSIGHTS · 2026</p>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">
            How AI Recruitment Works — Three Matches Beat Hundreds
          </h1>
          <p className="text-xs text-gray-500 mb-6">Published <time dateTime={PUBLISHED}>{PUBLISHED}</time> · 6 min read</p>

          <p className="text-gray-700 leading-relaxed mb-4">
            "AI recruitment" gets used loosely. For job seekers it can sound like a black box deciding your
            future; for employers, like a gimmick. The reality is more mundane and more useful: AI is good at
            one specific thing — <strong>matching</strong> — and when it does that job well, everyone spends
            less time on noise and more time on real conversations.
          </p>

          <h2 className="text-xl font-bold mt-8 mb-2">The problem with the old way</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            Traditional job boards optimise for volume. A talent fires off 80 applications; an employer receives
            300 CVs per role. Both sides drown. The signal — genuine fit — is buried under quantity. Most
            applications never get a real read, and most candidates never hear back. It is a slow, demoralising
            process for everyone.
          </p>

          <h2 className="text-xl font-bold mt-8 mb-2">What a compatibility engine actually does</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            A matching engine compares two structured profiles — a talent's and a role's — across many
            dimensions at once, then scores how well they align. Good systems look well beyond keyword overlap:
          </p>
          <ul className="list-disc pl-5 text-gray-700 leading-relaxed space-y-1.5 mb-4">
            <li><strong>Skills and experience</strong> — depth, recency and relevance, not just job titles</li>
            <li><strong>Career trajectory</strong> — where someone is heading, not only where they have been</li>
            <li><strong>Culture and working style</strong> — pace, autonomy, team shape</li>
            <li><strong>Compensation alignment</strong> — realistic expectations on both sides</li>
            <li><strong>Practical fit</strong> — location, role type, availability</li>
          </ul>
          <p className="text-gray-700 leading-relaxed mb-3">
            The output is a ranked shortlist. Crucially, the engine does not <em>decide</em> anything — it
            surfaces the strongest candidates so a human can make the call faster and with better information.
          </p>

          <h2 className="text-xl font-bold mt-8 mb-2">Why three, not three hundred</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            DNJ deliberately delivers a small set of matches at a time. This is not a limitation — it is the
            point. Three genuinely-aligned options can each be evaluated properly: read fully, considered,
            responded to. Three hundred cannot. Quality of attention beats quantity of listings, and a short
            list respects everyone's time.
          </p>

          <h2 className="text-xl font-bold mt-8 mb-2">What AI does not do</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            It is worth being precise. On a well-designed platform, AI does <strong>not</strong> conduct
            interviews, does <strong>not</strong> make the hiring decision, and does <strong>not</strong> rank
            people by anything it cannot justify. Interviews, judgement and offers stay human. AI's job is to
            get the right people in front of each other — nothing more.
          </p>

          <h2 className="text-xl font-bold mt-8 mb-2">Privacy is part of the design</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            Matching only works if people are honest in their profiles, and people are only honest when their
            data is safe. On DNJ, personal data is end-to-end encrypted and handled under Malaysia's PDPA.
            Employers see only what you choose to share, and only once there is mutual interest. Your profile
            can work passively in the background without broadcasting that you are looking.
          </p>

          <h2 className="text-xl font-bold mt-8 mb-2">For employers</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            The same logic runs in reverse: instead of a CV pile, a hiring manager receives a small set of
            vetted, compatibility-scored profiles per role — including passive talent who are not actively
            applying but are a strong fit. Less screening, faster shortlists, better conversations.
          </p>

          <div className="rounded-2xl bg-[#0B1742] text-white p-6 text-center mt-6">
            <p className="text-base font-semibold mb-3">See curated matching in action</p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link
                to="/start/talent"
                className="inline-flex items-center px-5 py-2.5 rounded-xl bg-white text-[#0B1742] text-sm font-semibold hover:bg-gray-100"
              >
                I'm looking for a role
              </Link>
              <Link
                to="/start/hiring"
                className="inline-flex items-center px-5 py-2.5 rounded-xl border border-white/40 text-white text-sm font-semibold hover:bg-white/10"
              >
                I'm hiring
              </Link>
            </div>
          </div>
        </article>

        <RelatedLinks
          roles={['pilot', 'jeweler', 'diamond-grader', 'software-developer']}
          locations={['kuala-lumpur', 'petaling-jaya', 'penang']}
          hires={[{ slug: 'sales-team', label: 'Hire a sales team' }]}
          blog={[
            { slug: 'urgent-hiring-malaysia-2026', label: 'Urgent Hiring Near Me 2026' },
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
