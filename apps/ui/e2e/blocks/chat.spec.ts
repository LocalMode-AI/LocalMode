/**
 * @file chat.spec.ts
 * @description E2E spec for the CHAT block (`/blocks/chat`, body:
 * `src/app/blocks/chat/chat.tsx`).
 *
 * WHAT IS REAL vs WHAT IS STUBBED
 * - REAL: the model download (onnx-community/granite-4.0-350m-ONNX-web,
 *   ~120MB from the HuggingFace Hub) and every inference (first reply +
 *   regenerated variant) run for real in the browser. Nothing at the model
 *   boundary is mocked and no route interception touches model fetches.
 * - FIXTURE GAP: none. The chat block needs no microphone/webcam/hardware,
 *   so this spec exercises the full user flow end to end.
 *
 * DRIVER CONTRACT
 * Accessibility selectors only (getByRole / getByLabel / getByText) — never
 * site chrome/nav/shell markup. Raw state words live in named `role="status"`
 * sr-only regions the block exposes: "Model load status" is the raw
 * `useModelLoad` status ('idle' | 'loading' | 'ready' | 'error'), "Streaming
 * state" is 'streaming' | 'idle', and the branch page renders "<n> of <count>".
 * Structural markers used are the theming `data-slot`/`data-role` attributes on
 * the conversation primitives (message / agent-step-card / reasoning), never
 * `data-testid`.
 *
 * CONSOLE-ERROR POLICY
 * Console messages are collected context-wide (all pages) from the START of
 * the test, and uncaught page exceptions are collected via the context-level
 * 'weberror' event (the all-pages equivalent of page 'pageerror'). After each
 * test the full logs are written to the test's attachments FIRST (so failures
 * are debuggable offline), then the test hard-fails on ANY console message of
 * type 'error' and on ANY uncaught page error, except messages matching the
 * documented allowlist below — every entry must carry why it is harmless,
 * who decided, and an upstream reference, and is scoped as narrowly as the
 * noise allows (text prefix + emitting source location).
 *
 * The whole journey (load → reply → regenerate → branch → copy) is ONE test:
 * the model instance lives in a per-page module registry, so keeping a single
 * page avoids a second full multi-minute download.
 */

import { mkdir, rm } from 'node:fs/promises';
import * as path from 'node:path';
import { chromium, expect, test } from '@playwright/test';
import type { BrowserContext, ConsoleMessage, Page, TestInfo, WebError } from '@playwright/test';

/** Fixed prompt so the expected reply shape is stable across runs. */
const PROMPT = 'Reply with exactly one short sentence about the sky.';

/**
 * Console-error allowlist. Must stay minimal: every entry requires why it is
 * harmless, who approved it, and an upstream reference. Entries with a
 * `locationPattern` only match messages emitted from that source — a real
 * error from the same bundle still fails the run.
 */
const CONSOLE_ERROR_ALLOWLIST: ReadonlyArray<{
  pattern: RegExp;
  locationPattern?: RegExp;
  reason: string;
}> = [
  {
    // WHY HARMLESS: the LiteRT-LM WASM runtime (an Emscripten build) routes
    // its native absl INFO/WARNING logging through Module.printErr, which
    // Emscripten defaults to console.error — so ordinary runtime logging
    // (accelerator registration, .litertlm section parsing, XNNPACK delegate
    // creation) surfaces as console 'error' messages. Observed on every real
    // litert load (86 lines for one qwen3-0.6B load+inference), all prefixed
    // INFO:/WARNING: and all from the @litert-lm CDN wasm bundle.
    // SCOPE: text must start with "INFO: " or "WARNING: " AND the source
    // location must be the @litert-lm wasm bundle — real errors from the same
    // bundle (no INFO/WARNING prefix) still fail the run.
    // DECIDED BY: blocks-chat task 7.1 verification run, 2026-07-02.
    // UPSTREAM: Emscripten printErr default → console.error
    // (https://emscripten.org/docs/api_reference/module.html#Module.printErr);
    // no LiteRT-LM (github.com/google-ai-edge/LiteRT-LM) issue exists yet for
    // routing absl logs off stderr.
    pattern: /^(INFO|WARNING): /,
    locationPattern: /@litert-lm\/core@[\d.]+\/wasm\/litertlm_wasm/,
    reason:
      'LiteRT-LM WASM runtime absl INFO/WARNING logs emitted via Emscripten printErr (console.error); informational only',
  },
];

/** Whether a collected console message matches an allowlist entry. */
function isAllowlistedConsoleError(message: CollectedConsoleMessage): boolean {
  return CONSOLE_ERROR_ALLOWLIST.some(
    (entry) =>
      entry.pattern.test(message.text) &&
      (!entry.locationPattern || entry.locationPattern.test(message.location)),
  );
}

/**
 * URLs that carry model bytes. Grounded in the block's provider
 * (@localmode/transformers → HuggingFace Hub, with cdn-lfs / xethub (hf.co)
 * redirects for weights) plus the .onnx weight extension itself. Used both as
 * the negative page-load gate (nothing may match before "Load model" is
 * clicked) and as the positive control that a REAL download happened.
 */
const MODEL_BYTES_PATTERN = /huggingface\.co|hf\.co|cdn-lfs|\.onnx\b/i;

/** One captured console message, persisted to attachments on every test. */
interface CollectedConsoleMessage {
  type: string;
  text: string;
  location: string;
  pageUrl: string;
}

/** Lowercase, strip everything but letters/digits, collapse whitespace. */
function normalizeWords(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Word count over the normalized text. */
function countWords(text: string): number {
  const normalized = normalizeWords(text);
  return normalized === '' ? 0 : normalized.split(' ').length;
}

/**
 * apps/ui root, resolved from this spec file. NOT `testInfo.config.rootDir` —
 * that resolves to the testDir (`apps/ui/e2e/`), so paths built from it land
 * under `e2e/e2e-artifacts/` / miss `public/` fixtures entirely (found when
 * the vision lane first reached its setInputFiles step: ENOENT on
 * `e2e/public/test-assets/portrait.jpg`).
 */
const APP_DIR = path.join(__dirname, '..', '..');

/** Absolute path under apps/ui/e2e-artifacts/screenshots/ for a screenshot. */
function screenshotPath(_testInfo: TestInfo, name: string): string {
  return path.join(APP_DIR, 'e2e-artifacts', 'screenshots', name);
}

// Collectors are module-level and reset per test; the config runs serially in
// a single worker so there is no cross-test interleaving.
let consoleMessages: CollectedConsoleMessage[] = [];
let pageErrors: string[] = [];
let requestUrls: string[] = [];

// Clipboard permissions so CopyAction's navigator.clipboard.writeText()
// resolves and the spec can read the clipboard back for verification.
test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

test.describe('blocks/chat', () => {
  test.beforeEach(({ context }) => {
    consoleMessages = [];
    pageErrors = [];
    requestUrls = [];

    // Context-level listeners catch every page in the context (including any
    // popups) and are attached BEFORE the test body navigates anywhere, so
    // collection covers the test from the very start.
    context.on('console', (message: ConsoleMessage) => {
      const { url, lineNumber, columnNumber } = message.location();
      consoleMessages.push({
        type: message.type(),
        text: message.text(),
        location: `${url}:${lineNumber}:${columnNumber}`,
        pageUrl: message.page()?.url() ?? '<no page>',
      });
    });
    // 'weberror' is the context-wide equivalent of page 'pageerror': it fires
    // for uncaught exceptions (incl. unhandled rejections) on ALL pages.
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

  test('loads the real model and streams a reply', async ({ page }, testInfo) => {
    // One test intentionally chains cold download (≤8 min) + three real
    // inferences (warmup, reply, regenerate) on a single page so the model —
    // which lives in a per-page module registry — downloads exactly once.
    test.setTimeout(15 * 60 * 1000);

    const loadModel = page.getByRole('button', { name: 'Load model' });
    const modelStatus = page.getByRole('status', { name: 'Model load status' });
    const status = page.getByRole('status', { name: 'Chat status' });
    const streamingFlag = page.getByRole('status', { name: 'Streaming state' });
    const textarea = page.getByRole('textbox', { name: 'Message' });
    const send = page.getByRole('button', { name: 'Send message' });
    const lastAssistant = page.getByRole('region', { name: 'Latest assistant reply' });
    const branchPage = page.getByText(/^\d+ of \d+$/);
    const tokenMeter = page.getByRole('status', { name: 'Token usage' });

    let firstReply = '';

    await test.step('page load: model is gated behind the explicit Load model action', async () => {
      await page.goto('/blocks/chat');

      await expect(loadModel).toBeVisible();
      await expect(loadModel).toHaveText('Load model');
      // Raw useModelLoad status before any load() call is 'idle'.
      await expect(modelStatus).toHaveText('idle');
      await expect(status).toHaveText('idle');
      await expect(streamingFlag).toHaveText('idle');
      // Composer is gated: placeholder tells the user to load first, and the
      // empty composer cannot submit.
      // Prefix match: the grown block may append feature hints to the
      // placeholder (e.g. the slash-command hint) — gating text is the contract.
      await expect(textarea).toHaveAttribute(
        'placeholder',
        /^Load the model to start chatting…/,
      );
      await expect(send).toBeDisabled();
      // No conversation yet → no assistant turn in the DOM.
      await expect(lastAssistant).toHaveCount(0);
      // Token meter is still the chars/4 estimate before the first turn.
      await expect(tokenMeter).toHaveAttribute('title', /^Estimated \(chars\/4\)/);

      // Hard invariant: NO model bytes fetched on page load.
      const modelRequestsOnLoad = requestUrls.filter((url) =>
        MODEL_BYTES_PATTERN.test(url),
      );
      expect(
        modelRequestsOnLoad,
        'no model bytes may be fetched before "Load model" is clicked',
      ).toEqual([]);
    });

    await test.step('load the REAL model (cold download allowed up to 8 minutes)', async () => {
      await loadModel.click();
      // Fail fast if the click did nothing: status must enter 'loading'.
      await expect(modelStatus).toHaveText('loading', { timeout: 30_000 });
      await expect(modelStatus).toHaveText('ready', { timeout: 8 * 60_000 });
      // The load button is unmounted once the model is ready.
      await expect(loadModel).toHaveCount(0);
      await expect(status).toHaveText('ready');
      await expect(textarea).toHaveAttribute('placeholder', /^Ask the local model…/);

      // Positive control: proves the request collector is actually wired AND
      // that a REAL download hit the model host (fresh context = cold cache).
      const modelRequests = requestUrls.filter((url) => MODEL_BYTES_PATTERN.test(url));
      expect(
        modelRequests.length,
        'a real model download must have hit the model host after load',
      ).toBeGreaterThan(0);
    });

    await test.step('send the fixed prompt and stream a real reply', async () => {
      await textarea.fill(PROMPT);
      await expect(send).toBeEnabled();
      await send.click();

      // The composer clears on submit (immediate, synchronous with the send).
      await expect(textarea).toHaveValue('');
      // NOTE: we deliberately do NOT assert the transient 'streaming' flag
      // state — small models on fast hardware complete a short reply in
      // ~1-2 s, so the intermediate state can come and go between expect
      // polls (observed 2026-07-02: full reply in <15 s on WASM). The
      // durable witnesses of a real streamed turn are asserted instead:
      // a non-empty assistant reply, the flag settled back at 'idle', the
      // status pill at 'ready', and the token meter flipping to measured
      // output usage (only set when a real generation completes).
      await expect(lastAssistant).not.toHaveText('', { timeout: 4 * 60_000 });
      await expect(streamingFlag).toHaveText('idle', { timeout: 4 * 60_000 });
      await expect(status).toHaveText('ready');

      firstReply = (await lastAssistant.innerText()).trim();
      expect(firstReply.length, 'assistant reply must be non-empty').toBeGreaterThan(0);
      expect(
        countWords(firstReply),
        `assistant reply must have at least 3 words, got: "${firstReply}"`,
      ).toBeGreaterThanOrEqual(3);

      // Real usage from the completed turn now drives the token meter.
      await expect(tokenMeter).toHaveAttribute('title', /^Last turn · output measured/);

      // Exactly one variant exists → the branch selector is not rendered.
      await expect(branchPage).toHaveCount(0);

      await mkdir(path.dirname(screenshotPath(testInfo, 'chat-reply.png')), {
        recursive: true,
      });
      const replyShot = screenshotPath(testInfo, 'chat-reply.png');
      await page.screenshot({ path: replyShot, fullPage: true });
      await testInfo.attach('chat-reply.png', { path: replyShot, contentType: 'image/png' });
    });

    await test.step('regenerate creates a second variant (2 of 2)', async () => {
      await page.getByRole('button', { name: 'Regenerate' }).click();
      // Durable witness (transient 'regenerating' status can be faster than an
      // expect poll on fast hardware — same rationale as the streaming flag):
      // the branch selector appearing with "2 of 2" can ONLY happen when a
      // second real variant finished generating.
      await expect(branchPage).toBeVisible({ timeout: 4 * 60_000 });
      await expect(branchPage).toHaveText('2 of 2');
      await expect(status).toHaveText('ready', { timeout: 60_000 });
      await expect(streamingFlag).toHaveText('idle');

      const secondReply = (await lastAssistant.innerText()).trim();
      expect(
        countWords(secondReply),
        'regenerated variant must be a non-empty reply',
      ).toBeGreaterThanOrEqual(1);
    });

    await test.step('branch-previous navigates back to the original variant (1 of 2)', async () => {
      await page.getByRole('button', { name: 'Previous variant' }).click();
      await expect(branchPage).toHaveText('1 of 2');

      // Correctness: variant 1 must be the exact first reply captured earlier
      // (same renderer both times, so normalized innerText must match).
      const shownVariant = (await lastAssistant.innerText()).trim();
      expect(
        normalizeWords(shownVariant),
        'variant 1 of 2 must show the original first reply',
      ).toBe(normalizeWords(firstReply));
    });

    await test.step('copy writes the active assistant text to the clipboard', async () => {
      const copy = page.locator('[data-block-preview]').getByRole('button', { name: /copy|copied/i });
      await copy.click();
      // CopyAction only flips data-copied AFTER navigator.clipboard.writeText
      // resolves — first independent witness that the write really happened.
      await expect(copy).toHaveAttribute('data-copied', 'true');

      // Second independent witness: read the clipboard back.
      const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
      expect(clipboardText.trim().length, 'clipboard must be non-empty').toBeGreaterThan(0);

      // The copy carries the RAW variant text while the DOM shows it rendered
      // as markdown, so exact string equality is not the right check. Every
      // rendered word, however, must exist in the copied raw text (markdown
      // rendering never invents words).
      const clipboardWords = normalizeWords(clipboardText).split(' ');
      const visibleWords = normalizeWords(await lastAssistant.innerText())
        .split(' ')
        .filter((word) => word !== '');
      expect(visibleWords.length).toBeGreaterThan(0);
      const missingWords = visibleWords.filter((word) => !clipboardWords.includes(word));
      expect(
        missingWords,
        'every word rendered in the assistant reply must appear in the copied text',
      ).toEqual([]);

      const branchesShot = screenshotPath(testInfo, 'chat-branches.png');
      await page.screenshot({ path: branchesShot, fullPage: true });
      await testInfo.attach('chat-branches.png', {
        path: branchesShot,
        contentType: 'image/png',
      });
    });
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * EXTENDED PROVIDER LANES — blocks-chat tasks 6.3–6.12 (design D10 lane table)
 *
 * Every lane below drives the REAL block UI through accessibility selectors
 * (grounded in src/app/blocks/chat/chat.tsx's named roles/labels plus the
 * model-selector primitive's row/chip markup), performs REAL model downloads
 * and REAL inference (no mocked model boundary), captures screenshots +
 * console/network from all contexts, and hard-fails on any non-allowlisted
 * console error via the replicated afterEach below.
 *
 * MODEL CHOICES (grounded in the provider catalogs on 2026-07-02):
 * - wllama lane (6.3):    SmolLM2-135M-Instruct-Q4_K_M   ~70MB   (smallest language GGUF, packages/wllama/src/models.ts)
 * - litert lane (6.4):    qwen3-0.6B                     614MB   (the one litert entry WITHOUT requiresWebGPU)
 * - litert gate (6.4):    gemma-4-E2B                    no download (requiresWebGPU: true — gate path only)
 * - webllm lane (6.5):    SmolLM2-135M-Instruct-q0f16-MLC ~78MB  (smallest MLC entry; WebGPU runners only)
 * - vision lane (6.6):    onnx-community/Qwen3.5-0.8B-ONNX ~900MB on WASM (smallest transformers vision:true entry; q8 embed/vision + q4 decoder — the WASM-executable dtype mix)
 * - reasoning lane (6.8): DeepSeek-R1-Distill-Qwen-1.5B-Q4_K_M ~1.1GB (wllama supportsReasoning)
 * - agent lane (6.10):    litert qwen3-0.6B (614MB ≥ the 500MB agent gate) — run INSIDE the litert
 *                         lane's test so the already-downloaded weights are reused (0 extra bytes).
 *
 * MODEL-REUSE CONSTRAINT (why some lanes share one test):
 * Playwright gives every test a FRESH isolated browser context, and model
 * weights live in per-context storage (Cache API / IndexedDB / OPFS), so a
 * download in one test can NEVER be reused by another test. Reuse is only
 * possible within a single test on a single page. Therefore:
 * - 6.7 (semantic cache) runs as steps of the wllama lane test (design D10:
 *   "semantic cache: any loaded lane") — reuses the loaded SmolLM2-135M.
 * - 6.10 (agent mode) runs as steps of the litert lane test — reuses the
 *   loaded qwen3-0.6B (the smallest agent-capable model already paid for).
 *
 * STORAGE CONSTRAINT (why the reasoning lane runs in a persistent context):
 * Ephemeral Playwright contexts memory-back OPFS and corrupt single-file
 * writes past ~0.85–1GiB (sync-access-handle writes return bogus short-write
 * counts that wllama's OPFS worker ignores), so the 1.1GB reasoning GGUF can
 * NEVER be stored in the default fixture context. That lane launches its own
 * persistent (disk-backed) context — wiped before launch so the download
 * stays real — and feeds the same collectors + console-error policy.
 *
 * EXPECTED COLD-DOWNLOAD BUDGET (fresh context per test):
 * - wllama + cache lane:   ~70MB GGUF + ~34MB bge-small embedding  ≈ 105MB
 * - litert + gate + agent: ~614MB .litertlm (gate + agent add 0)   ≈ 614MB
 * - webllm lane:           ~78MB (WebGPU runners only, else 0)
 * - vision lane:           ~900MB ONNX (WASM q8/q8/q4 component mix)
 * - reasoning lane:        ~1.1GB GGUF
 * - custom-URL lane:       ~70MB GGUF re-download (fresh context) + ~8KB metadata
 * - provider-switch lane:  ~70MB GGUF + ~120MB Granite (switch-back is cached in-context)
 * - bundle isolation:      ~8KB metadata only
 * ≈ 2.6GB total without WebGPU, ≈ 2.7GB with (plus the phase0 Granite lane's ~120MB).
 *
 * HARDWARE-GATED BRANCHES: WebGPU is probed at runtime with the SAME adapter
 * probe the block and the capability-gate primitive use (requestAdapter() —
 * `navigator.gpu` presence alone is a lie on headless/CI Chromium). BOTH
 * branches of every gated lane carry real assertions and an explicit
 * `hardware-gap` annotation — never a silent skip.
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * URLs that carry model weights for ANY of the four providers: model hosts
 * (HuggingFace + its cdn-lfs/xet redirect hosts) plus the three weight file
 * extensions. Tested against host+pathname only (see {@link isModelWeightUrl})
 * so a local page URL whose ?model= query EMBEDS a HuggingFace URL does not
 * false-positive.
 */
const MODEL_WEIGHT_PATTERN = /huggingface\.co|hf\.co|cdn-lfs|\.onnx\b|\.gguf\b|\.litertlm\b/i;

/** host+pathname of a URL (query dropped), or the raw string if unparseable. */
function modelWeightPart(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return rawUrl;
  }
}

/** Whether a request URL carries (or could carry) model-weight bytes. */
function isModelWeightUrl(rawUrl: string): boolean {
  return MODEL_WEIGHT_PATTERN.test(modelWeightPart(rawUrl));
}

/* ── lane model constants (IDs verified against the merged catalog sources) ── */

/** wllama lane + custom-URL lane model (smallest language GGUF, ~70MB). */
const WLLAMA_SMALL = {
  rowText: 'SmolLM2 135M',
  key: 'wllama:SmolLM2-135M-Instruct-Q4_K_M',
  /** Raw catalog URL (packages/wllama/src/models.ts) — also the ?model= handoff payload. */
  ggufUrl:
    'https://huggingface.co/bartowski/SmolLM2-135M-Instruct-GGUF/resolve/main/SmolLM2-135M-Instruct-Q4_K_M.gguf',
} as const;

/** litert inference + agent lane model (614MB — the CPU-capable litert entry, ≥500MB agent gate). */
const LITERT_QWEN = { rowText: 'Qwen3 0.6B', key: 'litert:qwen3-0.6B' } as const;

/** litert gate model (requiresWebGPU: true — never downloaded by this suite). */
const LITERT_GEMMA = { rowText: 'Gemma 4 E2B', key: 'litert:gemma-4-E2B' } as const;

/** webllm lane model (smallest MLC entry, ~78MB, WebGPU-only provider). */
const WEBLLM_SMALL = {
  rowText: 'SmolLM2 135M',
  key: 'webllm:SmolLM2-135M-Instruct-q0f16-MLC',
  name: 'SmolLM2 135M',
} as const;

/** vision lane model (smallest transformers vision:true entry, ~900MB on WASM). */
const VISION_MODEL = {
  rowText: 'Qwen3.5 0.8B (ONNX)',
  key: 'transformers:onnx-community/Qwen3.5-0.8B-ONNX',
} as const;

/** reasoning lane model (wllama supportsReasoning DeepSeek-R1 distill, ~1.1GB). */
const REASONING_MODEL = {
  rowText: 'DeepSeek R1 1.5B',
  key: 'wllama:DeepSeek-R1-Distill-Qwen-1.5B-Q4_K_M',
} as const;

/** provider-switch lane's second model (phase0's proven Granite, ~120MB). */
const GRANITE = {
  rowText: 'Granite 4.0 350M (ONNX)',
  key: 'transformers:onnx-community/granite-4.0-350m-ONNX-web',
} as const;

/* ── backend filter chips (model-selector FilterChip accessible names: label + count) ── */
const CHIP_WASM = /^WASM\s?\d+$/;
const CHIP_ONNX = /^ONNX\s?\d+$/;
const CHIP_WEBGPU = /^WebGPU\s?\d+$/;
const CHIP_LITERT = /^LiteRT\s?\d+$/;

/* ── fixed lane prompts ── */

/** Cache lane prompt — sent twice verbatim; the exact-match path guarantees the hit. */
const CACHE_PROMPT = 'In one short sentence, what is the capital of France?';

/** Vision lane prompt over the committed fixture image. */
const VISION_PROMPT = 'Describe this image in one sentence.';

/**
 * Keywords the vision reply must reference. Grounded by inspecting
 * public/test-assets/portrait.jpg: a football (soccer) match photo — players
 * in blue jerseys on a grass pitch with a ball. Substring match on the
 * lowercased reply; at least ONE must appear.
 */
const VISION_KEYWORDS = [
  'football',
  'soccer',
  'player',
  'people',
  'person',
  'man',
  'ball',
  'field',
  'sport',
  'jersey',
  'stadium',
  'grass',
  'athlete',
  'game',
  'pitch',
  'uniform',
] as const;

/** Reasoning lane prompt — invites a visible think phase. */
const REASONING_PROMPT = 'What is 17 + 25? Think step by step.';

/**
 * Agent lane prompt. MUST be answerable from the block's static knowledge
 * base: agent-tools.ts's corpus covers quantum computing, biology
 * (photosynthesis, CRISPR), AI, climate, and space — it has NO article about
 * semantic caching or similar, so the question targets the photosynthesis
 * article ('bio-1: Photosynthesis Process') to guarantee a KB hit.
 */
const AGENT_PROMPT = 'What does the knowledge base say about photosynthesis?';

/* ── model-host request capture (Range-discipline assertions, 6.9/6.12) ── */

/** One captured model-host request; `range` resolves to the Range header (or null). */
interface ModelHostRequest {
  url: string;
  method: string;
  range: Promise<string | null>;
}

/** Reset per extended-lane test by the replicated beforeEach below. */
let modelHostRequests: ModelHostRequest[] = [];

/** Await every captured model-host request's headers into a plain array. */
async function resolveModelHostRequests(): Promise<
  Array<{ url: string; method: string; range: string | null }>
> {
  return Promise.all(
    modelHostRequests.map(async (request) => ({
      url: request.url,
      method: request.method,
      range: await request.range,
    })),
  );
}

/**
 * Attach the extended-lane collectors to a browser context. Shared between
 * the fixture context (every lane) and the reasoning lane's persistent
 * context, so both feed the SAME module-level collectors and the SAME
 * afterEach console-error policy.
 */
function attachExtendedCollectors(context: BrowserContext): void {
  context.on('console', (message: ConsoleMessage) => {
    const { url, lineNumber, columnNumber } = message.location();
    consoleMessages.push({
      type: message.type(),
      text: message.text(),
      location: `${url}:${lineNumber}:${columnNumber}`,
      pageUrl: message.page()?.url() ?? '<no page>',
    });
  });
  context.on('weberror', (webError: WebError) => {
    const error = webError.error();
    pageErrors.push(error.stack ?? error.message);
  });
  context.on('request', (request) => {
    requestUrls.push(request.url());
    if (isModelWeightUrl(request.url())) {
      modelHostRequests.push({
        url: request.url(),
        method: request.method(),
        range: request
          .allHeaders()
          .then((headers) => headers['range'] ?? null)
          .catch(() => null),
      });
    }
  });
}

/**
 * Replicates the phase0 harness hooks for the extended-lane describe (the
 * phase0 describe's beforeEach/afterEach are scoped to it and must stay
 * byte-identical, so they cannot be shared). Identical semantics: collectors
 * reset + attached before assertions, empty allowlist, hard fail on any
 * console error or uncaught page error — plus a model-host request collector
 * (method + Range header) for the metadata-fetch discipline lanes.
 */
function registerExtendedChatHarness(): void {
  test.beforeEach(({ context }) => {
    consoleMessages = [];
    pageErrors = [];
    requestUrls = [];
    modelHostRequests = [];

    attachExtendedCollectors(context);
  });

  test.afterEach(async ({}, testInfo) => {
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
    await testInfo.attach('model-host-requests.json', {
      body: JSON.stringify(await resolveModelHostRequests(), null, 2),
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
}

/* ── shared lane helpers ── */

/** Full-page screenshot into e2e-artifacts/screenshots/ + test attachment. */
async function captureLaneScreenshot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const file = screenshotPath(testInfo, name);
  await mkdir(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file, fullPage: true });
  await testInfo.attach(name, { path: file, contentType: 'image/png' });
}

/**
 * Runtime WebGPU detection — the SAME requestAdapter() probe the block
 * (`isWebGPUSupported`) and the capability-gate primitive (`useCapabilities`)
 * perform, so branch decisions always match what the UI actually renders.
 * Headless/CI Chromium exposes `navigator.gpu` with zero adapters, so a
 * presence check would branch wrong.
 */
async function probeWebGPUAdapter(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    const gpu = (navigator as Navigator & {
      gpu?: { requestAdapter?: () => Promise<unknown | null> };
    }).gpu;
    if (!gpu || typeof gpu.requestAdapter !== 'function') return false;
    try {
      const adapter = await gpu.requestAdapter();
      return adapter !== null && adapter !== undefined;
    } catch {
      return false;
    }
  });
}

/**
 * Drive the REAL model-selector UI: backend filter chip → row select button.
 * Rows are the selector primitive's text-bearing buttons (the icon-only
 * download/delete buttons carry no text, and filter chips carry no model
 * name, so `hasText` uniquely hits the row's main select button once the
 * backend filter narrows the list). Confirms via the `selected-model` mirror.
 */
async function selectCatalogModel(
  page: Page,
  chip: RegExp,
  rowText: string,
  expectedKey: string,
): Promise<void> {
  const modelList = page.getByRole('region', { name: 'Models' });
  await modelList.getByRole('button', { name: chip }).click();
  await modelList.locator('button', { hasText: rowText }).first().click();
  await expect(page.getByRole('status', { name: 'Selected model' })).toHaveText(expectedKey);
}

/**
 * Click the header Load action and wait for the real load to finish.
 * The intermediate 'loading' state is asserted tolerantly (loading|ready)
 * because a warm-in-context cached load can outrun an expect poll; 'ready'
 * plus the unmounted load button are the durable witnesses.
 */
async function loadSelectedModel(page: Page, readyTimeoutMs: number): Promise<void> {
  const loadModel = page.getByRole('button', { name: 'Load model' });
  const modelStatus = page.getByRole('status', { name: 'Model load status' });
  await expect(loadModel).toHaveText('Load model');
  await loadModel.click();
  // Fail fast if the click did nothing: the raw status must leave 'idle'.
  await expect(modelStatus).toHaveText(/^(loading|ready)$/, { timeout: 30_000 });
  await expect(modelStatus).toHaveText('ready', { timeout: readyTimeoutMs });
  await expect(loadModel).toHaveCount(0);
}

/** Options for {@link completeChatTurn}. */
interface ChatTurnOptions {
  /** 1-based user-turn number this send creates in the CURRENT conversation. */
  turn: number;
  /** Ceiling for the model to finish streaming the reply. */
  replyTimeoutMs: number;
  /** Minimum reply word count required by the lane contract. Default 1. */
  minWords?: number;
}

/**
 * Send a prompt through the real composer and wait for the full turn:
 * composer clears, the user message lands, the assistant message exists
 * (message count reaches turn×2 — count-based so it also works when
 * `last-assistant` already holds a previous turn's text), streaming settles,
 * status returns to ready. Returns the trimmed assistant reply text.
 */
async function completeChatTurn(
  page: Page,
  text: string,
  options: ChatTurnOptions,
): Promise<string> {
  const { turn, replyTimeoutMs, minWords = 1 } = options;
  const textarea = page.getByRole('textbox', { name: 'Message' });
  const send = page.getByRole('button', { name: 'Send message' });

  await textarea.fill(text);
  await expect(send).toBeEnabled();
  await send.click();
  await expect(textarea).toHaveValue('');
  await expect(page.locator('[data-slot="message"][data-role="user"]')).toHaveCount(turn, { timeout: 30_000 });
  await expect(page.locator('[data-slot="message"]')).toHaveCount(turn * 2, {
    timeout: replyTimeoutMs,
  });
  await expect(page.getByRole('status', { name: 'Streaming state' })).toHaveText('idle', {
    timeout: replyTimeoutMs,
  });
  await expect(page.getByRole('status', { name: 'Chat status' })).toHaveText('ready', { timeout: 60_000 });

  const reply = (await page.getByRole('region', { name: 'Latest assistant reply' }).innerText()).trim();
  expect(reply.length, `assistant reply to "${text}" must be non-empty`).toBeGreaterThan(0);
  expect(
    countWords(reply),
    `assistant reply to "${text}" must have at least ${minWords} word(s), got: "${reply}"`,
  ).toBeGreaterThanOrEqual(minWords);
  return reply;
}

test.describe('blocks/chat extended lanes (6.3–6.12)', () => {
  registerExtendedChatHarness();

  test('wllama lane: SmolLM2-135M real load, inference, threading badge + semantic cache hit lifecycle (6.3 + 6.7)', async ({ page }, testInfo) => {
    // 6.7 runs in this test ON PURPOSE: the semantic-cache steps reuse the
    // already-loaded SmolLM2-135M (fresh contexts cannot share downloads).
    // Budget: ~70MB GGUF cold + ~34MB bge-small when the cache toggles on.
    test.setTimeout(20 * 60 * 1000);

    await test.step('page load fetches zero model bytes', async () => {
      await page.goto('/blocks/chat');
      await expect(page.getByRole('region', { name: 'Models' })).toBeVisible();
      expect(
        requestUrls.filter(isModelWeightUrl),
        'no model bytes may be fetched on page load',
      ).toEqual([]);
    });

    await test.step('select via the real UI: WASM chip → SmolLM2 135M row', async () => {
      await selectCatalogModel(page, CHIP_WASM, WLLAMA_SMALL.rowText, WLLAMA_SMALL.key);
      // Selection alone must not download anything either.
      expect(requestUrls.filter(isModelWeightUrl)).toEqual([]);
    });

    await test.step('real GGUF load (cold download ≤ 8 minutes)', async () => {
      await loadSelectedModel(page, 8 * 60_000);
      // Positive control: the collector saw the real GGUF download.
      const ggufRequests = requestUrls.filter(
        (url) => isModelWeightUrl(url) && /SmolLM2-135M/i.test(modelWeightPart(url)),
      );
      expect(
        ggufRequests.length,
        'a real SmolLM2-135M GGUF download must have hit the model host',
      ).toBeGreaterThan(0);
    });

    await test.step('fixed prompt streams a non-empty reply (≥3 words)', async () => {
      await completeChatTurn(page, PROMPT, {
        turn: 1,
        replyTimeoutMs: 4 * 60_000,
        minWords: 3,
      });
    });

    await test.step('provider badge shows wllama + a WASM threading tier', async () => {
      const providerBadge = page.getByRole('status', { name: 'Active provider' });
      await expect(providerBadge).toContainText('wllama');
      // The tier depends on the runner's cross-origin isolation — assert the
      // badge renders exactly one of the two documented tiers, not which.
      await expect(providerBadge).toContainText(/(Multi|Single)-thread/);
      await captureLaneScreenshot(page, testInfo, 'chat-wllama.png');
    });

    let firstCachedReply = '';

    await test.step('6.7: enable the semantic cache (downloads bge-small)', async () => {
      const cacheFlag = page.getByRole('status', { name: 'Semantic cache state' });
      await expect(cacheFlag).toHaveText('off');
      await page.getByRole('region', { name: 'Semantic cache' }).getByRole('switch').click();
      // Toggling on mounts the CacheHost, which warms (downloads) the
      // Xenova/bge-small-en-v1.5 embedding model — an explicit user action.
      await expect(cacheFlag).toHaveText('on', { timeout: 4 * 60_000 });
      const embeddingRequests = requestUrls.filter((url) => /bge-small/i.test(url));
      expect(
        embeddingRequests.length,
        'enabling the cache must really download the bge-small embedding model',
      ).toBeGreaterThan(0);
    });

    await test.step('6.7: first send is a miss and gets stored', async () => {
      firstCachedReply = await completeChatTurn(page, CACHE_PROMPT, {
        turn: 2,
        replyTimeoutMs: 4 * 60_000,
      });
    });

    await test.step('6.7: the SAME prompt again is a cache hit', async () => {
      const hitReply = await completeChatTurn(page, CACHE_PROMPT, {
        turn: 3,
        replyTimeoutMs: 4 * 60_000,
      });
      // Witness 1: the answering message carries the cache-hit badge.
      await expect(page.getByRole('status', { name: 'Cache hit' })).toBeVisible({ timeout: 60_000 });
      await expect(page.getByRole('status', { name: 'Cache hit' })).toHaveCount(1);
      // Witness 2: a hit returns the STORED response verbatim.
      expect(
        normalizeWords(hitReply),
        'a cache hit must return the stored first response verbatim',
      ).toBe(normalizeWords(firstCachedReply));
      // Witness 3: the status bar reflects ≥1 hit (1 hit / 1 miss → 50% hit)
      // and the stored entry.
      const cacheBar = page.getByRole('region', { name: 'Semantic cache' });
      await expect(cacheBar).toContainText('1 entry', { timeout: 30_000 });
      await expect(cacheBar).toContainText(/[1-9]\d*% hit/, { timeout: 30_000 });
      await captureLaneScreenshot(page, testInfo, 'chat-semantic-cache.png');
    });

    await test.step('6.7: clear-cache empties the stored entries', async () => {
      const cacheBar = page.getByRole('region', { name: 'Semantic cache' });
      await cacheBar.getByRole('button', { name: 'Clear cache' }).click();
      // Grounded in core semantic-cache.ts: clear() removes ENTRIES (the
      // entry count resets to 0) but hit/miss are lifetime counters that
      // survive clear by design — so the hit-rate text is NOT asserted to 0.
      await expect(cacheBar).toContainText('0 entries', { timeout: 30_000 });
    });
  });

  test('litert lane: Gemma 4 WebGPU gate, qwen3-0.6B real load + inference, agent mode (6.4 + 6.10)', async ({ page }, testInfo) => {
    // Two design-D10 lanes share this test ON PURPOSE: the agent lane (6.10)
    // needs a ≥500MB model, and litert qwen3-0.6B (614MB ≥ the 500MB gate) is
    // already downloaded here — fresh contexts cannot share downloads, so
    // running the agent on this page costs 0 extra bytes. The Gemma 4 gate
    // never downloads anything on either branch. Ceiling covers the 614MB
    // cold download + a CPU multi-step ReAct run.
    test.setTimeout(30 * 60 * 1000);

    const selectedModel = page.getByRole('status', { name: 'Selected model' });

    await page.goto('/blocks/chat');
    await expect(page.getByRole('region', { name: 'Models' })).toBeVisible();
    const hasWebGPU = await probeWebGPUAdapter(page);

    await test.step('Gemma 4 gate: select the requiresWebGPU litert entry', async () => {
      await selectCatalogModel(page, CHIP_LITERT, LITERT_GEMMA.rowText, LITERT_GEMMA.key);

      if (!hasWebGPU) {
        // Non-WebGPU branch: the capability-gate fallback replaces the chat
        // surface, explains the requirement, and offers the CPU-capable qwen.
        const gateFallback = page.getByRole('status', { name: 'Model gate' });
        await expect(gateFallback).toBeVisible({ timeout: 30_000 });
        await expect(gateFallback).toContainText('WebGPU required');
        await expect(page.getByRole('button', { name: 'Load model' })).toHaveCount(0);
        await captureLaneScreenshot(page, testInfo, 'chat-litert-gate.png');
        testInfo.annotations.push({
          type: 'hardware-gap',
          description:
            'runner has no WebGPU adapter: litert Gemma 4 full load is hardware-gated; the capability-gate fallback + one-click qwen3-0.6B offer were asserted instead',
        });
        // The fallback's one-click offer switches the selection to qwen.
        await page.getByRole('button', { name: /use .* instead/i }).click();
        await expect(selectedModel).toHaveText(LITERT_QWEN.key);
      } else {
        // WebGPU branch: the gate is OPEN — the real chat surface renders
        // with the explicit Load affordance. The multi-GB Gemma 4 download is
        // DELIBERATELY not performed (documented gap; design D10 marks the
        // full Gemma download as optional on capable hardware).
        await expect(page.getByRole('button', { name: 'Load model' })).toBeVisible({ timeout: 30_000 });
        await expect(page.getByRole('button', { name: 'Load model' })).toHaveText('Load model');
        await expect(page.getByRole('status', { name: 'Model load status' })).toHaveText('idle');
        await expect(page.getByRole('status', { name: 'Model gate' })).toHaveCount(0);
        await captureLaneScreenshot(page, testInfo, 'chat-litert-gate.png');
        testInfo.annotations.push({
          type: 'hardware-gap',
          description:
            'runner HAS WebGPU: the Gemma 4 gate renders open (load affordance asserted); the multi-GB Gemma 4 download itself was deliberately skipped and remains a documented gap',
        });
        // Continue the lane on the CPU-capable qwen via the real selector.
        await selectCatalogModel(page, CHIP_LITERT, LITERT_QWEN.rowText, LITERT_QWEN.key);
      }

      // Either branch: the whole gate phase must download NOTHING.
      expect(
        requestUrls.filter(isModelWeightUrl),
        'the Gemma 4 gate phase must fetch zero model bytes on either branch',
      ).toEqual([]);
    });

    await test.step('qwen3-0.6B real load (614MB cold download ≤ 15 minutes)', async () => {
      await loadSelectedModel(page, 15 * 60_000);
      const litertRequests = requestUrls.filter(
        (url) => isModelWeightUrl(url) && /\.litertlm\b/i.test(modelWeightPart(url)),
      );
      expect(
        litertRequests.length,
        'a real .litertlm download must have hit the model host',
      ).toBeGreaterThan(0);
    });

    await test.step('fixed prompt streams a non-empty reply (≥3 words)', async () => {
      await completeChatTurn(page, PROMPT, {
        turn: 1,
        replyTimeoutMs: 5 * 60_000,
        minWords: 3,
      });
      const providerBadge = page.getByRole('status', { name: 'Active provider' });
      await expect(providerBadge).toContainText('LiteRT');
      // Threading tier is a wllama-only sub-badge (hideThreading elsewhere).
      await expect(providerBadge).not.toContainText(/-thread/);
      await captureLaneScreenshot(page, testInfo, 'chat-litert.png');
    });

    await test.step('6.10: agent mode on the ≥500MB model answers from the knowledge base', async () => {
      const agentToggle = page.getByRole('switch', { name: 'Agent mode' });
      await expect(agentToggle).toBeEnabled();
      await agentToggle.click();
      await expect(agentToggle).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByRole('status', { name: 'Agent mode state' })).toHaveText('on');
      // Spec: the semantic cache is unavailable while agent mode is active.
      await expect(page.getByRole('status', { name: 'Semantic cache state' })).toHaveText('agent-disabled');

      const textarea = page.getByRole('textbox', { name: 'Message' });
      const send = page.getByRole('button', { name: 'Send message' });
      await textarea.fill(AGENT_PROMPT);
      await expect(send).toBeEnabled();
      await send.click();
      await expect(page.locator('[data-slot="message"][data-role="user"]')).toHaveCount(1, { timeout: 30_000 });
      // The transient 'running' flag is deliberately NOT asserted — same
      // rationale as the phase0 streaming-flag note: with /no_think
      // suppressing Qwen3's thinking, the whole ReAct run (two short action
      // generations + a KB lookup) can start and settle between expect polls,
      // so the intermediate state is not reliably observable. The durable
      // witnesses of a real run follow: the flag settled at idle, rendered
      // step cards with real args/observations, the finish card, and a
      // non-empty final answer.
      await expect(page.getByRole('status', { name: 'Agent run state' })).toHaveText('idle', { timeout: 10 * 60_000 });

      const agentSteps = page.getByRole('region', { name: 'Agent steps' }).last();
      const stepCards = agentSteps.locator('[data-slot="agent-step-card"]');
      expect(await stepCards.count(), 'the run must render at least one step').toBeGreaterThan(0);

      // The search_knowledge_base tool step: name badge + duration in the
      // header; args + observation revealed by expanding the card.
      const searchCard = agentSteps
        .locator('[data-slot="agent-step-card"][data-type="tool_call"]')
        .filter({ hasText: 'search_knowledge_base' })
        .first();
      await expect(searchCard).toBeVisible();
      // No leading \b: the card's extracted innerText concatenates inline
      // segments without whitespace ("…search_knowledge_base25263ms"), so a
      // word boundary before the digits never exists. Digits followed by a
      // terminal "ms" is the duration witness.
      await expect(searchCard).toContainText(/\d+ms\b/);
      await searchCard.locator('button').first().click();
      await expect(searchCard.locator('pre code')).toContainText(/query/i);
      await expect(searchCard).toContainText(/photosynthesis/i);

      // The final answer card with non-empty result text.
      const finishCard = agentSteps.locator('[data-slot="agent-step-card"][data-type="finish"]');
      await expect(finishCard).toBeVisible();
      await expect(finishCard).toContainText('Final answer');
      const finalAnswer = (await finishCard.locator('p').last().innerText()).trim();
      expect(finalAnswer.length, 'the agent final answer must be non-empty').toBeGreaterThan(0);
      await captureLaneScreenshot(page, testInfo, 'chat-agent.png');
    });

    await test.step('6.10: switching to a <500MB model auto-disables agent mode', async () => {
      await selectCatalogModel(page, CHIP_WASM, WLLAMA_SMALL.rowText, WLLAMA_SMALL.key);
      const agentToggle = page.getByRole('switch', { name: 'Agent mode' });
      await expect(page.getByRole('status', { name: 'Agent mode state' })).toHaveText('unavailable');
      await expect(agentToggle).toBeDisabled();
      await expect(agentToggle).toHaveAttribute('aria-checked', 'false');
      // The toggle explains WHY it is unavailable (grounded reason text).
      await expect(agentToggle).toHaveAttribute('title', /at least 500 MB/);
    });
  });

  test('webllm lane: smallest MLC model with WebGPU, WebGPU-required marking without (6.5)', async ({ page }, testInfo) => {
    test.setTimeout(15 * 60 * 1000);

    await page.goto('/blocks/chat');
    await expect(page.getByRole('region', { name: 'Models' })).toBeVisible();
    const hasWebGPU = await probeWebGPUAdapter(page);
    const modelList = page.getByRole('region', { name: 'Models' });

    if (hasWebGPU) {
      await test.step('real MLC load + inference on WebGPU', async () => {
        await selectCatalogModel(page, CHIP_WEBGPU, WEBLLM_SMALL.rowText, WEBLLM_SMALL.key);
        await loadSelectedModel(page, 10 * 60_000);
        const modelRequests = requestUrls.filter(isModelWeightUrl);
        expect(
          modelRequests.length,
          'a real MLC model download must have hit the model host',
        ).toBeGreaterThan(0);
        await completeChatTurn(page, PROMPT, {
          turn: 1,
          replyTimeoutMs: 4 * 60_000,
          minWords: 3,
        });
        await expect(page.getByRole('status', { name: 'Active provider' })).toContainText('WebLLM');
        await captureLaneScreenshot(page, testInfo, 'chat-webllm.png');
      });
    } else {
      await test.step('degraded behavior without WebGPU: entries marked WebGPU-required', async () => {
        // Grounded in model-selector.tsx: without hasWebGPU, backend:webgpu
        // rows are de-emphasized, the select + download buttons are DISABLED,
        // and the row carries the "Requires WebGPU" reason.
        const webllmEntryCount = await page
          .getByRole('list', { name: 'Model catalog mirror' })
          .locator('[data-backend="webllm"]')
          .count();
        expect(
          webllmEntryCount,
          'the catalog must contain webllm entries to mark',
        ).toBeGreaterThan(0);

        const webgpuChip = modelList.getByRole('button', { name: CHIP_WEBGPU });
        // The filter chip count matches the catalog's webllm entry count.
        await expect(webgpuChip).toContainText(String(webllmEntryCount));
        await webgpuChip.click();

        const targetRow = modelList
          .locator('button', { hasText: WEBLLM_SMALL.rowText })
          .first();
        await expect(targetRow).toBeVisible();
        await expect(targetRow).toBeDisabled();
        await expect(targetRow).toContainText('Requires WebGPU');
        await expect(
          modelList.getByRole('button', { name: `Download ${WEBLLM_SMALL.name}` }),
        ).toBeDisabled();

        await captureLaneScreenshot(page, testInfo, 'chat-webllm-gate.png');
        testInfo.annotations.push({
          type: 'hardware-gap',
          description:
            'webllm inference lane requires WebGPU; ran gate-behavior assertions instead',
        });
      });
    }
  });

  test('vision lane: image attachment round-trip on the smallest vision model (6.6)', async ({ page }, testInfo) => {
    // ~900MB cold download (WASM q8/q8/q4 mix) + a WASM-path vision inference (slow without GPU).
    test.setTimeout(20 * 60 * 1000);

    await page.goto('/blocks/chat');
    await expect(page.getByRole('region', { name: 'Models' })).toBeVisible();

    await test.step('select and really load the vision model', async () => {
      await selectCatalogModel(page, CHIP_ONNX, VISION_MODEL.rowText, VISION_MODEL.key);
      // The attachments affordance only exists for vision-capable models.
      await expect(page.getByRole('region', { name: 'Attachments' })).toBeVisible();
      await loadSelectedModel(page, 12 * 60_000);
      const modelRequests = requestUrls.filter(
        (url) => isModelWeightUrl(url) && /Qwen3\.5-0\.8B/i.test(modelWeightPart(url)),
      );
      expect(
        modelRequests.length,
        'a real Qwen3.5-0.8B download must have hit the model host',
      ).toBeGreaterThan(0);
    });

    await test.step('attach the committed fixture image via the real file input', async () => {
      const fixture = path.join(APP_DIR, 'public', 'test-assets', 'portrait.jpg');
      await page
        .getByRole('region', { name: 'Attachments' })
        .locator('input[type="file"]')
        .setInputFiles(fixture);
      // A removable preview chip renders; no validation error for a valid jpeg.
      await expect(
        page.getByRole('region', { name: 'Attachments' }).locator('[data-slot="attachment-chip"]'),
      ).toHaveCount(1);
      await expect(page.getByRole('alert', { name: 'Attachment error' })).toHaveCount(0);
    });

    await test.step('the reply references the image and the transcript renders it', async () => {
      const reply = await completeChatTurn(page, VISION_PROMPT, {
        turn: 1,
        replyTimeoutMs: 8 * 60_000,
        minWords: 3,
      });

      // Witness 1: the sent user message renders the attached image.
      const sentImage = page.locator('[data-slot="message"][data-role="user"]').last().locator('img');
      await expect(sentImage.first()).toBeVisible();

      // Witness 2: the streamed reply reflects the image content (a football
      // match photo — see VISION_KEYWORDS grounding).
      const lowered = reply.toLowerCase();
      const matched = VISION_KEYWORDS.filter((keyword) => lowered.includes(keyword));
      expect(
        matched.length,
        `the reply must reference the image content (expected ≥1 of ${VISION_KEYWORDS.join(
          ', ',
        )}), got: "${reply}"`,
      ).toBeGreaterThan(0);

      await captureLaneScreenshot(page, testInfo, 'chat-vision.png');
    });
  });

  test('reasoning lane: DeepSeek-R1 distill renders thinking separately from the answer (6.8)', async ({}, testInfo) => {
    // ~1.1GB cold download + a long visible think phase on the WASM path.
    test.setTimeout(28 * 60 * 1000);

    // PERSISTENT (disk-backed) context — REQUIRED for this lane, not an
    // optimization. Ephemeral Playwright contexts back OPFS with memory
    // (navigator.storage quota ≈ 4GiB) and single-file writes break around
    // ~0.85–1GiB: FileSystemSyncAccessHandle.write() returns a bogus
    // short-write count (0xFFFFFFF8) instead of throwing, wllama's OPFS
    // worker ignores write return values, and the 1.1GB GGUF silently
    // truncates (~887MB observed) → native load fails → wllama's re-download
    // loop ends in "Model file not found". Verified 2026-07-02 by isolation
    // probes: a plain fetch of the same URL completes (1,117,320,800 bytes),
    // and a persistent-context load succeeds. Everything else stays real:
    // real Chromium, real cold download (profile dir wiped before launch),
    // real inference; console/page-error/request capture feeds the same
    // module collectors and the same empty-allowlist afterEach policy.
    const profileDir = path.join(APP_DIR, 'e2e-artifacts', 'chat-reasoning-profile');
    await rm(profileDir, { recursive: true, force: true }); // cold start — the download must be real
    const persistentContext = await chromium.launchPersistentContext(profileDir, {
      headless: true,
      baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    });
    attachExtendedCollectors(persistentContext);
    testInfo.annotations.push({
      type: 'lane-note',
      description:
        'runs in a persistent (disk-backed) browser context: ephemeral contexts memory-back OPFS and corrupt >~1GiB single-file writes, so the 1.1GB GGUF cannot be stored in the default fixture context',
    });

    try {
      const page = persistentContext.pages()[0] ?? (await persistentContext.newPage());

      await page.goto('/blocks/chat');
      await expect(page.getByRole('region', { name: 'Models' })).toBeVisible();

      await test.step('select and really load the reasoning model', async () => {
        await selectCatalogModel(page, CHIP_WASM, REASONING_MODEL.rowText, REASONING_MODEL.key);
        await loadSelectedModel(page, 18 * 60_000);
        const modelRequests = requestUrls.filter(
          (url) => isModelWeightUrl(url) && /DeepSeek-R1-Distill-Qwen-1\.5B/i.test(modelWeightPart(url)),
        );
        expect(
          modelRequests.length,
          'a real DeepSeek-R1 distill download must have hit the model host',
        ).toBeGreaterThan(0);
      });

      await runReasoningAssertions(page, testInfo);
    } finally {
      await persistentContext.close();
      // Free the ~1.1GB profile — screenshots/attachments carry the evidence.
      await rm(profileDir, { recursive: true, force: true });
    }
  });

  /** The reasoning-display assertions (design D5's two valid outcomes). */
  async function runReasoningAssertions(page: Page, testInfo: TestInfo): Promise<void> {
    await test.step('thinking renders separately from the answer (or lossless fallback)', async () => {
      const reply = await completeChatTurn(page, REASONING_PROMPT, {
        turn: 1,
        replyTimeoutMs: 8 * 60_000,
      });

      const lastAssistant = page.getByRole('region', { name: 'Latest assistant reply' });
      const reasoningBlock = lastAssistant.getByRole('region', { name: 'Model reasoning' });
      const hasThinkingBlock = (await reasoningBlock.count()) > 0;

      // Design D5 defines EXACTLY two valid outcomes — both are asserted for
      // real and the branch that ran is recorded. Never a bare pass.
      if (hasThinkingBlock) {
        testInfo.annotations.push({
          type: 'lane-branch',
          description:
            'reasoning: <think> delimiters emitted — segmented thinking/answer rendering asserted',
        });

        const trigger = reasoningBlock.first().locator('[data-slot="reasoning-trigger"]');
        await expect(trigger).toBeVisible();
        const triggerText = (await trigger.innerText()).trim();
        expect(triggerText).toContain('Reasoning');
        // The completed block shows a measured thinking duration
        // (formatElapsed renders "12s" / "1m 5s").
        expect(
          triggerText,
          'the completed reasoning block must show a thinking duration',
        ).toMatch(/\b\d+s\b|\b\d+m \d+s\b/);

        // With the block collapsed (post-stream auto-collapse), the visible
        // reply is trigger + answer only — subtract the trigger to get the
        // answer and assert it is non-empty and free of raw delimiters.
        const collapsedText = (await lastAssistant.innerText()).trim();
        const answerText = collapsedText.replace(triggerText, '').trim();
        expect(
          answerText.length,
          'the final answer must be non-empty and rendered separately from thinking',
        ).toBeGreaterThan(0);
        expect(answerText).not.toContain('<think>');
        expect(answerText).not.toContain('</think>');

        // Expand and assert the thinking content itself.
        await trigger.click();
        const content = reasoningBlock.first().locator('[data-slot="reasoning-content"]');
        await expect(content).toBeVisible();
        const thinkingText = (await content.innerText()).trim();
        expect(thinkingText.length, 'thinking content must be non-empty').toBeGreaterThan(0);
        expect(
          normalizeWords(thinkingText),
          'thinking content must be separate from the answer text',
        ).not.toBe(normalizeWords(answerText));
      } else {
        testInfo.annotations.push({
          type: 'lane-branch',
          description:
            'reasoning: no <think> delimiters emitted (model variance) — lossless full-text fallback asserted',
        });
        // Lossless degradation: the full text renders as a normal answer.
        expect(countWords(reply)).toBeGreaterThanOrEqual(3);
        expect(reply).not.toContain('<think>');
        expect(reply).not.toContain('</think>');
        await expect(page.getByRole('region', { name: 'Model reasoning' })).toHaveCount(0);
      }

      await captureLaneScreenshot(page, testInfo, 'chat-reasoning.png');
    });
  }

  test('custom GGUF URL + handoff: prefill, compat verdict, Range-only metadata, explicit load, invalid URL (6.9)', async ({ page }, testInfo) => {
    test.setTimeout(15 * 60 * 1000);

    const panel = page.getByRole('region', { name: 'Custom GGUF model loader' });
    const urlInput = page.getByLabel('GGUF model URL');
    const customLoad = page.getByRole('region', { name: 'Custom GGUF model loader' }).getByRole('button', { name: /load/i });

    await test.step('?model= handoff prefills and opens the panel without auto-loading', async () => {
      await page.goto(`/blocks/chat?model=${encodeURIComponent(WLLAMA_SMALL.ggufUrl)}`);
      await expect(panel).toHaveAttribute('data-open', 'true');
      await expect(urlInput).toHaveValue(WLLAMA_SMALL.ggufUrl);
      // The handoff auto-inspect performs the ~4KB header Range fetch and the
      // compat verdict renders BEFORE any load affordance is used.
      await expect(page.getByRole('status', { name: 'Compatibility verdict' })).toBeVisible({ timeout: 60_000 });
    });

    await test.step('so far: zero .gguf GETs without a Range header (no auto-download)', async () => {
      const requests = await resolveModelHostRequests();
      const gets = requests.filter((request) => request.method === 'GET');
      // Positive control that the header collector is wired: the metadata
      // fetch itself must have been captured.
      expect(
        gets.length,
        'the handoff metadata Range fetch must have been captured',
      ).toBeGreaterThan(0);
      expect(
        gets.filter((request) => request.range === null),
        'every model-host GET before Load must carry a Range header (metadata-scale only)',
      ).toEqual([]);
    });

    await test.step('explicit Load downloads and readies the custom model', async () => {
      await expect(customLoad).toBeEnabled();
      await customLoad.click();
      // The panel closes and the block loads via wllama modelUrl. The derived
      // custom id equals the GGUF basename, so the key matches the catalog's.
      await expect(panel).not.toHaveAttribute('data-open', 'true');
      await expect(page.getByRole('status', { name: 'Selected model' })).toHaveText(WLLAMA_SMALL.key);
      const modelStatus = page.getByRole('status', { name: 'Model load status' });
      await expect(modelStatus).toHaveText(/^(loading|ready)$/, { timeout: 60_000 });
      await expect(modelStatus).toHaveText('ready', { timeout: 10 * 60_000 });
    });

    await test.step('the custom-loaded model chats for real', async () => {
      await completeChatTurn(page, PROMPT, {
        turn: 1,
        replyTimeoutMs: 4 * 60_000,
        minWords: 3,
      });
      await captureLaneScreenshot(page, testInfo, 'chat-custom-url.png');
    });

    await test.step('invalid URL: inspect fails with an actionable error and no load', async () => {
      await page.getByRole('button', { name: 'Custom GGUF URL' }).click();
      await expect(panel).toHaveAttribute('data-open', 'true');
      // A same-origin non-GGUF file is used INSTEAD of the sketched
      // https://example.com/not-a-model.gguf: a cross-origin/404 fetch makes
      // Chromium emit its own console error ("blocked by CORS policy" /
      // "Failed to load resource"), which would trip the empty-allowlist
      // console policy. A same-origin 200 that is not a GGUF exercises the
      // SAME spec scenario ("the URL is not a GGUF file") deterministically:
      // the header parse fails with an actionable invalid-GGUF error.
      const invalidUrl = new URL('/test-assets/portrait.jpg', page.url()).href;
      await urlInput.fill(invalidUrl);
      await page.getByRole('region', { name: 'Custom GGUF model loader' }).getByRole('button', { name: /inspect/i }).click();
      const customError = page.getByRole('alert', { name: 'Custom model error' });
      await expect(customError).toBeVisible({ timeout: 30_000 });
      const errorText = (await customError.innerText()).trim();
      expect(errorText.length, 'the invalid-URL error must be non-empty').toBeGreaterThan(0);
      // No load action is offered for an uninspectable URL.
      await expect(customLoad).toBeDisabled();
      await captureLaneScreenshot(page, testInfo, 'chat-custom-url-error.png');
    });
  });

  test('provider switch hygiene: wllama → transformers → back to wllama, conversation clears, zero console errors (6.11)', async ({ page }, testInfo) => {
    // ~70MB + ~120MB cold; the switch-back wllama load is served from THIS
    // context's provider cache (same page session), exercising the design-D8
    // dispose-on-switch + registry singleton re-init path. Teardown itself has
    // no DOM witness — its observable contract is: conversation cleared, the
    // next provider loads and answers, and the run stays console-error-free
    // (enforced by the shared afterEach).
    test.setTimeout(25 * 60 * 1000);

    await page.goto('/blocks/chat');
    await expect(page.getByRole('region', { name: 'Models' })).toBeVisible();

    await test.step('load wllama SmolLM2-135M and chat', async () => {
      await selectCatalogModel(page, CHIP_WASM, WLLAMA_SMALL.rowText, WLLAMA_SMALL.key);
      await loadSelectedModel(page, 8 * 60_000);
      await completeChatTurn(page, PROMPT, {
        turn: 1,
        replyTimeoutMs: 4 * 60_000,
        minWords: 3,
      });
    });

    await test.step('switch to transformers Granite: conversation clears, new model answers', async () => {
      await selectCatalogModel(page, CHIP_ONNX, GRANITE.rowText, GRANITE.key);
      // The user-initiated switch clears the previous conversation.
      await expect(page.locator('[data-slot="message"]')).toHaveCount(0, { timeout: 30_000 });
      await expect(page.getByRole('region', { name: 'Latest assistant reply' })).toHaveCount(0);
      await loadSelectedModel(page, 8 * 60_000);
      // turn: 1 doubles as the leak check — exactly one user message exists
      // after the send, so nothing from the previous provider bled through.
      await completeChatTurn(page, PROMPT, {
        turn: 1,
        replyTimeoutMs: 4 * 60_000,
        minWords: 3,
      });
    });

    await test.step('switch BACK to wllama: singleton re-init loads and answers again', async () => {
      await selectCatalogModel(page, CHIP_WASM, WLLAMA_SMALL.rowText, WLLAMA_SMALL.key);
      await expect(page.locator('[data-slot="message"]')).toHaveCount(0, { timeout: 30_000 });
      // Weights were downloaded earlier in this context, so this load is the
      // cached-load path; the ceiling only covers WASM re-initialization.
      await loadSelectedModel(page, 3 * 60_000);
      await completeChatTurn(page, PROMPT, {
        turn: 1,
        replyTimeoutMs: 4 * 60_000,
        minWords: 3,
      });
      await captureLaneScreenshot(page, testInfo, 'chat-provider-switch.png');
    });
  });

  test('bundle isolation: homepage, gallery and chat page fetch zero model bytes; handoff is metadata-only (6.12)', async ({ page }, testInfo) => {
    test.setTimeout(5 * 60 * 1000);

    // Provider CHUNK naming is deliberately not over-asserted (production
    // chunk URLs are content-hashed and do not reliably embed package names);
    // the model-host + weight-extension pattern is the load-bearing gate,
    // with the provider-name URL check as belt-and-suspenders.
    const providerNamePattern = /webllm|wllama|litert/i;
    const providerNamedRequests = () =>
      requestUrls.filter((url) => providerNamePattern.test(modelWeightPart(url)));
    const modelWeightRequests = () => requestUrls.filter(isModelWeightUrl);

    await test.step('homepage: zero model bytes, zero provider-named requests', async () => {
      await page.goto('/', { waitUntil: 'networkidle' });
      expect(modelWeightRequests(), 'homepage must fetch zero model bytes').toEqual([]);
      expect(
        providerNamedRequests(),
        'homepage must fetch nothing named after a provider package',
      ).toEqual([]);
    });

    await test.step('/blocks gallery: zero model bytes, zero provider-named requests', async () => {
      await page.goto('/blocks', { waitUntil: 'networkidle' });
      expect(modelWeightRequests(), '/blocks must fetch zero model bytes').toEqual([]);
      expect(
        providerNamedRequests(),
        '/blocks must fetch nothing named after a provider package',
      ).toEqual([]);
    });

    await test.step('/blocks/chat without params: zero model bytes', async () => {
      // Provider JS chunks are ALLOWED here (the block is route-level
      // code-split); the invariant is zero model-WEIGHT traffic.
      await page.goto('/blocks/chat', { waitUntil: 'networkidle' });
      await expect(page.getByRole('region', { name: 'Models' })).toBeVisible();
      expect(
        modelWeightRequests(),
        '/blocks/chat page load must fetch zero model bytes',
      ).toEqual([]);
    });

    await test.step('?model= handoff: the ONLY model-host traffic is the Range metadata fetch', async () => {
      await page.goto(`/blocks/chat?model=${encodeURIComponent(WLLAMA_SMALL.ggufUrl)}`);
      await expect(page.getByRole('region', { name: 'Custom GGUF model loader' })).toHaveAttribute('data-open', 'true');
      await expect(page.getByRole('status', { name: 'Compatibility verdict' })).toBeVisible({ timeout: 60_000 });

      const requests = await resolveModelHostRequests();
      const gets = requests.filter((request) => request.method === 'GET');
      expect(
        gets.length,
        'the handoff metadata Range fetch must have been captured (collector positive control)',
      ).toBeGreaterThan(0);
      expect(
        gets.filter((request) => request.range === null),
        'every model-host GET on a handoff page load must carry a Range header (~4KB metadata scale, never weights)',
      ).toEqual([]);
      // Anything that is not a GET must be a CORS preflight for that fetch.
      expect(
        requests.filter((request) => request.method !== 'GET' && request.method !== 'OPTIONS'),
        'no non-GET/OPTIONS model-host traffic is allowed on a handoff page load',
      ).toEqual([]);

      await captureLaneScreenshot(page, testInfo, 'chat-bundle-isolation.png');
    });
  });
});
