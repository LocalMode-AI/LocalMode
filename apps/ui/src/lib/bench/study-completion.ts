/**
 * When a paid-study link issues its completion code. A link's `ccmode`
 * parameter picks the rule: `attempt` (the default) shows the code once a
 * finished run's upload attempt has resolved, whether it went through or not;
 * `full` shows it only for a run that finished with every cell attempted and
 * uploaded. In `full` mode an interrupted run (a reload, a crash, a closed
 * tab, a runner error) restarts by itself on the next page load, at most
 * MAX_AUTOMATIC_RESTARTS times per run, and stops as soon as two attempts in a
 * row are interrupted at the same cell (a device that dies at the same model
 * load every time would otherwise spend four full runs on it); the attempt
 * count lives in localStorage beside the series state. In both modes the
 * study pays for the suite the link names: the link fixes the suite and the
 * run settings (`studyRunLock`), and a run whose suite or quality-fidelity
 * setting differs from the link's gets no code. Everything in this module is pure
 * except the localStorage helpers at the bottom, which never throw.
 */
import type { RunPresets, SeriesSuite } from './series';
import { parseStoredHardware, type HardwareAnswers } from './study-hardware';

export type CompletionMode = 'attempt' | 'full';

/** Automatic restarts of one run after its first attempt. */
export const MAX_AUTOMATIC_RESTARTS = 3;

/** Attempts one run gets in `full` mode: the first plus the automatic restarts. */
export const MAX_RUN_ATTEMPTS = MAX_AUTOMATIC_RESTARTS + 1;

/**
 * Consecutive attempts interrupted at the same cell after which the run
 * stops: the first interruption at a cell restarts, the second in a row ends
 * the run.
 */
export const MAX_SAME_CELL_ATTEMPTS = 2;

/** localStorage key of the attempt count (a sibling of the series state). */
export const STUDY_ATTEMPTS_STORAGE_KEY = 'localmode-bench-series-attempts';

/** Skip reason the runner gives a lane the submitter switched off. */
const SUBMITTER_DISABLED_REASON = 'lane disabled by the submitter';

/** Why a run stopped restarting. */
export type AttemptCapReason = 'attempts' | 'same-cell';

/**
 * Message shown in place of the code once a run stopped restarting.
 *
 * @param attempts - Attempts the run used.
 * @param reason - `attempts` when it used them all, `same-cell` when the last two stopped at the same cell.
 * @returns The message.
 * @example
 * attemptCapMessage(2, 'same-cell');
 * // 'The run could not finish after 2 attempts: both stopped at the same step. ...'
 */
export function attemptCapMessage(attempts: number, reason: AttemptCapReason = 'attempts'): string {
  const why =
    reason === 'same-cell' ? (attempts === 2 ? ': both stopped at the same step' : ': the last two stopped at the same step') : '';
  return `The run could not finish after ${attempts} attempts${why}. Please message the researcher with a screenshot of this page; you are paid for the attempt.`;
}

/** The cap message of a run that used every attempt. */
export const ATTEMPT_CAP_MESSAGE = attemptCapMessage(MAX_RUN_ATTEMPTS);

/** Message shown in place of the code when a finished run could not be uploaded. */
export const UPLOAD_FAILED_MESSAGE =
  'The run finished but the upload did not go through. Export the result and message the researcher with it; you are paid for the attempt.';

/** What the study hint says in `full` mode, on the page and in the run overlay. */
export const FULL_MODE_HINT =
  'Your completion code appears when the whole run has finished and uploaded. If it is interrupted, this page restarts it by itself.';

/**
 * Read the completion mode from a query string: `ccmode=full` selects `full`,
 * anything else (or nothing) `attempt`.
 *
 * @param search - The query string, with or without the leading `?`.
 * @returns The completion mode.
 * @example
 * parseCompletionMode('?tier=thorough&ccmode=full'); // 'full'
 */
export function parseCompletionMode(search: string): CompletionMode {
  return new URLSearchParams(search).get('ccmode') === 'full' ? 'full' : 'attempt';
}

/**
 * The run settings a paid-study link fixes. The page shows them in disabled
 * controls; a parameter the link leaves out takes the value the controls
 * start with on a plain visit.
 */
export interface StudyRunLock {
  suite: SeriesSuite;
  includeQuality: boolean;
  runs: number;
  /** Cool-down between runs, in minutes. */
  cooldownMinutes: number;
  clearAfterRun: boolean;
}

/**
 * The settings a paid-study link fixes, from its parsed presets (see
 * `parseRunPresets`). Publishing is not part of the lock: `full` mode forces
 * it on by itself.
 *
 * @param presets - The link's presets.
 * @returns The locked settings.
 * @example
 * studyRunLock(parseRunPresets('?tier=thorough&quality=on&cc=ABCD1234'));
 * // { suite: 'thorough', includeQuality: true, runs: 1, cooldownMinutes: 0, clearAfterRun: false }
 */
export function studyRunLock(presets: RunPresets): StudyRunLock {
  return {
    suite: presets.suite ?? 'quick',
    includeQuality: presets.includeQuality ?? false,
    runs: presets.runs ?? 1,
    cooldownMinutes: presets.cooldownMinutes ?? 0,
    clearAfterRun: presets.clearAfterRun ?? false,
  };
}

/** The settings of a finished run the completion rule compares with the link. */
export interface StudyRunSettings {
  suite: string;
  includeQuality: boolean;
}

/**
 * The suite and quality-fidelity setting a finished run actually used: its
 * `suite`, and whether it planned any quality cell (quality cells are planned
 * on every lane, skipped or not, whenever the lane is on).
 *
 * @param run - The run result.
 * @returns The run's settings.
 * @example
 * runSettingsOf(result); // { suite: 'standard', includeQuality: false }
 */
export function runSettingsOf(run: { suite: string; cells: readonly { workloadKind: string }[] }): StudyRunSettings {
  return { suite: run.suite, includeQuality: run.cells.some((c) => c.workloadKind.startsWith('quality-')) };
}

/**
 * Whether a finished run used the suite and the quality-fidelity setting
 * the study link names.
 *
 * @param run - The run's settings (see `runSettingsOf`).
 * @param link - The link's locked settings.
 * @returns True when both match.
 * @example
 * runMatchesStudyLink({ suite: 'standard', includeQuality: true }, studyRunLock({ suite: 'thorough', includeQuality: true })); // false
 */
export function runMatchesStudyLink(
  run: StudyRunSettings,
  link: Pick<StudyRunLock, 'suite' | 'includeQuality'>,
): boolean {
  return run.suite === link.suite && run.includeQuality === link.includeQuality;
}

/** Message shown in place of the code when a finished run does not match the link's suite or quality setting. */
export const SETTINGS_MISMATCH_MESSAGE =
  'This run did not use the suite and quality-fidelity setting this study link names, so no completion code is issued. Please message the researcher with a screenshot of this page.';

/** The note under the configuration panel of a paid-study link. */
export const STUDY_LOCK_NOTE = 'This study link fixes the suite and the run settings.';

/** A finished cell as the completion rule reads it. */
export interface CompletionCell {
  status: 'ok' | 'invalid' | 'error' | 'skipped';
  invalidReasons?: string[];
}

/**
 * Whether a finished suite attempted every cell it planned. A cell counts
 * when it ran (`ok`, `error`, `invalid`: failures are data) or when this
 * device cannot run its lane (a planned skip with the runtime's reason); a
 * lane the submitter switched off does not count, and neither does a missing
 * cell.
 *
 * @param cells - The cells of the run result.
 * @param plannedCount - The number of cells the suite planned.
 * @returns True when every planned cell was attempted.
 * @example
 * cellsAllAttempted(result.cells, result.cells.length);
 */
export function cellsAllAttempted(cells: readonly CompletionCell[], plannedCount: number): boolean {
  if (plannedCount <= 0 || cells.length !== plannedCount) return false;
  return cells.every(
    (c) => c.status !== 'skipped' || !(c.invalidReasons ?? []).includes(SUBMITTER_DISABLED_REASON),
  );
}

/** The upload state as the completion rule reads it. */
export type CompletionSubmitState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'done' }
  | { kind: 'failed'; retryAt?: number };

export interface CompletionInput {
  mode: CompletionMode;
  /** The suite reached its end and produced a result. */
  suiteEnded: boolean;
  /** Every planned cell was attempted (see `cellsAllAttempted`). */
  allCellsAttempted: boolean;
  submitState: CompletionSubmitState;
  /** The participant confirmed Stop during the run. */
  stoppedByUser: boolean;
  /** The run is the last run of its series (true outside a series). */
  lastRunOfSeries: boolean;
  /** The finished run's settings (see `runSettingsOf`), or null before a result exists. */
  runSettings: StudyRunSettings | null;
  /** The settings the study link fixes. */
  linkSettings: Pick<StudyRunLock, 'suite' | 'includeQuality'>;
}

/**
 * Whether the page shows the completion code. In both modes the finished
 * run must have used the suite and the quality-fidelity setting the link names.
 *
 * - `attempt`: once the suite ended and the upload attempt resolved (done or failed).
 * - `full`: only when the suite ended with every cell attempted, the upload
 *   succeeded, the participant did not stop the run, and, in a series, the run
 *   is the last one.
 *
 * @param input - The run's state.
 * @returns True when the code is shown.
 * @example
 * shouldIssueCompletionCode({ mode: 'full', suiteEnded: true, allCellsAttempted: true,
 *   submitState: { kind: 'done' }, stoppedByUser: false, lastRunOfSeries: true,
 *   runSettings: { suite: 'thorough', includeQuality: true },
 *   linkSettings: { suite: 'thorough', includeQuality: true } }); // true
 */
export function shouldIssueCompletionCode(input: CompletionInput): boolean {
  const { mode, suiteEnded, allCellsAttempted, submitState, stoppedByUser, lastRunOfSeries, runSettings, linkSettings } =
    input;
  if (!suiteEnded || stoppedByUser) return false;
  if (runSettings === null || !runMatchesStudyLink(runSettings, linkSettings)) return false;
  if (mode === 'attempt') return submitState.kind === 'done' || submitState.kind === 'failed';
  return allCellsAttempted && lastRunOfSeries && submitState.kind === 'done';
}

/**
 * Whether a finished run's upload has failed for good: failed with no
 * automatic resubmission scheduled (a rate limit schedules one).
 */
export function uploadFailedPermanently(submitState: CompletionSubmitState): boolean {
  return submitState.kind === 'failed' && submitState.retryAt === undefined;
}

/** The persisted attempt count of the run in progress on a `full`-mode study link. */
export interface StudyAttemptState {
  version: 1;
  /** The completion code of the link the count belongs to. */
  code: string;
  /** 1-based run of the series the count belongs to (1 outside a series). */
  runIndex: number;
  /** Attempts started for this run. */
  attempts: number;
  /** An attempt started and has not ended in the page (a reload or crash leaves it true). */
  inFlight: boolean;
  /** The run used up its attempts. */
  capped: boolean;
  /** The hardware answers the attempts reuse. */
  hardware: HardwareAnswers | null;
  /** The partial progress record (IndexedDB) of the attempt in flight, read after an interruption. */
  partialAttemptId?: string;
  /** The cell in progress when the previous attempt was interrupted, when known. */
  lastInterruptedCellId?: string;
  /** Why the run stopped restarting (set with `capped`). */
  capReason?: AttemptCapReason;
}

/**
 * Count a new attempt. The count continues for the same code and run, and
 * starts again at 1 for another code or another run of the series.
 */
export function beginStudyAttempt(
  state: StudyAttemptState | null,
  input: { code: string; runIndex: number; hardware: HardwareAnswers | null },
): StudyAttemptState {
  const same = state !== null && state.code === input.code && state.runIndex === input.runIndex;
  return {
    version: 1,
    code: input.code,
    runIndex: input.runIndex,
    attempts: same ? state.attempts + 1 : 1,
    inFlight: true,
    capped: false,
    hardware: input.hardware,
    ...(same && state.lastInterruptedCellId !== undefined ? { lastInterruptedCellId: state.lastInterruptedCellId } : {}),
  };
}

/**
 * What a page does with an interrupted attempt: start the next one, or stop.
 * It stops when the attempt was interrupted at the same cell as the previous
 * one (after two attempts at the least), and otherwise once the run used
 * MAX_RUN_ATTEMPTS. An unknown cell (no progress record, or the page died
 * between cells) never counts as the same cell.
 *
 * @param state - The count of the interrupted attempt.
 * @param cellId - The cell in progress when the attempt was interrupted, or null when unknown.
 * @returns The count to keep and the action.
 * @example
 * interruptStudyAttempt({ ...state, attempts: 2, lastInterruptedCellId: 'wllama/qwen/gen' }, 'wllama/qwen/gen').action; // 'capped'
 */
export function interruptStudyAttempt(
  state: StudyAttemptState,
  cellId: string | null = null,
): {
  state: StudyAttemptState;
  action: 'restart' | 'capped';
} {
  const { partialAttemptId: _done, ...rest } = state;
  const recorded: StudyAttemptState = { ...rest };
  if (cellId !== null) recorded.lastInterruptedCellId = cellId;
  else delete recorded.lastInterruptedCellId;
  if (cellId !== null && cellId === state.lastInterruptedCellId) {
    return { state: { ...recorded, inFlight: false, capped: true, capReason: 'same-cell' }, action: 'capped' };
  }
  if (state.attempts >= MAX_RUN_ATTEMPTS) {
    return { state: { ...recorded, inFlight: false, capped: true, capReason: 'attempts' }, action: 'capped' };
  }
  return { state: recorded, action: 'restart' };
}

/**
 * What a freshly loaded `full`-mode page does with the stored count. A count
 * for another code is dropped (the link changed); an attempt left in flight
 * was interrupted and restarts, or stops (see `interruptStudyAttempt`); a
 * capped run stays capped.
 *
 * @param state - The stored count.
 * @param code - The completion code of the link the page was opened with.
 * @param interruptedCellId - The cell the interrupted attempt's progress record names as in progress, or null.
 * @returns The count to keep (null to drop it) and the action.
 */
export function resolveStudyAttemptOnLoad(
  state: StudyAttemptState | null,
  code: string,
  interruptedCellId: string | null = null,
): { state: StudyAttemptState | null; action: 'none' | 'restart' | 'capped' } {
  if (state === null || state.code !== code) return { state: null, action: 'none' };
  if (state.capped) return { state, action: 'capped' };
  if (!state.inFlight) return { state, action: 'none' };
  return interruptStudyAttempt(state, interruptedCellId);
}

/**
 * Whether an automatic restart needs a click: WebKit grants the screen wake
 * lock only inside a user activation, Chromium and Gecko without one.
 */
export function restartNeedsActivation(webkit: boolean): boolean {
  return webkit;
}

/** "Attempt 2 of at most 4": a run interrupted twice in a row at the same cell stops earlier. */
export function attemptLabel(attempts: number): string {
  return `Attempt ${attempts} of at most ${MAX_RUN_ATTEMPTS}`;
}

/** How the overlay explains the restarts, after the attempt label. */
export const RESTART_POLICY_TEXT = `an interrupted run restarts by itself, up to ${MAX_AUTOMATIC_RESTARTS} times, and stops if it is interrupted twice in a row at the same step`;

/** Serialize for localStorage. */
export function serializeStudyAttempt(state: StudyAttemptState): string {
  return JSON.stringify(state);
}

/** Parse a stored count; anything malformed reads as none. */
export function parseStudyAttempt(raw: string | null): StudyAttemptState | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null) return null;
  const s = v as Record<string, unknown>;
  const isInt = (x: unknown, min: number) => typeof x === 'number' && Number.isInteger(x) && x >= min;
  if (s.version !== 1 || typeof s.code !== 'string' || !s.code) return null;
  if (!isInt(s.runIndex, 1) || !isInt(s.attempts, 1)) return null;
  if (typeof s.inFlight !== 'boolean' || typeof s.capped !== 'boolean') return null;
  const optionalString = (x: unknown) => x === undefined || (typeof x === 'string' && x.length > 0);
  if (!optionalString(s.partialAttemptId) || !optionalString(s.lastInterruptedCellId)) return null;
  if (s.capReason !== undefined && s.capReason !== 'attempts' && s.capReason !== 'same-cell') return null;
  let hardware: HardwareAnswers | null = null;
  if (s.hardware !== null && s.hardware !== undefined) {
    hardware = parseStoredHardware(JSON.stringify({ seriesId: s.code, answers: s.hardware }), s.code);
    if (hardware === null) return null;
  }
  return {
    version: 1,
    code: s.code,
    runIndex: s.runIndex as number,
    attempts: s.attempts as number,
    inFlight: s.inFlight,
    capped: s.capped,
    hardware,
    ...(s.partialAttemptId !== undefined ? { partialAttemptId: s.partialAttemptId as string } : {}),
    ...(s.lastInterruptedCellId !== undefined ? { lastInterruptedCellId: s.lastInterruptedCellId as string } : {}),
    ...(s.capReason !== undefined ? { capReason: s.capReason as AttemptCapReason } : {}),
  };
}

/** Read the stored count (null when absent, malformed, or storage is blocked). */
export function loadStudyAttempt(): StudyAttemptState | null {
  try {
    return parseStudyAttempt(localStorage.getItem(STUDY_ATTEMPTS_STORAGE_KEY));
  } catch {
    return null;
  }
}

/** Persist the count; returns false when storage is blocked (an interrupted run then cannot restart by itself). */
export function saveStudyAttempt(state: StudyAttemptState): boolean {
  try {
    localStorage.setItem(STUDY_ATTEMPTS_STORAGE_KEY, serializeStudyAttempt(state));
    return true;
  } catch {
    return false;
  }
}

/** Forget the stored count (the run finished, was stopped, or the link changed). */
export function clearStudyAttempt(): void {
  try {
    localStorage.removeItem(STUDY_ATTEMPTS_STORAGE_KEY);
  } catch {
    // Nothing stored.
  }
}
