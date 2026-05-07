import { test, expect } from '@playwright/test'

// Force English locale so route copy matches assertions deterministically.
test.use({ locale: 'en-US' })

test.describe('landing + waitlist + signup smoke', () => {
  test('landing renders the hero', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/we connect brilliance with opportunity/i)
    await expect(
      page.getByRole('heading', { name: /we connect.*brilliance.*with opportunity/i }),
    ).toBeVisible()
  })

  test('signup form blocks submit until required consents are checked', async ({ page }) => {
    await page.goto('/signup')
    await page.getByRole('textbox', { name: /full name/i }).fill('Test User')
    // Required fields render label as "Email*" (asterisk attached), so don't anchor.
    await page.getByRole('textbox', { name: /email/i }).fill('playwright-smoke@example.com')
    // PasswordInput renders both the field AND a "Show/Hide password" toggle;
    // both match getByLabel(/password/i). Target the actual input directly.
    await page.locator('input[type="password"]').fill('Hunter2hunter9!')

    const createBtn = page.getByRole('button', { name: /create account/i })
    await expect(createBtn).toBeDisabled()

    // Tick DOB + ToS consents (required)
    await page.getByRole('checkbox').nth(0).check()  // DOB
    await page.getByRole('checkbox').nth(2).check()  // ToS

    // With required consents + min-10 password, button still gates on captcha.
    // Using Cloudflare Turnstile test-site-key, the token is auto-filled
    // invisibly within ~1s. Wait for the hidden response field, then assert.
    await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue(/.+/, { timeout: 8000 })
    await expect(createBtn).toBeEnabled()
  })

  test('login link routes to login page', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: /sign in to your dashboard/i }).click()
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible()
  })

  test('privacy + terms pages are reachable from footer', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: /^privacy$/i }).click()
    await expect(page.getByRole('heading', { name: /privacy notice/i })).toBeVisible()

    await page.goBack()
    await page.getByRole('link', { name: /^terms$/i }).click()
    await expect(page.getByRole('heading', { name: /terms of service/i })).toBeVisible()
  })

  test('unknown route shows 404 page', async ({ page }) => {
    await page.goto('/does-not-exist')
    await expect(page.getByRole('heading', { name: /page not found/i })).toBeVisible()
  })
})
