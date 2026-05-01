
// Simple in-process sliding window rate limiter.
// State resets on cold start — acceptable for MVP. For production scale,
// replace with Upstash Redis (@upstash/ratelimit).
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

// Evict expired buckets every 500 requests to prevent unbounded growth.
let evictCounter = 0
function maybeEvict() {
  if (++evictCounter < 500) return
  evictCounter = 0
  const cutoff = Date.now() - WINDOW_MS
  for (const [ip, b] of buckets) {
    if (b.windowStart < cutoff) buckets.delete(ip)
  }
}

export default function middleware(req: Request) {
  // Only rate-limit API routes, not static assets or the SPA shell.
  const { pathname } = new URL(req.url)
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
  matcher: ['/api/:path*'],
}
