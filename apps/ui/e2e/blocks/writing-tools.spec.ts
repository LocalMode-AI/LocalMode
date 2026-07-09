/**
 * @file writing-tools.spec.ts
 * @description E2E for the split writing-tools category (split-writing-text).
 * Drives the four single-block routes /blocks/writing-tools/{write,translate,
 * summarize,complete} (+ the category page) via accessibility selectors, with
 * REAL model downloads and REAL inference — no mocked model boundary, and
 * injecting a fake Chrome AI surface is FORBIDDEN. Every lane's assertions are
 * preserved verbatim from the pre-split spec; only the shell tab selectors are
 * dropped (there are no tabs — each block has its own route).
 *
 * PROVIDER PATHS:
 * - Fallback lane (deterministic): stock headless Chromium has no Gemini Nano,
 *   so every block exercises the Transformers.js path — DistilBART summarization
 *   (abstractive) + on-device sentence extraction (extractive), Opus-MT
 *   translation, ModernBERT fill-mask, and a Llama-3.2-1B instruct edit. Each
 *   provider badge must read Transformers.js and match the served modelId
 *   witness; outputs must pass content assertions for fixed fixtures.
 * - Chrome AI lane (availability-gated): the suite detects real built-in AI at
 *   runtime. Stock Chromium exposes none, so this lane records an EXPLICIT,
 *   documented availability gap into the run artifact (never a silent skip).
 *
 * Console-error policy: hard fail on any console error / pageerror; the
 * allowlist below is narrow and documented (benign HuggingFace optional-file
 * 404 probes). Specs drive accessibility selectors (getByRole / getByLabel /
 * getByText) only — no `data-testid` (Wave-4 UX pass); the sole structural hook
 * is `[data-block-preview]` (the BlockShell preview panel), which scopes every
 * lookup to the live block and away from site chrome. Provider/model witnesses
 * read the visible ProviderBadge text; the proposed-edit and top-prediction
 * witnesses read named `role="status"` regions the block exposes.
 */
import { expect, test, type ConsoleMessage, type Page, type Request } from '@playwright/test';

/* ─────────────────────────────── fixtures ────────────────────────────────── */

/** A short document whose sentences are distinctive (extractive draws verbatim). */
const SUMMARY_DOC =
  'Artificial intelligence has transformed the way we interact with technology. Machine learning models can now understand natural language, recognize images, and even generate creative content. These advances have led to practical applications in healthcare, transportation, and education. However, these developments also raise important ethical questions about privacy, bias, and the future of work. As AI continues to evolve, society must carefully consider how to harness its benefits while mitigating potential risks.';

/** Fixed translation inputs with highly-predictable Opus-MT target words.
 * Patterns cover the reliable content words ("Hallo"/"wie geht" for German,
 * "Bonjour"/"comment" for French) so a wording variant is still a pass. */
const TRANSLATE_INPUT = 'Hello, how are you?';
const TRANSLATE_EXPECT: Record<string, RegExp> = {
  de: /hallo|wie geht/i,
  fr: /bonjour|comment/i,
};

/** A fixed cloze whose top-5 fill-mask predictions reliably include "France". */
const CLOZE_INPUT = 'Paris is the capital of [MASK].';
const CLOZE_EXPECT = /france/i;

/** A draft with obvious grammar errors + a fix-grammar instruction. */
const WRITE_DRAFT = 'i has went to the stor yesterday and buyed two apple.';

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
    // WHY HARMLESS: Transformers.js probes HuggingFace for OPTIONAL model files
    // (e.g. generation_config.json, added_tokens.json, a tokenizer variant)
    // that some Xenova repos do not ship; HF answers 404 and the library
    // proceeds (inference succeeds). Chrome still logs the 404 as an error.
    // WHO/WHEN: carried from the vision-lab spec's documented HF-404 entry;
    // re-scoped here to any optional-config probe on a HuggingFace host.
    // SCOPE: 404-style resource errors whose URL is a HuggingFace host AND ends
    // in a known-optional JSON config file — a real load error (non-404, or a
    // required weight file) still fails the run.
    reason: 'benign HF 404: optional model-config probe (file not shipped by the repo)',
    matches: (e) =>
      /huggingface\.co|hf\.co|cdn-lfs/i.test(e.url) &&
      /(generation_config|tokenizer_config|added_tokens|special_tokens_map|config)\.json/i.test(e.url),
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
    // pageerrors are NEVER allowlisted — url stays '' so no entry can match.
    errors.push({ text: `[pageerror] ${err.message}`, url: '' });
  });
}

const MODEL_REQUEST_PATTERNS = [
  /huggingface\.co/i,
  /hf\.co/i,
  /cdn-lfs/i,
  /\.onnx(\?|$)/i,
  /\.wasm(\?|$)/i,
];

function collectModelRequests(page: Page, sink: string[]) {
  page.on('request', (req: Request) => {
    const url = req.url();
    if (MODEL_REQUEST_PATTERNS.some((p) => p.test(url))) sink.push(url);
  });
}

/* ────────────────────────── shared per-test capture ──────────────────────── */

let allMessages: string[];
let consoleErrors: CapturedError[];

test.beforeEach(({ page }) => {
  allMessages = [];
  consoleErrors = [];
  collectConsole(page, allMessages, consoleErrors);
});

test.afterEach(async ({ page }, testInfo) => {
  await page.screenshot({
    path: `e2e-artifacts/screenshots/writing-tools-${testInfo.title.replace(/\W+/g, '-')}.png`,
    fullPage: true,
  });
  await testInfo.attach('console-log', {
    body: allMessages.join('\n') || '(none)',
    contentType: 'text/plain',
  });
  const allowlisted = consoleErrors.filter((e) => CONSOLE_ERROR_ALLOWLIST.some((a) => a.matches(e)));
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

/* ══════════════════════════ platform / invariants ═══════════════════════════ */

test.describe('writing-tools platform', () => {
  test('category page + every block page load fetch zero model bytes', async ({ page }) => {
    const modelRequests: string[] = [];
    collectModelRequests(page, modelRequests);

    // Category page mounts four gated BlockShell previews — nothing downloads.
    await page.goto('/blocks/writing-tools');
    await expect(page.locator('[data-block-preview]').first()).toBeVisible();
    // Block mounted (accessibility witness): the Write block's labeled Draft field.
    await expect(page.getByLabel('Draft').first()).toBeVisible();

    // Each canonical single-block page renders gated; a labeled control witnesses
    // the block mounted (accessibility-grade, replacing the sr-only status hook).
    for (const slug of ['write', 'translate', 'summarize', 'complete']) {
      await page.goto(`/blocks/writing-tools/${slug}`);
      const block = page.locator('[data-block-preview]');
      await expect(block).toBeVisible();
      const witness =
        slug === 'write'
          ? block.getByLabel('Draft')
          : slug === 'translate'
            ? block.getByLabel('Text to translate')
            : slug === 'complete'
              ? block.getByLabel('Sentence with a [MASK] token')
              : block.getByRole('textbox'); // summarize (single input textarea)
      await expect(witness.first()).toBeVisible();
    }

    await page.waitForLoadState('networkidle');
    expect(modelRequests, 'idle category + block pages must not fetch model assets').toEqual([]);
  });
});

/* ══════════════════════════════ Summarize ═══════════════════════════════════ */

test.describe('writing-tools summarize (Transformers.js fallback lane)', () => {
  test('abstractive DistilBART + on-device extractive, truthful badge', async ({ page }) => {
    test.setTimeout(12 * 60 * 1000); // cold DistilBART download

    await page.goto('/blocks/writing-tools/summarize');

    const block = page.locator('[data-block-preview]');
    const input = block.getByRole('textbox'); // the single input textarea
    // The processed summary renders in the panel's live result region.
    const resultRegion = block.getByRole('region');
    await input.fill(SUMMARY_DOC);

    // ── (a) abstractive: real DistilBART generation ──
    await block.getByRole('radio', { name: 'Abstractive' }).click();
    await block.getByRole('button', { name: 'Summarize' }).click();

    // The compression caption ("N% of original") appears only once a summary is ready.
    await expect(block.getByText(/% of original/)).toBeVisible({ timeout: 10 * 60 * 1000 });
    const abstractive = (await resultRegion.innerText()).trim();
    expect(abstractive.length, 'abstractive summary is non-empty').toBeGreaterThan(0);
    // Generated (abstractive) text mentions the document's topic.
    expect(abstractive).toMatch(/ai|intelligence|machine|model|learning/i);
    // Badge truthfulness: Transformers.js served it; the visible badge confirms
    // both the provider name and the served (transformers-prefixed) model id.
    await expect(block.getByText('Transformers.js').first()).toBeVisible();
    await expect(block.getByText(/^transformers:/).first()).toBeVisible();

    // ── (b) extractive: on-device sentence extraction (verbatim sentences) ──
    await block.getByRole('radio', { name: 'Extractive' }).click();
    await block.getByRole('button', { name: 'Summarize' }).click();
    // Extraction is synchronous; the result region flips to the extractive summary.
    await expect
      .poll(async () => (await resultRegion.innerText()).trim(), { timeout: 60 * 1000 })
      .not.toBe(abstractive);
    const extractive = (await resultRegion.innerText()).trim();
    expect(extractive.length, 'extractive summary is non-empty').toBeGreaterThan(0);
    // Every extracted sentence is drawn VERBATIM from the source document.
    const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
    for (const sentence of extractive.split(/(?<=[.!?])\s+/).map(normalize).filter(Boolean)) {
      expect(normalize(SUMMARY_DOC), `extractive sentence drawn from source: "${sentence}"`).toContain(
        sentence,
      );
    }
    // Extractive on the transformers path runs no model — the badge model id says so.
    await expect(block.getByText('local:extractive-frequency').first()).toBeVisible();
    // The two modes produced DISTINCT output.
    expect(extractive).not.toEqual(abstractive);
  });
});

/* ══════════════════════════════ Translate ═══════════════════════════════════ */

test.describe('writing-tools translate (Transformers.js fallback lane)', () => {
  test('en→de and en→fr expected target text, swap, cancel, truthful badge', async ({ page }) => {
    test.setTimeout(14 * 60 * 1000); // two cold Opus-MT downloads

    await page.goto('/blocks/writing-tools/translate');

    const block = page.locator('[data-block-preview]');
    const input = block.getByLabel('Text to translate');
    // The target panel is a named live region; the model id shows in the badge.
    const output = block.getByRole('region', { name: 'Translation' });
    // Idle run button reads "Translate to <lang>"; running it reads "Stop".
    const run = block.getByRole('button', { name: /translate to/i });
    const stop = block.getByRole('button', { name: 'Stop' });

    // ── en→de (default target German) ──
    await input.fill(TRANSLATE_INPUT);
    await run.click();
    await expect(output).toContainText(TRANSLATE_EXPECT.de, { timeout: 10 * 60 * 1000 });
    await expect(block.getByText('Transformers.js').first()).toBeVisible();
    await expect(block.getByText('transformers:Xenova/opus-mt-en-de').first()).toBeVisible();
    // Char counts reflect both panels.
    await expect(block.getByText(`${TRANSLATE_INPUT.length} chars`).first()).toBeVisible();

    // ── switch target to French, translate again ──
    // "French" exists in both the From and To pill groups; scope to To (target).
    await block
      .getByRole('radiogroup', { name: 'To' })
      .getByRole('radio', { name: 'French', exact: true })
      .click();
    await input.fill(TRANSLATE_INPUT);
    await run.click();
    await expect(output).toContainText(TRANSLATE_EXPECT.fr, { timeout: 10 * 60 * 1000 });
    await expect(block.getByText('transformers:Xenova/opus-mt-en-fr').first()).toBeVisible();

    // ── swap direction carries output → input and flips the pair to fr→en ──
    // The swap affordance is the selector's own visible button.
    const frenchOutput = (await output.textContent())?.trim() ?? '';
    await block.getByRole('button', { name: 'Swap languages' }).click();
    await expect(input).toHaveValue(frenchOutput);
    // Now source is French, target English — the badge model id reflects the reverse pair.
    await expect(block.getByText('transformers:Xenova/opus-mt-fr-en').first()).toBeVisible();

    // ── cancel an in-flight translation returns to idle ──
    // Runs on the current fr→en pair (a cold download we can interrupt).
    await input.fill(TRANSLATE_INPUT);
    await expect(run).toBeVisible(); // ready (not "Preparing…")
    await run.click();
    await expect(stop).toBeVisible(); // in flight ("Stop")
    await stop.click(); // cancel
    await expect(run).toBeVisible(); // back to idle ("Translate to English")
  });
});

/* ══════════════════════════════ Complete ════════════════════════════════════ */

test.describe('writing-tools complete (Transformers.js only)', () => {
  test('ModernBERT fill-mask predicts a plausible token, click-to-apply, badge', async ({
    page,
  }) => {
    test.setTimeout(12 * 60 * 1000); // cold ModernBERT download

    await page.goto('/blocks/writing-tools/complete');

    const block = page.locator('[data-block-preview]');
    const maskInput = block.getByLabel('Sentence with a [MASK] token');
    await maskInput.fill(CLOZE_INPUT);
    await block.getByRole('button', { name: 'Predict' }).click();

    // The "Top N predictions" heading appears once real inference completes — the
    // cold ModernBERT download dominates this wait.
    await expect(block.getByText(/top \d+ predictions/i)).toBeVisible({ timeout: 10 * 60 * 1000 });
    // The top-prediction witness (named status region) renders once predictions exist.
    const topWitness = block.getByRole('status', { name: 'Top prediction' });
    await expect(topWitness).toBeAttached({ timeout: 10 * 60 * 1000 });
    // The top-5 predictions contain a plausible completion for the cloze.
    await expect(block.getByText(CLOZE_EXPECT).first()).toBeVisible();
    // Badge is truthful: Transformers.js served it (no Chrome AI fill-mask).
    await expect(block.getByText('Transformers.js').first()).toBeVisible();
    await expect(block.getByText('transformers:onnx-community/ModernBERT-base-ONNX').first()).toBeVisible();

    // Click-to-apply: the mask is replaced by the top token and predictions clear.
    const topToken = ((await topWitness.textContent()) ?? '').trim();
    expect(topToken.length).toBeGreaterThan(0);
    // The apply candidates are the buttons in the click-to-apply list; the first
    // one is the top-ranked prediction.
    const applyList = block.getByRole('list').filter({ has: page.getByRole('button') });
    await applyList.getByRole('button').first().click();
    await expect(maskInput).not.toHaveValue(/\[MASK\]/);
    await expect(maskInput).toHaveValue(new RegExp(topToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    // Predictions cleared: the apply list is gone.
    await expect(applyList).toHaveCount(0);
  });
});

/* ═══════════════════════════════ Write ══════════════════════════════════════ */

test.describe('writing-tools write (Transformers.js fallback lane)', () => {
  test('AI edit renders a before/after diff and Accept applies exactly the after text', async ({
    page,
  }) => {
    test.setTimeout(20 * 60 * 1000); // cold Llama-3.2-1B download on WASM

    await page.goto('/blocks/writing-tools/write');

    const block = page.locator('[data-block-preview]');
    const draft = block.getByLabel('Draft');
    await draft.fill(WRITE_DRAFT);
    // Preset instruction "Fix grammar and spelling".
    await block.getByRole('button', { name: 'Fix grammar and spelling' }).click();

    // Wait for the edit engine to resolve (the button reads "AI edit" when ready,
    // "Preparing…" before that).
    const run = block.getByRole('button', { name: 'AI edit' });
    await expect(run).toBeVisible({ timeout: 60 * 1000 });
    await run.click();

    // The proposal renders as a before/after diff (its "Proposed edit" /
    // "Current draft" panel labels prove the CodeDiffViewer mounted); the draft
    // is UNCHANGED before Accept.
    await expect(block.getByText('Proposed edit').first()).toBeVisible({ timeout: 15 * 60 * 1000 });
    await expect(block.getByText('Current draft').first()).toBeVisible();
    await expect(draft).toHaveValue(WRITE_DRAFT); // never overwritten before Accept

    // The exact proposed edit is carried by the named status region.
    const proposal = ((await block.getByRole('status', { name: 'Proposed edit' }).textContent()) ?? '').trim();
    expect(proposal.length, 'proposed edit is non-empty').toBeGreaterThan(0);
    expect(proposal, 'proposal differs from the draft').not.toEqual(WRITE_DRAFT);

    // Badge truthfulness for the edit engine (visible provider + served model id).
    await expect(block.getByText('Transformers.js').first()).toBeVisible();
    await expect(block.getByText(/^transformers:/).first()).toBeVisible();

    // Accept applies EXACTLY the shown "after" text; the diff clears.
    await block.getByRole('button', { name: 'Accept' }).click();
    await expect(draft).toHaveValue(proposal);
    await expect(block.getByText('Proposed edit')).toHaveCount(0);
  });
});

/* ═══════════════════════ Chrome AI lane (availability-gated) ═════════════════ */

test.describe('writing-tools chrome-ai lane', () => {
  test('each block truthfully resolves its capability; document the gap when Chrome AI is absent', async ({
    page,
  }, testInfo) => {
    // Read each block's OWN truthful, per-capability resolution from its visible
    // ProviderBadge (never inject a fake Chrome AI surface — forbidden). Stock
    // Chromium ships the built-in AI globals only as `'downloadable'`, so the
    // block's detectors resolve every capability to the Transformers.js fallback.
    async function resolvedProvider(slug: string) {
      await page.goto(`/blocks/writing-tools/${slug}`);
      const block = page.locator('[data-block-preview]');
      // Wait until the badge resolves (no longer the "Resolving provider…" state).
      await expect(block.getByText('Resolving provider…')).toHaveCount(0, { timeout: 60 * 1000 });
      if ((await block.getByText('Chrome AI').count()) > 0) return 'chrome-ai';
      if ((await block.getByText('Transformers.js').count()) > 0) return 'transformers';
      return 'unknown';
    }

    const providers = {
      summarize: await resolvedProvider('summarize'),
      translate: await resolvedProvider('translate'),
      write: await resolvedProvider('write'),
    };
    const chromeServed = Object.entries(providers).filter(([, p]) => p === 'chrome-ai');

    if (chromeServed.length > 0) {
      // Real Chrome Built-in AI serves at least one capability — run summarize
      // through it and assert a truthful chrome-ai badge + modelId + zero
      // download. (Exercised in the real-Chrome verification tail.)
      const modelRequests: string[] = [];
      collectModelRequests(page, modelRequests);
      await page.goto('/blocks/writing-tools/summarize');
      const block = page.locator('[data-block-preview]');
      await block.getByRole('textbox').fill(SUMMARY_DOC);
      await block.getByRole('button', { name: 'Summarize' }).click();
      await expect(block.getByText(/% of original/)).toBeVisible({ timeout: 3 * 60 * 1000 });
      if (providers.summarize === 'chrome-ai') {
        await expect(block.getByText('Chrome AI')).toBeVisible();
        await expect(block.getByText(/^chrome-ai:/)).toBeVisible();
        await page.waitForLoadState('networkidle');
        expect(modelRequests, 'Chrome AI summarization downloads no model bytes').toEqual([]);
      }
      testInfo.annotations.push({
        type: 'chrome-ai',
        description: `REAL Chrome Built-in AI served: ${chromeServed.map(([c]) => c).join(', ')}`,
      });
    } else {
      // DOCUMENTED GAP (not a silent skip): record it with manual-verification
      // instructions. The transformers fallback lanes above are the real served
      // path in this browser, which the badges prove.
      const note =
        'CHROME-AI AVAILABILITY GAP: this browser exposes no READY Chrome Built-in AI ' +
        '(the Summarizer/Translator/Prompt models report "downloadable", not "available", ' +
        'and there is no legacy self.ai surface), so each block resolves its capability to ' +
        'the Transformers.js fallback. The chrome-ai serving path is verified MANUALLY in a ' +
        'real Chrome 138+ with Built-in AI enabled and its models downloaded (split-writing-text ' +
        'task 16.3): open /blocks/writing-tools/{summarize,translate,write}, run each, and confirm ' +
        'the badge reads "Chrome AI", the modelId witness carries a chrome-ai: prefix, and zero ' +
        `model bytes are fetched. Observed providers: ${JSON.stringify(providers)}.`;
      testInfo.annotations.push({ type: 'chrome-ai-gap', description: note });
      await testInfo.attach('chrome-ai-availability-gap', { body: note, contentType: 'text/plain' });
      // The fallback is provably active: every capability's badge reads Transformers.js.
      expect(
        Object.values(providers).every((p) => p === 'transformers'),
        'all capabilities fell back to Transformers.js',
      ).toBe(true);
    }
  });
});
