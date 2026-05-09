// 14 — Storage path-RLS.
// Resumes / IC docs / business licenses sit in private buckets; signed URLs
// must be granted only to the row owner (path is `<user_uid>/...`).
//
// Probe: as Talent A, try to sign B's resume. Must fail.

import { mintTokenFor, loadTesters } from '../lib/auth.mjs'
import { config } from '../config.mjs'

const BUCKETS = [
  { bucket: 'resumes',           path: 'resume.pdf' },
  { bucket: 'ic-documents',      path: 'ic_front.jpg' },
  { bucket: 'business-licenses', path: 'license.pdf' },
]

export default async function check() {
  if (!config.SUPABASE_SERVICE_ROLE_KEY) {
    return { name: 'Storage path-RLS', status: 'SKIP', detail: 'service-role required', evidence: [] }
  }

  let testers, tokenA
  try {
    testers = await loadTesters()
    tokenA = await mintTokenFor(config.TESTER_TALENT_A)
  } catch (err) {
    return { name: 'Storage path-RLS', status: 'FAIL', detail: 'Auth setup failed', evidence: [err.message] }
  }
  const talentB = testers[config.TESTER_TALENT_B]

  const failures = []
  let probed = 0

  for (const { bucket, path } of BUCKETS) {
    const url = `${config.SUPABASE_URL}/storage/v1/object/sign/${bucket}/${talentB.id}/${path}`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: config.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expiresIn: 60 }),
    })
    probed++
    if (res.status === 200) {
      failures.push(`${bucket}/${talentB.id}/${path}: signed URL minted (LEAK)`)
    } else if (res.status >= 500) {
      failures.push(`${bucket}/${talentB.id}/${path}: server error ${res.status}`)
    }
    // 4xx (403, 404, 400) all acceptable — request rejected.
  }

  if (failures.length === 0) {
    return {
      name: 'Storage path-RLS',
      status: 'PASS',
      detail: `${probed}/${probed} cross-tenant sign attempts blocked`,
      evidence: [],
    }
  }
  return {
    name: 'Storage path-RLS',
    status: 'FAIL',
    detail: `${failures.length} cross-tenant access`,
    evidence: failures,
  }
}
