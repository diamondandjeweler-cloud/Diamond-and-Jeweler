// 19 — SEO sanity.
// robots.txt + sitemap.xml present, well-formed, and consistent.
// Critical SEO meta on landing page (title, description, canonical).

import { config } from '../config.mjs'

export default async function check() {
  const failures = []
  const evidence = []

  // 1. robots.txt
  const robotsRes = await fetch(`${config.QA_BASE_URL}/robots.txt`)
  if (!robotsRes.ok) {
    failures.push(`/robots.txt → ${robotsRes.status}`)
  } else {
    const robots = await robotsRes.text()
    if (!/sitemap:/i.test(robots)) failures.push('robots.txt missing Sitemap: directive')
    if (/disallow:\s*\/\s*$/im.test(robots)) failures.push('robots.txt blocks ALL crawlers (Disallow: /)')
    evidence.push(`robots.txt: ${robots.split('\n').length} lines`)
  }

  // 2. sitemap.xml
  const smRes = await fetch(`${config.QA_BASE_URL}/sitemap.xml`)
  if (!smRes.ok) {
    failures.push(`/sitemap.xml → ${smRes.status}`)
  } else {
    const sm = await smRes.text()
    const urls = (sm.match(/<loc>/g) || []).length
    if (urls < 5) failures.push(`sitemap.xml has only ${urls} URLs`)
    evidence.push(`sitemap.xml: ${urls} URLs`)
  }

  // 3. Critical meta on landing
  const home = await fetch(config.QA_BASE_URL)
  const html = await home.text()
  const title = (html.match(/<title>([^<]+)<\/title>/) || [])[1]
  const desc = (html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/) || [])[1]
  const canonical = (html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/) || [])[1]
  if (!title || title.length < 10) failures.push(`Title weak: "${title}"`)
  if (!desc || desc.length < 50) failures.push(`Description weak: "${desc?.slice(0, 60)}…"`)
  if (!canonical) failures.push('No canonical link')
  else if (!canonical.startsWith('https://')) failures.push(`Canonical not absolute: ${canonical}`)
  evidence.push(`title: ${title?.length ?? 0} chars`)
  evidence.push(`description: ${desc?.length ?? 0} chars`)
  evidence.push(`canonical: ${canonical ?? 'missing'}`)

  // 4. OG tags
  const og = ['og:title', 'og:description', 'og:url', 'og:image']
  const ogMissing = og.filter((k) => !html.includes(`property="${k}"`))
  if (ogMissing.length > 0) failures.push(`OG missing: ${ogMissing.join(', ')}`)

  if (failures.length === 0) {
    return { name: 'SEO sanity', status: 'PASS', detail: 'robots + sitemap + meta + OG all healthy', evidence }
  }
  return {
    name: 'SEO sanity',
    status: failures.some((f) => /blocks ALL/.test(f)) ? 'FAIL' : 'WARN',
    detail: `${failures.length} issue(s)`,
    evidence: [...failures, ...evidence],
  }
}
