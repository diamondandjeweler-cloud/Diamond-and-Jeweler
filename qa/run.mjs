#!/usr/bin/env node
// DNJ Launch QA — orchestrator.
// Runs every automated check sequentially, prints green/red table,
// exits 0 if all PASS/WARN, 1 if any FAIL.

import { config } from './config.mjs'
import { printHeader, printRow, printFooter, exitCode } from './lib/report.mjs'

const CHECKS = [
  ['01-bazi-secrecy',         'BaZi secrecy'],
  ['02-rls-sweep',             'RLS sweep'],
  ['03-idor-probes',           'IDOR probes'],
  ['04-jwt-tamper',            'JWT tamper'],
  ['05-ai-determinism',        'AI determinism'],
  ['06-bias-swap',             'Bias swap'],
  ['07-prompt-injection',      'Prompt injection'],
  ['08-vercel-sha',            'Vercel SHA'],
  ['09-dep-vuln',              'Dependency vulns'],
  ['10-secret-scan',           'Secret scan'],
  ['11-tester-hidden',         'Tester accounts hidden'],
  ['12-dsr-tenant-isolation',  'DSR tenant isolation'],
  ['13-dob-leak-scan',         'DOB leak scan'],
  ['14-storage-rls',           'Storage path-RLS'],
  ['15-bazi-ai-probe',         'BaZi AI probe'],
  ['16-tls-headers',           'TLS + headers'],
  ['17-backup-readiness',      'Backup readiness'],
  ['18-ssl-dns',               'SSL + DNS'],
  ['19-seo-sanity',            'SEO sanity'],
  ['20-ai-match-quality',      'AI match quality'],
  ['21-email-template-scan',   'Email template scan'],
]

async function main() {
  printHeader(config.QA_BASE_URL)
  const t0 = Date.now()
  const results = []

  for (let i = 0; i < CHECKS.length; i++) {
    const [file, name] = CHECKS[i]
    let result
    try {
      const mod = await import(`./scripts/${file}.mjs`)
      result = await mod.default()
      if (!result.name) result.name = name
    } catch (err) {
      result = {
        name,
        status: 'FAIL',
        detail: `Harness error: ${err.message}`,
        evidence: [err.stack?.split('\n').slice(0, 3).join('\n')].filter(Boolean),
      }
    }
    results.push(result)
    printRow(i + 1, result)
  }

  printFooter(results, Date.now() - t0)
  process.exit(exitCode(results))
}

main().catch((err) => {
  console.error('\nFatal harness error:', err)
  process.exit(2)
})
