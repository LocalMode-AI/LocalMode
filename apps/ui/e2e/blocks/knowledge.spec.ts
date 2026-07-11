/**
 * @file knowledge.spec.ts
 * @description E2E suite for the four `ui/blocks/knowledge/*` blocks (split from
 * the retired `knowledge-base` monolith, split-knowledge-photo Wave 3). Preserves
 * every lane of the retired 9-lane `knowledge-base.spec.ts` at full assertion
 * strength, re-homed onto the per-block deep routes. Role/label/text selectors
 * ONLY (blocks-ux-pass Wave 4 — zero `data-testid`); REAL model downloads + real
 * in-browser inference — no mocked model boundary.
 *
 * REAL: embedding (Xenova/bge-small-en-v1.5), reranking (Xenova/ms-marco-
 * MiniLM-L-6-v2), OCR (Xenova/trocr-small-printed), extractive QA
 * (Xenova/distilbert-base-cased-distilled-squad), grounded generation
 * (onnx-community/granite-4.0-350m-ONNX-web via engine.ask), Donut DocVQA
 * (Xenova/donut-base-finetuned-docvqa) — all downloaded into a fresh context and
 * run for real. Passive network observation witnesses both directions: zero model
 * bytes before the gating action, >0 model-host requests after.
 *
 * GAPS (documented, not faked): Donut is a ~800 MB download (generous guard, no
 * skip); engine equivalence is a result-level equivalence class; OCR search uses
 * the ACTUAL extracted text as the query so "findable" cannot pass on garbage.
 *
 * CONSOLE-ERROR POLICY: context-wide capture; hard fail on any console error /
 * uncaught page error. Allowlist INTENTIONALLY EMPTY (carried from the retired
 * suite). Screenshots land in e2e-artifacts/screenshots/kb-*.png.
 */
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import { expect, test } from '@playwright/test';
import type { ConsoleMessage, Page, TestInfo, WebError } from '@playwright/test';

/* ────────────────────────────── constants ────────────────────────────── */

const CONSOLE_ERROR_ALLOWLIST: readonly RegExp[] = [];

const MODEL_BYTES_PATTERN = /huggingface\.co|hf\.co|cdn-lfs|\.onnx\b|\.gguf\b/i;

/** Known-winner query: the sample corpus has EXACTLY ONE privacy/encryption doc. */
const PRIVACY_QUERY = 'privacy and encryption';
const PRIVACY_TITLE = 'Privacy and encryption on device';
/** Rank-flip query: only the pasta doc mentions dough/flour/tagliatelle. */
const PASTA_QUERY = 'kneading fresh pasta dough for tagliatelle';
const PASTA_TITLE = 'Fresh pasta dough';

const PDF_FIXTURE_NAME = 'kb-fixture.pdf';
const PDF_QUERY = 'WebAssembly browser processing';

const OCR_FIXTURE_NAME = 'kb-ocr.png';
const OCR_TEXT_PATTERN = /LOCAL|FIRST|OCR/i;

const IMPORT_QUERY = 'feeding a sourdough starter with flour and water';
const IMPORT_WINNER_TITLE = 'Sourdough starter care';

const RAG_QUESTION = 'How is personal data kept private and encrypted on this device?';

const COLD_MODEL_TIMEOUT = 8 * 60_000;
const SEARCH_TIMEOUT = 60_000;
const INGEST_TIMEOUT = 3 * 60_000;

const APP_DIR = path.join(__dirname, '..', '..');
const fixturePath = (name: string) => path.join(APP_DIR, 'e2e', 'fixtures', name);
const screenshotPath = (name: string) => path.join(APP_DIR, 'e2e-artifacts', 'screenshots', name);

/* ───────────────────────── collectors (per test) ─────────────────────── */

interface CollectedConsoleMessage {
  type: string;
  text: string;
  location: string;
  pageUrl: string;
}

let consoleMessages: CollectedConsoleMessage[] = [];
let pageErrors: string[] = [];
let requestUrls: string[] = [];

const modelRequests = (): string[] => requestUrls.filter((url) => MODEL_BYTES_PATTERN.test(url));

/* ───────────────────────────── shared steps ──────────────────────────── */

/** Select a tab within the Semantic Search block and wait for its panel active. */
async function selectSemanticTab(page: Page, tab: 'ingest' | 'search'): Promise<void> {
  await page.getByRole('tab', { name: tab === 'ingest' ? 'Ingest' : 'Search' }).click();
  await expect(page.getByRole('group', { name: 'Active tab' })).toHaveAttribute('data-tab', tab);
}

/** Load the 8-doc sample corpus into Semantic Search (real embedding download). */
async function loadSampleCorpus(page: Page, _block: string): Promise<void> {
  expect(modelRequests(), 'no model bytes before ingesting the sample corpus').toEqual([]);
  await page.getByRole('button', { name: 'Load sample corpus' }).click();
  await expect(page.getByRole('group', { name: 'Corpus size' })).toHaveAttribute('data-docs', '8', {
    timeout: COLD_MODEL_TIMEOUT,
  });
  expect(
    modelRequests().length,
    'indexing the corpus must have fetched real embedding-model files',
  ).toBeGreaterThan(0);
}

/** Force the Semantic Search rerank stage into a given state (default on). */
async function setRerank(page: Page, state: 'on' | 'off'): Promise<void> {
  const toggle = page.getByRole('switch', { name: 'Rerank stage' });
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute('data-state')) !== state) await toggle.click();
  await expect(toggle).toHaveAttribute('data-state', state);
}

async function runSearch(page: Page, query: string): Promise<void> {
  await page.getByRole('textbox', { name: 'Search query' }).fill(query);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
}

async function expectRawTopScore(page: Page): Promise<number> {
  const scoreAttr = await page
    .getByRole('group', { name: 'Top result score' })
    .getAttribute('data-score');
  expect(scoreAttr, 'top-score must expose data-score').not.toBeNull();
  const score = Number.parseFloat(scoreAttr ?? '');
  expect(Number.isFinite(score), `data-score must be finite, got "${scoreAttr}"`).toBe(true);
  expect(score).toBeGreaterThan(0);
  expect(score).toBeLessThanOrEqual(1);
  return score;
}

/* ──────────────────────── bundle-isolation helpers ───────────────────── */

/**
 * Signatures must identify the LIBRARY, not a hostname. `huggingface.co` alone is
 * a false positive: `src/components/network-status.tsx` ships a URL-classification
 * table containing that literal to label model downloads in the /blocks pill, so a
 * hostname match flags an app chunk that holds no model code at all. These markers
 * are internal identifiers of the runtimes themselves.
 */
const CHUNK_LEAK_SIGNATURES: ReadonlyArray<{
  name: string;
  pattern: RegExp;
  /** A package whose bundle MUST match `pattern` — guards against signature rot. */
  witnessPackage: string;
  /** The `@localmode/*` provider that owns it (pnpm hides transitive deps). */
  witnessOwner: string;
}> = [
  {
    name: 'transformers.js runtime (@huggingface/transformers)',
    pattern: /onnxruntime-web|ort-wasm|AutoTokenizer|PreTrainedModel/,
    witnessPackage: '@huggingface/transformers',
    witnessOwner: '@localmode/transformers',
  },
  {
    name: 'WebLLM runtime (@mlc-ai/web-llm)',
    pattern: /MLCEngine|prebuiltAppConfig/,
    witnessPackage: '@mlc-ai/web-llm',
    witnessOwner: '@localmode/webllm',
  },
  {
    // `pdfjs-dist` is the package NAME and never appears inside its own bundle;
    // these are identifiers the bundle actually exports.
    name: 'pdfjs (@localmode/pdfjs → pdfjs-dist)',
    pattern: /PDFDocumentProxy|PDFWorker|PasswordException/,
    witnessPackage: 'pdfjs-dist',
    witnessOwner: '@localmode/pdfjs',
  },
  {
    name: 'langchain (@langchain/core)',
    pattern: /langchain_core/,
    witnessPackage: '@langchain/core',
    witnessOwner: '@localmode/langchain',
  },
];

/**
 * Prove each signature can still fire. A pattern that matches nothing would make
 * the bundle-isolation assertion pass vacuously after any dependency upgrade, so
 * every signature is checked against the real installed package before it is used.
 */
function assertLeakSignaturesStillMatchTheirLibraries(): void {
  // Playwright transpiles specs to CJS, so `import.meta.url` is unavailable.
  const fromSpec = createRequire(__filename);
  for (const { name, pattern, witnessPackage, witnessOwner } of CHUNK_LEAK_SIGNATURES) {
    // pnpm's strict layout hides transitive deps from apps/ui, so resolve each
    // witness through the `@localmode/*` provider that declares it.
    const entry = createRequire(fromSpec.resolve(witnessOwner)).resolve(witnessPackage);
    const dir = path.dirname(entry);
    const candidates = readdirSync(dir)
      .filter((f) => /\.(js|mjs|cjs)$/.test(f))
      .map((f) => path.join(dir, f));
    const matched = candidates.some((f) => pattern.test(readFileSync(f, 'utf8')));
    expect(
      matched,
      `leak signature "${name}" no longer matches ${witnessPackage} — it would never fire`,
    ).toBe(true);
  }
}

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

async function scanRouteChunksForLeaks(page: Page, route: string): Promise<string[]> {
  const leaks: string[] = [];
  const chunkUrls = await routeHtmlChunkUrls(page, route);
  expect(chunkUrls.length, `${route} must reference at least one JS chunk`).toBeGreaterThan(0);
  for (const url of chunkUrls) {
    const response = await page.request.get(url);
    expect(response.ok(), `chunk must be fetchable for scanning: ${url}`).toBe(true);
    const body = await response.text();
    for (const { name, pattern } of CHUNK_LEAK_SIGNATURES) {
      if (pattern.test(body)) leaks.push(`${route} loaded ${url} which contains ${name}`);
    }
  }
  return leaks;
}

/* ─────────────────────────────── the suite ───────────────────────────── */

test.describe('blocks/knowledge', () => {
  test.beforeEach(({ context }) => {
    consoleMessages = [];
    pageErrors = [];
    requestUrls = [];
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
    });
  });

  test.afterEach(async ({}, testInfo: TestInfo) => {
    await testInfo.attach('console-messages.json', {
      body: JSON.stringify(consoleMessages, null, 2),
      contentType: 'application/json',
    });
    await testInfo.attach('page-errors.json', {
      body: JSON.stringify(pageErrors, null, 2),
      contentType: 'application/json',
    });
    await testInfo.attach('model-fetch-requests.json', {
      body: JSON.stringify(modelRequests(), null, 2),
      contentType: 'application/json',
    });
    const errors = consoleMessages.filter(
      (message) =>
        message.type === 'error' &&
        !CONSOLE_ERROR_ALLOWLIST.some((pattern) => pattern.test(message.text)),
    );
    expect(errors, 'console errors must be empty (allowlist is empty)').toEqual([]);
    expect(pageErrors, 'uncaught page errors must be empty').toEqual([]);
  });

  /* ── semantic-search: search + rerank on the fixed corpus ───────────── */

  test('semantic-search indexes the corpus, ranks the known winner, and reranks with a real cross-encoder', async ({
    page,
  }) => {
    test.setTimeout(20 * 60_000);
    await page.goto('/blocks/knowledge/semantic-search');
    await expect(page.getByRole('status').first()).toBeVisible();

    await selectSemanticTab(page, 'ingest');
    await loadSampleCorpus(page, 'semantic-search');
    await selectSemanticTab(page, 'search');

    await setRerank(page, 'off');
    await runSearch(page, PRIVACY_QUERY);
    await expect(page.getByRole('group', { name: 'Top result title' })).toHaveText(PRIVACY_TITLE, {
      timeout: SEARCH_TIMEOUT,
    });
    expect(
      Number.parseInt(await page.getByRole('group', { name: 'Result count' }).innerText(), 10),
    ).toBeGreaterThan(0);
    await expectRawTopScore(page);

    // Rank flip proves ranking responds to the query, not a fixed order.
    await runSearch(page, PASTA_QUERY);
    await expect(page.getByRole('group', { name: 'Top result title' })).toHaveText(PASTA_TITLE, {
      timeout: SEARCH_TIMEOUT,
    });

    // Rerank ON: the real ms-marco cross-encoder downloads on this search.
    const before = modelRequests().length;
    await setRerank(page, 'on');
    await runSearch(page, PRIVACY_QUERY);
    await expect(page.getByRole('group', { name: 'Rerank latency' })).toHaveAttribute('data-ms', /^\d+$/, {
      timeout: COLD_MODEL_TIMEOUT,
    });
    expect(
      modelRequests().length,
      'the reranked search must have fetched real cross-encoder files',
    ).toBeGreaterThan(before);
    await expect(page.getByRole('group', { name: 'Top result title' })).toHaveText(PRIVACY_TITLE);
    await expect(
      page.getByRole('region', { name: 'Search results' }).getByText(/reranked by/).first(),
    ).toBeVisible();
    await expectRawTopScore(page);

    await page.screenshot({ path: screenshotPath('kb-search-rerank.png'), fullPage: true });
  });

  /* ── semantic-search: PDF ingest with page attribution ──────────────── */

  test('semantic-search ingests the fixture PDF and searches it with page attribution', async ({ page }) => {
    test.setTimeout(15 * 60_000);
    await page.goto('/blocks/knowledge/semantic-search');
    await selectSemanticTab(page, 'ingest');
    await loadSampleCorpus(page, 'semantic-search');

    await page
      .getByRole('group', { name: 'PDF upload' })
      .locator('input[type="file"]')
      .setInputFiles(fixturePath(PDF_FIXTURE_NAME));
    await expect(
      page.getByRole('article', { name: 'Indexed document' }).filter({ hasText: PDF_FIXTURE_NAME }),
    ).toBeVisible({ timeout: INGEST_TIMEOUT });
    await expect(page.getByRole('group', { name: 'Corpus size' })).toHaveAttribute('data-docs', '9', {
      timeout: INGEST_TIMEOUT,
    });

    await selectSemanticTab(page, 'search');
    await setRerank(page, 'off');
    await runSearch(page, PDF_QUERY);
    await expect(page.getByRole('group', { name: 'Top result title' })).toHaveText(PDF_FIXTURE_NAME, {
      timeout: SEARCH_TIMEOUT,
    });
    await expectRawTopScore(page);
    await expect(
      page.getByRole('region', { name: 'Search results' }).getByText('p. 1', { exact: true }).first(),
    ).toBeVisible();

    await page.screenshot({ path: screenshotPath('kb-pdf-ingest.png'), fullPage: true });
  });

  /* ── semantic-search: OCR ingest (real TrOCR) ───────────────────────── */

  test('semantic-search extracts fixture-image text with real TrOCR and indexes it', async ({ page }) => {
    test.setTimeout(25 * 60_000);
    await page.goto('/blocks/knowledge/semantic-search');
    await selectSemanticTab(page, 'ingest');
    await loadSampleCorpus(page, 'semantic-search');

    await expect(page.getByRole('group', { name: 'OCR model selector' })).toContainText('TrOCR Small');
    await page
      .getByRole('group', { name: 'OCR image upload' })
      .locator('input[type="file"]')
      .setInputFiles(fixturePath(OCR_FIXTURE_NAME));
    await expect(page.getByRole('button', { name: 'Extract text' })).toBeVisible();

    const before = modelRequests().length;
    await page.getByRole('button', { name: 'Extract text' }).click();
    await expect(page.getByRole('group', { name: 'Extracted OCR text' })).toHaveText(OCR_TEXT_PATTERN, {
      timeout: COLD_MODEL_TIMEOUT,
    });
    expect(modelRequests().length, 'running OCR must have fetched real TrOCR files').toBeGreaterThan(before);

    const extracted = (await page.getByRole('group', { name: 'Extracted OCR text' }).innerText())
      .replace(/\s+/g, ' ')
      .trim();
    expect(extracted.length, 'extracted OCR text must be non-empty').toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Index into corpus' }).click();
    await expect(
      page.getByRole('article', { name: 'Indexed document' }).filter({ hasText: OCR_FIXTURE_NAME }),
    ).toBeVisible({ timeout: INGEST_TIMEOUT });

    await selectSemanticTab(page, 'search');
    await setRerank(page, 'off');
    await runSearch(page, extracted);
    await expect(page.getByRole('group', { name: 'Top result title' })).toHaveText(OCR_FIXTURE_NAME, {
      timeout: SEARCH_TIMEOUT,
    });

    await page.screenshot({ path: screenshotPath('kb-ocr-ingest.png'), fullPage: true });
  });

  /* ── semantic-search: engine equivalence (core ⇄ LangChain) ─────────── */

  test('semantic-search LangChain engine toggle re-ingests and returns the equivalent top result', async ({
    page,
  }) => {
    test.setTimeout(15 * 60_000);
    await page.goto('/blocks/knowledge/semantic-search');
    await expect(page.getByRole('group', { name: 'Pipeline engine' })).toHaveAttribute('data-engine', 'core');

    await selectSemanticTab(page, 'ingest');
    await loadSampleCorpus(page, 'semantic-search');
    await selectSemanticTab(page, 'search');

    await setRerank(page, 'off');
    await runSearch(page, PRIVACY_QUERY);
    await expect(page.getByRole('group', { name: 'Top result title' })).toHaveText(PRIVACY_TITLE, {
      timeout: SEARCH_TIMEOUT,
    });

    // Toggle → the hook re-ingests the corpus through the real LangChain adapters.
    await page
      .getByRole('group', { name: 'Pipeline engine' })
      .getByRole('button', { name: /LangChain/ })
      .click();
    await expect(page.getByRole('status', { name: 'Re-ingest progress' })).toBeAttached({ timeout: 60_000 });
    await expect(page.getByRole('status', { name: 'Re-ingest progress' })).not.toBeAttached({
      timeout: INGEST_TIMEOUT,
    });
    await expect(page.getByRole('group', { name: 'Pipeline engine' })).toHaveAttribute('data-engine', 'langchain');
    const chunksAttr = await page.getByRole('group', { name: 'Corpus size' }).getAttribute('data-chunks');
    expect(Number.parseInt(chunksAttr ?? '0', 10)).toBeGreaterThan(0);

    await selectSemanticTab(page, 'search');
    await setRerank(page, 'off');
    await runSearch(page, PRIVACY_QUERY);
    await expect(page.getByRole('group', { name: 'Top result title' })).toHaveText(PRIVACY_TITLE, {
      timeout: SEARCH_TIMEOUT,
    });

    await page.screenshot({ path: screenshotPath('kb-engine-equivalence.png'), fullPage: true });
  });

  /* ── vector-data-manager: import → export → re-import round-trip ─────── */

  test('vector-data-manager imports Pinecone + CSV, exports, and round-trips the native export', async ({
    page,
  }, testInfo: TestInfo) => {
    test.setTimeout(15 * 60_000);
    await page.goto('/blocks/knowledge/vector-data-manager');

    // Pinecone import (vectors + text → direct lane).
    await page
      .getByRole('button', { name: 'Import file upload' })
      .locator('input[type="file"]')
      .setInputFiles(fixturePath('kb-pinecone.json'));
    await expect(page.getByRole('group', { name: 'Detected import format' })).toContainText(/pinecone/i);
    const preview = page.getByRole('group', { name: 'Import preview' });
    await expect(preview).toHaveAttribute('data-total-records', '3');
    await expect(preview).toHaveAttribute('data-with-vectors', '3');
    await expect(preview).toHaveAttribute('data-importable', '3');
    expect(modelRequests(), 'parsing an import file must fetch no model bytes').toEqual([]);

    await page.getByRole('button', { name: /^Import \d[\d,]* of / }).click();
    const stats = page.getByRole('group', { name: 'Import result' });
    await expect(stats).toBeAttached({ timeout: COLD_MODEL_TIMEOUT });
    await expect(stats).toHaveAttribute('data-format', 'pinecone');
    await expect(stats).toHaveAttribute('data-imported', '3');
    expect(modelRequests().length, 'the confirmed import must have fetched the real embedding model').toBeGreaterThan(0);
    await expect(page.getByRole('group', { name: 'Vector storage stats' })).toHaveAttribute('data-docs', '3');

    // CSV import (text-only rows → re-embed lane).
    await page.getByRole('button', { name: 'Import another file' }).click();
    await page
      .getByRole('button', { name: 'Import file upload' })
      .locator('input[type="file"]')
      .setInputFiles(fixturePath('kb-export.csv'));
    await expect(page.getByRole('group', { name: 'Detected import format' })).toContainText(/csv/i);
    await expect(preview).toHaveAttribute('data-total-records', '3');
    await expect(preview).toHaveAttribute('data-text-only', '3');
    await expect(preview).toHaveAttribute('data-importable', '0');
    await page.getByRole('switch', { name: 'Re-embed records without usable vectors' }).click();
    await expect(preview).toHaveAttribute('data-importable', '3');
    await page.getByRole('button', { name: /^Import \d[\d,]* of / }).click();
    await expect(stats).toBeAttached({ timeout: INGEST_TIMEOUT });
    await expect(stats).toHaveAttribute('data-format', 'csv');
    await expect(stats).toHaveAttribute('data-reembedded', '3');
    await expect(page.getByRole('group', { name: 'Vector storage stats' })).toHaveAttribute('data-docs', '6');

    // Export native JSON (keep for the round-trip) + CSV + JSONL.
    const nativeExport = page.getByRole('button', { name: 'Export Native JSON' });
    const [nativeDownload] = await Promise.all([
      page.waitForEvent('download'),
      nativeExport.dispatchEvent('click'),
    ]);
    const nativeExportPath = testInfo.outputPath('knowledge-export.json');
    await nativeDownload.saveAs(nativeExportPath);
    await expect(page.getByRole('group', { name: 'Export panel' })).toHaveAttribute('data-last-format', 'native-json');
    await expect(page.getByRole('group', { name: 'Export panel' })).toHaveAttribute('data-last-records', '6');
    await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export CSV' }).dispatchEvent('click'),
    ]);
    await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export JSONL' }).dispatchEvent('click'),
    ]);

    // Re-import the native export → counts round-trip.
    await page.getByRole('button', { name: 'Import another file' }).click();
    await page
      .getByRole('button', { name: 'Import file upload' })
      .locator('input[type="file"]')
      .setInputFiles(nativeExportPath);
    await expect(page.getByRole('group', { name: 'Detected import format' })).toContainText(/native-json/i);
    await expect(preview).toHaveAttribute('data-total-records', '6');
    await expect(preview).toHaveAttribute('data-importable', '6');
    await page.getByRole('button', { name: /^Import \d[\d,]* of / }).click();
    await expect(stats).toBeAttached({ timeout: INGEST_TIMEOUT });
    await expect(stats).toHaveAttribute('data-format', 'native-json');
    await expect(stats).toHaveAttribute('data-imported', '6');

    await page.screenshot({ path: screenshotPath('kb-import-export.png'), fullPage: true });
  });

  /* ── document-qa: extractive QA (real DistilBERT-SQuAD) ──────────────── */

  test('document-qa answers an extractive question with a real DistilBERT-SQuAD model and confidence tiers', async ({
    page,
  }) => {
    test.setTimeout(15 * 60_000);
    await page.goto('/blocks/knowledge/document-qa');
    await expect(page.getByRole('group', { name: 'QA mode' })).toHaveAttribute('data-mode', 'extractive');

    expect(modelRequests(), 'no model bytes before the QA Load click').toEqual([]);
    await page.getByRole('button', { name: /DistilBERT-SQuAD/ }).click();
    await expect(page.getByRole('button', { name: /DistilBERT-SQuAD/ })).toHaveCount(0, {
      timeout: COLD_MODEL_TIMEOUT,
    });
    expect(modelRequests().length, 'loading extractive QA must have fetched real DistilBERT files').toBeGreaterThan(0);

    // Pasted-document context: switch to the paste source, load the sample doc.
    await page.getByRole('button', { name: 'Pasted document' }).click();
    await page.getByRole('button', { name: 'Load sample document' }).click();
    await expect(page.getByRole('textbox', { name: 'Document context' })).not.toHaveValue('');
    await page.getByRole('group', { name: 'Suggested questions' }).getByRole('button').nth(1).click();
    await expect(page.getByRole('textbox', { name: 'Question', exact: true })).not.toHaveValue('');

    await page.getByRole('button', { name: 'Ask', exact: true }).click();
    await expect(page.getByRole('group', { name: 'Latest answer' })).toHaveText(/Brazil/i, { timeout: INGEST_TIMEOUT });

    const scoreAttr = await page.getByRole('group', { name: 'Answer confidence' }).getAttribute('data-score');
    const score = Number.parseFloat(scoreAttr ?? '');
    expect(Number.isFinite(score), `qa-confidence data-score must be finite, got "${scoreAttr}"`).toBe(true);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);

    await page.screenshot({ path: screenshotPath('kb-qa-extractive.png'), fullPage: true });
  });

  /* ── rag-chat: grounded RAG ask (real Granite generation) ────────────── */

  test('rag-chat generates a grounded answer with real Granite and cites at least one source', async ({
    page,
  }) => {
    test.setTimeout(25 * 60_000);
    await page.goto('/blocks/knowledge/rag-chat');
    await loadSampleCorpus(page, 'rag-chat');

    const before = modelRequests().length;
    await page.getByRole('textbox', { name: 'Question about your documents' }).fill(RAG_QUESTION);
    await page.getByRole('button', { name: 'Ask', exact: true }).click();

    await expect(page.getByRole('group', { name: 'Answer duration' })).toHaveAttribute('data-ms', /^\d/, {
      timeout: 15 * 60_000,
    });
    expect(modelRequests().length, 'the grounded ask must have fetched the real generation model').toBeGreaterThan(before);

    const answer = (await page.getByRole('group', { name: 'Answer' }).first().innerText()).trim();
    expect(answer.length, 'grounded answer must be non-empty').toBeGreaterThan(0);
    const sourcesCount = Number.parseInt(
      (await page.getByRole('group', { name: 'Retrieved sources' }).getAttribute('data-count')) ?? '0',
      10,
    );
    expect(sourcesCount, 'grounded answer must cite at least one source').toBeGreaterThanOrEqual(1);

    await page.screenshot({ path: screenshotPath('kb-rag-grounded.png'), fullPage: true });
  });

  /* ── document-qa: Donut invoice QA (guarded heavy path) ──────────────── */

  test('document-qa answers an invoice question with the real Donut DocVQA model', async ({ page }) => {
    test.setTimeout(40 * 60_000);
    await page.goto('/blocks/knowledge/document-qa');
    await page.getByRole('group', { name: 'QA mode' }).getByRole('button', { name: 'Document QA' }).click();
    await expect(page.getByRole('group', { name: 'QA mode' })).toHaveAttribute('data-mode', 'donut');

    expect(modelRequests(), 'no model bytes before the Donut Load click').toEqual([]);
    await page.getByRole('button', { name: /Donut DocVQA/ }).click();
    await expect(page.getByRole('button', { name: /Donut DocVQA/ })).toHaveCount(0, { timeout: 30 * 60_000 });
    expect(modelRequests().length, 'loading Donut must have fetched real model files').toBeGreaterThan(0);

    await page
      .getByRole('group', { name: 'Document image upload' })
      .locator('input[type="file"]')
      .setInputFiles(fixturePath('kb-invoice.png'));
    await expect(page.getByRole('img', { name: 'Uploaded document' })).toBeVisible();
    await page.getByRole('group', { name: 'Suggested document questions' }).getByRole('button').first().click();
    await expect(page.getByRole('textbox', { name: 'Document question' })).toHaveValue('What is the total amount?');

    await page.getByRole('button', { name: 'Ask', exact: true }).click();
    await expect(page.getByRole('group', { name: 'Latest document answer' })).not.toHaveText('', { timeout: 10 * 60_000 });
    const answer = (await page.getByRole('group', { name: 'Latest document answer' }).innerText()).trim();
    expect(answer, 'Donut answer must read the fixture invoice').toMatch(/1,?234|4021|acme/i);

    const scoreAttr = await page
      .getByRole('group', { name: 'Document answer confidence' })
      .getAttribute('data-score');
    const score = Number.parseFloat(scoreAttr ?? '');
    expect(Number.isFinite(score), `donut-confidence data-score must be finite, got "${scoreAttr}"`).toBe(true);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);

    await page.screenshot({ path: screenshotPath('kb-doc-invoice.png'), fullPage: true });
  });

  /* ── redirects + bundle isolation + no-download-on-load ───────────────── */

  test('redirects knowledge-base + rag and keeps heavy stacks out of the index routes', async ({ page }) => {
    test.setTimeout(5 * 60_000);

    // Renamed-category + legacy 308s.
    await page.goto('/blocks/knowledge-base');
    await expect(page).toHaveURL(/\/blocks\/knowledge$/);
    await page.goto('/blocks/rag');
    await expect(page).toHaveURL(/\/blocks\/knowledge$/);

    // Bundle isolation: the homepage + gallery index must not bundle
    // pdfjs/langchain/model-host code in their OWN chunk graph.
    assertLeakSignaturesStillMatchTheirLibraries();
    const leaks: string[] = [];
    for (const route of ['/', '/blocks']) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      leaks.push(...(await scanRouteChunksForLeaks(page, route)));
    }
    expect(leaks, 'index routes must not load pdfjs/langchain/model-host chunks').toEqual([]);

    // Every knowledge deep page is inert on load: zero model bytes anywhere.
    for (const route of [
      '/blocks/knowledge',
      '/blocks/knowledge/semantic-search',
      '/blocks/knowledge/document-qa',
      '/blocks/knowledge/rag-chat',
      '/blocks/knowledge/vector-data-manager',
    ]) {
      await page.goto(route);
      await expect(page.getByRole('status').first()).toBeVisible();
      await page.waitForLoadState('networkidle');
    }
    expect(modelRequests(), 'no model bytes may be fetched by page loads anywhere in this test').toEqual([]);

    await page.screenshot({ path: screenshotPath('kb-redirect-bundle.png'), fullPage: true });
  });
});
