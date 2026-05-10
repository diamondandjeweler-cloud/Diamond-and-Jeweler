// Vercel Edge middleware. Two responsibilities:
//   1. Sliding-window rate-limit /api/* (per IP, 100 req/min).
//   2. Real edge gate on /admin/* — verify Supabase JWT signature using
//      SUPABASE_JWT_SECRET before serving the SPA shell. Replaces the older
//      `dnj-auth=1` presence-cookie soft gate (F13). Real authorization
//      (admin role, RLS scopes) still lives in AdminGate + Supabase RLS;
//      this gate just confirms the caller is an authenticated user with a
//      non-expired token.

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

function getJwtSecret(): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
  return env?.SUPABASE_JWT_SECRET
}

async function adminGate(req: Request, pathname: string): Promise<Response | undefined> {
  const redirect = (reason: string) => new Response(null, {
    status: 302,
    headers: {
      Location: `/login?from=${encodeURIComponent(pathname)}&reason=${encodeURIComponent(reason)}`,
      'Cache-Control': 'no-store',
    },
  })

  const secret = getJwtSecret()

  const token = readCookie(req, 'sb-jwt')
  if (!token) {
    // Backwards compat path: if the secret isn't configured (dev / preview
    // without env), fall back to the legacy presence-cookie check so we
    // don't lock everyone out of /admin during an env-config gap.
    if (!secret) {
      const legacy = /(?:^|;\s*)dnj-auth=1(?:;|$)/.test(req.headers.get('cookie') ?? '')
      if (legacy) return undefined
    }
    return redirect('no_jwt')
  }

  if (!secret) {
    // Token present but no secret to verify with — fall through to client-side
    // AdminGate. Logged so an env-config gap doesn't go silently undetected.
    console.warn('[middleware] SUPABASE_JWT_SECRET missing; bypassing edge JWT verification')
    return undefined
  }

  const result = await verifyJwt(token, secret)
  if (!result.ok) return redirect(result.reason)
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
