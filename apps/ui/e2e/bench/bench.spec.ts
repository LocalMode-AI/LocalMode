/**
 * @file bench.spec.ts
 * @description E2E for the /bench section. Lane 1-2: shell pages render with
 * ZERO model bytes and a clean console. Lane 3: a REAL quick-suite run on the
 * WASM paths (headless Chromium has no WebGPU — the WebGPU lanes assert their
 * unavailability badges instead; the WebGPU/Chrome-AI lanes are covered by the
 * documented manual real-Chrome hardware sweep). Real model downloads + real
 * inference; results table, JSON export with digest, and the dev-mode
 * submission path (503 bench-store-unbound surfaced to the user) are all
 * exercised for real. Selectors are role/label/text only.
 */

import { expect, test, type ConsoleMessage, type Page, type Request } from '@playwright/test';

const MODEL_HOST_PATTERNS = [
  /huggingface\.co/i,
  /hf\.co/i,
  /\.gguf(\?|$)/i,
  /storage\.googleapis\.com\/mediapipe/i,
  /\.tflite(\?|$)/i,
];

function collectConsoleErrors(page: Page, sink: string[]) {
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() !== 'error') return;
    // ALLOWLIST (documented): /_vercel/ analytics 404s on local `next start`
    // (see blocks-chrome.spec.ts for the full rationale). Everything else fails.
    const url = msg.location()?.url ?? '';
    const text = msg.text();
    if (url.includes('/_vercel/') || text.includes('/_vercel/')) return;
    sink.push(`[console.error] ${text} @ ${url}`);
  });
  page.on('pageerror', (err) => sink.push(`[pageerror] ${err.message}`));
}

function collectModelRequests(page: Page, sink: string[]) {
  page.on('request', (req: Request) => {
    const url = req.url();
    if (MODEL_HOST_PATTERNS.some((p) => p.test(url))) sink.push(url);
  });
}

test.describe('bench shell (zero model bytes)', () => {
  let consoleErrors: string[];
  let modelRequests: string[];

  test.beforeEach(({ page }) => {
    consoleErrors = [];
    modelRequests = [];
    collectConsoleErrors(page, consoleErrors);
    collectModelRequests(page, modelRequests);
  });

  test.afterEach(async () => {
    expect(consoleErrors, 'no console errors allowed').toEqual([]);
    expect(modelRequests, 'shell pages must fetch no model assets').toEqual([]);
  });

  test('/bench renders the leaderboard landing with empty-state', async ({ page }) => {
    await page.goto('/bench');
    await expect(page.getByRole('heading', { level: 1, name: 'LocalMode Bench' })).toBeVisible();
    await expect(page.getByRole('link', { name: /run it on your device/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /methodology/i })).toBeVisible();
    // Unbound store in this environment → the empty-state invitation shows.
    await expect(page.getByText(/no submissions yet/i)).toBeVisible();
  });

  test('/bench/methodology documents the versioned protocol', async ({ page }) => {
    await page.goto('/bench/methodology');
    await expect(
      page.getByRole('heading', { level: 1, name: /localmode bench methodology/i }),
    ).toBeVisible();
    await expect(page.getByText('localmode-bench/1').first()).toBeVisible();
    for (const section of ['Metric definitions', 'Run policy', 'Statistics', 'Submission integrity']) {
      await expect(page.getByRole('heading', { name: section })).toBeVisible();
    }
  });

  test('/bench/run mounts the runner without any model fetch', async ({ page }) => {
    await page.goto('/bench/run');
    await expect(page.getByRole('heading', { level: 1, name: /run localmode bench/i })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Run benchmark' })).toBeVisible();
    // Publishing defaults ON, disclosed next to the Run controls.
    await expect(page.getByRole('switch', { name: /publish results/i })).toBeChecked();
    // Availability probes resolve; WebGPU lanes are marked unavailable headless.
    await expect(page.getByText(/probing device capabilities/i)).toHaveCount(0, { timeout: 15_000 });
  });

  test('leaderboard API returns a valid empty aggregate', async ({ request }) => {
    const res = await request.get('/api/bench/leaderboard');
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { rows: unknown[]; runs: number };
    expect(Array.isArray(body.rows)).toBe(true);
    expect(body.runs).toBe(0);
  });
});

test.describe('bench real run (WASM lanes)', () => {
  test('quick suite: real downloads, real inference, export + dev-mode submit', async ({ page }) => {
    const consoleErrors: string[] = [];
    collectConsoleErrors(page, consoleErrors);
    // ALLOWLIST (documented, this lane only): the dev-mode submission path is
    // ASSERTED below — the unbound store answers 503 bench-store-unbound and
    // the UI must surface it. Chromium auto-logs every non-2xx fetch as a
    // console error, so the expected 503 on exactly /api/bench/submit is
    // benign here. Scoped to status+URL; any other console error still fails.
    const expected503 = (e: string) =>
      e.includes('503') && e.includes('/api/bench/submit');

    await page.goto('/bench/run');
    const runButton = page.getByRole('button', { name: 'Run benchmark' });
    await expect(runButton).toBeEnabled({ timeout: 15_000 });

    // Headless Chromium: WebGPU lanes must be visibly unavailable, not hidden.
    await expect(page.getByText('no WebGPU').first()).toBeVisible();

    await runButton.click();

    // Live progress surfaces through the status live region.
    const status = page.getByRole('status').first();
    await expect(status).toContainText(/calibration|running/i, { timeout: 60_000 });

    // Real model download + inference across the available quick lanes
    // (wllama GGUF LLM + WASM embedding lanes). Generous budget: real network.
    await expect(status).toContainText('Suite complete', { timeout: 540_000 });

    // Results table has rows with real numbers.
    const table = page.getByRole('table');
    await expect(table).toBeVisible();
    const llmRow = page.getByRole('row', { name: /wllama\/smollm2-135m\/chat-pp128-tg128/ });
    await expect(llmRow).toContainText('ok');
    await expect(llmRow).toContainText(/\d+ ms|\d+\.\d s/);

    // Export produces a shape-valid result with a digest.
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export JSON' }).click();
    const download = await downloadPromise;
    const path = await download.path();
    expect(path).toBeTruthy();
    const { readFileSync } = await import('node:fs');
    const exported = JSON.parse(readFileSync(path!, 'utf8')) as {
      protocol: string;
      digest?: string;
      fingerprint: { mflops: number } | null;
      cells: Array<{ status: string; iterations: unknown[] }>;
    };
    expect(exported.protocol).toBe('localmode-bench/1');
    expect(exported.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(exported.fingerprint?.mflops).toBeGreaterThan(1);
    expect(exported.cells.some((c) => c.status === 'ok' && c.iterations.length > 0)).toBe(true);

    // Auto-publish is on by default: the unbound dev store's 503 surfaces with
    // no click, and the failed submission leaves a Retry control available.
    await expect(page.getByText(/results store is not configured/i)).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole('button', { name: 'Retry submission' })).toBeVisible();

    expect(
      consoleErrors.filter((e) => !expected503(e)),
      'no console errors during the real run (only the asserted dev-mode 503 is allowed)',
    ).toEqual([]);
  });
});
