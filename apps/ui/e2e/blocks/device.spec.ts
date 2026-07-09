/**
 * @file device.spec.ts
 * @description E2E spec for the `device` category (split-agent-device Wave 3) —
 * the three zero-download blocks that grew out of `device-model-lab`:
 * `/blocks/device/device-report`, `/blocks/device/model-advisor`, and
 * `/blocks/device/gguf-explorer`, plus the `/blocks/device` category page. Every
 * lane of the dissolved `device-model-lab.spec.ts` is preserved with assertions
 * MOVED to the deep routes, never weakened.
 *
 * REAL, not mocked:
 * - Device report: real browser-API capability detection (`useCapabilities` /
 *   `useStorageQuota` / `useAdaptiveBatchSize`) in the Chromium under test —
 *   the spec asserts values consistent with headless Chromium (wasm, workers,
 *   IndexedDB pinned true; webgpu asserted boolean, NOT pinned — CI GPU
 *   availability varies).
 * - Recommendations / comparison / registration: the real in-memory core model
 *   registry (`recommendModels()` / `registerModel()`), zero network — the
 *   spec asserts ZERO model-host/HF requests across all advisor interactions.
 * - HuggingFace browse: the REAL anonymous HF API (search + `?blobs=true` file
 *   listing) via the PROMOTED `@localmode/wllama` discovery utils. No request
 *   interception, no fixtures.
 * - GGUF inspection: a REAL ~4KB HTTP Range read of the pinned file's header via
 *   wllama's `checkGGUFBrowserCompatFromURL`. The spec witnesses the
 *   partial-read contract: every GET for a `.gguf` URL must carry a `Range`
 *   header (an un-ranged GET would be a full model download — a hard invariant
 *   violation), while the rendered File size proves the file itself is
 *   model-sized (hundreds of MB).
 *
 * Pinned upstream model (documented for rotation, design D10 risk note):
 *   repo  bartowski/Llama-3.2-1B-Instruct-GGUF
 *   file  Llama-3.2-1B-Instruct-Q4_K_M.gguf
 * Only STRUCTURAL fields are asserted (architecture "llama", quantization
 * Q4_K_M, ~1B parameter magnitude) — never volatile ones (downloads, likes).
 * If the repo disappears upstream, rotate the pin and update the PINNED_*
 * constants below.
 *
 * GAPS (documented, not silently skipped) — carried over verbatim:
 * - Prefetch-to-cache ("Download to cache") DOWNLOADS a full model — this spec
 *   asserts the button's presence only and NEVER clicks it. The real download +
 *   cancel path is covered by the manual real-Chrome hardware sweep.
 * - The chat handoff RECEIVING side lands with the `blocks-chat` change; this
 *   spec asserts the emitted `/blocks/chat?model=…` URL contract only.
 * - The typed HF search error states (`gguf-error` data-kind rate-limit /
 *   network / not-found) cannot be deterministically triggered against the live
 *   anonymous API without mocking the boundary (forbidden); they are exercised
 *   by the primitive/unit layers and the manual sweep.
 *
 * Console discipline: console + pageerror messages are collected from test
 * start, attached as artifacts, and any console error hard-fails the test in
 * afterEach (EMPTY allowlist). No skips, no soft assertions, retries: 0.
 *
 * Selectors: role / accessible-name / text only (no data-testid). Machine-
 * readable driver state rides on data-* attributes of elements reached by an
 * accessibility-grade selector — e.g. the ranked-recommendation list is a
 * named `<ul aria-label="Ranked model recommendations">` whose `<li>` items keep
 * `data-model-id`/`data-score`; the compat verdict lives on the labelled group
 * `role="group" aria-label="Device compatibility"` (`data-can-run`); the GGUF
 * metadata grid is scoped WITHIN `role="group" aria-label="Model metadata"` and
 * its values are the `dl > div` rows of the primitive grid; the compare toggle is
 * the card's `Compare` button; the model-search-browser primitive exposes a
 * `role="combobox"` input, result rows (`role="option"`), and file rows
 * (`role="listitem"`) scoped within the `Browse HuggingFace GGUF models` region;
 * the "Inspecting:" line is scoped by text within the gguf-explorer page.
 */
import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';

/** One collected browser-side message (console event or uncaught page error). */
interface CollectedMessage {
  kind: 'console' | 'pageerror';
  type: string;
  text: string;
}

/** One passively observed request to a model host (never intercepted). */
interface CollectedRequest {
  url: string;
  method: string;
  /** The request's `Range` header, when sent (the ~4KB partial-read witness). */
  rangeHeader: string | null;
}

/** One recommendation card's machine-readable attributes. */
interface CardSnapshot {
  id: string;
  score: number;
}

/**
 * Allowlist for benign console errors. INTENTIONALLY EMPTY: the device blocks
 * must produce zero console errors end-to-end (including across the real HF API
 * calls and GGUF Range reads). Any entry added here needs a comment with why it
 * is harmless, who decided, and an upstream issue link.
 */
const CONSOLE_ERROR_ALLOWLIST: readonly RegExp[] = [];

/**
 * Requests that indicate model-host / model-asset traffic (same hosts the
 * platform spec polices): huggingface.co, hf.co, cdn-lfs mirrors, and raw
 * .onnx / .gguf assets. App assets on localhost never match.
 */
const MODEL_HOST_PATTERN = /huggingface\.co|hf\.co|cdn-lfs|\.onnx(\?|$)|\.gguf(\?|$)/i;

/** Deep routes for the three device blocks + the category page. */
const REPORT_ROUTE = '/blocks/device/device-report';
const ADVISOR_ROUTE = '/blocks/device/model-advisor';
const EXPLORER_ROUTE = '/blocks/device/gguf-explorer';
const CATEGORY_ROUTE = '/blocks/device';

/** Pinned E2E model (design D10) — see the rotation note in the file header. */
const PINNED_REPO = 'bartowski/Llama-3.2-1B-Instruct-GGUF';
const PINNED_FILE = 'Llama-3.2-1B-Instruct-Q4_K_M.gguf';
const PINNED_SHORTHAND = `${PINNED_REPO}:${PINNED_FILE}`;
/** Canonical download URL the explorer builds for an HF file selection. */
const PINNED_RESOLVE_URL = `https://huggingface.co/${PINNED_REPO}/resolve/main/${PINNED_FILE}`;

/** Distinctive id for the custom-registration test (in-memory only). */
const CUSTOM_MODEL_ID = 'e2e/custom-probe-model';

/** The handoff contract prefix (handoff.ts). */
const HANDOFF_PREFIX = '/blocks/chat?model=';

/** Absolute path for a named screenshot inside e2e-artifacts/screenshots/. */
function screenshotPath(name: string): string {
  return path.join(test.info().config.rootDir, 'e2e-artifacts', 'screenshots', name);
}

/** The ranked recommendation list items (named list → direct-child entries). */
function recommendationCards(page: Page): Locator {
  return page.locator('ul[aria-label="Ranked model recommendations"] > li[data-model-id]');
}

/** Snapshot every recommendation card's data-model-id / data-score, in DOM order. */
async function readCards(page: Page): Promise<CardSnapshot[]> {
  const raw = await recommendationCards(page).evaluateAll((els) =>
    els.map((el) => ({
      id: el.getAttribute('data-model-id') ?? '',
      score: el.getAttribute('data-score') ?? '',
    })),
  );
  return raw.map((entry) => ({ id: entry.id, score: Number.parseFloat(entry.score) }));
}

/** Every card must carry a model id and a numeric score in 0–100. */
function assertScoresInRange(cards: CardSnapshot[]): void {
  for (const card of cards) {
    expect(card.id, 'every recommendation-card must carry data-model-id').not.toBe('');
    expect(
      Number.isFinite(card.score),
      `data-score must parse to a finite number for ${card.id}`,
    ).toBe(true);
    expect(card.score, `score of ${card.id} must be >= 0`).toBeGreaterThanOrEqual(0);
    expect(card.score, `score of ${card.id} must be <= 100`).toBeLessThanOrEqual(100);
  }
}

/**
 * The <dd> value for one labeled row of the GGUFMetadataCard grid. The grid
 * renders `<dl><div><dt>{label}</dt><dd>{value}</dd></div>…</dl>`; the block's
 * "Additional details" <dl> uses bare dt/dd children, so `dl > div` scopes
 * queries to the primitive's grid only.
 */
function metadataField(page: Page, label: string): Locator {
  return page
    .getByRole('group', { name: 'Model metadata' })
    .locator('dl > div')
    .filter({ has: page.getByText(label, { exact: true }) })
    .locator('dd');
}

/**
 * Assert the compat verdict exposes data-can-run="true|false", then reveal the
 * chat-handoff CTA. CI hardware varies, so BOTH verdicts are legitimate:
 * `canRun === false` gates the CTA behind the documented explicit "Try anyway"
 * override, and both branches converge on the same hard assertion that the CTA
 * anchor is visible.
 */
async function revealChatHandoff(page: Page): Promise<Locator> {
  // The single run/no-run verdict lives on the labelled compat group.
  const verdict = page.getByRole('group', { name: 'Device compatibility' });
  await expect(verdict).toHaveAttribute('data-can-run', /^(true|false)$/);
  if ((await verdict.getAttribute('data-can-run')) === 'false') {
    const tryAnyway = page.getByRole('button', { name: 'Try anyway' });
    await expect(tryAnyway).toBeVisible();
    await tryAnyway.click();
  }
  const handoff = page.getByRole('link', { name: 'Chat with this model' });
  await expect(handoff).toBeVisible();
  return handoff;
}

/** Parse a handoff href into { pathname, params }, hard-failing on null. */
function parseHandoffHref(href: string | null): { pathname: string; params: URLSearchParams } {
  expect(href, 'chat-handoff must expose an href').not.toBeNull();
  const value = href ?? '';
  expect(value.startsWith(HANDOFF_PREFIX), `href must start with ${HANDOFF_PREFIX}`).toBe(true);
  const queryIndex = value.indexOf('?');
  return {
    pathname: value.slice(0, queryIndex),
    params: new URLSearchParams(value.slice(queryIndex + 1)),
  };
}

// Collected per test; the harness runs serially (fullyParallel: false) and both
// arrays are re-created in beforeEach.
let messages: CollectedMessage[] = [];
let modelHostRequests: CollectedRequest[] = [];

test.beforeEach(async ({ page }) => {
  messages = [];
  modelHostRequests = [];

  // Collect from test start — listeners attach before any page.goto().
  page.on('console', (message) => {
    messages.push({ kind: 'console', type: message.type(), text: message.text() });
  });
  page.on('pageerror', (error) => {
    messages.push({
      kind: 'pageerror',
      type: 'pageerror',
      text: `${error.name}: ${error.message}\n${error.stack ?? ''}`,
    });
  });
  // Passive observation only (no interception/mocking): record every request
  // that targets a model host, with its method and Range header so the
  // partial-read invariant is auditable offline.
  page.on('request', (request) => {
    const url = request.url();
    if (MODEL_HOST_PATTERN.test(url)) {
      modelHostRequests.push({
        url,
        method: request.method(),
        rangeHeader: request.headers()['range'] ?? null,
      });
    }
  });
});

test.afterEach(async ({}, testInfo) => {
  // Persist everything observed BEFORE asserting, so a failure still ships the
  // full record as offline-readable artifacts.
  await testInfo.attach('console-and-pageerror-messages.json', {
    body: JSON.stringify(messages, null, 2),
    contentType: 'application/json',
  });
  await testInfo.attach('model-host-requests.json', {
    body: JSON.stringify(modelHostRequests, null, 2),
    contentType: 'application/json',
  });

  const errors = messages.filter(
    (message) =>
      (message.kind === 'pageerror' || message.type === 'error') &&
      !CONSOLE_ERROR_ALLOWLIST.some((pattern) => pattern.test(message.text)),
  );
  expect(errors, 'console errors / uncaught page errors must be empty (empty allowlist)').toEqual(
    [],
  );
});

/* ── device-report block: zero-download capability report ─────────────────── */

test('device-report renders from browser APIs with zero model-host traffic', async ({ page }) => {
  await page.goto(REPORT_ROUTE);

  // Capability detection settles (sr-only status: detecting → ready).
  await expect(page.getByLabel('Device report status', { exact: true })).toHaveText('ready', {
    timeout: 30_000,
  });

  // Machine-readable capability dump (sr-only JSON) — real detected values.
  const rawCapabilities = await page
    .getByLabel('Detected capabilities', { exact: true })
    .textContent();
  expect(rawCapabilities, 'capabilities-raw must render once detection is ready').not.toBeNull();
  const caps = JSON.parse(rawCapabilities ?? '{}') as Record<string, unknown>;

  expect(typeof caps.cores, 'cores must be a number').toBe('number');
  expect(Number.isInteger(caps.cores), 'cores must be an integer').toBe(true);
  expect(caps.cores as number, 'cores must be positive').toBeGreaterThan(0);

  // All six feature flags are booleans…
  for (const flag of ['webgpu', 'wasm', 'simd', 'threads', 'indexeddb', 'webworkers'] as const) {
    expect(typeof caps[flag], `${flag} must be a boolean`).toBe('boolean');
  }
  // …and the three that headless Chromium always supports are pinned true.
  // webgpu is intentionally NOT pinned: CI runners may lack a usable GPU.
  expect(caps.wasm, 'Chromium supports WASM').toBe(true);
  expect(caps.webworkers, 'Chromium supports Web Workers').toBe(true);
  expect(caps.indexeddb, 'Chromium supports IndexedDB').toBe(true);

  // Storage quota from the real StorageManager API.
  const storage = page.getByLabel('Storage availability', { exact: true });
  await expect(storage).toBeVisible();
  const availableBytes = Number(await storage.getAttribute('data-available-bytes'));
  const quotaBytes = Number(await storage.getAttribute('data-quota-bytes'));
  expect(Number.isFinite(availableBytes), 'data-available-bytes must be numeric').toBe(true);
  expect(availableBytes, 'available bytes must be positive').toBeGreaterThan(0);
  expect(Number.isFinite(quotaBytes), 'data-quota-bytes must be numeric').toBe(true);
  expect(quotaBytes, 'quota bytes must be positive').toBeGreaterThan(0);

  // Adaptive batch size: a positive integer plus non-empty reasoning.
  const batchSize = page.getByLabel('Adaptive batch size', { exact: true });
  await expect(batchSize).toHaveAttribute('data-batch-size', /^\d+$/);
  const batch = Number(await batchSize.getAttribute('data-batch-size'));
  expect(Number.isInteger(batch), 'batch size must be an integer').toBe(true);
  expect(batch, 'batch size must be positive').toBeGreaterThan(0);
  await expect(page.getByLabel('Batch sizing reasoning', { exact: true })).not.toBeEmpty();

  // Zero-download-on-load invariant: after the network settles, NOT ONE request
  // went to huggingface.co / hf.co / cdn-lfs / .onnx / .gguf.
  await page.waitForLoadState('networkidle');
  expect(
    modelHostRequests.map((request) => request.url),
    'page load must issue zero model-host/HF requests',
  ).toEqual([]);

  await page.screenshot({ path: screenshotPath('device-report.png'), fullPage: true });
});

/* ── model-advisor block: ranked recommendations, compare, register ───────── */

test('model-advisor recommendations rank and re-rank by task with zero network', async ({
  page,
}) => {
  await page.goto(ADVISOR_ROUTE);

  // Default task is embedding: a numeric count line and at least one card.
  const recCount = page.getByLabel('Recommendation count', { exact: true });
  await expect(recCount).toHaveText(/^\d+$/, { timeout: 30_000 });
  const embeddingCount = Number(await recCount.innerText());
  expect(embeddingCount, 'embedding must yield at least one recommendation').toBeGreaterThanOrEqual(
    1,
  );

  // Coherence witness: the card grid matches the count line exactly.
  const cards = recommendationCards(page);
  await expect(cards).toHaveCount(embeddingCount);

  const embeddingCards = await readCards(page);
  assertScoresInRange(embeddingCards);
  // Ranked = scores are non-increasing in DOM order.
  for (let i = 1; i < embeddingCards.length; i += 1) {
    expect(
      embeddingCards[i].score,
      `scores must be non-increasing (index ${i}: ${embeddingCards[i].id})`,
    ).toBeLessThanOrEqual(embeddingCards[i - 1].score);
  }

  // Two-model comparison on the embedding list. The compare toggle is DELEGATED
  // to the primitive: it is the only button inside a card and carries
  // aria-pressed (documented primitive-prop gap).
  expect(
    embeddingCards.length,
    'comparison needs at least two embedding recommendations',
  ).toBeGreaterThanOrEqual(2);
  await cards.nth(0).getByRole('button', { name: 'Compare' }).click();
  // Scope hint text to the Preview panel (the Code tab shares the source string).
  await expect(page.locator('[data-block-preview]').getByText(/Select one more model/)).toBeVisible();
  await cards.nth(1).getByRole('button', { name: 'Compare' }).click();
  await expect(page.getByRole('group', { name: 'Model comparison' })).toBeVisible();

  await page.screenshot({ path: screenshotPath('device-advisor.png'), fullPage: true });

  // Two "Clear comparison" affordances exist while the panel is shown (the
  // block header control + the panel's own clear) — click the header one (first
  // in DOM); either clears the whole selection.
  await page.getByRole('button', { name: 'Clear comparison' }).first().click();
  await expect(page.getByRole('group', { name: 'Model comparison' })).toHaveCount(0);

  // Task switch: the selector is a native grouped <select>.
  const taskSelector = page.getByLabel('Task category');
  await expect(taskSelector.locator('option[value="speech-to-text"]')).toBeAttached();
  const beforeSignature = `${embeddingCards.length}|${embeddingCards[0]?.id ?? ''}`;
  await taskSelector.selectOption('speech-to-text');

  // Wait for the card list to CHANGE (different first model id or count)…
  await expect
    .poll(
      async () => {
        const now = await readCards(page);
        return `${now.length}|${now[0]?.id ?? ''}`;
      },
      { timeout: 15_000 },
    )
    .not.toBe(beforeSignature);

  // …then assert on the SETTLED state.
  await expect(recCount).toHaveText(/^\d+$/);
  const sttCards = await readCards(page);
  expect(
    `${sttCards.length}|${sttCards[0]?.id ?? ''}`,
    'the settled speech-to-text list must differ from the embedding list',
  ).not.toBe(beforeSignature);
  expect(sttCards.length, 'speech-to-text must yield at least one recommendation').toBeGreaterThanOrEqual(
    1,
  );
  assertScoresInRange(sttCards);

  // The whole advisor flow ran from the in-memory registry: zero network.
  expect(
    modelHostRequests.map((request) => request.url),
    'advisor interactions must issue zero model-host/HF requests',
  ).toEqual([]);
});

test('model-advisor custom registration surfaces in recommendations', async ({ page }) => {
  await page.goto(ADVISOR_ROUTE);
  await expect(page.getByLabel('Recommendation count', { exact: true })).toHaveText(/^\d+$/, {
    timeout: 30_000,
  });

  await page.getByRole('button', { name: 'Register custom model' }).click();
  const form = page.getByRole('form', { name: 'Register a custom model' });
  await expect(form).toBeVisible();
  // The in-memory / lost-on-refresh notice is part of the parity contract.
  // Scoped to the form (the Code tab shares the source string).
  await expect(form.getByText(/registered in-memory only/i)).toBeVisible();

  // Register-form fields, scoped WITHIN the form and by control ROLE so the
  // text inputs never collide with the labelled <select>s (whose wrapping label
  // pulls in option text, e.g. "Named Entity Recognition" contains "Name").
  await form.getByRole('textbox', { name: 'Model id' }).fill(CUSTOM_MODEL_ID);
  await form.getByRole('textbox', { name: 'Name' }).fill('E2E Custom Probe');
  await form.getByRole('textbox', { name: 'Provider' }).fill('custom');
  await form.getByRole('combobox', { name: 'Task' }).selectOption('embedding');
  await form.getByRole('spinbutton', { name: 'Size (MB)' }).fill('50');

  await form.getByRole('button', { name: 'Register model' }).click();

  // Scoped to the Preview panel (the Code tab shares the source string).
  const success = page.locator('[data-block-preview]').getByText(/recommendations refreshed/i);
  await expect(success).toBeVisible();
  await expect(success).toContainText(CUSTOM_MODEL_ID);

  // registerModel() + refresh: the custom entry appears as a ranked card.
  const customCard = page.locator(
    `ul[aria-label="Ranked model recommendations"] > li[data-model-id="${CUSTOM_MODEL_ID}"]`,
  );
  await expect(customCard).toBeVisible();
  const customScore = Number.parseFloat((await customCard.getAttribute('data-score')) ?? '');
  expect(Number.isFinite(customScore), 'custom entry must carry a numeric score').toBe(true);
  expect(customScore).toBeGreaterThanOrEqual(0);
  expect(customScore).toBeLessThanOrEqual(100);

  // Registration is purely in-memory: still zero network.
  expect(
    modelHostRequests.map((request) => request.url),
    'registration must issue zero model-host/HF requests',
  ).toEqual([]);
});

/* ── gguf-explorer block: real HF search + Range-read inspection + handoff ── */

test('gguf-explorer searches HuggingFace, lists GGUF files, inspects the pinned model, and emits the chat handoff', async ({
  page,
}) => {
  // REAL network test: anonymous HF API search + file listing + a ~4KB GGUF
  // Range read. Guard budget: 60s search + 30s files + 60s inspect + slack.
  test.setTimeout(240_000);

  await page.goto(EXPLORER_ROUTE);

  // Zero-download-on-load: nothing fires until the explicit browse activation.
  expect(
    modelHostRequests.map((request) => request.url),
    'no model-host request before an explicit browse',
  ).toEqual([]);

  // Explicit activation: the FIRST HF request fires only after this click.
  const browseButton = page.getByRole('button', { name: 'Browse HuggingFace' });
  await browseButton.click();
  await expect(browseButton).toHaveCount(0); // hidden once active

  // The model-search-browser primitive owns the search surface; everything it
  // renders lives inside the "Browse HuggingFace GGUF models" region.
  const ggufSearch = page.getByRole('region', { name: 'Browse HuggingFace GGUF models' });
  const searchInput = ggufSearch.getByRole('combobox');
  await expect(searchInput).toBeVisible();
  await searchInput.fill(PINNED_REPO);

  // Result rows are cmdk items (role="option"). Match the row whose title is
  // EXACTLY the pinned repo id.
  const pinnedRow = ggufSearch
    .getByRole('option')
    .filter({ has: page.getByText(PINNED_REPO, { exact: true }) })
    .first();
  await expect(pinnedRow).toBeVisible({ timeout: 60_000 });
  await pinnedRow.click();

  // The expanded repo's .gguf files render as list items; pick the pinned
  // Q4_K_M file's row and click its Select action.
  const fileRow = ggufSearch.getByRole('listitem').filter({ hasText: PINNED_FILE });
  await expect(fileRow).toBeVisible({ timeout: 30_000 });
  await fileRow.getByRole('button', { name: 'Select' }).click();

  // Inspection runs: either the transient ~4KB Range-read status line is still
  // visible, or (on a fast connection) the finished metadata card already is.
  await expect(
    page.getByRole('status').filter({ hasText: /Reading GGUF header/ }).or(page.getByRole('group', { name: 'Model metadata' })),
  ).toBeVisible({ timeout: 15_000 });

  const metadataCard = page.getByRole('group', { name: 'Model metadata' });
  await expect(metadataCard).toBeVisible({ timeout: 60_000 });

  // Structural metadata assertions (stable across upstream re-uploads):
  await expect(metadataField(page, 'Architecture')).toHaveText('llama');
  await expect(metadataField(page, 'Quantization')).toHaveText(/^Q4_K_M$/i);
  await expect(metadataField(page, 'Parameters')).toHaveText(/^1\.\d{2}B$/);
  await expect(metadataField(page, 'File size')).toHaveText(/^\d+(\.\d+)? (MB|GB)$/);

  // Compat verdict renders once (on the labelled group) with the machine attr.
  const compatGroup = page.getByRole('group', { name: 'Device compatibility' });
  await expect(compatGroup).toBeVisible();
  await expect(compatGroup).toHaveAttribute('data-can-run', /^(true|false)$/);

  // Handoff CTA: the href is exactly buildChatHandoffUrl(<HF resolve URL>).
  const handoff = await revealChatHandoff(page);
  const { pathname, params } = parseHandoffHref(await handoff.getAttribute('href'));
  expect(pathname).toBe('/blocks/chat');
  expect(params.get('model'), 'model param must decode to the HF resolve URL').toBe(
    PINNED_RESOLVE_URL,
  );
  expect(params.get('mmproj'), 'HF selections carry no mmproj').toBeNull();

  // …while the wire transferred only header bytes: the real HF API was hit, and
  // every GET for a .gguf URL carried a Range header (an un-ranged GET would be
  // a full model download — the invariant this block exists to keep).
  expect(
    modelHostRequests.some((request) => request.url.includes('huggingface.co/api/models')),
    'the real HF API must have been queried',
  ).toBe(true);
  const ggufGets = modelHostRequests.filter(
    (request) => request.method === 'GET' && /\.gguf(\?|$)/i.test(request.url),
  );
  expect(ggufGets.length, 'inspection must have issued .gguf GET requests').toBeGreaterThan(0);
  for (const request of ggufGets) {
    expect(
      request.rangeHeader,
      `.gguf GET must be a partial Range read, got un-ranged: ${request.url}`,
    ).toBeTruthy();
  }

  await page.screenshot({ path: screenshotPath('device-gguf-inspect.png'), fullPage: true });
});

test('gguf-explorer custom shorthand input inspects via wllama resolveModelUrl', async ({
  page,
}) => {
  // REAL network test: two ~4KB GGUF Range reads (shorthand + one curated model).
  test.setTimeout(180_000);

  await page.goto(EXPLORER_ROUTE);

  // The Inspect action is disabled while the input is empty (G1 contract).
  const inspectButton = page.getByRole('button', { name: 'Inspect' });
  await expect(inspectButton).toBeDisabled();

  await page.getByLabel('GGUF URL or HuggingFace shorthand').fill(PINNED_SHORTHAND);
  await expect(inspectButton).toBeEnabled();
  await inspectButton.click();

  await expect(
    page.getByRole('status').filter({ hasText: /Reading GGUF header/ }).or(page.getByRole('group', { name: 'Model metadata' })),
  ).toBeVisible({ timeout: 15_000 });
  const metadataCard = page.getByRole('group', { name: 'Model metadata' });
  await expect(metadataCard).toBeVisible({ timeout: 60_000 });

  // Same pinned file, resolved through wllama's resolveModelUrl shorthand path.
  await expect(metadataField(page, 'Architecture')).toHaveText('llama');
  await expect(metadataField(page, 'Quantization')).toHaveText(/^Q4_K_M$/i);
  await expect(page.getByRole('group', { name: 'Device compatibility' })).toHaveAttribute(
    'data-can-run',
    /^(true|false)$/,
  );

  // The handoff carries the shorthand VERBATIM (handoff.ts contract).
  const handoff = await revealChatHandoff(page);
  const { pathname, params } = parseHandoffHref(await handoff.getAttribute('href'));
  expect(pathname).toBe('/blocks/chat');
  expect(params.get('model'), 'model param must decode to the verbatim shorthand').toBe(
    PINNED_SHORTHAND,
  );

  // Prefetch surface: PRESENCE ONLY. Clicking would download a full model —
  // the download/cancel path is covered by the manual real-Chrome sweep.
  await expect(page.getByRole('button', { name: 'Download to cache' })).toBeVisible();

  // Curated catalog entry point: clicking a card starts inspection automatically.
  const firstCurated = page
    .getByRole('region', { name: 'Curated wllama model catalog' })
    .locator('[data-model-id]')
    .first();
  expect(
    await firstCurated.getAttribute('data-model-id'),
    'curated cards must carry their WLLAMA_MODELS id',
  ).toBeTruthy();
  await firstCurated.getByRole('button').click();

  // The inspector target switched: the "Inspecting:" line now shows the curated
  // entry's display name, not the shorthand. (The dissolved `explorer-section`
  // wrapper is gone — the gguf-explorer block IS the page, so scope by text.)
  const inspectingLine = page.locator('p').filter({ hasText: 'Inspecting:' });
  await expect(inspectingLine).not.toContainText(PINNED_SHORTHAND);

  // The curated model's real header inspection completes, and the prefetch
  // button exists for this curated model too — still never clicked.
  await expect(metadataCard).toBeVisible({ timeout: 60_000 });
  await expect(metadataField(page, 'Architecture')).not.toBeEmpty();
  await expect(page.getByRole('button', { name: 'Download to cache' })).toBeVisible();
});

/* ── category page: zero-download with all three blocks mounted (task 6.4) ── */

test('device category page mounts all three blocks with zero model-host traffic', async ({
  page,
}) => {
  await page.goto(CATEGORY_ROUTE);

  // All three block surfaces render their pre-load state on the category page.
  await expect(page.getByLabel('Device report status', { exact: true })).toHaveText('ready', {
    timeout: 30_000,
  });
  await expect(page.getByLabel('Recommendation count', { exact: true })).toHaveText(/^\d+$/, {
    timeout: 30_000,
  });
  const curatedRegion = page.getByRole('region', { name: 'Curated wllama model catalog' });
  await expect(curatedRegion).toBeVisible();
  expect(
    await curatedRegion.locator('[data-model-id]').count(),
    'curated catalog renders statically with no network',
  ).toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: 'Browse HuggingFace' })).toBeVisible();

  // Zero-download-on-load across the whole category page (all three mounted).
  await page.waitForLoadState('networkidle');
  expect(
    modelHostRequests.map((request) => request.url),
    'the /blocks/device category page must issue zero model-host/HF requests',
  ).toEqual([]);

  await page.screenshot({ path: screenshotPath('device-category.png'), fullPage: true });
});
