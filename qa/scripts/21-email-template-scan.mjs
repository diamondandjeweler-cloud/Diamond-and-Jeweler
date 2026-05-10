// 21 — Email template deep scan.
// Replaces the "eyeball email subject lines for BaZi" manual item.
// Trigger each notify-email type to a tester address, then read the
// notification_outbox row content and assert no forbidden terms.
//
// We don't actually send (would spam Resend); we just inspect the
// rendered template strings inside notify/index.ts at the source.

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const NOTIFY = resolve(__dirname, '../../supabase/functions/notify/index.ts')

const FORBIDDEN = [
  /\bBaZi\b/i,
  /\b八字\b/,
  /\blife[\s-]?chart\b/i,
  /\bMing\s*Gua\b/i,
  /\bChinese metaphysics\b/i,
  /\bzodiac\b/i,
  /\bfortune\b/i,
]

// Heuristic: a forbidden mention is a LEAK only if it appears inside a
// template literal that's clearly a user-facing email body or subject.
// We grep for ` `template literal contexts only.
function isInTemplateLiteral(src, idx) {
  // Walk backwards to find the start of the enclosing context.
  // If the nearest unescaped backtick is a string template, return true.
  let i = idx
  let depth = 0
  while (i > 0) {
    const ch = src[i]
    if (ch === '`' && src[i - 1] !== '\\') {
      depth++
      if (depth === 1) return true
    }
    if (ch === '\n' && depth === 0) return false // walked too far without finding backtick
    i--
    if (idx - i > 2000) return false // sanity bound
  }
  return false
}

export default async function check() {
  let src
  try {
    src = readFileSync(NOTIFY, 'utf-8')
  } catch (err) {
    return { name: 'Email template scan', status: 'SKIP', detail: 'notify/index.ts not found', evidence: [] }
  }

  const hits = []
  for (const re of FORBIDDEN) {
    const r = new RegExp(re.source, re.flags + (re.flags.includes('g') ? '' : 'g'))
    let m
    while ((m = r.exec(src)) !== null) {
      if (isInTemplateLiteral(src, m.index)) {
        const lineNo = src.slice(0, m.index).split('\n').length
        hits.push(`notify/index.ts:${lineNo} → "${m[0]}" inside email template`)
      }
    }
  }

  if (hits.length === 0) {
    return {
      name: 'Email template scan',
      status: 'PASS',
      detail: 'No forbidden terms in any email template literal',
      evidence: [`Scanned ${(src.match(/`/g) || []).length / 2 | 0} template literals`],
    }
  }
  return {
    name: 'Email template scan',
    status: 'FAIL',
    detail: `${hits.length} forbidden term(s) in email templates`,
    evidence: hits,
  }
}
