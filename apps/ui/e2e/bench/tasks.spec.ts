/**
 * @file tasks.spec.ts
 * @description /bench/tasks in an installed Chrome with Chrome's built-in AI
 * reachable: the driver's launch (persistent profile, headed, Playwright's
 * default `--disable-features` re-passed without OptimizationHints, field
 * trials and component updates left on), a production build on
 * 127.0.0.1:3100 and an item server on 127.0.0.1:3101 started here. Real
 * models only: a download session for the Translator pairs (clicked), then
 * one five-item session per task with the built-in API and the q8 fallback,
 * each with the driver's start and end captures, exported with Export JSON
 * and checked offline (digest, validation, fields, outputs, stamps). Every
 * console message, page error and request is written to
 * e2e-artifacts/tasks/.
 *
 * Needs, outside the repository: the installed Chrome (`TASKS_CHROME`), a
 * profile holding the on-device models (`TASKS_PROFILE`; Gemini Nano for the
 * Summarizer, the language detection model, the en/de Translator pack or
 * network to fetch it), the sample files the five-item lists are cut from
 * (`TASK_SAMPLES_DIR`), and `pnpm --filter ui build` done. Run headed, by
 * itself: `E2E_REUSE_SERVER=1 TASK_SAMPLES_DIR=<dir> pnpm --filter ui exec playwright test e2e/bench/tasks.spec.ts`
 * (a server on :3000 must exist for the config's webServer; this spec uses
 * its own on :3100).
 */
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  sha256HexSync,
  TASKS_PROTOCOL_VERSION,
  validateSubmission,
  verifyRunDigest,
  type BenchRunResult,
  type TaskComponentEntry,
  type TaskDriverRecord,
  type TaskIteration,
} from '@localmode/bench';
import { listBody, listDigest, pilotLists, sampleLists } from './task-items';
import { TASK_ITEM_LISTS } from '../../src/lib/bench/task-item-lists';

const CHROME = process.env.TASKS_CHROME ?? '/Users/dev/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROFILE =
  process.env.TASKS_PROFILE ??
  '/private/tmp/claude-502/-Users-dev-dev-LocalMode/02191924-40c2-4ce7-b7b4-1817037ca449/scratchpad/chrome-ld-verify/profile';
/** The page and item server ports (3100 and 3101 by default, as the driver uses). */
const PAGE_PORT = Number(process.env.TASKS_PAGE_PORT ?? 3100);
const ITEMS_PORT = Number(process.env.TASKS_ITEMS_PORT ?? 3101);
const PAGE_ORIGIN = `http://127.0.0.1:${PAGE_PORT}`;
const ITEMS_ORIGIN = `http://127.0.0.1:${ITEMS_PORT}`;
const UI_DIR = path.resolve(__dirname, '..', '..');
const ARTIFACTS = path.join(UI_DIR, 'e2e-artifacts', 'tasks');

/** Playwright's default `--disable-features` list (1.61); the launch drops it and re-passes it without OptimizationHints. */
const PW_DISABLED =
  'AvoidUnnecessaryBeforeUnloadCheckSync,BoundaryEventDispatchTracksNodeRemoval,DestroyProfileOnBrowserClose,DialMediaRouteProvider,GlobalMediaControls,HttpsUpgrades,LensOverlay,MediaRouter,PaintHolding,ThirdPartyStoragePartitioning,Translate,AutoDeElevate,RenderDocument,OptimizationHints,msForceBrowserSignIn,msEdgeUpdateLaunchServicesPreferredVersion';
const KEPT_DISABLED = PW_DISABLED.split(',').filter((f) => f !== 'OptimizationHints').join(',');
const LAUNCH_ARGS = [
  '--unlimited-storage',
  '--start-maximized',
  `--disable-features=${KEPT_DISABLED}`,
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream',
];
const IGNORED_DEFAULT_ARGS = [
  '--enable-unsafe-swiftshader',
  '--no-sandbox',
  '--disable-field-trial-config',
  '--disable-component-update',
  `--disable-features=${PW_DISABLED}`,
];

/** Hosts a session may reach besides the two local servers: model and runtime hosts only. */
const ALLOWED_REMOTE_HOSTS = [/(^|\.)huggingface\.co$/, /(^|\.)hf\.co$/, /^cdn\.jsdelivr\.net$/, /^storage\.googleapis\.com$/];

interface ConsoleRecord {
  type: string;
  text: string;
  url: string;
  page: string;
}

const consoleLog: ConsoleRecord[] = [];
const pageErrors: string[] = [];
const requests: string[] = [];
let context: BrowserContext;
let page: Page;
let nextServer: ChildProcess | undefined;
let itemServer: http.Server;
let commandLine = '';
/** Translator cells that read `downloadable` at create() (an installed pack in a new process). */
const translatorDownloadableAtCreate: string[] = [];
/** MediaPipe items that returned no candidate (reported in the artifacts). */
const emptyFallbackDetections: string[] = [];

/**
 * Console errors that are not defects of the page under test. Each entry:
 * why it is harmless.
 * - MediaPipe's WASM runtime writes its INFO/W-level glog lines through
 *   Emscripten's printErr, which Chrome reports at error level
 *   (`text_wasm_internal.js`); the same allowlist entry as audio.spec.ts.
 */
function isAllowedConsoleError(r: ConsoleRecord): boolean {
  return /tasks-text@0\.10\.35\/wasm\/text_wasm_internal\.js/.test(r.url) && /^(INFO|W\d{4}|I\d{4}):?/.test(r.text);
}

function folderBytes(dir: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    try {
      const kb = Number(execFileSync('du', ['-sk', full], { encoding: 'utf8' }).split('\t')[0]);
      out[name] = kb * 1024;
    } catch {
      out[name] = statSync(full).size;
    }
  }
  return out;
}

function freeDiskBytes(dir: string): number {
  const line = execFileSync('df', ['-k', dir], { encoding: 'utf8' }).trim().split('\n').pop()!;
  return Number(line.split(/\s+/)[3]) * 1024;
}

/** Parse `chrome://components` text: `<name> - Version: <v>` then `Status - <s>` (the page shows no ids). */
function parseComponents(text: string): TaskComponentEntry[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const out: TaskComponentEntry[] = [];
  for (let i = 0; i < lines.length; i++) {
    const v = /^(.+?) - Version: (.+)$/.exec(lines[i]);
    if (!v) continue;
    const status = /^Status - (.+)$/.exec(lines[i + 1] ?? '');
    out.push({ name: v[1], version: v[2], status: status?.[1] ?? '', id: '' });
  }
  return out;
}

async function internalPageText(url: string): Promise<string> {
  const tab = await context.newPage();
  try {
    await tab.goto(url, { timeout: 15_000 });
    await tab.waitForTimeout(1_500);
    // chrome://on-device-internals renders inside shadow roots, which innerText does not reach.
    const text = await tab.evaluate(() => {
      const BLOCK = /^(DIV|P|LI|TR|H[1-6]|SECTION|TABLE|UL|OL|DT|DD|TD|TH|BR)$/;
      const walk = (node: Node): string => {
        let out = '';
        for (const child of Array.from(node.childNodes)) {
          if (child.nodeType === Node.TEXT_NODE) out += child.textContent ?? '';
          else if (child.nodeType === Node.ELEMENT_NODE) {
            const el = child as Element;
            if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
            if (el.shadowRoot) out += walk(el.shadowRoot);
            out += walk(el);
            if (BLOCK.test(el.tagName)) out += '\n';
          }
        }
        return out;
      };
      return document.body.innerText.trim().length > 0 && !document.body.querySelector('*:not(script):not(style)')?.shadowRoot
        ? document.body.innerText
        : walk(document.body);
    });
    return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').slice(0, 200_000);
  } finally {
    await tab.close();
  }
}

async function captures() {
  const components = await internalPageText('chrome://components');
  const internals = await internalPageText('chrome://on-device-internals');
  return {
    components: { text: components, parsed: parseComponents(components) },
    onDeviceInternals: {
      text: internals,
      ...(/Device performance class: (\S+)/.exec(internals) ? { performanceClass: /Device performance class: (\S+)/.exec(internals)![1] } : {}),
    },
    freeDiskBytes: freeDiskBytes(PROFILE),
    profileFolderBytes: folderBytes(PROFILE),
  };
}

async function driverStart(): Promise<TaskDriverRecord> {
  const version = await internalPageText('chrome://version');
  const c = await captures();
  return {
    driverVersion: 'tasks.spec/1',
    launch: { executablePath: CHROME, args: LAUNCH_ARGS, ignoredDefaultArgs: IGNORED_DEFAULT_ARGS, commandLine },
    profileId: 'e2e-scratch',
    chromeVersionText: version,
    components: { start: c.components },
    onDeviceInternals: { start: c.onDeviceInternals },
    freeDiskBytes: { start: c.freeDiskBytes },
    profileFolderBytes: { start: c.profileFolderBytes },
  };
}

async function waitForHttp(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await new Promise<boolean>((resolve) => {
      http.get(url, (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      }).on('error', () => resolve(false));
    });
    if (ok) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${url} did not answer 200 within ${timeoutMs} ms`);
}

/**
 * Open a session page, inject the driver captures, run it (clicking every
 * download button a download session asks for), hand over the end captures
 * through the finalize handshake, and return the file Export JSON saved.
 */
async function runSession(
  query: string,
  opts: { withDriver: boolean; downloadCells?: string[]; expectItemsTotal?: number },
): Promise<BenchRunResult> {
  let startFolders: Record<string, number> | undefined;
  await page.goto(`${PAGE_ORIGIN}/bench/tasks?${query}`);
  await expect(page.getByRole('note')).toHaveText('Control run: Chrome built-in task APIs; not published to the leaderboard');
  await expect(page.getByRole('status')).toContainText('Ready:', { timeout: 30_000 });
  if (opts.expectItemsTotal !== undefined) {
    // The driver's readiness check: the page reports the kept items, so it applies the limit.
    expect((await page.evaluate(() => window.__benchTasks!.status())).itemsTotal).toBe(opts.expectItemsTotal);
  }
  // Nothing model-related was requested by opening the page.
  expect(requests.filter((u) => ALLOWED_REMOTE_HOSTS.some((h) => h.test(new URL(u).hostname)))).toEqual([]);
  if (opts.withDriver) {
    const start = await driverStart();
    startFolders = start.profileFolderBytes.start;
    await page.evaluate((record) => window.__benchTasks!.setDriverStart(record), start as never);
  }
  await page.getByRole('button', { name: 'Run task session' }).click();
  const deadline = Date.now() + 25 * 60_000;
  for (;;) {
    const status = await page.evaluate(() => window.__benchTasks!.status());
    if (status.phase === 'done') break;
    if (status.phase === 'failed' || status.phase === 'refused') throw new Error(`session ${status.phase}: ${status.message}`);
    if (status.phase === 'awaiting-download-click') {
      await page.getByRole('button', { name: /^Start download:/ }).click();
    } else if (status.phase === 'awaiting-finalize') {
      const end = await captures();
      // As the driver does per click, here over the session: the Translator pack folder's change and,
      // apart from it, the whole profile's.
      const packDelta = (end.profileFolderBytes.TranslateKit ?? 0) - (startFolders?.TranslateKit ?? 0);
      const sum = (f: Record<string, number> | undefined) => Object.values(f ?? {}).reduce((a, b) => a + b, 0);
      const wholeDelta = sum(end.profileFolderBytes) - sum(startFolders);
      const cells = opts.downloadCells ?? [];
      await page.evaluate((c) => window.__benchTasks!.finalize(c), {
        ...end,
        modelBytesDeltaByCell: Object.fromEntries(cells.map((id) => [id, packDelta])),
        profileBytesDeltaByCell: Object.fromEntries(cells.map((id) => [id, wholeDelta])),
      });
    }
    if (Date.now() > deadline) throw new Error(`session did not finish: ${JSON.stringify(status)}`);
    await page.waitForTimeout(1_000);
  }
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON' }).click();
  const download = await downloadPromise;
  const file = path.join(ARTIFACTS, download.suggestedFilename());
  await download.saveAs(file);
  return JSON.parse(readFileSync(file, 'utf8')) as BenchRunResult;
}

/** Checks every task run must pass. */
async function expectValidRun(run: BenchRunResult, phase: string) {
  expect(await verifyRunDigest(run)).toBe(true);
  const report = validateSubmission(run);
  expect(report.shapeErrors).toEqual([]);
  expect(report.flags.filter((f) => f.severity === 'reject')).toEqual([]);
  expect(report.ok).toBe(true);
  const tasks = run.harness.control!.tasks!;
  expect(run.harness.control!.kind).toBe('chrome-ai-tasks');
  expect(tasks.protocol).toBe(TASKS_PROTOCOL_VERSION);
  expect(tasks.phase).toBe(phase);
  expect(run.protocol).toBe('localmode-bench/5');
  expect(run.fingerprint).not.toBeNull();
  expect(run.environment.pageOrigin).toBe(PAGE_ORIGIN);
  // The page sees the browser's own identity (no user-agent override on the context).
  expect(run.environment.userAgent).toContain('Macintosh');
  for (const cell of run.cells) {
    expect(cell.status, `${cell.cellId}: ${cell.error?.message ?? ''}`).toBe('ok');
    expect(cell.task?.api).toBeTruthy();
  }
}

/** Per-item checks: non-empty outputs, hashes, monotone stamps within and across items. */
function expectItems(run: BenchRunResult, expectItemsPerArm: number) {
  const byArm = new Map<string, number>();
  for (const cell of run.cells) {
    // Opus-MT is one system per direction; count its directions together as the fallback arm.
    const arm = `${cell.runtimeId}/${cell.model.benchModelId.replace(/^opus-mt-[a-z]+-[a-z]+@/, 'opus-mt@')}`;
    let previousEnd = -Infinity;
    for (const it of cell.iterations as TaskIteration[]) {
      expect(it.error, `${cell.cellId} ${it.itemId}`).toBeUndefined();
      if (cell.runtimeId === 'mediapipe' && it.detect?.length === 0) {
        // MediaPipe's detector, as the provider configures it, returns no candidate for some short inputs:
        // an empty output, which the analysis counts as an item failure. Everything else must answer.
        expect(it.text, `${cell.cellId} ${it.itemId}`).toBe('');
        emptyFallbackDetections.push(`${cell.cellId} ${it.itemId}`);
      } else {
        expect(it.text.length, `${cell.cellId} ${it.itemId} output`).toBeGreaterThan(0);
      }
      expect(it.outputSha256).toBe(sha256HexSync(it.text));
      expect(it.startT).toBeGreaterThanOrEqual(previousEnd);
      let t = it.startT;
      for (const c of it.chunks) {
        expect(c.t).toBeGreaterThanOrEqual(t);
        t = c.t;
      }
      expect(it.endT).toBeGreaterThanOrEqual(t);
      expect(it.chunks.reduce((n, c) => n + c.c, 0)).toBe(it.text.length);
      previousEnd = it.endT;
    }
    byArm.set(arm, (byArm.get(arm) ?? 0) + cell.iterations.length);
  }
  for (const [arm, n] of byArm) expect(n, arm).toBe(expectItemsPerArm);
}

/**
 * The test runner fills every context option a launch leaves out from the
 * project's "Desktop Chrome" preset (a Windows user agent, a viewport, a
 * scale factor); naming them as undefined keeps the browser's own identity,
 * which the measurement records.
 */
const NO_DEVICE_PRESET = { userAgent: undefined, deviceScaleFactor: undefined, isMobile: undefined, hasTouch: undefined, screen: undefined };

// Each task reports on its own: a failure relaunches the worker (and Chrome) instead of skipping the rest.
test.describe('/bench/tasks in an installed Chrome', () => {
  test.setTimeout(40 * 60_000);

  test.beforeAll(async () => {
    test.setTimeout(10 * 60_000);
    mkdirSync(ARTIFACTS, { recursive: true });
    expect(existsSync(path.join(UI_DIR, '.next', 'BUILD_ID')), 'run pnpm --filter ui build first').toBe(true);

    // Item server: the five-item lists, each checked against its compiled pin.
    const dir = mkdtempSync(path.join(tmpdir(), 'task-items-'));
    for (const [id, items] of Object.entries({ ...pilotLists(), ...sampleLists() })) {
      const pin = TASK_ITEM_LISTS.find((l) => l.id === id);
      expect(pin, id).toBeDefined();
      expect(listDigest(items)).toBe(pin!.sha256);
      writeFileSync(path.join(dir, `${id}.jsonl`), listBody(items));
    }
    itemServer = http.createServer((req, res) => {
      const name = decodeURIComponent((req.url ?? '/').slice(1).split('?')[0]);
      const file = path.join(dir, path.basename(name));
      res.setHeader('Access-Control-Allow-Origin', PAGE_ORIGIN);
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      if (!name.endsWith('.jsonl') || !existsSync(file)) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8' });
      res.end(readFileSync(file));
    });
    await new Promise<void>((resolve) => itemServer.listen(ITEMS_PORT, '127.0.0.1', resolve));

    nextServer = spawn(path.join(UI_DIR, 'node_modules', '.bin', 'next'), ['start', '-p', String(PAGE_PORT), '-H', '127.0.0.1'], {
      cwd: UI_DIR,
      stdio: 'ignore',
    });
    await waitForHttp(`${PAGE_ORIGIN}/bench/tasks`, 60_000);

    // The profile lets chrome://on-device-internals open (the driver's Local State setting).
    const localStatePath = path.join(PROFILE, 'Local State');
    const localState = JSON.parse(readFileSync(localStatePath, 'utf8')) as Record<string, unknown>;
    localState.internal_only_uis_enabled = true;
    writeFileSync(localStatePath, JSON.stringify(localState));

    context = await chromium.launchPersistentContext(PROFILE, {
      executablePath: CHROME,
      headless: false,
      viewport: null,
      ...NO_DEVICE_PRESET,
      acceptDownloads: true,
      args: LAUNCH_ARGS,
      ignoreDefaultArgs: IGNORED_DEFAULT_ARGS,
    });
    const ps = execFileSync('ps', ['-axww', '-o', 'args='], { encoding: 'utf8' })
      .split('\n')
      .find((l) => l.includes(`--user-data-dir=${PROFILE}`) && !l.includes('--type='));
    commandLine = ps?.trim() ?? '';
    // The launch the measurement depends on: no OptimizationHints, field trials and component updates on.
    expect(commandLine).toContain(`--disable-features=${KEPT_DISABLED}`);
    expect(commandLine).not.toContain('OptimizationHints');
    expect(commandLine).not.toContain('--disable-field-trial-config');
    expect(commandLine).not.toContain('--disable-component-update');

    context.on('console', (m) => consoleLog.push({ type: m.type(), text: m.text(), url: m.location()?.url ?? '', page: m.page()?.url() ?? '' }));
    context.on('weberror', (e) => pageErrors.push(`${e.error().name}: ${e.error().message}`));
    context.on('request', (r) => requests.push(r.url()));
    page = context.pages()[0] ?? (await context.newPage());
  });

  // Every test: no console error (beyond the documented allowlist), no page error, and no request
  // beyond the two local servers and the model and runtime hosts. The full record is kept in artifacts.
  test.afterEach(async ({}, testInfo) => {
    const slug = testInfo.title.replace(/[^a-z0-9]+/gi, '-').slice(0, 60);
    writeFileSync(path.join(ARTIFACTS, `${slug}.console.json`), JSON.stringify({ consoleLog, pageErrors, requests, emptyFallbackDetections }, null, 2));
    const errors = consoleLog.filter((r) => r.type === 'error' && !isAllowedConsoleError(r));
    const foreign = requests.filter((u) => {
      const url = new URL(u);
      if (url.protocol === 'data:' || url.protocol === 'blob:' || url.protocol === 'chrome:') return false;
      if (url.origin === PAGE_ORIGIN || url.origin === ITEMS_ORIGIN) return false;
      return !ALLOWED_REMOTE_HOSTS.some((h) => h.test(url.hostname));
    });
    const thrown = [...pageErrors];
    consoleLog.length = 0;
    pageErrors.length = 0;
    requests.length = 0;
    expect(errors).toEqual([]);
    expect(thrown).toEqual([]);
    expect(foreign).toEqual([]);
  });

  test.afterAll(async () => {
    await context?.close().catch(() => undefined);
    nextServer?.kill('SIGTERM');
    await new Promise<void>((resolve) => (itemServer ? itemServer.close(() => resolve()) : resolve()));
  });

  for (const spec of [
    // Translate first: right after the launch an installed pack still reads `downloadable`, the case the
    // page handles by creating the pair inside the Run click.
    { task: 'translate', list: 'pilot-e2e-translate-flores-5', builtIn: 'chrome-ai/chrome-translator', fallback: 'transformers-wasm/opus-mt@q8' },
    { task: 'summarize', list: 'pilot-e2e-summarize-cnndm-5', builtIn: 'chrome-ai/chrome-summarizer', fallback: 'transformers-wasm/distilbart-cnn-6-6@q8' },
    { task: 'detect-language', list: 'pilot-e2e-detect-flores-5', builtIn: 'chrome-ai/chrome-language-detector', fallback: 'mediapipe/mediapipe-language-detector' },
  ] as const) {
    const fallbackDtype = process.env.TASKS_FALLBACK_DTYPE ?? 'fp32';
    const fallback = spec.fallback.replace('@q8', `@${fallbackDtype}`);
    test(`${spec.task}: five items on the built-in API and the ${fallbackDtype} fallback`, async () => {
      const run = await runSession(
        `phase=pilot&task=${spec.task}&list=${spec.list}&items=${ITEMS_ORIGIN}&session=1&order=fixed&cold=0&systems=${spec.builtIn},${fallback}`,
        { withDriver: true, downloadCells: ['chrome-ai/chrome-translator/translate-en-de-pilot', 'chrome-ai/chrome-translator/translate-de-en-pilot'] },
      );
      writeFileSync(path.join(ARTIFACTS, `${spec.task}-summary.json`), JSON.stringify(run.clientSummaries, null, 2));
      await expectValidRun(run, 'pilot');
      const tasks = run.harness.control!.tasks!;
      expect(tasks.systemOrder[0]).toBe(spec.builtIn);
      expect(run.harness.control!.runtimeOrder[0]).toBe('chrome-ai');
      // Driver captures, start and end, inside the digest.
      const driver = tasks.driver!;
      expect(driver.launch.commandLine).toBe(commandLine);
      expect(driver.chromeVersionText).toMatch(/Google Chrome/);
      expect(driver.components.start.parsed.length).toBeGreaterThan(0);
      expect(driver.components.end?.parsed.length).toBeGreaterThan(0);
      expect(driver.onDeviceInternals.end?.text.length).toBeGreaterThan(0);
      expect(driver.onDeviceInternals.start.performanceClass).toBeTruthy();
      expect(driver.components.start.parsed.map((c) => c.name)).toContain('Optimization Guide On DeviceModels Manifest');
      expect(driver.freeDiskBytes.end).toBeGreaterThan(0);
      expect(Object.keys(driver.profileFolderBytes.end ?? {})).toContain('Default');
      expectItems(run, 5);
      for (const cell of run.cells) {
        const builtIn = cell.runtimeId === 'chrome-ai';
        const items = cell.iterations as TaskIteration[];
        if (builtIn) {
          expect(cell.resolvedBackend).toBe('chrome-builtin');
          expect(cell.task!.availabilityBefore).toBeTruthy();
          if (cell.model.benchModelId === 'chrome-translator') {
            // Created in the Run click because chrome://components lists the pack; both readings kept.
            expect(cell.runtimeConfig).toMatchObject({ createdInRunClick: true, packInComponents: expect.stringMatching(/^Chrome TranslateKit de-en /) });
            expect(['available', 'downloadable']).toContain(cell.task!.availabilityAtCreate);
            if (cell.task!.availabilityAtCreate === 'downloadable') {
              translatorDownloadableAtCreate.push(cell.cellId);
              // An installed pack: the create() downloads nothing into the pack folder.
              expect(cell.task!.download).toMatchObject({ modelFolders: ['TranslateKit'], modelBytesSource: 'driver-click', modelBytesDelta: 0 });
              expect(typeof cell.task!.download!.wholeProfileBytesDelta).toBe('number');
            }
          } else {
            expect(cell.task!.availabilityAtCreate).toBe('available');
          }
          for (const it of items) expect(it).toMatchObject({ inputTruncated: null, inputTokens: null, modelMaxTokens: null });
          expect(cell.task!.availabilityAfter).toBe('available');
          // A finite quota is a number; Chrome's unbounded quota (Infinity) is recorded as null plus inputQuotaRaw.
          if (cell.task!.inputQuota === null) expect(cell.runtimeConfig?.inputQuotaRaw).toBe('Infinity');
          else expect(typeof cell.task!.inputQuota).toBe('number');
          for (const it of items) expect(it.inputUsage?.unit).toBe('chrome-quota');
          if (spec.task !== 'detect-language') {
            for (const it of items) expect(['delta', 'cumulative-converted']).toContain(it.chunkMode);
          }
        } else if (spec.task !== 'detect-language') {
          expect(cell.resolvedBackend).toBe('wasm');
          const dtype = process.env.TASKS_FALLBACK_DTYPE ?? 'fp32';
          expect(cell.runtimeConfig).toMatchObject({ dtype, device: 'wasm', quantized: dtype === 'q8', pinVerified: true });
          expect(String(cell.runtimeConfig!.revision)).toMatch(/^[0-9a-f]{40}$/);
          for (const it of items) expect(it.chunkMode).toBe('none');
          const limit = spec.task === 'summarize' ? 1024 : 512;
          expect(cell.runtimeConfig?.modelMaxTokens).toBe(limit);
          for (const it of items) {
            expect(it.modelMaxTokens).toBe(limit);
            expect(it.inputTokens).toBeGreaterThan(0);
            expect(it.inputTruncated).toBe(it.inputTokens! > limit);
          }
        } else {
          expect(cell.runtimeConfig).toMatchObject({ delegate: 'CPU', pinVerified: true });
        }
        const fallbackDtype = process.env.TASKS_FALLBACK_DTYPE ?? 'fp32';
        if (!builtIn && spec.task !== 'detect-language') expect(cell.runtimeConfig?.dtype).toBe(fallbackDtype);
        if (spec.task === 'translate') for (const it of items) expect(it.source).toBeTruthy();
        if (spec.task === 'detect-language') {
          for (const it of items) {
            if (!builtIn && it.detect!.length === 0) continue; // MediaPipe's empty answer, checked in expectItems
            expect(it.detect!.length).toBeGreaterThan(0);
            expect(it.text).toBe(it.detect![0].language);
          }
        }
      }
      if (spec.task === 'translate') {
        writeFileSync(path.join(ARTIFACTS, 'translator-downloadable-at-create.json'), JSON.stringify(translatorDownloadableAtCreate));
        // One create() per pair, in the plan's order, each timed on its own: the spans follow each other.
        const pairs = run.cells.filter((c) => c.model.benchModelId === 'chrome-translator');
        expect(pairs.map((c) => c.runtimeConfig?.createOrder)).toEqual(pairs.map((_, i) => i + 1));
        for (let i = 1; i < pairs.length; i++) expect(pairs[i].load!.startT).toBeGreaterThanOrEqual(pairs[i - 1].load!.endT);
        expect(new Set(pairs.map((c) => `${c.load!.startT}-${c.load!.endT}`)).size).toBe(pairs.length);
      }
      if (spec.task === 'detect-language') {
        const builtInCell = run.cells.find((c) => c.runtimeId === 'chrome-ai')!;
        // The raw list is kept: Chrome returns `und` beside a clear sentence.
        expect((builtInCell.iterations as TaskIteration[]).some((it) => it.detect!.some((d) => d.language === 'und'))).toBe(true);
      }
    });
  }

  for (const spec of [
    { task: 'summarize', list: 'pilot-e2e-summarize-cnndm-1', arm: 'transformers-wasm-current/distilbart-cnn-6-6@q8', limit: 1024 },
    { task: 'translate', list: 'pilot-e2e-translate-flores-1', arm: 'transformers-wasm-current/opus-mt@q8', limit: 512 },
  ] as const) {
    test(`${spec.task}: one item on the secondary q8 arm (pinned files, current-releases Transformers.js)`, async () => {
      const run = await runSession(
        `phase=pilot&task=${spec.task}&list=${spec.list}&items=${ITEMS_ORIGIN}&session=1&order=fixed&cold=0&systems=${spec.arm}`,
        { withDriver: true },
      );
      await expectValidRun(run, 'pilot');
      expect(run.harness.control!.runtimeOrder).toEqual(['transformers-wasm-current']);
      expect(run.harness.runtimeVersions?.['@huggingface/transformers-current']).toBe('4.3.1');
      expectItems(run, 1);
      const [cell] = run.cells;
      expect(cell.runtimeId).toBe('transformers-wasm-current');
      expect(cell.resolvedBackend).toBe('wasm');
      expect(cell.runtimeConfig).toMatchObject({
        dtype: 'q8',
        quantized: true,
        device: 'wasm',
        transformersBundle: 'current-releases',
        transformersVersion: '4.3.1',
        pinVerified: true,
        modelMaxTokens: spec.limit,
      });
      expect(String(cell.runtimeConfig!.onnxruntimeWebVersion)).toMatch(/^1\.31\./);
      const [item] = cell.iterations as TaskIteration[];
      expect(item.modelMaxTokens).toBe(spec.limit);
      expect(item.inputTruncated).toBe(item.inputTokens! > spec.limit);
    });
  }


  test('pilot-sizing: the first 3 items of the summarize S list, with the full list digest kept', async () => {
    const run = await runSession(
      `phase=pilot-sizing&task=summarize&list=summarize-cnndm-test-S&items=${ITEMS_ORIGIN}&session=1&order=fixed&cold=0&limit=3&systems=chrome-ai/chrome-summarizer,transformers-wasm/distilbart-cnn-6-6@fp32`,
      { withDriver: true, expectItemsTotal: 3 },
    );
    await expectValidRun(run, 'pilot-sizing');
    const list = run.harness.control!.tasks!.itemList;
    const pin = TASK_ITEM_LISTS.find((l) => l.id === 'summarize-cnndm-test-S')!;
    expect(list).toMatchObject({ id: pin.id, count: 300, sha256: pin.sha256, limitedTo: { count: 3, limit: 3 } });
    const firstThree = sampleLists()['summarize-cnndm-test-S'].slice(0, 3);
    expect(list.limitedTo!.sha256).toBe(listDigest(firstThree));
    expectItems(run, 3);
    for (const cell of run.cells) expect((cell.iterations as TaskIteration[]).map((it) => it.itemId)).toEqual(firstThree.map((i) => i.id));
  });

  test('a download session clicks create() for each Translator pair and records availability and the download', async () => {
    const run = await runSession(
      `phase=download&task=translate&list=pilot-e2e-translate-flores-5&items=${ITEMS_ORIGIN}&systems=chrome-ai/chrome-translator`,
      { withDriver: true, downloadCells: ['chrome-ai/chrome-translator/translate-en-de-pilot', 'chrome-ai/chrome-translator/translate-de-en-pilot'] },
    );
    await expectValidRun(run, 'download');
    expect(run.cells.map((c) => c.workloadId)).toEqual(['translate-en-de-pilot', 'translate-de-en-pilot']);
    for (const cell of run.cells) {
      expect(cell.iterations).toEqual([]);
      expect(cell.task!.availabilityAfter).toBe('available');
      expect(['available', 'downloadable', 'downloading']).toContain(cell.task!.availabilityAtCreate);
      if (cell.task!.availabilityAtCreate !== 'available') {
        expect(cell.task!.download).toMatchObject({ modelFolders: ['TranslateKit'], modelBytesSource: 'driver-click' });
        expect(Number.isInteger(cell.task!.download!.modelBytesDelta)).toBe(true);
        expect(Number.isInteger(cell.task!.download!.wholeProfileBytesDelta)).toBe(true);
      }
    }
  });

});
