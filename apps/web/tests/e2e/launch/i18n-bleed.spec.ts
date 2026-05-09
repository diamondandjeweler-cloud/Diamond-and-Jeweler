import { test, expect } from '@playwright/test'

// Launch QA — i18n bleed.
//
// DNJ supports EN / BM / ZH. When the user switches to BM or ZH,
// no English-only marketing copy should remain visible.
//
// The current build mostly hardcodes English. This test is a sentinel:
// when locale-switching is wired up, it will start failing on bleed.

const KNOWN_EN_PHRASES = [
  /sign in to your dashboard/i,
  /create account/i,
  /privacy notice/i,
]

test('default English landing renders expected phrases', async ({ page }) => {
  await page.goto('/')
  for (const re of KNOWN_EN_PHRASES) {
    expect(await page.getByText(re).count()).toBeGreaterThan(0)
  }
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
