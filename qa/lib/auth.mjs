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

import { mgmtSql } from './http.mjs'

/** Look up a user by email — uses Mgmt API SQL (guaranteed to work). */
export async function getUserByEmail(email) {
  const rows = await mgmtSql(
    `select id::text as id, email from auth.users where email = '${email.replace(/'/g, "''")}' limit 1`
  )
  return rows[0] ?? null
}

/** Issue an access token for a tester account.
 *
 * Captcha blocks the password-grant endpoint server-side. We use the admin
 * generate_link flow to get an action_link, then GET that link with manual
 * redirect — GoTrue redirects to <redirect_to>#access_token=... in the
 * Location header. Parse the fragment to extract the token. This is the
 * canonical magic-link flow used by every Supabase email confirmation.
 */
export async function mintTokenFor(email) {
  // 1. Admin generate_link — needs service-role.
  const linkRes = await fetch(`${config.SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ type: 'magiclink', email }),
  })
  if (!linkRes.ok) {
    throw new Error(`generate_link(${email}) failed: ${linkRes.status} ${await linkRes.text()}`)
  }
  const linkBody = await linkRes.json()
  const actionLink = linkBody.action_link ?? linkBody.properties?.action_link
  if (!actionLink) {
    throw new Error(`generate_link(${email}): no action_link in response`)
  }

  // 2. GET action_link without following redirect — GoTrue returns 303
  //    with Location: <redirect_to>#access_token=...&refresh_token=...
  const verifyRes = await fetch(actionLink, { redirect: 'manual' })
  const location = verifyRes.headers.get('location')
  if (!location) {
    throw new Error(`verify(${email}): no Location header (status ${verifyRes.status})`)
  }
  const hash = location.split('#')[1] ?? ''
  const params = new URLSearchParams(hash)
  const access_token = params.get('access_token')
  if (!access_token) {
    const err = params.get('error_description') ?? hash
    throw new Error(`verify(${email}): no access_token. Got: ${err}`)
  }
  return access_token
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
