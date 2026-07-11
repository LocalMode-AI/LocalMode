/**
 * @file playwright.config.ts
 * @description Committed E2E harness for the /blocks gallery. Specs drive the
 * public /blocks/<name> pages via role/label/text accessibility selectors on the
 * block source ONLY (never site chrome), perform REAL model downloads + inference
 * (no mocked model boundary), and capture screenshots + console output into
 * e2e-artifacts/.
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
  // `fullyParallel: false` only serializes tests WITHIN a file — Playwright still
  // runs files across workers (5 on a 10-core box). Real LLM lanes then compete
  // for CPU and bandwidth and blow their inference timeouts, so the suite must
  // actually be serial. Override with E2E_WORKERS for a faster, flakier local run.
  fullyParallel: false,
  workers: process.env.E2E_WORKERS ? Number(process.env.E2E_WORKERS) : 1,
  retries: 0, // no silent retries — a flake is a bug to fix, not to mask
  reporter: [
    ['list'],
    ['html', { outputFolder: 'e2e-artifacts/html-report', open: 'never' }],
    ['junit', { outputFile: 'e2e-artifacts/junit.xml' }],
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    screenshot: 'only-on-failure',
    // Trace WITHOUT the screencast and the per-mutation DOM snapshotter — keep
    // only the action log (every call, its timing, its error). These specs run
    // real on-device models; a block streaming tokens or running WebGPU
    // super-resolution mutates the DOM tens of times a second while the GPU/WASM
    // saturates the machine. Playwright's default trace then captures a DOM
    // snapshot per mutation plus a screencast frame, and on the WebGPU path (real
    // Chrome) they pile up in the browser process faster than the CDP writer
    // drains — starving the very model load/inference under test until it times
    // out (observed: a 420MB trace / 2276 frames while granite, which loads in
    // ~38s unmonitored, hung for 8min; a 144MB trace on the Swin2SR lane). The
    // headless shell has no WebGPU so it never hit this, which is why it stayed
    // latent. `screenshot: 'only-on-failure'` above still captures the final
    // failure frame; the action log still shows the full timeline.
    trace: { mode: 'retain-on-failure', screenshots: false, snapshots: false },
    launchOptions: {
      args: [
        // Fake media streams so the voice/vision blocks can exercise capture
        // paths deterministically. The REAL microphone/webcam gap is documented
        // in each spec and closed by the manual real-Chrome hardware sweep.
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        // Lift the per-origin storage quota. A Playwright browser context is
        // incognito, and incognito caps origin storage at ~1GB — below the
        // 1.1–1.2GB WebLLM/GGUF weights the chat and agents blocks cache in
        // OPFS/Cache API on the WebGPU path, so the model download aborts with
        // QuotaExceededError mid-cache. Real users on a persistent profile get a
        // disk-proportional quota (tens of GB); this restores that headroom for
        // the ephemeral test context. No effect on runners without a WebGPU
        // adapter (they take the blocks' documented hardware-gap path and fetch
        // no weights).
        '--unlimited-storage',
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
    // NEVER reuse whatever happens to hold :3000. A leftover `next start` from an
    // aborted run, or a `next dev` server, silently serves a DIFFERENT build than
    // the one under test — a stale server produces phantom passes and phantom
    // failures. Opt in explicitly with E2E_REUSE_SERVER=1 for fast local iteration.
    reuseExistingServer: process.env.E2E_REUSE_SERVER === '1',
    timeout: 5 * 60 * 1000,
  },
});
