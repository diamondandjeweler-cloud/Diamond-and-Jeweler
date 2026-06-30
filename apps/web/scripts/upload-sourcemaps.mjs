// Sentry source-map inject + upload — ENV-GATED, NO-OP when unconfigured.
//
// WHY IT RUNS BEFORE strip-sourcemaps.mjs:
//   `vite build` emits hidden source maps (sourcemap: 'hidden' in vite.config.ts),
//   so dist/ contains .map files AND the built .js still carries a
//   sourceMappingURL pointer at this point. Sentry needs BOTH — it injects a
//   stable Debug ID into each bundle + its map, then uploads the maps — so this
//   MUST run while the maps and their references still exist. strip-sourcemaps.mjs
//   then deletes the .map files and removes the sourceMappingURL pointers so
//   nothing source-map ships to the public CDN. Order (package.json `build`):
//     vite build → inject-meta.mjs → upload-sourcemaps.mjs → strip-sourcemaps.mjs
//
// ENV GATE (all three required; otherwise this is a clean no-op):
//   SENTRY_AUTH_TOKEN  — Sentry auth token with project:releases scope
//   SENTRY_ORG         — Sentry organization slug
//   SENTRY_PROJECT     — Sentry project slug
//   SENTRY_RELEASE     — (optional) release/version; falls back to git SHA / npm version
//   SENTRY_URL         — (optional) self-hosted Sentry base URL
//
// HARD REQUIREMENT: this step must NEVER break a build that did not opt in. When
//   any of the three required vars is unset, we print a one-line skip and exit 0
//   WITHOUT invoking sentry-cli at all. When they ARE set, we run @sentry/cli via
//   `npx --yes` (fetched on demand — no devDependency added), and a real upload
//   failure surfaces (the operator explicitly opted in by setting the env).
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const DIST = join(__dirname, '..', 'dist')

const token = process.env.SENTRY_AUTH_TOKEN
const org = process.env.SENTRY_ORG
const project = process.env.SENTRY_PROJECT

// --- ENV GATE: skip cleanly when not fully configured -----------------------
if (!token || !org || !project) {
  const missing = [
    !token && 'SENTRY_AUTH_TOKEN',
    !org && 'SENTRY_ORG',
    !project && 'SENTRY_PROJECT',
  ].filter(Boolean).join(', ')
  console.log(
    `upload-sourcemaps: Sentry env not set (missing: ${missing}) — skipping source-map upload (no-op).`,
  )
  process.exit(0)
}

// dist/ may not exist on a typecheck-only / partial run — skip rather than fail.
if (!existsSync(DIST)) {
  console.log('upload-sourcemaps: dist/ not found — skipping source-map upload.')
  process.exit(0)
}

const release = process.env.SENTRY_RELEASE || process.env.npm_package_version || ''
const baseEnv = { ...process.env, SENTRY_AUTH_TOKEN: token, SENTRY_ORG: org, SENTRY_PROJECT: project }

// Run a @sentry/cli subcommand via npx (fetched on demand; no devDependency).
function sentry(args) {
  const full = ['--yes', '@sentry/cli', ...args]
  console.log(`upload-sourcemaps: npx ${full.join(' ')}`)
  const r = spawnSync('npx', full, { stdio: 'inherit', env: baseEnv, shell: process.platform === 'win32' })
  if (r.error) throw r.error
  if (typeof r.status === 'number' && r.status !== 0) {
    throw new Error(`@sentry/cli ${args[0]} ${args[1] ?? ''} exited with code ${r.status}`)
  }
}

try {
  // 1) Inject a stable Debug ID into each bundle and its .map (idempotent).
  sentry(['sourcemaps', 'inject', DIST])
  // 2) Upload the maps for this release so Sentry can de-minify stack traces.
  const uploadArgs = ['sourcemaps', 'upload']
  if (release) uploadArgs.push('--release', release)
  uploadArgs.push(DIST)
  sentry(uploadArgs)
  console.log(
    `upload-sourcemaps: injected + uploaded source maps to Sentry (org=${org}, project=${project}${release ? `, release=${release}` : ''}).`,
  )
} catch (e) {
  // The operator opted in (env is set) — a genuine upload failure should be
  // visible. Fail the build so a broken Sentry config is caught, not silently
  // swallowed. (When the env is UNSET we never reach here — see the gate above.)
  console.error('upload-sourcemaps: Sentry source-map upload failed:', e?.message ?? e)
  process.exit(1)
}
