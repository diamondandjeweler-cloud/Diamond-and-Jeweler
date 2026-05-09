// Vercel Edge middleware. Two responsibilities:
//   1. Sliding-window rate-limit /api/* (per IP, 100 req/min).
//   2. Soft edge gate on /admin/* — redirect to /login if no client-set
//      'dnj-auth' presence cookie. The cookie is set by useSession.ts when
//      a Supabase session boots (and cleared on signOut). It is NOT a real
//      auth token — real authorization is enforced by Supabase RLS and the
//      client-side AdminGate. The edge gate exists only to stop drive-by
//      visits to /admin from being served the SPA shell.

const WINDOW_MS = 60_000   // 1 minute
const MAX_REQS  = 100       // per IP per window

interface Bucket { count: number; windowStart: number }
const buckets = new Map<string, Bucket>()

function rateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now()
  let b = buckets.get(ip)
  if (!b || now - b.windowStart > WINDOW_MS) {
    b = { count: 0, windowStart: now }
    buckets.set(ip, b)
  }
  b.count++
  const remaining = Math.max(0, MAX_REQS - b.count)
  return { allowed: b.count <= MAX_REQS, remaining }
}

let evictCounter = 0
function maybeEvict() {
  if (++evictCounter < 500) return
  evictCounter = 0
  const cutoff = Date.now() - WINDOW_MS
  for (const [ip, b] of buckets) {
    if (b.windowStart < cutoff) buckets.delete(ip)
  }
}

function hasAuthHint(req: Request): boolean {
  const cookie = req.headers.get('cookie') ?? ''
  return /(?:^|;\s*)dnj-auth=1(?:;|$)/.test(cookie)
}

export default function middleware(req: Request) {
  const { pathname } = new URL(req.url)

  // /admin gate — soft cookie-presence check before serving the SPA shell.
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    if (!hasAuthHint(req)) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: `/login?from=${encodeURIComponent(pathname)}`,
          'Cache-Control': 'no-store',
        },
      })
    }
    return
  }

  // /api/* — rate limit only.
  if (!pathname.startsWith('/api/')) return

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'

  maybeEvict()
  const { allowed, remaining } = rateLimit(ip)

  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': '60',
        'X-RateLimit-Limit': String(MAX_REQS),
        'X-RateLimit-Remaining': '0',
      },
    })
  }

  const res = new Response(null, { status: 200 })
  res.headers.set('X-RateLimit-Limit', String(MAX_REQS))
  res.headers.set('X-RateLimit-Remaining', String(remaining))
}

export const config = {
  matcher: ['/api/:path*', '/admin', '/admin/:path*'],
}
