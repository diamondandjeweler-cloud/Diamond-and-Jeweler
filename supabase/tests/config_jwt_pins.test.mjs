#!/usr/bin/env node
/**
 * verify_jwt pin invariant — the gate that prevents the payment-webhook 401
 * class of bug (DevOps / authz hardening).
 *
 * Two classes of Edge Function are NOT called with a Supabase *user* JWT and so
 * MUST be pinned `verify_jwt = false` in supabase/config.toml — otherwise the
 * gateway's default `verify_jwt = true` rejects the caller with a 401 BEFORE the
 * handler's own check runs (silently breaking paid fulfilment / cron jobs):
 *
 *   (A) Signature-verified webhooks — a function that imports `webhookCorsHeaders`
 *       from `_shared/cors.ts`. Its caller (Billplz / Resend) is a server, carries
 *       no Supabase JWT at all, and proves itself with a provider HMAC signature.
 *       This is the HARD invariant: any unpinned webhook function fails CI.
 *
 *   (B) Service-role-gated machine endpoints — a function that calls
 *       `requireServiceRole(...)`. Its caller (pg_cron / inter-function) presents
 *       the service-role key, not a user JWT. The broad intent is that these be
 *       pinned too; the currently-unpinned ones are grandfathered in the explicit
 *       allow-list below so this gate can go live green. A NEW service-role
 *       function that forgets its pin is blocked.
 *
 * Pure Node stdlib — no DB, no deps. Exit 0 = all invariants hold, 1 = mismatch.
 *
 *   node supabase/tests/config_jwt_pins.test.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const supabaseDir = join(here, '..')
const functionsDir = join(supabaseDir, 'functions')
const configPath = join(supabaseDir, 'config.toml')

// Grandfathered service-role functions that are NOT yet pinned verify_jwt=false.
// These reflect the tree's current state; the broad invariant says they SHOULD be
// pinned, but flipping that is an auth decision left to the owner (see return
// summary). Removing a name here makes the gate require its pin. Do NOT add a
// webhook function here — webhook pins are non-negotiable.
// TODO(batch2): owner to confirm each of these cron/inter-function endpoints
// either (a) gets verify_jwt=false pinned, or (b) is intentionally verify_jwt=true
// (i.e. requireServiceRole runs behind a gateway-verified JWT), then trim this list.
const SERVICE_ROLE_PIN_EXCEPTIONS = new Set([
  'auto-po',
  'bazi-score',
  'monthly-fortune',
  'myinvois-retry',
  'myinvois-self-billed',
  'myinvois-submit',
  'proactive-job-push',
  'process-match-queue',
  'reservation-reminder',
  'send-push-notification',
])

/** Parse config.toml → Set of function names pinned `verify_jwt = false`. */
function pinnedFalse(toml) {
  const pinned = new Set()
  let current = null
  for (const raw of toml.split(/\r?\n/)) {
    const line = raw.trim()
    const header = line.match(/^\[functions\.([A-Za-z0-9_-]+)\]$/)
    if (header) {
      current = header[1]
      continue
    }
    if (line.startsWith('[')) {
      current = null // entered some other (non-function) table
      continue
    }
    if (current && /^verify_jwt\s*=\s*false\b/.test(line)) {
      pinned.add(current)
    }
  }
  return pinned
}

/** Strip // line comments and /* block comments *\/ so signals in prose don't count. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function listFunctionDirs(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    if (name === '_shared') continue
    const full = join(dir, name)
    let isDir = false
    try {
      isDir = statSync(full).isDirectory()
    } catch {
      isDir = false
    }
    if (isDir) out.push(name)
  }
  return out
}

let toml
try {
  toml = readFileSync(configPath, 'utf8')
} catch (e) {
  console.error(`Cannot read ${configPath}: ${e?.message ?? e}`)
  process.exit(1)
}
const pinned = pinnedFalse(toml)

const webhookViolations = [] // (A) HARD — must be pinned, no exceptions
const serviceRoleViolations = [] // (B) not pinned and not allow-listed

for (const fn of listFunctionDirs(functionsDir)) {
  const indexPath = join(functionsDir, fn, 'index.ts')
  let src
  try {
    src = readFileSync(indexPath, 'utf8')
  } catch {
    continue // function without an index.ts (nothing to gate)
  }
  const code = stripComments(src)

  const importsWebhookCors = /\bimport\b[\s\S]*?\bwebhookCorsHeaders\b[\s\S]*?from\s+['"][^'"]*cors\.ts['"]/.test(code)
  const callsRequireServiceRole = /\brequireServiceRole\s*\(/.test(code)

  const isPinned = pinned.has(fn)

  if (importsWebhookCors && !isPinned) {
    webhookViolations.push(fn)
  }
  if (callsRequireServiceRole && !isPinned && !SERVICE_ROLE_PIN_EXCEPTIONS.has(fn)) {
    serviceRoleViolations.push(fn)
  }
}

// A grandfathered exception that no longer applies (function pinned or signal
// removed) is stale — surface it so the allow-list does not rot, but do NOT fail.
const staleExceptions = [...SERVICE_ROLE_PIN_EXCEPTIONS].filter((fn) => {
  const indexPath = join(functionsDir, fn, 'index.ts')
  let src
  try {
    src = readFileSync(indexPath, 'utf8')
  } catch {
    return true // function gone
  }
  if (pinned.has(fn)) return true // now pinned → exception unneeded
  return !/\brequireServiceRole\s*\(/.test(stripComments(src)) // signal gone
})

let failed = false

if (webhookViolations.length) {
  failed = true
  console.error('✗ Signature-verified webhook(s) NOT pinned verify_jwt=false in config.toml:')
  for (const fn of webhookViolations.sort()) console.error(`    ${fn}`)
  console.error(
    '\n  These callers (Billplz / Resend) carry no Supabase JWT — the gateway will\n' +
      '  401 them before the handler\'s HMAC check runs. Add to supabase/config.toml:\n' +
      '    [functions.<name>]\n    verify_jwt = false',
  )
}

if (serviceRoleViolations.length) {
  failed = true
  console.error('\n✗ Service-role function(s) NOT pinned verify_jwt=false and not allow-listed:')
  for (const fn of serviceRoleViolations.sort()) console.error(`    ${fn}`)
  console.error(
    '\n  A function gated by requireServiceRole is called with the service-role key\n' +
      '  (cron / inter-function), not a user JWT. Pin it in supabase/config.toml:\n' +
      '    [functions.<name>]\n    verify_jwt = false\n' +
      '  — or, if it is intentionally verify_jwt=true, add it to the documented\n' +
      '  SERVICE_ROLE_PIN_EXCEPTIONS allow-list in this test (with owner sign-off).',
  )
}

if (staleExceptions.length) {
  console.warn(
    `\n⚠ Stale SERVICE_ROLE_PIN_EXCEPTIONS entr${staleExceptions.length === 1 ? 'y' : 'ies'} (now pinned or signal removed) — ` +
      `safe to delete from this test: ${staleExceptions.sort().join(', ')}`,
  )
}

if (failed) {
  process.exitCode = 1
} else {
  console.log(
    `✓ verify_jwt pins consistent — ${pinned.size} function(s) pinned; ` +
      'all webhook + service-role endpoints accounted for.',
  )
  process.exitCode = 0
}
