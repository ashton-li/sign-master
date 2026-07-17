import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  expect: {
    timeout: 8000
  },
  use: {
    baseURL: 'http://127.0.0.1:5178',
    viewport: { width: 390, height: 760 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    trace: 'off',
    screenshot: 'only-on-failure'
  },
  projects: [
    {
      name: 'chromium-mobile',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 760 },
        isMobile: true,
        hasTouch: true
      }
    }
  ],
  webServer: {
    command: 'node scripts/serve-h5.mjs',
    url: 'http://127.0.0.1:5178',
    reuseExistingServer: !process.env.CI,
    timeout: 60000
  }
})
