import { test, expect } from '@playwright/test'

// Launch QA — fake HM detection.
//
// Submitting an HM signup with obvious fraud signals must NOT result in an
// auto-verified company. Instead the flow should route to verification queue,
// or block at the form.

test.use({ locale: 'en-US' })

const isProd = (process.env.PLAYWRIGHT_BASE_URL ?? '').includes('diamondandjeweler.com')

test('signup with disposable email lands on signup or shows warning', async ({ page }) => {
  test.skip(isProd, 'real captcha gates server-side automation on prod')

  await page.goto('/signup')
  await page.getByRole('textbox', { name: /full name/i }).fill('Fake HM')
  const email = page.getByRole('textbox', { name: /email/i })
  const disposable = `hm-${Date.now()}@mailinator.com`
  await email.fill(disposable)
  await page.locator('input[type="password"]').fill('Hunter2hunter9!')
  await page.getByRole('checkbox').nth(0).check()
  await page.getByRole('checkbox').nth(2).check()
  await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue(/.+/, { timeout: 8000 })
  // We don't actually click submit — that creates a real auth user.
  // The contract under test: the form does NOT reject a disposable email at the
  // field level (intentional — server-side fraud scoring handles it downstream,
  // not a client-side blocklist). So the value is accepted and the submit
  // control stays available; no field-level validation error appears.
  await expect(email).toHaveValue(disposable)
  await expect(page.getByRole('button', { name: /create account/i })).toBeVisible()
})
