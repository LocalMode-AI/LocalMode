'use client';

/**
 * @file bench-runner.tsx
 * @description Client runner for the LocalMode Bench: suite + lane selection with
 * availability preflight (no provider code loads until Run), live progress,
 * results table, JSON export, and leaderboard submission. Every model download
 * happens strictly behind the explicit Run action.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  BenchCellResult,
  BenchModelRef,
  BenchRunResult,
  BenchSuiteId,
  CellSummary,
  PlannedCell,
  RunnerActivity,
} from '@localmode/bench';
import {
  computeRunDigest,
  EMBED_WORKLOADS,
  LLM_WORKLOADS,
  orderCells,
  QUALITY_WORKLOADS,
  RUN_POLICIES,
  runBenchmarkSuite,
  memoryApiAvailable,
  sampleMemoryBytes,
} from '@localmode/bench';
import { BENCH_MODELS, SUITE_MODELS } from '@/lib/bench/catalog';
import { wllamaAvailability } from '@/lib/bench/adapters';
import {
  chromeAIStatus,
  onChromeAIDownloadProgress,
  startChromeAIDownload,
  type ChromeAIStatus,
} from '@/lib/bench/chrome-ai-download';
import { benchBuildCommit, benchRuntimeVersions } from '@/lib/bench/runtime-versions';
import { describeRetryCause } from '@/lib/bench/overlay-text';
import {
  beginAttempt,
  finishAttempt,
  listUnfinishedAttempts,
  partialRunDiagnostics,
  toPartialRunExport,
  updateAttempt,
  type PartialAttempt,
} from '@/lib/bench/partial-run-store';
import { Button } from '@/registry/localmode/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/registry/localmode/ui/card';
import { Badge } from '@/registry/localmode/ui/badge';
import { Progress } from '@/registry/localmode/ui/progress';
import { Switch } from '@/registry/localmode/ui/switch';
import { Label } from '@/registry/localmode/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/registry/localmode/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/registry/localmode/ui/table';

const HARNESS_VERSION = '0.6.1';

type Phase = 'idle' | 'running' | 'done' | 'error';

interface LaneAvailability {
  ok: boolean;
  reason?: string;
  /** Shown beside an available lane that needs a caveat (e.g. a one-time browser download on Run). */
  note?: string;
}

/** Lightweight availability probes - no provider packages are imported here. */
async function probeLaneAvailability(): Promise<{
  lanes: Record<string, LaneAvailability>;
  webgpu: boolean;
  chromeAI: ChromeAIStatus;
}> {
  let webgpu = false;
  try {
    const gpu = (navigator as { gpu?: { requestAdapter(): Promise<unknown | null> } }).gpu;
    webgpu = gpu ? (await Promise.race([
      gpu.requestAdapter(),
      new Promise<null>((r) => setTimeout(() => r(null), 3000)),
    ])) !== null : false;
  } catch {
    webgpu = false;
  }
  // Gemini Nano is a lane whenever Chrome can supply it: ready now, or after
  // the one-time download the Run click starts (Chrome needs a user activation).
  const chromeAIState = await chromeAIStatus();
  const chromeAI: LaneAvailability =
    chromeAIState === 'available'
      ? { ok: true }
      : chromeAIState === 'downloadable' || chromeAIState === 'downloading'
        ? { ok: true, note: 'Chrome downloads Gemini Nano once when you click Run' }
        : chromeAIState === 'unavailable'
          ? { ok: false, reason: 'Gemini Nano unavailable on this device' }
          : { ok: false, reason: 'Prompt API not supported' };
  const gpuGate: LaneAvailability = webgpu ? { ok: true } : { ok: false, reason: 'no WebGPU' };
  const wllamaGate = await wllamaAvailability();
  return {
    lanes: {
      'transformers-webgpu': gpuGate,
      'transformers-wasm': { ok: true },
      webllm: gpuGate,
      wllama: wllamaGate.ok ? { ok: true } : { ok: false, reason: wllamaGate.reason },
      'wllama-webgpu': !webgpu ? gpuGate : wllamaGate.ok ? { ok: true } : { ok: false, reason: wllamaGate.reason },
      litert: { ok: true },
      'chrome-ai': chromeAI,
      mediapipe: { ok: true },
    },
    webgpu,
    chromeAI: chromeAIState,
  };
}

/**
 * Phones and tablets cannot hold the Standard or Thorough suites: those load
 * several runtimes' multi-hundred-megabyte WASM heaps in one page (the heaps
 * never shrink) and mobile browsers kill the tab well before that, which lost
 * the whole run on an iPhone. Mobile devices run the Quick suite.
 */
function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const uaData = (navigator as { userAgentData?: { mobile?: boolean; platform?: string } }).userAgentData;
  if (uaData?.mobile === true) return true;
  // A foldable unfolded or a "desktop site" request drops the Mobile token and
  // can rewrite the UA to a Linux desktop one; the UA-CH platform still says Android.
  if (uaData?.platform === 'Android') return true;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

function formatBytes(bytes?: number): string {
  if (!bytes) return '-';
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

function formatMs(ms?: number): string {
  if (ms === undefined) return '-';
  return ms >= 10_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}

/** Elapsed wall time as "1 m 12 s" / "45 s". */
function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return m > 0 ? `${m} m ${sec} s` : `${sec} s`;
}

/** One planned cell as the overlay tracks it. */
interface PlannedCellInfo {
  cellId: string;
  runtimeId: string;
  laneKey: string;
  laneName: string;
  workloadLabel: string;
  kind: 'llm-generate' | 'embed' | 'quality-mmlu' | 'quality-sts';
  sizeBytes: number;
  skipped: boolean;
}

/** Outcome of a finished cell, as the overlay tracks it. */
interface FinishedCellInfo {
  status: string;
  durationMs: number;
}

/**
 * Time priors per cell kind (ms) for the remaining-time estimate before this
 * run has measured a cell of that kind; taken from the lab runs on laptops.
 */
const CELL_PRIOR_MS: Record<PlannedCellInfo['kind'], number> = {
  'llm-generate': 60_000,
  embed: 15_000,
  'quality-mmlu': 120_000,
  'quality-sts': 30_000,
};
/** Download rate assumed until this run has observed one (bytes per second). */
const DOWNLOAD_PRIOR_BPS = 15 * 1024 * 1024;
/** Engine and session initialization per model group, on top of the download. */
const LOAD_INIT_PRIOR_MS = 20_000;

function medianOf(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Remaining wall time for the run: measured durations of same-kind cells in
 * this run where available (same lane first), priors otherwise, plus a
 * download + initialization allowance for every model group not loaded yet
 * and the cool-down between groups. An approximation by design; the overlay
 * labels it as one.
 */
function estimateRemainingMs(input: {
  planned: PlannedCellInfo[];
  finished: Map<string, FinishedCellInfo>;
  currentCellId: string | null;
  currentCellElapsedMs: number;
  downloadBps: number | null;
  loadedLanes: Set<string>;
  cooldownMs: number;
}): { remainingMs: number; measured: boolean } {
  const { planned, finished, currentCellId, currentCellElapsedMs, downloadBps, loadedLanes, cooldownMs } = input;
  const byLaneKind = new Map<string, number[]>();
  const byKind = new Map<string, number[]>();
  for (const cell of planned) {
    const f = finished.get(cell.cellId);
    if (!f || cell.skipped || f.status === 'skipped') continue;
    const laneKindKey = `${cell.laneKey}|${cell.kind}`;
    byLaneKind.set(laneKindKey, [...(byLaneKind.get(laneKindKey) ?? []), f.durationMs]);
    byKind.set(cell.kind, [...(byKind.get(cell.kind) ?? []), f.durationMs]);
  }
  let measured = false;
  let remaining = 0;
  const lanesCounted = new Set<string>();
  for (const cell of planned) {
    if (finished.has(cell.cellId)) continue;
    if (cell.skipped) continue;
    const own = medianOf(byLaneKind.get(`${cell.laneKey}|${cell.kind}`) ?? []);
    const kind = medianOf(byKind.get(cell.kind) ?? []);
    const expected = own ?? kind ?? CELL_PRIOR_MS[cell.kind];
    if (own !== undefined || kind !== undefined) measured = true;
    remaining += cell.cellId === currentCellId ? Math.max(expected - currentCellElapsedMs, expected * 0.1) : expected;
    if (!loadedLanes.has(cell.laneKey) && !lanesCounted.has(cell.laneKey)) {
      lanesCounted.add(cell.laneKey);
      remaining += cell.sizeBytes / (downloadBps ?? DOWNLOAD_PRIOR_BPS) * 1000 + LOAD_INIT_PRIOR_MS + cooldownMs;
    }
  }
  return { remainingMs: remaining, measured };
}

/** "about 12 minutes" / "under a minute" / "about 1 hour 5 minutes". */
function formatEta(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return 'under a minute';
  if (minutes < 60) return `about ${minutes} minute${minutes === 1 ? '' : 's'}`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `about ${h} hour${h === 1 ? '' : 's'}${m > 0 ? ` ${m} minute${m === 1 ? '' : 's'}` : ''}`;
}

/** Silence long enough to explain; the watchdog itself acts at the policy's stall budget (2 min, 3 for loads). */
const STALL_WARNING_MS = 45_000;

/** Phases where silence is the runtime building a session, not a stall. */
const QUIET_PHASES = new Set<RunnerActivity['phase']>(['load', 'warmup', 'reload']);

function describeActivity(a: RunnerActivity): string {
  switch (a.phase) {
    case 'load':
      return a.pct !== undefined ? `downloading ${Math.round(a.pct)}%` : 'loading (cache probe, download, session)';
    case 'warmup':
      return a.chars !== undefined ? `warmup · ${a.chars} chars streamed` : 'warmup';
    case 'iteration':
      return `iteration ${a.iteration ?? '?'}/${a.total ?? '?'}${
        a.chars !== undefined ? ` · ${a.chars} chars in ${a.chunks ?? 0} chunks` : ''
      }`;
    case 'quality':
      return `quality item ${a.iteration ?? '?'}/${a.total ?? '?'}`;
    case 'reload':
      return a.pct !== undefined ? `warm reload · ${Math.round(a.pct)}%` : 'warm reload (loading from cache)';
    case 'waiting-visible':
      return 'paused until this tab is in front';
  }
}

function laneKey(model: BenchModelRef): string {
  return `${model.runtimeId}/${model.benchModelId}`;
}

/**
 * Paid-study session read from the URL (`?PROLIFIC_PID=<id>&cc=<code>`).
 * The participant id is never stored or published as-is: the run carries a
 * short SHA-256 prefix so a payment can be verified against a dataset row
 * without the dataset revealing who ran it. The completion code is shown only
 * after the run finishes and the submission attempt has resolved, whether it
 * succeeded or not (payment is on attempt, never on our infrastructure).
 */
interface StudySession {
  participantHash: string;
  completionCode: string | null;
}

const PROLIFIC_COMPLETE_URL = 'https://app.prolific.com/submissions/complete?cc=';

async function readStudySession(): Promise<StudySession | null> {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const pid = params.get('PROLIFIC_PID')?.trim();
  if (!pid) return null;
  const code = params.get('cc')?.trim() || null;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pid));
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  return { participantHash: hex.slice(0, 12), completionCode: code && /^[A-Za-z0-9]{4,32}$/.test(code) ? code : null };
}

export function BenchRunner() {
  const [suite, setSuite] = useState<Exclude<BenchSuiteId, 'custom'>>('quick');
  const [availability, setAvailability] = useState<{
    lanes: Record<string, LaneAvailability>;
    webgpu: boolean;
    chromeAI: ChromeAIStatus;
  } | null>(null);
  /** Gemini Nano download progress while the suite runs (null when no download is in flight). */
  const [chromeDownloadPct, setChromeDownloadPct] = useState<number | null>(null);
  const [disabledLanes, setDisabledLanes] = useState<Set<string>>(new Set());
  const [includeQuality, setIncludeQuality] = useState(false);
  const [autoSubmit, setAutoSubmit] = useState(true);
  const [phase, setPhase] = useState<Phase>('idle');
  const [statusLine, setStatusLine] = useState('');
  const [cellProgress, setCellProgress] = useState<{ index: number; total: number } | null>(null);
  const [loadPct, setLoadPct] = useState<number | null>(null);
  /** Latest observable step inside the running cell, stamped with wall-clock time. */
  const [activity, setActivity] = useState<(RunnerActivity & { at: number }) | null>(null);
  /** Wall-clock time the current cell started; drives the elapsed counter. */
  const [cellStartedAt, setCellStartedAt] = useState<number | null>(null);
  /** Wall-clock time of the last observable event of any kind (heartbeat source). */
  const [lastActivityAt, setLastActivityAt] = useState<number | null>(null);
  /** Ticks every 500 ms while a run is in progress; it stops when the main thread is busy. */
  const [now, setNow] = useState<number>(() => Date.now());
  /** Watchdog verdicts and retries, newest last, kept for the whole run. */
  const [retryNotices, setRetryNotices] = useState<string[]>([]);
  /** The cells this run planned, in execution order, for the overlay's checklist and estimate. */
  const [planned, setPlanned] = useState<PlannedCellInfo[]>([]);
  /** Finished cells by id with their outcome and wall duration. */
  const [finished, setFinished] = useState<Map<string, FinishedCellInfo>>(() => new Map());
  const [currentCellId, setCurrentCellId] = useState<string | null>(null);
  const cellStartRef = useRef<number | null>(null);
  const currentCellRef = useRef<string | null>(null);
  /** Lanes whose model has been loaded (their first cell has started), for the estimate. */
  const [loadedLanes, setLoadedLanes] = useState<Set<string>>(() => new Set());
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  /** Observed download rate (bytes per second) from load progress events, for the estimate. */
  const [downloadBps, setDownloadBps] = useState<number | null>(null);
  const downloadObs = useRef<{ t: number; pct: number; bytes: number } | null>(null);
  /** Times the tab went to the background during the run (those iterations are marked invalid). */
  const [hiddenCount, setHiddenCount] = useState(0);
  const [result, setResult] = useState<BenchRunResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<
    | { kind: 'idle' }
    | { kind: 'submitting' }
    | { kind: 'done'; flagged: boolean; url?: string }
    | { kind: 'failed'; message: string; retryAt?: number }
  >({ kind: 'idle' });
  const abortRef = useRef<AbortController | null>(null);
  const [study, setStudy] = useState<StudySession | null>(null);
  const [mobile, setMobile] = useState(false);
  /** Attempts an earlier page left unfinished (tab crash, closed tab): exportable, never submitted. */
  const [unfinished, setUnfinished] = useState<PartialAttempt[]>([]);

  useEffect(() => {
    let cancelled = false;
    probeLaneAvailability().then((a) => {
      if (!cancelled) setAvailability(a);
    });
    readStudySession().then((s) => {
      if (!cancelled) setStudy(s);
    });
    listUnfinishedAttempts().then((attempts) => {
      if (!cancelled) setUnfinished(attempts);
    });
    setMobile(isMobileDevice());
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (phase !== 'running') return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [phase]);

  // A hidden tab invalidates timed iterations (the harness records it); the
  // overlay counts the events so the participant sees the consequence. Leaving
  // the page mid-run loses it, so the browser asks first.
  useEffect(() => {
    if (phase !== 'running') return;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') setHiddenCount((n) => n + 1);
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [phase]);

  /** Model lanes for the selected suite, annotated with availability.
   *  A runtime lane can be usable while a specific model still needs WebGPU
   *  (e.g. LiteRT runs Qwen3 on CPU but its Gemma 4 build is GPU-compiled). */
  const lanes = useMemo(() => {
    const ids = SUITE_MODELS[suite];
    return BENCH_MODELS.filter((m) => ids.includes(m.benchModelId)).map((model) => {
      const lane = availability?.lanes[model.runtimeId];
      const modelGate = model.requiresWebGPU && availability?.webgpu === false;
      const available = (lane?.ok ?? false) && !modelGate;
      return { model, available, reason: modelGate ? 'no WebGPU' : lane?.reason, note: lane?.note };
    });
  }, [suite, availability]);

  const activeLanes = lanes.filter((l) => l.available && !disabledLanes.has(laneKey(l.model)));
  // The two llama.cpp lanes share one GGUF per model (same URL, one provider
  // cache), so a file is counted once no matter how many lanes load it.
  const totalDownload = [...new Map(activeLanes.map((l) => [l.model.url ?? laneKey(l.model), l.model.sizeBytes ?? 0])).values()].reduce(
    (acc, bytes) => acc + bytes,
    0,
  );

  /**
   * Every lane of the suite becomes cells, so a suite result always lists the
   * cells the suite defines: lanes the submitter switched off or that this
   * device cannot run are planned with a skip reason and recorded as skipped,
   * never dropped (a "thorough" run with three cells says nothing about the
   * lanes it left out).
   */
  const buildCells = useCallback((): PlannedCell[] => {
    const cells: PlannedCell[] = [];
    const llmWorkloads = suite === 'quick' ? [LLM_WORKLOADS[0]] : [...LLM_WORKLOADS];
    for (const { model, available, reason } of lanes) {
      const skipReason = !available
        ? `runtime unavailable: ${reason ?? 'unknown'}`
        : disabledLanes.has(laneKey(model))
          ? 'lane disabled by the submitter'
          : undefined;
      const plan = (workload: PlannedCell['workload']) =>
        cells.push(skipReason ? { model, workload, skipReason } : { model, workload });
      if (model.task === 'llm') {
        for (const workload of llmWorkloads) plan(workload);
        if (includeQuality) plan(QUALITY_WORKLOADS[0]);
      } else {
        for (const workload of EMBED_WORKLOADS) plan(workload);
        if (includeQuality) plan(QUALITY_WORKLOADS[2]);
      }
    }
    return cells;
  }, [lanes, disabledLanes, suite, includeQuality]);

  const submitRun = useCallback(async (run: BenchRunResult) => {
    setSubmitState({ kind: 'submitting' });
    try {
      const res = await fetch('/api/bench/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(run),
      });
      const body = (await res.json()) as {
        ok: boolean;
        flagged?: boolean;
        url?: string;
        message?: string;
        code?: string;
        retryAfterSec?: number;
      };
      if (body.ok) {
        setSubmitState({ kind: 'done', flagged: body.flagged ?? false, url: body.url });
      } else {
        // A shared network address (a household or office behind one NAT)
        // can exhaust the hourly window; the run is kept and resubmitted
        // by itself once the window opens, as long as the page stays open.
        const retryAfterSec =
          body.code === 'rate-limited' && typeof body.retryAfterSec === 'number' ? body.retryAfterSec : undefined;
        setSubmitState({
          kind: 'failed',
          message: body.message ?? body.code ?? `Submission failed (${res.status})`,
          ...(retryAfterSec ? { retryAt: Date.now() + retryAfterSec * 1000 } : {}),
        });
      }
    } catch {
      setSubmitState({ kind: 'failed', message: 'Network error during submission.' });
    }
  }, []);

  // Automatic resubmission after a rate-limited attempt; a tick keeps the
  // countdown live once the run overlay's own clock has stopped.
  const retryAt = submitState.kind === 'failed' ? submitState.retryAt : undefined;
  useEffect(() => {
    if (!retryAt || !result) return;
    const tick = setInterval(() => setNow(Date.now()), 1_000);
    const timer = setTimeout(() => void submitRun(result), Math.max(0, retryAt - Date.now()) + 1_000);
    return () => {
      clearInterval(tick);
      clearTimeout(timer);
    };
  }, [retryAt, result, submitRun]);

  const run = useCallback(async () => {
    // Synchronous part of the click handler: Chrome accepts the Gemini Nano
    // download request only inside the user activation, before any await.
    const chromeLaneActive = activeLanes.some((l) => l.model.runtimeId === 'chrome-ai');
    let unsubscribeDownload: (() => void) | null = null;
    if (chromeLaneActive && availability && availability.chromeAI !== 'available') {
      if (startChromeAIDownload()) {
        setChromeDownloadPct(0);
        unsubscribeDownload = onChromeAIDownloadProgress((pct) => setChromeDownloadPct(pct));
      }
    }
    setPhase('running');
    setResult(null);
    setErrorMessage(null);
    setSubmitState({ kind: 'idle' });
    setStatusLine('Preparing…');
    setActivity(null);
    setCellStartedAt(Date.now());
    setLastActivityAt(Date.now());
    setRetryNotices([]);
    setFinished(new Map());
    setCurrentCellId(null);
    cellStartRef.current = null;
    setLoadedLanes(new Set());
    setRunStartedAt(Date.now());
    setDownloadBps(null);
    downloadObs.current = null;
    setHiddenCount(0);
    const controller = new AbortController();
    abortRef.current = controller;
    setCancelling(false);
    let attempt: PartialAttempt | null = null;
    try {
      // Nonce first so the whole run is bound to this session.
      let nonce: string | undefined;
      try {
        const res = await fetch('/api/bench/nonce');
        if (res.ok) nonce = ((await res.json()) as { nonce: string }).nonce;
      } catch {
        // Offline / dev - the run still works, submission may be rejected.
      }

      const [{ createLLMAdapters, createEmbedAdapters }] = await Promise.all([
        import('@/lib/bench/adapters'),
      ]);
      const cells = buildCells();
      // The overlay lists steps in the order the runner executes them.
      const ordered = orderCells(cells);
      const orderedIds = ordered.map((c) => `${c.model.runtimeId}/${c.model.benchModelId}/${c.workload.id}`);
      setPlanned(
        ordered.map((c) => ({
          cellId: `${c.model.runtimeId}/${c.model.benchModelId}/${c.workload.id}`,
          runtimeId: c.model.runtimeId,
          laneKey: laneKey(c.model),
          laneName: c.model.displayName,
          workloadLabel: c.workload.label,
          kind:
            c.workload.kind === 'llm-generate'
              ? 'llm-generate'
              : c.workload.kind === 'quality-mmlu'
                ? 'quality-mmlu'
                : c.workload.kind === 'quality-sts'
                  ? 'quality-sts'
                  : 'embed',
          sizeBytes: c.model.sizeBytes ?? 0,
          skipped: Boolean(c.skipReason),
        })),
      );
      const harness = {
        name: '@localmode/bench',
        version: HARNESS_VERSION,
        appVersion: 'localmode.ai',
        runtimeVersions: benchRuntimeVersions(),
        commit: benchBuildCommit(),
      };
      // Progress goes to IndexedDB cell by cell, so a tab that dies mid-suite
      // still leaves an exportable partial record on the next page load.
      attempt = await beginAttempt({
        suite,
        harness,
        plannedCellIds: cells.map((c) => `${c.model.runtimeId}/${c.model.benchModelId}/${c.workload.id}`),
      });
      const suiteResult = await runBenchmarkSuite({
        suite,
        cells,
        policy: RUN_POLICIES[suite],
        llmAdapters: createLLMAdapters(),
        embedAdapters: createEmbedAdapters(),
        harness,
        userReportedDevice: study ? `prolific:${study.participantHash}` : undefined,
        abortSignal: controller.signal,
        hooks: {
          onEnvironment: (environment) => {
            if (attempt) void updateAttempt(attempt, { environment });
          },
          onPhase: (p) => setStatusLine(p === 'fingerprint' ? 'Hardware calibration…' : `Phase: ${p}`),
          onCellStart: (cellId, index, total) => {
            // Number steps by the overlay's plan (what the checklist shows), not
            // the runner's counter, which skips warm reloads and skipped cells.
            const planned = orderedIds.indexOf(cellId);
            setCellProgress(planned >= 0 ? { index: planned + 1, total: orderedIds.length } : { index: index + 1, total });
            setLoadPct(null);
            setActivity(null);
            setCellStartedAt(Date.now());
            setLastActivityAt(Date.now());
            currentCellRef.current = cellId;
            setCurrentCellId(cellId);
            cellStartRef.current = Date.now();
            const lane = cellId.split('/').slice(0, 2).join('/');
            setLoadedLanes((prev) => (prev.has(lane) ? prev : new Set(prev).add(lane)));
            setStatusLine(`Running ${cellId}`);
            if (attempt) void updateAttempt(attempt, { currentCellId: cellId, currentPhase: 'iteration' });
          },
          onActivity: (a) => {
            const at = Date.now();
            setActivity({ ...a, at });
            setLastActivityAt(at);
            if (a.phase === 'load' || a.phase === 'warmup' || a.phase === 'reload') {
              // A model group's load and warmup happen before its first timed
              // cell starts, so the step line follows the lane being loaded
              // instead of the step that just finished.
              const index = orderedIds.indexOf(a.cellId);
              if (index >= 0 && currentCellRef.current !== a.cellId) {
                currentCellRef.current = a.cellId;
                setCurrentCellId(a.cellId);
                setCellProgress({ index: index + 1, total: orderedIds.length });
                setCellStartedAt(at);
                setLoadPct(null);
              }
              // A page that dies while a model loads (memory) leaves the lane
              // and phase in the saved attempt for the recovery card.
              if (attempt && (attempt.currentCellId !== a.cellId || attempt.currentPhase !== a.phase)) {
                const snapshot = attempt;
                void updateAttempt(snapshot, { currentCellId: a.cellId, currentPhase: a.phase });
                if (memoryApiAvailable() !== 'none') {
                  void sampleMemoryBytes(5_000).then((bytes) => {
                    if (bytes !== null && snapshot.currentCellId === a.cellId && snapshot.currentPhase === a.phase) {
                      void updateAttempt(snapshot, { memoryBytesAtPhase: bytes });
                    }
                  });
                }
              }
              if (a.phase !== 'load' || a.pct === undefined) {
                setStatusLine(
                  a.phase === 'reload'
                    ? `Reloading ${a.cellId} from the cache`
                    : a.phase === 'warmup'
                      ? `Warming up ${a.cellId}`
                      : `Loading ${a.cellId}`,
                );
              }
            }
            if ((a.phase === 'load' || a.phase === 'reload') && typeof a.pct === 'number') {
              // Download rate from consecutive progress events on the same load.
              const size = cells.find((c) => `${c.model.runtimeId}/${c.model.benchModelId}/${c.workload.id}` === a.cellId)?.model.sizeBytes ?? 0;
              const prev = downloadObs.current;
              if (prev && prev.bytes === size && a.pct > prev.pct && at - prev.t >= 1_000) {
                const bps = ((a.pct - prev.pct) / 100) * size / ((at - prev.t) / 1000);
                if (bps > 0) setDownloadBps((cur) => (cur === null ? bps : cur * 0.7 + bps * 0.3));
              }
              downloadObs.current = { t: at, pct: a.pct, bytes: size };
            }
          },
          onCellRetry: (cellId, attemptNo, error) => {
            // One readable line per retry; the full error, cause, and stack are
            // on the cell's `attempts` in the run record, not on the overlay.
            const lane = cells.find((c) => `${c.model.runtimeId}/${c.model.benchModelId}/${c.workload.id}` === cellId);
            const what = lane ? `${lane.model.displayName} · ${lane.workload.label}` : cellId;
            setRetryNotices((list) => [...list, `${what}: ${describeRetryCause(error)}; trying again (attempt ${attemptNo}).`]);
            setLastActivityAt(Date.now());
          },
          onCellFinish: (cell) => {
            const at = Date.now();
            setFinished((prev) => {
              const next = new Map(prev);
              next.set(cell.cellId, { status: cell.status, durationMs: Math.max(0, at - (cellStartRef.current ?? at)) });
              return next;
            });
            cellStartRef.current = at;
            if (attempt) void updateAttempt(attempt, { cells: [...attempt.cells, cell], currentCellId: undefined, currentPhase: undefined });
          },
          onLoadProgress: (_cellId, pct) => {
            setLoadPct(pct ?? null);
            setLastActivityAt(Date.now());
          },
          onIteration: (cellId, i, total) => {
            setStatusLine(`Running ${cellId} - iteration ${i}/${total}`);
            setLastActivityAt(Date.now());
          },
        },
      });
      suiteResult.nonce = nonce;
      suiteResult.digest = await computeRunDigest(suiteResult);
      setResult(suiteResult);
      setPhase('done');
      setStatusLine('Suite complete');
      // Publishing was disclosed next to the Run button; opt-out via the toggle.
      if (autoSubmit) void submitRun(suiteResult);
    } catch (error) {
      // "Cancelled" only when this page's Cancel button fired; any other
      // AbortError is a failure to show, not a cancel.
      if (controller.signal.aborted) {
        setPhase('idle');
        setStatusLine('Cancelled');
      } else {
        setPhase('error');
        setErrorMessage((error as Error).message ?? String(error));
      }
    } finally {
      // The run resolved in-page (complete, cancelled, or failed with a
      // recorded error): the partial record has served its purpose.
      if (attempt) void finishAttempt(attempt.attemptId);
      unsubscribeDownload?.();
      setChromeDownloadPct(null);
      abortRef.current = null;
      setCellProgress(null);
      setLoadPct(null);
    }
  }, [suite, buildCells, autoSubmit, submitRun, study, activeLanes, availability]);

  const downloadJson = useCallback((data: unknown, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const exportPartial = useCallback(
    (attempt: PartialAttempt) => {
      downloadJson(toPartialRunExport(attempt), `localmode-bench-partial-${attempt.attemptId}.json`);
    },
    [downloadJson],
  );

  const [copiedAttempt, setCopiedAttempt] = useState<string | null>(null);
  const [shownDiagnostics, setShownDiagnostics] = useState<{ attemptId: string; text: string } | null>(null);
  const copyDiagnostics = useCallback(async (attempt: PartialAttempt) => {
    const text = partialRunDiagnostics(attempt);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedAttempt(attempt.attemptId);
      setTimeout(() => setCopiedAttempt(null), 2_000);
    } catch {
      // Clipboard denied: show the text so it can be selected by hand.
      setShownDiagnostics({ attemptId: attempt.attemptId, text });
    }
  }, []);

  const discardPartial = useCallback(async (attempt: PartialAttempt) => {
    await finishAttempt(attempt.attemptId);
    setUnfinished((list) => list.filter((a) => a.attemptId !== attempt.attemptId));
  }, []);

  const [cancelling, setCancelling] = useState(false);
  const cancel = useCallback(() => {
    // The click registers at once; the runner finishes unwinding the step it
    // is in (a download or generation that cannot be interrupted keeps
    // running in the background and is discarded).
    setCancelling(true);
    abortRef.current?.abort();
  }, []);

  const exportJson = useCallback(() => {
    if (!result) return;
    downloadJson(result, `localmode-bench-${result.runId}.json`);
  }, [result, downloadJson]);

  const summaries: CellSummary[] = result?.clientSummaries ?? [];
  const cellById = new Map<string, BenchCellResult>(result?.cells.map((c) => [c.cellId, c]) ?? []);

  return (
    <div className="flex flex-col gap-6">
      {unfinished.length > 0 && (
        <Card role="region" aria-label="Unfinished run recovered">
          <CardHeader>
            <CardTitle>A previous run ended before it finished</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <p className="text-muted-foreground">
              The page closed or crashed mid-suite (most often the tab ran out of memory: the
              Standard or Thorough suite on a laptop, or any suite on a phone, where the browser
              reloads the page when it exceeds its memory budget). Its progress was saved cell by
              cell: copy the diagnostics or export the partial run so the cause can be found.
              Partial runs are never published.
            </p>
            {unfinished.map((attempt) => {
              const lastCell = attempt.currentCellId ?? attempt.cells[attempt.cells.length - 1]?.cellId;
              return (
                <div
                  key={attempt.attemptId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3"
                >
                  <div>
                    <div className="font-medium">
                      {attempt.suite} suite · {attempt.cells.length} of {attempt.plannedCellIds.length} cells
                      finished
                    </div>
                    <div className="break-words text-xs text-muted-foreground">
                      started {new Date(attempt.startedAt).toLocaleString()}
                      {lastCell && (
                        <>
                          {' '}
                          · ended during <span className="font-mono">{lastCell}</span>
                          {attempt.currentPhase ? ` (${attempt.currentPhase})` : ''}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => void copyDiagnostics(attempt)}>
                      {copiedAttempt === attempt.attemptId ? 'Copied' : 'Copy diagnostics'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => exportPartial(attempt)}>
                      Export partial run
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void discardPartial(attempt)}>
                      Discard
                    </Button>
                  </div>
                  {shownDiagnostics?.attemptId === attempt.attemptId && (
                    <textarea
                      readOnly
                      aria-label="Partial run diagnostics"
                      className="w-full rounded-md border border-border bg-muted/40 p-2 font-mono text-xs"
                      rows={8}
                      value={shownDiagnostics.text}
                    />
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Configure the run</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="bench-suite">Suite</Label>
              <Select
                value={suite}
                onValueChange={(v) => setSuite(v as typeof suite)}
                disabled={phase === 'running'}
              >
                <SelectTrigger id="bench-suite" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="quick">Quick (~10 min)</SelectItem>
                  <SelectItem value="standard" disabled={mobile}>
                    Standard{mobile ? ' (desktop only)' : ''}
                  </SelectItem>
                  <SelectItem value="thorough" disabled={mobile}>
                    Thorough{mobile ? ' (desktop only)' : ''}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="bench-quality"
                checked={includeQuality}
                onCheckedChange={setIncludeQuality}
                disabled={phase === 'running'}
              />
              <Label htmlFor="bench-quality">Include quality-fidelity lane</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="bench-publish"
                checked={autoSubmit}
                onCheckedChange={setAutoSubmit}
                disabled={phase === 'running'}
              />
              <Label htmlFor="bench-publish">Publish results to the public leaderboard</Label>
            </div>
          </div>

          <div className="flex flex-col gap-2" role="group" aria-label="Model lanes">
            {lanes.map(({ model, available, reason, note }) => {
              const key = laneKey(model);
              const checked = available && !disabledLanes.has(key);
              return (
                <div
                  key={key}
                  className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="break-words text-sm font-medium">{model.displayName}</span>
                    <span className="text-xs text-muted-foreground">
                      {model.runtimeId} · {formatBytes(model.sizeBytes)}
                      {model.quantization ? ` · ${model.quantization}` : ''}
                    </span>
                    {/* Reasons and notes can run to a sentence with a browser error inside;
                        they wrap here, inside the shrinking column, so a phone-width row
                        never grows past the viewport. */}
                    {!available && (
                      <span className="break-words text-xs text-muted-foreground">{reason ?? 'unavailable'}</span>
                    )}
                    {available && note && <span className="break-words text-xs text-muted-foreground">{note}</span>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {!available && (
                      <Badge variant="outline" className="text-muted-foreground">
                        unavailable
                      </Badge>
                    )}
                    <Switch
                      checked={checked}
                      disabled={!available || phase === 'running'}
                      onCheckedChange={(on) => {
                        setDisabledLanes((prev) => {
                          const next = new Set(prev);
                          if (on) next.delete(key);
                          else next.add(key);
                          return next;
                        });
                      }}
                      aria-label={`Include ${model.displayName}`}
                    />
                  </div>
                </div>
              );
            })}
            {availability === null && (
              <p className="text-sm text-muted-foreground">Probing device capabilities…</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={run} disabled={phase === 'running' || activeLanes.length === 0}>
              {phase === 'running' ? 'Running…' : 'Run benchmark'}
            </Button>
            <span className="text-sm text-muted-foreground">
              {activeLanes.length} lanes · est. download {formatBytes(totalDownload)} (cached models
              skip the download)
            </span>
          </div>
          {mobile && (
            <p className="text-xs text-muted-foreground" role="note">
              Phones and tablets run the Quick suite. Standard and Thorough load several runtimes
              in one page and need more browser memory than a mobile browser allows; the tab would
              be killed partway through and the run lost.
            </p>
          )}
          {study && (
            <p className="text-xs text-muted-foreground" role="note">
              Paid study session detected: your completion code appears on this page once the run
              finishes and the upload attempt completes. Keep this tab open until then.
            </p>
          )}
          {suite !== 'quick' && (
            <p className="text-xs text-muted-foreground" role="note">
              {suite === 'thorough'
                ? 'Thorough loads several multi-gigabyte models in one page and peaks above 8 GB of browser memory'
                : 'Standard runs every runtime in one page and peaks near 9 GB of browser memory'}
              : 16 GB of RAM is recommended, and close other heavy tabs and apps first, or the
              browser may run out of memory partway through.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Models download only when you press Run. Keep this tab visible and your device plugged
            in - hidden tabs invalidate timed runs. With publishing on, the result uploads to the
            open dataset automatically when the run completes: timings, device environment, and the
            generated text for the fixed public prompts. No personal data. Turn the toggle off to
            keep the run local (JSON export only).
          </p>
        </CardContent>
      </Card>

      {phase === 'running' && (
        <RunOverlay
          suite={suite}
          statusLine={statusLine}
          cellProgress={cellProgress}
          planned={planned}
          finished={finished}
          currentCellId={currentCellId}
          loadedLanes={loadedLanes}
          activity={activity}
          cellStartedAt={cellStartedAt}
          lastActivityAt={lastActivityAt}
          runStartedAt={runStartedAt}
          now={now}
          loadPct={loadPct}
          chromeDownloadPct={chromeDownloadPct}
          downloadBps={downloadBps}
          retryNotices={retryNotices}
          hiddenCount={hiddenCount}
          study={study}
          autoSubmit={autoSubmit}
          onCancel={cancel}
          cancelling={cancelling}
        />
      )}

      {phase !== 'running' && statusLine && (
        <Card>
          <CardHeader>
            <CardTitle>Progress</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p role="status" className="text-sm">
              {statusLine}
            </p>
            {phase === 'error' && errorMessage && (
              <p className="text-sm text-destructive">Benchmark failed: {errorMessage}</p>
            )}
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>Results</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cell</TableHead>
                    <TableHead>Backend</TableHead>
                    <TableHead className="text-right">Load</TableHead>
                    <TableHead className="text-right">TTFT (med)</TableHead>
                    <TableHead className="text-right">Decode chars/s</TableHead>
                    <TableHead className="text-right">Embed ms / texts-s</TableHead>
                    <TableHead className="text-right">Quality</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summaries.map((s) => {
                    const cell = cellById.get(s.cellId);
                    return (
                      <TableRow key={s.cellId}>
                        <TableCell className="max-w-64 truncate font-mono text-xs">{s.cellId}</TableCell>
                        <TableCell>{cell?.resolvedBackend ?? '-'}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMs(s.loadMs)}
                          {s.loadCached === true ? ' (warm)' : s.loadCached === false ? ' (cold)' : ''}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatMs(s.ttftMs?.median)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {s.decodeCharsPerSec ? (
                            Math.round(s.decodeCharsPerSec.median)
                          ) : s.overallCharsPerSec ? (
                            <span title="End-to-end rate (prefill + decode): this stream is not incremental, so a pure decode rate cannot be measured.">
                              {Math.round(s.overallCharsPerSec.median)}
                              <span className="text-xs text-muted-foreground"> e2e</span>
                            </span>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {s.singleLatencyMs
                            ? formatMs(s.singleLatencyMs.median)
                            : s.batchTextsPerSec
                              ? `${Math.round(s.batchTextsPerSec.median)}/s`
                              : '-'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {s.qualityScore !== undefined ? s.qualityScore.toFixed(3) : '-'}
                          {s.qualityParseRate !== undefined && s.qualityParseRate < 1 && (
                            <span
                              className="text-xs text-muted-foreground"
                              title="Share of items whose answer could be parsed. Unparsed items count as wrong, so a low share means the score is limited by output format, not fidelity."
                            >
                              {' '}({Math.round(s.qualityParseRate * 100)}% parsed)
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={s.status === 'ok' ? 'default' : 'outline'}>
                            {s.status}
                            {s.highVariance ? ' · high variance' : ''}
                          </Badge>
                          {cell?.attempts && cell.attempts.length > 0 && (
                            <Badge
                              variant="outline"
                              className="ml-1 text-muted-foreground"
                              title={cell.attempts.map((a) => `${a.error.name}: ${a.error.message}`).join('\n')}
                            >
                              retried ×{cell.attempts.length}
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" onClick={exportJson}>
                Export JSON
              </Button>
              {(submitState.kind === 'failed' ||
                (submitState.kind === 'idle' && !autoSubmit)) && (
                <Button onClick={() => result && submitRun(result)}>
                  {submitState.kind === 'failed' ? 'Retry submission' : 'Submit to leaderboard'}
                </Button>
              )}
              {submitState.kind === 'submitting' && (
                <p role="status" className="text-sm text-muted-foreground">
                  Publishing to the leaderboard…
                </p>
              )}
              {submitState.kind === 'done' && (
                <p role="status" className="text-sm">
                  {submitState.flagged
                    ? 'Submitted - flagged by integrity checks, pending review.'
                    : 'Submitted to the public dataset.'}{' '}
                  {submitState.url && (
                    <a
                      className="underline underline-offset-2"
                      href={submitState.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View the raw run
                    </a>
                  )}
                </p>
              )}
              {submitState.kind === 'failed' && (
                <p role="status" className="text-sm text-destructive">
                  {submitState.message}
                  {submitState.retryAt !== undefined && (
                    <span className="text-muted-foreground">
                      {' '}
                      Retrying automatically in {formatElapsed(Math.max(0, submitState.retryAt - now))}. Keep this page
                      open: the run lives only in this tab (Export JSON keeps a copy).
                    </span>
                  )}
                </p>
              )}
            </div>
            {study?.completionCode && (submitState.kind === 'done' || submitState.kind === 'failed') && (
              <div
                role="region"
                aria-label="Study completion code"
                className="rounded-md border border-border bg-muted/40 p-3 text-sm"
              >
                <p>
                  Your Prolific completion code:{' '}
                  <code className="rounded bg-muted px-1 font-mono text-base">{study.completionCode}</code>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {submitState.kind === 'failed'
                    ? 'The upload did not go through, but you are still paid for the attempt: enter the code on Prolific and message the researcher with a screenshot of this page.'
                    : 'Enter it on Prolific to finish the study.'}{' '}
                  <a
                    className="underline underline-offset-2"
                    href={`${PROLIFIC_COMPLETE_URL}${encodeURIComponent(study.completionCode)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Complete on Prolific
                  </a>
                </p>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Published runs are public raw JSON in the open dataset on GitHub (timings,
              environment, generated text for the fixed public prompts). No personal data is
              collected.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** Everything a participant needs while the run is in progress, over the page. */
function RunOverlay(props: {
  suite: string;
  statusLine: string;
  cellProgress: { index: number; total: number } | null;
  planned: PlannedCellInfo[];
  finished: Map<string, FinishedCellInfo>;
  currentCellId: string | null;
  loadedLanes: Set<string>;
  activity: (RunnerActivity & { at: number }) | null;
  cellStartedAt: number | null;
  lastActivityAt: number | null;
  runStartedAt: number | null;
  now: number;
  loadPct: number | null;
  chromeDownloadPct: number | null;
  downloadBps: number | null;
  retryNotices: string[];
  hiddenCount: number;
  study: StudySession | null;
  autoSubmit: boolean;
  onCancel: () => void;
  cancelling: boolean;
}) {
  const {
    suite,
    statusLine,
    cellProgress,
    planned,
    finished,
    currentCellId,
    loadedLanes,
    activity,
    cellStartedAt,
    lastActivityAt,
    runStartedAt,
    now,
    loadPct,
    chromeDownloadPct,
    downloadBps,
    retryNotices,
    hiddenCount,
    study,
    autoSubmit,
    onCancel,
    cancelling,
  } = props;
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    dialogRef.current?.focus({ preventScroll: true });
    // One scrollbar: the page behind the overlay stays put; only the dialog scrolls.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const total = planned.length;
  const done = planned.filter((c) => finished.has(c.cellId)).length;
  const pct = total > 0 ? (done / total) * 100 : 0;
  const cooldownMs = RUN_POLICIES[suite as keyof typeof RUN_POLICIES]?.cooldownMs ?? 5_000;
  const eta =
    total > 0
      ? estimateRemainingMs({
          planned,
          finished,
          currentCellId,
          currentCellElapsedMs: cellStartedAt !== null ? now - cellStartedAt : 0,
          downloadBps,
          loadedLanes,
          cooldownMs,
        })
      : null;
  const finishAt = eta ? new Date(now + eta.remainingMs) : null;

  // Lane checklist: one row per (runtime, model), in execution order.
  const lanes: Array<{ key: string; name: string; runtimeId: string; cells: PlannedCellInfo[] }> = [];
  for (const cell of planned) {
    let lane = lanes.find((l) => l.key === cell.laneKey);
    if (!lane) {
      lane = { key: cell.laneKey, name: cell.laneName, runtimeId: cell.runtimeId, cells: [] };
      lanes.push(lane);
    }
    lane.cells.push(cell);
  }
  const laneState = (lane: (typeof lanes)[number]): 'done' | 'running' | 'pending' | 'skipped' => {
    if (lane.cells.every((c) => c.skipped)) return 'skipped';
    if (lane.cells.every((c) => finished.has(c.cellId))) return 'done';
    if (lane.cells.some((c) => c.cellId === currentCellId) || loadedLanes.has(lane.key)) return 'running';
    return 'pending';
  };
  const current = planned.find((c) => c.cellId === currentCellId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 p-4 sm:p-6">
      {/* The dialog never grows past the viewport: it is capped at the padded
          box and scrolls inside itself, while the page behind it is locked. */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bench-run-title"
        tabIndex={-1}
        className="flex max-h-full w-full max-w-2xl flex-col gap-5 overflow-y-auto rounded-lg border border-border bg-card p-5 shadow-lg outline-none sm:p-6"
      >
        <div className="flex flex-col gap-1">
          <h2 id="bench-run-title" className="text-xl font-semibold">
            Benchmark running
          </h2>
          <p className="text-sm text-muted-foreground">
            {suite === 'quick' ? 'Quick' : suite === 'standard' ? 'Standard' : 'Thorough'} suite ·{' '}
            {done} of {total} steps done
            {runStartedAt !== null ? ` · running for ${formatElapsed(now - runStartedAt)}` : ''}
          </p>
        </div>

        <div
          role="alert"
          className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
        >
          <p className="font-medium">Please keep this tab open, visible, and in front until the run finishes.</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            <li>Do not switch to another tab, minimize or cover this window, lock the screen, or close this page.</li>
            <li>Keep the device plugged in; the screen is kept awake for you while the run is in progress.</li>
            <li>Browsers slow down background tabs, so a measurement taken while this tab is hidden is set aside and repeated once the tab is back in front; if the tab stays hidden, that step is marked invalid.</li>
            {study && <li>Your completion code appears on this page as soon as the run and its upload finish.</li>}
          </ul>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="font-medium">Overall progress</span>
            <span className="tabular-nums text-muted-foreground">{Math.round(pct)}%</span>
          </div>
          <Progress value={pct} aria-label="Overall benchmark progress" />
          <p className="text-sm" aria-live="polite">
            {eta ? (
              <>
                Estimated time remaining: <strong>{formatEta(eta.remainingMs)}</strong>
                {finishAt && (
                  <span className="text-muted-foreground">
                    {' '}
                    (around {finishAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })})
                  </span>
                )}
                {!eta.measured && (
                  <span className="text-muted-foreground"> · a rough estimate until the first models have run</span>
                )}
              </>
            ) : (
              'Estimating the remaining time…'
            )}
          </p>
        </div>

        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          {current ? (
            <p className="text-sm font-medium">
              Step {cellProgress?.index ?? '?'} of {cellProgress?.total ?? total}: {current.laneName} ·{' '}
              {current.workloadLabel}
            </p>
          ) : (
            <p className="text-sm font-medium">Preparing the run</p>
          )}
          <p role="status" className="font-mono text-xs text-muted-foreground">
            {cancelling ? 'Stopping the run; releasing the current model' : statusLine}
            {cellProgress ? ` (step ${cellProgress.index} of ${cellProgress.total})` : ''}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums text-muted-foreground" aria-label="Live activity">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="inline-block size-2 animate-pulse rounded-full bg-primary" title="Pulses even while the page is busy" />
              alive
            </span>
            {cellStartedAt !== null && <span>elapsed in this step {formatElapsed(now - cellStartedAt)}</span>}
            {activity && <span>{describeActivity(activity)}</span>}
            {lastActivityAt !== null && <span>last progress {formatElapsed(now - lastActivityAt)} ago</span>}
          </div>
          {loadPct !== null && (
            <div className="flex items-center gap-3">
              <Progress value={loadPct} className="max-w-md" aria-label="Model download progress" />
              <span className="text-xs tabular-nums text-muted-foreground">{Math.round(loadPct)}%</span>
            </div>
          )}
          {chromeDownloadPct !== null && chromeDownloadPct < 100 && (
            <div className="flex items-center gap-3" role="note" aria-label="Gemini Nano download">
              <span className="text-xs text-muted-foreground">Gemini Nano download (browser-wide, one time)</span>
              <Progress value={chromeDownloadPct} className="max-w-md" aria-label="Gemini Nano download progress" />
              <span className="text-xs tabular-nums text-muted-foreground">{Math.round(chromeDownloadPct)}%</span>
            </div>
          )}
          {lastActivityAt !== null && now - lastActivityAt >= STALL_WARNING_MS && (
            <p role="note" className="text-xs text-amber-700 dark:text-amber-400">
              No progress for {formatElapsed(now - lastActivityAt)}.{' '}
              {activity && QUIET_PHASES.has(activity.phase)
                ? 'The model is being loaded into memory and its engine prepared, which reports nothing until it finishes and can take a minute or two for a large model. '
                : ''}
              If this counter keeps climbing, the run aborts the step after 2 minutes without progress (3 for a
              download), retries it once, then skips it and continues. If the counter itself has frozen, the page is busy
              computing and will update as soon as it can. Nothing is needed from you.
            </p>
          )}
          {retryNotices.length > 0 && (
            <ul className="list-disc pl-5 text-xs text-muted-foreground" aria-label="Watchdog retries">
              {retryNotices.length > 3 && <li>{retryNotices.length - 3} earlier retries (in the run record)</li>}
              {retryNotices.slice(-3).map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
          {activity?.phase === 'waiting-visible' && (
            <p role="alert" className="text-xs text-destructive">
              Paused: this tab is not in front. The run waits for it to be visible again (up to 10 minutes)
              before it times anything else.
            </p>
          )}
          {hiddenCount > 0 && (
            <p role="alert" className="text-xs text-destructive">
              This tab went to the background {hiddenCount === 1 ? 'once' : `${hiddenCount} times`}. Any
              measurement taken while it was hidden is set aside and repeated once the tab is back in front;
              the rest of the run is unaffected. Please keep it in front.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">Models in this run</p>
          <ul className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2" aria-label="Model lanes progress">
            {lanes.map((lane) => {
              const state = laneState(lane);
              const laneDone = lane.cells.filter((c) => finished.has(c.cellId)).length;
              const errors = lane.cells.filter((c) => finished.get(c.cellId)?.status === 'error').length;
              return (
                <li key={lane.key} className="flex items-center gap-2">
                  <span aria-hidden className="w-4 text-center">
                    {state === 'done' ? (errors > 0 ? '!' : '✓') : state === 'running' ? '▶' : state === 'skipped' ? '–' : '○'}
                  </span>
                  <span className={state === 'pending' || state === 'skipped' ? 'text-muted-foreground' : ''}>
                    {lane.name}
                    <span className="text-muted-foreground">
                      {' '}
                      · {state === 'skipped' ? 'not run on this device' : `${laneDone}/${lane.cells.length}`}
                      {errors > 0 ? ` · ${errors} failed` : ''}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {autoSubmit
              ? 'When the run finishes, the result uploads to the public dataset automatically and the results table appears here.'
              : 'When the run finishes, the results table appears here; publishing is off for this run.'}
          </p>
          <Button variant="outline" onClick={onCancel} disabled={cancelling} aria-busy={cancelling}>
            {cancelling ? 'Stopping…' : 'Cancel run'}
          </Button>
        </div>
      </div>
    </div>
  );
}

