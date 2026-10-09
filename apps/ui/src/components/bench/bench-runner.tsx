'use client';

/**
 * @file bench-runner.tsx
 * @description Client runner for the LocalMode Bench: suite + lane selection with
 * availability preflight (no provider code loads until Run), live progress,
 * results table, JSON export, and leaderboard submission. Every model download
 * happens strictly behind the explicit Run action.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
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
import { BENCH_MODELS, SUITE_MODELS, estimateDownloadBytes } from '@/lib/bench/catalog';
import { wllamaAvailability } from '@/lib/bench/adapters';
import {
  chromeAIStatus,
  onChromeAIDownloadProgress,
  startChromeAIDownload,
  type ChromeAIStatus,
} from '@/lib/bench/chrome-ai-download';
import { benchBuildCommit, benchHarnessVersion, benchRuntimeVersions } from '@/lib/bench/runtime-versions';
import { describeRetryCause } from '@/lib/bench/overlay-text';
import {
  clearProviderModelCaches,
  describeClearReport,
  markCachesCleared,
  takeColdStartMarker,
  type CacheClearReport,
} from '@/lib/bench/cache-clear';
import {
  COOLDOWN_STEP_MINUTES,
  MAX_COOLDOWN_MINUTES,
  MAX_SERIES_RUNS,
  clampCooldownMinutes,
  clearStoredSeries,
  continueSeries,
  cooldownRemainingMs,
  cooldownStatusText,
  createSeries,
  currentRunIndex,
  formatDuration,
  isSeriesOpen,
  loadSeries,
  markRunStarted,
  parseRunPresets,
  presetQuery,
  recordRunFailed,
  recordRunFinished,
  requestStop,
  resolveSeriesOnLoad,
  saveSeries,
  seriesEtaMs,
  seriesHarness,
  seriesSummaryText,
  seriesTitle,
  startCooldown,
  type SeriesRunRecord,
  type SeriesState,
} from '@/lib/bench/series';
import {
  WAKE_LOCK_TEXT,
  isWebKitUserAgent,
  lockLostStatus,
  retryOnUserActivation,
  wakeLockNotice,
  type WakeLockStatus,
} from '@/lib/bench/wake-lock';
import { readStudyEligibility } from '@/lib/bench/study-eligibility';
import { parseStudySession, readStudyCompletionCode, type StudySession } from '@/lib/bench/study-session';
import {
  FULL_MODE_HINT,
  MAX_AUTOMATIC_RESTARTS,
  RESTART_POLICY_TEXT,
  SETTINGS_MISMATCH_MESSAGE,
  STUDY_LOCK_NOTE,
  UPLOAD_FAILED_MESSAGE,
  attemptCapMessage,
  attemptLabel,
  beginStudyAttempt,
  cellsAllAttempted,
  clearStudyAttempt,
  interruptStudyAttempt,
  loadStudyAttempt,
  parseCompletionMode,
  resolveStudyAttemptOnLoad,
  restartNeedsActivation,
  runMatchesStudyLink,
  runSettingsOf,
  saveStudyAttempt,
  shouldIssueCompletionCode,
  studyRunLock,
  uploadFailedPermanently,
  type CompletionMode,
  type StudyAttemptState,
  type StudyRunLock,
} from '@/lib/bench/study-completion';
import {
  CHASSIS_CHOICES,
  clearSeriesHardware,
  EMPTY_HARDWARE_ANSWERS,
  hardwareBlockReason,
  loadSeriesHardware,
  RAM_BUCKETS_GB,
  REPORTED_GPU_MAX_LENGTH,
  saveSeriesHardware,
  toUserReportedHardware,
  type HardwareAnswers,
} from '@/lib/bench/study-hardware';
import {
  beginAttempt,
  finishAttempt,
  listUnfinishedAttempts,
  partialRunDiagnostics,
  toPartialRunExport,
  updateAttempt,
  type PartialAttempt,
} from '@/lib/bench/partial-run-store';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/registry/localmode/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/registry/localmode/ui/card';
import { Badge } from '@/registry/localmode/ui/badge';
import { Progress } from '@/registry/localmode/ui/progress';
import { Switch } from '@/registry/localmode/ui/switch';
import { Label } from '@/registry/localmode/ui/label';
import { Input } from '@/registry/localmode/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/registry/localmode/ui/dialog';
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
 * When the completion code shows depends on the link's `ccmode`: by default
 * (`attempt`) once the run finishes and the submission attempt has resolved,
 * whether it succeeded or not (payment is on attempt, never on our
 * infrastructure); with `ccmode=full` only for a run that finished with every
 * cell attempted and uploaded (see study-completion.ts). The study pays only
 * for runs from Chrome or Edge on a computer: with a completion code in the
 * link, any other browser, and any phone or tablet, sees a notice in place of
 * the Run button and never sees the code.
 */
const PROLIFIC_COMPLETE_URL = 'https://app.prolific.com/submissions/complete?cc=';

/** A session nonce from the bench API; undefined when the request fails (offline, dev). */
async function fetchSessionNonce(): Promise<string | undefined> {
  try {
    const res = await fetch('/api/bench/nonce', { cache: 'no-store' });
    if (!res.ok) return undefined;
    const { nonce } = (await res.json()) as { nonce?: unknown };
    return typeof nonce === 'string' ? nonce : undefined;
  } catch {
    return undefined;
  }
}

async function readStudySession(): Promise<StudySession | null> {
  if (typeof window === 'undefined') return null;
  return parseStudySession(window.location.search, readStudyEligibility());
}

/** Save a JSON file through a temporary object URL. */
function downloadJsonFile(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  // Revoke later: a page that reloads right after (a series) must not cut the save short.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const sleepMs = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Outcome of one submission attempt, as the series needs it. */
type SubmitOutcome =
  | { kind: 'done'; flagged: boolean; url?: string }
  | { kind: 'failed'; message: string; retryAt?: number };

interface WakeLockSentinelLike {
  release(): Promise<void>;
  addEventListener(type: 'release', cb: () => void): void;
}

/**
 * Hold a screen wake lock while `active`. The browser releases the lock
 * whenever the tab is hidden, so it is requested again each time the tab
 * comes back in front. Chromium and Gecko grant it without a user
 * activation, so a series run that resumes after a reload holds it there;
 * WebKit refuses it without one, so on WebKit a refused or lost lock is
 * requested again on the next user interaction ('tap').
 */
function useScreenWakeLock(active: boolean): WakeLockStatus {
  const [lockState, setLockState] = useState<'pending' | 'held' | 'hidden' | 'refused' | 'tap'>('pending');
  useEffect(() => {
    const api = (navigator as { wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> } }).wakeLock;
    if (!active || !api) return;
    const webkit = isWebKitUserAgent(navigator.userAgent);
    let disposed = false;
    let sentinel: WakeLockSentinelLike | null = null;
    let stopRetry: (() => void) | null = null;
    const lost = () => {
      if (disposed) return;
      if (document.visibilityState !== 'visible') {
        setLockState('hidden');
        return;
      }
      setLockState(lockLostStatus(webkit));
      // On WebKit the next tap or key press carries the activation it needs.
      if (webkit && !stopRetry) stopRetry = retryOnUserActivation(window, request);
    };
    // Runs synchronously up to `api.request`, so a call from an input
    // handler makes the request while the user activation is transient.
    const request = async (): Promise<boolean> => {
      if (disposed || sentinel) return true;
      if (document.visibilityState !== 'visible') {
        setLockState('hidden');
        return false;
      }
      try {
        const s = await api.request('screen');
        if (disposed || sentinel) {
          void s.release();
          return true;
        }
        sentinel = s;
        stopRetry?.();
        stopRetry = null;
        setLockState('held');
        s.addEventListener('release', () => {
          if (sentinel === s) sentinel = null;
          lost();
        });
        return true;
      } catch {
        if (!sentinel) lost();
        return false;
      }
    };
    const acquire = async () => {
      await Promise.resolve();
      await request();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void request();
    };
    void acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibility);
      stopRetry?.();
      stopRetry = null;
      const s = sentinel;
      sentinel = null;
      if (s) void s.release();
      setLockState('pending');
    };
  }, [active]);
  if (!active) return 'idle';
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return 'unavailable';
  return lockState === 'pending' ? 'idle' : lockState;
}

/** The user agent never changes during a page's life: nothing to subscribe to. */
const subscribeNever = () => () => undefined;

/** The "keep the device awake" notice a running series shows when the screen is not kept awake. */
function WakeLockNotice({ status }: { status: WakeLockStatus }) {
  const webkit = useSyncExternalStore(
    subscribeNever,
    () => isWebKitUserAgent(navigator.userAgent),
    () => false,
  );
  const notice = wakeLockNotice(status, webkit);
  if (!notice) return null;
  return (
    <p
      role="note"
      className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
    >
      {notice}
    </p>
  );
}

/** One-line description of each suite tier, shown under the suite picker. */
const SUITE_HINTS: Record<'quick' | 'standard' | 'thorough', string> = {
  quick: 'About 10 min with downloads: the SmolLM2 135M chat pairing and the embedding pairing. Runs on phones.',
  standard:
    'Longer than Quick: adds the four-runtime Qwen3 0.6B pairing and Gemini Nano. Desktop only, 16 GB of RAM recommended.',
  thorough:
    'The longest tier: every pairing, including Llama 3.2 1B and the multi-gigabyte Gemma 4 E2B. Desktop only, 16 GB of RAM recommended.',
};

/** A labelled group of related run settings inside the configuration card. */
function ConfigSection({
  id,
  title,
  className,
  children,
}: {
  id: string;
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="group"
      aria-labelledby={id}
      className={`flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3 sm:p-4 ${className ?? ''}`}
    >
      <h3 id={id} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}

/** Muted one-line help text under a setting. */
const SELECT_CLASS =
  'h-9 w-full max-w-xs rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

/** Where to read the graphics card or chip name, one line per system. */
const GPU_HELP_BULLETS: ReadonlyArray<{ system: string; where: ReactNode }> = [
  { system: 'Windows', where: 'Task Manager, Performance tab, GPU' },
  { system: 'macOS', where: 'About This Mac, Chip or Graphics' },
  {
    system: 'Linux',
    where: (
      <>
        Settings, About, or <code className="font-mono">lspci | grep -i vga</code>
      </>
    ),
  },
];

/**
 * "About this computer": the four paid-study hardware questions, all
 * required. They are asked in a dialog when Run benchmark is pressed and stay
 * editable in the run overlay; the values present when the run file is
 * assembled are recorded and published with the run.
 */
function HardwareQuestions({
  idPrefix,
  answers,
  onChange,
}: {
  idPrefix: string;
  answers: HardwareAnswers;
  onChange: (patch: Partial<HardwareAnswers>) => void;
}) {
  const radio = 'size-4 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-gpu`}>Graphics card or chip</Label>
        <Input
          id={`${idPrefix}-gpu`}
          type="text"
          required
          aria-required="true"
          maxLength={REPORTED_GPU_MAX_LENGTH}
          autoComplete="off"
          spellCheck={false}
          className="max-w-md"
          value={answers.gpu}
          onChange={(e) => onChange({ gpu: e.target.value })}
          aria-describedby={`${idPrefix}-gpu-help`}
        />
        <div id={`${idPrefix}-gpu-help`} className="flex flex-col gap-1 text-xs leading-relaxed text-muted-foreground">
          <p id={`${idPrefix}-gpu-where`}>Where to find it:</p>
          <ul aria-labelledby={`${idPrefix}-gpu-where`} className="list-disc space-y-0.5 pl-4">
            {GPU_HELP_BULLETS.map((b) => (
              <li key={b.system}>
                {b.system}: {b.where}
              </li>
            ))}
          </ul>
          <p>Examples: NVIDIA GeForce RTX 4060, AMD Radeon 780M, Intel Arc or Iris Xe Graphics, Apple M2.</p>
        </div>
      </div>

      <div role="radiogroup" aria-labelledby={`${idPrefix}-chassis-label`} aria-required="true" className="flex flex-col gap-1.5">
        <span id={`${idPrefix}-chassis-label`} className="text-sm font-medium">
          Computer type
        </span>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {CHASSIS_CHOICES.map((c) => (
            <label key={c.value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={`${idPrefix}-chassis`}
                value={c.value}
                required
                checked={answers.chassis === c.value}
                onChange={() => onChange({ chassis: c.value })}
                className={radio}
              />
              {c.label}
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-ram`}>Memory (RAM)</Label>
        <select
          id={`${idPrefix}-ram`}
          required
          aria-required="true"
          className={SELECT_CLASS}
          value={answers.ram}
          onChange={(e) => onChange({ ram: e.target.value })}
        >
          <option value="">Choose…</option>
          {RAM_BUCKETS_GB.map((gb, i) => (
            <option key={gb} value={String(gb)}>
              {i === RAM_BUCKETS_GB.length - 1 ? `${gb} GB or more` : `${gb} GB`}
            </option>
          ))}
          <option value="unsure">Not sure</option>
        </select>
      </div>

      <div role="radiogroup" aria-labelledby={`${idPrefix}-apps-label`} aria-required="true" className="flex flex-col gap-1.5">
        <span id={`${idPrefix}-apps-label`} className="text-sm font-medium">
          Other heavy programs running (games, video calls, editing software)
        </span>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {(['yes', 'no'] as const).map((v) => (
            <label key={v} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={`${idPrefix}-apps`}
                value={v}
                required
                checked={answers.otherApps === v}
                onChange={() => onChange({ otherApps: v })}
                className={radio}
              />
              {v === 'yes' ? 'Yes' : 'No'}
            </label>
          ))}
        </div>
      </div>
    </>
  );
}

const HARDWARE_PUBLISHED_NOTE =
  'These answers are published with the run in the public leaderboard dataset; do not enter names or email addresses here.';

/** The hardware questions inside the run overlay, where they can still be corrected before the upload. */
function HardwareFieldset({
  idPrefix,
  answers,
  onChange,
}: {
  idPrefix: string;
  answers: HardwareAnswers;
  onChange: (patch: Partial<HardwareAnswers>) => void;
}) {
  return (
    <fieldset
      aria-describedby={`${idPrefix}-note`}
      className="flex min-w-0 flex-col gap-4 rounded-lg border border-border bg-muted/30 p-3 sm:p-4"
    >
      <legend className="px-1 text-sm font-semibold">About this computer</legend>
      <p className="-mt-2 text-xs text-muted-foreground">
        You can still correct these answers. The answers shown here when the run finishes are recorded.
      </p>
      <HardwareQuestions idPrefix={idPrefix} answers={answers} onChange={onChange} />
      <p id={`${idPrefix}-note`} className="text-xs text-muted-foreground">
        {HARDWARE_PUBLISHED_NOTE}
      </p>
    </fieldset>
  );
}

/**
 * The "About this computer" dialog Run benchmark opens on a paid-study link.
 * Start benchmark stays disabled, with the missing answers named beside it,
 * until all four are given; it starts the run from its own click, so the start
 * keeps the user activation the screen wake lock needs.
 */
function HardwareDialog({
  open,
  answers,
  onChange,
  onStart,
  onCancel,
  onCloseAutoFocus,
}: {
  open: boolean;
  answers: HardwareAnswers;
  onChange: (patch: Partial<HardwareAnswers>) => void;
  onStart: () => void;
  onCancel: () => void;
  onCloseAutoFocus: (event: Event) => void;
}) {
  const reason = hardwareBlockReason(answers);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent
        showCloseButton={false}
        onCloseAutoFocus={onCloseAutoFocus}
        className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto p-4 sm:p-6"
      >
        <DialogHeader className="text-left">
          <DialogTitle>About this computer</DialogTitle>
          <DialogDescription>
            Answer all four questions to start the benchmark. You can still correct them while it runs.{' '}
            {HARDWARE_PUBLISHED_NOTE}
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex min-w-0 flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (hardwareBlockReason(answers) === null) onStart();
          }}
        >
          <HardwareQuestions idPrefix="bench-hw" answers={answers} onChange={onChange} />
          <div className="flex flex-col gap-2 border-t border-border pt-4">
            {reason !== null && (
              <p id="bench-hw-missing" className="text-sm font-medium text-amber-800 dark:text-amber-200">
                {reason}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={reason !== null}
                aria-describedby={reason !== null ? 'bench-hw-missing' : undefined}
              >
                Start benchmark
              </Button>
            </DialogFooter>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ConfigHelp({ children }: { children: ReactNode }) {
  return <p className="text-xs leading-relaxed text-muted-foreground">{children}</p>;
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
  /** The study parameters have been read (a resumed series run must carry them too). */
  const [studyChecked, setStudyChecked] = useState(false);
  /** A study link with a completion code, opened in a browser the study does not pay for. */
  const studyIneligible = study?.completionCode != null && !study.eligibility.eligible;
  /** The study session whose promises (hints, completion code) this browser may see. */
  const paidStudy = study && !studyIneligible ? study : null;
  /** A paid-study link (with a completion code) in an eligible browser asks about the hardware. */
  const hardwareRequired = paidStudy?.completionCode != null;
  /** The link's completion-code rule (`ccmode`), read on mount. */
  const [completionMode, setCompletionMode] = useState<CompletionMode>('attempt');
  /** The code is issued only for a finished, uploaded run, and interrupted runs restart by themselves. */
  const fullMode = completionMode === 'full' && paidStudy?.completionCode != null;
  /**
   * The suite and run settings a paid-study link fixes, read on mount (null
   * on any other visit). The study pays for the suite the link names, so
   * these controls are disabled on such a link.
   */
  const [studyLock, setStudyLock] = useState<StudyRunLock | null>(null);
  const settingsLocked = studyLock !== null;
  /** Attempt count of the run in progress on a full-mode link (mirrored in a ref for async readers). */
  const [studyAttempt, setStudyAttemptState] = useState<StudyAttemptState | null>(null);
  const studyAttemptRef = useRef<StudyAttemptState | null>(null);
  const updateStudyAttempt = useCallback((next: StudyAttemptState | null) => {
    studyAttemptRef.current = next;
    setStudyAttemptState(next);
    if (next) saveStudyAttempt(next);
    else clearStudyAttempt();
  }, []);
  /** The run used up its attempts: no code, the cap message instead. */
  const studyCapped = fullMode && studyAttempt?.capped === true;
  /** A full-mode run the participant stopped (confirmed): no code. */
  const [stoppedByUser, setStoppedByUser] = useState(false);
  /** The "Stop the run?" confirmation of a full-mode run is open. */
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false);
  /** An interrupted single run restarts once the lanes are probed. */
  const [restartPending, setRestartPending] = useState(false);
  /** The restart waits for a click where the browser needs one for the wake lock. */
  const [restartAwaitingClick, setRestartAwaitingClick] = useState(false);
  /** "About this computer" answers; the values at the moment the run file is assembled are recorded. */
  const [hardware, setHardware] = useState<HardwareAnswers>(EMPTY_HARDWARE_ANSWERS);
  const hardwareRef = useRef<HardwareAnswers>(EMPTY_HARDWARE_ANSWERS);
  const updateHardware = useCallback((patch: Partial<HardwareAnswers>) => {
    const next = { ...hardwareRef.current, ...patch };
    hardwareRef.current = next;
    setHardware(next);
  }, []);
  const hardwareReason = hardwareRequired ? hardwareBlockReason(hardware) : null;
  /**
   * The "About this computer" dialog and the start it leads to: 'run' after a
   * click on Run benchmark, 'series-next' when a later series run found its
   * stored answers incomplete after the reload.
   */
  const [hardwareDialog, setHardwareDialog] = useState<null | 'run' | 'series-next'>(null);
  /** A series run waits for the answers (its dialog was cancelled); Run benchmark reopens it. */
  const [seriesAwaitingAnswersFlag, setSeriesAwaitingAnswers] = useState(false);
  /** Start benchmark closed the dialog: focus belongs to the run overlay, not back on Run. */
  const startingFromDialogRef = useRef(false);
  /** Run benchmark, where focus returns when the dialog is cancelled (the dialog has no Radix trigger). */
  const runButtonRef = useRef<HTMLButtonElement>(null);
  const [mobile, setMobile] = useState(false);
  /** Attempts an earlier page left unfinished (tab crash, closed tab): exportable, never submitted. */
  const [unfinished, setUnfinished] = useState<PartialAttempt[]>([]);
  /** "Runs" input as typed; the series length is its clamped integer value. */
  const [runsInput, setRunsInput] = useState('1');
  const runsCount = Math.min(MAX_SERIES_RUNS, Math.max(1, Math.floor(Number(runsInput)) || 1));
  const [clearAfterRun, setClearAfterRun] = useState(false);
  /** "Cool-down between runs" input as typed, in minutes; the series uses its clamped half-minute value. */
  const [cooldownInput, setCooldownInput] = useState('0');
  const cooldownMinutes = clampCooldownMinutes(Number(cooldownInput));
  /** The persisted series this page belongs to, if any (mirrored in seriesRef for async readers). */
  const [series, setSeriesState] = useState<SeriesState | null>(null);
  const seriesRef = useRef<SeriesState | null>(null);
  const updateSeries = useCallback((next: SeriesState | null) => {
    seriesRef.current = next;
    setSeriesState(next);
    if (next) saveSeries(next);
    else clearStoredSeries();
    // The hardware answers live as long as the series has runs to do.
    if (!isSeriesOpen(next)) clearSeriesHardware();
  }, []);
  /** A reloaded page with a pending series starts its next run once the lanes are probed. */
  const [autoStartPending, setAutoStartPending] = useState(false);
  /** A model ran in this page: the next series run needs a fresh page load. */
  const pageHasRunRef = useRef(false);
  const [clearState, setClearState] = useState<
    | { kind: 'idle' }
    | { kind: 'confirm' }
    | { kind: 'clearing' }
    | { kind: 'done'; report: CacheClearReport }
    | { kind: 'failed'; message: string }
  >({ kind: 'idle' });
  const [seriesCopied, setSeriesCopied] = useState(false);
  const [presetCopied, setPresetCopied] = useState(false);
  const seriesOpen = isSeriesOpen(series);
  const seriesAwaitingAnswers = seriesAwaitingAnswersFlag && series?.status === 'running';
  const wakeLock = useScreenWakeLock(phase === 'running' || series?.status === 'running');

  useEffect(() => {
    let cancelled = false;
    probeLaneAvailability().then((a) => {
      if (!cancelled) setAvailability(a);
    });
    readStudySession().then((s) => {
      if (cancelled) return;
      setStudy(s);
      setStudyChecked(true);
    });
    const unfinishedAttempts = listUnfinishedAttempts();
    void unfinishedAttempts.then((attempts) => {
      if (!cancelled) setUnfinished(attempts);
    });
    setMobile(isMobileDevice());
    // A full-mode study link restarts a run an earlier page left unfinished
    // (a reload, a crash, a closed tab), up to the attempt cap.
    const search = window.location.search;
    const mode = parseCompletionMode(search);
    setCompletionMode(mode);
    const studyCode = readStudyEligibility().eligible ? readStudyCompletionCode(search) : null;
    const fullCode = mode === 'full' ? studyCode : null;
    const lock = studyCode ? studyRunLock(parseRunPresets(search)) : null;
    setStudyLock(lock);
    const storedAttempt = fullCode ? loadStudyAttempt() : null;
    // The rest of the setup, once the cell an interrupted attempt died at is known.
    const setUp = (interruptedCellId: string | null) => {
      let attemptAction: 'none' | 'restart' | 'capped' = 'none';
      if (fullCode) {
        const resolved = resolveStudyAttemptOnLoad(storedAttempt, fullCode, interruptedCellId);
        updateStudyAttempt(resolved.state);
        attemptAction = resolved.action;
        if (resolved.action === 'restart' && resolved.state?.hardware) {
          hardwareRef.current = resolved.state.hardware;
          setHardware(resolved.state.hardware);
        }
        // The study pays only for an uploaded run: publishing stays on.
        setAutoSubmit(true);
      }
      // A pending series wins over URL presets: its runs repeat the settings it
      // started with. A link only prefills the controls; it never starts a run.
      const stored = loadSeries();
      // A finished series stays on screen until closed, but only an open one
      // (running or paused) dictates the controls.
      if (stored && !isSeriesOpen(stored)) updateSeries(stored);
      if (stored && isSeriesOpen(stored)) {
        let { state, action } = resolveSeriesOnLoad(stored);
        // On a full-mode link the interrupted run of the series starts again instead of pausing.
        if (attemptAction === 'restart' && state.status === 'paused' && stored.inFlightIndex !== null) {
          state = continueSeries(state);
          action = 'start-next';
        }
        // Read before updateSeries, which forgets the answers if the series has ended.
        const savedHardware = loadSeriesHardware(state.seriesId);
        updateSeries(state);
        if (savedHardware && isSeriesOpen(state)) {
          hardwareRef.current = savedHardware;
          setHardware(savedHardware);
        }
        setSuite(state.settings.suite);
        setIncludeQuality(state.settings.includeQuality);
        setAutoSubmit(state.settings.publish);
        setClearAfterRun(state.settings.clearAfterRun);
        setCooldownInput(String(state.settings.cooldownMs / 60_000));
        setDisabledLanes(new Set(state.settings.disabledLanes));
        setRunsInput(String(state.count));
        if (action === 'start-next' && attemptAction !== 'capped') setAutoStartPending(true);
      } else {
        const presets = parseRunPresets(search);
        if (lock) {
          // A paid-study link fixes these: the controls show the link's values, disabled.
          setSuite(lock.suite);
          setIncludeQuality(lock.includeQuality);
          setClearAfterRun(lock.clearAfterRun);
          setRunsInput(String(lock.runs));
          setCooldownInput(String(lock.cooldownMinutes));
        } else {
          if (presets.suite) setSuite(presets.suite);
          if (presets.includeQuality !== undefined) setIncludeQuality(presets.includeQuality);
          if (presets.clearAfterRun !== undefined) setClearAfterRun(presets.clearAfterRun);
          if (presets.runs !== undefined) setRunsInput(String(presets.runs));
          if (presets.cooldownMinutes !== undefined) setCooldownInput(String(presets.cooldownMinutes));
        }
        if (presets.publish !== undefined) setAutoSubmit(presets.publish);
        if (fullCode) setAutoSubmit(true);
        if (attemptAction === 'restart') setRestartPending(true);
      }
    };
    // An attempt left in flight names, in its progress record, the cell it was on.
    const partialId = storedAttempt?.inFlight && storedAttempt.code === fullCode ? storedAttempt.partialAttemptId : undefined;
    if (partialId) {
      void unfinishedAttempts.then((attempts) => {
        if (!cancelled) setUp(attempts.find((a) => a.attemptId === partialId)?.currentCellId ?? null);
      });
    } else {
      setUp(null);
    }
    return () => {
      cancelled = true;
    };
  }, [updateSeries, updateStudyAttempt]);

  // Keep the series panel's elapsed time live between runs (the run overlay has its own clock).
  useEffect(() => {
    if (!seriesOpen || phase === 'running') return;
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [seriesOpen, phase]);

  // The tab title carries the series progress, so a background tab shows it.
  useEffect(() => {
    if (!series) return;
    const previous = document.title;
    const wanted = seriesTitle(series);
    document.title = wanted;
    // Next.js writes the page metadata title after hydration; put the progress back.
    const observer = new MutationObserver(() => {
      if (document.title !== wanted) document.title = wanted;
    });
    observer.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => {
      observer.disconnect();
      document.title = previous;
    };
  }, [series]);

  // An open series keeps the hardware answers for its next page loads.
  useEffect(() => {
    if (hardwareRequired && isSeriesOpen(series)) saveSeriesHardware(series.seriesId, hardware);
  }, [hardwareRequired, series, hardware]);

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
  const totalDownload = estimateDownloadBytes(activeLanes.map((l) => l.model));

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

  const submitRun = useCallback(async (run: BenchRunResult): Promise<SubmitOutcome> => {
    setSubmitState({ kind: 'submitting' });
    try {
      // A Thorough run on a slow device can outlast the nonce fetched when it
      // started, so every upload attempt carries one fetched just before it.
      // The digest does not cover the nonce: swapping it keeps the digest
      // valid, and the run kept on the page (and its Export JSON) is unchanged.
      const post = async (nonce: string | undefined) => {
        const res = await fetch('/api/bench/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...run, nonce: nonce ?? run.nonce }),
        });
        const body = (await res.json()) as {
          ok: boolean;
          flagged?: boolean;
          url?: string;
          message?: string;
          code?: string;
          retryAfterSec?: number;
        };
        return { res, body };
      };
      let { res, body } = await post(await fetchSessionNonce());
      // An expired or missing token (the fetch above failed): one more try with a new one.
      if (!body.ok && body.code === 'invalid-nonce') {
        const fresh = await fetchSessionNonce();
        if (fresh) ({ res, body } = await post(fresh));
      }
      if (body.ok) {
        const outcome: SubmitOutcome = { kind: 'done', flagged: body.flagged ?? false, url: body.url };
        setSubmitState(outcome);
        return outcome;
      } else {
        // A shared network address (a household or office behind one NAT)
        // can exhaust the hourly window; the run is kept and resubmitted
        // by itself once the window opens, as long as the page stays open.
        const retryAfterSec =
          body.code === 'rate-limited' && typeof body.retryAfterSec === 'number' ? body.retryAfterSec : undefined;
        const outcome: SubmitOutcome = {
          kind: 'failed',
          message: body.message ?? body.code ?? `Submission failed (${res.status})`,
          ...(retryAfterSec ? { retryAt: Date.now() + retryAfterSec * 1000 } : {}),
        };
        setSubmitState(outcome);
        return outcome;
      }
    } catch {
      const outcome: SubmitOutcome = { kind: 'failed', message: 'Network error during submission.' };
      setSubmitState(outcome);
      return outcome;
    }
  }, []);
  /** True while a series run is publishing: the series waits out a rate limit itself. */
  const seriesSubmitRef = useRef(false);

  // Automatic resubmission after a rate-limited attempt; a tick keeps the
  // countdown live once the run overlay's own clock has stopped.
  const retryAt = submitState.kind === 'failed' ? submitState.retryAt : undefined;
  useEffect(() => {
    if (!retryAt || !result || seriesSubmitRef.current) return;
    const tick = setInterval(() => setNow(Date.now()), 1_000);
    const timer = setTimeout(() => void submitRun(result), Math.max(0, retryAt - Date.now()) + 1_000);
    return () => {
      clearInterval(tick);
      clearTimeout(timer);
    };
  }, [retryAt, result, submitRun]);

  // A full-mode run that finished and whose upload resolved for good (done,
  // or failed with no resubmission scheduled) is no longer an attempt to restart.
  useEffect(() => {
    if (!fullMode || !result || !studyAttemptRef.current?.inFlight) return;
    if (submitState.kind === 'done' || uploadFailedPermanently(submitState)) updateStudyAttempt(null);
  }, [fullMode, result, submitState, updateStudyAttempt]);

  // Answers corrected during a full-mode run are the ones its restart reuses.
  useEffect(() => {
    const current = studyAttemptRef.current;
    if (!fullMode || !current?.inFlight || current.hardware === hardware) return;
    updateStudyAttempt({ ...current, hardware });
  }, [fullMode, hardware, updateStudyAttempt]);

  /** Delete the providers' model caches and remember it for the next run's cold-start marker. */
  const clearCaches = useCallback(async (): Promise<CacheClearReport | null> => {
    setClearState({ kind: 'clearing' });
    try {
      const report = await clearProviderModelCaches();
      markCachesCleared(report);
      setClearState({ kind: 'done', report });
      return report;
    } catch (error) {
      setClearState({ kind: 'failed', message: (error as Error)?.message ?? String(error) });
      return null;
    }
  }, []);

  const run = useCallback(async (options: { userActivated: boolean }) => {
    // Synchronous part of the click handler: Chrome accepts the Gemini Nano
    // download request only inside the user activation, before any await. A
    // series run that resumed after a reload has no activation, so it never
    // asks; the lane is then skipped with the reason unless Nano is ready.
    const chromeLaneActive = activeLanes.some((l) => l.model.runtimeId === 'chrome-ai');
    let unsubscribeDownload: (() => void) | null = null;
    pageHasRunRef.current = true;
    const seriesAtStart = seriesRef.current;
    const runStartedAtMs = Date.now();
    // A full-mode study run counts its attempt before anything can fail, so a
    // page that dies during it restarts the run on the next load.
    const studyCode = fullMode ? (study?.completionCode ?? null) : null;
    if (studyCode) {
      updateStudyAttempt(
        beginStudyAttempt(studyAttemptRef.current, {
          code: studyCode,
          runIndex: seriesAtStart ? currentRunIndex(seriesAtStart) : 1,
          hardware: hardwareRef.current,
        }),
      );
    }
    setStoppedByUser(false);
    let restartAfterError = false;
    if (options.userActivated && chromeLaneActive && availability && availability.chromeAI !== 'available') {
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
    currentCellRef.current = null;
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
      // The run file carries a nonce from its start; each upload replaces it
      // with a fresh one (see submitRun). Offline, the run still works.
      const nonce = await fetchSessionNonce();
      // A run is cold only when the page cleared the provider caches since
      // the last run and they are still empty now; nothing else is claimed.
      const coldStart = await takeColdStartMarker();

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
        version: benchHarnessVersion(),
        appVersion: 'localmode.ai',
        runtimeVersions: benchRuntimeVersions(),
        commit: benchBuildCommit(),
        ...(seriesAtStart ? { series: seriesHarness(seriesAtStart) } : {}),
        ...(coldStart ? { coldStart: 'provider-caches-cleared' as const } : {}),
      };
      // Progress goes to IndexedDB cell by cell, so a tab that dies mid-suite
      // still leaves an exportable partial record on the next page load.
      attempt = await beginAttempt({
        suite,
        harness,
        plannedCellIds: cells.map((c) => `${c.model.runtimeId}/${c.model.benchModelId}/${c.workload.id}`),
      });
      // A full-mode attempt remembers its progress record: after an
      // interruption the next page load reads which cell it died at.
      if (studyCode && attempt && studyAttemptRef.current?.inFlight) {
        updateStudyAttempt({ ...studyAttemptRef.current, partialAttemptId: attempt.attemptId });
      }
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
      // The hardware answers as they stand now, when the run file is assembled.
      const reportedHardware =
        study?.completionCode != null && study.eligibility.eligible
          ? toUserReportedHardware(hardwareRef.current)
          : undefined;
      if (reportedHardware) {
        suiteResult.environment = { ...suiteResult.environment, userReportedHardware: reportedHardware };
      }
      suiteResult.nonce = nonce;
      suiteResult.digest = await computeRunDigest(suiteResult);
      setResult(suiteResult);
      setPhase('done');
      setStatusLine('Suite complete');
      // The run is over; the partial record has served its purpose.
      if (attempt) void finishAttempt(attempt.attemptId);
      attempt = null;
      if (!seriesAtStart) {
        // Publishing was disclosed next to the Run button; opt-out via the toggle.
        if (autoSubmit && !clearAfterRun) void submitRun(suiteResult);
        else if (autoSubmit) await submitRun(suiteResult);
        if (clearAfterRun) await clearCaches();
        return;
      }
      // Series: keep the run (published, or exported as JSON when publishing
      // is off or the submission failed), clear the caches if asked, record
      // it, then reload so the next run starts on a fresh page.
      let record: Omit<SeriesRunRecord, 'index'>;
      const durationMs = Date.now() - runStartedAtMs;
      if (autoSubmit) {
        seriesSubmitRef.current = true;
        let outcome = await submitRun(suiteResult);
        // A rate limit is waited out here (the page stays open between runs).
        while (outcome.kind === 'failed' && outcome.retryAt !== undefined) {
          await sleepMs(Math.max(0, outcome.retryAt - Date.now()) + 1_000);
          outcome = await submitRun(suiteResult);
        }
        seriesSubmitRef.current = false;
        // The run finished: its attempt count starts again for the next run.
        if (studyCode) updateStudyAttempt(null);
        if (outcome.kind === 'done') {
          record = { runId: suiteResult.runId, durationMs, outcome: outcome.flagged ? 'flagged' : 'published', rawUrl: outcome.url };
        } else {
          downloadJsonFile(suiteResult, `localmode-bench-${suiteResult.runId}.json`);
          record = { runId: suiteResult.runId, durationMs, outcome: 'exported-after-failed-submit', note: outcome.message };
        }
      } else {
        downloadJsonFile(suiteResult, `localmode-bench-${suiteResult.runId}.json`);
        record = { runId: suiteResult.runId, durationMs, outcome: 'exported' };
      }
      if (clearAfterRun) await clearCaches();
      const current = seriesRef.current ?? seriesAtStart;
      const next = recordRunFinished(current, record, Date.now());
      updateSeries(next);
      if (next.status === 'running') {
        // The idle clock starts now; with a cool-down the page waits it out
        // here, then reloads. Stop series during the wait ends the series.
        const cooling = startCooldown(next, Date.now());
        updateSeries(cooling);
        if (cooldownRemainingMs(cooling, Date.now()) > 0) {
          setStatusLine(`Run ${next.completed.length} of ${next.count} kept; cooling down before run ${next.completed.length + 1}`);
          for (;;) {
            const current = seriesRef.current;
            if (!current || current.status !== 'running') return;
            if (cooldownRemainingMs(current, Date.now()) <= 0) break;
            await sleepMs(250);
          }
        }
        setStatusLine(`Run ${next.completed.length} of ${next.count} kept; reloading the page for run ${next.completed.length + 1}`);
        // Give the browser a moment to hand the exported file to the download manager.
        await sleepMs(1_500);
        if (seriesRef.current?.status !== 'running') return;
        if (reportedHardware) saveSeriesHardware(next.seriesId, hardwareRef.current);
        window.location.reload();
      }
    } catch (error) {
      // "Cancelled" only when this page's Cancel button fired; any other
      // AbortError is a failure to show, not a cancel.
      const message = (error as Error)?.message ?? String(error);
      if (controller.signal.aborted) {
        setPhase('idle');
        setStatusLine('Cancelled');
      } else {
        setPhase('error');
        setErrorMessage(message);
      }
      seriesSubmitRef.current = false;
      let seriesHandled = false;
      if (studyCode) {
        const current = studyAttemptRef.current;
        if (controller.signal.aborted) {
          // A confirmed Stop: no code, and reopening the link starts again at attempt 1.
          updateStudyAttempt(null);
          if (seriesAtStart && seriesRef.current) {
            updateSeries(requestStop(seriesRef.current, { runInProgress: false, now: Date.now() }));
            seriesHandled = true;
          }
        } else if (current) {
          // A runner error is an interruption: restart on a fresh page, or stop
          // at the cap. A restart leaves the count in flight and the progress
          // record in place, so the reloaded page records the interruption
          // (and its cell) exactly as after a crash.
          const failedCellId = attempt ? (attempt.currentCellId ?? null) : (currentCellRef.current ?? null);
          const { state, action } = interruptStudyAttempt(current, failedCellId);
          if (action === 'restart') {
            restartAfterError = true;
            seriesHandled = true;
            setStatusLine(
              `The run stopped with an error; restarting it on a fresh page (${attemptLabel(current.attempts + 1)})`,
            );
          } else {
            updateStudyAttempt(state);
          }
        }
      }
      if (seriesAtStart && seriesRef.current && !seriesHandled) {
        updateSeries(
          recordRunFailed(
            seriesRef.current,
            controller.signal.aborted ? 'the run was cancelled.' : `the benchmark failed (${message}).`,
          ),
        );
      }
    } finally {
      // The run resolved in-page (complete, cancelled, or failed with a
      // recorded error): the partial record has served its purpose. A
      // full-mode run that restarts keeps it, as a page that died would.
      if (attempt && !restartAfterError) void finishAttempt(attempt.attemptId);
      if (studyCode && !restartAfterError && studyAttemptRef.current?.capped) {
        void listUnfinishedAttempts().then(setUnfinished);
      }
      unsubscribeDownload?.();
      setChromeDownloadPct(null);
      abortRef.current = null;
      setCellProgress(null);
      setLoadPct(null);
    }
    if (restartAfterError) {
      // Let the participant read why before the page reloads into the next attempt.
      await sleepMs(3_000);
      if (seriesRef.current && seriesRef.current.status === 'running') saveSeriesHardware(seriesRef.current.seriesId, hardwareRef.current);
      window.location.reload();
    }
  }, [suite, buildCells, autoSubmit, submitRun, study, activeLanes, availability, clearAfterRun, clearCaches, updateSeries, fullMode, updateStudyAttempt]);

  const downloadJson = downloadJsonFile;

  /** Run button: one run in this page, or the first run of a series. */
  const startFromClick = useCallback(() => {
    if (runsCount <= 1) {
      void run({ userActivated: true });
      return;
    }
    const created = createSeries({
      seriesId: crypto.randomUUID(),
      count: runsCount,
      settings: {
        suite,
        includeQuality,
        publish: autoSubmit,
        clearAfterRun,
        cooldownMs: cooldownMinutes * 60_000,
        disabledLanes: [...disabledLanes],
      },
      now: Date.now(),
    });
    if (pageHasRunRef.current) {
      // A model already ran in this page: run 1 must start on a fresh page too.
      updateSeries(created);
      if (hardwareRequired) saveSeriesHardware(created.seriesId, hardwareRef.current);
      window.location.reload();
      return;
    }
    updateSeries(markRunStarted(created, Date.now()));
    void run({ userActivated: true });
  }, [runsCount, run, suite, includeQuality, autoSubmit, clearAfterRun, cooldownMinutes, disabledLanes, updateSeries, hardwareRequired]);

  // Resume a series after its reload: no click, the next run starts once the lanes are probed.
  // A page reloaded by hand during a cool-down waits out the rest first (the series panel counts down).
  useEffect(() => {
    if (!autoStartPending || availability === null || !studyChecked || phase !== 'idle') return;
    const current = seriesRef.current;
    if (current && cooldownRemainingMs(current, now) > 0) return;
    setAutoStartPending(false);
    // A study series whose answers did not survive the reload asks for them again instead of starting.
    if (hardwareReason !== null) {
      if (current && current.status === 'running' && !studyIneligible) {
        setSeriesAwaitingAnswers(true);
        setHardwareDialog('series-next');
      }
      return;
    }
    if (!current || current.status !== 'running' || studyIneligible) return;
    updateSeries(markRunStarted(current, Date.now()));
    void run({ userActivated: false });
  }, [autoStartPending, availability, studyChecked, studyIneligible, hardwareReason, phase, run, updateSeries, now]);

  // Restart an interrupted full-mode run after the reload: no click where the
  // browser keeps the screen awake without one, else a single Continue button.
  useEffect(() => {
    if (!restartPending || availability === null || !studyChecked || phase !== 'idle') return;
    setRestartPending(false);
    if (!fullMode || studyCapped) return;
    if (hardwareReason !== null) {
      setHardwareDialog('run');
      return;
    }
    if (restartNeedsActivation(isWebKitUserAgent(navigator.userAgent))) {
      setRestartAwaitingClick(true);
      return;
    }
    void run({ userActivated: false });
  }, [restartPending, availability, studyChecked, phase, fullMode, studyCapped, hardwareReason, run]);

  /** Start benchmark in the "About this computer" dialog: the same start a click on Run makes. */
  const startFromHardwareDialog = useCallback(() => {
    if (hardwareBlockReason(hardwareRef.current) !== null) return;
    const mode = hardwareDialog;
    startingFromDialogRef.current = true;
    setHardwareDialog(null);
    if (mode !== 'series-next') {
      startFromClick();
      return;
    }
    setSeriesAwaitingAnswers(false);
    const current = seriesRef.current;
    if (!current || current.status !== 'running') return;
    saveSeriesHardware(current.seriesId, hardwareRef.current);
    updateSeries(markRunStarted(current, Date.now()));
    void run({ userActivated: true });
  }, [hardwareDialog, startFromClick, run, updateSeries]);

  const stopSeries = useCallback(() => {
    const current = seriesRef.current;
    if (!current) return;
    updateSeries(requestStop(current, { runInProgress: current.inFlightIndex !== null, now: Date.now() }));
  }, [updateSeries]);

  const continueCurrentSeries = useCallback(() => {
    const current = seriesRef.current;
    if (!current) return;
    const resumed = continueSeries(current);
    if (pageHasRunRef.current) {
      updateSeries(resumed);
      if (hardwareRequired) saveSeriesHardware(resumed.seriesId, hardwareRef.current);
      window.location.reload();
      return;
    }
    updateSeries(markRunStarted(resumed, Date.now()));
    void run({ userActivated: true });
  }, [run, updateSeries, hardwareRequired]);

  const closeSeries = useCallback(() => updateSeries(null), [updateSeries]);

  const copySeriesSummary = useCallback(async () => {
    const current = seriesRef.current;
    if (!current) return;
    try {
      await navigator.clipboard.writeText(seriesSummaryText(current));
      setSeriesCopied(true);
      setTimeout(() => setSeriesCopied(false), 2_000);
    } catch {
      setSeriesCopied(false);
    }
  }, []);

  // Relative on screen (identical on the server and the client); absolute when copied.
  const presetLink = useMemo(() => {
    // `ccmode` is carried over from the link this page was opened with; it has no control of its own.
    return `/bench/run?${presetQuery({
      suite,
      includeQuality,
      runs: runsCount,
      cooldownMinutes,
      clearAfterRun,
      publish: autoSubmit,
    })}${completionMode === 'full' ? '&ccmode=full' : ''}`;
  }, [suite, includeQuality, runsCount, cooldownMinutes, clearAfterRun, autoSubmit, completionMode]);

  const copyPresetLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${presetLink}`);
      setPresetCopied(true);
      setTimeout(() => setPresetCopied(false), 2_000);
    } catch {
      setPresetCopied(false);
    }
  }, [presetLink]);

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

  /** Cancel run / Stop series on a full-mode link ask first: a stopped run earns no code. */
  const requestRunStop = useCallback(() => setStopConfirmOpen(true), []);
  const confirmRunStop = useCallback(() => {
    setStopConfirmOpen(false);
    setStoppedByUser(true);
    if (abortRef.current) {
      cancel();
      return;
    }
    // Between the runs of a series: end the series now.
    updateStudyAttempt(null);
    const current = seriesRef.current;
    if (current) updateSeries(requestStop(current, { runInProgress: false, now: Date.now() }));
  }, [cancel, updateSeries, updateStudyAttempt]);

  /** Export the newest unfinished attempt (a run that hit the attempt cap never produced a full result). */
  const exportLatestPartial = useCallback(() => {
    const latest = [...unfinished].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0];
    if (latest) exportPartial(latest);
  }, [unfinished, exportPartial]);

  const exportJson = useCallback(() => {
    if (!result) return;
    downloadJson(result, `localmode-bench-${result.runId}.json`);
  }, [result, downloadJson]);

  const resultSettings = result ? runSettingsOf(result) : null;
  const codeIssued =
    studyLock !== null &&
    shouldIssueCompletionCode({
      mode: fullMode ? 'full' : 'attempt',
      suiteEnded: result !== null,
      allCellsAttempted: result !== null && cellsAllAttempted(result.cells, planned.length),
      submitState,
      stoppedByUser,
      lastRunOfSeries: !series || series.status === 'complete',
      runSettings: resultSettings,
      linkSettings: studyLock,
    });
  /** A finished run on a paid-study link that did not use the link's suite or quality setting. */
  const studySettingsMismatch =
    paidStudy?.completionCode != null &&
    studyLock !== null &&
    resultSettings !== null &&
    !runMatchesStudyLink(resultSettings, studyLock);

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
          <div className="grid gap-4 md:grid-cols-2">
            <ConfigSection id="bench-config-suite" title="Suite">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <Label htmlFor="bench-suite">Suite</Label>
                <Select
                  value={suite}
                  onValueChange={(v) => setSuite(v as typeof suite)}
                  disabled={phase === 'running' || settingsLocked}
                >
                  <SelectTrigger id="bench-suite" className="w-44">
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
              <ConfigHelp>{SUITE_HINTS[suite]}</ConfigHelp>
              <div className="flex items-center justify-between gap-4 border-t border-border pt-3">
                <Label htmlFor="bench-quality">Include quality-fidelity lane</Label>
                <Switch
                  id="bench-quality"
                  checked={includeQuality}
                  onCheckedChange={setIncludeQuality}
                  disabled={phase === 'running' || settingsLocked}
                />
              </div>
              <ConfigHelp>Adds tinyMMLU and STS-B scoring to check that each runtime keeps model accuracy.</ConfigHelp>
            </ConfigSection>

            <ConfigSection id="bench-config-series" title="Series" className="md:row-span-2">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <Label htmlFor="bench-runs">Runs</Label>
                <Input
                  id="bench-runs"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_SERIES_RUNS}
                  step={1}
                  className="w-20"
                  value={runsInput}
                  onChange={(e) => setRunsInput(e.target.value)}
                  onBlur={() => setRunsInput(String(runsCount))}
                  disabled={phase === 'running' || seriesOpen || settingsLocked}
                  aria-describedby="bench-runs-help"
                />
              </div>
              <ConfigHelp>1 to {MAX_SERIES_RUNS} runs with these settings, each on a fresh page load.</ConfigHelp>
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border pt-3">
                <Label htmlFor="bench-cooldown">Cool-down between runs</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="bench-cooldown"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={MAX_COOLDOWN_MINUTES}
                    step={COOLDOWN_STEP_MINUTES}
                    className="w-20"
                    value={cooldownInput}
                    onChange={(e) => setCooldownInput(e.target.value)}
                    onBlur={() => setCooldownInput(String(cooldownMinutes))}
                    disabled={phase === 'running' || seriesOpen || settingsLocked}
                    aria-describedby="bench-runs-help"
                  />
                  <span className="text-sm text-muted-foreground">min</span>
                </div>
              </div>
              <ConfigHelp>Idle time after each run so the device can cool (0 to {MAX_COOLDOWN_MINUTES} min).</ConfigHelp>
              <div className="flex items-center justify-between gap-4 border-t border-border pt-3">
                <Label htmlFor="bench-clear-after">Clear caches after each run</Label>
                <Switch
                  id="bench-clear-after"
                  checked={clearAfterRun}
                  onCheckedChange={setClearAfterRun}
                  disabled={phase === 'running' || seriesOpen || settingsLocked}
                />
              </div>
              <ConfigHelp>Each next run downloads its models again, for cold-start timings.</ConfigHelp>
              <p
                id="bench-runs-help"
                className="rounded-md bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground"
              >
                {runsCount > 1
                  ? `A series of ${runsCount} runs with these settings. Each run starts on a fresh page load: the page reloads itself after every run and starts the next one without a click. Keep this tab open and in front until the series ends.`
                  : `Set Runs above 1 (up to ${MAX_SERIES_RUNS}) to run a series with these settings, one fresh page load per run.`}
                {clearAfterRun
                  ? ' The model caches are cleared after every run, so each next run downloads its models again.'
                  : ''}
                {runsCount > 1 && cooldownMinutes > 0
                  ? ` After each run the page idles for ${cooldownMinutes} min (the cool-down) before it reloads, so the device can cool between runs; the wait is recorded on every run file.`
                  : ''}
                {runsCount > 1 && cooldownMinutes === 0
                  ? ` Cool-down between runs (0 to ${MAX_COOLDOWN_MINUTES} min, in half-minute steps) idles the page after each run before the next one; use it on laptops and phones, which slow down when run back to back.`
                  : ''}
              </p>
            </ConfigSection>

            <ConfigSection id="bench-config-publishing" title="Publishing">
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="bench-publish">Publish results to the public leaderboard</Label>
                <Switch
                  id="bench-publish"
                  checked={autoSubmit}
                  onCheckedChange={setAutoSubmit}
                  disabled={phase === 'running' || fullMode}
                />
              </div>
              <ConfigHelp>
                {fullMode
                  ? 'The study pays for an uploaded run, so publishing stays on for this link.'
                  : autoSubmit
                    ? 'The result uploads to the open dataset when the run completes.'
                    : 'The run stays on this device; export the JSON from the results.'}
              </ConfigHelp>
            </ConfigSection>

            <ConfigSection id="bench-config-tools" title="Tools" className="md:col-span-2">
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setClearState({ kind: 'confirm' })}
                  disabled={phase === 'running' || clearState.kind === 'clearing' || series?.status === 'running'}
                >
                  {clearState.kind === 'clearing' ? 'Clearing model caches…' : 'Clear model caches'}
                </Button>
                <ConfigHelp>Deletes the stored model files now; asks to confirm first.</ConfigHelp>
              </div>
              <details className="group border-t border-border pt-3 text-xs text-muted-foreground">
                <summary className="flex cursor-pointer select-none items-center gap-1.5 rounded-sm text-sm font-medium text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                  <ChevronRight
                    aria-hidden="true"
                    className="size-4 text-muted-foreground transition-transform group-open:rotate-90"
                  />
                  Link presets
                </summary>
                <div className="mt-2 flex flex-col gap-2">
                  <p>
                    A link can prefill these controls, for example to send study participants the same
                    settings. It never starts a run: a click on Run benchmark is always needed. On a study
                    link with a completion code, the link fixes the suite, the quality-fidelity lane, Runs,
                    the cool-down and clearing caches after each run.
                  </p>
                  <ul className="list-disc space-y-0.5 pl-5">
                    <li>
                      <code className="font-mono">tier=quick|standard|thorough</code>: the suite
                    </li>
                    <li>
                      <code className="font-mono">quality=on|off</code>: the quality-fidelity lane
                    </li>
                    <li>
                      <code className="font-mono">runs=N</code>: runs in the series (1 to {MAX_SERIES_RUNS})
                    </li>
                    <li>
                      <code className="font-mono">cooldown=M</code>: cool-down between runs in minutes (0 to{' '}
                      {MAX_COOLDOWN_MINUTES}, rounded to the nearest half minute)
                    </li>
                    <li>
                      <code className="font-mono">cold=on|off</code>: clear caches after each run
                    </li>
                    <li>
                      <code className="font-mono">publish=on|off</code>: publish to the leaderboard
                    </li>
                    <li>
                      <code className="font-mono">ccmode=full</code>: on a study link with a completion code, the
                      code is issued only for a finished, uploaded run, and an interrupted run restarts by
                      itself (up to {MAX_AUTOMATIC_RESTARTS} times, and not after two interruptions in a row
                      at the same step); kept in the link below when this page was opened with it
                    </li>
                  </ul>
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="min-w-0 break-all rounded bg-muted px-1.5 py-1 font-mono">{presetLink}</code>
                    <Button size="sm" variant="outline" onClick={() => void copyPresetLink()}>
                      {presetCopied ? 'Copied' : 'Copy link'}
                    </Button>
                  </div>
                </div>
              </details>
            </ConfigSection>
          </div>
          {settingsLocked && (
            <p className="text-xs text-muted-foreground" role="note">
              {STUDY_LOCK_NOTE}
            </p>
          )}
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Model lanes</h3>
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
                        disabled={!available || phase === 'running' || fullMode}
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
          </div>

          {studyIneligible && (
            <div
              role="alert"
              aria-labelledby="study-browser-gate-title"
              className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
            >
              <p id="study-browser-gate-title" className="font-medium">
                This study needs Chrome or Edge
              </p>
              <p className="mt-1">
                This study needs Chrome or Edge on a computer. Runs from phones and tablets, Safari,
                Firefox and other browsers are not eligible for payment and do not receive a completion
                code. Open this exact link in Chrome or Edge on a Windows, macOS, Linux or ChromeOS
                computer to take part.
              </p>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-5">
            {!studyIneligible && (
              <Button
                ref={runButtonRef}
                size="lg"
                onClick={() => {
                  if (seriesAwaitingAnswers) setHardwareDialog('series-next');
                  else if (hardwareRequired) setHardwareDialog('run');
                  else startFromClick();
                }}
                disabled={
                  phase === 'running' ||
                  activeLanes.length === 0 ||
                  (seriesOpen && !seriesAwaitingAnswers) ||
                  clearState.kind === 'clearing' ||
                  studyCapped ||
                  restartAwaitingClick
                }
              >
                {phase === 'running' ? 'Running…' : 'Run benchmark'}
              </Button>
            )}
            {restartAwaitingClick && (
              <Button
                size="lg"
                onClick={() => {
                  setRestartAwaitingClick(false);
                  void run({ userActivated: true });
                }}
              >
                Continue
              </Button>
            )}
            <span className="text-sm text-muted-foreground">
              {activeLanes.length} lanes · est. download {formatBytes(totalDownload)} (cached models
              skip the download)
            </span>
          </div>
          {mobile && (
            <p className="text-xs text-muted-foreground" role="note">
              Phones and tablets run the Quick suite. Standard and Thorough load several runtimes
              in one page and need more browser memory than a mobile browser allows; the tab would
              be killed partway through and the run lost. Even the Quick suite needs the page to
              start with memory to spare: close other tabs and apps first (a page that is short on
              memory is killed by the browser without warning, and a run that begins with an
              &quot;out of memory&quot; error on its first model rarely survives the next one).
            </p>
          )}
          {paidStudy && (
            <p className="text-xs text-muted-foreground" role="note">
              {fullMode
                ? `Paid study session detected. ${FULL_MODE_HINT} Keep this tab open until then.`
                : 'Paid study session detected: your completion code appears on this page once the run finishes and the upload attempt completes. Keep this tab open until then.'}
            </p>
          )}
          {restartAwaitingClick && (
            <p className="text-sm" role="note">
              The run was interrupted. Press Continue to start it again ({attemptLabel((studyAttempt?.attempts ?? 0) + 1)}).
            </p>
          )}
          {studyCapped && (
            <div
              role="alert"
              aria-labelledby="study-attempt-cap-title"
              className="flex flex-col gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm"
            >
              <p id="study-attempt-cap-title" className="font-medium">
                {attemptCapMessage(studyAttempt?.attempts ?? 0, studyAttempt?.capReason)}
              </p>
              <div>
                <Button size="sm" variant="outline" onClick={exportLatestPartial} disabled={unfinished.length === 0}>
                  Export JSON
                </Button>
              </div>
            </div>
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

      {hardwareRequired && (
        <HardwareDialog
          open={hardwareDialog !== null && phase !== 'running'}
          answers={hardware}
          onChange={updateHardware}
          onStart={startFromHardwareDialog}
          onCancel={() => setHardwareDialog(null)}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (startingFromDialogRef.current) {
              startingFromDialogRef.current = false;
              return;
            }
            runButtonRef.current?.focus();
          }}
        />
      )}

      <Dialog
        open={stopConfirmOpen}
        onOpenChange={(open) => {
          if (!open) setStopConfirmOpen(false);
        }}
      >
        <DialogContent role="alertdialog" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Stop the run?</DialogTitle>
            <DialogDescription>
              The study pays only for a finished run. If you stop now, no completion code is issued;
              reopening the link starts the run again from the beginning.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStopConfirmOpen(false)}>
              Keep running
            </Button>
            <Button variant="destructive" onClick={confirmRunStop}>
              Stop
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={clearState.kind === 'confirm'}
        onOpenChange={(open) => {
          if (!open && clearState.kind === 'confirm') setClearState({ kind: 'idle' });
        }}
      >
        <DialogContent role="alertdialog" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Clear model caches?</DialogTitle>
            <DialogDescription>
              This deletes every model file the benchmark&apos;s runtimes stored for this site
              (Transformers.js, WebLLM and LiteRT in the Cache API, wllama in the Origin Private File
              System, WebLLM in IndexedDB), so the next run downloads its models again. Your
              unfinished-run records and settings are kept.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Not affected: Gemini Nano (Chrome Built-in AI) is installed browser-wide by Chrome and a
            page cannot remove it, and the browser&apos;s own HTTP disk cache cannot be cleared from a
            page, so a model may still load from that cache. This clears the provider caches; it is
            not a fresh browser profile.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearState({ kind: 'idle' })}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void clearCaches()}>
              Clear caches
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {(clearState.kind === 'done' || clearState.kind === 'failed') && (
        <Card role="region" aria-label="Model caches cleared">
          <CardHeader>
            <CardTitle>
              {clearState.kind === 'done' && clearState.report.ok
                ? 'Provider caches cleared'
                : 'Provider caches not fully cleared'}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {clearState.kind === 'done' ? (
              <ul className="list-disc space-y-0.5 pl-5" aria-label="Deleted storage">
                {describeClearReport(clearState.report).map((line) => (
                  <li key={line} className={line.startsWith('Error:') ? 'text-destructive' : ''}>
                    {line}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-destructive">Clearing failed: {clearState.message}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Gemini Nano (Chrome Built-in AI) is browser-wide and was not affected, and the
              browser&apos;s HTTP disk cache cannot be cleared from a page: these are provider caches
              cleared, not a fresh browser profile. MediaPipe keeps no cache of its own; its files
              come from the HTTP cache or the network on every load.
            </p>
            <div>
              <Button size="sm" variant="ghost" onClick={() => setClearState({ kind: 'idle' })}>
                Dismiss
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {series && phase !== 'running' && (
        <SeriesPanel
          series={series}
          now={now}
          wakeLock={wakeLock}
          copied={seriesCopied}
          onStop={fullMode ? requestRunStop : stopSeries}
          onContinue={continueCurrentSeries}
          canContinue={!studyCapped}
          onClose={closeSeries}
          onCopy={() => void copySeriesSummary()}
        />
      )}

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
          study={paidStudy}
          hardware={hardwareRequired ? { answers: hardware, onChange: updateHardware } : null}
          autoSubmit={autoSubmit}
          onCancel={fullMode ? requestRunStop : cancel}
          cancelling={cancelling}
          series={series}
          wakeLock={wakeLock}
          onStopSeries={fullMode ? requestRunStop : stopSeries}
          fullMode={fullMode}
          attempt={fullMode ? (studyAttempt?.attempts ?? null) : null}
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
            {fullMode && stoppedByUser && (
              <p role="note" className="text-sm">
                The run was stopped, so no completion code is issued. Reopening the link starts the run
                again from the beginning.
              </p>
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
            {studySettingsMismatch && (
              <p role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
                {SETTINGS_MISMATCH_MESSAGE}
              </p>
            )}
            {fullMode &&
              !studySettingsMismatch &&
              uploadFailedPermanently(submitState) &&
              (!series || series.status === 'complete') && (
              <p role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
                {UPLOAD_FAILED_MESSAGE}
              </p>
            )}
            {paidStudy?.completionCode && codeIssued && (
              <div
                role="region"
                aria-label="Study completion code"
                className="rounded-md border border-border bg-muted/40 p-3 text-sm"
              >
                <p>
                  Your Prolific completion code:{' '}
                  <code className="rounded bg-muted px-1 font-mono text-base">{paidStudy.completionCode}</code>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {submitState.kind === 'failed'
                    ? 'The upload did not go through, but you are still paid for the attempt: enter the code on Prolific and message the researcher with a screenshot of this page.'
                    : 'Enter it on Prolific to finish the study.'}{' '}
                  <a
                    className="underline underline-offset-2"
                    href={`${PROLIFIC_COMPLETE_URL}${encodeURIComponent(paidStudy.completionCode)}`}
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
  /** The study's hardware questions, editable while the run is in progress (null outside a study). */
  hardware: { answers: HardwareAnswers; onChange: (patch: Partial<HardwareAnswers>) => void } | null;
  autoSubmit: boolean;
  onCancel: () => void;
  cancelling: boolean;
  series: SeriesState | null;
  wakeLock: WakeLockStatus;
  onStopSeries: () => void;
  /** The link issues its code only for a finished, uploaded run. */
  fullMode: boolean;
  /** Attempt number of this run on a full-mode link (null otherwise). */
  attempt: number | null;
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
    hardware,
    autoSubmit,
    onCancel,
    cancelling,
    series,
    wakeLock,
    onStopSeries,
    fullMode,
    attempt,
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
          {wakeLock !== 'idle' && <p className="text-xs text-muted-foreground">{WAKE_LOCK_TEXT[wakeLock]}</p>}
          {attempt !== null && (
            <p className="text-xs text-muted-foreground">
              {attemptLabel(attempt)} · {RESTART_POLICY_TEXT}
            </p>
          )}
        </div>

        {series && (
          <div
            role="group"
            aria-label="Series progress"
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3 text-sm"
          >
            <div className="flex flex-col gap-0.5">
              <span className="font-medium">
                Series: run {currentRunIndex(series)} of {series.count}
              </span>
              <span className="text-xs text-muted-foreground">
                {series.stopRequested
                  ? 'The series stops when this run finishes.'
                  : series.completed.length > 0
                    ? `${series.completed.length} done · the series ends in about ${formatDuration(seriesEtaMs(series, now) ?? 0)}`
                    : 'After this run the page reloads and starts the next one by itself.'}
              </span>
            </div>
            <Button size="sm" variant="outline" onClick={onStopSeries} disabled={series.stopRequested}>
              {series.stopRequested ? 'Stopping after this run' : 'Stop series'}
            </Button>
          </div>
        )}
        {series && <WakeLockNotice status={wakeLock} />}

        <div
          role="alert"
          className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
        >
          <p className="font-medium">Please keep this tab open, visible, and in front until the run finishes.</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            <li>Do not switch to another tab, minimize or cover this window, lock the screen, or close this page.</li>
            <li>
              {wakeLock === 'refused' || wakeLock === 'tap' || wakeLock === 'unavailable'
                ? 'Keep the device plugged in and its screen on; this browser does not keep the screen awake for you.'
                : 'Keep the device plugged in; the screen is kept awake for you while the run is in progress.'}
            </li>
            <li>Browsers slow down background tabs, so a measurement taken while this tab is hidden is set aside and repeated once the tab is back in front; if the tab stays hidden, that step is marked invalid.</li>
            {study && (
              <li>
                {fullMode
                  ? FULL_MODE_HINT
                  : 'Your completion code appears on this page as soon as the run and its upload finish.'}
              </li>
            )}
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

        {hardware && (
          <HardwareFieldset
            idPrefix="bench-hw-run"
            answers={hardware.answers}
            onChange={hardware.onChange}
          />
        )}

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

/** The series read-out on the page (between runs, paused, or finished). */
function SeriesPanel(props: {
  series: SeriesState;
  now: number;
  wakeLock: WakeLockStatus;
  copied: boolean;
  onStop: () => void;
  onContinue: () => void;
  /** False when the run in progress used up its study attempts. */
  canContinue: boolean;
  onClose: () => void;
  onCopy: () => void;
}) {
  const { series, now, wakeLock, copied, onStop, onContinue, canContinue, onClose, onCopy } = props;
  const eta = seriesEtaMs(series, now);
  const cooldownText = cooldownStatusText(series, now);
  const started = Date.parse(series.startedAt);
  const ended = series.endedAt ? Date.parse(series.endedAt) : now;
  const heading =
    series.status === 'running'
      ? `Series: run ${currentRunIndex(series)} of ${series.count}`
      : series.status === 'paused'
        ? `Series paused after ${series.completed.length} of ${series.count} runs`
        : series.status === 'complete'
          ? `Series complete: ${series.count} of ${series.count} runs`
          : `Series stopped after ${series.completed.length} of ${series.count} runs`;
  return (
    <Card role="region" aria-label="Benchmark series">
      <CardHeader>
        <CardTitle>{heading}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <p className="text-muted-foreground">
          {series.settings.suite} suite · quality {series.settings.includeQuality ? 'on' : 'off'} · publish{' '}
          {series.settings.publish ? 'on' : 'off'} · clear caches after each run {series.settings.clearAfterRun ? 'on' : 'off'}
          {' · '}cool-down {series.settings.cooldownMs / 60_000} min
          {' · '}elapsed {formatDuration(Math.max(0, ended - started))}
          {series.status === 'running' && eta !== null ? ` · about ${formatDuration(eta)} left` : ''}
        </p>
        {cooldownText && (
          <p role="status" className="font-medium tabular-nums">
            {cooldownText}
          </p>
        )}
        {series.status === 'running' && wakeLock !== 'idle' && (
          <p className="text-xs text-muted-foreground">{WAKE_LOCK_TEXT[wakeLock]}</p>
        )}
        {series.status === 'running' && <WakeLockNotice status={wakeLock} />}
        {series.status === 'paused' && series.pauseReason && (
          <p role="alert" className="text-destructive">
            {series.pauseReason}
          </p>
        )}
        {series.completed.length > 0 ? (
          <ol className="flex flex-col gap-1" aria-label="Completed runs">
            {series.completed.map((r) => (
              <li key={r.runId} className="flex flex-wrap items-baseline gap-x-2">
                <span className="tabular-nums">{r.index}.</span>
                <span className="font-mono text-xs">{r.runId}</span>
                <span className="text-muted-foreground">{formatDuration(r.durationMs)}</span>
                {r.rawUrl ? (
                  <a className="underline underline-offset-2" href={r.rawUrl} target="_blank" rel="noreferrer">
                    View the raw run {r.index}
                  </a>
                ) : (
                  <span className="text-muted-foreground">
                    {r.outcome === 'exported' ? 'exported as JSON' : `exported as JSON; not published (${r.note ?? 'submission failed'})`}
                  </span>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-muted-foreground">No run of this series has finished yet.</p>
        )}
        <div className="flex flex-wrap gap-2">
          {series.status === 'paused' && canContinue && <Button onClick={onContinue}>Continue series</Button>}
          {(series.status === 'running' || series.status === 'paused') && (
            <Button variant="outline" onClick={onStop}>
              Stop series
            </Button>
          )}
          <Button variant="outline" onClick={onCopy} disabled={series.completed.length === 0}>
            {copied ? 'Copied' : 'Copy summary'}
          </Button>
          {(series.status === 'complete' || series.status === 'stopped') && (
            <Button variant="ghost" onClick={onClose}>
              Close series
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
