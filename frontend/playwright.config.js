const { defineConfig, devices } = require('@playwright/test')

/**
 * E2E smoke tests — real browser layout + CSS (safe-area, dvh, touch media queries).
 * All projects use Chromium with device presets (viewport, pixel ratio, `isMobile`, UA).
 * Optional: add `{ name: 'webkit', use: { ...devices['iPhone 12'] } }` where WebKit installs (e.g. Linux CI).
 * Run: npm run test:e2e   |   First time: npx playwright install chromium
 * @see https://playwright.dev/docs/test-configuration
 */
module.exports = defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  timeout: 60_000,
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
    ignoreHTTPSErrors: true,
  },
  // Device presets include `defaultBrowserType` (iPhone/iPad → webkit). Force Chromium so
  // `npx playwright install chromium` is enough locally and WebKit isn’t required on macOS 13.
  projects: [
    { name: 'chromium-pixel5', use: { ...devices['Pixel 5'], browserName: 'chromium' } },
    { name: 'chromium-iphone12', use: { ...devices['iPhone 12'], browserName: 'chromium' } },
    { name: 'chromium-iphone-se', use: { ...devices['iPhone SE'], browserName: 'chromium' } },
    { name: 'chromium-ipad-mini', use: { ...devices['iPad Mini'], browserName: 'chromium' } },
  ],
  webServer: {
    // Preview + static dist is more reliable in CI/sandbox than long-lived `vite dev` (no backend required for these smokes).
    command: 'vite build --mode e2e && vite preview --host 127.0.0.1 --port 3000 --strictPort',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
