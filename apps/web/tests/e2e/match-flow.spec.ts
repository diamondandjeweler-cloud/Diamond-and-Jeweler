import { test, expect } from '@playwright/test'
import { demoUser } from './seed/demo-users'

// Seeded end-to-end match flow.
//
// Contract: with a talent + HM + active role + generated match seeded
// (seed_demo.sql, loaded by global-setup.ts), the hiring manager who logs in
// sees the curated candidate for their role on the HM dashboard.
//
// This is the "future work" the README + auth-routing placeholder pointed at.
// It requires a live local Supabase with the demo users created and the fixture
// loaded, so it is GATED behind HAS_SEEDED_BACKEND: it SKIPS (does not fail)
// under the default no-backend smoke run, which shares this test directory.
//
// Run it via:  HAS_SEEDED_BACKEND=1 npm run test:e2e:seeded

test.use({ locale: 'en-US' })

const SEEDED = !!process.env.HAS_SEEDED_BACKEND

test.describe('seeded match flow — HM sees the curated candidate', () => {
  test.skip(
    !SEEDED,
    'Requires a seeded local Supabase. Set HAS_SEEDED_BACKEND=1 and run ' +
      '`npm run test:e2e:seeded` (see tests/e2e/README.md).',
  )

  test('HM logs in and sees the seeded Senior Backend Engineer match', async ({ page }) => {
    const hm = demoUser('hm@techco.my')

    // ── Log in as the seeded hiring manager ──────────────────────────────
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible()
    await page.getByRole('textbox', { name: /email/i }).fill(hm.email)
    await page.locator('input[type="password"]').fill(hm.password)

    // Cloudflare test sitekey auto-fills the Turnstile token within ~1s
    // (same mechanism auth-routing.spec relies on).
    await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue(/.+/, {
      timeout: 8000,
    })
    await page.getByRole('button', { name: /sign in/i }).click()

    // Successful login redirects away from /login (to /home → role dashboard).
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15000 })

    // ── Assert the seeded match is rendered on the HM dashboard ──────────
    await page.goto('/hm')
    await expect(page.getByRole('heading', { name: /your candidates/i })).toBeVisible({
      timeout: 15000,
    })

    // The candidate card renders "for {role title}" for the seeded role. Alice
    // is matched to "Senior Backend Engineer" at 82% in seed_demo.sql.
    await expect(page.getByText(/for Senior Backend Engineer/i).first()).toBeVisible({
      timeout: 15000,
    })
  })
})
