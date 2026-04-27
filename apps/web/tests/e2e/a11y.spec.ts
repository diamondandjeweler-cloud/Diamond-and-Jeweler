import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

/**
 * Automated accessibility scans for public pages.
 *
 * These only cover routes that render without a Supabase session. Dashboard
 * scans require a logged-in user — covered in a follow-up suite once the
 * project has seeded fixtures (see tests/e2e/README.md).
 *
 * We fail on "critical" and "serious" violations; "moderate" / "minor"
 * still surface in the report for follow-up but don't block CI.
 */
const CRITICAL_IMPACTS = new Set(['critical', 'serious'])

const PUBLIC_PAGES = [
  { name: 'landing',       path: '/' },
  { name: 'login',         path: '/login' },
  { name: 'signup',        path: '/signup' },
  { name: 'password reset',path: '/password-reset' },
  { name: 'privacy',       path: '/privacy' },
  { name: 'terms',         path: '/terms' },
  { name: 'not found',     path: '/does-not-exist' },
]

for (const page of PUBLIC_PAGES) {
  test(`axe: ${page.name}`, async ({ page: pw }) => {
    await pw.goto(page.path)
    const results = await new AxeBuilder({ page: pw })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()

    const blocking = results.violations.filter((v) => CRITICAL_IMPACTS.has(v.impact ?? ''))
    if (blocking.length > 0) {
      console.log('axe violations:', JSON.stringify(blocking, null, 2))
    }
    expect(blocking, 'no critical/serious axe violations').toHaveLength(0)
  })
}
