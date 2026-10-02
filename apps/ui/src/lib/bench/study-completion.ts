/**
 * When a paid-study link issues its completion code. A link's `ccmode`
 * parameter picks the rule: `attempt` (the default) shows the code once a
 * finished run's upload attempt has resolved, whether it went through or not;
 * `full` shows it only for a run that finished with every cell attempted and
 * uploaded. In `full` mode an interrupted run (a reload, a crash, a closed
 * tab, a runner error) restarts by itself on the next page load, at most
 * MAX_AUTOMATIC_RESTARTS times per run; the attempt count lives in
 * localStorage beside the series state. Everything in this module is pure
 * except the localStorage helpers at the bottom, which never throw.
 */
import { parseStoredHardware, type HardwareAnswers } from './study-hardware';

export type CompletionMode = 'attempt' | 'full';

/** Automatic restarts of one run after its first attempt. */
export const MAX_AUTOMATIC_RESTARTS = 3;

/** Attempts one run gets in `full` mode: the first plus the automatic restarts. */
export const MAX_RUN_ATTEMPTS = MAX_AUTOMATIC_RESTARTS + 1;

/** localStorage key of the attempt count (a sibling of the series state). */
export const STUDY_ATTEMPTS_STORAGE_KEY = 'localmode-bench-series-attempts';

/** Skip reason the runner gives a lane the submitter switched off. */
const SUBMITTER_DISABLED_REASON = 'lane disabled by the submitter';

/** Message shown in place of the code once a run used up its attempts. */
export const ATTEMPT_CAP_MESSAGE = `The run could not finish after ${MAX_RUN_ATTEMPTS} attempts. Please message the researcher with a screenshot of this page; you are paid for the attempt.`;

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
}

/**
 * Whether the page shows the completion code.
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
 *   submitState: { kind: 'done' }, stoppedByUser: false, lastRunOfSeries: true }); // true
 */
export function shouldIssueCompletionCode(input: CompletionInput): boolean {
  const { mode, suiteEnded, allCellsAttempted, submitState, stoppedByUser, lastRunOfSeries } = input;
  if (!suiteEnded || stoppedByUser) return false;
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
  };
}

/** What a page does with an interrupted attempt: start the next one, or stop at the cap. */
export function interruptStudyAttempt(state: StudyAttemptState): {
  state: StudyAttemptState;
  action: 'restart' | 'capped';
} {
  if (state.attempts >= MAX_RUN_ATTEMPTS) return { state: { ...state, inFlight: false, capped: true }, action: 'capped' };
  return { state, action: 'restart' };
}

/**
 * What a freshly loaded `full`-mode page does with the stored count. A count
 * for another code is dropped (the link changed); an attempt left in flight
 * was interrupted and restarts, or stops at the cap; a capped run stays capped.
 *
 * @param state - The stored count.
 * @param code - The completion code of the link the page was opened with.
 * @returns The count to keep (null to drop it) and the action.
 */
export function resolveStudyAttemptOnLoad(
  state: StudyAttemptState | null,
  code: string,
): { state: StudyAttemptState | null; action: 'none' | 'restart' | 'capped' } {
  if (state === null || state.code !== code) return { state: null, action: 'none' };
  if (state.capped) return { state, action: 'capped' };
  if (!state.inFlight) return { state, action: 'none' };
  return interruptStudyAttempt(state);
}

/**
 * Whether an automatic restart needs a click: WebKit grants the screen wake
 * lock only inside a user activation, Chromium and Gecko without one.
 */
export function restartNeedsActivation(webkit: boolean): boolean {
  return webkit;
}

/** "Attempt 2 of 4". */
export function attemptLabel(attempts: number): string {
  return `Attempt ${attempts} of ${MAX_RUN_ATTEMPTS}`;
}

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
