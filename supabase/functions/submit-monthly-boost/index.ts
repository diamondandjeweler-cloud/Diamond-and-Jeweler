/**
 * submit-monthly-boost
 *
 * Admin submits 2–3 life-chart characters to boost for the current (or specified) month.
 * Characters are encrypted server-side via upsert_monthly_boost() before storage —
 * the plaintext selection never touches the database directly.
 *
 * Authorization: admin only.
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { handleOptions } from '../_shared/cors.ts'
import { authenticate, json } from '../_shared/auth.ts'
import { adminClient } from '../_shared/supabase.ts'

const VALID_CHARACTERS = new Set(['W', 'E-', 'W+', 'W-', 'E', 'G+', 'G-', 'E+', 'F'])

interface Body {
  month?: string       // 'YYYY-MM-DD', must be 1st of month; defaults to current month's 1st
  characters?: string[] // 2–3 values from VALID_CHARACTERS
}

serve(async (req) => {
  const pre = handleOptions(req); if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const auth = await authenticate(req, { requiredRoles: ['admin'] })
  if (auth instanceof Response) return auth

  const body = (await req.json().catch(() => ({}))) as Body

  // Resolve target month — default to 1st of current month.
  const now = new Date()
  const defaultMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`
  const monthStr = body.month ?? defaultMonth

  // Validate: must parse and be a 1st-of-month date.
  const monthDate = new Date(monthStr)
  if (isNaN(monthDate.getTime()) || monthDate.getUTCDate() !== 1) {
    return json({ error: 'month must be a valid YYYY-MM-DD date on the 1st of the month' }, 400)
  }

  // Validate characters.
  const chars = body.characters ?? []
  if (!Array.isArray(chars) || chars.length < 2 || chars.length > 3) {
    return json({ error: 'characters must be an array of 2–3 values' }, 400)
  }
  for (const c of chars) {
    if (!VALID_CHARACTERS.has(c)) {
      return json({ error: `Invalid character: ${c}` }, 400)
    }
  }
  if (new Set(chars).size !== chars.length) {
    return json({ error: 'characters must be unique' }, 400)
  }

  const db = adminClient()

  const { error } = await db.rpc('upsert_monthly_boost', {
    p_month:      monthStr,
    p_characters: JSON.stringify(chars),
    p_admin_id:   auth.userId,
  })
  if (error) return json({ error: error.message }, 500)

  return json({ ok: true, month: monthStr, count: chars.length })
})
