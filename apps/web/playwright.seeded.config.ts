import { defineConfig } from '@playwright/test'
import base from './playwright.config'

/**
 * SEEDED e2e config — the backend-dependent flow.
 *
 * Kept SEPARATE from playwright.config.ts on purpose: `npm run test:e2e` (the
 * default no-backend smoke suite) must stay byte-for-byte unchanged and must
 * never run globalSetup. This config adds:
 *   - a globalSetup that provisions demo auth users + loads seed_demo.sql
 *     (itself a no-op unless HAS_SEEDED_BACKEND is set — see global-setup.ts), and
 *   - a testMatch scoped to the seeded spec only, so this run is fast and focused.
 *
 * Run it with:
 *   HAS_SEEDED_BACKEND=1 npm run test:e2e:seeded
 * against a running local Supabase (`supabase start`). See tests/e2e/README.md.
 */
export default defineConfig({
  ...base,
  globalSetup: './tests/e2e/global-setup.ts',
  testMatch: '**/match-flow.spec.ts',
})
