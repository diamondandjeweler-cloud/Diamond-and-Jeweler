#!/usr/bin/env node
/**
 * Prod-vs-repo migration drift check (DevOps audit follow-up).
 *
 * Compares the live project's supabase_migrations.schema_migrations to the repo's
 * supabase/migrations/*.sql files and reports:
 *   - repo migrations NOT recorded as applied in prod (the drift that makes
 *     `supabase db push` mis-fire), and
 *   - recorded versions with NO matching repo file (orphans).
 *
 * The CI db-apply job already proves every repo migration applies cleanly to a
 * fresh DB; this is the complementary check the audit called out as missing —
 * "CI validates fresh-apply but never detects prod-vs-repo drift".
 *
 * Requires a Supabase Management API token. Run:
 *   SUPABASE_ACCESS_TOKEN=… node scripts/check-migration-drift.mjs
 * Optionally set SUPABASE_PROJECT_REF (defaults to the prod ref).
 *
 * Exit codes: 0 = in sync, 1 = drift, 2 = setup/connection error.
 */
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const REF = process.env.SUPABASE_PROJECT_REF ?? 'sfnrpbsdscikpmbhrzub'
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN
if (!TOKEN) {
  console.error('SUPABASE_ACCESS_TOKEN is not set (Supabase Management API token).')
  process.exit(2)
}

const migDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations')

// Repo migration versions = the leading digits of each .sql filename. Duplicate
// prefixes collapse to one version (a separate CI guard rejects NEW duplicates).
const repoVersions = new Set()
for (const f of readdirSync(migDir)) {
  const m = f.endsWith('.sql') && f.match(/^(\d+)_/)
  if (m) repoVersions.add(m[1])
}

// Live recorded versions.
let rows
try {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'select version from supabase_migrations.schema_migrations' }),
  })
  if (!res.ok) {
    console.error(`Management API query failed: ${res.status} ${await res.text()}`)
    process.exit(2)
  }
  rows = await res.json()
} catch (e) {
  console.error('Could not reach the Management API:', e?.message ?? e)
  process.exit(2)
}
const recorded = new Set(rows.map((r) => r.version))

const sortNum = (a, b) => Number(a) - Number(b)
const unrecorded = [...repoVersions].filter((v) => !recorded.has(v)).sort(sortNum)
const orphaned = [...recorded].filter((v) => !repoVersions.has(v)).sort(sortNum)

console.log(`repo distinct versions: ${repoVersions.size}   prod recorded: ${recorded.size}`)
if (orphaned.length) {
  console.log(`\nRecorded in prod but NO repo file (${orphaned.length}):\n  ${orphaned.join(', ')}`)
}
if (unrecorded.length) {
  console.log(`\nRepo migrations NOT recorded as applied in prod (${unrecorded.length}):\n  ${unrecorded.join(', ')}`)
}

if (!unrecorded.length && !orphaned.length) {
  console.log('\n✓ no drift — prod tracking matches the repo migration set')
  process.exitCode = 0
} else {
  console.log('\n⚠ drift detected — prod supabase_migrations != repo migrations.')
  console.log('  Reconcile deliberately (record the genuinely-applied versions) before any `supabase db push`.')
  process.exitCode = 1
}
// Use exitCode (not process.exit) so a pending fetch handle drains cleanly —
// process.exit() mid-async trips a libuv assertion on Windows.
