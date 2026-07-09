/**
 * @file audio.spec.ts
 * @description E2E for the `audio` category (split-vision-lab Wave 2) — the
 * regrouped `audio-classifier` block at /blocks/audio/audio-classifier
 * (formerly the vision-lab Audio tab). `split-audio-studio` (Wave 3) adds its
 * blocks' lanes to THIS file as it grows the audio category.
 *
 * REAL: Chromium's fake microphone plays the committed `voice-fixture.wav` (real
 * spoken English, "The quick brown fox…"). This file performs real MediaPipe
 * YAMNet downloads + inference on an uploaded speech file AND a fake-mic
 * recording. No mocked model boundary.
 *
 * GAP (documented; closed by the mandatory MANUAL REAL-HARDWARE SWEEP with a
 * real microphone): the mic is a fake capture device playing a file. Real
 * permission prompts and physical-device capture are manual-sweep territory.
 *
 * Console-error policy: hard fail on any console error / pageerror; the
 * allowlist has exactly ONE documented entry (MediaPipe WASM `INFO:` logs via
 * Emscripten printErr). Specs drive accessibility-grade selectors only
 * (getByRole / getByLabel / getByText) — no `data-testid`. The block's raw
 * machine state is still asserted via `data-status` / `data-recording` /
 * `data-label` (non-testid data hooks preserved for tests) once the element is
 * located by its role/name.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type ConsoleMessage, type Page, type Request } from '@playwright/test';

const BLOCK_ROUTE = '/blocks/audio/audio-classifier';

/** Real spoken English ("The quick brown fox…"). */
const AUDIO_FIXTURE = path.resolve(__dirname, '..', 'fixtures', 'voice-fixture.wav');

if (!existsSync(AUDIO_FIXTURE)) {
  // Fail fast: without the file, Chromium's fake mic falls back to its synthetic
  // pattern and the /speech/i assertion becomes vacuously wrong.
  throw new Error(
    `Missing media fixture: ${AUDIO_FIXTURE}. Regenerate it with the commands in e2e/fixtures/README.md.`,
  );
}

// test.use REPLACES the config launchOptions; repeat the base fake-media flags.
test.use({
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${AUDIO_FIXTURE}`,
    ],
  },
});

/** MediaPipe wasm + YAMNet task model download to first result. */
const MEDIAPIPE_TIMEOUT_MS = 3 * 60 * 1000;

interface CapturedError {
  text: string;
  url: string;
}

const CONSOLE_ERROR_ALLOWLIST: ReadonlyArray<{
  reason: string;
  matches: (error: CapturedError) => boolean;
}> = [
  {
    // WHY HARMLESS: the MediaPipe Tasks WASM runtime (Emscripten) routes native
    // TFLite/absl INFO logging through Module.printErr → console.error. The
    // lane's own witnesses (YAMNet top /speech/i class, top-8 list) prove
    // inference succeeded. SCOPE: text starts with "INFO: " AND source is a
    // @mediapipe/tasks-{vision,audio,text} wasm bundle.
    // UPSTREAM: Emscripten printErr default → console.error.
    reason:
      'MediaPipe Tasks WASM TFLite INFO logs emitted via Emscripten printErr (console.error); informational only',
    matches: (error) =>
      /^INFO: /.test(error.text) &&
      /cdn\.jsdelivr\.net\/npm\/@mediapipe\/tasks-(vision|audio|text)@[\d.]+\/wasm\//.test(error.url),
  },
];

function collectConsole(page: Page, allMessages: string[], errors: CapturedError[]) {
  page.on('console', (msg: ConsoleMessage) => {
    const { url } = msg.location();
    allMessages.push(`[${msg.type()}] ${msg.text()}${url ? ` (${url})` : ''}`);
    if (msg.type() === 'error') errors.push({ text: msg.text(), url });
  });
  page.on('pageerror', (err) => {
    allMessages.push(`[pageerror] ${err.message}`);
    errors.push({ text: `[pageerror] ${err.message}`, url: '' });
  });
}

/** Requests that indicate model / WASM / task bytes moved. */
const MODEL_REQUEST_PATTERNS = [
  /storage\.googleapis\.com\/mediapipe/i,
  /cdn\.jsdelivr\.net\/npm\/@mediapipe/i,
  /\.tflite(\?|$)/i,
  /\.task(\?|$)/i,
  /\.wasm(\?|$)/i,
];

function collectModelRequests(page: Page, sink: string[]) {
  page.on('request', (req: Request) => {
    const url = req.url();
    if (MODEL_REQUEST_PATTERNS.some((p) => p.test(url))) sink.push(url);
  });
}

let allMessages: string[];
let consoleErrors: CapturedError[];

test.beforeEach(({ page }) => {
  allMessages = [];
  consoleErrors = [];
  collectConsole(page, allMessages, consoleErrors);
});

test.afterEach(async ({}, testInfo) => {
  await testInfo.attach('console-log', {
    body: allMessages.join('\n') || '(none)',
    contentType: 'text/plain',
  });
  const allowlisted = consoleErrors.filter((e) =>
    CONSOLE_ERROR_ALLOWLIST.some((entry) => entry.matches(e)),
  );
  const failing = consoleErrors.filter((e) => !allowlisted.includes(e));
  await testInfo.attach('console-errors', {
    body:
      [
        ...failing.map((e) => `FAIL ${e.text} (${e.url})`),
        ...allowlisted.map((e) => `ALLOWLISTED ${e.text} (${e.url})`),
      ].join('\n') || '(none)',
    contentType: 'text/plain',
  });
  expect(
    failing.map((e) => `${e.text} (${e.url})`),
    'no console errors allowed (single documented allowlist entry only)',
  ).toEqual([]);
});

test.describe('audio-classifier block', () => {
  test('idle page fetches zero model bytes', async ({ page }) => {
    const modelRequests: string[] = [];
    collectModelRequests(page, modelRequests);

    await page.goto(BLOCK_ROUTE);
    await expect(page.locator('[data-block-preview]')).toBeVisible();
    await expect(page.getByRole('status', { name: 'Status' })).toHaveAttribute(
      'data-status',
      'idle',
    );

    await page.waitForLoadState('networkidle');
    expect(modelRequests, 'idle audio-classifier must not fetch model assets').toEqual([]);
  });

  test('classifies an uploaded speech fixture and a fake-microphone recording', async ({ page }) => {
    test.setTimeout(10 * 60 * 1000);

    await page.goto(BLOCK_ROUTE);
    await expect(page.locator('[data-block-preview]')).toBeVisible();
    const status = page.getByRole('status', { name: 'Status' });
    await expect(status).toHaveAttribute('data-status', 'idle');

    // The ranked results live in a labelled region; the top prediction is its
    // first list item (limit=8 preserves prediction order).
    const results = page.getByRole('region', { name: 'Top predictions' });

    // ── upload lane: real YAMNet on the committed speech wav ──
    await page.getByLabel('Upload audio file').setInputFiles(AUDIO_FIXTURE);
    await expect(status).toHaveAttribute('data-status', 'done', {
      timeout: MEDIAPIPE_TIMEOUT_MS,
    });
    // Real speech must classify as speech (YAMNet's top category), and the
    // ranked list must carry the top-8 predictions.
    await expect(results.getByRole('listitem').first()).toContainText(/speech/i);
    await expect(results.getByRole('listitem')).toHaveCount(8);
    await page.screenshot({
      path: 'e2e-artifacts/screenshots/audio-classifier-upload.png',
      fullPage: true,
    });

    // ── record lane: fake microphone loops the same speech wav ──
    // The record toggle names itself "Record" then "Stop & classify"; match both.
    const recordButton = page.getByRole('button', { name: /record|classify/i });
    await recordButton.click();
    await expect(recordButton).toHaveAttribute('data-recording', 'true');
    // The visible recording indicator next to the waveform bars. Scoped to the
    // "Classify a sound" input region so it does not collide with the top status
    // region, which now also reads "Recording…" (sentence-case).
    await expect(
      page.getByRole('region', { name: 'Classify a sound' }).getByText('Recording…', { exact: true }),
    ).toBeVisible();
    // Capture a full loop of the ~2.5s phrase before stopping.
    await page.waitForTimeout(4000);
    await recordButton.click(); // Stop & classify
    await expect(status).toHaveAttribute('data-status', 'done', {
      timeout: MEDIAPIPE_TIMEOUT_MS,
    });
    await expect(results.getByRole('listitem').first()).toContainText(/speech/i);
    // Scope to the block container so the app-chrome's global alert region
    // (DevTools/toast portal) is not mistaken for a block error.
    await expect(page.locator('[data-block-preview]').getByRole('alert')).toHaveCount(0);
    await page.screenshot({
      path: 'e2e-artifacts/screenshots/audio-classifier-record.png',
      fullPage: true,
    });
  });
});
