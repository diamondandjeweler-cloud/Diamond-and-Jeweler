// Pretty terminal table for QA results.
// Status colors: PASS green, FAIL red, WARN yellow, SKIP grey.

const C = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  grey: '\x1b[90m',
  bold: '\x1b[1m',
}

function colorFor(status) {
  switch (status) {
    case 'PASS': return C.green
    case 'FAIL': return C.red
    case 'WARN': return C.yellow
    case 'SKIP': return C.grey
    default: return C.reset
  }
}

export function printHeader(target) {
  const now = new Date().toISOString()
  console.log(`\nDNJ Launch QA — ${target}`)
  console.log(`Run at: ${now}`)
  console.log('─'.repeat(70))
}

export function printRow(idx, result) {
  const id = String(idx).padStart(2, '0')
  const name = result.name.padEnd(26)
  const col = colorFor(result.status)
  const status = (col + result.status.padEnd(6) + C.reset)
  const detail = result.detail || ''
  console.log(`[${id}] ${name}${status}${detail}`)
  if (result.evidence && result.evidence.length) {
    for (const e of result.evidence.slice(0, 5)) {
      console.log(`     ${C.grey}└ ${e}${C.reset}`)
    }
    if (result.evidence.length > 5) {
      console.log(`     ${C.grey}└ … +${result.evidence.length - 5} more${C.reset}`)
    }
  }
}

export function printFooter(results, elapsedMs) {
  const counts = { PASS: 0, FAIL: 0, WARN: 0, SKIP: 0 }
  for (const r of results) counts[r.status] = (counts[r.status] || 0) + 1
  console.log('─'.repeat(70))
  const parts = [
    `${C.green}${counts.PASS} PASS${C.reset}`,
    counts.FAIL ? `${C.red}${counts.FAIL} FAIL${C.reset}` : null,
    counts.WARN ? `${C.yellow}${counts.WARN} WARN${C.reset}` : null,
    counts.SKIP ? `${C.grey}${counts.SKIP} SKIP${C.reset}` : null,
  ].filter(Boolean)
  const elapsed = (elapsedMs / 1000).toFixed(1)
  console.log(`${parts.join(' · ')} · ${elapsed}s\n`)
}

export function exitCode(results) {
  return results.some((r) => r.status === 'FAIL') ? 1 : 0
}
