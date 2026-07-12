import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

// Force English locale so route copy matches assertions deterministically.
test.use({ locale: 'en-US' })

// ── White-screen regression guard (2026-07-10 outage at 44be0cc) ───────────
// A mis-chunked React-coupled dep (Radix + transitive floating-ui /
// react-remove-scroll deps) threw an uncaught "Cannot read properties of
// undefined (reading 'useLayoutEffect')" at module-eval time, rendering a blank
// page while every DOM assertion below could still (mis)pass on a cached shell.
// `page.on('pageerror')` fires on exactly that class of uncaught exception, so
// we collect them per test and hard-fail if ANY smoke route produced one. This
// complements the build-time scripts/check-vendor-chunk.mjs guard: the build
// script stops a bad bundle from being produced; this stops a bad bundle from
// passing the smoke suite.
const pageErrors = new WeakMap<Page, Error[]>()

test.beforeEach(({ page }) => {
  const errors: Error[] = []
  pageErrors.set(page, errors)
  page.on('pageerror', (err) => errors.push(err))
})

test.afterEach(({ page }) => {
  const errors = pageErrors.get(page) ?? []
  expect(
    errors.map((e) => e.message),
    `uncaught page error(s) — likely a white-screen render crash:\n` +
      errors.map((e) => `  • ${e.stack ?? e.message}`).join('\n'),
  ).toEqual([])
})

test.describe('landing + waitlist + signup smoke', () => {
  test('landing renders the hero', async ({ page }) => {
    await page.goto('/')
    // <title> carries the SEO string; the hero promise lives in the H1.
    await expect(page).toHaveTitle(/AI-Curated Recruitment Platform Malaysia/i)
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

    // The "Create account" button is not consent-disabled (it only disables
    // while a submit is in flight); the form gates submission inside its
    // onSubmit handler. Submitting with the required consents unchecked surfaces
    // the consent error and keeps the user on /signup — i.e. submit is blocked.
    // (The positive/submit path depends on a live backend + Cloudflare Turnstile
    // token, neither available in this no-backend smoke run, so it is covered by
    // integration tests rather than here.)
    await page.getByRole('button', { name: /create account/i }).click()
    await expect(page.getByText(/please accept the required consents/i)).toBeVisible()
    await expect(page).toHaveURL(/\/signup/)
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
