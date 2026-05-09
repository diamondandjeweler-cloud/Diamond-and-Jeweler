// 10 — Secret scan.
// Prefer gitleaks if installed; fall back to a regex sweep of the built
// bundle for obvious leaks (service-role keys, OpenAI keys, Resend keys).

import { execSync } from 'child_process'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, resolve, relative, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../..')
const DIST = resolve(ROOT, 'apps/web/dist')

const PATTERNS = [
  { name: 'Supabase service-role key', re: /eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{20,}/ },
  { name: 'Resend API key',            re: /\bre_[A-Za-z0-9]{16,}\b/ },
  { name: 'OpenAI API key',            re: /\bsk-[A-Za-z0-9]{20,}\b/ },
  { name: 'Anthropic API key',         re: /\bsk-ant-[A-Za-z0-9-]{20,}\b/ },
  { name: 'AWS access key',            re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Generic private key',       re: /-----BEGIN (RSA|EC|OPENSSH|PRIVATE) KEY-----/ },
]

function* walk(dir) {
  let ents
  try { ents = readdirSync(dir) } catch { return }
  for (const n of ents) {
    const f = join(dir, n)
    let s
    try { s = statSync(f) } catch { continue }
    if (s.isDirectory()) yield* walk(f)
    else if (s.isFile() && /\.(html|js|mjs|css|json|txt|map)$/.test(n)) yield f
  }
}

export default async function check() {
  // Try gitleaks first.
  try {
    execSync('gitleaks version', { stdio: 'ignore' })
    try {
      execSync(`gitleaks detect --source "${ROOT}" --no-banner --redact`, {
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      return { name: 'Secret scan', status: 'PASS', detail: 'gitleaks: 0 leaks', evidence: [] }
    } catch (err) {
      const out = (err.stdout?.toString() || '') + (err.stderr?.toString() || '')
      const lines = out.split('\n').filter((l) => /finding/i.test(l) || /Secret/i.test(l)).slice(0, 5)
      return { name: 'Secret scan', status: 'FAIL', detail: 'gitleaks found leaks', evidence: lines }
    }
  } catch {
    // gitleaks not installed — fall through to bundle regex scan.
  }

  const hits = []
  let scanned = 0
  for (const file of walk(DIST)) {
    scanned++
    const content = readFileSync(file, 'utf-8')
    for (const { name, re } of PATTERNS) {
      const m = content.match(re)
      if (m) {
        // Allow VITE_SUPABASE_ANON_KEY (publishable) — it's intentionally shipped.
        if (/sb_publishable_/.test(content.slice(Math.max(0, m.index - 30), m.index + m[0].length))) continue
        hits.push(`${relative(ROOT, file)} → ${name}`)
        break
      }
    }
  }

  if (hits.length === 0) {
    return {
      name: 'Secret scan',
      status: 'PASS',
      detail: `gitleaks not installed; bundle regex scan clean (${scanned} files)`,
      evidence: ['Recommend: scoop install gitleaks'],
    }
  }
  return {
    name: 'Secret scan',
    status: 'FAIL',
    detail: `${hits.length} secret(s) in dist/`,
    evidence: hits,
  }
}
