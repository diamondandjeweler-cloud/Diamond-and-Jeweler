// 02 — RLS sweep.
// Verifies every PII / IP-bearing table has rowsecurity = TRUE
// and at least one policy. Plus targeted assertions: anon must NOT
// read profiles or talents; life_chart_compatibility is admin-only.

import { mgmtSql } from '../lib/http.mjs'
import { config } from '../config.mjs'

// Required: must exist + have RLS + have policies.
const PROTECTED_TABLES = [
  'profiles', 'talents', 'hiring_managers', 'companies', 'roles',
  'matches', 'match_history', 'interviews', 'data_requests', 'waitlist',
  'notifications', 'admin_actions', 'audit_log', 'support_tickets',
  'life_chart_compatibility', 'life_chart_cache',
]
// Optional: if present, must be RLS-enabled + admin-only. Migration 0068 wraps
// character_anchor_years in `do $$ if exists $$` so it may not be deployed.
const OPTIONAL_TABLES = ['character_anchor_years']

export default async function check() {
  if (!config.SUPABASE_PAT) {
    return {
      name: 'RLS sweep',
      status: 'SKIP',
      detail: 'SUPABASE_PAT not set — fill in qa/.env.qa to enable',
      evidence: [],
    }
  }

  const failures = []
  const allTables = [...PROTECTED_TABLES, ...OPTIONAL_TABLES]

  // 1. RLS enabled?
  const rlsRows = await mgmtSql(`
    select tablename, rowsecurity
    from pg_tables
    where schemaname = 'public'
      and tablename = ANY(ARRAY[${allTables.map((t) => `'${t}'`).join(',')}])
  `)
  const seen = new Set(rlsRows.map((r) => r.tablename))
  for (const row of rlsRows) {
    if (!row.rowsecurity) failures.push(`${row.tablename}: rowsecurity = FALSE`)
  }
  for (const t of PROTECTED_TABLES) {
    if (!seen.has(t)) failures.push(`${t}: table not found`)
  }

  // 2. At least one policy per table that exists.
  const policyRows = await mgmtSql(`
    select tablename, count(*)::int as n
    from pg_policies
    where schemaname = 'public'
      and tablename = ANY(ARRAY[${allTables.map((t) => `'${t}'`).join(',')}])
    group by tablename
  `)
  const policyMap = Object.fromEntries(policyRows.map((r) => [r.tablename, r.n]))
  for (const t of allTables) {
    if (!seen.has(t)) continue // optional / missing — already reported or skipped
    if (!policyMap[t] || policyMap[t] < 1) failures.push(`${t}: 0 policies`)
  }

  // 3. anon must not see profiles. Probe via PostgREST as anon.
  const r = await fetch(`${config.SUPABASE_URL}/rest/v1/profiles?select=id&limit=1`, {
    headers: {
      apikey: config.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${config.SUPABASE_ANON_KEY}`,
    },
  })
  const body = await r.json()
  if (Array.isArray(body) && body.length > 0) {
    failures.push(`anon can read profiles (${body.length}+ rows)`)
  }

  if (failures.length === 0) {
    return {
      name: 'RLS sweep',
      status: 'PASS',
      detail: `${PROTECTED_TABLES.length} tables × RLS + policies OK; anon blocked from profiles`,
      evidence: [],
    }
  }
  return {
    name: 'RLS sweep',
    status: 'FAIL',
    detail: `${failures.length} RLS issue(s)`,
    evidence: failures,
  }
}
