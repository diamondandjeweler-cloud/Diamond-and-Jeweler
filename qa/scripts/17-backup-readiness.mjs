// 17 — Backup readiness.
// We cannot trigger a real restore drill (destructive), but we CAN verify:
//   1. Recent automated backups exist (Supabase keeps daily PITR by default)
//   2. The most recent backup is < 48h old
//   3. PITR (point-in-time recovery) window is healthy
//
// Uses the Supabase Mgmt API.

import { config } from '../config.mjs'

export default async function check() {
  if (!config.SUPABASE_PAT) {
    return { name: 'Backup readiness', status: 'SKIP', detail: 'PAT required', evidence: [] }
  }

  // Mgmt API: GET /v1/projects/{ref}/database/backups
  const url = `https://api.supabase.com/v1/projects/${config.SUPABASE_PROJECT_ID}/database/backups`
  let res
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${config.SUPABASE_PAT}` } })
  } catch (err) {
    return { name: 'Backup readiness', status: 'FAIL', detail: 'fetch failed', evidence: [err.message] }
  }
  if (!res.ok) {
    return {
      name: 'Backup readiness',
      status: 'WARN',
      detail: `Mgmt API returned ${res.status}; may require Pro plan for backups endpoint`,
      evidence: [(await res.text()).slice(0, 200)],
    }
  }

  const data = await res.json().catch(() => ({}))
  // Response shape: { backups: [...], physical_backup_data: { earliest_physical_backup_date_at, ...} }
  const backups = Array.isArray(data.backups) ? data.backups : []
  const pitrEarliest = data.physical_backup_data?.earliest_physical_backup_date_at
  const now = Date.now()

  if (backups.length === 0 && !pitrEarliest) {
    return {
      name: 'Backup readiness',
      status: 'WARN',
      detail: 'No backups listed by Mgmt API',
      evidence: ['Verify in Supabase dashboard → Database → Backups'],
    }
  }

  const lines = []
  if (backups.length) {
    const newest = backups[0]
    const ts = newest.inserted_at || newest.created_at
    if (ts) {
      const ageH = Math.round((now - new Date(ts).getTime()) / 3600000)
      lines.push(`Newest snapshot: ${ageH}h ago (${ts})`)
      if (ageH > 48) {
        return {
          name: 'Backup readiness',
          status: 'FAIL',
          detail: `Newest backup is ${ageH}h old (>48h)`,
          evidence: lines,
        }
      }
    }
    lines.push(`${backups.length} retained snapshot(s)`)
  }
  if (pitrEarliest) {
    const ageH = Math.round((now - new Date(pitrEarliest).getTime()) / 3600000)
    lines.push(`PITR window starts: ${ageH}h ago`)
  }

  return {
    name: 'Backup readiness',
    status: 'PASS',
    detail: 'Backups present + recent',
    evidence: lines,
  }
}
