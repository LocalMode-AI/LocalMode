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
 * Stop series mid-run, and Clear model caches checked against the browser's
 * own storage listings before the next run loads cold. Selectors are
 * role/label/text only.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type ConsoleMessage, type Page, type Request } from '@playwright/test';

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
  harness: { series?: { id: string; index: number; count: number }; coldStart?: string };
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
    await page.goto('/bench/run?tier=standard&quality=on&runs=3&cold=on&publish=off');
    const runButton = page.getByRole('button', { name: 'Run benchmark' });
    await expect(runButton).toBeEnabled({ timeout: 15_000 });
    await expect(page.getByRole('combobox', { name: 'Suite' })).toContainText('Standard');
    await expect(page.getByRole('switch', { name: /quality-fidelity lane/i })).toBeChecked();
    await expect(page.getByRole('spinbutton', { name: 'Runs' })).toHaveValue('3');
    await expect(page.getByRole('switch', { name: 'Clear caches after each run' })).toBeChecked();
    await expect(page.getByRole('switch', { name: /publish results/i })).not.toBeChecked();
    await expect(page.getByText(/a series of 3 runs with these settings/i)).toBeVisible();
    // The note documents the parameters and offers the link for the current controls.
    await page.getByText('Link presets').click();
    await expect(page.getByText('/bench/run?tier=standard&quality=on&runs=3&cold=on&publish=off')).toBeVisible();
    // Nothing starts from a link: no run overlay, no series, and (afterEach) no model bytes.
    await page.waitForTimeout(5_000);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Benchmark series' })).toHaveCount(0);
    await expect(runButton).toBeEnabled();
    // Out-of-range and unknown values are clamped or ignored.
    await page.goto('/bench/run?runs=99&tier=custom&quality=maybe');
    await expect(page.getByRole('spinbutton', { name: 'Runs' })).toHaveValue('30', { timeout: 15_000 });
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
    await expect(runButton).toBeEnabled({ timeout: 15_000 });
    await expect(page.getByText(/paid study session detected/i)).toBeVisible();
    await expect(page.getByRole('region', { name: /study completion code/i })).toHaveCount(0);

    // Headless Chromium: WebGPU lanes must be visibly unavailable, not hidden.
    await expect(page.getByText('no WebGPU').first()).toBeVisible();

    await runButton.click();
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
    await page.goto('/bench/run');
    const runButton = page.getByRole('button', { name: 'Run benchmark' });
    await expect(runButton).toBeEnabled({ timeout: 15_000 });
    // Publishing off: each run of the series is exported as a JSON download.
    await page.getByRole('switch', { name: /publish results/i }).click();
    await page.getByRole('spinbutton', { name: 'Runs' }).fill('2');
    const downloads = collectRunDownloads(page);
    const loads = countLoads(page);
    await runButton.click();

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

    const panel = page.getByRole('region', { name: 'Benchmark series' });
    await expect(panel).toContainText('Series complete: 2 of 2 runs', { timeout: 15 * 60 * 1000 });
    const listed = panel.getByRole('list', { name: 'Completed runs' }).getByRole('listitem');
    await expect(listed).toHaveCount(2);
    await expect(page).toHaveTitle('Done 2/2 · LocalMode Bench');
    expect(loads.count, 'exactly one reload: none after the last run').toBe(1);

    expect(downloads).toHaveLength(2);
    const [first, second] = await Promise.all(downloads);
    expect(first.harness.series).toMatchObject({ index: 1, count: 2 });
    expect(second.harness.series).toEqual({ id: first.harness.series!.id, index: 2, count: 2 });
    expect(first.runId).not.toBe(second.runId);
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
    await expect(page.getByRole('button', { name: 'Run benchmark' })).toBeEnabled({ timeout: 15_000 });
    await expect(page.getByRole('region', { name: 'Benchmark series' })).toHaveCount(0);
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
