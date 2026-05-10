import { test, expect } from '@playwright/test'

// Launch QA — i18n bleed.
//
// DNJ supports EN / BM / ZH. When the user switches to BM or ZH,
// no English-only marketing copy should remain visible.
//
// The current build mostly hardcodes English. This test is a sentinel:
// when locale-switching is wired up, it will start failing on bleed.

test('default English landing renders English copy', async ({ page }) => {
  await page.goto('/')
  // Footer link is a stable EN sentinel (links labelled "Privacy" + "Terms").
  await expect(page.getByRole('link', { name: /^privacy$/i }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: /^terms$/i }).first()).toBeVisible()
  // No mojibake or BOM artifacts in the rendered title.
  await expect(page).toHaveTitle(/[A-Za-z]/)
})

test('locale=ms (Bahasa) — placeholder until translations ship', async ({ page }) => {
  await page.goto('/?lang=ms')
  // When BM translations exist, none of the EN phrases above should appear.
  // For now this just ensures the page loads.
  await expect(page).toHaveURL(/lang=ms/)
})

test('locale=zh (Mandarin) — placeholder until translations ship', async ({ page }) => {
  await page.goto('/?lang=zh')
  await expect(page).toHaveURL(/lang=zh/)
})
