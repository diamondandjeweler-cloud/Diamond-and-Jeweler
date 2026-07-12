// Playwright globalSetup for the SEEDED e2e flow.
//
// OPT-IN ONLY. This is a hard no-op unless HAS_SEEDED_BACKEND is set, so it is
// safe to reference from any config: the default no-backend smoke suite never
// touches a database. It is wired ONLY from playwright.seeded.config.ts today
// (the default playwright.config.ts is deliberately left with no globalSetup),
// but the guard means an accidental wire-up can't seed a random DB either.
//
// When enabled it:
//   1. Resolves the local Supabase URL / service-role key / DB URL from env,
//      falling back to `supabase status -o env` (then to the documented local
//      defaults for the non-secret URLs).
//   2. Creates the demo auth users seed_demo.sql expects, via the service-role
//      Admin API (email_confirm: true so login works with confirmations on).
//   3. Loads supabase/seed_demo.sql through psql.
//
// Requires (only when HAS_SEEDED_BACKEND=1): a running local Supabase stack
// (`supabase start`) and `psql` on PATH. See tests/e2e/README.md.

import type { FullConfig } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { DEMO_USERS, DEMO_PASSWORD } from './seed/demo-users'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// apps/web/tests/e2e -> up 4 -> monorepo root (holds supabase/).
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..')
const SEED_SQL = path.join(REPO_ROOT, 'supabase', 'seed_demo.sql')

// Documented local defaults. The service-role KEY is intentionally NOT defaulted
// here (it is an RLS-bypass credential and should come from env or the live
// `supabase status`); only the non-secret URLs get a fallback.
const DEFAULT_API_URL = 'http://127.0.0.1:54321'
const DEFAULT_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

interface SupabaseEnv {
  API_URL?: string
  DB_URL?: string
  SERVICE_ROLE_KEY?: string
}

/** Parse `supabase status -o env` output. Returns {} if the CLI isn't available. */
function readSupabaseStatus(): SupabaseEnv {
  try {
    const out = execFileSync('supabase', ['status', '-o', 'env'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const env: Record<string, string> = {}
    for (const line of out.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)\s*=\s*"?([^"\r]*)"?\s*$/)
      if (m) env[m[1]] = m[2]
    }
    return env
  } catch {
    // supabase CLI not installed / stack not up — caller falls back to env/defaults.
    return {}
  }
}

async function globalSetup(_config: FullConfig): Promise<void> {
  if (!process.env.HAS_SEEDED_BACKEND) {
    // Not opted in — do nothing so the no-backend smoke suite is unaffected.
    return
  }

  const status = readSupabaseStatus()
  const url = process.env.SUPABASE_URL ?? status.API_URL ?? DEFAULT_API_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? status.SERVICE_ROLE_KEY
  const dbUrl = process.env.SUPABASE_DB_URL ?? status.DB_URL ?? DEFAULT_DB_URL

  if (!serviceKey) {
    throw new Error(
      'HAS_SEEDED_BACKEND is set but no service-role key was found. ' +
        'Start local Supabase (`supabase start`) so `supabase status` can supply ' +
        'SERVICE_ROLE_KEY, or export SUPABASE_SERVICE_ROLE_KEY explicitly.',
    )
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // 1. Create the demo auth users (idempotent: an existing user is fine).
  for (const u of DEMO_USERS) {
    const { error } = await admin.auth.admin.createUser({
      email: u.email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { role: u.role, full_name: u.fullName },
    })
    if (error && !/already|registered|exists/i.test(error.message)) {
      throw new Error(`Failed to create demo user ${u.email}: ${error.message}`)
    }
  }

  // 2. Load the demo fixture. seed_demo.sql UPDATEs the trigger-created profiles
  //    and inserts the company / HM / talents / roles / matches. It is guarded
  //    (ON CONFLICT / NOTICE-on-missing) so re-running is safe.
  execFileSync('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-f', SEED_SQL], {
    stdio: 'inherit',
  })
}

export default globalSetup
