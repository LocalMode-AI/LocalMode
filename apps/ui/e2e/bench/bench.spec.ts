/**
 * @file bench.spec.ts
 * @description E2E for the /bench section. Lane 1-2: shell pages render with
 * ZERO model bytes and a clean console. Lane 3: a REAL quick-suite run on the
 * WASM paths (headless Chromium has no WebGPU — the WebGPU lanes assert their
 * unavailability badges instead; the WebGPU/Chrome-AI lanes are covered by the
 * documented manual real-Chrome hardware sweep). Real model downloads + real
 * inference; results table, JSON export with digest, and the dev-mode
 * submission path (503 bench-store-unbound surfaced to the user) are all
 * exercised for real. The runner conveniences are driven the same way: link
 * presets (prefill, never start), a two-run series across a real page reload,
 * a two-run series with a one-minute cool-down (countdown, reload no earlier
 * than the cool-down, idle time on run 2's file), Stop series mid-run, and Clear model caches checked against the browser's
 * own storage listings before the next run loads cold. The paid-study browser
 * gate is checked in Chromium and under a Safari user agent with
 * `navigator.userAgentData` removed (see the gate describe block), and a
 * paid-study link is checked to fix the suite and the run settings (disabled
 * controls at the link's values; editable on an organic visit), with a real
 * run that differs from its link getting no code. The
 * full-completion study mode (`ccmode=full`) is driven against a second
 * `next start` of the same build whose results store is bound to a local
 * GitHub-compatible endpoint (see that describe block). Selectors are
 * role/label/text only.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { expect, test, type ConsoleMessage, type Locator, type Page, type Request } from '@playwright/test';

/** The harness version every run must carry: the bench package this build installed. */
const BENCH_PACKAGE_VERSION = (
  JSON.parse(
    readFileSync(path.resolve(__dirname, '..', '..', '..', '..', 'packages', 'bench', 'package.json'), 'utf8'),
  ) as { version: string }
).version;

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

/** Provider storage as the page sees it: Cache API names, IndexedDB names, wllama's OPFS directory. */
async function providerStorage(page: Page): Promise<{ caches: string[]; databases: string[]; opfs: string[] | null }> {
  return page.evaluate(async () => {
    const cacheNames = await caches.keys();
    const databases = (await indexedDB.databases()).map((d) => d.name ?? '');
    let opfs: string[] | null = null;
    try {
      const root = await navigator.storage.getDirectory();
      const dir = (await root.getDirectoryHandle('cache')) as unknown as AsyncIterable<[string, unknown]>;
      opfs = [];
      for await (const [name] of dir) opfs.push(name);
    } catch {
      opfs = null;
    }
    return { caches: cacheNames, databases, opfs };
  });
}

interface ExportedRun {
  runId: string;
  suite: string;
  environment: {
    userReportedDevice?: string;
    userReportedHardware?: { gpu?: string; chassis?: string; ramGB?: number | null; otherAppsRunning?: boolean };
  };
  harness: {
    series?: { id: string; index: number; count: number; cooldownMs?: number; idleBeforeMs?: number };
    coldStart?: string;
  };
  cells: Array<{ cellId: string; runtimeId: string; status: string; load: { cached?: boolean; startT: number; endT: number } | null }>;
}

/** Every run file the page hands to the download manager, across reloads. */
function collectRunDownloads(page: Page): Array<Promise<ExportedRun>> {
  const files: Array<Promise<ExportedRun>> = [];
  page.on('download', (download) => {
    files.push(
      download.path().then((p) => JSON.parse(readFileSync(p, 'utf8')) as ExportedRun),
    );
  });
  return files;
}

/** The paid-study hardware questions, as a participant sees them: a dialog after Run, a group in the run overlay. */
const HARDWARE_FORM = 'About this computer';
const HARDWARE_REASON_ALL =
  'Still to answer: graphics card or chip, computer type, memory (RAM) and other heavy programs running.';

/** The "About this computer" dialog that Run benchmark opens on a paid-study link. */
function hardwareDialog(page: Page): Locator {
  return page.getByRole('dialog', { name: HARDWARE_FORM });
}

/** Answer the four hardware questions inside `scope` (the dialog, or the run overlay's group). */
async function answerHardware(
  scope: Locator,
  answers: { gpu: string; chassis: 'Laptop' | 'Desktop' | 'Other'; ram: string; otherApps: 'Yes' | 'No' },
) {
  await scope.getByLabel('Graphics card or chip').fill(answers.gpu);
  await scope.getByRole('radio', { name: answers.chassis }).check();
  await scope.getByLabel('Memory (RAM)').selectOption({ label: answers.ram });
  await scope.getByRole('radio', { name: answers.otherApps }).check();
}

/** Main-frame loads after the call (reloads count; the initial goto happens before). */
function countLoads(page: Page): { count: number } {
  const counter = { count: 0 };
  page.on('load', () => {
    counter.count += 1;
  });
  return counter;
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
    await expect(page.getByText('localmode-bench/5').first()).toBeVisible();
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

  test('/bench/run link presets prefill the controls and never start a run', async ({ page }) => {
    await page.goto('/bench/run?tier=standard&quality=on&runs=3&cooldown=2.5&cold=on&publish=off');
    const runButton = page.getByRole('button', { name: 'Run benchmark' });
    await expect(runButton).toBeEnabled({ timeout: 15_000 });
    await expect(page.getByRole('combobox', { name: 'Suite' })).toContainText('Standard');
    await expect(page.getByRole('switch', { name: /quality-fidelity lane/i })).toBeChecked();
    await expect(page.getByRole('spinbutton', { name: 'Runs', exact: true })).toHaveValue('3');
    await expect(page.getByRole('spinbutton', { name: 'Cool-down between runs' })).toHaveValue('2.5');
    await expect(page.getByRole('switch', { name: 'Clear caches after each run' })).toBeChecked();
    await expect(page.getByRole('switch', { name: /publish results/i })).not.toBeChecked();
    await expect(page.getByText(/a series of 3 runs with these settings/i)).toBeVisible();
    // The note documents the parameters and offers the link for the current controls.
    await page.getByText('Link presets').click();
    await expect(page.getByText('/bench/run?tier=standard&quality=on&runs=3&cooldown=2.5&cold=on&publish=off')).toBeVisible();
    // Nothing starts from a link: no run overlay, no series, and (afterEach) no model bytes.
    await page.waitForTimeout(5_000);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Benchmark series' })).toHaveCount(0);
    await expect(runButton).toBeEnabled();
    // Out-of-range and unknown values are clamped or ignored.
    await page.goto('/bench/run?runs=99&cooldown=45&tier=custom&quality=maybe');
    await expect(page.getByRole('spinbutton', { name: 'Runs', exact: true })).toHaveValue('30', { timeout: 15_000 });
    await expect(page.getByRole('spinbutton', { name: 'Cool-down between runs' })).toHaveValue('30');
    await expect(page.getByRole('combobox', { name: 'Suite' })).toContainText('Quick');
    await expect(page.getByRole('switch', { name: /quality-fidelity lane/i })).not.toBeChecked();
  });

  test('Clear model caches asks first and cancelling deletes nothing', async ({ page }) => {
    await page.goto('/bench/run');
    await expect(page.getByRole('button', { name: 'Run benchmark' })).toBeEnabled({ timeout: 15_000 });
    // A provider cache the clear would delete, written by the page itself.
    await page.evaluate(async () => {
      const cache = await caches.open('transformers-cache');
      await cache.put('/probe-model-file', new Response('x'));
    });
    await page.getByRole('button', { name: 'Clear model caches' }).click();
    const confirm = page.getByRole('alertdialog', { name: 'Clear model caches?' });
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText(/Gemini Nano \(Chrome Built-in AI\) is installed browser-wide/);
    await expect(confirm).toContainText(/HTTP disk cache cannot be cleared from a page/);
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirm).toHaveCount(0);
    expect(await page.evaluate(() => caches.keys())).toContain('transformers-cache');
    await expect(page.getByRole('region', { name: 'Model caches cleared' })).toHaveCount(0);
  });

  test('leaderboard API returns a valid empty aggregate', async ({ request }) => {
    const res = await request.get('/api/bench/leaderboard');
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { rows: unknown[]; runs: number };
    expect(Array.isArray(body.rows)).toBe(true);
    expect(body.runs).toBe(0);
  });
});

/**
 * Paid-study browser gate. The study pays only for runs from Chrome or Edge on
 * a computer, so a study link carrying a `cc` code opened in any other browser,
 * or on a phone or tablet, shows a notice in place of the Run button. The config
 * has only a Chromium project, so Safari is reproduced in Chromium: the context
 * user agent is Safari 26.3's (recorded on macOS), and because Chromium keeps
 * exposing `navigator.userAgentData` (with Chromium brands) under a spoofed user
 * agent, an init script removes it, as Safari has none. The page therefore takes
 * the same no-userAgentData path a real Safari takes. Chrome on Android is
 * reproduced the same way: an Android Chrome user agent, and an init script
 * that replaces `navigator.userAgentData` with the brands, `mobile: true` and
 * platform a real Android Chrome reports. The real-Safari and real-Android
 * checks are part of the manual hardware sweep.
 */
const SAFARI_MAC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.3 Safari/605.1.15';
/** A study link in the shape the study uses: presets, the code, then Prolific's three ids (test values). */
const STUDY_LINK =
  '/bench/run?tier=quick&quality=off&runs=1&cold=off&publish=on&cc=TESTCODE1&PROLIFIC_PID=e2e-test-pid&STUDY_ID=e2e-study&SESSION_ID=e2e-session';
/** Chrome 153 on an Android phone, in the reduced user-agent form Chrome sends. */
const ANDROID_CHROME_UA =
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36';
const STUDY_GATE_HEADING = 'This study needs Chrome or Edge';
const STUDY_GATE_TEXT =
  'This study needs Chrome or Edge on a computer. Runs from phones and tablets, Safari, Firefox and other browsers are not eligible for payment and do not receive a completion code. Open this exact link in Chrome or Edge on a Windows, macOS, Linux or ChromeOS computer to take part.';

test.describe('paid-study browser gate (zero model bytes)', () => {
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
    expect(modelRequests, 'the study gate lanes must fetch no model assets').toEqual([]);
  });

  test('Chromium: a study link shows no inline form; Run opens the "About this computer" dialog', async ({ page }) => {
    await page.goto(STUDY_LINK);
    await expect(page.getByRole('heading', { level: 1, name: /run localmode bench/i })).toBeVisible();
    expect(await page.evaluate(() => (navigator as Navigator & { userAgentData?: unknown }).userAgentData !== undefined)).toBe(true);
    const runButton = page.getByRole('button', { name: 'Run benchmark' });
    await expect(page.getByText(/probing device capabilities/i)).toHaveCount(0, { timeout: 15_000 });
    // Nothing is asked on the page itself, and Run is enabled.
    await expect(runButton).toBeEnabled();
    await expect(page.getByRole('group', { name: HARDWARE_FORM })).toHaveCount(0);
    await expect(page.getByLabel('Graphics card or chip')).toHaveCount(0);
    await expect(page.getByText(HARDWARE_REASON_ALL)).toHaveCount(0);
    await expect(runButton).not.toHaveAttribute('aria-describedby', /.+/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText(/paid study session detected/i)).toBeVisible();
    await expect(page.getByRole('alert', { name: STUDY_GATE_HEADING })).toHaveCount(0);
    await expect(page.getByText(STUDY_GATE_HEADING)).toHaveCount(0);
    // STUDY_ID and SESSION_ID pass through: the presets are still applied, and no code shows before a run.
    await expect(page.getByRole('combobox', { name: 'Suite' })).toContainText('Quick');
    await expect(page.getByRole('switch', { name: /quality-fidelity lane/i })).not.toBeChecked();
    await expect(page.getByRole('switch', { name: /publish results/i })).toBeChecked();
    await expect(page.getByRole('region', { name: /study completion code/i })).toHaveCount(0);

    // Run opens the dialog: titled, described, with every question empty and Start disabled with the reason.
    await runButton.click();
    const dialog = hardwareDialog(page);
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(dialog).toHaveAccessibleDescription(/Answer all four questions.*published with the run in the public leaderboard dataset/);
    const start = dialog.getByRole('button', { name: 'Start benchmark' });
    await expect(start).toBeDisabled();
    await expect(dialog.getByText(HARDWARE_REASON_ALL, { exact: true })).toBeVisible();
    await expect(start).toHaveAccessibleDescription(HARDWARE_REASON_ALL);
    const gpu = dialog.getByLabel('Graphics card or chip');
    await expect(gpu).toBeFocused();
    await expect(gpu).toHaveValue('');
    await expect(gpu).toHaveAttribute('maxlength', '64');
    // "Where to find it": one bullet per system, tied to the input, with the example names on their own line.
    const where = dialog.getByRole('list', { name: 'Where to find it:' });
    await expect(where.getByRole('listitem')).toHaveText([
      'Windows: Task Manager, Performance tab, GPU',
      'macOS: About This Mac, Chip or Graphics',
      'Linux: Settings, About, or lspci | grep -i vga',
    ]);
    await expect(gpu).toHaveAccessibleDescription(
      'Where to find it: Windows: Task Manager, Performance tab, GPU macOS: About This Mac, Chip or Graphics Linux: Settings, About, or lspci | grep -i vga Examples: NVIDIA GeForce RTX 4060, AMD Radeon 780M, Intel Arc or Iris Xe Graphics, Apple M2.',
    );
    await expect(dialog.getByLabel('Memory (RAM)').locator('option')).toHaveText([
      'Choose…', '4 GB', '6 GB', '8 GB', '12 GB', '16 GB', '24 GB', '32 GB', '48 GB', '64 GB', '96 GB', '128 GB or more', 'Not sure',
    ]);
    await expect(dialog.getByRole('radiogroup', { name: /other heavy programs running/i })).toHaveAttribute('aria-required', 'true');
    await expect(dialog.getByText('Optional')).toHaveCount(0);

    // Invalid and partial answers keep Start disabled and name what is missing.
    await gpu.fill('    ');
    await expect(dialog.getByText(HARDWARE_REASON_ALL, { exact: true })).toBeVisible();
    await gpu.fill('Intel Iris Xe Graphics');
    await dialog.getByRole('radio', { name: 'Desktop' }).check();
    await expect(
      dialog.getByText('Still to answer: memory (RAM) and other heavy programs running.', { exact: true }),
    ).toBeVisible();
    await expect(start).toBeDisabled();
    // "Not sure" is an answer, but the other-programs question is required too.
    await dialog.getByLabel('Memory (RAM)').selectOption({ label: 'Not sure' });
    await expect(dialog.getByText('Still to answer: other heavy programs running.', { exact: true })).toBeVisible();
    await expect(start).toBeDisabled();
    // Enter in the text field does not start an incomplete form.
    await gpu.press('Enter');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('radio', { name: 'No' }).check();
    await expect(start).toBeEnabled();
    await expect(dialog.getByText(/^Still to answer/)).toHaveCount(0);
    await expect(start).not.toHaveAttribute('aria-describedby', /.+/);

    // Cancel closes without starting, and focus goes back to Run benchmark.
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(runButton).toBeFocused();
    await expect(runButton).toBeEnabled();
    // The answers are kept for the next attempt; Escape closes the same way.
    await runButton.click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Graphics card or chip')).toHaveValue('Intel Iris Xe Graphics');
    await expect(dialog.getByRole('button', { name: 'Start benchmark' })).toBeEnabled();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(runButton).toBeFocused();
    // Neither close started a run: no overlay, no status, and (afterEach) no model bytes.
    await page.waitForTimeout(3_000);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /running/i })).toHaveCount(0);
  });

  test.describe('Safari user agent', () => {
    test.use({ userAgent: SAFARI_MAC_UA });

    test.beforeEach(async ({ context }) => {
      await context.addInitScript(() => {
        Object.defineProperty(Navigator.prototype, 'userAgentData', { get: () => undefined, configurable: true });
      });
    });

    test('a study link with cc shows the notice in place of the Run button and downloads nothing', async ({ page }) => {
      await page.goto(STUDY_LINK);
      await expect(page.getByRole('heading', { level: 1, name: /run localmode bench/i })).toBeVisible();
      expect(
        await page.evaluate(() => ({
          ua: navigator.userAgent,
          uad: (navigator as Navigator & { userAgentData?: unknown }).userAgentData ?? null,
        })),
      ).toEqual({ ua: SAFARI_MAC_UA, uad: null });
      const gate = page.getByRole('alert', { name: STUDY_GATE_HEADING });
      await expect(gate).toBeVisible({ timeout: 15_000 });
      await expect(gate).toContainText(STUDY_GATE_TEXT);
      // The lanes finished probing, so the absent button is the gate, not a loading state.
      await expect(page.getByText(/probing device capabilities/i)).toHaveCount(0, { timeout: 15_000 });
      await expect(page.getByRole('button', { name: 'Run benchmark' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /running/i })).toHaveCount(0);
      await expect(page.getByText(/paid study session detected/i)).toHaveCount(0);
      await expect(page.getByRole('region', { name: /study completion code/i })).toHaveCount(0);
      await expect(page.getByText('TESTCODE1')).toHaveCount(0);
      // The hardware questions belong to an eligible study session only.
      await expect(page.getByRole('group', { name: HARDWARE_FORM })).toHaveCount(0);
      await expect(page.getByLabel('Graphics card or chip')).toHaveCount(0);
      // The ordinary runner controls stay visible.
      await expect(page.getByRole('combobox', { name: 'Suite' })).toContainText('Quick');
      // Nothing starts on its own: no run overlay and (afterEach) no model bytes.
      await page.waitForTimeout(3_000);
      await expect(page.getByRole('dialog')).toHaveCount(0);
    });

    test('PROLIFIC_PID without cc behaves as a plain visit: no gate, Run button present', async ({ page }) => {
      await page.goto(
        '/bench/run?tier=quick&quality=off&runs=1&cold=off&publish=on&PROLIFIC_PID=e2e-test-pid&STUDY_ID=e2e-study&SESSION_ID=e2e-session',
      );
      await expect(page.getByRole('button', { name: 'Run benchmark' })).toBeEnabled({ timeout: 15_000 });
      expect(await page.evaluate(() => navigator.userAgent)).toBe(SAFARI_MAC_UA);
      await expect(page.getByText(/paid study session detected/i)).toBeVisible();
      await expect(page.getByRole('alert', { name: STUDY_GATE_HEADING })).toHaveCount(0);
      await expect(page.getByText(STUDY_GATE_HEADING)).toHaveCount(0);
      await expect(page.getByRole('group', { name: HARDWARE_FORM })).toHaveCount(0);
      await expect(page.getByLabel('Graphics card or chip')).toHaveCount(0);
    });
  });

  test.describe('Chrome on Android', () => {
    test.use({ userAgent: ANDROID_CHROME_UA });

    test.beforeEach(async ({ context }) => {
      await context.addInitScript(() => {
        const data = {
          brands: [
            { brand: 'Chromium', version: '153' },
            { brand: 'Google Chrome', version: '153' },
          ],
          mobile: true,
          platform: 'Android',
          getHighEntropyValues: async () => ({}),
          toJSON() {
            return { brands: this.brands, mobile: this.mobile, platform: this.platform };
          },
        };
        Object.defineProperty(Navigator.prototype, 'userAgentData', { get: () => data, configurable: true });
      });
    });

    test('a study link with cc shows the notice in place of the Run button and downloads nothing', async ({ page }) => {
      await page.goto(STUDY_LINK);
      await expect(page.getByRole('heading', { level: 1, name: /run localmode bench/i })).toBeVisible();
      expect(
        await page.evaluate(() => {
          const uad = (navigator as Navigator & { userAgentData?: { brands: unknown; mobile: unknown; platform: unknown } })
            .userAgentData;
          return { ua: navigator.userAgent, brands: uad?.brands, mobile: uad?.mobile, platform: uad?.platform };
        }),
      ).toEqual({
        ua: ANDROID_CHROME_UA,
        brands: [
          { brand: 'Chromium', version: '153' },
          { brand: 'Google Chrome', version: '153' },
        ],
        mobile: true,
        platform: 'Android',
      });
      const gate = page.getByRole('alert', { name: STUDY_GATE_HEADING });
      await expect(gate).toBeVisible({ timeout: 15_000 });
      await expect(gate).toContainText(STUDY_GATE_TEXT);
      // The lanes finished probing, so the absent button is the gate, not a loading state.
      await expect(page.getByText(/probing device capabilities/i)).toHaveCount(0, { timeout: 15_000 });
      await expect(page.getByRole('button', { name: 'Run benchmark' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /running/i })).toHaveCount(0);
      await expect(page.getByText(/paid study session detected/i)).toHaveCount(0);
      await expect(page.getByRole('region', { name: /study completion code/i })).toHaveCount(0);
      await expect(page.getByText('TESTCODE1')).toHaveCount(0);
      await expect(page.getByRole('group', { name: HARDWARE_FORM })).toHaveCount(0);
      // Nothing starts on its own: no run overlay and (afterEach) no model bytes.
      await page.waitForTimeout(3_000);
      await expect(page.getByRole('dialog')).toHaveCount(0);
    });
  });

  test('an organic visit (no cc) shows no hardware questions and the Run button is enabled as before', async ({ page }) => {
    for (const url of ['/bench/run', '/bench/run?tier=quick&quality=off&runs=1&publish=on&PROLIFIC_PID=e2e-test-pid']) {
      await page.goto(url);
      const runButton = page.getByRole('button', { name: 'Run benchmark' });
      await expect(runButton).toBeEnabled({ timeout: 15_000 });
      await expect(page.getByText(/probing device capabilities/i)).toHaveCount(0, { timeout: 15_000 });
      await expect(page.getByRole('group', { name: HARDWARE_FORM })).toHaveCount(0);
      await expect(page.getByLabel('Graphics card or chip')).toHaveCount(0);
      await expect(page.getByText(/^Still to answer/)).toHaveCount(0);
      await expect(runButton).not.toHaveAttribute('aria-describedby', /.+/);
    }
  });

  test('a study link fixes the suite and the run settings; an organic visit with the same presets leaves them editable', async ({
    page,
  }) => {
    const presets = 'tier=thorough&quality=on&runs=2&cooldown=1.5&cold=on&publish=on';
    const controls = {
      suite: page.getByRole('combobox', { name: 'Suite' }),
      quality: page.getByRole('switch', { name: /quality-fidelity lane/i }),
      runs: page.getByRole('spinbutton', { name: 'Runs', exact: true }),
      cooldown: page.getByRole('spinbutton', { name: 'Cool-down between runs' }),
      clearAfter: page.getByRole('switch', { name: 'Clear caches after each run' }),
    };
    const assertPresetValues = async () => {
      await expect(controls.suite).toContainText('Thorough');
      await expect(controls.quality).toBeChecked();
      await expect(controls.runs).toHaveValue('2');
      await expect(controls.cooldown).toHaveValue('1.5');
      await expect(controls.clearAfter).toBeChecked();
    };
    const note = page.getByRole('note').filter({ hasText: 'This study link fixes the suite and the run settings.' });
    // Both completion modes of a paid-study link lock the five controls to the link's values.
    for (const mode of ['', '&ccmode=full']) {
      await page.goto(`/bench/run?${presets}&cc=TESTCODE1${mode}&PROLIFIC_PID=e2e-lock-pid&STUDY_ID=e2e-study&SESSION_ID=e2e-session`);
      await expect(page.getByRole('button', { name: 'Run benchmark' })).toBeEnabled({ timeout: 15_000 });
      await expect(page.getByText(/paid study session detected/i)).toBeVisible();
      await assertPresetValues();
      for (const control of Object.values(controls)) await expect(control).toBeDisabled();
      await expect(note).toHaveCount(1);
      await expect(note).toHaveText('This study link fixes the suite and the run settings.');
      // A click on the locked picker opens nothing and changes nothing.
      await controls.suite.click({ force: true });
      await expect(page.getByRole('listbox')).toHaveCount(0);
      await controls.quality.click({ force: true });
      await expect(controls.quality).toBeChecked();
      await assertPresetValues();
      // Publishing stays as before: forced on in full mode, editable on an attempt-mode link.
      const publish = page.getByRole('switch', { name: /publish results/i });
      await expect(publish).toBeChecked();
      if (mode) await expect(publish).toBeDisabled();
      else await expect(publish).toBeEnabled();
    }
    // A study link that names no presets locks the controls at the plain-visit values.
    await page.goto('/bench/run?cc=TESTCODE1&PROLIFIC_PID=e2e-lock-pid');
    await expect(page.getByRole('button', { name: 'Run benchmark' })).toBeEnabled({ timeout: 15_000 });
    await expect(controls.suite).toContainText('Quick');
    await expect(controls.quality).not.toBeChecked();
    await expect(controls.runs).toHaveValue('1');
    await expect(controls.cooldown).toHaveValue('0');
    await expect(controls.clearAfter).not.toBeChecked();
    for (const control of Object.values(controls)) await expect(control).toBeDisabled();
    await expect(note).toHaveCount(1);

    // An organic visit (no cc, with or without PROLIFIC_PID) prefills the same values and leaves every control editable.
    for (const url of [`/bench/run?${presets}`, `/bench/run?${presets}&PROLIFIC_PID=e2e-lock-pid`]) {
      await page.goto(url);
      await expect(page.getByRole('button', { name: 'Run benchmark' })).toBeEnabled({ timeout: 15_000 });
      await assertPresetValues();
      for (const control of Object.values(controls)) await expect(control).toBeEnabled();
      await expect(page.getByText('This study link fixes the suite and the run settings.')).toHaveCount(0);
      await controls.suite.click();
      await page.getByRole('option', { name: /^Standard/ }).click();
      await expect(controls.suite).toContainText('Standard');
      await controls.quality.click();
      await expect(controls.quality).not.toBeChecked();
      await controls.runs.fill('4');
      await expect(controls.runs).toHaveValue('4');
    }
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

    // Paid-study contract: the page reads the study
    // parameters, tells the participant the code comes after the upload, and
    // must NOT show the completion code before the run + submit attempt resolve.
    await page.goto('/bench/run?PROLIFIC_PID=5f3a1c2b4d6e7f8091a2b3c4&cc=TESTCODE1');
    const runButton = page.getByRole('button', { name: 'Run benchmark' });
    // A study link asks about the hardware in a dialog that Run opens; Start stays disabled until all four are answered.
    await expect(page.getByText(/probing device capabilities/i)).toHaveCount(0, { timeout: 15_000 });
    await expect(runButton).toBeEnabled();
    await expect(page.getByText(/paid study session detected/i)).toBeVisible();
    // Second witness for the recorded answers: the run file the page uploads.
    const submitted: string[] = [];
    page.on('request', (req) => {
      if (req.url().endsWith('/api/bench/submit') && req.method() === 'POST') submitted.push(req.postData() ?? '');
    });
    await expect(page.getByRole('region', { name: /study completion code/i })).toHaveCount(0);

    // Headless Chromium: WebGPU lanes must be visibly unavailable, not hidden.
    await expect(page.getByText('no WebGPU').first()).toBeVisible();

    await runButton.click();
    const askDialog = hardwareDialog(page);
    await expect(askDialog).toBeVisible();
    const start = askDialog.getByRole('button', { name: 'Start benchmark' });
    await expect(start).toBeDisabled();
    await expect(askDialog.getByText(HARDWARE_REASON_ALL, { exact: true })).toBeVisible();
    await answerHardware(askDialog, { gpu: 'Intel Iris Xe Graphics', chassis: 'Laptop', ram: '16 GB', otherApps: 'No' });
    await expect(start).toBeEnabled();
    await start.click();
    await expect(hardwareDialog(page)).toHaveCount(0);
    await expect(page.getByRole('region', { name: /study completion code/i })).toHaveCount(0);

    // While the run is in progress everything a participant needs is in one
    // modal over the page: the keep-this-tab-open instruction, overall
    // progress with a time estimate, the live step, and the per-model checklist.
    const dialog = page.getByRole('dialog', { name: /benchmark running/i });
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await expect(dialog.getByRole('alert')).toContainText(/keep this tab open, visible, and in front/i);
    await expect(dialog).toContainText(/completion code appears on this page/i);
    await expect(dialog).toContainText(/Estimated time remaining|Estimating the remaining time/);
    await expect(dialog.getByRole('list', { name: /model lanes progress/i })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Cancel run' })).toBeVisible();
    // Focus moved into the run overlay, not back to the Run button behind it.
    await expect(dialog).toBeFocused();

    // The answers stay editable during the run, in the overlay; the values present when the
    // run file is assembled are the ones recorded (the GPU name normalized).
    const runForm = dialog.getByRole('group', { name: HARDWARE_FORM });
    await expect(runForm.getByLabel('Graphics card or chip')).toHaveValue('Intel Iris Xe Graphics');
    await expect(runForm.getByRole('radio', { name: 'Laptop' })).toBeChecked();
    await expect(runForm.getByLabel('Memory (RAM)')).toHaveValue('16');
    await runForm.getByLabel('Graphics card or chip').fill('  NVIDIA   GeForce RTX 4060  ');
    await runForm.getByRole('radio', { name: 'Yes' }).check();
    await expect(page.getByRole('group', { name: HARDWARE_FORM })).toHaveCount(1);
    await expect(page.getByRole('dialog')).toHaveCount(1);

    // Live progress surfaces through the status live region.
    const status = page.getByRole('status').first();
    await expect(status).toContainText(/calibration|running/i, { timeout: 60_000 });

    // Real model download + inference across the available quick lanes
    // (wllama GGUF LLM + WASM embedding lanes). Generous budget: real network.
    await expect(status).toContainText('Suite complete', { timeout: 540_000 });
    // The overlay leaves with the run; the results are on the page underneath.
    await expect(page.getByRole('dialog')).toHaveCount(0);

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
      schemaVersion: number;
      digest?: string;
      harness: { version: string; runtimeVersions?: Record<string, string> };
      environment: {
        userReportedDevice?: string;
        userReportedHardware?: unknown;
        userAgent?: string;
        pageOrigin?: string;
        browser: { name: string; engine?: string; webdriver?: boolean; vendor?: string };
        os: { platform: string; navigatorPlatform?: string };
        hardware: { cores: number | null; jsHeapSizeLimitBytes?: number };
        device?: { type: string; maxTouchPoints: number };
        gpuModel?: string;
        webgl?: { contextKind: string | null; renderer?: string };
        flags: { wasm?: Record<string, boolean | number>; secureContext?: boolean };
        apis?: Record<string, unknown>;
        display?: { width: number; colorDepth?: number; viewportWidth?: number };
        locale?: { timeZone?: string; locale?: string };
        languages?: string[];
        power?: { level?: number; chargingTimeSec?: number };
        network?: { supported: boolean; online?: boolean };
      };
      fingerprint: { mflops: number } | null;
      cells: Array<{
        cellId: string;
        runtimeId: string;
        runtimeVersion?: string;
        resolvedBackend: string;
        runtimeConfig?: Record<string, string | number | boolean>;
        status: string;
        invalidReasons?: string[];
        iterations: Array<{ chunks?: Array<{ t: number; c: number }>; text?: string; startT: number }>;
      }>;
      clientSummaries?: Array<{
        cellId: string;
        streamIncremental?: boolean;
        ttftMs?: { median: number };
        decodeCharsPerSec?: { median: number };
      }>;
    };
    expect(exported.protocol).toBe('localmode-bench/5');
    expect(exported.digest).toMatch(/^[0-9a-f]{64}$/);
    // The dataset row carries a 12-hex SHA-256 prefix of the participant id, never the id.
    expect(exported.environment.userReportedDevice).toMatch(/^prolific:[0-9a-f]{12}$/);
    expect(JSON.stringify(exported)).not.toContain('5f3a1c2b4d6e7f8091a2b3c4');
    // The hardware answers as they stood when the run file was assembled (edited during the run).
    expect(exported.environment.userReportedHardware).toEqual({
      gpu: 'NVIDIA GeForce RTX 4060',
      chassis: 'laptop',
      ramGB: 16,
      otherAppsRunning: true,
    });
    expect(exported.fingerprint?.mflops).toBeGreaterThan(1);
    expect(exported.cells.some((c) => c.status === 'ok' && c.iterations.length > 0)).toBe(true);
    // Lanes this device cannot run stay in the result as skipped cells with the
    // reason (headless Chromium has no WebGPU), so every quick run lists every
    // quick cell.
    const webllmCell = exported.cells.find((c) => c.cellId === 'webllm/smollm2-135m/chat-pp128-tg128');
    expect(webllmCell?.status).toBe('skipped');
    expect(webllmCell?.invalidReasons?.[0]).toMatch(/^runtime unavailable: no WebGPU/);

    // Extended environment capture: the run records the device identity the
    // browser discloses (form factor, engine, GPU model, WASM proposal matrix,
    // API availability, display, locale) and the exact runtime versions.
    const env = exported.environment;
    expect(env.userAgent).toContain('Mozilla/5.0');
    expect(env.pageOrigin).toBe(new URL(page.url()).origin);
    expect(env.browser.engine).toBe('Blink');
    expect(env.browser.webdriver, 'Playwright drives this browser, so the capture must say so').toBe(true);
    expect(env.os.navigatorPlatform).toBeTruthy();
    expect(env.device?.type).toBe('desktop');
    expect(env.webgl?.contextKind).toBe('webgl2');
    expect(env.gpuModel, 'GPU model parsed from the WebGL renderer string').toBeTruthy();
    expect(env.hardware.jsHeapSizeLimitBytes).toBeGreaterThan(1e9);
    const wasm = env.flags.wasm!;
    for (const feature of ['simd', 'threads', 'bulkMemory', 'referenceTypes', 'multiValue', 'exceptions', 'gc', 'tailCall']) {
      expect(wasm[feature], `wasm.${feature} on current Chrome`).toBe(true);
    }
    expect(wasm.maxMemoryPages).toBe(65536);
    expect(env.flags.secureContext).toBe(true);
    const apis = env.apis!;
    expect(apis.indexedDB).toBe(true);
    expect(apis.cacheApi).toBe(true);
    expect(apis.webWorkers).toBe(true);
    expect(apis.opfs).toBe(true);
    expect(apis.webgl2).toBe(true);
    expect(env.display?.width).toBeGreaterThan(0);
    expect(env.display?.colorDepth).toBeGreaterThan(0);
    // Schema 3: the locale tag is kept; the time zone, the language list, and
    // the exact battery figures (they locate or track a device) are not captured.
    expect(env.locale?.locale).toBeTruthy();
    expect(env.locale?.timeZone).toBeUndefined();
    expect(env.languages).toBeUndefined();
    expect(env.power?.chargingTimeSec).toBeUndefined();
    if (typeof env.power?.level === 'number') expect(env.power.level % 0.25).toBe(0);
    expect(exported.schemaVersion).toBe(3);
    expect(env.network?.online).toBe(true);
    // Runtime versions are stamped at build time from the installed packages.
    expect(exported.harness.version).toBe(BENCH_PACKAGE_VERSION);
    expect(exported.harness.runtimeVersions?.['@localmode/bench']).toBe(BENCH_PACKAGE_VERSION);
    expect(exported.harness.runtimeVersions?.['@huggingface/transformers']).toMatch(/^\d+\.\d+\.\d+/);
    expect(exported.harness.runtimeVersions?.['@wllama/wllama']).toMatch(/^\d+\.\d+\.\d+/);
    for (const cell of exported.cells.filter((c) => c.status === 'ok')) {
      expect(cell.runtimeVersion, `${cell.cellId} carries its runtime version`).toMatch(/^\d+\.\d+\.\d+/);
    }

    // Regression guards for the wllama lane, all surfaced by the thorough
    // pilots: (a) a bare prompt must go through the chat template - SmolLM2
    // answered an untemplated prompt with 0 characters; (b) generation must be
    // genuinely token-streamed - the raw completion path delivered one
    // terminal chunk, so no TTFT/decode could be derived; (c) the prompt-KV
    // cache must be off - with it on, TTFT collapsed ~40x after iteration 1.
    const wllamaChat = exported.cells.find((c) => c.cellId === 'wllama/smollm2-135m/chat-pp128-tg128');
    expect(wllamaChat?.status, 'wllama chat cell must be ok (a degenerate generation marks it invalid)').toBe('ok');
    for (const it of wllamaChat!.iterations) {
      expect(it.text!.length).toBeGreaterThanOrEqual(16);
      expect(it.chunks!.filter((ch) => ch.c > 0).length).toBeGreaterThan(1);
    }
    const wllamaSummary = exported.clientSummaries?.find((s) => s.cellId === wllamaChat!.cellId);
    expect(wllamaSummary?.streamIncremental).toBe(true);
    expect(wllamaSummary?.decodeCharsPerSec?.median).toBeGreaterThan(0);
    // Protocol v3: the wllama lane is llama.cpp on the CPU, recorded from
    // llama.cpp's own offload report (wllama 3.5 offloads to WebGPU by default
    // wherever the browser has it; headless Chromium has none, so the report
    // must still read 0/N and the config must show the CPU pin).
    expect(wllamaChat?.resolvedBackend).toBe('wasm');
    expect(wllamaChat?.runtimeConfig).toMatchObject({ n_gpu_layers: 0, cache_prompt: false, webgpu_adapter: false, mmproj: false });
    // llama.cpp prints its offload line only when it found a GPU device; headless
    // Chromium exposes navigator.gpu but yields no adapter, so the record reads
    // "unreported", which with webgpu_adapter: false is an unambiguous CPU run.
    // The "0/31" form is asserted by the manual real-Chrome sweep.
    expect(wllamaChat?.runtimeConfig?.offloadedLayers).toBe('unreported');
    expect(wllamaChat?.runtimeConfig?.n_threads).toBeGreaterThan(0);
    // The Transformers.js WASM lane ran inside its worker (the page stays live
    // during ONNX inference) and recorded so.
    const tfWasm = exported.cells.find((c) => c.cellId === 'transformers-wasm/bge-small-en/embed-single');
    expect(tfWasm?.status).toBe('ok');
    expect(tfWasm?.runtimeConfig).toMatchObject({ device: 'wasm', worker: true });
    // The WebGPU llama.cpp lane exists in every quick run and is skipped here for want of WebGPU.
    const wllamaGpu = exported.cells.find((c) => c.cellId === 'wllama-webgpu/smollm2-135m/chat-pp128-tg128');
    expect(wllamaGpu?.status).toBe('skipped');
    expect(wllamaGpu?.invalidReasons?.[0]).toMatch(/no WebGPU/);
    const ttfts = wllamaChat!.iterations.map((it) => it.chunks!.find((ch) => ch.c > 0)!.t - it.startT);
    const [first, ...rest] = ttfts;
    for (const t of rest) {
      expect(t, `iteration TTFT ${t}ms vs first ${first}ms: prompt cache reuse skipped prefill`).toBeGreaterThan(first / 4);
    }

    // Auto-publish is on by default: the unbound dev store's 503 surfaces with
    // no click, and the failed submission leaves a Retry control available.
    await expect(page.getByText(/results store is not configured/i)).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole('button', { name: 'Retry submission' })).toBeVisible();
    // The uploaded run file carries the same answers and the same digest as the export.
    expect(submitted).toHaveLength(1);
    const uploaded = JSON.parse(submitted[0]) as { digest?: string; environment: { userReportedHardware?: unknown } };
    expect(uploaded.environment.userReportedHardware).toEqual(exported.environment.userReportedHardware);
    expect(uploaded.digest).toBe(exported.digest);

    // Pay-on-attempt: the completion code appears now that the submit attempt
    // resolved (here: failed with the dev-mode 503), with the researcher note.
    const codeRegion = page.getByRole('region', { name: /study completion code/i });
    await expect(codeRegion).toBeVisible();
    await expect(codeRegion).toContainText('TESTCODE1');
    await expect(codeRegion).toContainText(/still paid for the attempt/i);
    await expect(codeRegion.getByRole('link', { name: /complete on prolific/i })).toHaveAttribute(
      'href',
      'https://app.prolific.com/submissions/complete?cc=TESTCODE1',
    );

    expect(
      consoleErrors.filter((e) => !expected503(e)),
      'no console errors during the real run (only the asserted dev-mode 503 is allowed)',
    ).toEqual([]);
  });

  test('a run that dies mid-suite leaves an exportable partial record on the next page load', async ({ context }) => {
    // A Standard/Thorough suite can push a tab past its memory ceiling; the tab
    // dies and nothing is left to diagnose (a Dell XPS lab session lost every
    // long run this way). Progress is written to IndexedDB cell by cell, so
    // closing the page mid-run (the closest a test can get to a renderer crash
    // without faking the boundary) must leave a recoverable partial attempt in
    // the same browser profile.
    const first = await context.newPage();
    const firstErrors: string[] = [];
    collectConsoleErrors(first, firstErrors);
    await first.goto('/bench/run');
    await expect(first.getByRole('region', { name: /unfinished run recovered/i })).toHaveCount(0);
    const runButton = first.getByRole('button', { name: 'Run benchmark' });
    await expect(runButton).toBeEnabled({ timeout: 15_000 });
    await runButton.click();
    // Wait until real cells have completed (the WASM embedding lanes run
    // before wllama in the deterministic execution order), then kill the page.
    const status = first.getByRole('status').first();
    await expect(status).toContainText(/Running wllama\//, { timeout: 540_000 });
    expect(firstErrors).toEqual([]);
    await first.close();

    const page = await context.newPage();
    const consoleErrors: string[] = [];
    collectConsoleErrors(page, consoleErrors);
    await page.goto('/bench/run');
    const region = page.getByRole('region', { name: /unfinished run recovered/i });
    await expect(region).toBeVisible({ timeout: 15_000 });
    await expect(region).toContainText(/quick suite · \d+ of \d+ cells finished/);
    await expect(region).toContainText(/ended during wllama\//);
    await expect(region.getByRole('button', { name: 'Copy diagnostics' })).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await region.getByRole('button', { name: 'Export partial run' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^localmode-bench-partial-.*\.json$/);
    const { readFileSync } = await import('node:fs');
    const partial = JSON.parse(readFileSync((await download.path())!, 'utf8')) as {
      partial: boolean;
      protocol: string;
      suite: string;
      harness: { version: string; runtimeVersions?: Record<string, string> };
      environment: { browser: { engine?: string }; device?: { type: string } } | null;
      plannedCells: number;
      finishedCells: number;
      unfinishedCellIds: string[];
      currentCellId: string | null;
      currentPhase: string | null;
      cells: Array<{ cellId: string; status: string; memory?: { postRun?: number } }>;
    };
    expect(partial.partial).toBe(true);
    expect(partial.protocol).toBe('localmode-bench/5');
    expect(partial.suite).toBe('quick');
    expect(partial.harness.version).toBe(BENCH_PACKAGE_VERSION);
    // The environment landed before the first cell, so a crash during the first
    // model load still identifies the device.
    expect(partial.environment?.browser.engine).toBe('Blink');
    expect(partial.environment?.device?.type).toBe('desktop');
    expect(partial.finishedCells).toBe(partial.cells.length);
    expect(partial.finishedCells).toBeGreaterThan(0);
    expect(partial.finishedCells).toBeLessThan(partial.plannedCells);
    expect(partial.unfinishedCellIds.length).toBe(partial.plannedCells - partial.finishedCells);
    // Real work was recorded, not only the headless WebGPU skips: the WASM
    // embedding lanes completed with a memory sample.
    const okCells = partial.cells.filter((c) => c.status === 'ok');
    expect(okCells.map((c) => c.cellId)).toEqual(
      expect.arrayContaining(['transformers-wasm/bge-small-en/embed-single', 'mediapipe/use-mediapipe/embed-single']),
    );
    expect(okCells[0].memory?.postRun).toBeGreaterThan(0);
    // The lanes headless Chromium cannot run are present as skipped cells with
    // their reason, not dropped from the plan.
    const skipped = partial.cells.find((c) => c.cellId === 'transformers-webgpu/bge-small-en/embed-single');
    expect(skipped?.status).toBe('skipped');
    // The cell that was executing when the page died is named, with its phase.
    expect(partial.currentCellId).toMatch(/^wllama\//);
    expect(['load', 'warmup', 'iteration']).toContain(partial.currentPhase);

    // Discard removes the record, and it stays gone across a reload.
    await region.getByRole('button', { name: 'Discard' }).click();
    await expect(page.getByRole('region', { name: /unfinished run recovered/i })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Run benchmark' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('region', { name: /unfinished run recovered/i })).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });

  test('a series of 2 Quick runs: one click, a page reload between runs, both runs kept with their series place', async ({
    page,
    context,
  }) => {
    test.setTimeout(30 * 60 * 1000);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const consoleErrors: string[] = [];
    collectConsoleErrors(page, consoleErrors);
    // Every "About this computer" dialog that opens on any page load of the series is counted.
    const askedOn: string[] = [];
    await page.exposeFunction('__benchHardwareDialogShown', (title: string) => askedOn.push(title));
    await page.addInitScript(() => {
      const report = (t: string) =>
        (window as unknown as { __benchHardwareDialogShown: (t: string) => Promise<void> }).__benchHardwareDialogShown(t);
      const seen = new WeakSet<Element>();
      new MutationObserver(() => {
        for (const el of document.querySelectorAll('[role="dialog"]')) {
          const titleId = el.getAttribute('aria-labelledby');
          const title = titleId ? document.getElementById(titleId)?.textContent : null;
          if (title === 'About this computer' && !seen.has(el)) {
            seen.add(el);
            void report(document.title);
          }
        }
      }).observe(document, { childList: true, subtree: true });
    });
    // A study link: the hardware answers given before run 1 must reach run 2 across the reload.
    // The study link names the series length: Runs is fixed at 2 on it.
    await page.goto('/bench/run?runs=2&cc=TESTCODE2&PROLIFIC_PID=e2e-series-pid');
    const runButton = page.getByRole('button', { name: 'Run benchmark' });
    await expect(page.getByText(/probing device capabilities/i)).toHaveCount(0, { timeout: 15_000 });
    await expect(runButton).toBeEnabled({ timeout: 15_000 });
    const runsInput = page.getByRole('spinbutton', { name: 'Runs', exact: true });
    await expect(runsInput).toHaveValue('2');
    await expect(runsInput).toBeDisabled();
    // Publishing off: each run of the series is exported as a JSON download.
    await page.getByRole('switch', { name: /publish results/i }).click();
    const downloads = collectRunDownloads(page);
    const loads = countLoads(page);
    await runButton.click();
    const askDialog = hardwareDialog(page);
    await expect(askDialog).toBeVisible();
    await answerHardware(askDialog, { gpu: 'AMD Radeon 780M', chassis: 'Desktop', ram: '128 GB or more', otherApps: 'No' });
    await askDialog.getByRole('button', { name: 'Start benchmark' }).click();

    const dialog = page.getByRole('dialog', { name: /benchmark running/i });
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await expect(dialog.getByRole('group', { name: 'Series progress' })).toContainText('Series: run 1 of 2');
    await expect(dialog.getByRole('button', { name: 'Stop series' })).toBeEnabled();
    await expect(page).toHaveTitle('1/2 · LocalMode Bench');
    await expect(page.getByRole('button', { name: 'Clear model caches' })).toBeDisabled();

    // Run 2 starts by itself on the reloaded page (no click).
    await expect(page.getByRole('dialog', { name: /benchmark running/i })
      .getByRole('group', { name: 'Series progress' })).toContainText('Series: run 2 of 2', { timeout: 15 * 60 * 1000 });
    expect(loads.count, 'the page reloaded between the two runs').toBeGreaterThanOrEqual(1);
    await expect(page).toHaveTitle('2/2 · LocalMode Bench');
    // Run 2 started without asking again: the answers survived the reload.
    await expect(hardwareDialog(page)).toHaveCount(0);
    // The answers survived the reload; one is changed during run 2 and must be recorded on run 2 only.
    const run2Form = page.getByRole('dialog', { name: /benchmark running/i }).getByRole('group', { name: HARDWARE_FORM });
    await expect(run2Form.getByLabel('Graphics card or chip')).toHaveValue('AMD Radeon 780M');
    await expect(run2Form.getByRole('radio', { name: 'Desktop' })).toBeChecked();
    await expect(run2Form.getByLabel('Memory (RAM)')).toHaveValue('128');
    await expect(run2Form.getByRole('radio', { name: 'No' })).toBeChecked();
    await run2Form.getByRole('radio', { name: 'Yes' }).check();

    const panel = page.getByRole('region', { name: 'Benchmark series' });
    await expect(panel).toContainText('Series complete: 2 of 2 runs', { timeout: 15 * 60 * 1000 });
    const listed = panel.getByRole('list', { name: 'Completed runs' }).getByRole('listitem');
    await expect(listed).toHaveCount(2);
    await expect(page).toHaveTitle('Done 2/2 · LocalMode Bench');
    expect(loads.count, 'exactly one reload: none after the last run').toBe(1);
    expect(askedOn, 'the dialog was shown once, before run 1, and never on the reloaded page of run 2').toHaveLength(1);

    expect(downloads).toHaveLength(2);
    const [first, second] = await Promise.all(downloads);
    expect(first.harness.series).toMatchObject({ index: 1, count: 2, cooldownMs: 0 });
    expect(first.harness.series!.idleBeforeMs, 'run 1 has no previous run to idle after').toBeUndefined();
    const { idleBeforeMs, ...secondSeries } = second.harness.series!;
    expect(secondSeries).toEqual({ id: first.harness.series!.id, index: 2, count: 2, cooldownMs: 0 });
    // No cool-down, but the idle time still spans the download grace (1.5 s) and the reload.
    expect(Number.isInteger(idleBeforeMs)).toBe(true);
    expect(idleBeforeMs!).toBeGreaterThanOrEqual(1_500);
    expect(first.runId).not.toBe(second.runId);
    const answered = { gpu: 'AMD Radeon 780M', chassis: 'desktop', ramGB: 128 };
    expect(first.environment.userReportedHardware).toEqual({ ...answered, otherAppsRunning: false });
    expect(second.environment.userReportedHardware).toEqual({ ...answered, otherAppsRunning: true });
    expect(second.environment.userReportedDevice).toBe(first.environment.userReportedDevice);
    expect(first.environment.userReportedDevice).toMatch(/^prolific:[0-9a-f]{12}$/);
    // The series has ended, so its stored answers are gone.
    expect(await page.evaluate(() => localStorage.getItem('localmode-bench-series-hardware'))).toBeNull();
    for (const run of [first, second]) {
      expect(run.cells.some((c) => c.status === 'ok')).toBe(true);
      expect(run.harness.coldStart, 'no clear happened, so no cold start is claimed').toBeUndefined();
    }
    await expect(listed.nth(0)).toContainText(first.runId);
    await expect(listed.nth(1)).toContainText(second.runId);

    await panel.getByRole('button', { name: 'Copy summary' }).click();
    const summary = await page.evaluate(() => navigator.clipboard.readText());
    expect(summary).toContain(`series ${first.harness.series!.id}`);
    expect(summary).toContain(`1. ${first.runId}`);
    expect(summary).toContain(`2. ${second.runId}`);

    // A finished series stays until closed, and is gone across a reload after that.
    await panel.getByRole('button', { name: 'Close series' }).click();
    await expect(page.getByRole('region', { name: 'Benchmark series' })).toHaveCount(0);
    await page.reload();
    await expect(page.getByText(/probing device capabilities/i)).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByRole('region', { name: 'Benchmark series' })).toHaveCount(0);
    // A new run on the study link asks again: the ended series took its answers with it.
    await expect(page.getByRole('button', { name: 'Run benchmark' })).toBeEnabled({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Run benchmark' }).click();
    await expect(hardwareDialog(page).getByLabel('Graphics card or chip')).toHaveValue('');
    await expect(hardwareDialog(page).getByRole('button', { name: 'Start benchmark' })).toBeDisabled();
    await expect(hardwareDialog(page).getByText(HARDWARE_REASON_ALL, { exact: true })).toBeVisible();
    await hardwareDialog(page).getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(askedOn).toHaveLength(2);
    expect(consoleErrors).toEqual([]);
  });

  test('a run that differs from the study link (an open series from an earlier visit) gets no code and the researcher message', async ({
    page,
  }) => {
    test.setTimeout(25 * 60 * 1000);
    const consoleErrors: string[] = [];
    collectConsoleErrors(page, consoleErrors);
    acceptLeavePrompts(page);
    // ALLOWLIST (documented, this lane only): the unbound dev store answers the
    // upload with 503 bench-store-unbound, which Chromium logs as a console
    // error. On a matching attempt-mode run that failed upload issues the code
    // (the quick-suite lane above), so the 503 is what makes the missing code
    // here a witness of the settings check. Scoped to status and URL.
    const expected503 = (e: string) => e.includes('503') && e.includes('/api/bench/submit');
    // An earlier, organic visit starts a series of 2 Quick runs with the quality lane off and publishing on...
    await page.goto('/bench/run?tier=quick&quality=off&runs=2&publish=on');
    await expect(page.getByRole('button', { name: 'Run benchmark' })).toBeEnabled({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Run benchmark' }).click();
    const overlay = page.getByRole('dialog', { name: /benchmark running/i });
    await expect(overlay.getByRole('group', { name: 'Series progress' })).toContainText('Series: run 1 of 2', { timeout: 20_000 });
    // ...and the participant then opens a study link that names the quality lane on, mid-run.
    await page.goto('/bench/run?tier=quick&quality=on&runs=2&publish=on&cc=TESTCODE1&PROLIFIC_PID=e2e-mismatch-pid');
    await expect(page.getByText(/probing device capabilities/i)).toHaveCount(0, { timeout: 15_000 });
    const panel = page.getByRole('region', { name: 'Benchmark series' });
    await expect(panel).toContainText(/did not finish/);
    // The open series dictates what runs; the controls show its settings, locked on the study link.
    const quality = page.getByRole('switch', { name: /quality-fidelity lane/i });
    await expect(quality).not.toBeChecked();
    await expect(quality).toBeDisabled();
    await expect(page.getByText('This study link fixes the suite and the run settings.')).toBeVisible();
    await panel.getByRole('button', { name: 'Continue series' }).click();
    await expect(overlay.getByRole('group', { name: 'Series progress' })).toContainText('Series: run 1 of 2', { timeout: 20_000 });
    await overlay.getByRole('button', { name: 'Stop series' }).click();
    await expect(panel).toContainText('Series stopped after 1 of 2 runs', { timeout: 15 * 60 * 1000 });
    // The run finished and its upload attempt resolved (503 here), yet no code: its quality setting is not the link's.
    await expect(page.getByRole('status').filter({ hasText: /results store is not configured/i })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole('alert').filter({ hasText: 'did not use the suite' })).toHaveText(
      'This run did not use the suite and quality-fidelity setting this study link names, so no completion code is issued. Please message the researcher with a screenshot of this page.',
    );
    await expect(page.getByRole('region', { name: /study completion code/i })).toHaveCount(0);
    await expect(page.getByText('TESTCODE1')).toHaveCount(0);
    // The run on the page is the series' Quick run without quality cells.
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export JSON' }).click();
    const exported = JSON.parse(readFileSync((await (await downloadPromise).path())!, 'utf8')) as ExportedRun;
    expect(exported.suite).toBe('quick');
    expect(exported.cells.filter((c) => c.cellId.split('/')[2].startsWith('quality-'))).toEqual([]);
    expect(consoleErrors.filter((e) => !expected503(e))).toEqual([]);
  });

  test('a series of 2 Quick runs with cooldown=1: the page idles a minute with a countdown before the reload', async ({
    page,
  }) => {
    test.setTimeout(35 * 60 * 1000);
    const consoleErrors: string[] = [];
    collectConsoleErrors(page, consoleErrors);
    await page.goto('/bench/run?tier=quick&quality=off&runs=2&cooldown=1&publish=off');
    const runButton = page.getByRole('button', { name: 'Run benchmark' });
    await expect(runButton).toBeEnabled({ timeout: 15_000 });
    await expect(page.getByRole('spinbutton', { name: 'Cool-down between runs' })).toHaveValue('1');
    const downloads = collectRunDownloads(page);
    // Wall-clock witnesses in the test process: when run 1's result was
    // handed over (its JSON download) and when the page reloaded.
    let firstResultAt: number | null = null;
    page.on('download', () => {
      if (firstResultAt === null) firstResultAt = Date.now();
    });
    const reloadTimes: number[] = [];
    page.on('load', () => reloadTimes.push(Date.now()));
    await runButton.click();

    const dialog = page.getByRole('dialog', { name: /benchmark running/i });
    await expect(dialog.getByRole('group', { name: 'Series progress' })).toContainText('Series: run 1 of 2', { timeout: 20_000 });

    // Run 1 finishes: the series box counts down to run 2 while the page stays loaded.
    const panel = page.getByRole('region', { name: 'Benchmark series' });
    await expect(panel.getByRole('status')).toContainText(/^Cooling down: [01]:\d\d until run 2 of 2$/, {
      timeout: 15 * 60 * 1000,
    });
    expect(firstResultAt, 'run 1 was exported before the cool-down').not.toBeNull();
    expect(reloadTimes, 'no reload while cooling down').toEqual([]);
    // The tab title keeps the series progress during the cool-down.
    await expect(page).toHaveTitle('2/2 · LocalMode Bench');
    // The countdown moves.
    const before = await panel.getByRole('status').textContent();
    await page.waitForTimeout(2_500);
    const after = await panel.getByRole('status').textContent();
    expect(after).not.toBe(before);

    // Run 2 starts by itself on the reloaded page after the cool-down.
    await expect(page.getByRole('dialog', { name: /benchmark running/i })
      .getByRole('group', { name: 'Series progress' })).toContainText('Series: run 2 of 2', { timeout: 3 * 60 * 1000 });
    const secondRunSeenAt = Date.now();
    expect(reloadTimes).toHaveLength(1);
    expect(reloadTimes[0] - firstResultAt!, 'the reload came no earlier than the 60 s cool-down').toBeGreaterThanOrEqual(60_000);

    await expect(panel).toContainText('Series complete: 2 of 2 runs', { timeout: 15 * 60 * 1000 });
    expect(reloadTimes, 'no reload after the last run').toHaveLength(1);
    expect(downloads).toHaveLength(2);
    const [first, second] = await Promise.all(downloads);
    expect(first.harness.series).toMatchObject({ index: 1, count: 2, cooldownMs: 60_000 });
    expect(first.harness.series!.idleBeforeMs).toBeUndefined();
    expect(second.harness.series).toMatchObject({ id: first.harness.series!.id, index: 2, count: 2, cooldownMs: 60_000 });
    expect(Number.isInteger(second.harness.series!.idleBeforeMs)).toBe(true);
    // Measured, not copied from the setting: the cool-down plus the 1.5 s
    // download grace plus the reload, and no longer than the gap the test
    // itself witnessed between run 1's result and run 2 on screen.
    expect(second.harness.series!.idleBeforeMs!).toBeGreaterThanOrEqual(61_500);
    expect(second.harness.series!.idleBeforeMs!).toBeLessThanOrEqual(secondRunSeenAt - firstResultAt! + 1_000);
    await expect(panel).toContainText('cool-down 1 min');
    expect(consoleErrors).toEqual([]);
  });

  test('Stop series during run 1 of 3 keeps exactly one run and never reloads', async ({ page }) => {
    test.setTimeout(20 * 60 * 1000);
    const consoleErrors: string[] = [];
    collectConsoleErrors(page, consoleErrors);
    await page.goto('/bench/run?runs=3&publish=off');
    const runButton = page.getByRole('button', { name: 'Run benchmark' });
    await expect(runButton).toBeEnabled({ timeout: 15_000 });
    const downloads = collectRunDownloads(page);
    const loads = countLoads(page);
    await runButton.click();
    const dialog = page.getByRole('dialog', { name: /benchmark running/i });
    await expect(dialog.getByRole('group', { name: 'Series progress' })).toContainText('Series: run 1 of 3', { timeout: 20_000 });
    await dialog.getByRole('button', { name: 'Stop series' }).click();
    await expect(dialog.getByRole('button', { name: 'Stopping after this run' })).toBeDisabled();
    await expect(dialog.getByRole('group', { name: 'Series progress' })).toContainText(/stops when this run finishes/);

    const panel = page.getByRole('region', { name: 'Benchmark series' });
    await expect(panel).toContainText('Series stopped after 1 of 3 runs', { timeout: 15 * 60 * 1000 });
    await expect(panel.getByRole('list', { name: 'Completed runs' }).getByRole('listitem')).toHaveCount(1);
    // Hold for longer than the series' reload delay: nothing else starts.
    await page.waitForTimeout(8_000);
    expect(loads.count).toBe(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(downloads).toHaveLength(1);
    const [only] = await Promise.all(downloads);
    expect(only.harness.series).toMatchObject({ index: 1, count: 3 });
    await expect(page.getByRole('table')).toBeVisible();
    await expect(page).toHaveTitle('Stopped 1/3 · LocalMode Bench');
    expect(consoleErrors).toEqual([]);
  });

  test('Clear model caches empties the provider caches; the next run loads cold and records it', async ({ page }) => {
    test.setTimeout(30 * 60 * 1000);
    const consoleErrors: string[] = [];
    collectConsoleErrors(page, consoleErrors);
    await page.goto('/bench/run?publish=off');
    const runButton = page.getByRole('button', { name: 'Run benchmark' });
    await expect(runButton).toBeEnabled({ timeout: 15_000 });
    const status = page.getByRole('status').first();

    const exportRun = async (): Promise<ExportedRun> => {
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Export JSON' }).click();
      const download = await downloadPromise;
      return JSON.parse(readFileSync((await download.path())!, 'utf8')) as ExportedRun;
    };

    // Run 1 fills the provider caches.
    await runButton.click();
    await expect(status).toContainText('Suite complete', { timeout: 540_000 });
    const warmSource = await exportRun();
    expect(warmSource.harness.coldStart).toBeUndefined();
    const before = await providerStorage(page);
    expect(before.caches).toContain('transformers-cache');
    expect(before.opfs?.length ?? 0, 'wllama cached its GGUF files in OPFS').toBeGreaterThan(0);
    expect(before.databases).toContain('localmode-bench-progress');

    await page.getByRole('button', { name: 'Clear model caches' }).click();
    const confirm = page.getByRole('alertdialog', { name: 'Clear model caches?' });
    await confirm.getByRole('button', { name: 'Clear caches' }).click();
    const report = page.getByRole('region', { name: 'Model caches cleared' });
    await expect(report).toContainText('Provider caches cleared', { timeout: 60_000 });
    const deleted = report.getByRole('list', { name: 'Deleted storage' });
    await expect(deleted).toContainText(/Cache API: .*transformers-cache \(\d+ files?\)/);
    await expect(deleted).toContainText(new RegExp(`Origin Private File System \\(wllama\\): ${before.opfs!.filter((n) => !n.startsWith('__metadata__')).length} model files?`));
    await expect(deleted).toContainText(/Storage used by this site: .* before, .* after/);
    await expect(report).toContainText(/Gemini Nano \(Chrome Built-in AI\) is browser-wide and was not affected/);
    await expect(report).toContainText(/not a fresh browser profile/);

    const after = await providerStorage(page);
    expect(after.caches.filter((n) => n === 'transformers-cache' || n === 'litert-models' || n.startsWith('webllm/'))).toEqual([]);
    expect(after.databases.filter((n) => n.startsWith('webllm/'))).toEqual([]);
    expect(after.opfs, "wllama's OPFS directory is gone").toBeNull();
    // The bench's own crash-recovery database is never deleted.
    expect(after.databases).toContain('localmode-bench-progress');

    // Run 2 loads every cached model cold and says why.
    await runButton.click();
    await expect(page.getByRole('dialog', { name: /benchmark running/i })).toBeVisible({ timeout: 20_000 });
    await expect(status).toContainText('Suite complete', { timeout: 540_000 });
    const cold = await exportRun();
    expect(cold.harness.coldStart).toBe('provider-caches-cleared');
    expect(cold.harness.series).toBeUndefined();
    const probed = cold.cells.filter(
      (c) => c.load && typeof c.load.cached === 'boolean' && (c.runtimeId === 'transformers-wasm' || c.runtimeId === 'wllama'),
    );
    expect(probed.map((c) => c.runtimeId)).toEqual(expect.arrayContaining(['transformers-wasm', 'wllama']));
    for (const c of probed) expect(c.load!.cached, `${c.cellId} loaded cold`).toBe(false);
    // The same lanes were warm-cached before the clear: run 1's files were in the caches above.
    expect(consoleErrors).toEqual([]);
  });
});

/**
 * Full-completion study mode (`ccmode=full`): the completion code shows only
 * for a run that finished with every cell attempted and uploaded; an
 * interruption restarts the run by itself (at most 3 times, and not after
 * two interruptions in a row at the same cell); a Stop asks first and issues
 * no code. A successful upload needs a bound results store,
 * so this block starts a second `next start` of the same production build
 * with the store bound to a local GitHub-compatible endpoint
 * (`BENCH_GITHUB_API_URL`). Everything from the page through the submit
 * route (nonce, digest, shape validation, scrub, store calls) runs unmodified;
 * only GitHub itself is replaced, which is the store's documented mock layer.
 * The endpoint holds each run-file commit for COMMIT_DELAY_MS so the page is
 * observably waiting on the upload while the code must still be absent. The
 * bound server signs nonces with E2E_NONCE_SECRET, as production does, so the
 * long-run lane can hand the page a correctly signed nonce issued 25 hours
 * earlier. The
 * upload-failure lane uses the default (unbound) server, which answers 503.
 * Interruptions are real page reloads after the first cell started; the
 * participant's "Leave" answer to the browser's leave-page prompt is given.
 */
const FULL_STUDY_LINK =
  '/bench/run?tier=quick&quality=off&runs=1&cold=off&publish=on&cc=TESTCODE1&ccmode=full&PROLIFIC_PID=e2e-full-pid&STUDY_ID=e2e-study&SESSION_ID=e2e-session';
const FULL_MODE_HINT =
  'Your completion code appears when the whole run has finished and uploaded. If it is interrupted, this page restarts it by itself.';
const ATTEMPT_CAP_TEXT =
  'The run could not finish after 4 attempts. Please message the researcher with a screenshot of this page; you are paid for the attempt.';
const SAME_CELL_CAP_TEXT =
  'The run could not finish after 2 attempts: both stopped at the same step. Please message the researcher with a screenshot of this page; you are paid for the attempt.';
const EXPIRED_NONCE_MESSAGE =
  'The session token of this upload is missing or has expired. The bench page fetches a new token and tries the upload again by itself; if it still fails, export the run as JSON.';
/** The bound server's nonce key: known to the test so it can sign a nonce with an old timestamp. */
const E2E_NONCE_SECRET = 'e2e-bench-nonce-secret';

/** A nonce as `issueNonce()` signs it, issued at `issuedAtMs`. */
function signedNonce(issuedAtMs: number): string {
  const payload = String(issuedAtMs);
  return `${payload}.${createHmac('sha256', E2E_NONCE_SECRET).update(payload).digest('hex')}`;
}
const UPLOAD_FAILED_TEXT =
  'The run finished but the upload did not go through. Export the result and message the researcher with it; you are paid for the attempt.';
const STOP_CONFIRM_TEXT =
  'The study pays only for a finished run. If you stop now, no completion code is issued; reopening the link starts the run again from the beginning.';
const COMMIT_DELAY_MS = 4_000;
const FULL_ANSWERS = { gpu: 'Intel Iris Xe Graphics', chassis: 'Laptop', ram: '16 GB', otherApps: 'No' } as const;

async function freePort(): Promise<number> {
  const srv = net.createServer();
  await new Promise<void>((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const { port } = srv.address() as net.AddressInfo;
  await new Promise<void>((resolve) => srv.close(() => resolve()));
  return port;
}

/** What the local GitHub-compatible endpoint received. */
interface FakeGitHub {
  server: http.Server;
  port: number;
  commits: Array<{ path: string; run: ExportedRun & { digest?: string } }>;
}

/** Answers the store's calls as GitHub does: 404 for the absent index, 201 for created files. */
async function startFakeGitHub(): Promise<FakeGitHub> {
  const commits: FakeGitHub['commits'] = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const match = /^\/repos\/e2e\/bench-data\/contents\/(.+)$/.exec(req.url ?? '');
      if (req.method === 'PUT' && match) {
        const filePath = match[1];
        const content = JSON.parse(Buffer.from((JSON.parse(body) as { content: string }).content, 'base64').toString('utf8'));
        const isRunFile = /^(runs|quarantine)\//.test(filePath);
        setTimeout(
          () => {
            if (isRunFile) commits.push({ path: filePath, run: content as FakeGitHub['commits'][number]['run'] });
            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end('{}');
          },
          isRunFile ? COMMIT_DELAY_MS : 0,
        );
        return;
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end('{"message":"Not Found"}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, port: (server.address() as net.AddressInfo).port, commits };
}

/** A second `next start` of this build with the results store bound to the local endpoint. */
async function startBoundServer(githubPort: number): Promise<{ proc: ChildProcess; origin: string; log: string[] }> {
  const appDir = path.resolve(__dirname, '..', '..');
  if (!existsSync(path.join(appDir, '.next', 'BUILD_ID'))) {
    throw new Error('The full-completion lanes start `next start` on this build: run `next build` in apps/ui first.');
  }
  const port = await freePort();
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    BENCH_GITHUB_REPO: 'e2e/bench-data',
    BENCH_GITHUB_TOKEN: 'e2e-token',
    BENCH_GITHUB_API_URL: `http://127.0.0.1:${githubPort}`,
  };
  // Signed nonces, as in production; the in-instance rate limit and nonce set (no Redis here).
  env.BENCH_NONCE_SECRET = E2E_NONCE_SECRET;
  for (const key of ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_URL', 'KV_REST_API_TOKEN']) {
    delete env[key];
  }
  const log: string[] = [];
  const proc = spawn(path.join(appDir, 'node_modules', '.bin', 'next'), ['start', '-p', String(port)], { cwd: appDir, env });
  proc.stdout?.on('data', (d) => log.push(String(d)));
  proc.stderr?.on('data', (d) => log.push(String(d)));
  const origin = `http://localhost:${port}`;
  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      const res = await fetch(`${origin}/api/bench/nonce`);
      if (res.ok) break;
    } catch {
      // Not listening yet.
    }
    if (Date.now() > deadline || proc.exitCode !== null) {
      proc.kill();
      throw new Error(`bound next start did not come up on ${origin}:\n${log.join('')}`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return { proc, origin, log };
}

/** The participant answers "Leave" to the leave-page prompt a running benchmark raises on reload. */
function acceptLeavePrompts(page: Page) {
  page.on('dialog', (dialog) => {
    if (dialog.type() === 'beforeunload') void dialog.accept();
    else void dialog.dismiss();
  });
}

/** The full-mode attempt count as the page stored it. */
interface StoredAttempt {
  attempts: number;
  inFlight: boolean;
  capped: boolean;
  runIndex: number;
  partialAttemptId?: string;
  lastInterruptedCellId?: string;
  capReason?: string;
}

async function storedAttempt(page: Page): Promise<StoredAttempt | null> {
  const raw = await page.evaluate(() => localStorage.getItem('localmode-bench-series-attempts'));
  return raw ? (JSON.parse(raw) as StoredAttempt) : null;
}

/** The cell the page's progress record (IndexedDB) names as in progress for the attempt in flight. */
async function recordedCell(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const raw = localStorage.getItem('localmode-bench-series-attempts');
    const id = raw ? (JSON.parse(raw) as { partialAttemptId?: string }).partialAttemptId : undefined;
    if (!id) return null;
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('localmode-bench-progress');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    try {
      const record = await new Promise<{ currentCellId?: string } | undefined>((resolve, reject) => {
        const req = db.transaction('attempts', 'readonly').objectStore('attempts').get(id);
        req.onsuccess = () => resolve(req.result as { currentCellId?: string } | undefined);
        req.onerror = () => reject(req.error);
      });
      return record?.currentCellId ?? null;
    } finally {
      db.close();
    }
  });
}

/** Open the study link, press Run benchmark, answer the four questions, and start. */
async function startFullStudyRun(page: Page, url: string) {
  await page.goto(url);
  const runButton = page.getByRole('button', { name: 'Run benchmark' });
  await expect(page.getByText(/probing device capabilities/i)).toHaveCount(0, { timeout: 15_000 });
  await expect(runButton).toBeEnabled({ timeout: 15_000 });
  await runButton.click();
  const ask = hardwareDialog(page);
  await expect(ask).toBeVisible();
  await answerHardware(ask, FULL_ANSWERS);
  await ask.getByRole('button', { name: 'Start benchmark' }).click();
  await expect(page.getByRole('dialog', { name: /benchmark running/i })).toBeVisible({ timeout: 20_000 });
}

/** Every first appearance of the completion-code region, timed in the test process. */
async function watchCodeRegion(page: Page): Promise<number[]> {
  const shownAt: number[] = [];
  await page.exposeFunction('__benchCodeShown', () => shownAt.push(Date.now()));
  await page.addInitScript(() => {
    const seen = new WeakSet<Element>();
    new MutationObserver(() => {
      for (const el of document.querySelectorAll('[role="region"][aria-label="Study completion code"]')) {
        if (seen.has(el)) continue;
        seen.add(el);
        void (window as unknown as { __benchCodeShown: () => Promise<void> }).__benchCodeShown();
      }
    }).observe(document, { childList: true, subtree: true });
  });
  return shownAt;
}

test.describe('full-completion study mode (ccmode=full)', () => {
  let github: FakeGitHub;
  let bound: { proc: ChildProcess; origin: string; log: string[] };

  test.beforeAll(async () => {
    github = await startFakeGitHub();
    bound = await startBoundServer(github.port);
  });

  test.afterAll(async () => {
    bound?.proc.kill();
    await new Promise<void>((resolve) => (github ? github.server.close(() => resolve()) : resolve()));
  });

  test('a finished run shows the code only after its upload succeeded', async ({ page }) => {
    test.setTimeout(20 * 60 * 1000);
    const consoleErrors: string[] = [];
    collectConsoleErrors(page, consoleErrors);
    const codeShownAt = await watchCodeRegion(page);
    const submitResponses: Array<{ at: number; status: number }> = [];
    page.on('response', (res) => {
      if (res.url().endsWith('/api/bench/submit')) submitResponses.push({ at: Date.now(), status: res.status() });
    });
    const commitsBefore = github.commits.length;

    await page.goto(`${bound.origin}${FULL_STUDY_LINK}`);
    await expect(page.getByText(/probing device capabilities/i)).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByText(`Paid study session detected. ${FULL_MODE_HINT} Keep this tab open until then.`)).toBeVisible();
    // The study pays for an uploaded run: publishing is on and cannot be switched off on this link.
    const publish = page.getByRole('switch', { name: /publish results/i });
    await expect(publish).toBeChecked();
    await expect(publish).toBeDisabled();
    // The suite and the run settings are the link's, and fixed.
    await expect(page.getByRole('combobox', { name: 'Suite' })).toContainText('Quick');
    await expect(page.getByRole('combobox', { name: 'Suite' })).toBeDisabled();
    await expect(page.getByRole('switch', { name: /quality-fidelity lane/i })).toBeDisabled();
    await expect(page.getByText('This study link fixes the suite and the run settings.')).toBeVisible();
    // The link presets keep the mode in the generated link.
    await page.getByText('Link presets').click();
    await expect(page.getByText('/bench/run?tier=quick&quality=off&runs=1&cooldown=0&cold=off&publish=on&ccmode=full')).toBeVisible();
    await expect(page.getByRole('region', { name: /study completion code/i })).toHaveCount(0);

    const runButton = page.getByRole('button', { name: 'Run benchmark' });
    await runButton.click();
    await answerHardware(hardwareDialog(page), FULL_ANSWERS);
    await hardwareDialog(page).getByRole('button', { name: 'Start benchmark' }).click();
    const overlay = page.getByRole('dialog', { name: /benchmark running/i });
    await expect(overlay).toBeVisible({ timeout: 20_000 });
    await expect(overlay.getByRole('alert')).toContainText(FULL_MODE_HINT);
    await expect(overlay).toContainText(
      'Attempt 1 of at most 4 · an interrupted run restarts by itself, up to 3 times, and stops if it is interrupted twice in a row at the same step',
    );
    await expect(page.getByRole('region', { name: /study completion code/i })).toHaveCount(0);
    expect(await storedAttempt(page)).toMatchObject({ attempts: 1, inFlight: true, capped: false, runIndex: 1 });

    const status = page.getByRole('status').first();
    await expect(status).toContainText(/Running /, { timeout: 120_000 });
    await expect(page.getByRole('region', { name: /study completion code/i })).toHaveCount(0);
    await expect(status).toContainText('Suite complete', { timeout: 540_000 });
    await expect(overlay).toHaveCount(0);
    // The local endpoint holds the commit: the page waits on the upload and shows no code yet.
    await expect(page.getByText('Publishing to the leaderboard…')).toBeVisible();
    await expect(page.getByRole('region', { name: /study completion code/i })).toHaveCount(0);

    const codeRegion = page.getByRole('region', { name: /study completion code/i });
    await expect(codeRegion).toBeVisible({ timeout: 60_000 });
    await expect(codeRegion).toContainText('TESTCODE1');
    await expect(codeRegion).toContainText('Enter it on Prolific to finish the study.');
    await expect(page.getByText(/^Submitted/)).toBeVisible();

    // Witnesses: one successful upload, answered before the code first appeared, and
    // the run file it committed is the run on this page.
    expect(submitResponses.map((r) => r.status)).toEqual([200]);
    expect(codeShownAt).toHaveLength(1);
    expect(codeShownAt[0]).toBeGreaterThanOrEqual(submitResponses[0].at);
    expect(github.commits.length).toBe(commitsBefore + 1);
    const committed = github.commits[github.commits.length - 1].run;
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export JSON' }).click();
    const exported = JSON.parse(readFileSync((await (await downloadPromise).path())!, 'utf8')) as ExportedRun;
    expect(committed.runId).toBe(exported.runId);
    // The uploaded run is the suite the link names (tier=quick), with its quality setting (quality=off).
    expect(new URLSearchParams(FULL_STUDY_LINK.split('?')[1]).get('tier')).toBe('quick');
    expect(committed.suite).toBe('quick');
    expect(exported.suite).toBe('quick');
    expect(committed.cells.filter((c) => c.cellId.split('/')[2].startsWith('quality-'))).toEqual([]);
    expect(committed.environment.userReportedHardware).toEqual({ gpu: 'Intel Iris Xe Graphics', chassis: 'laptop', ramGB: 16, otherAppsRunning: false });
    expect(exported.cells.some((c) => c.status === 'ok')).toBe(true);
    // The run finished: nothing is left to restart.
    expect(await storedAttempt(page)).toBeNull();
    expect(consoleErrors).toEqual([]);
  });

  test('a reload mid-run restarts the run by itself (attempt 2, no dialog), which then finishes, uploads and shows the code', async ({
    page,
  }) => {
    test.setTimeout(25 * 60 * 1000);
    const consoleErrors: string[] = [];
    collectConsoleErrors(page, consoleErrors);
    acceptLeavePrompts(page);
    const askedOn: string[] = [];
    await page.exposeFunction('__benchHardwareDialogShown', (title: string) => askedOn.push(title));
    await page.addInitScript(() => {
      const seen = new WeakSet<Element>();
      new MutationObserver(() => {
        for (const el of document.querySelectorAll('[role="dialog"]')) {
          const titleId = el.getAttribute('aria-labelledby');
          const title = titleId ? document.getElementById(titleId)?.textContent : null;
          if (title === 'About this computer' && !seen.has(el)) {
            seen.add(el);
            void (window as unknown as { __benchHardwareDialogShown: (t: string) => Promise<void> }).__benchHardwareDialogShown(
              document.title,
            );
          }
        }
      }).observe(document, { childList: true, subtree: true });
    });
    const submitted: string[] = [];
    page.on('request', (req) => {
      if (req.url().endsWith('/api/bench/submit') && req.method() === 'POST') submitted.push(req.postData() ?? '');
    });

    await startFullStudyRun(page, `${bound.origin}${FULL_STUDY_LINK}`);
    const status = page.getByRole('status').first();
    await expect(status).toContainText(/Running /, { timeout: 120_000 });
    expect(await storedAttempt(page)).toMatchObject({ attempts: 1, inFlight: true });
    const loads = countLoads(page);
    await page.reload();

    // No click: the run starts again by itself on the reloaded page, without asking about the hardware.
    const overlay = page.getByRole('dialog', { name: /benchmark running/i });
    await expect(overlay).toBeVisible({ timeout: 30_000 });
    await expect(overlay).toContainText('Attempt 2 of at most 4');
    expect(loads.count).toBe(1);
    expect(await storedAttempt(page)).toMatchObject({ attempts: 2, inFlight: true });
    await expect(hardwareDialog(page)).toHaveCount(0);
    expect(askedOn, 'the dialog was shown once, before attempt 1').toHaveLength(1);
    const runForm = overlay.getByRole('group', { name: HARDWARE_FORM });
    await expect(runForm.getByLabel('Graphics card or chip')).toHaveValue('Intel Iris Xe Graphics');
    await expect(runForm.getByRole('radio', { name: 'Laptop' })).toBeChecked();
    await expect(page.getByRole('region', { name: /study completion code/i })).toHaveCount(0);

    await expect(status).toContainText('Suite complete', { timeout: 540_000 });
    const codeRegion = page.getByRole('region', { name: /study completion code/i });
    await expect(codeRegion).toBeVisible({ timeout: 60_000 });
    await expect(codeRegion).toContainText('TESTCODE1');
    expect(submitted, 'only the finished attempt uploaded').toHaveLength(1);
    const uploaded = JSON.parse(submitted[0]) as ExportedRun;
    expect(uploaded.environment.userReportedHardware).toEqual({ gpu: 'Intel Iris Xe Graphics', chassis: 'laptop', ramGB: 16, otherAppsRunning: false });
    expect(github.commits.some((c) => c.run.runId === uploaded.runId)).toBe(true);
    expect(await storedAttempt(page)).toBeNull();
    // The interrupted attempt left its partial record, as any page that went away mid-run does.
    await expect(page.getByRole('region', { name: /unfinished run recovered/i })).toContainText(/quick suite · \d+ of \d+ cells finished/);
    expect(loads.count, 'no further reload').toBe(1);
    expect(consoleErrors).toEqual([]);
  });

  test('Stop asks first; a confirmed Stop issues no code, and reopening the link starts again at attempt 1', async ({ page }) => {
    test.setTimeout(10 * 60 * 1000);
    const consoleErrors: string[] = [];
    collectConsoleErrors(page, consoleErrors);
    const submitted: string[] = [];
    page.on('request', (req) => {
      if (req.url().endsWith('/api/bench/submit')) submitted.push(req.url());
    });
    await startFullStudyRun(page, `${bound.origin}${FULL_STUDY_LINK}`);
    const overlay = page.getByRole('dialog', { name: /benchmark running/i });
    const status = page.getByRole('status').first();
    await expect(status).toContainText(/Running /, { timeout: 120_000 });

    await overlay.getByRole('button', { name: 'Cancel run' }).click();
    const confirm = page.getByRole('alertdialog', { name: 'Stop the run?' });
    await expect(confirm).toBeVisible();
    await expect(confirm).toHaveAccessibleDescription(STOP_CONFIRM_TEXT);
    // Keep running closes the question and the run goes on.
    await confirm.getByRole('button', { name: 'Keep running' }).click();
    await expect(confirm).toHaveCount(0);
    await expect(overlay).toBeVisible();
    await expect(overlay.getByRole('button', { name: 'Cancel run' })).toBeEnabled();

    await overlay.getByRole('button', { name: 'Cancel run' }).click();
    await confirm.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(overlay).toHaveCount(0, { timeout: 120_000 });
    await expect(page.getByRole('status').first()).toHaveText('Cancelled');
    await expect(
      page.getByText('The run was stopped, so no completion code is issued. Reopening the link starts the run again from the beginning.'),
    ).toBeVisible();
    await expect(page.getByRole('region', { name: /study completion code/i })).toHaveCount(0);
    await expect(page.getByText('TESTCODE1')).toHaveCount(0);
    // As before: a cancelled run uploads nothing and leaves no partial record behind.
    expect(submitted).toEqual([]);
    await expect(page.getByRole('region', { name: /unfinished run recovered/i })).toHaveCount(0);
    expect(await storedAttempt(page)).toBeNull();

    // Reopening the link restarts nothing by itself; Run starts again from the beginning, at attempt 1.
    await page.goto(`${bound.origin}${FULL_STUDY_LINK}`);
    await expect(page.getByRole('button', { name: 'Run benchmark' })).toBeEnabled({ timeout: 15_000 });
    await page.waitForTimeout(5_000);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('region', { name: /unfinished run recovered/i })).toHaveCount(0);
    await page.getByRole('button', { name: 'Run benchmark' }).click();
    await expect(hardwareDialog(page).getByLabel('Graphics card or chip')).toHaveValue('');
    await answerHardware(hardwareDialog(page), FULL_ANSWERS);
    await hardwareDialog(page).getByRole('button', { name: 'Start benchmark' }).click();
    await expect(overlay).toContainText('Attempt 1 of at most 4', { timeout: 20_000 });
    await expect(overlay).toContainText(/Quick suite · 0 of \d+ steps done/);
    expect(await storedAttempt(page)).toMatchObject({ attempts: 1, inFlight: true });
    await overlay.getByRole('button', { name: 'Cancel run' }).click();
    await page.getByRole('alertdialog', { name: 'Stop the run?' }).getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(overlay).toHaveCount(0, { timeout: 120_000 });
    expect(submitted).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('two interruptions in a row at the same cell stop the run after attempt 2: cap message, no code, Export JSON', async ({ page }) => {
    test.setTimeout(15 * 60 * 1000);
    const consoleErrors: string[] = [];
    collectConsoleErrors(page, consoleErrors);
    acceptLeavePrompts(page);
    const submitted: string[] = [];
    page.on('request', (req) => {
      if (req.url().endsWith('/api/bench/submit')) submitted.push(req.url());
    });
    await startFullStudyRun(page, `${bound.origin}${FULL_STUDY_LINK}`);
    const overlay = page.getByRole('dialog', { name: /benchmark running/i });
    const status = page.getByRole('status').first();
    // Both attempts are interrupted while the first cell runs, as on a device that dies at the same model every
    // time. The cell is the one the page's progress record names, which is what the restart rule reads.
    await expect(status).toContainText(/Running /, { timeout: 120_000 });
    const firstCell = (await recordedCell(page)) ?? '';
    expect(firstCell).not.toBe('');
    for (let attempt = 1; attempt <= 2; attempt++) {
      await expect(overlay).toContainText(`Attempt ${attempt} of at most 4`, { timeout: 30_000 });
      await expect.poll(() => recordedCell(page), { timeout: 120_000 }).toBe(firstCell);
      expect(await storedAttempt(page)).toMatchObject({ attempts: attempt, inFlight: true, capped: false });
      await page.reload();
    }

    const cap = page.getByRole('alert', { name: SAME_CELL_CAP_TEXT });
    await expect(cap).toBeVisible({ timeout: 30_000 });
    expect(await storedAttempt(page)).toMatchObject({
      attempts: 2,
      inFlight: false,
      capped: true,
      capReason: 'same-cell',
      lastInterruptedCellId: firstCell,
    });
    // Nothing starts again, and the Run button stays off.
    await page.waitForTimeout(8_000);
    await expect(overlay).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Run benchmark' })).toBeDisabled();
    await expect(page.getByRole('region', { name: /study completion code/i })).toHaveCount(0);
    await expect(page.getByText('TESTCODE1')).toHaveCount(0);
    expect(submitted).toEqual([]);
    // The two interrupted attempts are on record, and Export JSON saves the newest, which names the cell.
    const recovered = page.getByRole('region', { name: /unfinished run recovered/i });
    await expect(recovered.getByRole('button', { name: 'Export partial run' })).toHaveCount(2);
    const downloadPromise = page.waitForEvent('download');
    await cap.getByRole('button', { name: 'Export JSON' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^localmode-bench-partial-.*\.json$/);
    const partial = JSON.parse(readFileSync((await download.path())!, 'utf8')) as {
      partial: boolean;
      suite: string;
      currentCellId: string | null;
    };
    expect(partial.partial).toBe(true);
    expect(partial.suite).toBe('quick');
    expect(partial.currentCellId).toBe(firstCell);
    // The cap holds on every later load of the same link.
    await page.reload();
    await expect(page.getByRole('alert', { name: SAME_CELL_CAP_TEXT })).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(5_000);
    await expect(overlay).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });

  test('interruptions at a different cell each time restart up to the cap of 4 attempts, then stop with the cap message', async ({
    page,
  }) => {
    test.setTimeout(25 * 60 * 1000);
    const consoleErrors: string[] = [];
    collectConsoleErrors(page, consoleErrors);
    acceptLeavePrompts(page);
    const submitted: string[] = [];
    page.on('request', (req) => {
      if (req.url().endsWith('/api/bench/submit')) submitted.push(req.url());
    });
    await startFullStudyRun(page, `${bound.origin}${FULL_STUDY_LINK}`);
    const overlay = page.getByRole('dialog', { name: /benchmark running/i });
    const status = page.getByRole('status').first();
    // Odd attempts are interrupted in the first cell, even ones in a later cell: never the same cell twice in a
    // row. The cell is the one the page's progress record names, which is what the restart rule reads.
    await expect(status).toContainText(/Running /, { timeout: 120_000 });
    const firstCell = (await recordedCell(page)) ?? '';
    expect(firstCell).not.toBe('');
    const interruptedAt: string[] = [];
    for (let attempt = 1; attempt <= 4; attempt++) {
      await expect(overlay).toContainText(`Attempt ${attempt} of at most 4`, { timeout: 30_000 });
      // The reloaded page recorded the previous interruption at the cell it was on.
      if (attempt > 1) expect((await storedAttempt(page))?.lastInterruptedCellId).toBe(interruptedAt[attempt - 2]);
      let cell: string | null;
      if (attempt % 2 === 1) {
        await expect.poll(() => recordedCell(page), { timeout: 120_000 }).toBe(firstCell);
        cell = firstCell;
      } else {
        await expect
          .poll(async () => {
            const current = await recordedCell(page);
            return current !== null && current !== firstCell;
          }, { timeout: 300_000 })
          .toBe(true);
        cell = await recordedCell(page);
      }
      expect(await storedAttempt(page)).toMatchObject({ attempts: attempt, inFlight: true, capped: false });
      interruptedAt.push(cell ?? '');
      await page.reload();
    }
    expect(interruptedAt[1]).not.toBe(interruptedAt[0]);
    expect(interruptedAt[2]).toBe(interruptedAt[0]);
    expect(interruptedAt[3]).not.toBe(interruptedAt[2]);

    const cap = page.getByRole('alert', { name: ATTEMPT_CAP_TEXT });
    await expect(cap).toBeVisible({ timeout: 30_000 });
    expect(await storedAttempt(page)).toMatchObject({ attempts: 4, inFlight: false, capped: true, capReason: 'attempts' });
    // Nothing starts again, and the Run button stays off.
    await page.waitForTimeout(8_000);
    await expect(overlay).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Run benchmark' })).toBeDisabled();
    await expect(page.getByRole('region', { name: /study completion code/i })).toHaveCount(0);
    await expect(page.getByText('TESTCODE1')).toHaveCount(0);
    expect(submitted).toEqual([]);
    // The four interrupted attempts are on record, and Export JSON saves the newest.
    const recovered = page.getByRole('region', { name: /unfinished run recovered/i });
    await expect(recovered.getByRole('button', { name: 'Export partial run' })).toHaveCount(4);
    const downloadPromise = page.waitForEvent('download');
    await cap.getByRole('button', { name: 'Export JSON' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^localmode-bench-partial-.*\.json$/);
    const partial = JSON.parse(readFileSync((await download.path())!, 'utf8')) as {
      partial: boolean;
      suite: string;
      currentCellId: string | null;
    };
    expect(partial.partial).toBe(true);
    expect(partial.suite).toBe('quick');
    // The newest attempt names the cell it was interrupted at (it may have died before finishing any cell).
    expect(partial.currentCellId).toBe(interruptedAt[3]);
    // The cap holds on every later load of the same link.
    await page.reload();
    await expect(page.getByRole('alert', { name: ATTEMPT_CAP_TEXT })).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(5_000);
    await expect(overlay).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });

  test.describe('a run that outlives its start nonce', () => {
    // The site's service worker claims the page and fetches /api/bench itself
    // (network only), and Playwright cannot route a request a service worker
    // makes; without it the page's own fetches reach page.route. The nonce and
    // submit requests take the same path to the server either way.
    test.use({ serviceWorkers: 'block' });

    test('a run whose start nonce expired uploads with a nonce fetched right before the submit', async ({ page }) => {
      test.setTimeout(20 * 60 * 1000);
      const consoleErrors: string[] = [];
      collectConsoleErrors(page, consoleErrors);
      // The page fetches a nonce when the run starts. A Thorough run on a slow
      // device can take most of a day, so the run-start fetch is answered with a
      // nonce the bound server's key signed 25 hours ago: its age is what this
      // lane is about, the run itself is a real Quick run. Every later fetch
      // reaches the server unchanged.
      const expired = signedNonce(Date.now() - 25 * 3600_000);
      let nonceFetches = 0;
      await page.route(`${bound.origin}/api/bench/nonce`, async (route) => {
        nonceFetches += 1;
        if (nonceFetches === 1) await route.fulfill({ json: { nonce: expired }, headers: { 'Cache-Control': 'no-store' } });
        else await route.continue();
      });
      const traffic: Array<{ kind: 'nonce' | 'submit'; at: number; nonce?: string; status?: number }> = [];
      const pending: Array<Promise<void>> = [];
      page.on('response', (res) => {
        const url = res.url();
        const at = Date.now();
        if (url === `${bound.origin}/api/bench/nonce`) {
          const entry: (typeof traffic)[number] = { kind: 'nonce', at };
          traffic.push(entry);
          pending.push(res.json().then((b: { nonce: string }) => void (entry.nonce = b.nonce)));
        } else if (url === `${bound.origin}/api/bench/submit`) {
          const posted = JSON.parse(res.request().postData() ?? '{}') as { nonce?: string };
          traffic.push({ kind: 'submit', at, nonce: posted.nonce, status: res.status() });
        }
      });
      const commitsBefore = github.commits.length;

      await startFullStudyRun(page, `${bound.origin}${FULL_STUDY_LINK}`);
      const status = page.getByRole('status').first();
      await expect(status).toContainText('Suite complete', { timeout: 540_000 });
      const codeRegion = page.getByRole('region', { name: /study completion code/i });
      await expect(codeRegion).toBeVisible({ timeout: 60_000 });
      await expect(codeRegion).toContainText('TESTCODE1');
      await expect(page.getByText(UPLOAD_FAILED_TEXT)).toHaveCount(0);
      await Promise.all(pending);

      // The run started on the expired nonce; the upload carried the one fetched just before it.
      expect(nonceFetches, 'both nonce requests went through the route').toBe(2);
      expect(traffic.map((t) => t.kind)).toEqual(['nonce', 'nonce', 'submit']);
      expect(traffic[0].nonce).toBe(expired);
      expect(traffic[1].nonce).toMatch(/^\d+\.[0-9a-f]{64}$/);
      expect(traffic[1].nonce).not.toBe(expired);
      expect(traffic[2]).toMatchObject({ status: 200, nonce: traffic[1].nonce });
      expect(traffic[2].at).toBeGreaterThanOrEqual(traffic[1].at);
      expect(github.commits.length).toBe(commitsBefore + 1);
      const committed = github.commits[github.commits.length - 1].run;

      // The run kept on the page still carries its start nonce; the digest, which
      // does not cover the nonce, is the one the dataset received.
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Export JSON' }).click();
      const exportedText = readFileSync((await (await downloadPromise).path())!, 'utf8');
      const exported = JSON.parse(exportedText) as ExportedRun & { nonce?: string; digest?: string };
      expect(exported.nonce).toBe(expired);
      expect(committed.runId).toBe(exported.runId);
      expect(committed.digest).toBe(exported.digest);
      // Without the fresh nonce the same upload is refused, with the message that says the page retries.
      const direct = await page.request.post(`${bound.origin}/api/bench/submit`, {
        data: exportedText,
        headers: { 'Content-Type': 'application/json' },
      });
      expect(direct.status()).toBe(403);
      expect(await direct.json()).toEqual({ ok: false, code: 'invalid-nonce', message: EXPIRED_NONCE_MESSAGE });
      expect(github.commits.length).toBe(commitsBefore + 1);
      expect(consoleErrors).toEqual([]);
    });
  });

  test('a finished run whose upload fails shows the researcher message, Export JSON, and no code', async ({ page }) => {
    test.setTimeout(20 * 60 * 1000);
    const consoleErrors: string[] = [];
    collectConsoleErrors(page, consoleErrors);
    // ALLOWLIST (documented, this lane only): the default server's results store is
    // unbound, so the submit answers 503 bench-store-unbound, which is the failure
    // this lane is about. Chromium logs every non-2xx fetch as a console error;
    // scoped to status + URL, any other console error still fails.
    const expected503 = (e: string) => e.includes('503') && e.includes('/api/bench/submit');
    await startFullStudyRun(page, FULL_STUDY_LINK);
    const status = page.getByRole('status').first();
    await expect(status).toContainText('Suite complete', { timeout: 540_000 });
    await expect(page.getByText(/results store is not configured/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('alert').filter({ hasText: UPLOAD_FAILED_TEXT })).toBeVisible();
    await expect(page.getByRole('region', { name: /study completion code/i })).toHaveCount(0);
    await expect(page.getByText('TESTCODE1')).toHaveCount(0);
    const exportButton = page.getByRole('button', { name: 'Export JSON' });
    await expect(exportButton).toBeVisible();
    const downloadPromise = page.waitForEvent('download');
    await exportButton.click();
    const exported = JSON.parse(readFileSync((await (await downloadPromise).path())!, 'utf8')) as ExportedRun;
    expect(exported.cells.some((c) => c.status === 'ok')).toBe(true);
    expect(exported.environment.userReportedDevice).toMatch(/^prolific:[0-9a-f]{12}$/);
    // The run finished, so it is not restarted: nothing left in flight.
    expect(await storedAttempt(page)).toBeNull();
    expect(consoleErrors.filter((e) => !expected503(e))).toEqual([]);
  });
});
