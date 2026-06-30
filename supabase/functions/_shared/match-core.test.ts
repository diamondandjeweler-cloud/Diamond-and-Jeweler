/**
 * match-core — orchestration guard tests
 *
 * Run via `deno test` in CI (NOT runnable locally — no Deno in this dev env).
 *   deno test --allow-all --no-check supabase/functions/_shared/match-core.test.ts
 *
 * matchForRole builds its Supabase client internally (adminClient()), which is
 * why its ~1,200-LOC orchestration had zero coverage. The MatchParams.db seam
 * (dependency injection; defaults to adminClient() in production, so prod
 * behaviour is unchanged) lets us inject a tiny stub client and pin the early
 * validation guards — the cheap, high-value invariants that gate EVERY
 * generation before any candidate is scored:
 *   • role not found           → MatchError 404
 *   • role not active          → MatchError 400
 *   • vacancy expired          → MatchError 400
 *   • HM has no DOB on file     → MatchError 422 (HM_DOB_REQUIRED)
 *
 * Each guard throws before the candidate fetch / scoring RPCs, so the stub only
 * needs the chainable surface the guard path touches:
 *   .from(table).select(...).eq(...).single() / .maybeSingle()
 */
import {
  assertEquals,
  assertRejects,
} from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { matchForRole, MatchError, type MatchParams } from './match-core.ts'

type Resp = { data: unknown; error: unknown }

/**
 * Minimal chainable Supabase-client stub: every query against a table resolves
 * to that table's fixed { data, error }. select/eq/in/order/limit are no-op
 * chain links; single/maybeSingle (and awaiting the builder directly) resolve.
 */
function stubClient(byTable: Record<string, Resp>): NonNullable<MatchParams['db']> {
  const chain = (table: string) => {
    const resp: Resp = byTable[table] ?? { data: null, error: null }
    const c: Record<string, unknown> = {}
    c.select = () => c
    c.eq = () => c
    c.in = () => c
    c.order = () => c
    c.limit = () => c
    c.single = () => Promise.resolve(resp)
    c.maybeSingle = () => Promise.resolve(resp)
    c.then = (onF: (v: Resp) => unknown) => Promise.resolve(resp).then(onF)
    return c
  }
  return {
    from: (table: string) => chain(table),
    rpc: (_fn: string, _args?: unknown) => Promise.resolve({ data: null, error: null }),
  } as unknown as NonNullable<MatchParams['db']>
}

const ACTIVE_ROLE = {
  id: 'role-1',
  status: 'active',
  vacancy_expires_at: null,
  hiring_manager_id: 'hm-1',
}

Deno.test('matchForRole: role not found → MatchError 404', async () => {
  const db = stubClient({ roles: { data: null, error: { message: 'no rows' } } })
  const err = await assertRejects(
    () => matchForRole({ roleId: 'missing', isServiceRole: true, db }),
    MatchError,
    'Role not found',
  )
  assertEquals((err as MatchError).statusCode, 404)
})

Deno.test('matchForRole: role not active → MatchError 400', async () => {
  const db = stubClient({ roles: { data: { ...ACTIVE_ROLE, status: 'paused' }, error: null } })
  const err = await assertRejects(
    () => matchForRole({ roleId: 'role-1', isServiceRole: true, db }),
    MatchError,
    'Role status is paused',
  )
  assertEquals((err as MatchError).statusCode, 400)
})

Deno.test('matchForRole: expired vacancy → MatchError 400', async () => {
  const db = stubClient({
    roles: { data: { ...ACTIVE_ROLE, vacancy_expires_at: '2000-01-01T00:00:00Z' }, error: null },
  })
  const err = await assertRejects(
    () => matchForRole({ roleId: 'role-1', isServiceRole: true, db }),
    MatchError,
    'Vacancy has expired',
  )
  assertEquals((err as MatchError).statusCode, 400)
})

Deno.test('matchForRole: HM has no DOB on file → MatchError 422 (HM_DOB_REQUIRED)', async () => {
  const db = stubClient({
    roles: { data: ACTIVE_ROLE, error: null },
    hiring_managers: { data: { date_of_birth_encrypted: null }, error: null },
  })
  const err = await assertRejects(
    () => matchForRole({ roleId: 'role-1', isServiceRole: true, db }),
    MatchError,
    'HM_DOB_REQUIRED',
  )
  assertEquals((err as MatchError).statusCode, 422)
})
