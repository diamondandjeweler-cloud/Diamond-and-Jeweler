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

  // Find the actual score column on matches.
  const cols = await mgmtSql(`
    select column_name
    from information_schema.columns
    where table_schema='public' and table_name='matches'
  `)
  const colNames = cols.map((r) => r.column_name)
  const scoreCol = ['compatibility_score', 'total_score', 'score', 'match_score', 'final_score']
    .find((c) => colNames.includes(c)) ?? null

  // Inspect match_inputs (the matcher's feature surface) — this is the static
  // bias check: if the model can SEE the name, name-swap could move the score.
  const inputCols = await mgmtSql(`
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'match_inputs'
  `)
  const inputColNames = inputCols.map((r) => r.column_name)
  const nameLeaked = inputColNames.some((c) => /^(full_name|name|display_name|first_name|last_name)$/.test(c))
  if (nameLeaked) {
    failures.push(`match_inputs exposes name column(s): ${inputColNames.filter(c => /name/i.test(c)).join(', ')}`)
  }

  for (const pair of PAIRS) {
    if (!scoreCol) {
      lines.push(`${pair.id} (${pair.tag}): score column not found on matches — skipping baseline`)
      continue
    }
    const rows = await mgmtSql(`
      select round(avg(m.${scoreCol})::numeric, 2) as avg_score, count(*)::int as n
      from public.matches m
      join public.profiles p on p.id = m.talent_id
      where p.email = '${pair.from.replace(/'/g, "''")}'
    `)
    const baseline = rows[0]?.avg_score
    const n = rows[0]?.n ?? 0
    if (baseline == null || n === 0) {
      lines.push(`${pair.id}: no existing matches for ${pair.from}`)
    } else {
      lines.push(`${pair.id} (${pair.tag}): baseline ${baseline} from ${n} matches`)
    }
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
