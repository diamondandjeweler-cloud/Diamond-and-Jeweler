/**
 * Post-build script: generates per-route HTML files in dist/ with
 * route-specific <title>, <meta description>, <link canonical>, and OG tags.
 *
 * Vercel's `handle: filesystem` routing serves these files for direct URL
 * access and browser refreshes. React Router handles client-side navigation
 * without hitting Vercel routing at all, so there's no conflict.
 *
 * Usage: node scripts/inject-meta.mjs  (runs after `vite build`)
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST = resolve(__dirname, '../dist')

const BASE = 'https://diamondandjeweler.com'

/** Public routes that need unique metadata. Key = URL path. */
const ROUTES = {
  '/start/talent': {
    title: 'Find your next role · DNJ',
    description:
      'DNJ matches talent in Malaysia with exactly three curated roles at a time. Zero noise, three real opportunities.',
  },
  '/start/hiring': {
    title: 'Hire with precision · DNJ',
    description:
      'DNJ delivers exactly three qualified candidates per open role to hiring managers and HR teams across Malaysia.',
  },
  '/login': {
    title: 'Sign in · DNJ',
    description:
      'Sign in to your DNJ account to view your curated matches, manage your profile, or post new roles.',
  },
  '/signup': {
    title: 'Create an account · DNJ',
    description:
      "Join DNJ — Malaysia's curated recruitment platform. Three matches, zero noise.",
  },
  '/privacy': {
    title: 'Privacy notice · DNJ',
    description:
      'How DNJ collects, uses, and protects your personal data under PDPA (Malaysia) and applicable privacy laws.',
  },
  '/terms': {
    title: 'Terms of service · DNJ',
    description:
      "Terms and conditions governing use of DNJ — Malaysia's curated recruitment platform.",
  },
  '/password-reset': {
    title: 'Reset your password · DNJ',
    description: 'Request a secure password reset link for your DNJ account.',
  },
}

function escapeAttr(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

function injectMeta(html, route, title, description) {
  const canonical = `${BASE}${route}`
  const t = escapeAttr(title)
  const d = escapeAttr(description)
  const c = escapeAttr(canonical)
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${t}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/,       `$1${d}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/,      `$1${t}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/,`$1${d}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/,        `$1${c}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(")/,     `$1${t}$2`)
    .replace(/(<meta name="twitter:description" content=")[^"]*(")/,`$1${d}$2`)
    .replace(/(<link rel="canonical" href=")[^"]*(")/,             `$1${c}$2`)
}

const baseHtml = readFileSync(join(DIST, 'index.html'), 'utf-8')

for (const [route, { title, description }] of Object.entries(ROUTES)) {
  const html = injectMeta(baseHtml, route, title, description)
  // /start/talent  → dist/start/talent.html
  // /login         → dist/login.html
  const relPath = route.slice(1) + '.html' // strip leading /
  const outPath = join(DIST, relPath)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, html, 'utf-8')
  process.stdout.write(`  ✓ ${route} → dist/${relPath}\n`)
}

process.stdout.write(`inject-meta: ${Object.keys(ROUTES).length} routes written.\n`)
