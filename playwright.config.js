import { defineConfig } from '@playwright/test';

// Root-level config (Playwright only auto-discovers it from the CWD).
// testMatch is restricted to *.spec.js so vitest's unit tests (*.test.js)
// are never picked up by the Playwright runner.
export default defineConfig({
  testDir: 'tests',
  testMatch: /.*\.spec\.js/,
  // CI runners (2 vCPU) are far slower than the local M1; local runs stay well under.
  timeout: 180_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4179',
    trace: 'retain-on-failure',
  },
  webServer: {
    // --host 127.0.0.1: vite preview otherwise binds ::1 only, and the URL
    // check below uses IPv4.
    command: 'npm run preview -- --port 4179 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4179',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
  outputDir: 'tmp/test-results',
});
