/**
 * The /bench/run series: N consecutive runs with the same settings, one fresh
 * page load per run. The state lives in localStorage between reloads, so the
 * transitions that decide what a reloaded page does (start the next run,
 * pause after a run that never recorded, finish, stop) are pure functions
 * tested here; the page wiring is covered by the bench e2e spec.
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_SERIES_RUNS,
  continueSeries,
  createSeries,
  currentRunIndex,
  markRunStarted,
  parseRunPresets,
  parseSeriesState,
  presetQuery,
  recordRunFailed,
  recordRunFinished,
  requestStop,
  resolveSeriesOnLoad,
  serializeSeriesState,
  seriesEtaMs,
  seriesSummaryText,
  seriesTitle,
  type SeriesSettings,
  type SeriesState,
} from '../src/lib/bench/series';

const settings: SeriesSettings = {
  suite: 'thorough',
  includeQuality: true,
  publish: true,
  clearAfterRun: false,
  disabledLanes: ['webllm/smollm2-135m'],
};
const T0 = Date.parse('2026-09-23T10:00:00.000Z');

function fresh(count = 3): SeriesState {
  return createSeries({ seriesId: 'series-1', count, settings, now: T0 });
}

function finishRun(state: SeriesState, runId: string, durationMs: number, now = T0): SeriesState {
  return recordRunFinished(markRunStarted(state), { runId, durationMs, outcome: 'published', rawUrl: `https://x/${runId}.json` }, now);
}

describe('series transitions', () => {
  it('starts running at run 1 with nothing in flight', () => {
    const s = fresh();
    expect(s.status).toBe('running');
    expect(currentRunIndex(s)).toBe(1);
    expect(s.inFlightIndex).toBeNull();
    expect(s.startedAt).toBe('2026-09-23T10:00:00.000Z');
  });

  it('records each finished run with its index and moves to the next one', () => {
    const s = finishRun(fresh(), 'run-a', 60_000);
    expect(s.completed).toEqual([
      { index: 1, runId: 'run-a', durationMs: 60_000, outcome: 'published', rawUrl: 'https://x/run-a.json' },
    ]);
    expect(s.inFlightIndex).toBeNull();
    expect(s.status).toBe('running');
    expect(currentRunIndex(s)).toBe(2);
  });

  it('completes after the last run', () => {
    let s = fresh(2);
    s = finishRun(s, 'run-a', 1_000);
    s = finishRun(s, 'run-b', 1_000, T0 + 5_000);
    expect(s.status).toBe('complete');
    expect(s.endedAt).toBe('2026-09-23T10:00:05.000Z');
    expect(resolveSeriesOnLoad(s).action).toBe('show');
  });

  it('stop during a run lets that run finish, then ends the series with only the finished runs', () => {
    let s = markRunStarted(fresh(3));
    s = requestStop(s, { runInProgress: true, now: T0 });
    expect(s.status).toBe('running');
    expect(s.stopRequested).toBe(true);
    s = recordRunFinished(s, { runId: 'run-a', durationMs: 5, outcome: 'exported' }, T0 + 10);
    expect(s.status).toBe('stopped');
    expect(s.completed.map((r) => r.runId)).toEqual(['run-a']);
    expect(resolveSeriesOnLoad(s).action).toBe('show');
  });

  it('stop while idle cancels the remaining runs at once', () => {
    const s = requestStop(finishRun(fresh(3), 'run-a', 5), { runInProgress: false, now: T0 + 1 });
    expect(s.status).toBe('stopped');
    expect(s.completed).toHaveLength(1);
  });

  it('a failed run pauses the series without recording it, and Continue retries the same index', () => {
    let s = finishRun(fresh(3), 'run-a', 5);
    s = recordRunFailed(markRunStarted(s), 'Benchmark failed: out of memory');
    expect(s.status).toBe('paused');
    expect(s.pauseReason).toMatch(/run 2 of 3.*out of memory/i);
    expect(s.inFlightIndex).toBeNull();
    expect(resolveSeriesOnLoad(s).action).toBe('show');
    s = continueSeries(s);
    expect(s.status).toBe('running');
    expect(s.pauseReason).toBeUndefined();
    expect(currentRunIndex(s)).toBe(2);
  });

  it('a page that reloads with a run still in flight pauses instead of looping', () => {
    const crashed = markRunStarted(finishRun(fresh(3), 'run-a', 5));
    const { state, action } = resolveSeriesOnLoad(crashed);
    expect(action).toBe('show');
    expect(state.status).toBe('paused');
    expect(state.inFlightIndex).toBeNull();
    expect(state.pauseReason).toMatch(/run 2 of 3 did not finish/i);
    // Resolving the paused state again changes nothing: no automatic restart.
    expect(resolveSeriesOnLoad(state)).toEqual({ state, action: 'show' });
  });

  it('a running series with nothing in flight starts its next run on load', () => {
    const s = finishRun(fresh(3), 'run-a', 5);
    expect(resolveSeriesOnLoad(s)).toEqual({ state: s, action: 'start-next' });
  });

  it('a pending stop found on load ends the series instead of starting a run', () => {
    const s = { ...finishRun(fresh(3), 'run-a', 5), stopRequested: true };
    const { state, action } = resolveSeriesOnLoad(s);
    expect(action).toBe('show');
    expect(state.status).toBe('stopped');
  });
});

describe('series read-outs', () => {
  it('estimates the remaining time from the mean of completed run durations', () => {
    expect(seriesEtaMs(fresh(4))).toBeNull();
    let s = finishRun(fresh(4), 'a', 60_000);
    s = finishRun(s, 'b', 120_000);
    expect(seriesEtaMs(s)).toBe(2 * 90_000);
  });

  it('puts the progress in the title so a background tab shows it', () => {
    let s = fresh(10);
    expect(seriesTitle(s)).toBe('1/10 · LocalMode Bench');
    s = finishRun(finishRun(s, 'a', 1), 'b', 1);
    expect(seriesTitle(s)).toBe('3/10 · LocalMode Bench');
    expect(seriesTitle(recordRunFailed(markRunStarted(s), 'x'))).toBe('Paused 2/10 · LocalMode Bench');
    expect(seriesTitle({ ...s, status: 'complete' })).toBe('Done 2/10 · LocalMode Bench');
    expect(seriesTitle({ ...s, status: 'stopped' })).toBe('Stopped 2/10 · LocalMode Bench');
  });

  it('summarizes the series with run ids and raw links for pasting', () => {
    let s = finishRun(fresh(2), 'run-a', 65_000);
    s = recordRunFinished(markRunStarted(s), { runId: 'run-b', durationMs: 5_000, outcome: 'exported' }, T0);
    const text = seriesSummaryText(s);
    expect(text.split('\n')).toEqual([
      'LocalMode Bench series series-1 · thorough suite · quality on · publish on · clear caches after each run off',
      '2 of 2 runs · complete · started 2026-09-23T10:00:00.000Z',
      '1. run-a · 1 m 5 s · https://x/run-a.json',
      '2. run-b · 5 s · exported as JSON (not published)',
    ]);
  });
});

describe('series persistence', () => {
  it('round-trips through its serialized form', () => {
    const s = finishRun(fresh(3), 'run-a', 5);
    expect(parseSeriesState(serializeSeriesState(s))).toEqual(s);
  });

  it.each([
    ['null', null],
    ['not JSON', '{'],
    ['wrong version', JSON.stringify({ ...fresh(), version: 2 })],
    ['count above the maximum', JSON.stringify({ ...fresh(), count: MAX_SERIES_RUNS + 1 })],
    ['unknown suite', JSON.stringify({ ...fresh(), settings: { ...settings, suite: 'custom' } })],
    ['unknown status', JSON.stringify({ ...fresh(), status: 'looping' })],
    ['completed not an array', JSON.stringify({ ...fresh(), completed: {} })],
  ])('rejects a stored value that is %s', (_label, raw) => {
    expect(parseSeriesState(raw)).toBeNull();
  });
});

describe('URL presets', () => {
  it('reads every documented parameter', () => {
    expect(parseRunPresets('?tier=thorough&quality=on&runs=30&cold=on&publish=off')).toEqual({
      suite: 'thorough',
      includeQuality: true,
      runs: 30,
      clearAfterRun: true,
      publish: false,
    });
    expect(parseRunPresets('tier=quick&quality=off&runs=1&cold=off&publish=on')).toEqual({
      suite: 'quick',
      includeQuality: false,
      runs: 1,
      clearAfterRun: false,
      publish: true,
    });
  });

  it('clamps runs to 1..30 and ignores values it does not understand', () => {
    expect(parseRunPresets('?runs=99')).toEqual({ runs: MAX_SERIES_RUNS });
    expect(parseRunPresets('?runs=0')).toEqual({ runs: 1 });
    expect(parseRunPresets('?runs=2.5&tier=custom&quality=maybe&cold=&publish=yes')).toEqual({});
    expect(parseRunPresets('')).toEqual({});
  });

  it('never carries an instruction to start: only settings come out', () => {
    expect(Object.keys(parseRunPresets('?tier=quick&start=1&autorun=on&runs=3'))).toEqual(['suite', 'runs']);
  });

  it('builds the query string it parses', () => {
    const q = presetQuery({ suite: 'standard', includeQuality: false, runs: 10, clearAfterRun: true, publish: true });
    expect(q).toBe('tier=standard&quality=off&runs=10&cold=on&publish=on');
    expect(parseRunPresets(q)).toEqual({ suite: 'standard', includeQuality: false, runs: 10, clearAfterRun: true, publish: true });
  });
});
