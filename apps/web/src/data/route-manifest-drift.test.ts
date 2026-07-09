/**
 * Route-topology drift guard (Phase 5 clean-arch).
 *
 * The silo slug set (LOCATION_SLUGS / HIRE_SLUGS in silo-data.ts) is the single
 * source of truth, and App.tsx already derives its /jobs-in-:slug and
 * /hire-:slug routes from it. But two DEPLOY-layer surfaces hand-mirror the same
 * slugs and cannot import the TS array:
 *   - scripts/inject-meta.mjs — per-route prerendered HTML (SEO)
 *   - vercel.json             — filesystem rewrites + the SPA-fallback regex
 * so adding a slug to silo-data without updating both silently breaks that
 * slug's prerender / routing in production.
 *
 * Rather than make those edge/deploy files derive from the TS source (they are
 * intentionally out of the refactor's touch-set), this test fails CI the moment
 * the sources drift — a behavior-free safety net that keeps the five route
 * surfaces honest. See docs/ARCHITECTURE.md (route-manifest single source).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { LOCATION_SLUGS, HIRE_SLUGS, LOCATIONS, HIRES } from '../shared/content/silo-data'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const injectMeta = read('../../scripts/inject-meta.mjs')
const vercelJson = read('../../vercel.json')
const appTsx = read('../App.tsx')

describe('route-manifest drift guard', () => {
  it('App.tsx still derives silo routes from the slug arrays (keeps the source single)', () => {
    expect(appTsx).toContain('LOCATION_SLUGS')
    expect(appTsx).toContain('HIRE_SLUGS')
    expect(appTsx).toContain('/jobs-in-${slug}')
    expect(appTsx).toContain('/hire-${slug}')
  })

  it('silo slug arrays match their config-record keys (internal consistency)', () => {
    expect([...LOCATION_SLUGS].sort()).toEqual(Object.keys(LOCATIONS).sort())
    expect([...HIRE_SLUGS].sort()).toEqual(Object.keys(HIRES).sort())
  })

  it('every LOCATION_SLUG is prerendered in scripts/inject-meta.mjs', () => {
    for (const slug of LOCATION_SLUGS) {
      expect(injectMeta, `inject-meta.mjs is missing /jobs-in-${slug}`).toContain(`/jobs-in-${slug}`)
    }
  })

  it('every HIRE_SLUG is prerendered in scripts/inject-meta.mjs', () => {
    for (const slug of HIRE_SLUGS) {
      expect(injectMeta, `inject-meta.mjs is missing /hire-${slug}`).toContain(`/hire-${slug}`)
    }
  })

  it('every LOCATION_SLUG is routed in vercel.json (rewrite + SPA-fallback regex)', () => {
    for (const slug of LOCATION_SLUGS) {
      expect(vercelJson, `vercel.json jobs-in routing is missing ${slug}`).toContain(slug)
    }
  })

  it('every HIRE_SLUG is routed in vercel.json (rewrite + SPA-fallback regex)', () => {
    for (const slug of HIRE_SLUGS) {
      expect(vercelJson, `vercel.json hire routing is missing ${slug}`).toContain(slug)
    }
  })
})

/**
 * SPA-fallback coverage guard (extends the silo-only guard above to the full
 * authenticated route set).
 *
 * The vercel.json SPA-fallback regex must match every path App.tsx can render.
 * Any path it does NOT match falls through to the final `{ status: 404 }`
 * catch-all: index.html is still served (so the SPA boots) but with an HTTP 404
 * status — which breaks bookmarks/refresh, poisons Sentry/analytics, and can stop
 * the PWA from caching the page. This guard test-matches representative concrete
 * URLs so drift on the authenticated surface (e.g. the /hm/* workspace routes)
 * cannot silently return a 404.
 */
describe('SPA-fallback covers every authenticated client route (no 404 on hard load)', () => {
  const routes = (JSON.parse(vercelJson) as { routes: Array<{ src: string; dest?: string; status?: number }> }).routes
  const fallback = routes.find(
    (r) => r.dest === '/index.html' && r.status === undefined && /onboarding/.test(r.src),
  )
  const re = new RegExp(fallback ? fallback.src : '(?!)')

  // One representative concrete URL per App.tsx authenticated/dynamic route.
  const CLIENT_PATHS = [
    '/home', '/consent',
    '/onboarding/talent', '/onboarding/hm', '/onboarding/company', '/onboarding/company/verify',
    '/talent', '/talent/profile',
    '/hm', '/hm/post-role', '/hm/post-role/abc123', '/hm/roles', '/hm/roles/abc123/edit',
    '/hm/company', '/hm/settings', '/hm/account',
    '/hm/org-chart', '/hm/org-chart/new', '/hm/org-chart/abc123',
    '/hr', '/hr/invite', '/admin',
    '/referrals', '/points', '/consult', '/consult/return',
    '/data-requests', '/feedback/abc123',
    '/payment/return', '/payment/mock',
  ]

  it('a SPA-fallback route (dest=/index.html, no status) exists in vercel.json', () => {
    expect(fallback, 'no SPA-fallback route found in vercel.json').toBeTruthy()
  })

  it.each(CLIENT_PATHS)('serves index.html (not HTTP 404) for %s', (path) => {
    expect(
      re.test(path),
      `vercel.json SPA-fallback does not match ${path} → a hard load/refresh returns HTTP 404`,
    ).toBe(true)
  })
})
