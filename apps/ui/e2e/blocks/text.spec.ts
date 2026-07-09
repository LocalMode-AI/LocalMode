/**
 * @file text.spec.ts
 * @description E2E for the `text` category (split-vision-lab Wave 2) — the
 * regrouped `language-detector` block at /blocks/text/language-detector
 * (formerly the vision-lab Language tab). No capture device is needed.
 *
 * REAL: real MediaPipe language-detector + text-embedder downloads + inference.
 * No mocked model boundary. Asserts the detected ISO codes on known-language
 * text and that a paraphrase pair's cosine similarity outranks an unrelated
 * pair (full-record witness, not a shrunk window).
 *
 * Console-error policy: hard fail on any console error / pageerror; the
 * allowlist has exactly ONE documented entry (MediaPipe WASM `INFO:` logs via
 * Emscripten printErr). Specs drive accessibility selectors (getByRole /
 * getByLabel / getByText) only — no `data-testid` (Wave-4 UX pass); the sole
 * structural hook is `[data-block-preview]` (the BlockShell preview panel).
 */
import { expect, test, type ConsoleMessage, type Page, type Request } from '@playwright/test';

const BLOCK_ROUTE = '/blocks/text/language-detector';

/** MediaPipe wasm + task model download to first result. */
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
    // lane's own witnesses (language codes, similarity ordering) prove inference
    // succeeded. SCOPE: text starts with "INFO: " AND source is a
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

test.describe('language-detector block', () => {
  // Fixture texts: known languages + a paraphrase and an unrelated pair for the
  // similarity-ordering assertion.
  const ENGLISH_TEXT = 'The weather is beautiful today and the garden is full of flowers.';
  const SPANISH_TEXT = 'El tiempo es hermoso hoy y el jardín está lleno de flores.';
  const PARAPHRASE_A = 'The cat sat on the mat.';
  const PARAPHRASE_B = 'A feline rested on the rug.';
  const UNRELATED = 'Quarterly corporate tax filings are due at the end of the fiscal year.';

  test('idle page fetches zero model bytes', async ({ page }) => {
    const modelRequests: string[] = [];
    collectModelRequests(page, modelRequests);

    await page.goto(BLOCK_ROUTE);
    const block = page.locator('[data-block-preview]');
    await expect(block).toBeVisible();
    // Block mounted (accessibility-grade witness): the labeled detection input.
    await expect(block.getByLabel('Text to detect language')).toBeVisible();

    await page.waitForLoadState('networkidle');
    expect(modelRequests, 'idle language-detector must not fetch model assets').toEqual([]);
  });

  test('detects fixture languages and orders paraphrase similarity above unrelated', async ({ page }) => {
    test.setTimeout(10 * 60 * 1000);

    await page.goto(BLOCK_ROUTE);
    const block = page.locator('[data-block-preview]');
    await expect(block).toBeVisible();

    // ── auto-detect lane: ≥10 chars + 400ms debounce, no button press ──
    // The results render as a score-sorted <ol>; the FIRST <li> is the
    // top-confidence detection (stronger than the old data-code witness).
    const input = block.getByLabel('Text to detect language');
    await input.fill(ENGLISH_TEXT);
    await expect(block.getByRole('listitem').first()).toContainText('English (en)', {
      timeout: MEDIAPIPE_TIMEOUT_MS, // includes the language-detector download
    });

    await input.fill(SPANISH_TEXT);
    await expect(block.getByRole('listitem').first()).toContainText('Spanish (es)', {
      timeout: MEDIAPIPE_TIMEOUT_MS,
    });
    await page.screenshot({
      path: 'e2e-artifacts/screenshots/text-language-detect.png',
      fullPage: true,
    });

    // ── similarity lane: paraphrases must score above unrelated texts ──
    const compare = block.getByRole('button', { name: /compare similarity/i });
    await expect(compare).toBeDisabled(); // both inputs empty

    await block.getByLabel('First text to compare').fill(PARAPHRASE_A);
    await block.getByLabel('Second text to compare').fill(PARAPHRASE_B);
    await compare.click();
    // The CosineSimilarityMeter is a role="meter" (disambiguated from the
    // detection confidence badges by its "Cosine similarity" accessible name);
    // aria-valuenow carries the full-precision cosine value.
    const meter = block.getByRole('meter', { name: /cosine similarity/i });
    await expect(meter).toBeVisible({ timeout: MEDIAPIPE_TIMEOUT_MS });
    const paraphraseScore = Number(await meter.getAttribute('aria-valuenow'));
    expect(Number.isFinite(paraphraseScore)).toBe(true);

    await block.getByLabel('Second text to compare').fill(UNRELATED);
    await compare.click();
    await expect(compare).toBeEnabled({ timeout: MEDIAPIPE_TIMEOUT_MS });
    await expect
      .poll(async () => Number(await meter.getAttribute('aria-valuenow')), {
        timeout: MEDIAPIPE_TIMEOUT_MS,
      })
      .not.toBe(paraphraseScore);
    const unrelatedScore = Number(await meter.getAttribute('aria-valuenow'));

    expect(
      paraphraseScore,
      `paraphrase pair (${paraphraseScore}) must score above unrelated pair (${unrelatedScore})`,
    ).toBeGreaterThan(unrelatedScore);
    await page.screenshot({
      path: 'e2e-artifacts/screenshots/text-language-similarity.png',
      fullPage: true,
    });
  });
});
