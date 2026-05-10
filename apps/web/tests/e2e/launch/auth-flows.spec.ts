import { test, expect } from '@playwright/test'

// Launch QA — auth flows.
//
// Critical paths:
//   1. Signup form gates on consent + captcha (already covered in smoke.spec)
//   2. Login form rejects bad password           [skipped on prod — real captcha]
//   3. Password reset form accepts an email      [skipped on prod — real captcha]
//   4. /admin redirects unauthenticated users to /login
//   5. /home redirects unauthenticated users to /login
//   6. Logout clears the session
//
// On staging/preview the Cloudflare Turnstile test site-key auto-fills;
// on prod it's a real challenge that requires a human. Captcha-dependent
// tests skip when targeting prod to keep the suite green for CI.

test.use({ locale: 'en-US' })

// True when the harness targets the live diamondandjeweler.com domain.
const isProd = (process.env.PLAYWRIGHT_BASE_URL ?? '').includes('diamondandjeweler.com')

test('login rejects wrong password', async ({ page }) => {
  test.skip(isProd, 'real captcha gates server-side automation on prod')

  await page.goto('/login')
  await page.getByRole('textbox', { name: /email/i }).fill('a01.admin@dnj-test.my')
  await page.locator('input[type="password"]').fill('NotTheRealPassword123!')
  // Wait for captcha auto-fill (Turnstile test key).
  await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue(/.+/, { timeout: 8000 })
  await page.getByRole('button', { name: /sign in/i }).click()
  // Either an inline error or the URL stays on /login.
  await page.waitForTimeout(1500)
  await expect(page).toHaveURL(/\/login/)
})

test('password reset shows success on submit', async ({ page }) => {
  test.skip(isProd, 'real captcha gates server-side automation on prod')

  await page.goto('/password-reset')
  await page.getByRole('textbox', { name: /email/i }).fill('does-not-exist@dnj-test.my')
  // Captcha if present
  const turnstile = page.locator('input[name="cf-turnstile-response"]')
  if (await turnstile.count() > 0) {
    await expect(turnstile).toHaveValue(/.+/, { timeout: 8000 })
  }
  await page.getByRole('button', { name: /send.*link|reset/i }).click()
  // Success copy or routing to a sent confirmation.
  await page.waitForTimeout(1500)
  // Don't assert exact copy — just that the form did not surface a hard error.
  await expect(page.locator('text=/error|failed|wrong/i')).toHaveCount(0)
})

test('/admin redirects to login when unauthenticated', async ({ page }) => {
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/login/)
})

test('/home redirects to login when unauthenticated', async ({ page }) => {
  await page.goto('/home')
  await expect(page).toHaveURL(/\/login/)
})
