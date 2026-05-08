import { adminClient } from './supabase.ts'
import { corsHeaders } from './cors.ts'

export type AppRole = 'talent' | 'hiring_manager' | 'hr_admin' | 'admin'

export interface AuthResult {
  userId: string
  email: string
  role: AppRole
  isServiceRole: boolean
}

export interface AuthOptions {
  requiredRoles?: AppRole[]
  /** If true (default), accept Supabase service-role key as caller. */
  allowServiceRole?: boolean
}

const SERVICE_ROLE_SENTINEL_ID = '00000000-0000-0000-0000-000000000000'

/**
 * Resolve the caller from the Authorization header.
 * Accepts two credential types:
 *   - Supabase user JWT (role comes from public.profiles.role)
 *   - Service-role key (elevates to 'admin', used for cron / inter-function calls)
 *
 * Returns AuthResult on success, Response on failure (caller returns it directly).
 */
export async function authenticate(
  req: Request,
  options: AuthOptions = {},
): Promise<AuthResult | Response> {
  const { requiredRoles, allowServiceRole = true } = options

  const header = req.headers.get('Authorization')
  if (!header?.startsWith('Bearer ')) {
    return json({ error: 'Missing Authorization header' }, 401)
  }
  const token = header.slice('Bearer '.length).trim()
  if (!token) return json({ error: 'Empty bearer token' }, 401)

  // Fast path: service-role detection via JWT role claim.
  //
  // Under the new Supabase API-key system, the gateway authenticates the caller
  // (sb_secret_* opaque key OR legacy service-role JWT) and forwards a verified
  // JWT carrying role=service_role. We trust the role claim here because the
  // gateway has already validated the bearer's signature (verify_jwt=true).
  if (allowServiceRole && isServiceRoleJwt(token)) {
    return {
      userId: SERVICE_ROLE_SENTINEL_ID,
      email: 'service@diamondandjeweler.com',
      role: 'admin',
      isServiceRole: true,
    }
  }

  // User JWT path.
  const db = adminClient()
  const { data: userResp, error: userErr } = await db.auth.getUser(token)
  if (userErr || !userResp.user) return json({ error: 'Invalid token' }, 401)

  const { data: profile, error: pErr } = await db
    .from('profiles')
    .select('role, email, is_banned')
    .eq('id', userResp.user.id)
    .single()
  if (pErr || !profile) return json({ error: 'Profile not found' }, 403)
  if (profile.is_banned) return json({ error: 'Account banned' }, 403)

  if (requiredRoles && !requiredRoles.includes(profile.role as AppRole)) {
    return json({ error: 'Forbidden: role not allowed' }, 403)
  }

  return {
    userId: userResp.user.id,
    email: profile.email,
    role: profile.role as AppRole,
    isServiceRole: false,
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/**
 * Constant-time string equality. Returns true iff the two strings are byte-equal.
 * Cost is O(max(a, b)) regardless of where the first mismatch is, so an attacker
 * cannot enumerate a secret by measuring response time.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const ba = enc.encode(a)
  const bb = enc.encode(b)
  const len = Math.max(ba.length, bb.length)
  let mismatch = ba.length ^ bb.length
  for (let i = 0; i < len; i++) mismatch |= (ba[i] ?? 0) ^ (bb[i] ?? 0)
  return mismatch === 0
}

/**
 * Service-role gate for functions that only accept machine callers.
 * The gateway (verify_jwt=true) authenticates the bearer and forwards a JWT
 * with role=service_role for any of the project's service credentials.
 * Returns a 403 Response when the role claim is missing, undefined when it passes.
 */
export function requireServiceRole(req: Request): Response | undefined {
  const auth = req.headers.get('authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return json({ error: 'forbidden' }, 403)
  const token = auth.slice('Bearer '.length).trim()
  if (!isServiceRoleJwt(token)) return json({ error: 'forbidden' }, 403)
}

/**
 * Decode a JWT (no signature verification — that's the gateway's job) and
 * return true iff the role claim is service_role and the token has not expired.
 * Returns false for malformed JWTs or non-service-role tokens.
 */
function isServiceRoleJwt(token: string): boolean {
  const parts = token.split('.')
  if (parts.length !== 3) return false
  try {
    const pad = (s: string) => s + '='.repeat((4 - s.length % 4) % 4)
    const payload = JSON.parse(atob(pad(parts[1].replace(/-/g, '+').replace(/_/g, '/')))) as {
      role?: unknown
      exp?: unknown
    }
    if (payload.role !== 'service_role') return false
    if (typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now()) return false
    return true
  } catch {
    return false
  }
}
