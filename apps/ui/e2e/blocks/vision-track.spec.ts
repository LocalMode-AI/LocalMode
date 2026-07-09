/**
 * @file vision-track.spec.ts
 * @description E2E for the `vision` category `live-tracker` block at
 * /blocks/vision/live-tracker (split-vision-lab Wave 2). Lives in its OWN file
 * because Playwright only allows `test.use({ launchOptions })` at file level and
 * the tracker lanes need a different fake-video fixture (`track-fixture.y4m`)
 * than the object-detector lanes in `vision.spec.ts` (`vision-fixture.y4m`) —
 * the two-file constraint SURVIVES the split. Read `vision.spec.ts`'s header for
 * the shared suite policy; it applies here verbatim.
 *
 * REAL: Chromium's fake webcam plays `e2e/fixtures/track-fixture.y4m` — a real
 * NASA portrait of an astronaut giving a thumbs-up (public domain), curated so
 * one frame carries a large frontal face, an upper body, and a clear bare-hand
 * thumbs-up. The four REAL `@localmode/mediapipe` streaming trackers (hand /
 * pose / face / gesture) download real task models and process real frames.
 * Assertions pin tracker liveness, non-zero FPS, landmark counts (21 / 33 /
 * 478), the `Thumb_Up` category, blendshapes, and clean disposal on sub-mode
 * switches.
 *
 * GAP (documented; closed by the mandatory MANUAL REAL-HARDWARE SWEEP with a
 * real webcam): the camera is a fake capture device looping a static photo, so
 * live-motion tracking, real permission prompts, and physical-device quirks are
 * manual-sweep territory. SWEEP RECORD: (pending re-run on camera-equipped
 * hardware; see e2e-artifacts/manual-sweep/).
 *
 * Console-error policy: hard fail on any console error / pageerror; the
 * allowlist has exactly ONE documented entry (MediaPipe WASM `INFO:` logs via
 * Emscripten printErr). Specs drive accessibility selectors
 * (`getByRole`/`getByLabel`/`getByText`) only — no `data-testid`.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';

const BLOCK_ROUTE = '/blocks/vision/live-tracker';

/** Track lanes fixture: NASA thumbs-up portrait (face + upper body + bare hand). */
const TRACK_FIXTURE = path.resolve(__dirname, '..', 'fixtures', 'track-fixture.y4m');

if (!existsSync(TRACK_FIXTURE)) {
  // Fail fast and loudly: without the file, Chromium's fake camera falls back to
  // its synthetic test pattern and every tracker assertion becomes vacuously wrong.
  throw new Error(
    `Missing fake-camera fixture: ${TRACK_FIXTURE}. ` +
      'Regenerate it with the ffmpeg command in e2e/fixtures/README.md.',
  );
}

// test.use() REPLACES the config's launchOptions.args, so the fake-media flags
// from playwright.config.ts are copied here alongside the capture file.
test.use({
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${TRACK_FIXTURE}`,
    ],
  },
});

/** MediaPipe wasm + tracker task model download (CDN / GCS) to first result. */
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
    // TFLite/absl INFO logging through Module.printErr → console.error, so
    // "INFO: Created TensorFlow Lite XNNPACK delegate for CPU." surfaces as an
    // error. Informational only; the tracker lanes' own assertions (liveness,
    // FPS, landmark counts, gesture category) prove inference succeeded.
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
    errors.push({ text: `[pageerror] ${err.message}`, url: '' });
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

/** Wait for the current sub-mode to reach running with a live FPS. */
async function expectTracking(page: Page) {
  await expect(page.getByRole('status', { name: 'Tracker status' })).toHaveAttribute(
    'data-status',
    /^(running|waiting)$/,
    { timeout: MEDIAPIPE_TIMEOUT_MS },
  );
  await expect(page.getByRole('status', { name: 'Tracker frames per second' })).toHaveAttribute(
    'data-fps',
    /^[1-9]\d*$/,
    { timeout: MEDIAPIPE_TIMEOUT_MS },
  );
}

/** Switch tracker sub-mode via the labeled radiogroup, and confirm it's checked. */
async function selectMode(page: Page, label: 'Hands' | 'Pose' | 'Face' | 'Gestures') {
  await page
    .getByRole('radiogroup', { name: 'Streaming tracker' })
    .getByRole('radio', { name: label })
    .click();
  await expect(page.getByRole('radio', { name: label })).toBeChecked();
}

test.describe('live-tracker block', () => {
  test('all four streaming trackers run on the fixture with expected landmarks', async ({ page }) => {
    // Four sequential tracker model downloads on a cold cache.
    test.setTimeout(20 * 60 * 1000);

    await page.goto(BLOCK_ROUTE);
    await expect(page.locator('[data-block-preview]')).toBeVisible();
    // The tracker mode picker is mounted at idle (no model bytes).
    await expect(page.getByRole('radiogroup', { name: 'Streaming tracker' })).toBeVisible();

    const landmarks = page.getByRole('status', { name: 'Landmark count' });
    const trackedCount = page.getByRole('status', { name: 'Tracked item count' });
    const panel = page.getByRole('group', { name: 'Tracker output' });
    const blendshapesToggle = page.getByRole('checkbox', { name: 'Show expression blendshapes' });
    const blendshapes = page.getByRole('group', { name: 'Expression blendshapes' });
    const gesture = page.getByRole('status', { name: 'Recognized gesture' });

    // ── Hands (default sub-mode): 21-point skeleton on the thumbs-up hand ──
    await page.getByRole('button', { name: 'Start camera' }).click();
    await expectTracking(page);
    await expect(landmarks).toHaveAttribute('data-points', '21', { timeout: MEDIAPIPE_TIMEOUT_MS });
    await expect(trackedCount).toHaveAttribute('data-count', /^[1-9]$/);
    await expect(panel).toContainText(/(Left|Right) hand/);
    await page.screenshot({
      path: 'e2e-artifacts/screenshots/vision-live-tracker-hands.png',
      fullPage: true,
    });

    // ── Pose: sub-mode switch disposes the hand tracker, 33-point skeleton ──
    await selectMode(page, 'Pose');
    await page.getByRole('button', { name: 'Start camera' }).click();
    await expectTracking(page);
    await expect(landmarks).toHaveAttribute('data-points', '33', { timeout: MEDIAPIPE_TIMEOUT_MS });
    await expect(panel).toContainText(/Tracking [1-9] person/);
    await page.screenshot({
      path: 'e2e-artifacts/screenshots/vision-live-tracker-pose.png',
      fullPage: true,
    });

    // ── Face: 478-point mesh + top-8 blendshape bars (toggle default on) ──
    await selectMode(page, 'Face');
    await page.getByRole('button', { name: 'Start camera' }).click();
    await expectTracking(page);
    await expect(landmarks).toHaveAttribute('data-points', '478', { timeout: MEDIAPIPE_TIMEOUT_MS });
    await expect(blendshapesToggle).toBeChecked();
    await expect(blendshapes.locator('ol > li')).toHaveCount(8, { timeout: MEDIAPIPE_TIMEOUT_MS });
    // Disabling the toggle removes the blendshape panel; re-enabling restores it
    // without rebuilding the tracker.
    await blendshapesToggle.click();
    await expect(blendshapes).toHaveCount(0);
    await blendshapesToggle.click();
    await expect(blendshapes).toBeVisible();
    await page.screenshot({
      path: 'e2e-artifacts/screenshots/vision-live-tracker-face.png',
      fullPage: true,
    });

    // ── Gestures: hand skeleton + the fixture's thumbs-up category ──
    await selectMode(page, 'Gestures');
    await page.getByRole('button', { name: 'Start camera' }).click();
    await expectTracking(page);
    await expect(landmarks).toHaveAttribute('data-points', '21', { timeout: MEDIAPIPE_TIMEOUT_MS });
    // The curated fixture shows a clear thumbs-up: assert the real recognized
    // category and its human-readable panel label.
    await expect(gesture).toHaveAttribute('data-gesture', 'Thumb_Up', { timeout: MEDIAPIPE_TIMEOUT_MS });
    await expect(panel).toContainText('Thumbs Up');
    await expect(panel).toContainText(/(Left|Right) hand/);
    await page.screenshot({
      path: 'e2e-artifacts/screenshots/vision-live-tracker-gestures.png',
      fullPage: true,
    });

    // ── sub-mode thrash: switch modes mid-tracking, bounce, come back ──
    // Exactly one tracker/WASM task alive at a time: switching sub-mode must
    // dispose the running tracker with no MediaPipe audio/vision concurrency
    // errors (the afterEach console gate enforces it). Replaces the old tab
    // thrash (there are no tabs — this is now its own page).
    await selectMode(page, 'Hands');
    await selectMode(page, 'Face');
    await selectMode(page, 'Pose');
    await selectMode(page, 'Gestures');
    // Back to an idle sub-mode with no tracker running (fresh mount, not started).
    await selectMode(page, 'Hands');
    await expect(page.getByRole('status', { name: 'Tracker status' })).toHaveAttribute(
      'data-status',
      'idle',
    );
  });
});
