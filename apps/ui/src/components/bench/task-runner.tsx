'use client';
/**
 * @file task-runner.tsx
 * @description The /bench/tasks client: reads the session request from the
 * URL, fetches and verifies the item list from the local item server, and
 * runs one task session (runTaskSession) only after Run is pressed. Exposes
 * `window.__benchTasks` so a driver can inject its start captures, finish the
 * session with its end captures, and read the run file.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  runTaskSession,
  TaskPreflightError,
  type BenchRunResult,
  type HarnessInfo,
  type TaskDriverRecord,
  type TaskFinalizeCaptures,
  type TaskItem,
  type TaskSystemAdapter,
} from '@localmode/bench';
import {
  parseTaskRequest,
  planTaskSession,
  taskControl,
  taskExportFileName,
  translatorPackInComponents,
  verifyItemList,
  TASK_PAGE_CONTRACT,
  TASK_PAGE_VERSION,
  type TaskRequest,
  type TaskSessionPlan,
  type PlannedTaskCell,
} from '@/lib/bench/tasks';
import { chromeAvailability, precreateTranslators, taskAdapterFor, type PrecreatedTranslator } from '@/lib/bench/task-adapters';
import { benchBuildCommit, benchHarnessVersion, benchRuntimeVersions } from '@/lib/bench/runtime-versions';
import { triggerTextDownload } from '@/lib/bench/download';

/** How long the preflight waits for every built-in API to read `available` (Chrome reports `downloadable` briefly after start). */
const PREFLIGHT_AVAILABILITY_WAIT_MS = 30_000;

type Phase = 'loading-items' | 'refused' | 'ready' | 'running' | 'awaiting-download-click' | 'awaiting-finalize' | 'done' | 'failed';

interface BenchTasksStatus {
  version: string;
  phase: Phase;
  message?: string;
  cell?: string;
  itemsDone: number;
  itemsTotal: number;
  runId?: string;
  downloadCell?: string;
}

interface BenchTasksApi {
  version: string;
  contract: string;
  status(): BenchTasksStatus;
  setDriverStart(record: TaskDriverRecord): void;
  awaitFinalize(): Promise<void>;
  finalize(captures: TaskFinalizeCaptures): void;
  result(): BenchRunResult | null;
}

declare global {
  interface Window {
    __benchTasks?: BenchTasksApi;
  }
}

/**
 * The preflight: every built-in API and pair `available` (a Translator pair
 * also passes when it reads `downloadable` while the driver's
 * `chrome://components` record lists its pack: Chrome keeps an installed pack
 * `downloadable` in a new process until a clicked `create()`, which the Run
 * click has started), and the pinned Chrome build when one is set.
 */
async function preflight(
  request: TaskRequest,
  plan: TaskSessionPlan,
  precreated: ReadonlyMap<string, PrecreatedTranslator>,
): Promise<{ ok: boolean; detail: string }> {
  const readings: string[] = [];
  if (request.chromeBuild) {
    const uaData = (navigator as { userAgentData?: { getHighEntropyValues(h: string[]): Promise<{ fullVersionList?: Array<{ brand: string; version: string }> }> } }).userAgentData;
    const list = (await uaData?.getHighEntropyValues(['fullVersionList']))?.fullVersionList ?? [];
    const chrome = list.find((b) => b.brand === 'Google Chrome' || b.brand === 'Chromium');
    if (chrome?.version !== request.chromeBuild) return { ok: false, detail: `Chrome ${chrome?.version ?? 'unknown'} is not the pinned ${request.chromeBuild}` };
    readings.push(`chrome ${chrome.version}`);
  }
  if (request.phase === 'download') return { ok: true, detail: readings.join('; ') || 'download session' };
  const checks: Array<{ label: string; probe: () => Promise<string>; installed?: string }> = [];
  for (const cell of plan.cells) {
    if (cell.model.runtimeId !== 'chrome-ai') continue;
    const system = cell.model.benchModelId;
    if (system === 'chrome-translator' && cell.direction) {
      const d = cell.direction;
      const early = precreated.get(`${d.src}-${d.tgt}`);
      checks.push({
        label: `Translator ${d.src}-${d.tgt}`,
        probe: () => (early ? early.availability : chromeAvailability('Translator', { sourceLanguage: d.src, targetLanguage: d.tgt })),
        ...(early ? { installed: early.pack } : {}),
      });
    } else if (system.startsWith('chrome-summarizer')) {
      checks.push({ label: 'Summarizer', probe: () => chromeAvailability('Summarizer') });
    } else if (system === 'chrome-language-detector') {
      checks.push({ label: 'LanguageDetector', probe: () => chromeAvailability('LanguageDetector') });
    }
  }
  const deadline = performance.now() + PREFLIGHT_AVAILABILITY_WAIT_MS;
  for (const check of checks) {
    let state = await check.probe();
    if (state === 'downloadable' && check.installed) {
      readings.push(`${check.label} downloadable, pack installed (${check.installed}); created in the Run click`);
      continue;
    }
    while (state !== 'available' && (state === 'downloadable' || state === 'timeout') && performance.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1_000));
      state = await check.probe();
    }
    if (state !== 'available') return { ok: false, detail: `${check.label} reads ${state}` };
    readings.push(`${check.label} available`);
  }
  return { ok: true, detail: readings.join('; ') || 'no built-in system' };
}

/** Runtime versions recorded on the harness: the build's resolution plus what the page loaded. */
async function harnessRuntimeVersions(request: TaskRequest): Promise<Record<string, string>> {
  const build = benchRuntimeVersions();
  const out: Record<string, string> = {};
  for (const pkg of ['@localmode/bench', '@localmode/chrome-ai', '@localmode/transformers', '@localmode/mediapipe', '@huggingface/transformers', '@mediapipe/tasks-text']) {
    if (build[pkg]) out[pkg] = build[pkg];
  }
  if (request.systems.some((s) => s.startsWith('transformers-'))) {
    const hf = await import('@huggingface/transformers');
    const env = hf.env as unknown as { version?: string; backends: { onnx: { versions?: Record<string, string> } } };
    if (env.version) out['@huggingface/transformers'] = env.version;
    const web = env.backends.onnx.versions?.web;
    if (web) out['onnxruntime-web'] = web;
  }
  if (request.systems.some((s) => s.startsWith('transformers-wasm-current/'))) {
    const hf = await import('@huggingface/transformers-current');
    const env = hf.env as unknown as { version?: string; backends: { onnx: { versions?: Record<string, string> } } };
    if (env.version) out['@huggingface/transformers-current'] = env.version;
    const web = env.backends.onnx.versions?.web;
    if (web) out['onnxruntime-web-current'] = web;
  }
  return out;
}

export function TaskRunner() {
  const [request, setRequest] = useState<TaskRequest | null>(null);
  const [plan, setPlan] = useState<TaskSessionPlan | null>(null);
  const [items, setItems] = useState<TaskItem[]>([]);
  const [status, setStatus] = useState<BenchTasksStatus>({ version: TASK_PAGE_VERSION, phase: 'loading-items', itemsDone: 0, itemsTotal: 0 });
  const [result, setResult] = useState<BenchRunResult | null>(null);
  const statusRef = useRef(status);
  const resultRef = useRef<BenchRunResult | null>(null);
  const driverStartRef = useRef<TaskDriverRecord | undefined>(undefined);
  const finalizeWaiters = useRef<Array<() => void>>([]);
  const finalizeResolve = useRef<((c: TaskFinalizeCaptures) => void) | null>(null);
  const downloadClick = useRef<(() => void) | null>(null);

  const update = useCallback((patch: Partial<BenchTasksStatus>) => {
    statusRef.current = { ...statusRef.current, ...patch };
    setStatus(statusRef.current);
  }, []);

  useEffect(() => {
    window.__benchTasks = {
      version: TASK_PAGE_VERSION,
      contract: TASK_PAGE_CONTRACT,
      status: () => statusRef.current,
      setDriverStart: (record) => {
        driverStartRef.current = record;
      },
      awaitFinalize: () =>
        statusRef.current.phase === 'awaiting-finalize'
          ? Promise.resolve()
          : new Promise<void>((resolve) => finalizeWaiters.current.push(resolve)),
      finalize: (captures) => finalizeResolve.current?.(captures),
      result: () => resultRef.current,
    };
    return () => {
      delete window.__benchTasks;
    };
  }, []);

  useEffect(() => {
    const parsed = parseTaskRequest(window.location.search);
    if (!parsed.ok) {
      update({ phase: 'refused', message: parsed.message });
      return;
    }
    setRequest(parsed.request);
    const url = `${parsed.request.itemsOrigin}/${encodeURIComponent(parsed.request.list.id)}.jsonl`;
    (async () => {
      try {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) throw new Error(`${url} answered ${response.status}`);
        const verified = await verifyItemList(await response.text(), parsed.request.list);
        if (!verified.ok) {
          update({ phase: 'refused', message: `Item list refused: ${verified.message}` });
          return;
        }
        const p = planTaskSession(parsed.request, verified.items);
        setItems(verified.items);
        setPlan(p);
        update({ phase: 'ready', itemsTotal: p.cells.reduce((n, c) => n + c.items.length, 0) });
      } catch (error) {
        update({ phase: 'refused', message: `Item list could not be loaded: ${(error as Error).message}` });
      }
    })();
  }, [update]);

  const run = useCallback(async () => {
    if (!request || !plan) return;
    // Synchronously, inside the click's user activation: start create() for every Translator pair whose
    // pack the driver's chrome://components record lists, so a new Chrome process can use it.
    const parsed = driverStartRef.current?.components.start.parsed;
    const pairs =
      request.phase === 'download'
        ? []
        : plan.cells
            .filter((c) => c.model.runtimeId === 'chrome-ai' && c.model.benchModelId === 'chrome-translator' && c.direction)
            .map((c) => ({ src: c.direction!.src, tgt: c.direction!.tgt, pack: translatorPackInComponents(parsed, c.direction!.src, c.direction!.tgt) }))
            .filter((p): p is { src: string; tgt: string; pack: string } => p.pack !== undefined);
    const precreated = precreateTranslators(pairs);
    update({ phase: 'running', message: undefined, itemsDone: 0 });
    try {
      const adapters = new Map<string, TaskSystemAdapter>();
      for (const arm of plan.systemOrder) adapters.set(arm, taskAdapterFor(arm, request.list.set, precreated));
      const params = new URLSearchParams(window.location.search);
      const block = params.get('block');
      const count = Number(params.get('count') ?? '');
      const harness: HarnessInfo = {
        name: '@localmode/bench',
        version: benchHarnessVersion(),
        appVersion: 'localmode.ai',
        ...(benchBuildCommit() ? { commit: benchBuildCommit() } : {}),
        runtimeVersions: await harnessRuntimeVersions(request),
        ...(block && Number.isInteger(count) && count >= request.sessionIndex
          ? {
              series: {
                id: block.slice(0, 64),
                index: request.sessionIndex,
                count,
                ...(params.has('cooldown') ? { cooldownMs: Number(params.get('cooldown')) } : {}),
                ...(params.has('idle') ? { idleBeforeMs: Number(params.get('idle')) } : {}),
              },
            }
          : {}),
        control: taskControl(request, plan, driverStartRef.current),
      };
      let done = 0;
      const runResult = await runTaskSession({
        harness,
        cells: plan.cells,
        adapters,
        preflight: () => preflight(request, plan, precreated),
        beforeLoad:
          request.phase === 'download'
            ? (cell) =>
                new Promise<void>((resolve) => {
                  const id = `${(cell as PlannedTaskCell).arm}/${cell.workloadId}`;
                  downloadClick.current = () => {
                    downloadClick.current = null;
                    update({ phase: 'running', downloadCell: undefined });
                    resolve();
                  };
                  update({ phase: 'awaiting-download-click', downloadCell: id });
                })
            : undefined,
        finalize: async () => {
          if (!driverStartRef.current) return undefined;
          update({ phase: 'awaiting-finalize' });
          const captures = new Promise<TaskFinalizeCaptures>((resolve) => {
            finalizeResolve.current = resolve;
          });
          for (const w of finalizeWaiters.current.splice(0)) w();
          const c = await captures;
          update({ phase: 'running' });
          return c;
        },
        hooks: {
          onCellStart: (cell) => update({ cell: `${(cell as PlannedTaskCell).arm}/${cell.workloadId}` }),
          onItem: () => update({ itemsDone: ++done }),
        },
      });
      resultRef.current = runResult;
      setResult(runResult);
      update({ phase: 'done', runId: runResult.runId, cell: undefined });
    } catch (error) {
      const message = error instanceof TaskPreflightError ? `Preflight failed: ${error.detail}` : `${(error as Error).name}: ${(error as Error).message}`;
      update({ phase: 'failed', message });
    }
  }, [request, plan, update]);

  const exportJson = useCallback(() => {
    if (!result) return;
    triggerTextDownload(JSON.stringify(result, null, 2) + '\n', taskExportFileName(result.runId));
  }, [result]);

  return (
    <div className="flex flex-col gap-6">
      <p role="note" className="rounded-md border border-border bg-muted px-4 py-3 text-sm font-medium text-foreground">
        Control run: Chrome built-in task APIs; not published to the leaderboard
      </p>
      {request && (
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Task</dt>
          <dd>{request.task}</dd>
          <dt className="text-muted-foreground">Phase</dt>
          <dd>{request.phase}</dd>
          <dt className="text-muted-foreground">Item list</dt>
          <dd>
            {request.list.id} ({items.length}/{request.list.count} verified)
          </dd>
          <dt className="text-muted-foreground">Systems</dt>
          <dd>{plan ? plan.systemOrder.join(' > ') : request.systems.join(', ')}</dd>
          <dt className="text-muted-foreground">Session</dt>
          <dd>
            {request.sessionIndex}, {request.order} order{request.processCold ? ', process-cold' : ''}
          </dd>
        </dl>
      )}
      <p role="status" className="text-sm">
        {status.phase === 'loading-items' && 'Loading the item list from the local item server...'}
        {status.phase === 'ready' && `Ready: ${status.itemsTotal} items. Nothing has loaded yet.`}
        {status.phase === 'running' && `Running ${status.cell ?? ''} (${status.itemsDone}/${status.itemsTotal} items)`}
        {status.phase === 'awaiting-download-click' && `Waiting for the download click: ${status.downloadCell}`}
        {status.phase === 'awaiting-finalize' && 'Waiting for the driver end captures'}
        {status.phase === 'done' && `Done: run ${status.runId}`}
        {(status.phase === 'refused' || status.phase === 'failed') && status.message}
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={run}
          disabled={status.phase !== 'ready'}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          Run task session
        </button>
        {status.phase === 'awaiting-download-click' && (
          <button
            type="button"
            onClick={() => downloadClick.current?.()}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Start download: {status.downloadCell}
          </button>
        )}
        <button
          type="button"
          onClick={exportJson}
          disabled={!result}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          Export JSON
        </button>
      </div>
      {result && (
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Cells of the session</caption>
          <thead>
            <tr className="border-b border-border">
              <th className="py-1 pr-3">Cell</th>
              <th className="py-1 pr-3">Status</th>
              <th className="py-1 pr-3">Items</th>
              <th className="py-1 pr-3">Failed</th>
              <th className="py-1">Median item ms</th>
            </tr>
          </thead>
          <tbody>
            {result.cells.map((cell) => {
              const summary = result.clientSummaries?.find((s) => s.cellId === cell.cellId);
              return (
                <tr key={cell.cellId} className="border-b border-border">
                  <td className="py-1 pr-3 font-mono text-xs">{cell.cellId}</td>
                  <td className="py-1 pr-3">{cell.status}{cell.error ? `: ${cell.error.message}` : ''}</td>
                  <td className="py-1 pr-3">{cell.iterations.length}</td>
                  <td className="py-1 pr-3">{summary?.itemsFailed ?? 0}</td>
                  <td className="py-1">{summary?.itemTotalMs ? summary.itemTotalMs.median.toFixed(1) : '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
