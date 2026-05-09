// Auth helpers for QA scripts.
//
// Supabase login is captcha-gated in the browser, but the GoTrue admin API
// (with service-role key) lets us mint sessions for tester accounts without
// going through the form. This is QA-only; never run from a client bundle.

import { config } from '../config.mjs'

const headers = {
  apikey: config.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
}

/** Look up a user by email via admin API. Returns user object or null. */
export async function getUserByEmail(email) {
  const url = `${config.SUPABASE_URL}/auth/v1/admin/users?filter=email=eq.${encodeURIComponent(email)}`
  const res = await fetch(url, { headers })
  if (!res.ok) return null
  const data = await res.json()
  return data.users?.[0] ?? null
}

/** Issue an access token for a tester account (admin generateLink magicLink). */
export async function mintTokenFor(email) {
  // Use password grant with anon key — works for QA when captcha is off OR via
  // admin generate_link if captcha blocks. We try password first.
  const url = `${config.SUPABASE_URL}/auth/v1/token?grant_type=password`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: config.SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password: config.TESTER_PASSWORD }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`mintTokenFor(${email}) failed: ${res.status} ${body}`)
  }
  const data = await res.json()
  return data.access_token
}

/** Resolve { id, email, role } for each tester. Cached after first call. */
let _testers = null
export async function loadTesters() {
  if (_testers) return _testers
  const emails = [
    config.TESTER_ADMIN,
    config.TESTER_HM_A,
    config.TESTER_HM_B,
    config.TESTER_TALENT_A,
    config.TESTER_TALENT_B,
  ]
  const out = {}
  for (const email of emails) {
    const u = await getUserByEmail(email)
    if (!u) throw new Error(`Tester not found: ${email}`)
    out[email] = { id: u.id, email, raw: u }
  }
  _testers = out
  return out
}
