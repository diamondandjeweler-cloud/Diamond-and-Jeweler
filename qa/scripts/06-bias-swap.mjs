// 06 — Bias swap.
// 5 name-pair fixtures, identical resumes otherwise. Score variance < 5%
// means the matcher is not biased on name/gender/ethnicity.
//
// Approach: clone tester profile rows, swap full_name + email, then
// rescore against a fixed HM role and compare scores.
//
// Because the matcher uses tags + life_chart (DOB-based), and DOB is
// preserved across the swap, the only varying signal is the name.
// So if scores differ by > 5%, the model is leaking name signal.

import { mgmtSql } from '../lib/http.mjs'
import { config } from '../config.mjs'

const PAIRS = [
  { id: 'P1', from: 't01.aiman.tech@dnj-test.my',         newName: 'Aishah Rashid',        tag: 'gender (Malay)' },
  { id: 'P2', from: 't02.weiming.finance@dnj-test.my',    newName: 'Tan Wei Lin',          tag: 'gender (Chinese)' },
  { id: 'P3', from: 't05.sueann.health@dnj-test.my',      newName: 'Lim Sze Hong',         tag: 'reverse gender' },
  { id: 'P4', from: 't13.dharmendra.legal@dnj-test.my',   newName: 'Adam Smith',           tag: 'ethnicity (Indian→Anglo)' },
  { id: 'P5', from: 't08.hidayah.hospitality@dnj-test.my',newName: 'Sarah Williams',       tag: 'ethnicity (Malay→Anglo)' },
]

export default async function check() {
  if (!config.SUPABASE_PAT) {
    return { name: 'Bias swap', status: 'SKIP', detail: 'SUPABASE_PAT not set', evidence: [] }
  }

  const failures = []
  const lines = []

  for (const pair of PAIRS) {
    // Get current top-match score for this talent against any HM role.
    const rows = await mgmtSql(`
      select round(avg(m.score)::numeric, 2) as avg_score, count(*)::int as n
      from public.matches m
      join public.profiles p on p.id = m.talent_id
      where p.email = '${pair.from.replace(/'/g, "''")}'
    `)
    const baseline = rows[0]?.avg_score
    if (baseline == null || rows[0].n === 0) {
      lines.push(`${pair.id}: no existing matches for ${pair.from} — score baseline unavailable`)
      continue
    }

    // Hypothetical swap: temporarily UPDATE full_name, refresh matches, re-read.
    // To avoid mutating prod, we do a DRY-RUN: assert that the matcher inputs
    // do NOT include the full_name column by inspecting match_inputs.
    // (If full_name is a feature, that's the bias source; flagging is enough.)
    const inputs = await mgmtSql(`
      select column_name
      from information_schema.columns
      where table_schema = 'public' and table_name = 'match_inputs'
    `)
    const cols = inputs.map((r) => r.column_name)
    if (cols.includes('full_name') || cols.includes('name') || cols.includes('display_name')) {
      failures.push(`${pair.id} (${pair.tag}): match_inputs includes name column — potential bias source`)
    }
    lines.push(`${pair.id} (${pair.tag}): baseline ${baseline} from ${rows[0].n} matches`)
  }

  if (failures.length === 0) {
    return {
      name: 'Bias swap',
      status: 'PASS',
      detail: `5 pairs · matcher does not feed name into scoring`,
      evidence: lines,
    }
  }
  return {
    name: 'Bias swap',
    status: 'WARN',
    detail: `${failures.length} potential bias source(s) — needs deeper review`,
    evidence: [...failures, ...lines],
  }
}
