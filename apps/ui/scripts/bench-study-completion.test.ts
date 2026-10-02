/**
 * The completion-code rule of a paid-study link on /bench/run: `attempt` mode
 * (the default, code after any resolved upload attempt) and `full` mode (code
 * only for a finished, uploaded run, with automatic restarts after an
 * interruption up to a cap). The pure decisions and the stored attempt count
 * are tested here; the page wiring (restart on reload, the Stop confirmation,
 * the cap and upload-failure messages) is covered by the bench e2e spec.
 */
import { describe, expect, it } from 'vitest';
import {
  ATTEMPT_CAP_MESSAGE,
  MAX_AUTOMATIC_RESTARTS,
  MAX_RUN_ATTEMPTS,
  STUDY_ATTEMPTS_STORAGE_KEY,
  attemptLabel,
  beginStudyAttempt,
  cellsAllAttempted,
  interruptStudyAttempt,
  parseCompletionMode,
  parseStudyAttempt,
  resolveStudyAttemptOnLoad,
  restartNeedsActivation,
  serializeStudyAttempt,
  shouldIssueCompletionCode,
  uploadFailedPermanently,
  type CompletionInput,
  type StudyAttemptState,
} from '../src/lib/bench/study-completion';
import { SERIES_STORAGE_KEY } from '../src/lib/bench/series';
import type { HardwareAnswers } from '../src/lib/bench/study-hardware';

const HW: HardwareAnswers = { gpu: 'NVIDIA GeForce RTX 4060', chassis: 'desktop', ram: '32', otherApps: 'no' };

describe('parseCompletionMode', () => {
  it('reads ccmode=full and defaults to attempt for anything else', () => {
    expect(parseCompletionMode('?tier=thorough&cc=ABCD1234&ccmode=full')).toBe('full');
    expect(parseCompletionMode('ccmode=full')).toBe('full');
    expect(parseCompletionMode('?cc=ABCD1234')).toBe('attempt');
    expect(parseCompletionMode('?ccmode=attempt')).toBe('attempt');
    expect(parseCompletionMode('?ccmode=FULL')).toBe('attempt');
    expect(parseCompletionMode('')).toBe('attempt');
  });
});

describe('cellsAllAttempted', () => {
  const ok = { status: 'ok' as const };
  it('counts ok, error and invalid cells and device skips', () => {
    expect(
      cellsAllAttempted(
        [
          ok,
          { status: 'error' },
          { status: 'invalid', invalidReasons: ['tab hidden'] },
          { status: 'skipped', invalidReasons: ['runtime unavailable: no WebGPU'] },
        ],
        4,
      ),
    ).toBe(true);
  });
  it('refuses a lane the submitter switched off, a missing cell, or an empty plan', () => {
    expect(cellsAllAttempted([ok, { status: 'skipped', invalidReasons: ['lane disabled by the submitter'] }], 2)).toBe(false);
    expect(cellsAllAttempted([ok], 2)).toBe(false);
    expect(cellsAllAttempted([], 0)).toBe(false);
  });
});

describe('shouldIssueCompletionCode', () => {
  const base: CompletionInput = {
    mode: 'full',
    suiteEnded: true,
    allCellsAttempted: true,
    submitState: { kind: 'done' },
    stoppedByUser: false,
    lastRunOfSeries: true,
  };

  it('attempt mode: after any resolved upload attempt of a finished suite (unchanged rule)', () => {
    const attempt = { ...base, mode: 'attempt' as const };
    expect(shouldIssueCompletionCode(attempt)).toBe(true);
    expect(shouldIssueCompletionCode({ ...attempt, submitState: { kind: 'failed' } })).toBe(true);
    expect(shouldIssueCompletionCode({ ...attempt, submitState: { kind: 'failed', retryAt: 1 } })).toBe(true);
    expect(shouldIssueCompletionCode({ ...attempt, submitState: { kind: 'submitting' } })).toBe(false);
    expect(shouldIssueCompletionCode({ ...attempt, submitState: { kind: 'idle' } })).toBe(false);
    expect(shouldIssueCompletionCode({ ...attempt, suiteEnded: false })).toBe(false);
    // Attempt mode does not look at the cells or the series place.
    expect(shouldIssueCompletionCode({ ...attempt, allCellsAttempted: false, lastRunOfSeries: false })).toBe(true);
  });

  it('full mode: only a finished, fully attempted, uploaded last run', () => {
    expect(shouldIssueCompletionCode(base)).toBe(true);
    expect(shouldIssueCompletionCode({ ...base, suiteEnded: false })).toBe(false);
    expect(shouldIssueCompletionCode({ ...base, allCellsAttempted: false })).toBe(false);
    expect(shouldIssueCompletionCode({ ...base, stoppedByUser: true })).toBe(false);
    expect(shouldIssueCompletionCode({ ...base, lastRunOfSeries: false })).toBe(false);
    for (const submitState of [
      { kind: 'idle' as const },
      { kind: 'submitting' as const },
      { kind: 'failed' as const },
      { kind: 'failed' as const, retryAt: 123 },
    ]) {
      expect(shouldIssueCompletionCode({ ...base, submitState })).toBe(false);
    }
  });

  it('a permanent upload failure is a failure with no resubmission scheduled', () => {
    expect(uploadFailedPermanently({ kind: 'failed' })).toBe(true);
    expect(uploadFailedPermanently({ kind: 'failed', retryAt: 5 })).toBe(false);
    expect(uploadFailedPermanently({ kind: 'done' })).toBe(false);
    expect(uploadFailedPermanently({ kind: 'submitting' })).toBe(false);
  });
});

describe('the attempt count', () => {
  it('caps at 3 automatic restarts: 4 attempts per run', () => {
    expect(MAX_AUTOMATIC_RESTARTS).toBe(3);
    expect(MAX_RUN_ATTEMPTS).toBe(4);
    expect(ATTEMPT_CAP_MESSAGE).toBe(
      'The run could not finish after 4 attempts. Please message the researcher with a screenshot of this page; you are paid for the attempt.',
    );
    expect(attemptLabel(2)).toBe('Attempt 2 of 4');
  });

  it('lives beside the series state in localStorage', () => {
    expect(STUDY_ATTEMPTS_STORAGE_KEY.startsWith(SERIES_STORAGE_KEY)).toBe(true);
    expect(STUDY_ATTEMPTS_STORAGE_KEY).toBe('localmode-bench-series-attempts');
  });

  it('counts attempts of one run and starts again for another code or run', () => {
    const first = beginStudyAttempt(null, { code: 'CODEA', runIndex: 1, hardware: HW });
    expect(first).toEqual({ version: 1, code: 'CODEA', runIndex: 1, attempts: 1, inFlight: true, capped: false, hardware: HW });
    const second = beginStudyAttempt(first, { code: 'CODEA', runIndex: 1, hardware: HW });
    expect(second.attempts).toBe(2);
    expect(beginStudyAttempt(second, { code: 'CODEB', runIndex: 1, hardware: HW }).attempts).toBe(1);
    expect(beginStudyAttempt(second, { code: 'CODEA', runIndex: 2, hardware: HW }).attempts).toBe(1);
  });

  it('restarts an interrupted attempt until the fourth, then caps', () => {
    let state: StudyAttemptState | null = null;
    const actions: string[] = [];
    for (let i = 0; i < 4; i++) {
      state = beginStudyAttempt(state, { code: 'CODEA', runIndex: 1, hardware: HW });
      // The page goes away mid-run; the next load reads what was stored.
      const loaded = parseStudyAttempt(serializeStudyAttempt(state));
      const resolved = resolveStudyAttemptOnLoad(loaded, 'CODEA');
      actions.push(resolved.action);
      state = resolved.state;
    }
    expect(actions).toEqual(['restart', 'restart', 'restart', 'capped']);
    expect(state).toMatchObject({ attempts: 4, inFlight: false, capped: true });
    // A capped run stays capped on every later load of the same link.
    expect(resolveStudyAttemptOnLoad(state, 'CODEA').action).toBe('capped');
  });

  it('an in-page runner error restarts the same way', () => {
    const third = { ...beginStudyAttempt(null, { code: 'C0DE', runIndex: 1, hardware: null }), attempts: 3 };
    expect(interruptStudyAttempt(third).action).toBe('restart');
    expect(interruptStudyAttempt({ ...third, attempts: 4 })).toEqual({
      state: { ...third, attempts: 4, inFlight: false, capped: true },
      action: 'capped',
    });
  });

  it('a different code drops the count; a settled count does nothing', () => {
    const stored = beginStudyAttempt(null, { code: 'CODEA', runIndex: 1, hardware: HW });
    expect(resolveStudyAttemptOnLoad(stored, 'CODEB')).toEqual({ state: null, action: 'none' });
    expect(resolveStudyAttemptOnLoad(null, 'CODEA')).toEqual({ state: null, action: 'none' });
    expect(resolveStudyAttemptOnLoad({ ...stored, inFlight: false }, 'CODEA').action).toBe('none');
  });

  it('round-trips through storage and rejects malformed records', () => {
    const state = beginStudyAttempt(null, { code: 'CODEA', runIndex: 3, hardware: HW });
    expect(parseStudyAttempt(serializeStudyAttempt(state))).toEqual(state);
    expect(parseStudyAttempt(serializeStudyAttempt({ ...state, hardware: null }))).toEqual({ ...state, hardware: null });
    expect(parseStudyAttempt(null)).toBeNull();
    expect(parseStudyAttempt('not json')).toBeNull();
    expect(parseStudyAttempt(JSON.stringify({ ...state, version: 2 }))).toBeNull();
    expect(parseStudyAttempt(JSON.stringify({ ...state, attempts: 0 }))).toBeNull();
    expect(parseStudyAttempt(JSON.stringify({ ...state, inFlight: 'yes' }))).toBeNull();
    expect(parseStudyAttempt(JSON.stringify({ ...state, hardware: { ...HW, chassis: 'tablet' } }))).toBeNull();
  });

  it('restarts need a click only where the wake lock needs one (WebKit)', () => {
    expect(restartNeedsActivation(false)).toBe(false);
    expect(restartNeedsActivation(true)).toBe(true);
  });
});
