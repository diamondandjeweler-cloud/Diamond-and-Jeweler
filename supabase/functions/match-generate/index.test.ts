/**
 * match-generate — HTTP error-contract characterization test
 *
 * Run in CI's edge-tests job (deno test --no-check supabase/functions/), and
 * locally with:
 *   deno check supabase/functions/match-generate/index.test.ts
 *   deno test  supabase/functions/match-generate/index.test.ts
 * It is HERMETIC — no network, no DB, no secrets (only the std assert import,
 * which CI/deno caches).
 *
 * WHAT THIS PINS
 *   Every branch of the handler returns the RIGHT HTTP status AND a top-level
 *   STRING `error` field (never an object / nested shape), because the web
 *   client's catch-toast does `json.error` and would render "[object Object]"
 *   otherwise. Covered: 405 / 401 / 403 / 400 / 404 / 422 / 429 / 500 / 200,
 *   plus the security-critical is_extra_match→403 (a user JWT must never mint a
 *   PAID extra match) and the service-role owner-check bypass.
 *
 * WHY IT MIRRORS THE HANDLER INSTEAD OF IMPORTING index.ts
 *   supabase/functions/match-generate/index.ts calls `serve(...)` at module
 *   top-level (binds a port on import) and closes over its real
 *   authenticate / adminClient / matchForRole imports, so it cannot be imported
 *   and dependency-injected in a unit test — the exact same constraint the
 *   sibling payment-webhook.test.ts documents. So `handleMatchGenerate` below is
 *   a FAITHFUL MIRROR of index.ts's decision flow with the side-effecting deps
 *   injected as stubs. It MUST be kept byte-in-sync with index.ts: if you change
 *   a status code, message, or branch order in index.ts, mirror it here (and vice
 *   versa — this file is the contract of record for the HTTP surface).
 */
import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'

// ── Local mirrors of the injected collaborators ────────────────────────────
// json() mirrors ../_shared/auth.ts json() (CORS headers omitted — this test
// asserts status/body/Retry-After, not CORS).
function json(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...(headers ?? {}) },
  })
}
// Mirrors ../_shared/match-core.ts MatchError.
class MatchError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message)
  }
}
// Mirrors ../_shared/ratelimit.ts RateLimitError.
class RateLimitError extends Error {
  retryAfterSeconds: number
  constructor(message = 'rate_limited', retryAfterSeconds = 3600) {
    super(message)
    this.retryAfterSeconds = retryAfterSeconds
  }
}

// ── Stub Supabase query surface used by the handler ────────────────────────
interface QueryResult {
  // deno-lint-ignore no-explicit-any
  data: any
  // deno-lint-ignore no-explicit-any
  error: any
}
interface QueryState {
  table: string
  select: string
  filters: Array<[string, unknown]>
}
interface QueryBuilder {
  select(cols: string): QueryBuilder
  eq(col: string, val: unknown): QueryBuilder
  single(): Promise<QueryResult>
  maybeSingle(): Promise<QueryResult>
}
interface Db {
  from(table: string): QueryBuilder
  rpc(name: string, params: Record<string, unknown>): Promise<QueryResult>
}
type Responder = (q: QueryState & { terminal: 'single' | 'maybeSingle' }) => QueryResult
type RpcResponder = (name: string, params: Record<string, unknown>) => QueryResult

function makeDb(responder: Responder, rpc: RpcResponder): Db {
  return {
    from(table: string): QueryBuilder {
      const state: QueryState = { table, select: '', filters: [] }
      const builder: QueryBuilder = {
        select(cols: string) {
          state.select = cols
          return builder
        },
        eq(col: string, val: unknown) {
          state.filters.push([col, val])
          return builder
        },
        single() {
          return Promise.resolve(responder({ ...state, terminal: 'single' }))
        },
        maybeSingle() {
          return Promise.resolve(responder({ ...state, terminal: 'maybeSingle' }))
        },
      }
      return builder
    },
    rpc(name: string, params: Record<string, unknown>) {
      return Promise.resolve(rpc(name, params))
    },
  }
}

interface AuthResult {
  userId: string
  email: string
  role: string
  isServiceRole: boolean
}
interface MatchArgs {
  roleId: string
  isExtraMatch: boolean
  sourcePurchaseId?: string
  isServiceRole: boolean
  callerUserId: string
}
interface Deps {
  authenticate: (req: Request) => Promise<AuthResult | Response>
  adminClient: () => Db
  matchForRole: (args: MatchArgs) => Promise<{ message?: string; matches_added: number }>
  enforceRateLimit: (db: Db, key: string, limit: number, windowSec: number) => Promise<void>
  reportError: (err: unknown, ctx?: unknown) => Promise<void>
}

interface Body {
  role_id?: string
  is_extra_match?: boolean
  source_purchase_id?: string
}

// ── FAITHFUL MIRROR of supabase/functions/match-generate/index.ts serve() ──
async function handleMatchGenerate(req: Request, deps: Deps): Promise<Response> {
  // (OPTIONS is handled by handleOptions in index.ts; not an error branch.)
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const auth = await deps.authenticate(req)
  if (auth instanceof Response) return auth

  let body: Body = {}
  try {
    body = (await req.json()) as Body
  } catch {
    /* empty body tolerated */
  }
  if (!body.role_id) return json({ error: 'Missing role_id' }, 400)

  if (!auth.isServiceRole) {
    try {
      await deps.enforceRateLimit(deps.adminClient(), 'match-generate:' + auth.userId, 20, 3600)
    } catch (e) {
      if (e instanceof RateLimitError) {
        return json({ error: 'rate_limited' }, 429, { 'Retry-After': String(e.retryAfterSeconds ?? 3600) })
      }
      throw e
    }
  }

  // ── PAID extra-match delivery — synchronous ──
  if (body.is_extra_match === true) {
    if (!auth.isServiceRole) {
      return json({ error: 'is_extra_match is reserved for internal service-role callers' }, 403)
    }
    try {
      const result = await deps.matchForRole({
        roleId: body.role_id,
        isExtraMatch: body.is_extra_match === true,
        sourcePurchaseId: body.source_purchase_id,
        isServiceRole: auth.isServiceRole,
        callerUserId: auth.userId,
      })
      return new Response(
        JSON.stringify({ message: result.message ?? 'OK', matches_added: result.matches_added }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    } catch (err) {
      if (err instanceof MatchError) return json({ error: err.message }, err.statusCode)
      const msg = err instanceof Error ? err.message : String(err)
      await deps.reportError(err, { fn: 'match-generate' })
      return json({ error: msg }, 500)
    }
  }

  // ── Regular kick — enqueue ──
  const db = deps.adminClient()
  const { data: role, error: roleErr } = await db
    .from('roles')
    .select('id, hiring_manager_id, status, vacancy_expires_at')
    .eq('id', body.role_id)
    .single()
  if (roleErr || !role) return json({ error: 'Role not found' }, 404)

  if (!auth.isServiceRole && auth.userId) {
    const { data: hmOwner } = await db
      .from('hiring_managers')
      .select('id')
      .eq('id', role.hiring_manager_id)
      .eq('profile_id', auth.userId)
      .maybeSingle()
    if (!hmOwner) return json({ error: 'Not the role owner' }, 403)
  }

  if (role.status !== 'active') return json({ error: `Role status is ${role.status}` }, 400)
  if (role.vacancy_expires_at && new Date(role.vacancy_expires_at) < new Date()) {
    return json({ error: 'Vacancy has expired — extend it to resume matching' }, 400)
  }
  const { data: hm } = await db
    .from('hiring_managers')
    .select('date_of_birth_encrypted')
    .eq('id', role.hiring_manager_id)
    .maybeSingle()
  if (!hm?.date_of_birth_encrypted) {
    return json(
      {
        error:
          'HM_DOB_REQUIRED: Your hiring profile is missing a date of birth. Add it from your profile so we can match you with the right talent.',
      },
      422,
    )
  }

  const { data: n, error: enqErr } = await db.rpc('enqueue_roles_for_rematch', {
    p_role_ids: [body.role_id],
    p_priority: 10,
  })
  if (enqErr) {
    await deps.reportError(new Error(`enqueue_roles_for_rematch failed: ${enqErr.message}`), { fn: 'match-generate' })
    return json({ error: `enqueue_roles_for_rematch failed: ${enqErr.message}` }, 500)
  }
  return json({ message: 'queued', matches_added: 0, enqueued: typeof n === 'number' ? n : 0 }, 200)
}

// ── Test fixtures ──────────────────────────────────────────────────────────
function postReq(body?: unknown, method = 'POST'): Request {
  return new Request('https://diamondandjeweler.com/functions/v1/match-generate', {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

const USER: AuthResult = { userId: 'user-1', email: 'hm@x.com', role: 'hiring_manager', isServiceRole: false }
const SERVICE: AuthResult = { userId: '00000000-0000-0000-0000-000000000000', email: 'service@x.com', role: 'admin', isServiceRole: true }

/** Happy-path responder: active, owned role with a DOB; rpc enqueues 3. */
const happyResponder: Responder = (q) => {
  if (q.table === 'roles') {
    return { data: { id: 'role-1', hiring_manager_id: 'hm-1', status: 'active', vacancy_expires_at: null }, error: null }
  }
  if (q.table === 'hiring_managers' && q.select.includes('date_of_birth_encrypted')) {
    return { data: { date_of_birth_encrypted: 'enc-blob' }, error: null }
  }
  if (q.table === 'hiring_managers') return { data: { id: 'hm-1' }, error: null } // owner check
  return { data: null, error: null }
}
const happyRpc: RpcResponder = () => ({ data: 3, error: null })

function baseDeps(overrides: Partial<Deps> = {}): Deps {
  return {
    authenticate: () => Promise.resolve(USER),
    adminClient: () => makeDb(happyResponder, happyRpc),
    matchForRole: () => Promise.resolve({ message: 'OK', matches_added: 1 }),
    enforceRateLimit: () => Promise.resolve(),
    reportError: () => Promise.resolve(),
    ...overrides,
  }
}

/** Assert an error response: exact status + a NON-EMPTY top-level string error. */
async function assertErrorContract(res: Response, status: number): Promise<string> {
  assertEquals(res.status, status, `expected status ${status}, got ${res.status}`)
  const bodyText = await res.text()
  const parsed = JSON.parse(bodyText)
  assertEquals(typeof parsed.error, 'string', `error field must be a string, got ${typeof parsed.error}`)
  assert((parsed.error as string).length > 0, 'error string must be non-empty')
  return parsed.error as string
}

// ── 405 ─────────────────────────────────────────────────────────────────────
Deno.test('non-POST → 405 with string error', async () => {
  const res = await handleMatchGenerate(postReq(undefined, 'GET'), baseDeps())
  await assertErrorContract(res, 405)
})

// ── 401 / 403 from authenticate (propagated Response) ─────────────────────────
Deno.test('missing auth → 401 propagated with string error', async () => {
  const deps = baseDeps({ authenticate: () => Promise.resolve(json({ error: 'Missing Authorization header' }, 401)) })
  const res = await handleMatchGenerate(postReq({ role_id: 'role-1' }), deps)
  await assertErrorContract(res, 401)
})

Deno.test('wrong role → 403 propagated with string error', async () => {
  const deps = baseDeps({ authenticate: () => Promise.resolve(json({ error: 'Forbidden: role not allowed' }, 403)) })
  const res = await handleMatchGenerate(postReq({ role_id: 'role-1' }), deps)
  await assertErrorContract(res, 403)
})

// ── 400 missing role_id ──────────────────────────────────────────────────────
Deno.test('missing role_id → 400 with string error', async () => {
  const res = await handleMatchGenerate(postReq({}), baseDeps())
  const msg = await assertErrorContract(res, 400)
  assertEquals(msg, 'Missing role_id')
})

// ── 429 rate limited (+ Retry-After) ─────────────────────────────────────────
Deno.test('rate limit exceeded → 429, string error, Retry-After header', async () => {
  const deps = baseDeps({
    enforceRateLimit: () => Promise.reject(new RateLimitError('rate_limited', 1800)),
  })
  const res = await handleMatchGenerate(postReq({ role_id: 'role-1' }), deps)
  const msg = await assertErrorContract(res, 429)
  assertEquals(msg, 'rate_limited')
  assertEquals(res.headers.get('Retry-After'), '1800')
})

// ── is_extra_match → 403 for a non-service caller (paid-match guard) ──────────
Deno.test('is_extra_match by a user JWT → 403 (never mints a paid match), matchForRole NOT called', async () => {
  let matchCalled = 0
  const deps = baseDeps({
    matchForRole: () => {
      matchCalled++
      return Promise.resolve({ matches_added: 99 })
    },
  })
  const res = await handleMatchGenerate(postReq({ role_id: 'role-1', is_extra_match: true }), deps)
  const msg = await assertErrorContract(res, 403)
  assertEquals(msg, 'is_extra_match is reserved for internal service-role callers')
  assertEquals(matchCalled, 0, 'the matcher must not run for a rejected paid request')
})

// ── is_extra_match service-role SUCCESS → 200 with matches_added ──────────────
Deno.test('is_extra_match by service role → 200 and reports matches_added', async () => {
  const deps = baseDeps({
    authenticate: () => Promise.resolve(SERVICE),
    matchForRole: () => Promise.resolve({ message: 'OK', matches_added: 2 }),
  })
  const res = await handleMatchGenerate(postReq({ role_id: 'role-1', is_extra_match: true }), deps)
  assertEquals(res.status, 200)
  const j = await res.json()
  assertEquals(j.matches_added, 2)
})

// ── is_extra_match MatchError → propagates its statusCode + string error ──────
Deno.test('is_extra_match matcher MatchError → propagates statusCode with string error', async () => {
  const deps = baseDeps({
    authenticate: () => Promise.resolve(SERVICE),
    matchForRole: () => Promise.reject(new MatchError('Role not found', 404)),
  })
  const res = await handleMatchGenerate(postReq({ role_id: 'role-1', is_extra_match: true }), deps)
  const msg = await assertErrorContract(res, 404)
  assertEquals(msg, 'Role not found')
})

// ── is_extra_match generic error → 500 + string error + reportError called ────
Deno.test('is_extra_match matcher throws generic Error → 500, string error, reportError called', async () => {
  let reported = 0
  const deps = baseDeps({
    authenticate: () => Promise.resolve(SERVICE),
    matchForRole: () => Promise.reject(new Error('kaboom')),
    reportError: () => {
      reported++
      return Promise.resolve()
    },
  })
  const res = await handleMatchGenerate(postReq({ role_id: 'role-1', is_extra_match: true }), deps)
  const msg = await assertErrorContract(res, 500)
  assertEquals(msg, 'kaboom')
  assertEquals(reported, 1)
})

// ── 404 role not found (regular kick) ────────────────────────────────────────
Deno.test('regular kick, role missing → 404 with string error', async () => {
  const responder: Responder = (q) => (q.table === 'roles' ? { data: null, error: null } : happyResponder(q))
  const deps = baseDeps({ adminClient: () => makeDb(responder, happyRpc) })
  const res = await handleMatchGenerate(postReq({ role_id: 'nope' }), deps)
  const msg = await assertErrorContract(res, 404)
  assertEquals(msg, 'Role not found')
})

Deno.test('regular kick, role query error → 404 with string error', async () => {
  const responder: Responder = (q) =>
    q.table === 'roles' ? { data: null, error: { message: 'db down' } } : happyResponder(q)
  const deps = baseDeps({ adminClient: () => makeDb(responder, happyRpc) })
  const res = await handleMatchGenerate(postReq({ role_id: 'role-1' }), deps)
  await assertErrorContract(res, 404)
})

// ── 403 not the role owner (regular kick, user JWT) ──────────────────────────
Deno.test('regular kick, caller is not the owner → 403 with string error', async () => {
  const responder: Responder = (q) => {
    if (q.table === 'roles') return happyResponder(q)
    if (q.table === 'hiring_managers' && q.select === 'id') return { data: null, error: null } // owner check fails
    return happyResponder(q)
  }
  const deps = baseDeps({ adminClient: () => makeDb(responder, happyRpc) })
  const res = await handleMatchGenerate(postReq({ role_id: 'role-1' }), deps)
  const msg = await assertErrorContract(res, 403)
  assertEquals(msg, 'Not the role owner')
})

// ── service role bypasses the owner check ────────────────────────────────────
Deno.test('regular kick, service role skips owner check → 200 even when owner row absent', async () => {
  const responder: Responder = (q) => {
    if (q.table === 'hiring_managers' && q.select === 'id') return { data: null, error: null }
    return happyResponder(q)
  }
  const deps = baseDeps({ authenticate: () => Promise.resolve(SERVICE), adminClient: () => makeDb(responder, happyRpc) })
  const res = await handleMatchGenerate(postReq({ role_id: 'role-1' }), deps)
  assertEquals(res.status, 200)
})

// ── 400 role not active ──────────────────────────────────────────────────────
Deno.test('regular kick, role not active → 400 with interpolated string error', async () => {
  const responder: Responder = (q) =>
    q.table === 'roles'
      ? { data: { id: 'role-1', hiring_manager_id: 'hm-1', status: 'paused', vacancy_expires_at: null }, error: null }
      : happyResponder(q)
  const deps = baseDeps({ adminClient: () => makeDb(responder, happyRpc) })
  const res = await handleMatchGenerate(postReq({ role_id: 'role-1' }), deps)
  const msg = await assertErrorContract(res, 400)
  assertEquals(msg, 'Role status is paused')
})

// ── 400 vacancy expired ──────────────────────────────────────────────────────
Deno.test('regular kick, vacancy expired → 400 with string error', async () => {
  const responder: Responder = (q) =>
    q.table === 'roles'
      ? {
          data: { id: 'role-1', hiring_manager_id: 'hm-1', status: 'active', vacancy_expires_at: '2000-01-01T00:00:00Z' },
          error: null,
        }
      : happyResponder(q)
  const deps = baseDeps({ adminClient: () => makeDb(responder, happyRpc) })
  const res = await handleMatchGenerate(postReq({ role_id: 'role-1' }), deps)
  const msg = await assertErrorContract(res, 400)
  assert(msg.includes('Vacancy has expired'))
})

// ── 422 HM DOB required ──────────────────────────────────────────────────────
Deno.test('regular kick, HM missing DOB → 422 with HM_DOB_REQUIRED string error', async () => {
  const responder: Responder = (q) => {
    if (q.table === 'hiring_managers' && q.select.includes('date_of_birth_encrypted')) {
      return { data: { date_of_birth_encrypted: null }, error: null }
    }
    return happyResponder(q)
  }
  const deps = baseDeps({ adminClient: () => makeDb(responder, happyRpc) })
  const res = await handleMatchGenerate(postReq({ role_id: 'role-1' }), deps)
  const msg = await assertErrorContract(res, 422)
  assert(msg.startsWith('HM_DOB_REQUIRED'))
})

// ── 500 enqueue failed ───────────────────────────────────────────────────────
Deno.test('regular kick, enqueue RPC error → 500 with string error + reportError called', async () => {
  let reported = 0
  const rpc: RpcResponder = () => ({ data: null, error: { message: 'deadlock detected' } })
  const deps = baseDeps({
    adminClient: () => makeDb(happyResponder, rpc),
    reportError: () => {
      reported++
      return Promise.resolve()
    },
  })
  const res = await handleMatchGenerate(postReq({ role_id: 'role-1' }), deps)
  const msg = await assertErrorContract(res, 500)
  assert(msg.startsWith('enqueue_roles_for_rematch failed'))
  assertEquals(reported, 1)
})

// ── 200 regular happy path ───────────────────────────────────────────────────
Deno.test('regular kick happy path → 200 queued with matches_added:0 and enqueued count', async () => {
  const res = await handleMatchGenerate(postReq({ role_id: 'role-1' }), baseDeps())
  assertEquals(res.status, 200)
  const j = await res.json()
  assertEquals(j.message, 'queued')
  assertEquals(j.matches_added, 0)
  assertEquals(j.enqueued, 3)
})
