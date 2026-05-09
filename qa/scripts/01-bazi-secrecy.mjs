// 01 — BaZi secrecy.
// Forbidden strings must NOT appear in any user-shipped surface:
//   - apps/web/dist/**           (the built bundle)
//   - apps/web/index.html        (source HTML)
//   - apps/web/public/**         (static assets)
//   - supabase/functions/notify/ (email templates)
//   - supabase/functions/chat-* (user-facing AI replies)
//
// Allowed in: server-side compute (match-generate, bazi-score, monthly-fortune,
// supabase/migrations/*.sql) — those never reach a user.

import { readdirSync, readFileSync, statSync } from 'fs'
import { join, resolve, relative, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../..')

const FORBIDDEN = [
  /\bBaZi\b/i,
  /\b八字\b/,
  /\blife[\s-]?chart\b/i,
  /\blifeChart\b/,
  /compute_life_chart_score/,
  /get_life_chart_bucket/,
  /get_year_luck_stage/,
  /life_chart_compatibility/,
  /\byear[_\s]?luck\b/i,
  /\byearLuck\b/,
]

// Surfaces that must be CLEAN (user-facing output only).
// Note: server-side guard logic that says "Never mention BaZi" is GOOD —
// scanning chat-* / draft-* would create false positives on those guards.
// We instead test the AI's actual replies in qa/scripts/07-prompt-injection.mjs.
const SCAN_DIRS = [
  'apps/web/dist',
  'apps/web/public',
]

const SCAN_FILES = [
  'apps/web/index.html',
]

// Email-template heuristic: only flag template literal strings, not guard logic.
// notify/index.ts builds email bodies — scan for BaZi in template-string contexts.
const NOTIFY_TEMPLATE_FILE = 'supabase/functions/notify/index.ts'

const ALLOW_EXTS = new Set([
  '.html', '.htm', '.js', '.mjs', '.cjs', '.css', '.json', '.txt',
  '.ts', '.tsx', '.svg', '.md',
])

function* walk(dir) {
  let entries
  try { entries = readdirSync(dir) } catch { return }
  for (const name of entries) {
    const full = join(dir, name)
    let st
    try { st = statSync(full) } catch { continue }
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === '.git') continue
      yield* walk(full)
    } else if (st.isFile()) {
      const dot = name.lastIndexOf('.')
      const ext = dot >= 0 ? name.slice(dot) : ''
      if (ALLOW_EXTS.has(ext)) yield full
    }
  }
}

export default async function check() {
  const hits = []
  let scanned = 0

  for (const rel of SCAN_DIRS) {
    for (const file of walk(join(ROOT, rel))) {
      scanned++
      let content
      try { content = readFileSync(file, 'utf-8') } catch { continue }
      for (const re of FORBIDDEN) {
        const m = content.match(re)
        if (m) {
          const idx = content.indexOf(m[0])
          const lineNo = content.slice(0, idx).split('\n').length
          hits.push(`${relative(ROOT, file)}:${lineNo} → "${m[0]}"`)
          break // one hit per file is enough
        }
      }
    }
  }

  for (const f of SCAN_FILES) {
    scanned++
    let content
    try { content = readFileSync(join(ROOT, f), 'utf-8') } catch { continue }
    for (const re of FORBIDDEN) {
      const m = content.match(re)
      if (m) {
        hits.push(`${f} → "${m[0]}"`)
        break
      }
    }
  }

  // notify/index.ts: only flag mentions inside email template strings,
  // i.e. between backticks containing 'subject' or 'body' nearby.
  try {
    const notify = readFileSync(join(ROOT, NOTIFY_TEMPLATE_FILE), 'utf-8')
    scanned++
    for (const re of FORBIDDEN) {
      const m = notify.match(re)
      if (!m) continue
      const idx = notify.indexOf(m[0])
      // Look at 200 chars of surrounding context. If it contains common email
      // keys like "subject:", "body:", "html:", "text:" it's probably template.
      const ctx = notify.slice(Math.max(0, idx - 200), idx + m[0].length + 50)
      if (/(subject|body|html|text|template|message)\s*[:=]/.test(ctx)) {
        const lineNo = notify.slice(0, idx).split('\n').length
        hits.push(`${NOTIFY_TEMPLATE_FILE}:${lineNo} → "${m[0]}" (in email template)`)
        break
      }
    }
  } catch { /* notify file optional */ }

  if (hits.length === 0) {
    return {
      name: 'BaZi secrecy',
      status: 'PASS',
      detail: `${scanned} files scanned, 0 forbidden hits`,
      evidence: [],
    }
  }
  return {
    name: 'BaZi secrecy',
    status: 'FAIL',
    detail: `${hits.length} forbidden string(s) found in shipped surfaces`,
    evidence: hits,
  }
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  check().then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(r.status === 'FAIL' ? 1 : 0) })
}
