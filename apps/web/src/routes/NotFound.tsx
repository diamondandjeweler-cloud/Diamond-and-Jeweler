import { Link } from 'react-router-dom'
import { useSeo } from '../lib/useSeo'

export default function NotFound() {
  useSeo({ title: 'Page not found', noindex: true })
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-ink-50">
      <div className="max-w-md text-center">
        <div className="font-display text-8xl text-ink-200 mb-4">404</div>
        <h1 className="font-display text-2xl text-ink-900 mb-2">Page not found</h1>
        <p className="text-ink-500 mb-6">
          The page you're looking for doesn't exist or has moved.
        </p>
        <Link to="/" className="btn-primary">Back to home</Link>
      </div>
    </div>
  )
}
