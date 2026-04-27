import { test, expect } from '@playwright/test'

test.describe('landing + waitlist + signup smoke', () => {
  test('landing renders the hero', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /three matches/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /^sign in$/i })).toBeVisible()
  })

  test('signup form blocks submit until required consents are checked', async ({ page }) => {
    await page.goto('/signup')
    await page.getByRole('textbox', { name: /full name/i }).fill('Test User')
    await page.getByRole('textbox', { name: /^email$/i }).fill('playwright-smoke@example.com')
    await page.getByLabel(/password/i).fill('hunter2hunter')

    const createBtn = page.getByRole('button', { name: /create account/i })
    await expect(createBtn).toBeDisabled()

    // Tick DOB + ToS consents (required)
    await page.getByRole('checkbox').nth(0).check()  // DOB
    await page.getByRole('checkbox').nth(2).check()  // ToS

    await expect(createBtn).toBeEnabled()
  })

  test('login link routes to login page', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: /^sign in$/i }).click()
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible()
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
