// Vercel Edge middleware. Two responsibilities:
//   1. Sliding-window rate-limit /api/* (per IP, 100 req/min).
//   2. Real edge gate on /admin/* — F13. Tries two paths in order:
//      a. HS256 verify with SUPABASE_JWT_SECRET if it's configured (cheap,
//         no network call, ideal for production).
//      b. Otherwise call Supabase's `/auth/v1/user` introspection endpoint
//         with the user's bearer token. Adds ~50ms per /admin nav but
//         needs no secret — works on Preview/staging without env config.
//      Falls back to the legacy `dnj-auth=1` presence-cookie path only if
//      neither secret nor SUPABASE_URL is reachable.
//      Real authorization (admin role, RLS scopes) still lives in AdminGate
//      + Supabase RLS; this gate just confirms the caller is an
//      authenticated user with a non-expired token.

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

function readCookie(req: Request, name: string): string | null {
  const cookie = req.headers.get('cookie') ?? ''
  const re = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`)
  const m = cookie.match(re)
  return m ? decodeURIComponent(m[1]) : null
}

// Web Crypto-backed JWT (HS256) verification. Supabase signs access tokens
// with HS256 by default; the secret is exposed to server-side callers as
// SUPABASE_JWT_SECRET. We verify signature + check `exp` only — role/admin
// checks stay in AdminGate (client) and RLS (server).
function base64UrlToBytes(input: string): Uint8Array {
  const pad = '='.repeat((4 - (input.length % 4)) % 4)
  const b64 = (input + pad).replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function bytesToString(b: Uint8Array): string {
  return new TextDecoder().decode(b)
}

async function verifyJwt(
  token: string,
  secret: string,
): Promise<{ ok: true; payload: Record<string, unknown> } | { ok: false; reason: string }> {
  const parts = token.split('.')
  if (parts.length !== 3) return { ok: false, reason: 'bad_shape' }
  const [headerB64, payloadB64, sigB64] = parts

  let header: { alg?: string }
  try { header = JSON.parse(bytesToString(base64UrlToBytes(headerB64))) }
  catch { return { ok: false, reason: 'bad_header' } }
  if (header.alg !== 'HS256') return { ok: false, reason: `unsupported_alg_${header.alg}` }

  let payload: Record<string, unknown>
  try { payload = JSON.parse(bytesToString(base64UrlToBytes(payloadB64))) }
  catch { return { ok: false, reason: 'bad_payload' } }

  // Reject expired tokens. Allow up to 60s of clock skew.
  const exp = typeof payload.exp === 'number' ? payload.exp : null
  if (exp == null) return { ok: false, reason: 'no_exp' }
  if (exp + 60 < Math.floor(Date.now() / 1000)) return { ok: false, reason: 'expired' }

  // Verify HMAC-SHA256 signature.
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  const data = enc.encode(`${headerB64}.${payloadB64}`)
  const sig = base64UrlToBytes(sigB64)
  const valid = await crypto.subtle.verify('HMAC', key, sig, data)
  if (!valid) return { ok: false, reason: 'bad_sig' }
  return { ok: true, payload }
}

function getEnv(): Record<string, string | undefined> {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}
}

// Supabase URL is exposed at build time as VITE_SUPABASE_URL. The middleware
// runs at the edge — it can't see Vite-prefixed envs unless they're also
// surfaced as plain envs on the Vercel project. Try both names.
function getSupabaseUrl(): string | undefined {
  const env = getEnv()
  return env.SUPABASE_URL ?? env.VITE_SUPABASE_URL
}

async function introspectToken(token: string, supabaseUrl: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  // Use the project anon key as apikey header. This isn't strictly required
  // for /auth/v1/user (Supabase accepts the bearer alone) but matches the
  // rest of the platform's request pattern. Token check is cheap because
  // Supabase caches it.
  try {
    const env = getEnv()
    const apiKey = env.SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_ANON_KEY ?? ''
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(apiKey ? { apikey: apiKey } : {}),
      },
      // Vercel Edge fetch — keep aggressive timeout.
      signal: AbortSignal.timeout(3000),
    })
    if (res.status === 200) return { ok: true }
    if (res.status === 401 || res.status === 403) return { ok: false, reason: `introspect_${res.status}` }
    return { ok: false, reason: `introspect_other_${res.status}` }
  } catch (e) {
    return { ok: false, reason: 'introspect_error' }
  }
}

async function adminGate(req: Request, pathname: string): Promise<Response | undefined> {
  const redirect = (reason: string) => new Response(null, {
    status: 302,
    headers: {
      Location: `/login?from=${encodeURIComponent(pathname)}&reason=${encodeURIComponent(reason)}`,
      'Cache-Control': 'no-store',
    },
  })

  const env = getEnv()
  const secret = env.SUPABASE_JWT_SECRET
  const supabaseUrl = getSupabaseUrl()

  const token = readCookie(req, 'sb-jwt')
  if (!token) {
    // No JWT cookie at all — fall back to the legacy presence cookie. Drive-by
    // visitors with no session at all still get a 302; users mid-rollout who
    // have dnj-auth=1 but not sb-jwt yet get through to the SPA, where
    // useSession will mirror the access_token to sb-jwt on next state change.
    const legacy = /(?:^|;\s*)dnj-auth=1(?:;|$)/.test(req.headers.get('cookie') ?? '')
    if (legacy) return undefined
    return redirect('no_jwt')
  }

  // Path A — local HS256 verify if the secret is configured. Cheap, no
  // network. Production should use this path.
  if (secret) {
    const result = await verifyJwt(token, secret)
    if (result.ok) return undefined
    // Don't 302 immediately on bad sig — fall through to introspection so
    // a key rotation that hasn't propagated yet doesn't lock anyone out.
    if (result.reason !== 'expired' && supabaseUrl) {
      const intro = await introspectToken(token, supabaseUrl)
      if (intro.ok) return undefined
    }
    return redirect(result.reason)
  }

  // Path B — introspect against Supabase auth API. Slower but no secret
  // needed; suitable for Preview deployments and emergency unblocks.
  if (supabaseUrl) {
    const intro = await introspectToken(token, supabaseUrl)
    if (intro.ok) return undefined
    return redirect(intro.reason)
  }

  // Neither secret nor URL — soft fall-through to client AdminGate so we
  // don't lock everyone out during an env-config gap.
  console.warn('[middleware] no SUPABASE_JWT_SECRET and no SUPABASE_URL; bypassing edge JWT verification')
  return undefined
}

export default async function middleware(req: Request) {
  const { pathname } = new URL(req.url)

  // /admin gate — real JWT verification.
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    const blocked = await adminGate(req, pathname)
    if (blocked) return blocked
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
