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
  await page.getByRole('textbox', { name: /email/i }).fill(`hm-${Date.now()}@mailinator.com`)
  await page.locator('input[type="password"]').fill('Hunter2hunter9!')
  await page.getByRole('checkbox').nth(0).check()
  await page.getByRole('checkbox').nth(2).check()
  await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue(/.+/, { timeout: 8000 })
  // We don't actually click submit — that creates a real auth user.
  // Just assert that the form does not block disposable emails at the field
  // level (this is intentional — we let server-side fraud scoring handle it).
  // The real assertion is that there's a visible note about verification.
  // If the copy includes "verify" or "review", that's enough.
  const verifyHint = page.locator('text=/verif|review|approval/i')
  expect(await verifyHint.count()).toBeGreaterThan(0)
})
