import { Link } from 'react-router-dom'
import { useSeo } from '../lib/useSeo'
import { Button } from '../components/ui'

// Terminal notice shown after the session layer detects profiles.is_banned and
// signs the user out (see state/useSession.ts enforceBan). Public + noindex so a
// signed-out banned user can still reach it.
export default function Banned() {
  useSeo({ title: 'Account suspended', noindex: true })
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-ink-50">
      <div className="max-w-md text-center">
        <div className="font-display text-7xl text-ink-200 mb-4">⛔</div>
        <h1 className="font-display text-2xl text-ink-900 mb-2">Account suspended</h1>
        <p className="text-ink-500 mb-6">
          Your account has been suspended and you have been signed out. If you
          believe this is a mistake, please contact us at{' '}
          <a href="mailto:support@diamondandjeweler.com" className="text-brand-600 hover:underline">
            support@diamondandjeweler.com
          </a>.
        </p>
        <Button asChild variant="primary"><Link to="/">Return to homepage</Link></Button>
      </div>
    </div>
  )
}
