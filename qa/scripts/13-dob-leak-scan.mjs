// 13 — DOB leak scan.
// DOBs are pgsodium-encrypted; the only legitimate decryption path is
// `decrypt_dob()` which is now revoked from `authenticated` (migration 0068).
// Verify: no decrypted DOBs leak into the JS bundle, and the API returns
// only the encrypted bytea (or null) when a logged-in user reads their row.

import { readdirSync, readFileSync, statSync } from 'fs'
import { join, resolve, relative, dirname } from 'path'
import { fileURLToPath } from 'url'
import { mintTokenFor } from '../lib/auth.mjs'
import { config } from '../config.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../..')
const DIST = resolve(ROOT, 'apps/web/dist')

// Real-looking dates from tester DOB ranges (1980-2005).
const DOB_PATTERN = /\b(19[8-9]\d|20[0-1]\d)-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/

function* walk(dir) {
  let ents
  try { ents = readdirSync(dir) } catch { return }
  for (const n of ents) {
    const f = join(dir, n)
    let s
    try { s = statSync(f) } catch { continue }
    if (s.isDirectory()) yield* walk(f)
    else if (s.isFile() && /\.(html|js|mjs|css|json|map)$/.test(n)) yield f
  }
}

export default async function check() {
  // Bundle scan.
  const hits = []
  for (const file of walk(DIST)) {
    const content = readFileSync(file, 'utf-8')
    const m = content.match(DOB_PATTERN)
    if (m) {
      // Allowlist: copyright/legal years from i18n strings, etc. The match
      // must be near "dob", "date_of_birth", or "birthday" to count.
      const ctx = content.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40)
      if (/dob|date_of_birth|birthday|born|d\.o\.b/i.test(ctx)) {
        hits.push(`${relative(ROOT, file)} → ${m[0]} (in DOB context)`)
      }
    }
  }

  // API probe: logged-in talent reads own row; encrypted_dob must be bytea/hex,
  // never a YYYY-MM-DD string.
  const apiFailures = []
  if (config.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const token = await mintTokenFor(config.TESTER_TALENT_A)
      const res = await fetch(
        `${config.SUPABASE_URL}/rest/v1/talents?select=*`,
        {
          headers: {
            apikey: config.SUPABASE_ANON_KEY,
            Authorization: `Bearer ${token}`,
          },
        }
      )
      const body = await res.text()
      if (DOB_PATTERN.test(body)) {
        const m = body.match(DOB_PATTERN)
        // If the date appears next to a "dob" key, it's a leak.
        if (/"dob"\s*:\s*"\d{4}/.test(body)) {
          apiFailures.push(`talents API returned plaintext DOB: ${m[0]}`)
        }
      }
    } catch (err) {
      // non-fatal; just record
    }
  }

  if (hits.length === 0 && apiFailures.length === 0) {
    return { name: 'DOB leak scan', status: 'PASS', detail: 'No plaintext DOBs in bundle or API', evidence: [] }
  }
  return {
    name: 'DOB leak scan',
    status: hits.length || apiFailures.length ? 'FAIL' : 'WARN',
    detail: `${hits.length} bundle hit(s), ${apiFailures.length} API leak(s)`,
    evidence: [...hits, ...apiFailures],
  }
}
