import { Link } from 'react-router-dom'
import { useSeo } from '../lib/useSeo'

const ORIGIN = 'https://diamondandjeweler.com'

const ABOUT_KEYWORDS =
  'about DNJ, what is DNJ, DNJ recruitment, Bole AI, AI talent scout, AI recruitment Malaysia, advanced AI matching, curated recruitment, how DNJ works, diamond and jeweler recruitment, AI job matching Malaysia, three matches recruitment'

const FACETS = [
  'Skills',
  'Career trajectory',
  'Character',
  'Working style',
  'Growth potential',
  'Culture fit',
]

export default function About() {
  useSeo({
    title: 'About DNJ — Bole, the AI That Recognises Your Brilliance',
    description:
      "DNJ is an AI-curated recruitment platform for Malaysia. Meet Bole — our advanced AI talent scout that recognises your potential and matches you with the leader who brings out your brilliance. You're already a diamond; let the world see it.",
    keywords: ABOUT_KEYWORDS,
    canonicalPath: '/about',
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${ORIGIN}/` },
          { '@type': 'ListItem', position: 2, name: 'About', item: `${ORIGIN}/about` },
        ],
      },
      {
        '@context': 'https://schema.org',
        '@type': 'AboutPage',
        name: 'About DNJ — Bole, the AI That Recognises Your Brilliance',
        url: `${ORIGIN}/about`,
        inLanguage: 'en-MY',
        about: 'DNJ — AI-curated recruitment platform and the Bole matching engine',
      },
      {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: 'DNJ — Diamond & Jeweler',
        url: ORIGIN,
        logo: `${ORIGIN}/og-image.svg`,
        slogan: "You're already a diamond. Let the world see it.",
        description:
          'DNJ is a general AI-curated recruitment platform for Malaysia. Its matching engine, Bole, recognises a candidate’s potential across multiple facets and delivers up to three curated matches per role — quality over volume, zero noise.',
        areaServed: { '@type': 'Country', name: 'Malaysia' },
      },
    ],
  })

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
          <span aria-current="page" className="text-gray-700">About</span>
        </nav>

        {/* Hero */}
        <section
          className="rounded-3xl overflow-hidden text-white"
          style={{ background: 'radial-gradient(120% 120% at 80% 0%, #1B2A6B 0%, #0B1742 45%, #0B1220 100%)' }}
        >
          <div className="grid md:grid-cols-[1.15fr_.85fr] gap-6 items-center px-8 md:px-12 py-12 md:py-14">
            <div>
              <p className="text-[#C9A24D] tracking-[0.28em] text-[11px] font-bold">
                ADVANCED AI MATCHING · MALAYSIA
              </p>
              <h1 className="text-[34px] md:text-[46px] font-extrabold leading-[1.08] tracking-tight mt-3 mb-4">
                You&apos;re already a <span className="text-[#C9A24D]">diamond.</span>
                <br />
                Let the world see it.
              </h1>
              <p className="text-[#c7cef0] text-[15px] md:text-base max-w-[30em] leading-relaxed">
                Your brilliance is real — most job boards just can&apos;t see it.{' '}
                <strong className="text-white">Bole</strong>, our advanced AI, recognises what others
                miss and matches you with the leader who brings your light out. Three matches. Not
                three thousand listings.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  to="/start/talent"
                  className="inline-flex items-center px-5 py-3 rounded-xl bg-[#C9A24D] text-[#0B1220] text-sm font-bold hover:bg-[#d8b straightforward]"
                  style={{ backgroundColor: '#C9A24D' }}
                >
                  Discover my matches →
                </Link>
                <Link
                  to="/start/hiring"
                  className="inline-flex items-center px-5 py-3 rounded-xl border border-white/35 text-white text-sm font-bold hover:bg-white/10"
                >
                  I&apos;m hiring talent
                </Link>
              </div>
            </div>
            <div className="flex justify-center">
              <svg width="220" height="220" viewBox="0 0 200 200" fill="none" aria-hidden>
                <ellipse cx="100" cy="108" rx="90" ry="78" fill="#a6b6ff" opacity="0.18" />
                <g transform="translate(100 104)">
                  <polygon points="-58,-26 -38,-50 0,-50 38,-50 58,-26" fill="#dbe4ff" />
                  <polygon points="-38,-50 0,-50 -20,-26" fill="#fff" />
                  <polygon points="0,-50 20,-26 -20,-26" fill="#eef1ff" />
                  <polygon points="-58,-26 -36,-26 0,58" fill="#7b8efc" />
                  <polygon points="-36,-26 16,-26 0,58" fill="#5468ef" />
                  <polygon points="16,-26 58,-26 0,58" fill="#3e4fd3" />
                  <line x1="-58" y1="-26" x2="58" y2="-26" stroke="#fff" strokeWidth="1.2" opacity="0.7" />
                  <polygon points="-30,-48 24,-48 12,-30 -22,-30" fill="#fff" opacity="0.6" />
                </g>
                <g fill="#C9A24D">
                  <path d="M40 50 l2 5 5 2 -5 2 -2 5 -2-5 -5-2 5-2z" />
                  <path d="M165 90 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6-4 -4-1.6 4-1.6z" />
                  <path d="M150 150 l1.4 3.4 3.4 1.4 -3.4 1.4 -1.4 3.4 -1.4-3.4 -3.4-1.4 3.4-1.4z" />
                </g>
              </svg>
            </div>
          </div>
        </section>

        {/* Transformation */}
        <section className="mt-16">
          <p className="text-[#C9A24D] tracking-[0.28em] text-[11px] font-bold">THE DNJ DIFFERENCE</p>
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight mt-2 mb-2">
            Every diamond starts uncut
          </h2>
          <p className="text-gray-600 max-w-[44em] leading-relaxed">
            The brilliance is already in you. What&apos;s missing isn&apos;t talent — it&apos;s the eye
            that recognises it, and the setting that lets it shine.
          </p>
          <div className="grid md:grid-cols-3 gap-4 mt-8">
            <div className="rounded-2xl border border-[#e8edff] bg-gradient-to-b from-white to-[#fafbff] p-6 text-center">
              <svg width="46" height="46" viewBox="0 0 60 60" className="mx-auto" aria-hidden>
                <g transform="translate(30 31)">
                  <polygon points="-17,-8 -11,-15 11,-15 17,-8 0,18" fill="#cbd2e0" />
                  <polygon points="-17,-8 17,-8 0,18" fill="#aab3c6" />
                  <line x1="-17" y1="-8" x2="17" y2="-8" stroke="#e8ecf3" strokeWidth="1" />
                </g>
              </svg>
              <h3 className="font-bold text-[#0B1220] mt-3 mb-1.5">1 · Uncut</h3>
              <p className="text-sm text-gray-600 leading-snug">
                Your potential is real — but uncut, it&apos;s easy to miss. Generic job boards bury you
                among millions.
              </p>
            </div>
            <div className="rounded-2xl border border-[#C9A24D] bg-gradient-to-b from-white to-[#fafbff] p-6 text-center shadow-[0_12px_30px_-16px_rgba(201,162,77,0.55)]">
              <svg width="46" height="46" viewBox="0 0 60 60" className="mx-auto" aria-hidden>
                <g transform="translate(27 28)">
                  <polygon points="-15,-7 -9,-13 9,-13 15,-7 0,16" fill="#dbe4ff" />
                  <polygon points="-15,-7 15,-7 0,16" fill="#7b8efc" />
                </g>
                <circle cx="38" cy="38" r="13" fill="none" stroke="#C9A24D" strokeWidth="3.5" />
                <line x1="47" y1="47" x2="56" y2="56" stroke="#C9A24D" strokeWidth="4" strokeLinecap="round" />
              </svg>
              <h3 className="font-bold text-[#8a6420] mt-3 mb-1.5">2 · Bole recognises you</h3>
              <p className="text-sm text-gray-600 leading-snug">
                Our AI sees the diamond others walk past — reading your facets the way the legendary
                Bole spotted a thousand-li horse.
              </p>
            </div>
            <div className="rounded-2xl border border-[#e8edff] bg-gradient-to-b from-white to-[#fafbff] p-6 text-center">
              <svg width="46" height="46" viewBox="0 0 60 60" className="mx-auto" aria-hidden>
                <g transform="translate(30 31)">
                  <polygon points="-17,-8 -11,-15 11,-15 17,-8 0,18" fill="#eef1ff" />
                  <polygon points="-17,-8 17,-8 0,18" fill="#5468ef" />
                  <line x1="-17" y1="-8" x2="17" y2="-8" stroke="#fff" strokeWidth="1.4" />
                  <polygon points="-9,-13 7,-13 3,-9 -6,-9" fill="#fff" opacity="0.7" />
                </g>
                <g fill="#C9A24D">
                  <path d="M48 12 l1.4 3.4 3.4 1.4 -3.4 1.4 -1.4 3.4 -1.4-3.4 -3.4-1.4 3.4-1.4z" />
                  <path d="M12 16 l1 2.6 2.6 1 -2.6 1 -1 2.6 -1-2.6 -2.6-1 2.6-1z" />
                </g>
              </svg>
              <h3 className="font-bold text-[#0B1220] mt-3 mb-1.5">3 · Set to shine</h3>
              <p className="text-sm text-gray-600 leading-snug">
                Matched to the right leader and the right setting, your brilliance finally catches the
                light.
              </p>
            </div>
          </div>
        </section>

        {/* Meet Bole */}
        <section className="mt-16">
          <div className="rounded-3xl bg-[#0B1220] text-white p-8 md:p-12 grid md:grid-cols-[0.9fr_1.1fr] gap-8 md:gap-10 items-center">
            <div className="text-center">
              <div className="text-[88px] font-extrabold text-[#C9A24D] leading-none">伯樂</div>
              <div className="text-gray-400 text-xs tracking-[0.18em] mt-2">B · O · L · E</div>
            </div>
            <div>
              <p className="text-[#C9A24D] tracking-[0.28em] text-[11px] font-bold">
                MEET BOLE — YOUR AI TALENT SCOUT
              </p>
              <h2 className="text-2xl md:text-[28px] font-extrabold mt-2.5 mb-3">
                The legend who could see greatness others missed.
              </h2>
              <p className="text-[#c7cef0] text-[15px] leading-relaxed">
                In Chinese tradition, Bole was the one man who could recognise a{' '}
                <em>thousand-li horse</em> — an extraordinary talent — that everyone else walked
                straight past. The horse was always extraordinary. What was rare was the{' '}
                <em>eye that could see it</em>.
              </p>
              <p className="text-[#c7cef0] text-[15px] leading-relaxed mt-2.5">
                We named our AI after him. Bole doesn&apos;t create your worth — it{' '}
                <strong className="text-white">recognises</strong> it, reading six facets of who you
                are, then introduces you to the leaders who&apos;ll help it shine.
              </p>
              <ul className="flex flex-wrap gap-2 mt-5">
                {FACETS.map((f) => (
                  <li
                    key={f}
                    className="rounded-full border border-[#a6b6ff]/30 bg-[#a6b6ff]/[0.14] text-[#dbe4ff] px-3.5 py-1.5 text-[12.5px]"
                  >
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Vs others */}
        <section className="mt-16">
          <p className="text-[#C9A24D] tracking-[0.28em] text-[11px] font-bold">WHY DNJ STANDS OUT</p>
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight mt-2 mb-6">
            Most platforms make you search. Bole makes you seen.
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-2xl bg-gray-100 border border-gray-200 p-7">
              <p className="text-[11px] tracking-[0.14em] font-bold text-gray-400">ORDINARY JOB BOARDS</p>
              <h3 className="text-lg font-bold text-gray-500 mt-1 mb-1">You do the digging</h3>
              <ul className="list-disc pl-5 mt-3 space-y-1.5 text-sm text-gray-600">
                <li>A thousand listings — you sift through them alone</li>
                <li>Keyword-matched to your résumé</li>
                <li>You apply cold and hope someone replies</li>
                <li>Quantity over fit</li>
              </ul>
            </div>
            <div className="rounded-2xl bg-gradient-to-b from-[#fffaf1] to-white border border-[#C9A24D] p-7">
              <p className="text-[11px] tracking-[0.14em] font-bold text-[#8a6420]">DNJ — WITH BOLE</p>
              <h3 className="text-lg font-bold text-[#8a6420] mt-1 mb-1">Bole brings you forward</h3>
              <ul className="list-disc pl-5 mt-3 space-y-1.5 text-sm text-gray-700">
                <li>Bole recognises you and returns 3 settings where you&apos;ll shine</li>
                <li>Matched on your facets — who you are, not just keywords</li>
                <li>You&apos;re discovered — the right leaders come to you</li>
                <li>Three matches, zero noise</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Employer band */}
        <section className="mt-16">
          <div
            className="rounded-3xl text-white text-center px-8 md:px-12 py-12"
            style={{ background: 'radial-gradient(100% 140% at 50% 0%, #1B2A6B, #0B1742)' }}
          >
            <p className="text-[#C9A24D] tracking-[0.28em] text-[11px] font-bold">FOR EMPLOYERS</p>
            <h2 className="text-2xl md:text-[26px] font-extrabold max-w-[22em] mx-auto mt-2 mb-2.5">
              The right leader doesn&apos;t create talent — they{' '}
              <span className="text-[#C9A24D]">reveal</span> it.
            </h2>
            <p className="text-[#c7cef0] text-[15px] max-w-[36em] mx-auto leading-relaxed">
              A great leader brings out the brilliance a person already carries. Bole matches you with
              high-potential people ready for exactly that — aligned to your team, your culture and
              your brief.
            </p>
            <div className="mt-6">
              <Link
                to="/start/hiring"
                className="inline-flex items-center px-5 py-3 rounded-xl bg-[#C9A24D] text-[#0B1220] text-sm font-bold hover:opacity-90"
              >
                Start hiring with Bole →
              </Link>
            </div>
          </div>
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
