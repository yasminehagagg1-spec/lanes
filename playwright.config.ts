import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const PORT = 4848; // separate from the real 4747 so tests never touch a running Lanes

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results',
  // One shared server + database: run serially so live updates from one test can't move another's cards.
  workers: 1,
  timeout: 30_000,
  use: {
    ...devices['Desktop Chrome'],
    // After the device preset, which would otherwise reset this to 1280×720.
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    // Fresh data every run; the real data folder is never touched.
    command: 'rm -rf .data-e2e && pnpm build && pnpm start',
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      LANES_PORT: String(PORT),
      // No real macOS banners during tests; tick fast so reminders fire within the test.
      LANES_NOTIFY: 'off',
      LANES_SCHEDULER_MS: '500',
      LANES_DATA_DIR: path.resolve(import.meta.dirname, '.data-e2e'),
    },
  },
});
