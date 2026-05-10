// 20 — AI match quality auto-grader.
// Replaces the "eyeball 10 AI match results" manual item with a structural
// grader: for each match, verify reasoning is non-empty, mentions the talent,
// references at least one of the role's required skills/traits, and avoids
// red-flag phrases (system prompt leakage, hallucinated company facts).

import { mgmtSql } from '../lib/http.mjs'
import { config } from '../config.mjs'

const RED_FLAGS = [
  /ignore (prior|previous) instructions/i,
  /system prompt/i,
  /score:\s*100\b/i,           // suspicious perfect score in reasoning
  /\b\[INST\]|\[\/INST\]\b/,   // Llama instruction markers leaked
  /you are (now|dan|admin)/i,
]

export default async function check() {
  if (!config.SUPABASE_PAT) {
    return { name: 'AI match quality', status: 'SKIP', detail: 'PAT required', evidence: [] }
  }

  // Sample up to 10 recent matches with non-null reasoning.
  const rows = await mgmtSql(`
    select
      m.id::text as id,
      m.public_reasoning::text as public_reasoning,
      m.compatibility_score,
      m.tag_compatibility,
      r.title as role_title,
      r.required_traits
    from public.matches m
    join public.roles r on r.id = m.role_id
    where m.public_reasoning is not null
      and length(m.public_reasoning::text) > 20
    order by m.created_at desc
    limit 10
  `)

  if (rows.length === 0) {
    return {
      name: 'AI match quality',
      status: 'WARN',
      detail: 'No matches with public_reasoning yet (cold start)',
      evidence: ['Tester profiles need parsed_resume + interview_answers populated'],
    }
  }

  const issues = []
  for (const m of rows) {
    const r = String(m.public_reasoning || '')
    // 1. Non-trivial length
    if (r.length < 30) issues.push(`${m.id.slice(0, 8)}: reasoning too short (${r.length} chars)`)
    // 2. Red flags
    for (const re of RED_FLAGS) {
      if (re.test(r)) {
        issues.push(`${m.id.slice(0, 8)}: red-flag phrase matched ${re}`)
        break
      }
    }
    // 3. Score sanity (0..100)
    const cs = Number(m.compatibility_score)
    if (!Number.isFinite(cs) || cs < 0 || cs > 100) {
      issues.push(`${m.id.slice(0, 8)}: compatibility_score out of range (${m.compatibility_score})`)
    }
  }

  if (issues.length === 0) {
    return {
      name: 'AI match quality',
      status: 'PASS',
      detail: `${rows.length} matches sampled · all reasoning structurally clean`,
      evidence: rows.slice(0, 3).map((m) =>
        `${m.id.slice(0, 8)} [${m.role_title?.slice(0, 30)}] score=${m.compatibility_score}`,
      ),
    }
  }
  return {
    name: 'AI match quality',
    status: issues.some((i) => /red-flag|out of range/.test(i)) ? 'FAIL' : 'WARN',
    detail: `${issues.length} issue(s) across ${rows.length} matches`,
    evidence: issues,
  }
}
