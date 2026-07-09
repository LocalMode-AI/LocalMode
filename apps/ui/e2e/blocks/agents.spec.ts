/**
 * @file agents.spec.ts
 * @description E2E suite for the `agents` category (split-agent-device Wave 3) —
 * the two self-sufficient blocks that grew out of `agent-structured-data`:
 * `/blocks/agents/research-agent` (tool-using ReAct loop + human-in-the-loop
 * approval) and `/blocks/agents/data-extractor` (schema-validated extraction into
 * the artifacts family), plus the `/blocks/agents` category page. Every lane of
 * the dissolved `agent-structured-data.spec.ts` is preserved with assertions
 * MOVED to the deep routes, never weakened.
 *
 * MODE→BLOCK RE-TARGET (honest delta): the old block was a two-mode container
 * over ONE shared WebLLM instance, and the old spec's "switch modes without
 * losing model state" lane proved that shared instance survived a mode switch.
 * The split DELIBERATELY removes the shared instance (D7 self-sufficiency): each
 * block owns its OWN `useModelLoad` (same default model id ⇒ browser-cache-shared
 * download, separate in-memory instances). There is no longer a mode switch to
 * preserve state across. The preserved-state INTENT re-targets to per-block
 * ownership: both blocks mount independently on the category page and each gates
 * its own load; within the data-extractor block, switching templates still
 * cancels/clears transient state (the surviving in-block "preserve/clear" path).
 *
 * WHAT IS REAL vs WHAT IS HARDWARE-GATED
 * - REAL (WebGPU runners): the WebLLM model download (Qwen3-1.7B-q4f16_1-MLC,
 *   ~1.1GB from the HuggingFace Hub) and every inference run for real. Nothing
 *   at the model boundary is mocked and no route interception touches model
 *   fetches.
 * - HARDWARE-GATED: WebLLM is WebGPU-only. WebGPU is probed at runtime with the
 *   SAME requestAdapter() probe the block + capability-gate use. On a runner
 *   WITHOUT a WebGPU adapter, each block renders the documented degraded state
 *   (`asd-webgpu-required` replaces the Load affordance; model-gated actions stay
 *   disabled); each such lane asserts that degraded behavior and carries a
 *   `hardware-gap` annotation — never a silent skip. The non-model UI (approval
 *   toggle, template picker, schema preview, load sample) is REAL on every runner.
 *
 * CONSOLE-ERROR POLICY: console + uncaught page errors are collected
 * context-wide from test start, written to attachments FIRST in afterEach, then
 * the test hard-fails on any console error / uncaught page error. The allowlist
 * is INTENTIONALLY EMPTY. Screenshots land in e2e-artifacts/screenshots/agents-*.
 * No skips, no soft assertions, no retries (config sets retries: 0).
 */

import * as path from 'node:path';
import { expect, test } from '@playwright/test';
import type { ConsoleMessage, Page, TestInfo, WebError } from '@playwright/test';

/* ────────────────────────────── constants ────────────────────────────── */

/** INTENTIONALLY EMPTY: these blocks must produce zero console errors. */
const CONSOLE_ERROR_ALLOWLIST: readonly RegExp[] = [];

/** URLs that carry WebLLM model bytes (HuggingFace Hub + weight extensions). */
const MODEL_BYTES_PATTERN = /huggingface\.co|hf\.co|cdn-lfs|\.wasm\b|params_shard|ndarray-cache/i;

/** Deep routes for the two agents blocks + the category page. */
const RESEARCH_ROUTE = '/blocks/agents/research-agent';
const EXTRACT_ROUTE = '/blocks/agents/data-extractor';
const CATEGORY_ROUTE = '/blocks/agents';

/** First sample research question (its chip's accessible name = this text). */
const SAMPLE_Q0 = 'What are the main benefits and challenges of quantum computing?';

/** Generous ceiling for one cold-cache WebLLM download reaching ready. */
const COLD_MODEL_TIMEOUT = 12 * 60_000;
/** Ceiling for a ReAct run / extraction on an already-loaded model. */
const RUN_TIMEOUT = 5 * 60_000;

/** apps/ui root, resolved from this spec file. */
const APP_DIR = path.join(__dirname, '..', '..');

/** Absolute path under apps/ui/e2e-artifacts/screenshots/ for a screenshot. */
function screenshotPath(name: string): string {
  return path.join(APP_DIR, 'e2e-artifacts', 'screenshots', name);
}

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

function modelRequests(): string[] {
  return requestUrls.filter((url) => MODEL_BYTES_PATTERN.test(url));
}

/* ───────────────────────────── shared steps ──────────────────────────── */

/**
 * Runtime WebGPU detection — the SAME requestAdapter() probe the blocks
 * (`isWebGPUSupported`) and the capability-gate primitive use. Headless/CI
 * Chromium exposes `navigator.gpu` with zero adapters, so a presence check
 * would lie; we probe for a real adapter.
 */
async function probeWebGPUAdapter(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    const gpu = (navigator as Navigator & {
      gpu?: { requestAdapter?: () => Promise<unknown | null> };
    }).gpu;
    if (!gpu || typeof gpu.requestAdapter !== 'function') return false;
    try {
      const adapter = await gpu.requestAdapter();
      return adapter != null;
    } catch {
      return false;
    }
  });
}

/** Open a block page and assert the idle status + no model bytes on load. */
async function gotoBlock(page: Page, route: string): Promise<void> {
  await page.goto(route);
  // The "Model status" group is the block's idle witness (role + name), present
  // on both the WebGPU and degraded layouts with data-status="idle".
  await expect(page.getByRole('group', { name: 'Model status' })).toHaveAttribute(
    'data-status',
    'idle',
  );
}

/**
 * Load the real WebLLM model via the explicit Load action (WebGPU runners only)
 * and witness both directions of the no-download-on-page-load invariant.
 */
async function loadModel(page: Page): Promise<void> {
  expect(modelRequests(), 'no model bytes may be fetched before Load').toEqual([]);
  await page.getByRole('button', { name: 'Load model' }).click();
  await expect(page.getByRole('group', { name: 'Model status' })).toHaveAttribute(
    'data-status',
    'ready',
    { timeout: COLD_MODEL_TIMEOUT },
  );
  expect(
    modelRequests().length,
    'loading must have fetched real WebLLM model files',
  ).toBeGreaterThan(0);
}

/* ─────────────────────────────── the suite ───────────────────────────── */

test.describe('blocks/agents', () => {
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

  /* ── category page: both blocks mount, own gated loads, zero downloads ── */

  test('category page mounts both agents blocks independently with zero model bytes', async ({
    page,
  }) => {
    test.setTimeout(3 * 60_000);
    await page.goto(CATEGORY_ROUTE);

    // Both blocks render, each in its own BlockShellSection (own install command,
    // own model layer). Scope per-block since testids repeat across the two.
    const research = page.locator('[data-block-shell="agents/research-agent"]');
    const extractor = page.locator('[data-block-shell="agents/data-extractor"]');
    await expect(research).toBeVisible();
    await expect(extractor).toBeVisible();

    // Research block: the approval gate defaults ON (the block showcases it).
    await expect(research.getByRole('switch', { name: /require tool approval/i })).toBeChecked();

    // Data-extractor block: the template picker + default schema preview are real
    // without a model. Default template is contact; its schema preview is exact.
    await expect(extractor.getByRole('group', { name: 'Extraction template' })).toHaveAttribute(
      'data-template',
      'contact',
    );
    await expect(
      extractor.getByText('{ name, email, phone?, company? }', { exact: true }),
    ).toBeVisible();

    // Zero model bytes for the whole category page (both blocks gated, no Load).
    await page.waitForLoadState('networkidle');
    expect(modelRequests(), 'no model bytes on category-page load').toEqual([]);

    await page.screenshot({ path: screenshotPath('agents-category.png'), fullPage: true });
  });

  /* ── research-agent: real ReAct loop + approval (WebGPU-branched) ──────── */

  test('research-agent: real ReAct run, timeline mirrors executed tools, approval blocks then feeds back', async ({
    page,
  }, testInfo) => {
    test.setTimeout(25 * 60_000);
    await gotoBlock(page, RESEARCH_ROUTE);

    // Non-model UI (every runner): the ReAct surface renders and the approval
    // gate (a real switch) defaults ON without a loaded model.
    const approvalToggle = page.getByRole('switch', { name: /require tool approval/i });
    await expect(approvalToggle).toBeVisible();
    await expect(approvalToggle).toBeChecked();

    const hasWebGPU = await probeWebGPUAdapter(page);

    if (!hasWebGPU) {
      // Degraded branch: WebLLM needs WebGPU, so the Load affordance is replaced
      // by the capability-gate fallback and model actions stay gated. Scope the
      // gate text to the live Preview panel (the Code tab also contains the
      // literal string from the block source).
      const preview = page.locator('[data-block-preview]');
      await expect(preview.getByText('WebGPU required', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Load model' })).toHaveCount(0);
      await expect(page.getByRole('group', { name: 'Model status' })).toHaveAttribute(
        'data-status',
        'idle',
      );
      // The run control (Send message) is disabled without a ready model.
      await expect(page.getByRole('button', { name: 'Send message' })).toBeDisabled();
      // The approval toggle is still real and defaults ON.
      await expect(approvalToggle).toBeChecked();
      testInfo.annotations.push({
        type: 'hardware-gap',
        description:
          'runner has no WebGPU adapter: the WebLLM ReAct loop is hardware-gated. The documented degraded gate (asd-webgpu-required + gated run control) was asserted instead of a real run. The real approval-blocking + deny-feedback path runs on WebGPU hardware (also transfers react-use-agent-approval tasks 5.1–5.4).',
      });
      await page.screenshot({ path: screenshotPath('agents-research-nogpu.png'), fullPage: true });
      return;
    }

    // ── WebGPU branch: real model + real ReAct loop ──
    await loadModel(page);

    // Keep approval ON (default) and run the fixed sample question (chip #0).
    await expect(approvalToggle).toBeChecked();
    await page.getByRole('button', { name: SAMPLE_Q0, exact: true }).click();

    // With approval ON, the loop must PAUSE before the first tool executes. The
    // run-state mirror + pending-approval group are reached by role/label.
    const runState = page.getByLabel('Agent run state', { exact: true });
    const pendingApproval = page.getByRole('group', { name: 'Pending tool approval' });
    await expect(pendingApproval).toBeVisible({ timeout: RUN_TIMEOUT });
    const pendingTool = await runState.getAttribute('data-pending-tool');
    expect(pendingTool, 'a tool must be pending approval').toBeTruthy();

    // PROVABLY blocked: no tool step is recorded while pending. Capture the
    // count, wait a real interval, and assert it did NOT advance.
    const countWhilePending = Number(await runState.getAttribute('data-tool-step-count'));
    await page.waitForTimeout(2500);
    expect(
      Number(await runState.getAttribute('data-tool-step-count')),
      'no tool may execute while an approval is pending',
    ).toBe(countWhilePending);
    await expect(runState).toHaveAttribute('data-pending-tool', pendingTool ?? '');

    // Approve → the tool executes and a step with a real observation appears.
    await pendingApproval.getByRole('button', { name: 'Approve' }).click();
    await expect(runState).toHaveAttribute('data-tool-step-count', String(countWhilePending + 1), {
      timeout: RUN_TIMEOUT,
    });

    // Drive the remaining steps: approve every subsequent pending call until the
    // run finishes.
    for (let i = 0; i < 20; i += 1) {
      const running = await runState.getAttribute('data-running');
      if (running !== 'running') break;
      if (await pendingApproval.isVisible().catch(() => false)) {
        await pendingApproval.getByRole('button', { name: 'Approve' }).click();
      }
      await page.waitForTimeout(1500);
    }
    await expect(runState).toHaveAttribute('data-running', 'idle', { timeout: RUN_TIMEOUT });

    // Timeline mirrors actual execution: every recorded tool step names a real
    // tool AND carries a non-empty observation (proving the tool executed).
    const toolSteps = page.getByLabel('Executed tool step', { exact: true });
    const toolStepCount = await toolSteps.count();
    expect(toolStepCount, 'the run must have executed at least one tool').toBeGreaterThan(0);
    for (let i = 0; i < toolStepCount; i += 1) {
      const name = await toolSteps.nth(i).getAttribute('data-tool');
      const observation = await toolSteps.nth(i).getAttribute('data-observation');
      expect(['search', 'note', 'calculate'], `tool #${i} is a real tool`).toContain(name);
      expect((observation ?? '').length, `tool #${i} produced a real observation`).toBeGreaterThan(0);
    }
    // Approval receipts persist immutably in the timeline.
    await expect(page.getByRole('group', { name: 'Tool approval receipts' })).toBeVisible();

    await page.screenshot({ path: screenshotPath('agents-research-run.png'), fullPage: true });

    // ── deny-feeds-back sub-lane: reset, run again, deny the first call ──
    await page.getByRole('button', { name: 'New Research' }).click();
    await page.getByRole('button', { name: SAMPLE_Q0, exact: true }).click();
    await expect(pendingApproval).toBeVisible({ timeout: RUN_TIMEOUT });
    const deniedTool = await runState.getAttribute('data-pending-tool');
    await pendingApproval.getByRole('button', { name: 'Reject' }).click();

    // A step is recorded for the denied call whose observation is the denial the
    // loop consumed — the tool did NOT execute a real result.
    await expect(page.getByRole('group', { name: 'Tool approval receipts' })).toContainText(
      /rejected/i,
      { timeout: RUN_TIMEOUT },
    );
    expect(deniedTool, 'a tool was pending before denial').toBeTruthy();
    const firstObs = await toolSteps.first().getAttribute('data-observation');
    expect((firstObs ?? '').toLowerCase(), 'denied step carries the denial observation').toContain(
      'denied',
    );

    testInfo.annotations.push({
      type: 'approval-verification',
      description:
        'Real-model approval pause + approve-resume + deny-feedback verified end-to-end; this lane is the committed verification surface for react-use-agent-approval tasks 5.1–5.4 (repointed here by split-agent-device Wave 3 from the dissolved agent-structured-data.spec.ts).',
    });

    await page.screenshot({ path: screenshotPath('agents-research-deny.png'), fullPage: true });
  });

  /* ── data-extractor: schema-valid JSON into table + chart (WebGPU) ─────── */

  test('data-extractor: exact schema-valid JSON renders in table + chart artifacts', async ({
    page,
  }, testInfo) => {
    test.setTimeout(25 * 60_000);
    await gotoBlock(page, EXTRACT_ROUTE);

    // Non-model UI (every runner): default template is contact; its schema
    // preview is exact; switching templates updates the preview + clears state.
    const extractInput = page.getByRole('textbox', { name: 'Text to extract from' });
    await expect(extractInput).toBeVisible();
    await expect(page.getByRole('group', { name: 'Extraction template' })).toHaveAttribute(
      'data-template',
      'contact',
    );
    await expect(page.getByText('{ name, email, phone?, company? }', { exact: true })).toBeVisible();

    const hasWebGPU = await probeWebGPUAdapter(page);

    // Review template: has numeric rating (drives the gauge chart).
    await page.getByRole('button', { name: 'Product Review' }).click();
    await expect(page.getByRole('group', { name: 'Extraction template' })).toHaveAttribute(
      'data-template',
      'review',
    );
    await expect(page.getByText('{ product, rating, pros[], cons[] }', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Load Sample' }).click();
    await expect(extractInput).toHaveValue(/NovaPhone X200/);

    if (!hasWebGPU) {
      // Degraded branch: no model, so Extract stays disabled and the gate shows.
      // Scope the gate text to the Preview panel (Code tab shares the string).
      await expect(
        page.locator('[data-block-preview]').getByText('WebGPU required', { exact: true }),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Extract' })).toBeDisabled();
      testInfo.annotations.push({
        type: 'hardware-gap',
        description:
          'runner has no WebGPU adapter: the WebLLM extraction is hardware-gated. The template picker, schema preview, load-sample, and disabled Extract control were asserted instead of a real extraction. The real schema-valid JSON → table + chart path runs on WebGPU hardware.',
      });
      await page.screenshot({ path: screenshotPath('agents-extract-nogpu.png'), fullPage: true });
      return;
    }

    // ── WebGPU branch: real extraction ──
    await loadModel(page);
    await page.getByRole('button', { name: 'Extract' }).click();

    const state = page.getByLabel('Extraction state', { exact: true });
    await expect(state).toHaveAttribute('data-has-result', 'true', { timeout: RUN_TIMEOUT });

    // The exact validated JSON is read from the rendered output (the JSON tab of
    // the structured-output viewer) — the value the USER sees.
    const artifactCanvas = page.getByRole('region', { name: 'Artifact canvas' });
    const objectJson = await page
      .getByRole('group', { name: 'Extracted data' })
      .locator('pre')
      .first()
      .textContent();
    const object = JSON.parse(objectJson ?? '{}') as {
      product?: string;
      rating?: number;
      pros?: string[];
      cons?: string[];
    };
    expect(typeof object.product, 'product must be a string').toBe('string');
    expect(typeof object.rating, 'rating must be a number').toBe('number');
    expect(object.rating).toBeGreaterThanOrEqual(1);
    expect(object.rating).toBeLessThanOrEqual(5);
    expect(Array.isArray(object.pros)).toBe(true);
    expect(Array.isArray(object.cons)).toBe(true);

    // Attempts counter reflects the retry budget.
    const attempts = Number(await state.getAttribute('data-attempts'));
    expect(attempts).toBeGreaterThanOrEqual(1);
    expect(attempts).toBeLessThanOrEqual(3);
    await expect(page.getByText(`Attempt ${attempts}/3`, { exact: true })).toBeVisible();

    // The artifacts home renders the SAME values: table body rows = pros + cons,
    // chart is the gauge of the extracted rating.
    await expect(artifactCanvas).toBeVisible();
    const expectedRows = (object.pros?.length ?? 0) + (object.cons?.length ?? 0);
    await expect(artifactCanvas.locator('table tbody tr')).toHaveCount(expectedRows);
    await expect(artifactCanvas.locator('[data-slot="chart-artifact"]')).toHaveAttribute(
      'data-chart-type',
      'gauge',
    );

    await page.screenshot({ path: screenshotPath('agents-extract-review.png'), fullPage: true });

    // Contact template → no numeric data → documented empty-chart state.
    await page.getByRole('button', { name: 'Contact Info' }).click();
    await page.getByRole('button', { name: 'Load Sample' }).click();
    await page.getByRole('button', { name: 'Extract' }).click();
    await expect(state).toHaveAttribute('data-has-result', 'true', { timeout: RUN_TIMEOUT });
    await expect(artifactCanvas.getByText(/No chart/)).toBeVisible();
    await expect(artifactCanvas.locator('[data-slot="chart-artifact"]')).toHaveCount(0);

    testInfo.annotations.push({
      type: 'self-correction',
      description:
        'attempts counter asserted in [1,3]; a real >1 retry is model-non-deterministic and not force-inducible without mocking the boundary. Documented, not faked.',
    });

    await page.screenshot({ path: screenshotPath('agents-extract-contact.png'), fullPage: true });
  });
});
