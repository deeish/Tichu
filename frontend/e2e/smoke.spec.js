import { test, expect } from '@playwright/test'

test.describe('public shell smoke', () => {
  test('landing renders and shows connection state', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.landing-header h1')).toContainText(/tichu/i)
    await expect(page.locator('.landing-subtitle')).toHaveText(/connected|connecting|can't connect|still connecting/i)
    await expect(page.getByRole('button', { name: /start party/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /join party/i })).toBeVisible()
  })

  test('how-to-play route renders', async ({ page }) => {
    await page.goto('/how-to-play')
    await expect(page.getByRole('heading', { name: /how to play tichu/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /close/i })).toBeVisible()
  })

  test('landing → how-to-play link', async ({ page }) => {
    await page.goto('/')
    const htp = page.getByRole('link', { name: /how to play/i })
    await htp.scrollIntoViewIfNeeded()
    await htp.click()
    await expect(page).toHaveURL(/\/how-to-play/)
    await expect(page.getByRole('heading', { name: /how to play tichu/i })).toBeVisible()
  })
})

test.describe('viewport / mobile chrome', () => {
  test('viewport meta allows safe-area (viewport-fit)', async ({ page }) => {
    await page.goto('/')
    const content = await page.locator('meta[name="viewport"]').getAttribute('content')
    expect(content ?? '').toMatch(/viewport-fit\s*=\s*cover/i)
  })

  test('landing has min-height using dvh-friendly layout', async ({ page }) => {
    await page.goto('/')
    const landing = page.locator('.landing')
    await expect(landing).toBeVisible()
    const box = await landing.boundingBox()
    expect(box).not.toBeNull()
    expect(box.height).toBeGreaterThan(200)
  })

  test('how-to-play panel is visible on small height', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 560 })
    await page.goto('/how-to-play')
    await expect(page.locator('.how-to-play-panel')).toBeVisible()
    const panel = await page.locator('.how-to-play-panel').boundingBox()
    expect(panel).not.toBeNull()
    expect(panel.height).toBeGreaterThan(150)
  })
})
