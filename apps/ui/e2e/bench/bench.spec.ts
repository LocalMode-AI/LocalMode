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
    await expect(page.getByText('localmode-bench/4').first()).toBeVisible();
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

    // Paid-study contract (prolific-study.md §0): the page reads the study
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
    expect(exported.protocol).toBe('localmode-bench/4');
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
    expect(exported.harness.version).toBe('0.7.1');
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
    expect(partial.protocol).toBe('localmode-bench/4');
    expect(partial.suite).toBe('quick');
    expect(partial.harness.version).toBe('0.7.1');
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
});
