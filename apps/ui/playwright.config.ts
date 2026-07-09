/**
 * @file playwright.config.ts
 * @description Committed E2E harness for the /blocks gallery. Specs drive the
 * public /blocks/<name> pages via data-testid hooks ONLY (never site chrome),
 * perform REAL model downloads + inference (no mocked model boundary), and
 * capture screenshots + console output into e2e-artifacts/.
 *
 * Run: pnpm --filter ui test:e2e            (headless Chromium)
 *      pnpm --filter ui test:e2e -- --headed (headed, for debugging)
 *
 * Real model downloads are slow on first run; timeouts are sized for a cold
 * cache. The webServer reuses an existing `next start` (or dev) on :3000 so
 * local iteration doesn't rebuild each time.
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e-artifacts/test-results',
  // Real model downloads on cold cache need generous ceilings. Specs still use
  // targeted expect() timeouts so failures surface as fast as possible.
  timeout: 10 * 60 * 1000,
  expect: { timeout: 30 * 1000 },
  fullyParallel: false, // model downloads share bandwidth + disk cache; run serially
  retries: 0, // no silent retries — a flake is a bug to fix, not to mask
  reporter: [
    ['list'],
    ['html', { outputFolder: 'e2e-artifacts/html-report', open: 'never' }],
    ['junit', { outputFile: 'e2e-artifacts/junit.xml' }],
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    screenshot: 'on',
    trace: 'retain-on-failure',
    // Fake media streams so the voice/vision blocks can exercise capture paths
    // deterministically. The REAL microphone/webcam gap is documented in each
    // spec and closed by the manual real-Chrome hardware sweep (tasks 7.2).
    launchOptions: {
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
      ],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm run build && pnpm run start',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 5 * 60 * 1000,
  },
});
