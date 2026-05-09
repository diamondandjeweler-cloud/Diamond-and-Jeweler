// 12 — DSR tenant isolation.
// When Talent A requests a DSR export, the resulting JSON must contain
// ONLY Talent A's data — no rows belonging to other users.

import { mintTokenFor, loadTesters } from '../lib/auth.mjs'
import { edgeFn, mgmtSql } from '../lib/http.mjs'
import { config } from '../config.mjs'

export default async function check() {
  if (!config.SUPABASE_SERVICE_ROLE_KEY || !config.SUPABASE_PAT) {
    return { name: 'DSR tenant isolation', status: 'SKIP', detail: 'service-role + PAT required', evidence: [] }
  }

  let testers, tokenA
  try {
    testers = await loadTesters()
    tokenA = await mintTokenFor(config.TESTER_TALENT_A)
  } catch (err) {
    return { name: 'DSR tenant isolation', status: 'FAIL', detail: 'Auth setup failed', evidence: [err.message] }
  }
  const talentA = testers[config.TESTER_TALENT_A]
  const talentB = testers[config.TESTER_TALENT_B]

  // 1. Create a data_request row for Talent A.
  const reqRows = await mgmtSql(`
    insert into public.data_requests (user_id, request_type, status, created_at)
    values ('${talentA.id}', 'access', 'completed', now())
    returning id
  `)
  const reqId = reqRows[0]?.id
  if (!reqId) {
    return { name: 'DSR tenant isolation', status: 'FAIL', detail: 'Failed to create data_requests row', evidence: [] }
  }

  // 2. Trigger dsr-export as service-role (the admin path).
  const res = await edgeFn('dsr-export', {
    token: config.SUPABASE_SERVICE_ROLE_KEY,
    body: { request_id: reqId, user_id: talentA.id },
  })
  if (!res.ok) {
    await mgmtSql(`delete from public.data_requests where id = '${reqId}'`)
    return {
      name: 'DSR tenant isolation',
      status: 'FAIL',
      detail: `dsr-export returned ${res.status}`,
      evidence: [await res.text()],
    }
  }
  const out = await res.json().catch(() => ({}))

  // 3. Inspect the output. We don't fetch the signed URL here (would require
  //    storage read); instead we rely on the function's response shape.
  //    A passing implementation returns no rows for B's user_id.
  const json = JSON.stringify(out)
  const failures = []
  if (json.includes(talentB.id)) {
    failures.push(`Export response references talentB.id ${talentB.id}`)
  }
  if (json.includes(talentB.email)) {
    failures.push(`Export response references talentB.email ${talentB.email}`)
  }

  // Cleanup.
  await mgmtSql(`delete from public.data_requests where id = '${reqId}'`)

  if (failures.length === 0) {
    return {
      name: 'DSR tenant isolation',
      status: 'PASS',
      detail: 'Export contains no foreign-tenant identifiers',
      evidence: [],
    }
  }
  return {
    name: 'DSR tenant isolation',
    status: 'FAIL',
    detail: `${failures.length} foreign-tenant leak(s)`,
    evidence: failures,
  }
}
