// Auth + role routing smoke. Catches:
//   - F4 (login first-click race): click submit before Turnstile token, verify
//     the form queues the submit instead of silently dropping it.
//   - Login form regression: fields render, captcha auto-passes via test
//     sitekey, submit fires the Supabase auth call.
//
// Backend isn't required: we intercept the Supabase auth endpoint with a
// mocked 200 response. The point is to catch frontend regressions, not to
// re-test Supabase.

import { test, expect, type Route } from '@playwright/test'

test.use({ locale: 'en-US' })

const SUPABASE_URL_RE = /\/auth\/v1\/token\?grant_type=password/

async function mockAuthSuccess(route: Route) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      access_token: 'mock-access-token',
      token_type: 'bearer',
      expires_in: 3600,
      refresh_token: 'mock-refresh',
      user: {
        id: '00000000-0000-0000-0000-000000000001',
        email: 'tester@dnj-test.my',
        aud: 'authenticated',
        role: 'authenticated',
      },
    }),
  })
}

test.describe('login form', () => {
  test('renders fields, captcha auto-passes via test sitekey, submit reaches auth', async ({ page }) => {
    let authCalled = false
    await page.route(SUPABASE_URL_RE, async (route) => {
      authCalled = true
      await mockAuthSuccess(route)
    })

    await page.goto('/login')
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible()

    await page.getByRole('textbox', { name: /email/i }).fill('tester@dnj-test.my')
    await page.locator('input[type="password"]').fill('TestDNJ#2026')

    // Cloudflare test sitekey auto-fills the response within ~1s.
    await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue(/.+/, { timeout: 8000 })

    await page.getByRole('button', { name: /sign in/i }).click()

    // Either the auth call was made OR the page navigated. Either confirms
    // the click reached the submit handler — which is exactly the F4 contract.
    await expect.poll(() => authCalled, { timeout: 10000 }).toBe(true)
  })

  test('clicking submit before captcha resolves still queues the submit (F4 regression)', async ({ page }) => {
    let authCalled = false
    await page.route(SUPABASE_URL_RE, async (route) => {
      authCalled = true
      await mockAuthSuccess(route)
    })

    await page.goto('/login')
    await page.getByRole('textbox', { name: /email/i }).fill('tester@dnj-test.my')
    await page.locator('input[type="password"]').fill('TestDNJ#2026')

    // Click submit IMMEDIATELY without waiting for the Turnstile token. With
    // the F4 fix, this queues the submit and shows the "verifying..." state;
    // the auth call should fire once the token arrives.
    const signInBtn = page.getByRole('button', { name: /sign in|verifying/i })
    await signInBtn.click()

    // The verifying-human state should appear (translated).
    await expect(page.getByText(/verifying you'?re human/i)).toBeVisible({ timeout: 4000 })

    // Once Turnstile finishes, the queued submit should fire.
    await expect.poll(() => authCalled, { timeout: 12000 }).toBe(true)
  })
})

test.describe('locale-aware greetings', () => {
  // We can't fully assert the dashboard greeting without a real session, but
  // we *can* sanity-check that the i18n key surfaces in the bundle and the
  // translation files include all three locales. The build step asserts the
  // JSON parses; this test only runs when the dashboard test seeds are wired.
  test.skip(({}, testInfo) => !process.env.PLAYWRIGHT_AUTH_E2E, 'Set PLAYWRIGHT_AUTH_E2E=1 to run.')

  test('talent dashboard greets with display name (no surname collapse)', async ({ page }) => {
    // Requires a logged-in session; intentionally a skipped placeholder until
    // the @dnj-test.my session bridge is wired into Playwright.
    await page.goto('/talent')
    await expect(page.getByText(/welcome back/i)).toBeVisible()
  })
})
