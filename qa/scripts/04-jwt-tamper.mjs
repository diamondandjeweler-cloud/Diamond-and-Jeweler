// 04 — JWT tamper.
// Forged / expired / wrong-role tokens must be rejected.

import { mintTokenFor } from '../lib/auth.mjs'
import { config } from '../config.mjs'

function b64urlDecode(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  return Buffer.from((s + pad).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
}
function b64urlEncode(s) {
  return Buffer.from(s, 'utf-8')
    .toString('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

export default async function check() {
  if (!config.SUPABASE_SERVICE_ROLE_KEY) {
    return { name: 'JWT tamper', status: 'SKIP', detail: 'SUPABASE_SERVICE_ROLE_KEY not set', evidence: [] }
  }

  let valid
  try { valid = await mintTokenFor(config.TESTER_TALENT_A) }
  catch (err) { return { name: 'JWT tamper', status: 'FAIL', detail: 'Auth setup failed', evidence: [err.message] } }

  const [h, p, sig] = valid.split('.')
  const payload = JSON.parse(b64urlDecode(p))

  const failures = []

  async function probe(label, token) {
    const res = await fetch(`${config.SUPABASE_URL}/rest/v1/profiles?select=id&limit=1`, {
      headers: {
        apikey: config.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
    })
    const body = await res.json()
    // Expect 401/403 OR empty body. If we got a populated row array, it's a leak.
    if (Array.isArray(body) && body.length > 0 && body[0].id) {
      failures.push(`${label}: accepted, returned data`)
    }
  }

  // 1. Tampered role: rewrite payload.role = 'admin', keep original sig.
  const tampered = { ...payload, role: 'service_role' }
  const tamperedTok = `${h}.${b64urlEncode(JSON.stringify(tampered))}.${sig}`
  await probe('tampered-role', tamperedTok)

  // 2. Expired token: set exp = now - 3600.
  const expired = { ...payload, exp: Math.floor(Date.now() / 1000) - 3600 }
  const expiredTok = `${h}.${b64urlEncode(JSON.stringify(expired))}.${sig}`
  await probe('expired-token', expiredTok)

  // 3. Garbage token.
  await probe('garbage-token', 'aaa.bbb.ccc')

  // 4. Empty token.
  await probe('empty-token', '')

  if (failures.length === 0) {
    return { name: 'JWT tamper', status: 'PASS', detail: '4/4 forged tokens rejected', evidence: [] }
  }
  return { name: 'JWT tamper', status: 'FAIL', detail: `${failures.length} forged token(s) accepted`, evidence: failures }
}
