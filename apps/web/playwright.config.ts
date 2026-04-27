import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config for BoLe e2e tests.
 *
 * By default these run against a local Vite dev server backed by local
 * Supabase (`supabase start`). Override with PLAYWRIGHT_BASE_URL if you want
 * to hit staging or production.
 *
 * See `tests/e2e/README.md` for the full prerequisites.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false, // UI tests share a Supabase project — keep sequential
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: process.env.CI ? 'retain-on-failure' : 'off',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // Auto-start `vite` for local dev runs. In CI we pre-build + `vite preview`.
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
