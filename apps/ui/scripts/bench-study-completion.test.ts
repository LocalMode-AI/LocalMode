/**
 * The completion-code rule of a paid-study link on /bench/run: `attempt` mode
 * (the default, code after any resolved upload attempt) and `full` mode (code
 * only for a finished, uploaded run, with automatic restarts after an
 * interruption up to a cap, and a stop after two interruptions in a row at the
 * same cell). In both modes the link fixes the suite and the run settings,
 * and a run whose suite or quality-fidelity setting differs from the link's
 * gets no code. The pure decisions and the stored attempt count
 * are tested here; the page wiring (restart on reload, the Stop confirmation,
 * the cap and upload-failure messages) is covered by the bench e2e spec.
 */
import { describe, expect, it } from 'vitest';
import {
  ATTEMPT_CAP_MESSAGE,
  MAX_AUTOMATIC_RESTARTS,
  MAX_RUN_ATTEMPTS,
  MAX_SAME_CELL_ATTEMPTS,
  RESTART_POLICY_TEXT,
  SETTINGS_MISMATCH_MESSAGE,
  STUDY_LOCK_NOTE,
  attemptCapMessage,
  STUDY_ATTEMPTS_STORAGE_KEY,
  attemptLabel,
  beginStudyAttempt,
  cellsAllAttempted,
  interruptStudyAttempt,
  parseCompletionMode,
  parseStudyAttempt,
  resolveStudyAttemptOnLoad,
  restartNeedsActivation,
  runMatchesStudyLink,
  runSettingsOf,
  serializeStudyAttempt,
  shouldIssueCompletionCode,
  studyRunLock,
  uploadFailedPermanently,
  type CompletionInput,
  type StudyAttemptState,
} from '../src/lib/bench/study-completion';
import { EMBED_WORKLOADS, LLM_WORKLOADS, QUALITY_WORKLOADS } from '@localmode/bench';
import { SERIES_STORAGE_KEY, parseRunPresets } from '../src/lib/bench/series';
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
    runSettings: { suite: 'thorough', includeQuality: true },
    linkSettings: { suite: 'thorough', includeQuality: true },
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

  it('both modes: no code for a run whose suite differs from the link tier', () => {
    // A Thorough link, a Standard run that otherwise qualifies for the code.
    const standardRun = { suite: 'standard', includeQuality: true };
    expect(shouldIssueCompletionCode({ ...base, runSettings: standardRun })).toBe(false);
    expect(shouldIssueCompletionCode({ ...base, mode: 'attempt', runSettings: standardRun })).toBe(false);
    expect(shouldIssueCompletionCode({ ...base, mode: 'attempt', submitState: { kind: 'failed' }, runSettings: standardRun })).toBe(
      false,
    );
    expect(shouldIssueCompletionCode({ ...base, runSettings: { suite: 'quick', includeQuality: true } })).toBe(false);
  });

  it('both modes: no code for a run whose quality-fidelity setting differs from the link', () => {
    const noQuality = { suite: 'thorough', includeQuality: false };
    expect(shouldIssueCompletionCode({ ...base, runSettings: noQuality })).toBe(false);
    expect(shouldIssueCompletionCode({ ...base, mode: 'attempt', runSettings: noQuality })).toBe(false);
    // The reverse: a link with quality off and a run with it on.
    const offLink = { suite: 'thorough' as const, includeQuality: false };
    expect(shouldIssueCompletionCode({ ...base, linkSettings: offLink })).toBe(false);
    expect(shouldIssueCompletionCode({ ...base, linkSettings: offLink, runSettings: noQuality })).toBe(true);
  });

  it('no code without a run result to compare', () => {
    expect(shouldIssueCompletionCode({ ...base, runSettings: null })).toBe(false);
    expect(shouldIssueCompletionCode({ ...base, mode: 'attempt', runSettings: null })).toBe(false);
  });

  it('a permanent upload failure is a failure with no resubmission scheduled', () => {
    expect(uploadFailedPermanently({ kind: 'failed' })).toBe(true);
    expect(uploadFailedPermanently({ kind: 'failed', retryAt: 5 })).toBe(false);
    expect(uploadFailedPermanently({ kind: 'done' })).toBe(false);
    expect(uploadFailedPermanently({ kind: 'submitting' })).toBe(false);
  });
});

describe('the settings a study link fixes', () => {
  it('maps the link presets to the locked controls, defaults where the link is silent', () => {
    expect(studyRunLock(parseRunPresets('?tier=thorough&quality=on&runs=3&cooldown=2.5&cold=on&publish=on&cc=ABCD1234&ccmode=full'))).toEqual({
      suite: 'thorough',
      includeQuality: true,
      runs: 3,
      cooldownMinutes: 2.5,
      clearAfterRun: true,
    });
    // Nothing in the link: the values the controls start with on a plain visit.
    expect(studyRunLock(parseRunPresets('?PROLIFIC_PID=abc&cc=ABCD1234'))).toEqual({
      suite: 'quick',
      includeQuality: false,
      runs: 1,
      cooldownMinutes: 0,
      clearAfterRun: false,
    });
    // Unknown and out-of-range values are read as parseRunPresets reads them; publish is not locked.
    const lock = studyRunLock(parseRunPresets('?tier=custom&quality=maybe&runs=99&cooldown=45&publish=off'));
    expect(lock).toEqual({ suite: 'quick', includeQuality: false, runs: 30, cooldownMinutes: 30, clearAfterRun: false });
    expect(Object.keys(lock)).not.toContain('publish');
  });

  it('reads a finished run\'s suite and quality-fidelity setting from its cells', () => {
    const llm = LLM_WORKLOADS[0];
    const embed = EMBED_WORKLOADS[0];
    const withQuality = [llm, embed, QUALITY_WORKLOADS[0], QUALITY_WORKLOADS[2]].map((w) => ({ workloadKind: w.kind }));
    const without = [llm, embed].map((w) => ({ workloadKind: w.kind }));
    expect(runSettingsOf({ suite: 'standard', cells: withQuality })).toEqual({ suite: 'standard', includeQuality: true });
    expect(runSettingsOf({ suite: 'thorough', cells: without })).toEqual({ suite: 'thorough', includeQuality: false });
    // Only the STS cell (an embedding-only device still plans it): quality is on.
    expect(runSettingsOf({ suite: 'quick', cells: [{ workloadKind: QUALITY_WORKLOADS[2].kind }] }).includeQuality).toBe(true);
  });

  it('a run matches the link only when the suite and the quality setting both match', () => {
    const link = studyRunLock(parseRunPresets('?tier=thorough&quality=on'));
    expect(runMatchesStudyLink({ suite: 'thorough', includeQuality: true }, link)).toBe(true);
    expect(runMatchesStudyLink({ suite: 'standard', includeQuality: true }, link)).toBe(false);
    expect(runMatchesStudyLink({ suite: 'thorough', includeQuality: false }, link)).toBe(false);
    expect(runMatchesStudyLink({ suite: 'quick', includeQuality: false }, link)).toBe(false);
  });

  it('words the note and the mismatch message', () => {
    expect(STUDY_LOCK_NOTE).toBe('This study link fixes the suite and the run settings.');
    expect(SETTINGS_MISMATCH_MESSAGE).toBe(
      'This run did not use the suite and quality-fidelity setting this study link names, so no completion code is issued. Please message the researcher with a screenshot of this page.',
    );
  });
});

describe('the attempt count', () => {
  it('caps at 3 automatic restarts: 4 attempts per run', () => {
    expect(MAX_AUTOMATIC_RESTARTS).toBe(3);
    expect(MAX_RUN_ATTEMPTS).toBe(4);
    expect(ATTEMPT_CAP_MESSAGE).toBe(
      'The run could not finish after 4 attempts. Please message the researcher with a screenshot of this page; you are paid for the attempt.',
    );
    expect(attemptCapMessage(4)).toBe(ATTEMPT_CAP_MESSAGE);
    expect(attemptLabel(2)).toBe('Attempt 2 of at most 4');
    expect(RESTART_POLICY_TEXT).toBe(
      'an interrupted run restarts by itself, up to 3 times, and stops if it is interrupted twice in a row at the same step',
    );
  });

  it('says why a run stopped at the same cell', () => {
    expect(MAX_SAME_CELL_ATTEMPTS).toBe(2);
    expect(attemptCapMessage(2, 'same-cell')).toBe(
      'The run could not finish after 2 attempts: both stopped at the same step. Please message the researcher with a screenshot of this page; you are paid for the attempt.',
    );
    expect(attemptCapMessage(3, 'same-cell')).toBe(
      'The run could not finish after 3 attempts: the last two stopped at the same step. Please message the researcher with a screenshot of this page; you are paid for the attempt.',
    );
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

  /** Interrupt one attempt per cell id, reloading through storage each time, as the page does. */
  function interruptAt(cells: Array<string | null>) {
    let state: StudyAttemptState | null = null;
    const actions: string[] = [];
    for (const cell of cells) {
      state = beginStudyAttempt(state, { code: 'CODEA', runIndex: 1, hardware: HW });
      state = { ...state, partialAttemptId: `partial-${actions.length + 1}` };
      const resolved = resolveStudyAttemptOnLoad(parseStudyAttempt(serializeStudyAttempt(state)), 'CODEA', cell);
      actions.push(resolved.action);
      state = resolved.state;
      if (resolved.action === 'capped') break;
    }
    return { actions, state };
  }

  it('stops after the second attempt when both die at the same cell', () => {
    const { actions, state } = interruptAt(['wllama/gemma/gen', 'wllama/gemma/gen']);
    expect(actions).toEqual(['restart', 'capped']);
    expect(state).toMatchObject({ attempts: 2, inFlight: false, capped: true, capReason: 'same-cell', lastInterruptedCellId: 'wllama/gemma/gen' });
    expect(state?.partialAttemptId).toBeUndefined();
    expect(resolveStudyAttemptOnLoad(state, 'CODEA', null).action).toBe('capped');
  });

  it('keeps the cap of 3 restarts when every interruption is at another cell than the one before', () => {
    const alternating = interruptAt(['a/m/w1', 'a/m/w2', 'a/m/w1', 'a/m/w2']);
    expect(alternating.actions).toEqual(['restart', 'restart', 'restart', 'capped']);
    expect(alternating.state).toMatchObject({ attempts: 4, capped: true, capReason: 'attempts' });
    const distinct = interruptAt(['a/m/w1', 'b/m/w1', 'c/m/w1', 'd/m/w1']);
    expect(distinct.actions).toEqual(['restart', 'restart', 'restart', 'capped']);
  });

  it('stops at the first repeat in a row, whenever it comes', () => {
    const late = interruptAt(['a/m/w1', 'b/m/w1', 'b/m/w1']);
    expect(late.actions).toEqual(['restart', 'restart', 'capped']);
    expect(late.state).toMatchObject({ attempts: 3, capReason: 'same-cell' });
    expect(attemptCapMessage(late.state!.attempts, late.state!.capReason)).toContain('the last two stopped at the same step');
  });

  it('never matches an unknown cell (no progress record, or between cells)', () => {
    expect(interruptAt([null, null, null, null]).actions).toEqual(['restart', 'restart', 'restart', 'capped']);
    // An unknown cell in between breaks the run of repeats.
    expect(interruptAt(['a/m/w1', null, 'a/m/w1', null]).actions).toEqual(['restart', 'restart', 'restart', 'capped']);
  });

  it('a count for another run of the series forgets the cell', () => {
    const first = interruptAt(['a/m/w1']).state!;
    const nextRun = beginStudyAttempt(first, { code: 'CODEA', runIndex: 2, hardware: HW });
    expect(nextRun.lastInterruptedCellId).toBeUndefined();
    expect(resolveStudyAttemptOnLoad(nextRun, 'CODEA', 'a/m/w1').action).toBe('restart');
  });

  it('an in-page runner error restarts the same way', () => {
    const third = { ...beginStudyAttempt(null, { code: 'C0DE', runIndex: 1, hardware: null }), attempts: 3 };
    expect(interruptStudyAttempt(third).action).toBe('restart');
    expect(interruptStudyAttempt({ ...third, attempts: 4 })).toEqual({
      state: { ...third, attempts: 4, inFlight: false, capped: true, capReason: 'attempts' },
      action: 'capped',
    });
    // A runner error at the cell the previous attempt died at stops the run.
    expect(interruptStudyAttempt({ ...third, attempts: 2, lastInterruptedCellId: 'x/y/z' }, 'x/y/z')).toEqual({
      state: { ...third, attempts: 2, inFlight: false, capped: true, capReason: 'same-cell', lastInterruptedCellId: 'x/y/z' },
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
    const full: StudyAttemptState = { ...state, partialAttemptId: 'p-1', lastInterruptedCellId: 'a/b/c', capped: true, capReason: 'same-cell' };
    expect(parseStudyAttempt(serializeStudyAttempt(full))).toEqual(full);
    expect(parseStudyAttempt(JSON.stringify({ ...state, capReason: 'other' }))).toBeNull();
    expect(parseStudyAttempt(JSON.stringify({ ...state, lastInterruptedCellId: '' }))).toBeNull();
    expect(parseStudyAttempt(JSON.stringify({ ...state, partialAttemptId: 5 }))).toBeNull();
  });

  it('restarts need a click only where the wake lock needs one (WebKit)', () => {
    expect(restartNeedsActivation(false)).toBe(false);
    expect(restartNeedsActivation(true)).toBe(true);
  });
});
