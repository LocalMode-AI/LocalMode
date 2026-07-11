/**
 * @file vision.spec.ts
 * @description E2E for the `vision` category (split-vision-lab Wave 2) — the
 * `object-detector` block at /blocks/vision/object-detector. Supersedes the
 * Detect lanes of the retired vision-lab.spec.ts; the phase0 DETR + BlazeFace
 * lanes are preserved verbatim. The `live-tracker` block's tracker lanes live
 * in the sibling `vision-track.spec.ts` because Playwright only allows
 * `test.use({ launchOptions })` at file level and the tracker needs a DIFFERENT
 * fake-video fixture (`track-fixture.y4m` vs this file's `vision-fixture.y4m`).
 *
 * REAL: every model boundary is real. Chromium's fake webcam plays the
 * committed `vision-fixture.y4m` (a real football-match photo — multiple COCO
 * `person`s; also served at /test-assets/portrait.jpg as the DETR sample). This
 * file performs real HuggingFace / MediaPipe downloads + inference: DETR object
 * detection and BlazeFace face detection.
 *
 * GAP (documented; closed by the mandatory MANUAL REAL-HARDWARE SWEEP with a
 * real webcam — chrome-devtools MCP or equivalent): the camera is a Chromium
 * fake capture device playing a file, not physical hardware. Live-motion
 * behavior, real permission prompts (grant + deny + retry), and physical-device
 * quirks are manual-sweep territory. Faces in the downscaled football scene are
 * small for BlazeFace (short-range model), so the face-loop lane asserts the
 * loop ran on real frames + rendered a numeric count — it does NOT pin
 * face-count >= 1 (deferred to the sweep). SWEEP RECORD: (pending re-run on
 * camera/mic-equipped hardware; see e2e-artifacts/manual-sweep/).
 *
 * Console-error policy: hard fail on any console error / pageerror. The
 * allowlist has exactly TWO documented entries (a benign HF 404 probe and
 * MediaPipe WASM `INFO:` logs routed through Emscripten printErr); everything
 * else fails. Specs drive accessibility selectors
 * (`getByRole`/`getByLabel`/`getByText`) only — no `data-testid`.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type ConsoleMessage, type Page, type Request } from '@playwright/test';

/* ────────────────────────────── routes ────────────────────────────── */

const CATEGORY_ROUTE = '/blocks/vision';
const BLOCK_ROUTE = '/blocks/vision/object-detector';

/* ────────────────────────────── fixtures ────────────────────────────── */

const FIXTURES_DIR = path.resolve(__dirname, '..', 'fixtures');
/** Detect lanes: football-match photo (same content as /test-assets/portrait.jpg). */
const DETECT_FIXTURE = path.join(FIXTURES_DIR, 'vision-fixture.y4m');
/** Upload lane subject: the DETR sample image itself (known `person` content). */
const UPLOAD_IMAGE = path.resolve(__dirname, '..', '..', 'public', 'test-assets', 'portrait.jpg');

for (const fixture of [DETECT_FIXTURE, UPLOAD_IMAGE]) {
  if (!existsSync(fixture)) {
    // Fail fast and loudly: without the file, Chromium's fake capture falls back
    // to its synthetic test pattern and media assertions become vacuously green.
    throw new Error(
      `Missing media fixture: ${fixture}. Regenerate it with the commands in e2e/fixtures/README.md.`,
    );
  }
}

// Playwright only allows launchOptions at file level (it forces a worker), so
// the Track lanes — which need a DIFFERENT fake-video fixture — live in the
// sibling `vision-track.spec.ts`. test.use REPLACES the config's launchOptions,
// so the base fake-media flags are repeated here.
test.use({
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${DETECT_FIXTURE}`,
    ],
  },
});

/* ────────────────────────────── timeouts ────────────────────────────── */

/** MediaPipe wasm + task model download (CDN / GCS, a few MB) to first result. */
const MEDIAPIPE_TIMEOUT_MS = 3 * 60 * 1000;
/** Cold Xenova/detr-resnet-50 download from HuggingFace + first inference. */
const DETR_TIMEOUT_MS = 8 * 60 * 1000;

/* ─────────────────────── console capture + allowlist ─────────────────────── */

interface CapturedError {
  text: string;
  url: string;
}

const CONSOLE_ERROR_ALLOWLIST: ReadonlyArray<{
  reason: string;
  matches: (error: CapturedError) => boolean;
}> = [
  {
    // WHY HARMLESS: Transformers.js probes HuggingFace for an OPTIONAL
    // tokenizer_config.json when loading a model; Xenova/detr-resnet-50 ships no
    // tokenizer, HF answers 404, the library handles it (detection succeeds).
    // Chrome still logs the 404 as a console error.
    // WHO/WHEN: root-caused 2026-06-12 (ui-elements-media-vision 4.9); carried
    // over verbatim through the vision-lab suite this file supersedes.
    // SCOPE: only 404-style errors whose source URL is the tokenizer_config.json
    // probe on a HuggingFace host.
    reason: 'benign HF 404: optional tokenizer_config.json probe for DETR (no tokenizer shipped)',
    matches: (error) =>
      /huggingface\.co|hf\.co/i.test(error.url) && /tokenizer_config\.json/i.test(error.url),
  },
  {
    // WHY HARMLESS: the MediaPipe Tasks WASM runtime (Emscripten) routes native
    // TFLite/absl INFO logging through Module.printErr → console.error, so
    // "INFO: Created TensorFlow Lite XNNPACK delegate for CPU." surfaces as an
    // error. Informational only; the lane's own witnesses (face-loop count,
    // DETR `person` label + in-bounds boxes) prove inference succeeded.
    // WHO/WHEN: root-caused 2026-07-03 (blocks-vision-lab 6.1); carried over.
    // SCOPE: text starts with "INFO: " AND source is a
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
    // pageerrors are NEVER allowlisted — url stays '' so nothing can match.
    errors.push({ text: `[pageerror] ${err.message}`, url: '' });
  });
}

/** Requests that indicate model / WASM / task bytes moved. */
const MODEL_REQUEST_PATTERNS = [
  /huggingface\.co/i,
  /hf\.co/i,
  /cdn-lfs/i,
  /storage\.googleapis\.com\/mediapipe/i,
  /\.onnx(\?|$)/i,
  /\.gguf(\?|$)/i,
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
    'no console errors allowed (documented allowlist entries only)',
  ).toEqual([]);
});

/* ══════════════════════════ platform / invariants ══════════════════════════ */

test.describe('vision platform', () => {
  test('legacy /blocks/vision-lab redirects to /blocks/vision (category page renders, no loop)', async ({
    page,
  }) => {
    await page.goto('/blocks/vision-lab');
    await expect(page).toHaveURL(/\/blocks\/vision$/);
    // /blocks/vision is now a REAL category page hosting both vision blocks,
    // each in its own BlockShell (not a redirect target).
    await expect(page.locator('[data-block-shell="vision/object-detector"]')).toBeVisible();
    await expect(page.locator('[data-block-shell="vision/live-tracker"]')).toBeVisible();
  });

  test('/blocks/vision resolves directly (no redirect) and is the category page', async ({ page }) => {
    await page.goto(CATEGORY_ROUTE);
    expect(new URL(page.url()).pathname, '/blocks/vision resolves flat, no redirect').toBe(
      CATEGORY_ROUTE,
    );
    await expect(page.locator('[data-block-shell="vision/object-detector"]')).toBeVisible();
  });

  test('idle category + block pages fetch zero model bytes', async ({ page }) => {
    const modelRequests: string[] = [];
    collectModelRequests(page, modelRequests);

    // Category page: both blocks mount their gated Previews — zero model bytes.
    await page.goto(CATEGORY_ROUTE);
    await expect(page.locator('[data-block-shell="vision/object-detector"]')).toBeVisible();
    await expect(page.locator('[data-block-shell="vision/live-tracker"]')).toBeVisible();
    await page.waitForLoadState('networkidle');

    // Single-block page: the object-detector idle contract.
    await page.goto(BLOCK_ROUTE);
    await expect(page.locator('[data-block-preview]')).toBeVisible();
    await expect(page.getByRole('status', { name: 'Detector status' })).toHaveText('idle');
    await expect(page.getByRole('button', { name: 'Start camera' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Detect objects (sample image)' })).toBeVisible();
    await page.waitForLoadState('networkidle');

    expect(modelRequests, 'idle vision pages must not fetch model assets').toEqual([]);
  });
});

/* ══════════════════════════════ object-detector ══════════════════════════════ */

test.describe('object-detector block', () => {
  test('BlazeFace live loop + DETR on sample, upload, and webcam still', async ({ page }) => {
    // Cold path: BlazeFace CDN load + DETR HuggingFace download can exceed the
    // config-wide ceiling; targeted expect() timeouts still fail each stage fast.
    test.setTimeout(20 * 60 * 1000);

    await page.goto(BLOCK_ROUTE);

    // Scope getByText/alert to the live preview — the hidden Code tab renders the
    // block source into the DOM, and Next.js adds a global route-announcer alert.
    const block = page.locator('[data-block-preview]');
    const detectorStatus = page.getByRole('status', { name: 'Detector status' });
    const subject = page.getByRole('group', { name: 'Detection subject' });
    const legend = page.getByRole('group', { name: 'Detected object labels' });
    const results = page.getByRole('group', { name: 'Detection results' });
    const objectsFound = block.getByText(/^Objects found:/);

    // Preview is default-mounted; the block renders idle with no model fetched.
    await expect(page.locator('[data-block-preview]')).toBeVisible();
    await expect(detectorStatus).toHaveText('idle');
    await expect(page.getByRole('button', { name: 'Detect objects (sample image)' })).toBeVisible();
    await expect(results).toHaveCount(0);

    // ── (a) start camera → real BlazeFace on real frames ──
    await page.getByRole('button', { name: 'Start camera' }).click();
    const cameraRunning = page.getByRole('button', { name: 'Camera running' });
    await expect(cameraRunning).toBeVisible();
    await expect(cameraRunning).toBeDisabled();
    await expect(block.getByRole('alert')).toHaveCount(0);

    // The 1.5s loop grabs a REAL frame and runs REAL BlazeFace on it. Two
    // witnesses: (1) the face count renders a numeric result, (2) the captured
    // still (the exact processed frame) appears with its overlay. DOCUMENTED
    // GAP: faces in the sports photo are small for BlazeFace, so ">= 1" is NOT
    // pinned — the fake webcam stands in for real hardware (see file header).
    await expect(block.getByText(/^Faces detected: \d+$/)).toBeVisible({
      timeout: MEDIAPIPE_TIMEOUT_MS,
    });
    // Block copy uses an ASCII hyphen (every block string literal does; none
    // uses an em dash) — assert the source of truth, not a prettier variant.
    await expect(detectorStatus).toHaveText(/^camera on - \d+ face\(s\)$/);
    await expect(page.getByAltText('Captured webcam still')).toBeVisible();

    // ── (b) cancel: abort the cold DETR download and stay retryable ──
    await page.getByRole('button', { name: /Detect objects/ }).click();
    await page.locator('[data-block-preview]').getByRole('button', { name: 'Cancel' }).click();
    await expect(objectsFound).not.toHaveText(/[0-9]/); // count reset (no digit)
    await expect(results).toHaveCount(0);
    await expect(block.getByRole('alert')).toHaveCount(0);

    // ── (c) REAL DETR on the bundled sample image ──
    await page.getByRole('button', { name: /Detect objects/ }).click();
    await expect(objectsFound).toHaveText(/^Objects found: [1-9]\d*$/, {
      timeout: DETR_TIMEOUT_MS,
    });
    await expect(subject).toHaveAttribute('data-origin', 'sample');

    // Expected COCO label from the football photo: 'person' — as an overlay chip,
    // in the unique-label legend, and in the ranked result list.
    await expect(subject.getByText('person', { exact: true }).first()).toBeVisible();
    await expect(legend.getByText('person', { exact: true })).toBeVisible();
    await expect(results.getByText('person', { exact: true }).first()).toBeVisible();

    // Box geometry sanity: every box must be non-zero and inside the subject.
    const boxes = await subject
      .locator('div.absolute.rounded-sm')
      .evaluateAll((els, subjectSel) => {
        const subjectRect = document.querySelector(subjectSel as string)!.getBoundingClientRect();
        return els.map((el) => {
          const r = el.getBoundingClientRect();
          return {
            w: r.width,
            h: r.height,
            inside:
              r.left >= subjectRect.left - 1 &&
              r.top >= subjectRect.top - 1 &&
              r.right <= subjectRect.right + 1 &&
              r.bottom <= subjectRect.bottom + 1,
          };
        });
      }, '[aria-label="Detection subject"]');
    expect(boxes.length).toBeGreaterThan(0);
    for (const box of boxes) {
      expect(box.w).toBeGreaterThan(0);
      expect(box.h).toBeGreaterThan(0);
      expect(box.inside).toBe(true);
    }

    await page.screenshot({
      path: 'e2e-artifacts/screenshots/vision-object-detector-sample.png',
      fullPage: true,
    });

    // ── (d) clear resets the block ──
    await page.getByRole('button', { name: 'Clear' }).click();
    await expect(objectsFound).not.toHaveText(/[0-9]/); // count reset (no digit)
    await expect(subject).toHaveCount(0);
    await expect(legend).toHaveCount(0);
    await expect(results).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Drop an image to detect objects/i })).toBeVisible();

    // ── (e) upload: drop a known-content jpeg → warm DETR detection ──
    await page.locator('input[type="file"]').first().setInputFiles(UPLOAD_IMAGE);
    await expect(objectsFound).toHaveText(/^Objects found: [1-9]\d*$/, {
      timeout: MEDIAPIPE_TIMEOUT_MS, // warm model — generous but far below cold
    });
    await expect(subject).toHaveAttribute('data-origin', 'upload');
    await expect(legend.getByText('person', { exact: true })).toBeVisible();

    // ── (f) webcam still: capture the live frame → same DETR treatment ──
    await page.getByRole('button', { name: /Capture still/ }).click();
    await expect(subject).toHaveAttribute('data-origin', 'webcam', { timeout: MEDIAPIPE_TIMEOUT_MS });
    await expect(objectsFound).toHaveText(/^Objects found: [1-9]\d*$/, {
      timeout: MEDIAPIPE_TIMEOUT_MS,
    });
    await expect(block.getByRole('alert')).toHaveCount(0);

    await page.screenshot({
      path: 'e2e-artifacts/screenshots/vision-object-detector-webcam.png',
      fullPage: true,
    });
  });
});
