import { Link, Navigate, useParams } from 'react-router-dom'
import { useSeo } from '../lib/useSeo'

/**
 * Splash between the landing icons and sign-up / sign-in.
 *
 *   /start/talent  → diamond path
 *   /start/hiring  → magnifier path (routes HR to signup; HMs still arrive via invite)
 *
 * Two buttons, big and clear. "Create new account" or "I already have an account".
 * Unknown `side` values bounce back to the landing picker.
 */
export default function Start() {
  const { side } = useParams<{ side: string }>()
  const isTalent = side === 'talent'
  useSeo({
    title: isTalent ? 'Find your next role' : 'Hire with precision',
    description: isTalent
      ? 'DNJ matches talent in Malaysia with exactly three curated roles at a time. Zero noise, three real opportunities.'
      : 'DNJ delivers exactly three qualified candidates per open role to hiring managers and HR teams across Malaysia.',
  })
  if (side !== 'talent' && side !== 'hiring') {
    return <Navigate to="/" replace />
  }

  const heading = isTalent ? 'Welcome, talent.' : 'Welcome, hiring manager.'
  const subheading = isTalent
    ? "Let's get your profile built — takes about 10 minutes."
    : "Hire with curation, not résumé piles."
  const signupRole = isTalent ? 'talent' : 'hr_admin'

  return (
    <div className="min-h-screen bg-ink-50 flex flex-col">
      <a
        href="#start-main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 bg-ink-900 text-white px-3 py-2 rounded z-50 text-sm"
      >
        Skip to main content
      </a>
      <header className="px-6 py-5">
        <Link to="/" className="inline-flex items-center gap-2 text-ink-600 hover:text-ink-900 text-sm">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path d="M12 7H2m0 0l4-4m-4 4l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </Link>
      </header>

      <main id="start-main" className="flex-1 flex items-center justify-center px-6 py-8">
        <div className="max-w-md w-full text-center">
          <div className="mx-auto mb-6 h-20 w-20 flex items-center justify-center">
            {isTalent ? <SmallDiamond /> : <SmallMagnifier />}
          </div>
          <h1 className="font-display text-3xl text-ink-900 mb-2">{heading}</h1>
          <p className="text-ink-500 mb-10">{subheading}</p>

          <div className="space-y-3">
            <Link
              to={`/signup?role=${signupRole}`}
              className="btn-primary btn-lg w-full"
            >
              Create new account
            </Link>
            <Link
              to="/login"
              className="btn-secondary btn-lg w-full"
            >
              I already have an account
            </Link>
          </div>

          {isTalent && (
            <p className="mt-8 text-xs text-ink-500 leading-relaxed">
              You'll upload your ID and résumé, chat with our interviewer, then wait
              for your first three curated offers. Everything is encrypted and
              never shared without your consent.
            </p>
          )}
        </div>
      </main>

      <footer className="py-6 text-center text-xs text-ink-500 space-x-3">
        <Link to="/privacy" className="hover:text-ink-900">Privacy</Link>
        <span>·</span>
        <Link to="/terms" className="hover:text-ink-900">Terms</Link>
      </footer>
    </div>
  )
}

function SmallDiamond() {
  return (
    <svg width="72" height="72" viewBox="0 0 90 90" fill="none" aria-hidden>
      <polygon points="20,32 45,10 70,32" fill="#e8edff" stroke="#27306e" strokeWidth="1.5" strokeLinejoin="round" />
      <line x1="20" y1="32" x2="70" y2="32" stroke="#27306e" strokeWidth="1.5" />
      <polygon points="20,32 70,32 45,78" fill="#5468ef" stroke="#27306e" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

function SmallMagnifier() {
  return (
    <svg width="72" height="72" viewBox="0 0 90 90" fill="none" aria-hidden>
      <circle cx="38" cy="38" r="24" fill="#f8f8f7" stroke="#22231f" strokeWidth="3" />
      <polygon points="28,36 38,28 48,36" fill="#a6b6ff" stroke="#27306e" strokeWidth="1" strokeLinejoin="round" />
      <polygon points="28,36 48,36 38,50" fill="#5468ef" stroke="#27306e" strokeWidth="1" strokeLinejoin="round" />
      <line x1="56" y1="56" x2="78" y2="78" stroke="#22231f" strokeWidth="5" strokeLinecap="round" />
    </svg>
  )
}
