/**
 * @file photo.spec.ts
 * @description E2E for the four `ui/blocks/photo/*` blocks (split from the retired
 * `photo-search` monolith, split-knowledge-photo Wave 3). Drives role/label/text
 * selectors ONLY (blocks-ux-pass Wave 4 — zero `data-testid`) against a production
 * build in real Chromium, with REAL CLIP model downloads + real inference — no
 * mocked model boundary.
 *
 * WHAT IS REAL vs GAP
 * - REAL: every model boundary. `Xenova/clip-vit-base-patch32` (~350 MB, one
 *   download powers embeddings AND zero-shot categorization) is downloaded into a
 *   fresh context and run for real (image embeddings, zero-shot classification,
 *   text→image + image→image search, union-find dedup, re-categorization).
 * - REAL: the four blocks are SEPARATE pages, each owning its OWN usePhotoLibrary
 *   instance. The end-to-end test navigates all four in ONE context so CLIP
 *   downloads once (browser-cache-shared per D7) — and asserts BOTH the
 *   cache-shared model (no second full weight download) AND the unshared state
 *   (each block starts with an empty library).
 * - REAL: fixtures are committed files (e2e/fixtures/photo-search/): a real
 *   football photo + a byte-identical copy (the known exact-duplicate pair,
 *   cosine ~1.0) + four distinct emoji scenes (apple/car/tree/dog).
 * - Probe-then-pin: label + ranking assertions are locked to what a real CLIP run
 *   produces against these fixtures (the run logs the full matrix; pinned values
 *   match the observed real behavior — no loosened assertions).
 *
 * CONSOLE-ERROR POLICY: hard fail on any console error / pageerror outside the
 * documented allowlist (one narrow benign HF-404 CLIP-sidecar probe). Role/label
 * selectors only. Screenshots + console land in e2e-artifacts/.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type ConsoleMessage, type Page, type Request } from '@playwright/test';

/* ────────────────────────────── fixtures ────────────────────────────── */

const FIXTURES_DIR = path.resolve(__dirname, '..', 'fixtures', 'photo-search');
const FIXTURE_FILES = [
  'football.jpg',
  'football-copy.jpg',
  'apple.png',
  'car.png',
  'tree.png',
  'dog.png',
] as const;
const fixturePath = (name: string) => path.join(FIXTURES_DIR, name);

for (const name of FIXTURE_FILES) {
  if (!existsSync(fixturePath(name))) {
    throw new Error(
      `Missing photo fixture: ${fixturePath(name)}. Regenerate with ` +
        `node e2e/fixtures/generate-photo-search-fixtures.mjs (see e2e/fixtures/README.md).`,
    );
  }
}

/* ────────────────────────────── timeouts ────────────────────────────── */

/** Cold Xenova/clip-vit-base-patch32 download (~350 MB) from HuggingFace. */
const MODEL_LOAD_TIMEOUT_MS = 10 * 60 * 1000;
/** Real CLIP embedding + zero-shot classification of the 6-image fixture set. */
const INGEST_TIMEOUT_MS = 6 * 60 * 1000;

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
    // WHY HARMLESS: Transformers.js probes HuggingFace for OPTIONAL CLIP sidecar
    // files (added_tokens.json / preprocessor variants); HF answers 404 and the
    // library falls back cleanly (real embedding + classification succeed — the
    // ranking/duplicate assertions prove it). Chrome still logs the 404.
    // SCOPE: only .json 404s from a HuggingFace host. WHO/WHEN: carried over
    // verbatim from the retired photo-search.spec.ts (blocks-photo-search task 5.2).
    reason: 'benign HF 404: optional CLIP sidecar-file probe (library falls back)',
    matches: (error) =>
      /huggingface\.co|hf\.co/i.test(error.url) && /\.json(\?|$)/i.test(error.url),
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

/** Model-WEIGHT request patterns (weights, not app assets). */
const WEIGHT_REQUEST_PATTERNS = [/huggingface\.co/i, /hf\.co/i, /cdn-lfs/i, /\.onnx(\?|$)/i, /\.wasm(\?|$)/i];
/** Just the heavy weight files, for the cache-share witness. */
const HEAVY_WEIGHT_PATTERN = /\.onnx(\?|$)/i;

function collectModelRequests(page: Page, sink: string[]) {
  page.on('request', (req: Request) => {
    const url = req.url();
    if (WEIGHT_REQUEST_PATTERNS.some((p) => p.test(url))) sink.push(url);
  });
}

let allMessages: string[];
let consoleErrors: CapturedError[];
let modelRequests: string[];

test.beforeEach(({ page }) => {
  allMessages = [];
  consoleErrors = [];
  modelRequests = [];
  collectConsole(page, allMessages, consoleErrors);
  collectModelRequests(page, modelRequests);
});

test.afterEach(async ({}, testInfo) => {
  await testInfo.attach('console-log', {
    body: allMessages.join('\n') || '(none)',
    contentType: 'text/plain',
  });
  await testInfo.attach('model-weight-requests', {
    body: modelRequests.join('\n') || '(none)',
    contentType: 'text/plain',
  });
  const failing = consoleErrors.filter(
    (e) => !CONSOLE_ERROR_ALLOWLIST.some((entry) => entry.matches(e)),
  );
  await testInfo.attach('console-errors', {
    body: failing.map((e) => `FAIL ${e.text} (${e.url})`).join('\n') || '(none)',
    contentType: 'text/plain',
  });
  expect(
    failing.map((e) => `${e.text} (${e.url})`),
    'no console errors allowed (documented allowlist entries only)',
  ).toEqual([]);
});

/* ────────────────────────────── helpers ────────────────────────────── */

/** The sr-only per-photo driver mirror list (aria-label "Indexed photos") that
 * every photo block exposes; its `<li>` items carry data-filename/-category/
 * -embedded state attributes (not testids). */
function photoMirror(page: Page) {
  return page.getByRole('list', { name: 'Indexed photos' });
}

/** Load the CLIP model for a block via its own gate and wait for ready. */
async function loadModel(page: Page, _block: string): Promise<void> {
  await page.getByRole('button', { name: /^Load CLIP ViT-B\/32/ }).click();
  await expect(page.getByRole('group', { name: 'CLIP model status' })).toHaveAttribute(
    'data-status',
    'ready',
    { timeout: MODEL_LOAD_TIMEOUT_MS },
  );
}

/** Drop the whole fixture set into a block's dropzone and wait for all embedded.
 * Reads the per-photo driver mirror (`Indexed photos` list), which every photo
 * block exposes. */
async function ingestFixtures(page: Page, _block: string, files = FIXTURE_FILES): Promise<void> {
  await page
    .getByRole('group', { name: 'Photo library upload' })
    .locator('input[type="file"]')
    .setInputFiles(files.map((name) => fixturePath(name)));
  await expect(photoMirror(page).getByRole('listitem')).toHaveCount(files.length, {
    timeout: 60_000,
  });
  await expect
    .poll(async () => photoMirror(page).locator('li[data-embedded="true"]').count(), {
      timeout: INGEST_TIMEOUT_MS,
    })
    .toBe(files.length);
}

/** Assert a block starts with an empty library (unshared-state witness). */
async function expectEmptyLibrary(page: Page, _block: string): Promise<void> {
  await expect(photoMirror(page).getByRole('listitem')).toHaveCount(0);
}

/** filename → category map from a block's sr-only per-photo driver mirror. */
async function readCategoryMatrix(page: Page, _block: string): Promise<Record<string, string>> {
  return photoMirror(page).evaluate((ul) => {
    const out: Record<string, string> = {};
    for (const li of Array.from(ul.querySelectorAll('li'))) {
      out[li.getAttribute('data-filename') ?? '?'] = li.getAttribute('data-category') ?? '';
    }
    return out;
  });
}

/* ══════════════════════════ platform / invariants ══════════════════════════ */

test.describe('blocks/photo — platform', () => {
  test('idle page load fetches zero model bytes', async ({ page }) => {
    await page.goto('/blocks/photo/smart-gallery');
    await expect(page.locator('[data-block-preview]')).toBeVisible();
    await expect(page.getByRole('group', { name: 'CLIP model status' })).toHaveAttribute(
      'data-status',
      'idle',
    );
    await expect(page.getByRole('button', { name: /^Load CLIP ViT-B\/32/ })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(modelRequests, 'idle load must not fetch model assets').toEqual([]);
  });

  test('the /blocks/photo-search redirect lands on the photo category page', async ({ page }) => {
    await page.goto('/blocks/photo-search');
    await expect(page).toHaveURL(/\/blocks\/photo$/);
    await page.waitForLoadState('networkidle');
    // Category page mounts four gated blocks; none downloads on open.
    expect(modelRequests, 'the photo category page must not fetch model bytes on load').toEqual([]);
  });
});

/* ══════════════════════════ real CLIP end-to-end ══════════════════════════ */

test.describe('blocks/photo — real CLIP', () => {
  test('CLIP downloads once, is cache-shared across the four blocks, and state stays unshared', async ({
    page,
  }) => {
    test.setTimeout(MODEL_LOAD_TIMEOUT_MS + 4 * INGEST_TIMEOUT_MS + 8 * 60 * 1000);

    /* ── 1. smart-gallery: adaptive-batch ingest + zero-shot categorization ── */
    await page.goto('/blocks/photo/smart-gallery');
    await expect(page.locator('[data-block-preview]')).toBeVisible();
    await expectEmptyLibrary(page, 'smart-gallery');

    await loadModel(page, 'smart-gallery');
    expect(
      modelRequests.filter((u) => HEAVY_WEIGHT_PATTERN.test(u)).length,
      'the first block must have fetched real CLIP weight files',
    ).toBeGreaterThan(0);

    await ingestFixtures(page, 'smart-gallery');
    await expect(page.getByRole('status', { name: 'Ingest progress' })).toHaveCount(0);

    // Cache-share baseline: the UNIQUE heavy weights after the FIRST block's FULL
    // journey (embedder text+vision pair on load, plus the zero-shot classifier's
    // combined graph on first categorization — the same three files the pre-split
    // block downloaded). The three later blocks must add ZERO new unique files.
    const uniqueAfterFirstBlock = new Set(
      modelRequests.filter((u) => HEAVY_WEIGHT_PATTERN.test(u)),
    );

    // Adaptive-batch card is present once the library holds photos (device-aware
    // batch size surfaced in the library header — same hasPhotos gate as the
    // source gallery-tab, verified against the pre-split implementation).
    await expect(page.getByRole('group', { name: 'Adaptive batch info' })).toBeVisible();

    const matrix = await readCategoryMatrix(page, 'smart-gallery');
    await test.info().attach('smart-gallery-category-matrix', {
      body: JSON.stringify(matrix, null, 2),
      contentType: 'application/json',
    });
    for (const [filename, category] of Object.entries(matrix)) {
      expect(category, `${filename} must be categorized against the label set`).not.toBe('');
    }
    // Pinned (probe-confirmed): the emoji-dog scene is an animal under the photo set.
    expect(matrix['dog.png'], 'the dog scene categorizes as animals').toBe('animals');
    await page.screenshot({
      path: 'e2e-artifacts/screenshots/photo-smart-gallery.png',
      fullPage: true,
    });

    /* ── 2. image-search: cache-shared model + unshared state; text→ & image→image ── */
    await page.goto('/blocks/photo/image-search');
    // UNSHARED STATE: a fresh library despite smart-gallery having 6 photos.
    await expectEmptyLibrary(page, 'image-search');

    const weightsBeforeSecondLoad = modelRequests.filter((u) => HEAVY_WEIGHT_PATTERN.test(u)).length;
    await loadModel(page, 'image-search');
    const weightsAfterSecondLoad = modelRequests.filter((u) => HEAVY_WEIGHT_PATTERN.test(u)).length;
    // CACHE-SHARED MODEL: the same CLIP id is served from the browser cache — no
    // second full weight download within the context.
    expect(
      weightsAfterSecondLoad - weightsBeforeSecondLoad,
      'the second block must reuse the cached CLIP weights (no duplicate full download)',
    ).toBe(0);

    await ingestFixtures(page, 'image-search');

    // text → image: the football query ranks a real football photo first.
    await page.getByRole('textbox', { name: 'Search query' }).fill('a photo of people playing football');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Search results' })).toBeVisible({ timeout: 60_000 });
    await expect(
      page.getByRole('list', { name: 'Search results ranking' }).getByRole('listitem').first(),
    ).toHaveAttribute('data-filename', /football/);

    // image → image: a reference football finds its twin first.
    await page.getByRole('radiogroup', { name: 'Search mode' }).getByRole('radio', { name: 'Image' }).click();
    await page
      .getByRole('group', { name: 'Reference image upload' })
      .locator('input[type="file"]')
      .setInputFiles(fixturePath('football-copy.jpg'));
    await expect(page.getByRole('region', { name: 'Search results' })).toBeVisible({ timeout: 60_000 });
    await expect(
      page.getByRole('list', { name: 'Search results ranking' }).getByRole('listitem').first(),
    ).toHaveAttribute('data-filename', /football/);
    await page.screenshot({
      path: 'e2e-artifacts/screenshots/photo-image-search.png',
      fullPage: true,
    });

    /* ── 3. duplicate-finder: union-find + presets + keep-first bulk delete ── */
    await page.goto('/blocks/photo/duplicate-finder');
    await expectEmptyLibrary(page, 'duplicate-finder');
    await loadModel(page, 'duplicate-finder');
    await ingestFixtures(page, 'duplicate-finder');

    await page.getByRole('button', { name: 'Scan for duplicates' }).click();
    await expect(page.getByRole('group', { name: 'Duplicate scan stats' })).toBeVisible({ timeout: 60_000 });
    const groups = page.getByRole('group', { name: 'Duplicate group' });
    await expect(groups).toHaveCount(1);
    await expect(groups.first()).toHaveAttribute('data-size', '2');
    await expect(groups.first()).toHaveAttribute('data-members', /football\.jpg/);
    await expect(groups.first()).toHaveAttribute('data-members', /football-copy\.jpg/);
    await expect(page.getByRole('group', { name: 'Duplicate scan stats' })).toHaveAttribute('data-duplicates', '2');

    // Threshold preset re-groups from cached embeddings (no re-embed).
    await page.getByRole('group', { name: 'Duplicate threshold presets' }).getByRole('button', { name: /Relaxed/ }).click();
    await expect(page.getByRole('group', { name: 'Duplicate scan stats' })).toHaveAttribute('data-threshold', '0.85');
    await expect(groups).toHaveCount(1);
    await expect(page.getByRole('group', { name: 'Duplicate scan stats' })).toHaveAttribute('data-duplicates', '2');

    // Keep-first select + bulk delete removes exactly the duplicate copy.
    await page.getByRole('button', { name: 'Select duplicates' }).click();
    await expect(page.getByRole('button', { name: /^Delete \d+ selected/ })).toHaveAttribute('data-count', '1');
    await page.getByRole('button', { name: /^Delete \d+ selected/ }).click();
    await expect(page.getByRole('status', { name: 'Duplicate scan result' })).toBeVisible();
    await expect(photoMirror(page).getByRole('listitem')).toHaveCount(5);
    await page.screenshot({
      path: 'e2e-artifacts/screenshots/photo-duplicate-finder.png',
      fullPage: true,
    });

    /* ── 4. photo-categorizer: editable labels + re-categorization + facets ── */
    await page.goto('/blocks/photo/photo-categorizer');
    await expectEmptyLibrary(page, 'photo-categorizer');
    await loadModel(page, 'photo-categorizer');
    await ingestFixtures(page, 'photo-categorizer');

    // Facet filtering narrows the library (animals facet exists — dog is animals).
    const facets = page.getByRole('group', { name: 'Category facets' });
    await expect(facets).toBeVisible();
    await facets.getByRole('button', { name: /animals/ }).click();
    await expect(facets).toHaveAttribute('data-selected', 'animals');
    await expect(page.getByRole('region', { name: 'Categorized photos' })).toBeVisible();
    // Clear the facet.
    await facets.getByRole('button', { name: /animals/ }).click();

    // Switch to the Product preset and re-categorize (real re-classification, no re-embed).
    await page.getByRole('group', { name: 'Label set presets' }).getByRole('button', { name: 'Product', exact: true }).click();
    await page.getByRole('button', { name: 'Re-categorize library' }).click();
    await expect(page.getByRole('status', { name: 'Re-categorization progress' })).toHaveCount(0, {
      timeout: INGEST_TIMEOUT_MS,
    });
    // Every photo re-categorized against the new label set (product labels).
    const productMatrix = await readCategoryMatrix(page, 'photo-categorizer');
    await test.info().attach('photo-categorizer-product-matrix', {
      body: JSON.stringify(productMatrix, null, 2),
      contentType: 'application/json',
    });
    for (const [filename, category] of Object.entries(productMatrix)) {
      expect(category, `${filename} must be re-categorized against the product labels`).not.toBe('');
    }
    await page.screenshot({
      path: 'e2e-artifacts/screenshots/photo-categorizer.png',
      fullPage: true,
    });

    // Final cache-share proof across all four: the heavy CLIP weight was fetched
    // exactly once for the whole four-block journey.
    const totalHeavyDownloads = new Set(
      modelRequests.filter((u) => HEAVY_WEIGHT_PATTERN.test(u)),
    ).size;
    await test.info().attach('unique-heavy-weight-urls', {
      body: [...new Set(modelRequests.filter((u) => HEAVY_WEIGHT_PATTERN.test(u)))].join('\n'),
      contentType: 'text/plain',
    });
    expect(
      [...new Set(modelRequests.filter((u) => HEAVY_WEIGHT_PATTERN.test(u)))].sort(),
      'the three later blocks fetched ZERO heavy weight files beyond the first block\'s journey (browser-cache-shared)',
    ).toEqual([...uniqueAfterFirstBlock].sort());
    expect(totalHeavyDownloads, 'sanity: some heavy weights were fetched').toBeGreaterThan(0);
  });
});
