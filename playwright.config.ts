import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end smoke tests against the production build, on a phone, a tablet
 * and a desktop viewport. Run `npm run build` first (webServer does it).
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npx astro preview --host 127.0.0.1 --port 4173',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'node server/signaling/index.mjs',
      port: 8787,
      reuseExistingServer: !process.env.CI,
      timeout: 20_000,
    },
  ],
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'] } },
    { name: 'iphone', use: { ...devices['iPhone 14'], defaultBrowserType: 'chromium' } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
});
