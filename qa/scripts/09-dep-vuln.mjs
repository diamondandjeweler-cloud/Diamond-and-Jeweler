// 09 — Dependency vulns.
// Wraps `npm audit --json` on apps/web. FAIL if any high/critical.

import { execSync } from 'child_process'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APP = resolve(__dirname, '../../apps/web')

export default async function check() {
  let raw
  try {
    raw = execSync('npm audit --json --omit=dev', { cwd: APP, stdio: ['ignore', 'pipe', 'pipe'] })
      .toString()
  } catch (err) {
    // npm audit exits non-zero when vulns exist — stdout still has JSON.
    raw = err.stdout?.toString() || ''
    if (!raw) {
      return { name: 'Dependency vulns', status: 'FAIL', detail: 'npm audit failed', evidence: [err.message] }
    }
  }

  let report
  try { report = JSON.parse(raw) }
  catch (err) {
    return { name: 'Dependency vulns', status: 'FAIL', detail: 'Could not parse npm audit JSON', evidence: [] }
  }

  const sev = report.metadata?.vulnerabilities || {}
  const high = (sev.high || 0) + (sev.critical || 0)
  const med = sev.moderate || 0

  if (high === 0 && med === 0) {
    return { name: 'Dependency vulns', status: 'PASS', detail: '0 high/critical/moderate', evidence: [] }
  }
  if (high === 0) {
    return { name: 'Dependency vulns', status: 'WARN', detail: `${med} moderate (no high/critical)`, evidence: [] }
  }
  return {
    name: 'Dependency vulns',
    status: 'FAIL',
    detail: `${high} high+critical, ${med} moderate`,
    evidence: [`Run: cd apps/web && npm audit`],
  }
}
