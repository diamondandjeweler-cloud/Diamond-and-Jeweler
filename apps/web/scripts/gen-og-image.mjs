/**
 * Generates public/og-image.png from public/og-image.svg using Playwright.
 *
 * Run once (or whenever the SVG changes):
 *   node scripts/gen-og-image.mjs
 *
 * Requires Playwright browsers: npx playwright install chromium
 */

import { chromium } from '@playwright/test'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PUBLIC = resolve(__dirname, '../public')
const SVG_PATH = resolve(PUBLIC, 'og-image.svg')
const PNG_PATH = resolve(PUBLIC, 'og-image.png')

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setViewportSize({ width: 1200, height: 630 })
await page.goto(`file:///${SVG_PATH.replace(/\\/g, '/')}`)
// Wait for the SVG to fully render (fonts, gradients).
await page.waitForTimeout(300)
await page.screenshot({
  path: PNG_PATH,
  clip: { x: 0, y: 0, width: 1200, height: 630 },
  type: 'png',
})
await browser.close()

process.stdout.write(`og-image.png written to public/\n`)
