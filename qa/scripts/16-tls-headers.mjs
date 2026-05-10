// 16 — TLS + security headers.
// Probe https://diamondandjeweler.com for the security headers expected at
// launch (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy)
// and verify the cert is valid (no chain warnings via fetch).

import { config } from '../config.mjs'

const REQUIRED = [
  { name: 'strict-transport-security', match: /max-age=\d+/ },
  { name: 'x-content-type-options',    match: /nosniff/i },
  { name: 'x-frame-options',           match: /(deny|sameorigin)/i },
  { name: 'referrer-policy',           match: /(strict-origin|same-origin|no-referrer)/i },
  { name: 'content-security-policy',   match: /default-src/i },
]

export default async function check() {
  let res
  try {
    res = await fetch(config.QA_BASE_URL, { redirect: 'follow' })
  } catch (err) {
    return { name: 'TLS + headers', status: 'FAIL', detail: 'fetch failed', evidence: [err.message] }
  }
  if (!res.ok) {
    return { name: 'TLS + headers', status: 'FAIL', detail: `${res.status} ${res.statusText}`, evidence: [] }
  }

  const missing = []
  const warnings = []
  for (const req of REQUIRED) {
    const v = res.headers.get(req.name)
    if (!v) {
      missing.push(`${req.name}: missing`)
    } else if (req.match && !req.match.test(v)) {
      warnings.push(`${req.name}: "${v}" doesn't match ${req.match}`)
    }
  }

  if (missing.length === 0 && warnings.length === 0) {
    return {
      name: 'TLS + headers',
      status: 'PASS',
      detail: `${REQUIRED.length}/${REQUIRED.length} headers present and well-formed`,
      evidence: [],
    }
  }
  return {
    name: 'TLS + headers',
    status: missing.length ? 'FAIL' : 'WARN',
    detail: `${missing.length} missing, ${warnings.length} weak`,
    evidence: [...missing, ...warnings],
  }
}
