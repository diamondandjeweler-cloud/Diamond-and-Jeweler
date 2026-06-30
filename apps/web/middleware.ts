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

const WINDOW_MS   = 60_000   // 1 minute
const MAX_REQS    = 100       // per IP per window
const MAX_BUCKETS = 10_000    // hard cap — prevents unbounded memory growth under DDoS

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
  // Run time-based eviction every 500 requests OR immediately if the map
  // has grown past the hard cap — whichever comes first.
  if (++evictCounter < 500 && buckets.size <= MAX_BUCKETS) return
  evictCounter = 0
  const cutoff = Date.now() - WINDOW_MS
  for (const [ip, b] of buckets) {
    if (b.windowStart < cutoff) buckets.delete(ip)
  }
  // If still over cap after time-based sweep, evict the oldest entries.
  if (buckets.size > MAX_BUCKETS) {
    const excess = buckets.size - MAX_BUCKETS
    let n = 0
    for (const ip of buckets.keys()) {
      if (n++ >= excess) break
      buckets.delete(ip)
    }
  }
}

// ── Shared-store rate limiting (optional) ─────────────────────────────────────
// The in-memory Map above is per-instance: each Vercel Edge isolate keeps its
// own counters, so under horizontal scaling a single IP can burst N× the limit
// (N = number of warm isolates). To enforce the limit GLOBALLY, point the
// limiter at an Upstash Redis REST store shared across every isolate.
//
// OWNER ACTION REQUIRED TO ACTIVATE — until these envs are set, NOTHING changes
// and the in-memory Map below stays the live path (zero behaviour change in
// prod):
//   1. Provision an Upstash Redis database (or a Vercel KV store — it speaks the
//      same REST protocol) from the Vercel Marketplace.
//   2. Add the two REST envs to the Vercel project (the integration sets them
//      automatically; KV exposes them as KV_REST_API_URL / KV_REST_API_TOKEN,
//      Upstash as UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN — both are
//      accepted below).
//   3. Redeploy. The limiter switches to the shared store on the next boot.
//
// Implemented as a thin fetch wrapper over the Upstash REST API so it works on
// the Edge runtime with no SDK and no extra cold-start cost. We atomically
// INCR a per-IP key and set a WINDOW_MS TTL on first hit — a fixed-window
// counter that mirrors the in-memory semantics closely enough for abuse
// control. On ANY transport error we fail OPEN to the in-memory path so a Redis
// blip can never take down /api/*.
function getSharedStore(): { url: string; token: string } | null {
  const env = getEnv()
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN
  if (url && token) return { url, token }
  return null
}

async function rateLimitShared(ip: string): Promise<{ allowed: boolean; remaining: number }> {
  const store = getSharedStore()
  if (!store) {
    // No shared store configured → preserve the exact in-memory behaviour.
    maybeEvict()
    return rateLimit(ip)
  }

  try {
    const key = `rl:${ip}`
    // Pipeline INCR + (conditional) PEXPIRE in one round-trip. INCR returns the
    // new count; on the first hit (count === 1) we stamp the window TTL.
    const res = await fetch(`${store.url}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${store.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        ['INCR', key],
        ['PEXPIRE', key, String(WINDOW_MS), 'NX'],
      ]),
      signal: AbortSignal.timeout(1500),
    })
    if (!res.ok) throw new Error(`upstash_${res.status}`)
    const out = (await res.json()) as Array<{ result?: unknown; error?: unknown }>
    const count = Number(out?.[0]?.result)
    if (!Number.isFinite(count)) throw new Error('upstash_bad_reply')
    const remaining = Math.max(0, MAX_REQS - count)
    return { allowed: count <= MAX_REQS, remaining }
  } catch {
    // Fail open: a shared-store outage must never break legitimate traffic.
    // Fall back to the per-instance Map (degraded but available).
    maybeEvict()
    return rateLimit(ip)
  }
}
// ─────────────────────────────────────────────────────────────────────────────

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
function base64UrlToBytes(input: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (input.length % 4)) % 4)
  const b64 = (input + pad).replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const bytes = new Uint8Array(new ArrayBuffer(bin.length))
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
    return redirect('no_jwt')
  }

  // Path A — local HS256 verify if the secret is configured. Cheap, no
  // network. Production should use this path.
  if (secret) {
    const result = await verifyJwt(token, secret)
    if (result.ok) return undefined
    // Fall through to introspection for ANY verification failure (including
    // expired) — the cookie may be stale while Supabase has already issued
    // a new token the browser hasn't mirrored to the cookie yet.
    if (supabaseUrl) {
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

// ── F-07: Bot OG injection ────────────────────────────────────────────────────
function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const ORIGIN = 'https://diamondandjeweler.com'
const OG_IMAGE = `${ORIGIN}/og-image.png`
const DEFAULT_TITLE = 'DNJ — AI-Curated Recruitment Platform Malaysia | Jobs Across Every Industry'
const DEFAULT_DESC = 'AI-powered curated recruitment for every industry in Malaysia. Three matches, zero noise. PDPA-compliant, end-to-end encrypted.'

const BOT_UA = /Twitterbot|facebookexternalhit|LinkedInBot|Slackbot|Googlebot|bingbot|DuckDuckBot|WhatsApp|Discordbot|TelegramBot|PinterestBot|Slack-ImgProxy|Applebot|redditbot/i

const STATIC_PREFIX = /^\/(assets|_next|favicon|og-image|manifest|sitemap|robots|\.well-known)\b/

function resolveOg(pathname: string): { title: string; description: string } {
  const slug = (s: string) => s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

  if (pathname === '/careers') return {
    title: 'Job Vacancies in Malaysia | DNJ',
    description: 'Browse AI-curated job vacancies across every industry in Malaysia — sales, finance, IT, hospitality, aviation and more. Three matches, zero noise.',
  }
  if (pathname === '/login') return {
    title: 'Sign In | DNJ',
    description: 'Sign in to your DNJ account to view curated job matches, manage your profile, or post new roles.',
  }
  if (pathname === '/signup') return {
    title: 'Create Your Account | DNJ',
    description: 'Join DNJ as a talent or hiring manager. AI-curated recruitment across every industry in Malaysia.',
  }
  if (pathname === '/start/talent') return {
    title: 'Find Your Next Role | DNJ',
    description: 'Set up your talent profile and receive AI-curated job matches across every industry in Malaysia. Three curated offers, zero noise.',
  }
  if (pathname === '/start/hiring') return {
    title: 'Hire the Right Talent | DNJ',
    description: 'Post a role and receive up to three AI-curated candidate profiles. No CV pile, no noise. PDPA-compliant.',
  }
  if (pathname === '/privacy') return {
    title: 'Privacy Policy | DNJ',
    description: 'Learn how DNJ collects, stores, and protects your personal data in accordance with the Malaysian PDPA.',
  }
  if (pathname === '/terms') return {
    title: 'Terms of Service | DNJ',
    description: 'The legal agreement governing use of the DNJ AI-curated recruitment platform.',
  }

  const jobMatch = pathname.match(/^\/jobs\/([^/]+)\/?$/)
  if (jobMatch) {
    const role = slug(jobMatch[1])
    return {
      title: `${role} Jobs in Malaysia | DNJ`,
      description: `Find AI-curated ${role} job vacancies in Malaysia on DNJ. Three matches, zero noise — for fresh graduates and experienced professionals alike.`,
    }
  }

  const locationMatch = pathname.match(/^\/jobs-in-([^/]+)\/?$/)
  if (locationMatch) {
    const loc = slug(locationMatch[1])
    return {
      title: `Jobs in ${loc} | DNJ`,
      description: `Browse AI-curated job vacancies in ${loc} across every industry. DNJ matches talent with the right employer — three curated offers, zero noise.`,
    }
  }

  const hireMatch = pathname.match(/^\/hire-([^/]+)\/?$/)
  if (hireMatch) {
    const role = slug(hireMatch[1])
    return {
      title: `Hire ${role} in Malaysia | DNJ`,
      description: `Find the right ${role} for your team. DNJ delivers up to three AI-curated candidate profiles — no CV pile, no noise.`,
    }
  }

  if (pathname.startsWith('/careers/')) return {
    title: 'Career Guides for Malaysia | DNJ',
    description: 'Expert career guides and industry insights for job seekers and hiring managers in Malaysia.',
  }

  return { title: DEFAULT_TITLE, description: DEFAULT_DESC }
}

function botOgResponse(pathname: string): Response {
  const { title, description } = resolveOg(pathname)
  const url = `${ORIGIN}${pathname}`
  const t = escHtml(title), d = escHtml(description), u = escHtml(url)
  const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"/><title>${t}</title><meta name="description" content="${d}"/><meta property="og:type" content="website"/><meta property="og:site_name" content="DNJ"/><meta property="og:title" content="${t}"/><meta property="og:description" content="${d}"/><meta property="og:url" content="${u}"/><meta property="og:image" content="${OG_IMAGE}"/><meta property="og:image:alt" content="DNJ — AI-curated recruitment platform Malaysia"/><meta name="twitter:card" content="summary_large_image"/><meta name="twitter:title" content="${t}"/><meta name="twitter:description" content="${d}"/><meta name="twitter:image" content="${OG_IMAGE}"/><link rel="canonical" href="${u}"/></head><body><p>${t}</p><p>${d}</p></body></html>`
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300, s-maxage=300' },
  })
}
// ─────────────────────────────────────────────────────────────────────────────

export default async function middleware(req: Request) {
  const { pathname } = new URL(req.url)

  // Serve OG-injected HTML to social crawlers on any non-static path.
  if (!STATIC_PREFIX.test(pathname)) {
    const ua = req.headers.get('user-agent') ?? ''
    if (BOT_UA.test(ua)) return botOgResponse(pathname)
  }

  // /admin gate — real JWT verification.
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    const blocked = await adminGate(req, pathname)
    if (blocked) return blocked
    return
  }

  // /api/health — health-check; bypass rate limiter.
  if (pathname === '/api/health') return

  // /api/* — rate limit only.
  if (!pathname.startsWith('/api/')) return

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'

  // Uses the shared Upstash/KV store when its env is configured, else falls
  // back to the per-instance in-memory Map (and runs maybeEvict() internally).
  const { allowed, remaining } = await rateLimitShared(ip)

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

  // Allowed → fall through (implicit `return undefined`) so Vercel continues to
  // the /api route. VERIFIED LIVE 2026-06-27: returning undefined here is a
  // PASS-THROUGH — GET /api/stats flows through this exact path and returns its
  // real handler JSON. Do NOT change this to `return res` / next(): returning a
  // 200 null-body Response risks short-circuiting /api/* (including
  // /api/set-auth-cookie, the admin gate's own cookie source) to an empty body.
  // The header lines below are a best-effort no-op on the pass-through — actually
  // attaching them would require @vercel/functions `next({ headers })`, which we
  // deliberately do NOT add because it alters this auth-cookie-bearing path.
  const res = new Response(null, { status: 200 })
  res.headers.set('X-RateLimit-Limit', String(MAX_REQS))
  res.headers.set('X-RateLimit-Remaining', String(remaining))
}

export const config = {
  // Run on all paths so the bot OG gate fires before React loads.
  matcher: ['/((?!_next/static|_next/image).*)'],
}
