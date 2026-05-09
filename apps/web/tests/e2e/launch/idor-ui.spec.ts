import { test, expect } from '@playwright/test'

// Launch QA — UI-side IDOR / route protection.
//
// Pair to qa/scripts/03-idor-probes.mjs. That script tests API surfaces;
// this spec tests browser routes that anonymous or wrong-role users
// should never see.

test.use({ locale: 'en-US' })

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
  '/payment-return',
]

for (const path of PROTECTED_ROUTES) {
  test(`anon visiting ${path} → redirected to /login`, async ({ page }) => {
    await page.goto(path)
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 })
  })
}
