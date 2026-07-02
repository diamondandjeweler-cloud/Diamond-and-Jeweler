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
import { LOCATION_SLUGS, HIRE_SLUGS, LOCATIONS, HIRES } from './silo-data'

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
