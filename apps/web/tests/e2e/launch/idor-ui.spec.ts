import { test, expect } from '@playwright/test'

// Launch QA — UI-side IDOR / route protection.
//
// Pair to qa/scripts/03-idor-probes.mjs. That script tests API surfaces;
// this spec tests browser routes that anonymous or wrong-role users
// should never see.

test.use({ locale: 'en-US' })

// Routes that MUST require auth. Public routes are explicitly excluded:
//   /payment/return — Billplz callback; needs to work session-less when the
//                     gateway redirects users back after a payment.
const PROTECTED_ROUTES = [
  '/admin',
  '/admin/users',
  '/admin/dsr',
  '/admin/audit',
  '/home',
  '/talent/profile',
  '/hm/post-role',
  '/hr/invite',
  '/data-requests',
]

for (const path of PROTECTED_ROUTES) {
  test(`anon visiting ${path} → redirected to /login`, async ({ page }) => {
    await page.goto(path)
    // Accept either a URL redirect OR the login form rendering inline.
    // The second case happens when ProtectedRoute mounts Layout + spinner
    // before Navigate fires; on slow networks the URL changes a beat later.
    await Promise.race([
      page.waitForURL(/\/login/, { timeout: 20000 }),
      page.getByRole('heading', { name: /welcome back|sign in/i }).waitFor({ timeout: 20000 }),
    ])
    // After settling, URL must be /login (the heading match alone is too loose).
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 })
  })
}
