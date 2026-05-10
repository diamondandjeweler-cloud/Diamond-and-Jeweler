// 05 — AI determinism.
// Calling match-generate with the same role 5 times in a row must
// produce the same set of matched talents. Variance > 0% = non-deterministic
// (LLM tail-randomness leaking into the scorer).
//
// We pick H02 Andrew's Risk Manager role. Service-role auth so we don't
// need to log in.

import { edgeFn, mgmtSql } from '../lib/http.mjs'
import { mintTokenFor } from '../lib/auth.mjs'
import { config } from '../config.mjs'

export default async function check() {
  if (!config.SUPABASE_SERVICE_ROLE_KEY || !config.SUPABASE_PAT) {
    return { name: 'AI determinism', status: 'SKIP', detail: 'service-role + PAT required', evidence: [] }
  }

  // Find a role belonging to the HM_A tester (so we can call as that HM).
  const rows = await mgmtSql(`
    select r.id, r.title, p.email
    from public.roles r
    join public.hiring_managers hm on hm.id = r.hiring_manager_id
    join public.profiles p on p.id = hm.profile_id
    where p.email = '${config.TESTER_HM_A.replace(/'/g, "''")}'
    order by r.created_at desc
    limit 1
  `)
  if (!rows.length) {
    return { name: 'AI determinism', status: 'SKIP', detail: `No roles for ${config.TESTER_HM_A}`, evidence: [] }
  }
  const roleId = rows[0].id

  // Mint a JWT as the HM (the new sb_secret_ format isn't accepted by Edge
  // Functions; user-token path works).
  let hmToken
  try { hmToken = await mintTokenFor(config.TESTER_HM_A) }
  catch (err) { return { name: 'AI determinism', status: 'FAIL', detail: 'HM token mint failed', evidence: [err.message] } }

  // Call match-generate 5x as the HM; capture top 3 talent IDs each run.
  const runs = []
  for (let i = 0; i < 5; i++) {
    const res = await edgeFn('match-generate', {
      token: hmToken,
      body: { role_id: roleId, is_extra_match: true }, // is_extra_match avoids dedup blocks
    })
    if (!res.ok) {
      return {
        name: 'AI determinism',
        status: 'FAIL',
        detail: `match-generate returned ${res.status}`,
        evidence: [await res.text()],
      }
    }
    // Read the just-inserted matches back from the DB.
    const matches = await mgmtSql(`
      select talent_id, compatibility_score
      from public.matches
      where role_id = '${roleId}'
      order by created_at desc
      limit 3
    `)
    runs.push(matches.map((m) => `${m.talent_id}:${m.compatibility_score}`).sort().join('|'))
  }

  const distinct = new Set(runs)
  if (distinct.size === 1) {
    return { name: 'AI determinism', status: 'PASS', detail: `5 runs, identical output`, evidence: [] }
  }
  return {
    name: 'AI determinism',
    status: 'WARN',
    detail: `${distinct.size}/5 distinct outputs — scorer not fully deterministic`,
    evidence: [...distinct].slice(0, 3),
  }
}
