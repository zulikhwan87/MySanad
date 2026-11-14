import { defineConfig, devices } from '@playwright/test';

/**
 * E2E against a production build.
 *   npm run build && npm run test:e2e          (starts `next start` on port 3100 itself)
 *   E2E_BASE_URL=https://staging.example npm run test:e2e   (tests a deployed site instead)
 * Set E2E_WITH_DB=1 when the target has a configured Supabase project; tests that need
 * real data are skipped otherwise.
 */
const external = process.env.E2E_BASE_URL;
const baseURL = external ?? 'http://localhost:3100';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: external
    ? undefined
    : { command: 'npx next start -p 3100', url: baseURL, reuseExistingServer: !process.env.CI, timeout: 120_000 },
});
