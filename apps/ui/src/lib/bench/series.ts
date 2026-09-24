/**
 * A benchmark series on /bench/run: N consecutive runs on one device with the
 * same settings. Each run executes on a fresh page load, because the
 * Transformers.js lanes share one ONNX WASM heap per page that never shrinks
 * and the analysis counts one fresh page load as one independent sample. The
 * page therefore persists the series here between runs, reloads itself after
 * each run, and resumes on load. Everything in this module is pure except the
 * localStorage helpers at the bottom, which never throw.
 */

/** Largest series the runner accepts: the longest series the lab plan schedules (30 Thorough runs). */
export const MAX_SERIES_RUNS = 30;

/** localStorage key of the series state (runner-owned). */
export const SERIES_STORAGE_KEY = 'localmode-bench-series';

export type SeriesSuite = 'quick' | 'standard' | 'thorough';

/** Settings every run of a series repeats. */
export interface SeriesSettings {
  suite: SeriesSuite;
  includeQuality: boolean;
  publish: boolean;
  clearAfterRun: boolean;
  /** Lanes the submitter switched off (`runtimeId/benchModelId`). */
  disabledLanes: string[];
}

/** How a finished run of the series was kept. */
export type SeriesRunOutcome = 'published' | 'flagged' | 'exported' | 'exported-after-failed-submit';

/** One finished run of the series. */
export interface SeriesRunRecord {
  index: number;
  runId: string;
  /** Wall time from the run's start to its result, in ms. */
  durationMs: number;
  outcome: SeriesRunOutcome;
  /** Raw run file in the public dataset, when it was published. */
  rawUrl?: string;
  /** Why a run was exported instead of published. */
  note?: string;
}

export type SeriesStatus = 'running' | 'paused' | 'complete' | 'stopped';

/** The persisted series. */
export interface SeriesState {
  version: 1;
  seriesId: string;
  count: number;
  settings: SeriesSettings;
  startedAt: string;
  status: SeriesStatus;
  completed: SeriesRunRecord[];
  /** Index of the run that started and has not recorded a result yet. */
  inFlightIndex: number | null;
  /** Stop after the run in progress. */
  stopRequested: boolean;
  pauseReason?: string;
  endedAt?: string;
}

/** Start a series at run 1. */
export function createSeries(input: {
  seriesId: string;
  count: number;
  settings: SeriesSettings;
  now: number;
}): SeriesState {
  return {
    version: 1,
    seriesId: input.seriesId,
    count: Math.min(MAX_SERIES_RUNS, Math.max(1, Math.floor(input.count))),
    settings: { ...input.settings, disabledLanes: [...input.settings.disabledLanes] },
    startedAt: new Date(input.now).toISOString(),
    status: 'running',
    completed: [],
    inFlightIndex: null,
    stopRequested: false,
  };
}

/** 1-based index of the run that runs next (or is running). */
export function currentRunIndex(state: SeriesState): number {
  return state.inFlightIndex ?? state.completed.length + 1;
}

/** Mark the next run as started, so a page that dies during it is detected on the next load. */
export function markRunStarted(state: SeriesState): SeriesState {
  return { ...state, status: 'running', inFlightIndex: state.completed.length + 1, pauseReason: undefined };
}

/** Record a run that produced a result (published or exported). */
export function recordRunFinished(
  state: SeriesState,
  run: Omit<SeriesRunRecord, 'index'>,
  now: number,
): SeriesState {
  const record: SeriesRunRecord = { index: state.completed.length + 1, ...run };
  const completed = [...state.completed, record];
  const done = completed.length >= state.count;
  const status: SeriesStatus = done ? 'complete' : state.stopRequested ? 'stopped' : 'running';
  return {
    ...state,
    completed,
    inFlightIndex: null,
    status,
    ...(status === 'running' ? {} : { endedAt: new Date(now).toISOString() }),
  };
}

/** A run failed or was cancelled: pause, and never record it as a run of the series. */
export function recordRunFailed(state: SeriesState, reason: string): SeriesState {
  const index = state.inFlightIndex ?? state.completed.length + 1;
  return {
    ...state,
    status: 'paused',
    inFlightIndex: null,
    stopRequested: false,
    pauseReason: `Run ${index} of ${state.count} did not produce a result: ${reason}`,
  };
}

/** Stop the series: after the run in progress, or at once when the page is idle. */
export function requestStop(state: SeriesState, options: { runInProgress: boolean; now: number }): SeriesState {
  if (options.runInProgress) return { ...state, stopRequested: true };
  return {
    ...state,
    status: 'stopped',
    inFlightIndex: null,
    stopRequested: false,
    endedAt: new Date(options.now).toISOString(),
  };
}

/** Resume a paused series; the next run is the one after the last recorded run. */
export function continueSeries(state: SeriesState): SeriesState {
  return { ...state, status: 'running', inFlightIndex: null, stopRequested: false, pauseReason: undefined };
}

/**
 * What a freshly loaded page does with a stored series: start the next run,
 * or only show it. A run that was in flight when the page went away (a
 * crash, a closed tab, a manual reload) pauses the series instead of
 * restarting it, so a run that kills the page cannot loop.
 */
export function resolveSeriesOnLoad(state: SeriesState): { state: SeriesState; action: 'start-next' | 'show' } {
  if (state.status !== 'running') return { state, action: 'show' };
  if (state.inFlightIndex !== null) {
    return {
      state: {
        ...state,
        status: 'paused',
        inFlightIndex: null,
        stopRequested: false,
        pauseReason: `Run ${state.inFlightIndex} of ${state.count} did not finish: the page was closed, reloaded or crashed while it ran. Its progress, if any, is in the recovery card.`,
      },
      action: 'show',
    };
  }
  if (state.stopRequested) {
    return { state: { ...state, status: 'stopped', stopRequested: false, endedAt: state.endedAt ?? state.startedAt }, action: 'show' };
  }
  return { state, action: 'start-next' };
}

/** True while the series still has runs to do (running or paused). */
export function isSeriesOpen(state: SeriesState | null): state is SeriesState {
  return state !== null && (state.status === 'running' || state.status === 'paused');
}

/** Remaining wall time: the mean duration of the completed runs times the runs left. Null before the first run finishes. */
export function seriesEtaMs(state: SeriesState): number | null {
  if (state.completed.length === 0) return null;
  const mean = state.completed.reduce((acc, r) => acc + r.durationMs, 0) / state.completed.length;
  return mean * Math.max(0, state.count - state.completed.length);
}

/** Document title while a series is open or just ended, so a background tab shows progress. */
export function seriesTitle(state: SeriesState): string {
  const done = state.completed.length;
  switch (state.status) {
    case 'running':
      return `${currentRunIndex(state)}/${state.count} · LocalMode Bench`;
    case 'paused':
      return `Paused ${done}/${state.count} · LocalMode Bench`;
    case 'complete':
      return `Done ${done}/${state.count} · LocalMode Bench`;
    case 'stopped':
      return `Stopped ${done}/${state.count} · LocalMode Bench`;
  }
}

/** Elapsed wall time as "1 m 5 s" / "45 s" / "1 h 2 m". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h} h ${m} m`;
  return m > 0 ? `${m} m ${s} s` : `${s} s`;
}

const onOff = (v: boolean) => (v ? 'on' : 'off');

/** Plain-text account of the series for pasting: settings, then one line per run with its raw link. */
export function seriesSummaryText(state: SeriesState): string {
  const s = state.settings;
  const lines = [
    `LocalMode Bench series ${state.seriesId} · ${s.suite} suite · quality ${onOff(s.includeQuality)} · publish ${onOff(
      s.publish,
    )} · clear caches after each run ${onOff(s.clearAfterRun)}`,
    `${state.completed.length} of ${state.count} runs · ${state.status} · started ${state.startedAt}`,
  ];
  for (const run of state.completed) {
    const where =
      run.rawUrl ??
      (run.outcome === 'exported'
        ? 'exported as JSON (not published)'
        : `exported as JSON (submission failed${run.note ? `: ${run.note}` : ''})`);
    lines.push(`${run.index}. ${run.runId} · ${formatDuration(run.durationMs)} · ${where}`);
  }
  return lines.join('\n');
}

const SUITES: readonly SeriesSuite[] = ['quick', 'standard', 'thorough'];
const STATUSES: readonly SeriesStatus[] = ['running', 'paused', 'complete', 'stopped'];

/** Serialize for localStorage. */
export function serializeSeriesState(state: SeriesState): string {
  return JSON.stringify(state);
}

/** Parse a stored series; anything malformed reads as no series. */
export function parseSeriesState(raw: string | null): SeriesState | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null) return null;
  const s = v as Record<string, unknown>;
  const settings = s.settings as Record<string, unknown> | undefined;
  const isInt = (x: unknown, min: number, max: number) => typeof x === 'number' && Number.isInteger(x) && x >= min && x <= max;
  if (s.version !== 1 || typeof s.seriesId !== 'string' || !s.seriesId) return null;
  if (!isInt(s.count, 1, MAX_SERIES_RUNS)) return null;
  if (!settings || !SUITES.includes(settings.suite as SeriesSuite)) return null;
  if (typeof settings.includeQuality !== 'boolean' || typeof settings.publish !== 'boolean') return null;
  if (typeof settings.clearAfterRun !== 'boolean' || !Array.isArray(settings.disabledLanes)) return null;
  if (!STATUSES.includes(s.status as SeriesStatus) || typeof s.startedAt !== 'string') return null;
  if (!Array.isArray(s.completed)) return null;
  if (s.inFlightIndex !== null && !isInt(s.inFlightIndex, 1, MAX_SERIES_RUNS)) return null;
  if (typeof s.stopRequested !== 'boolean') return null;
  for (const r of s.completed as Array<Record<string, unknown>>) {
    if (typeof r !== 'object' || r === null || typeof r.runId !== 'string' || typeof r.durationMs !== 'number') return null;
  }
  return v as SeriesState;
}

/** Read the stored series (null when absent, malformed, or storage is blocked). */
export function loadSeries(): SeriesState | null {
  try {
    return parseSeriesState(localStorage.getItem(SERIES_STORAGE_KEY));
  } catch {
    return null;
  }
}

/** Persist the series; returns false when storage is blocked (the series then cannot survive a reload). */
export function saveSeries(state: SeriesState): boolean {
  try {
    localStorage.setItem(SERIES_STORAGE_KEY, serializeSeriesState(state));
    return true;
  } catch {
    return false;
  }
}

/** Forget the stored series. */
export function clearStoredSeries(): void {
  try {
    localStorage.removeItem(SERIES_STORAGE_KEY);
  } catch {
    // Nothing stored.
  }
}

/** Settings a `/bench/run` link can prefill. A link never starts a run. */
export interface RunPresets {
  suite?: SeriesSuite;
  includeQuality?: boolean;
  runs?: number;
  clearAfterRun?: boolean;
  publish?: boolean;
}

function readOnOff(value: string | null): boolean | undefined {
  if (value === 'on') return true;
  if (value === 'off') return false;
  return undefined;
}

/**
 * Parse `?tier=quick|standard|thorough&quality=on|off&runs=N&cold=on|off&publish=on|off`.
 * Unknown values are ignored; `runs` must be an integer and is clamped to 1..MAX_SERIES_RUNS.
 */
export function parseRunPresets(search: string): RunPresets {
  const params = new URLSearchParams(search);
  const out: RunPresets = {};
  const tier = params.get('tier');
  if (tier && SUITES.includes(tier as SeriesSuite)) out.suite = tier as SeriesSuite;
  const quality = readOnOff(params.get('quality'));
  if (quality !== undefined) out.includeQuality = quality;
  const runs = params.get('runs');
  if (runs !== null && /^\d+$/.test(runs)) out.runs = Math.min(MAX_SERIES_RUNS, Math.max(1, Number(runs)));
  const cold = readOnOff(params.get('cold'));
  if (cold !== undefined) out.clearAfterRun = cold;
  const publish = readOnOff(params.get('publish'));
  if (publish !== undefined) out.publish = publish;
  return out;
}

/** The query string for a set of controls, in the documented parameter order. */
export function presetQuery(p: Required<RunPresets>): string {
  return `tier=${p.suite}&quality=${onOff(p.includeQuality)}&runs=${p.runs}&cold=${onOff(p.clearAfterRun)}&publish=${onOff(
    p.publish,
  )}`;
}
