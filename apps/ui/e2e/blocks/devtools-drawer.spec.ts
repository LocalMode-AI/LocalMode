/**
 * @file devtools-drawer.spec.ts
 * @description E2E spec for the global DevTools drawer on the blocks pages
 * (`src/app/blocks/devtools-drawer/{host,devtools-drawer}.tsx`, mounted by
 * `src/app/blocks/layout.tsx`), driven on `/blocks/chat` — the flagship block
 * whose real model load + inference is the activity the drawer must observe.
 *
 * WHAT IS REAL vs WHAT IS STUBBED
 * - REAL: both model downloads (the chat block's default
 *   onnx-community/granite-4.0-350m-ONNX-web ~120MB with the drawer open,
 *   then the SmolLM2-135M GGUF ~70MB while the drawer is hidden — both from
 *   the HuggingFace Hub) and the inference turn run for real in the browser.
 *   Nothing at the model boundary is mocked and no route interception touches
 *   model fetches.
 * - FIXTURE GAP: none. The drawer needs no microphone/webcam/hardware.
 *
 * DRIVER CONTRACT
 * Accessibility selectors only (getByRole / getByLabel) — no `data-testid`.
 * The drawer's own controls: the floating toggle is a button named
 * "Open/Close LocalMode DevTools" (regex /LocalMode DevTools/); the drawer is
 * role="dialog" named "LocalMode DevTools" (matched with includeHidden so the
 * closed-but-mounted state — display:none, count 1 — stays distinguishable
 * from the unmounted state, count 0); the six tabs are role="tab" named
 * Queue/Events/Pipeline/Models/Device/VectorDB; the power-off control is a
 * button named "Power off devtools". Each surface scopes through its
 * `#devtools-panel-{queue,events,pipeline,models,device,vectordb}` tabpanel id
 * (grounded in devtools-drawer.tsx — e.g. the event log's
 * `ol[aria-label="Event log"]` rows are located INSIDE #devtools-panel-events).
 * The chat block's controls match chat.spec.ts's migration: the "Load model"
 * button, the "Model load status" / "Chat status" / "Streaming state" /
 * "Selected model" status regions, the "Message" textbox, the "Send message"
 * button, the "Latest assistant reply" region, the "Models" region, and user
 * turns counted via [data-slot="message"][data-role="user"]. Site chrome/nav
 * markup is never referenced.
 *
 * BUNDLE-ISOLATION SIGNATURES (the zero-overhead-when-closed gate)
 * The initial-page scan refetches every JS chunk referenced by the route's
 * OWN server-rendered HTML `<script src>` tags (the same route-attribution
 * technique as knowledge-base.spec.ts's bundle scan — App Router viewport
 * prefetch makes live-DOM/resource-timing scans false-positive) and greps the
 * chunk bodies for content that can ONLY come from the drawer body or the
 * `@localmode/devtools` package:
 * - `__LOCALMODE_DEVTOOLS__` — the bridge's window-global property name
 *   (verified present in packages/devtools dist; property accesses survive
 *   minification). host.tsx/layout.tsx never contain it.
 * - `Power off devtools` — the power-off control's aria-label, a
 *   drawer-body-only string literal (survives minification as a JSX attribute
 *   value). host.tsx/drawer-host.tsx contain no "Power off" text — their only
 *   button labels are the toggle's "Open/Close LocalMode DevTools".
 * Deliberately NOT used: `enableDevTools` (the HOST legitimately contains it
 * — `m.enableDevTools()` inside its dynamic-import callback — so it would
 * false-positive on the always-loaded toggle chunk) and the bare string
 * `LocalMode DevTools` (the host's toggle title/aria-label carries it, so it
 * is not drawer-body-exclusive).
 *
 * EXPECTED OBSERVABILITY (grounded in packages/devtools/src/collectors/)
 * The events collector subscribes `globalEventBus` for the vectordb events
 * (`vectordb:add|addMany|get|update|delete|deleteMany|search|clear|error|
 * open|close`) and the embedding/model events (`embedding:embedStart|
 * embedComplete|embedError|modelLoad|modelLoadError`); `bridge.models` is
 * populated exclusively from `modelLoad`/`modelLoadError`. A real model load
 * observed by devtools therefore surfaces as an `embedding:modelLoad` event
 * row and a model-cache row carrying the loaded model id.
 * The Queue and Pipeline surfaces are EXPECTED EMPTY and asserted on their
 * empty-state hint text as the honest witness: no current block creates an
 * InferenceQueue or Pipeline, so nothing calls `registerQueue()` /
 * `createDevToolsProgressCallback()` yet (documented in host.tsx, recorded
 * 2026-07-03; grep of src/app/blocks/ confirms zero usages).
 *
 * CONSOLE-ERROR POLICY
 * Console messages and uncaught page errors are collected context-wide from
 * the START of the test and persisted to attachments BEFORE asserting. The
 * allowlist is EMPTY: chat.spec.ts's single documented entry (LiteRT-LM WASM
 * absl INFO/WARNING logs routed through Emscripten printErr) only fires when
 * a litert model loads, and this journey loads only the transformers-backed
 * Granite model — so that entry does not apply here and is NOT carried over.
 */

import { mkdir } from 'node:fs/promises';
import * as path from 'node:path';
import { expect, test } from '@playwright/test';
import type { ConsoleMessage, Page, TestInfo, WebError } from '@playwright/test';

/** Fixed prompt so the expected turn shape is stable across runs. */
const PROMPT = 'Reply with exactly one short sentence about the sky.';

/** The chat block's default model (phase0-proven; loaded via `load-model`). */
const DEFAULT_MODEL_ID = 'onnx-community/granite-4.0-350m-ONNX-web';

/**
 * The second model, loaded for real while the drawer is HIDDEN — the smallest
 * language GGUF in the catalog (~70MB; chat.spec.ts's proven wllama-lane
 * entry). A plain chat turn emits NOTHING on globalEventBus (no package emits
 * embedding/vectordb events; verified 2026-07-03), so a load — whose
 * lifecycle the chat block emits as `modelLoad` (wiring-layer
 * instrumentation, chat.tsx ChatModel) — is the honest bridge-visible
 * hidden-period activity.
 */
const HIDDEN_LOAD_MODEL = {
  chip: /^WASM\s?\d+$/,
  rowText: 'SmolLM2 135M',
  key: 'wllama:SmolLM2-135M-Instruct-Q4_K_M',
  modelId: 'SmolLM2-135M-Instruct-Q4_K_M',
} as const;

/** localStorage key host.tsx persists the enabled state under. */
const DEVTOOLS_STORAGE_KEY = 'localmode-blocks:devtools-enabled';

/**
 * URLs that carry model bytes — same grounding as chat.spec.ts (the block's
 * transformers provider downloads from the HuggingFace Hub with cdn-lfs/xet
 * redirects; .onnx is the weight extension).
 */
const MODEL_BYTES_PATTERN = /huggingface\.co|hf\.co|cdn-lfs|\.onnx\b/i;

/**
 * Chunk-content signatures proving devtools code loaded. See the header for
 * why each is host-safe and why `enableDevTools`/`devtools-drawer` are not.
 */
const DEVTOOLS_CHUNK_SIGNATURES: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: 'the @localmode/devtools bridge (__LOCALMODE_DEVTOOLS__)', pattern: /__LOCALMODE_DEVTOOLS__/ },
  { name: 'the drawer body (the "Power off devtools" aria-label)', pattern: /Power off devtools/ },
];

/** One captured console message, persisted to attachments on every test. */
interface CollectedConsoleMessage {
  type: string;
  text: string;
  location: string;
  pageUrl: string;
}

/**
 * Console-error allowlist — EMPTY by policy (see header: chat.spec.ts's
 * litert entry does not fire on this journey, so nothing is carried over).
 */
const CONSOLE_ERROR_ALLOWLIST: ReadonlyArray<{
  pattern: RegExp;
  locationPattern?: RegExp;
  reason: string;
}> = [];

/** Whether a collected console message matches an allowlist entry. */
function isAllowlistedConsoleError(message: CollectedConsoleMessage): boolean {
  return CONSOLE_ERROR_ALLOWLIST.some(
    (entry) =>
      entry.pattern.test(message.text) &&
      (!entry.locationPattern || entry.locationPattern.test(message.location)),
  );
}

/**
 * apps/ui root, resolved from this spec file (NOT testInfo.config.rootDir —
 * see the chat spec's note: that resolves to e2e/ and breaks artifact paths).
 */
const APP_DIR = path.join(__dirname, '..', '..');

// Collectors are module-level and reset per test; the config runs serially in
// a single worker so there is no cross-test interleaving.
let consoleMessages: CollectedConsoleMessage[] = [];
let pageErrors: string[] = [];
let requestUrls: string[] = [];

/** Full-page screenshot into e2e-artifacts/screenshots/ + test attachment. */
async function captureScreenshot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const file = path.join(APP_DIR, 'e2e-artifacts', 'screenshots', name);
  await mkdir(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file, fullPage: true });
  await testInfo.attach(name, { path: file, contentType: 'image/png' });
}

/**
 * URLs of every Next.js static JS chunk referenced by the route's OWN
 * server-rendered HTML `<script src>` tags — the route's executed bundle
 * graph. Same technique (and rationale) as knowledge-base.spec.ts.
 */
async function routeHtmlChunkUrls(page: Page, route: string): Promise<string[]> {
  const response = await page.request.get(route);
  expect(response.ok(), `route HTML must be fetchable for scanning: ${route}`).toBe(true);
  const html = await response.text();
  const urls = new Set<string>();
  const scriptSrc = /<script\b[^>]*\bsrc="([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = scriptSrc.exec(html)) !== null) {
    const url = new URL(match[1], response.url()).href;
    if (url.includes('/_next/static/')) urls.add(url);
  }
  return [...urls];
}

/**
 * Refetch each of the route's own HTML-referenced chunks and scan its body
 * for the devtools signatures; returns one message per leak found.
 */
async function scanRouteChunksForDevtools(page: Page, route: string): Promise<string[]> {
  const leaks: string[] = [];
  const chunkUrls = await routeHtmlChunkUrls(page, route);
  // Positive control that the extraction is wired — a route with zero chunks
  // would make the scan pass vacuously.
  expect(chunkUrls.length, `${route} must reference at least one JS chunk`).toBeGreaterThan(0);
  for (const url of chunkUrls) {
    const response = await page.request.get(url);
    expect(response.ok(), `chunk must be fetchable for scanning: ${url}`).toBe(true);
    const body = await response.text();
    for (const { name, pattern } of DEVTOOLS_CHUNK_SIGNATURES) {
      if (pattern.test(body)) leaks.push(`${route} loaded ${url} which contains ${name}`);
    }
  }
  return leaks;
}

/** Read the devtools bridge state from the page (undefined when never enabled). */
async function readBridgeState(
  page: Page,
): Promise<{ exists: boolean; enabled: boolean | null; eventCount: number; modelIds: string[] }> {
  return page.evaluate(() => {
    const bridge = (window as Window & {
      __LOCALMODE_DEVTOOLS__?: {
        enabled?: boolean;
        events?: Array<unknown>;
        models?: Record<string, unknown>;
      };
    }).__LOCALMODE_DEVTOOLS__;
    return {
      exists: bridge !== undefined,
      enabled: bridge?.enabled ?? null,
      eventCount: bridge?.events?.length ?? 0,
      modelIds: Object.keys(bridge?.models ?? {}),
    };
  });
}

/**
 * Send a prompt through the real composer and wait for the full turn — the
 * chat spec's completeChatTurn contract (count-based assistant witness,
 * streaming settled, status ready).
 */
async function completeChatTurn(page: Page, text: string, turn: number): Promise<string> {
  // Role-scoped textbox (NOT getByLabel('Message'), which also substring-matches
  // the "Send message" button — strict-mode ambiguity).
  const textarea = page.getByRole('textbox', { name: 'Message' });
  const send = page.getByRole('button', { name: 'Send message' });

  await textarea.fill(text);
  await expect(send).toBeEnabled();
  await send.click();
  await expect(textarea).toHaveValue('');
  await expect(page.locator('[data-slot="message"][data-role="user"]')).toHaveCount(turn, {
    timeout: 30_000,
  });
  await expect(page.locator('[data-slot="message"]')).toHaveCount(turn * 2, {
    timeout: 4 * 60_000,
  });
  await expect(page.getByRole('status', { name: 'Streaming state' })).toHaveText('idle', {
    timeout: 4 * 60_000,
  });
  await expect(page.getByRole('status', { name: 'Chat status' })).toHaveText('ready', {
    timeout: 60_000,
  });

  const reply = (await page.getByRole('region', { name: 'Latest assistant reply' }).innerText()).trim();
  expect(reply.length, `assistant reply to "${text}" must be non-empty`).toBeGreaterThan(0);
  return reply;
}

// NOTE: the trace runs WITHOUT the screencast + DOM snapshotter (action log
// only), set GLOBALLY in playwright.config.ts. This lane is the worst case —
// it loads a WebGPU model while the observability drawer re-renders live
// activity — so the snapshotter flood would otherwise starve the load (a 420MB
// trace / 2276 frames was captured while granite, which loads in ~38s
// unmonitored, hung for 8min). See the config comment.

test.describe('blocks/devtools-drawer', () => {
  // The drawer is a fixed right-side overlay (max-w-md = 448px). At the
  // Playwright default 1280×720 its left edge (x=832) covers the chat block's
  // load-model button (center x≈863, measured 2026-07-03), so clicking Load
  // with the drawer open is impossible at that width — the click is
  // legitimately intercepted by the drawer, exactly as it would be for a real
  // user on a small window (they'd close the drawer first). The journey's
  // premise ("use the app WITH the drawer open") is a wide-desktop workflow,
  // so pin a realistic desktop viewport where ALL driven chat controls sit
  // genuinely beside the open drawer. Geometry probe (2026-07-03):
  //   1280×720  → the "Load model" button COVERED
  //   1600×900  → "Load model" clickable, but "Send message" (center x=1183 vs
  //               drawer left 1152) still COVERED
  //   1920×1080 → "Load model", the "Message" textbox, "Send message", and the
  //               "Models" region all clickable
  // This is an environment choice, not an assertion change — every
  // interaction still goes through real clicks.
  test.use({ viewport: { width: 1920, height: 1080 } });

  test.beforeEach(({ context }) => {
    consoleMessages = [];
    pageErrors = [];
    requestUrls = [];

    // Context-level listeners catch every page in the context and attach
    // BEFORE any navigation, so collection covers the test from the start.
    context.on('console', (message: ConsoleMessage) => {
      const { url, lineNumber, columnNumber } = message.location();
      consoleMessages.push({
        type: message.type(),
        text: message.text(),
        location: `${url}:${lineNumber}:${columnNumber}`,
        pageUrl: message.page()?.url() ?? '<no page>',
      });
    });
    // 'weberror' is the context-wide equivalent of page 'pageerror' (uncaught
    // exceptions incl. unhandled rejections, on ALL pages).
    context.on('weberror', (webError: WebError) => {
      const error = webError.error();
      pageErrors.push(error.stack ?? error.message);
    });
    context.on('request', (request) => {
      requestUrls.push(request.url());
    });
  });

  test.afterEach(async ({}, testInfo) => {
    // Persist the full capture BEFORE asserting so a red run is debuggable
    // offline from the HTML report / junit artifacts.
    await testInfo.attach('console-messages.json', {
      body: JSON.stringify(consoleMessages, null, 2),
      contentType: 'application/json',
    });
    await testInfo.attach('page-errors.json', {
      body: JSON.stringify(pageErrors, null, 2),
      contentType: 'application/json',
    });
    await testInfo.attach('network-requests.json', {
      body: JSON.stringify(requestUrls, null, 2),
      contentType: 'application/json',
    });

    const unexpectedConsoleErrors = consoleMessages.filter(
      (message) => message.type === 'error' && !isAllowlistedConsoleError(message),
    );
    expect(
      unexpectedConsoleErrors,
      'zero non-allowlisted console messages of type "error" are allowed',
    ).toEqual([]);
    expect(pageErrors, 'zero uncaught page errors are allowed').toEqual([]);
  });

  test('drawer lifecycle: lazy chunk, real-activity observability, hidden continuity, power-off', async ({ page }, testInfo) => {
    // One journey on one page ON PURPOSE: each model downloads exactly once —
    // Granite (~120MB, loaded + inferred with the drawer open) and SmolLM2
    // (~70MB, loaded while the drawer is hidden as the bridge-visible
    // hidden-period activity).
    test.setTimeout(25 * 60 * 1000);

    const toggle = page.getByRole('button', { name: /LocalMode DevTools/ });
    // includeHidden so the closed-but-mounted drawer (display:none) still
    // resolves — the journey distinguishes hidden (toBeHidden + count 1) from
    // unmounted (count 0).
    const drawer = page.getByRole('dialog', { name: 'LocalMode DevTools', includeHidden: true });

    await test.step('page load: toggle present, drawer absent, NO devtools chunk in the initial JS', async () => {
      await page.goto('/blocks/chat');
      await expect(page.getByRole('region', { name: 'Models' })).toBeVisible();

      // The layout-mounted host renders only the toggle; the body is not in
      // the DOM and devtools was never activated.
      await expect(toggle).toBeVisible();
      await expect(toggle).toHaveAttribute('aria-label', 'Open LocalMode DevTools');
      await expect(drawer).toHaveCount(0);

      const bridge = await readBridgeState(page);
      expect(bridge.exists, 'window.__LOCALMODE_DEVTOOLS__ must be undefined before first open').toBe(false);
      const persisted = await page.evaluate(
        (key) => window.localStorage.getItem(key),
        DEVTOOLS_STORAGE_KEY,
      );
      expect(persisted, 'no persisted enabled flag before first open').toBeNull();

      // The zero-overhead gate: none of the route's own HTML-referenced
      // chunks may contain drawer-body/devtools-package content.
      const leaks = await scanRouteChunksForDevtools(page, '/blocks/chat');
      expect(leaks, 'no devtools chunk may be part of the initial page JS').toEqual([]);

      // And no model bytes on page load (chat block invariant, re-pinned here
      // because the drawer journey depends on the load being user-triggered).
      expect(
        requestUrls.filter((url) => MODEL_BYTES_PATTERN.test(url)),
        'no model bytes may be fetched on page load',
      ).toEqual([]);

      await captureScreenshot(page, testInfo, 'devtools-01-initial.png');
    });

    await test.step('first open: drawer mounts, devtools enables, flag persists, Queue tab shows its empty state', async () => {
      await toggle.click();
      await expect(drawer).toBeVisible();
      await expect(toggle).toHaveAttribute('aria-label', 'Close LocalMode DevTools');

      // enableDevTools() ran (drawer-body mount effect): the public bridge
      // now exists and is enabled — the runtime witness that the lazy chunk
      // really loaded on open.
      await expect
        .poll(async () => (await readBridgeState(page)).enabled, {
          message: 'window.__LOCALMODE_DEVTOOLS__ must exist and be enabled after first open',
          timeout: 30_000,
        })
        .toBe(true);

      const persisted = await page.evaluate(
        (key) => window.localStorage.getItem(key),
        DEVTOOLS_STORAGE_KEY,
      );
      expect(persisted, `first open must persist ${DEVTOOLS_STORAGE_KEY}=1`).toBe('1');

      // Default tab is Queue; no block registers queues yet (documented in
      // host.tsx + verified by grep — see header), so the honest witness is
      // the primitive's empty state pointing at registerQueue().
      const queueMonitor = drawer.locator('#devtools-panel-queue');
      await expect(queueMonitor).toBeVisible();
      await expect(queueMonitor).toContainText('No queues registered');
      await expect(queueMonitor).toContainText('registerQueue()');

      await captureScreenshot(page, testInfo, 'devtools-02-open-queue-empty.png');
    });

    await test.step('real model load + fixed prompt with the drawer open (cold download ≤ 8 minutes)', async () => {
      const loadModel = page.getByRole('button', { name: 'Load model' });
      const modelStatus = page.getByRole('status', { name: 'Model load status' });
      await expect(loadModel).toHaveText('Load model');
      await loadModel.click();
      await expect(modelStatus).toHaveText(/^(loading|ready)$/, { timeout: 30_000 });
      await expect(modelStatus).toHaveText('ready', { timeout: 8 * 60_000 });
      await expect(loadModel).toHaveCount(0);

      // Positive control: a REAL download hit the model host.
      expect(
        requestUrls.filter((url) => MODEL_BYTES_PATTERN.test(url)).length,
        'a real model download must have hit the model host after load',
      ).toBeGreaterThan(0);

      await completeChatTurn(page, PROMPT, 1);
      await captureScreenshot(page, testInfo, 'devtools-03-after-inference.png');
    });

    await test.step('Models tab lists the loaded model', async () => {
      await page.getByRole('tab', { name: 'Models' }).click();
      const modelCache = drawer.locator('#devtools-panel-models');
      await expect(modelCache).toBeVisible();
      await captureScreenshot(page, testInfo, 'devtools-04-models-tab.png');

      // The spec contract (blocks-devtools-drawer, "Drawer observes a real
      // model load"): the Models surface shows the model the block just
      // loaded. bridge.models is fed by globalEventBus 'modelLoad' events
      // (collectors/events.ts → updateModelInfo).
      await expect(
        modelCache,
        `the Models surface must list the loaded model id (${DEFAULT_MODEL_ID})`,
      ).toContainText(DEFAULT_MODEL_ID, { timeout: 30_000 });
    });

    let eventCountBeforeHidden = 0;

    await test.step('Events tab shows the load/inference events', async () => {
      await page.getByRole('tab', { name: 'Events' }).click();
      const eventLog = drawer.locator('#devtools-panel-events');
      await expect(eventLog).toBeVisible();
      await captureScreenshot(page, testInfo, 'devtools-05-events-tab.png');

      // Grounded event identity (collectors/events.ts): a model load surfaces
      // as type 'embedding:modelLoad'. Filter by 'model' through the real
      // filter input, then require at least one matching row.
      const rows = eventLog.locator('ol[aria-label="Event log"] li');
      await expect(
        rows.first(),
        'the Events surface must show events from the real load/inference',
      ).toBeVisible({ timeout: 30_000 });

      await eventLog.getByLabel('Filter events by type').fill('model');
      await expect(
        rows.filter({ hasText: /modelLoad/ }).first(),
        "a load event (type 'embedding:modelLoad') must be visible under the 'model' filter",
      ).toBeVisible({ timeout: 30_000 });
      await eventLog.getByLabel('Filter events by type').fill('');

      eventCountBeforeHidden = (await readBridgeState(page)).eventCount;
      expect(
        eventCountBeforeHidden,
        'the bridge event buffer must be non-empty after a real load + inference',
      ).toBeGreaterThan(0);
    });

    await test.step('Pipeline tab shows its empty state (no block registers pipelines yet)', async () => {
      await page.getByRole('tab', { name: 'Pipeline' }).click();
      const inspector = drawer.locator('#devtools-panel-pipeline');
      await expect(inspector).toBeVisible();
      // Honest witness (documented gap, host.tsx 2026-07-03): no block calls
      // createDevToolsProgressCallback(), so the empty-state hint renders.
      await expect(inspector).toContainText('No pipeline runs tracked');
      await expect(inspector).toContainText('createDevToolsProgressCallback()');
      await captureScreenshot(page, testInfo, 'devtools-06-pipeline-empty.png');
    });

    await test.step('Device tab renders the environment-fed capability grid', async () => {
      await page.getByRole('tab', { name: 'Device' }).click();
      const devicePanel = drawer.locator('#devtools-panel-device');
      await expect(devicePanel).toBeVisible();
      // The grid reads the copy-owned useCapabilities itself; after detection
      // it renders the stats bar + feature rows (grounded in
      // device-capability-grid.tsx).
      await expect(devicePanel).toContainText('Cores', { timeout: 30_000 });
      await expect(devicePanel).toContainText('WebGPU');
      await captureScreenshot(page, testInfo, 'devtools-07-device.png');
    });

    await test.step('VectorDB tab renders (empty state: the chat journey ran no VectorDB ops)', async () => {
      await page.getByRole('tab', { name: 'VectorDB' }).click();
      const vectordbPanel = drawer.locator('#devtools-panel-vectordb');
      await expect(vectordbPanel).toBeVisible();
      // This journey never enables the semantic cache and no other VectorDB
      // is touched, so the drawer's own empty state is the honest witness
      // (grounded in devtools-drawer.tsx).
      await expect(vectordbPanel).toContainText('No VectorDB activity yet');
      await captureScreenshot(page, testInfo, 'devtools-08-vectordb.png');
    });

    await test.step('close hides the drawer while collectors keep running; a second real model load happens while hidden', async () => {
      // Return to the Events tab first so the reopen lands on it (tab state
      // survives close-by-design: the body stays mounted, display:none).
      await page.getByRole('tab', { name: 'Events' }).click();
      await toggle.click();
      await expect(drawer).toBeHidden();
      await expect(drawer).toHaveCount(1); // hidden, NOT unmounted
      await expect(toggle).toHaveAttribute('aria-label', 'Open LocalMode DevTools');

      // Collectors keep running while hidden: the bridge stays enabled.
      expect((await readBridgeState(page)).enabled).toBe(true);

      // The hidden-period activity is a REAL second model load — the only
      // chat-block activity that is bridge-visible by design: plain chat
      // turns emit nothing on globalEventBus (verified: no package emits
      // embedding/vectordb events; the wiring layer emits load-lifecycle
      // events — chat.tsx ChatModel). Select + load the smallest language
      // GGUF through the real picker (chat.spec.ts's proven wllama-lane
      // selection contract).
      const modelList = page.getByRole('region', { name: 'Models' });
      await modelList.getByRole('button', { name: HIDDEN_LOAD_MODEL.chip }).click();
      await modelList.locator('button', { hasText: HIDDEN_LOAD_MODEL.rowText }).first().click();
      await expect(page.getByRole('status', { name: 'Selected model' })).toHaveText(HIDDEN_LOAD_MODEL.key);
      const loadModel = page.getByRole('button', { name: 'Load model' });
      const modelStatus = page.getByRole('status', { name: 'Model load status' });
      await expect(loadModel).toHaveText('Load model');
      await loadModel.click();
      await expect(modelStatus).toHaveText(/^(loading|ready)$/, { timeout: 30_000 });
      await expect(modelStatus).toHaveText('ready', { timeout: 6 * 60_000 });

      await captureScreenshot(page, testInfo, 'devtools-09-hidden-second-load.png');
    });

    await test.step('reopen: activity captured while hidden is visible (events grew, Models lists both)', async () => {
      await toggle.click();
      await expect(drawer).toBeVisible();

      // Independent witness 1: the bridge buffer grew while the UI was hidden
      // (the second load's embedding:modelLoad event).
      await expect
        .poll(async () => (await readBridgeState(page)).eventCount, {
          message: 'the event buffer must have grown from the model load performed while the drawer was hidden',
          timeout: 30_000,
        })
        .toBeGreaterThan(eventCountBeforeHidden);

      // Independent witness 2: the Events surface (still the active tab)
      // renders rows — the reopened UI shows the hidden-period activity.
      const eventLog = drawer.locator('#devtools-panel-events');
      await expect(eventLog).toBeVisible();
      await expect(eventLog.locator('ol[aria-label="Event log"] li').first()).toBeVisible();

      // Independent witness 3: the Models surface now lists BOTH model ids —
      // the drawer-open load and the drawer-hidden load.
      await page.getByRole('tab', { name: 'Models' }).click();
      const modelCache = drawer.locator('#devtools-panel-models');
      await expect(modelCache).toContainText(DEFAULT_MODEL_ID, { timeout: 30_000 });
      await expect(modelCache).toContainText(HIDDEN_LOAD_MODEL.modelId, { timeout: 30_000 });

      await captureScreenshot(page, testInfo, 'devtools-10-reopened.png');
    });

    await test.step('power-off: surfaces unmount, collectors stop, persisted flag clears', async () => {
      await page.getByRole('button', { name: 'Power off devtools' }).click();

      // The host returns to the never-opened state: body unmounted, toggle
      // back to its open affordance.
      await expect(drawer).toHaveCount(0);
      await expect(toggle).toBeVisible();
      await expect(toggle).toHaveAttribute('aria-label', 'Open LocalMode DevTools');

      // disableDevTools() ran: the bridge is preserved for inspection but
      // flipped to disabled (packages/devtools/src/index.ts).
      const bridge = await readBridgeState(page);
      expect(bridge.exists, 'the last bridge snapshot stays inspectable after power-off').toBe(true);
      expect(bridge.enabled, 'power-off must disable collection').toBe(false);

      // The persisted enabled flag is cleared (host.tsx handlePowerOff).
      const persisted = await page.evaluate(
        (key) => window.localStorage.getItem(key),
        DEVTOOLS_STORAGE_KEY,
      );
      expect(persisted, `power-off must clear ${DEVTOOLS_STORAGE_KEY}`).toBeNull();

      await captureScreenshot(page, testInfo, 'devtools-11-power-off.png');
    });
  });
});
