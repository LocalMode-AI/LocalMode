/**
 * The /bench/run series: N consecutive runs with the same settings, one fresh
 * page load per run. The state lives in localStorage between reloads, so the
 * transitions that decide what a reloaded page does (start the next run,
 * pause after a run that never recorded, finish, stop) are pure functions
 * tested here; the page wiring is covered by the bench e2e spec.
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_COOLDOWN_MINUTES,
  MAX_SERIES_RUNS,
  clampCooldownMinutes,
  continueSeries,
  cooldownRemainingMs,
  cooldownStatusText,
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
  seriesHarness,
  seriesSummaryText,
  startCooldown,
  seriesTitle,
  type SeriesSettings,
  type SeriesState,
} from '../src/lib/bench/series';

const settings: SeriesSettings = {
  suite: 'thorough',
  includeQuality: true,
  publish: true,
  clearAfterRun: false,
  cooldownMs: 0,
  disabledLanes: ['webllm/smollm2-135m'],
};
const T0 = Date.parse('2026-09-23T10:00:00.000Z');

function fresh(count = 3): SeriesState {
  return createSeries({ seriesId: 'series-1', count, settings, now: T0 });
}

function finishRun(state: SeriesState, runId: string, durationMs: number, now = T0): SeriesState {
  return recordRunFinished(markRunStarted(state, now), { runId, durationMs, outcome: 'published', rawUrl: `https://x/${runId}.json` }, now);
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
    let s = markRunStarted(fresh(3), T0);
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
    s = recordRunFailed(markRunStarted(s, T0), 'Benchmark failed: out of memory');
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
    const crashed = markRunStarted(finishRun(fresh(3), 'run-a', 5), T0);
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
    expect(seriesEtaMs(fresh(4), T0)).toBeNull();
    let s = finishRun(fresh(4), 'a', 60_000);
    s = finishRun(s, 'b', 120_000);
    expect(seriesEtaMs(s, T0)).toBe(2 * 90_000);
  });

  it('puts the progress in the title so a background tab shows it', () => {
    let s = fresh(10);
    expect(seriesTitle(s)).toBe('1/10 · LocalMode Bench');
    s = finishRun(finishRun(s, 'a', 1), 'b', 1);
    expect(seriesTitle(s)).toBe('3/10 · LocalMode Bench');
    expect(seriesTitle(recordRunFailed(markRunStarted(s, T0), 'x'))).toBe('Paused 2/10 · LocalMode Bench');
    expect(seriesTitle({ ...s, status: 'complete' })).toBe('Done 2/10 · LocalMode Bench');
    expect(seriesTitle({ ...s, status: 'stopped' })).toBe('Stopped 2/10 · LocalMode Bench');
  });

  it('summarizes the series with run ids and raw links for pasting', () => {
    let s = finishRun(fresh(2), 'run-a', 65_000);
    s = recordRunFinished(markRunStarted(s, T0), { runId: 'run-b', durationMs: 5_000, outcome: 'exported' }, T0);
    const text = seriesSummaryText(s);
    expect(text.split('\n')).toEqual([
      'LocalMode Bench series series-1 · thorough suite · quality on · publish on · clear caches after each run off · cool-down 0 min',
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
    expect(parseRunPresets('?tier=thorough&quality=on&runs=30&cooldown=2.5&cold=on&publish=off')).toEqual({
      suite: 'thorough',
      includeQuality: true,
      runs: 30,
      cooldownMinutes: 2.5,
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

  it('clamps cooldown to 0..30 minutes in half-minute steps and ignores what is not a number', () => {
    expect(parseRunPresets('?cooldown=45')).toEqual({ cooldownMinutes: MAX_COOLDOWN_MINUTES });
    expect(parseRunPresets('?cooldown=0')).toEqual({ cooldownMinutes: 0 });
    expect(parseRunPresets('?cooldown=1.2')).toEqual({ cooldownMinutes: 1 });
    expect(parseRunPresets('?cooldown=1.3')).toEqual({ cooldownMinutes: 1.5 });
    expect(parseRunPresets('?cooldown=-1&runs=2')).toEqual({ runs: 2 });
    expect(parseRunPresets('?cooldown=abc')).toEqual({});
    expect(parseRunPresets('?cooldown=')).toEqual({});
    expect(parseRunPresets('?cooldown=1e3')).toEqual({});
  });

  it('never carries an instruction to start: only settings come out', () => {
    expect(Object.keys(parseRunPresets('?tier=quick&start=1&autorun=on&runs=3'))).toEqual(['suite', 'runs']);
  });

  it('builds the query string it parses', () => {
    const q = presetQuery({
      suite: 'standard',
      includeQuality: false,
      runs: 10,
      cooldownMinutes: 1.5,
      clearAfterRun: true,
      publish: true,
    });
    expect(q).toBe('tier=standard&quality=off&runs=10&cooldown=1.5&cold=on&publish=on');
    expect(parseRunPresets(q)).toEqual({
      suite: 'standard',
      includeQuality: false,
      runs: 10,
      cooldownMinutes: 1.5,
      clearAfterRun: true,
      publish: true,
    });
  });
});

describe('cool-down between runs', () => {
  const cooling = (count = 10, cooldownMs = 180_000): SeriesState =>
    createSeries({ seriesId: 'series-c', count, settings: { ...settings, cooldownMs }, now: T0 });

  it('clamps the minutes input to 0..30 in half-minute steps', () => {
    expect(clampCooldownMinutes(Number.NaN)).toBe(0);
    expect(clampCooldownMinutes(-3)).toBe(0);
    expect(clampCooldownMinutes(0.2)).toBe(0);
    expect(clampCooldownMinutes(0.25)).toBe(0.5);
    expect(clampCooldownMinutes(2.74)).toBe(2.5);
    expect(clampCooldownMinutes(31)).toBe(30);
  });

  it('keeps the cool-down in the persisted settings', () => {
    const s = cooling(3, 90_000);
    expect(s.settings.cooldownMs).toBe(90_000);
    expect(parseSeriesState(serializeSeriesState(s))?.settings.cooldownMs).toBe(90_000);
  });

  it('reads a series stored before the cool-down existed as a zero cool-down', () => {
    const { cooldownMs: _absent, ...oldSettings } = settings;
    const stored = JSON.stringify({ ...fresh(3), settings: oldSettings });
    expect(parseSeriesState(stored)?.settings.cooldownMs).toBe(0);
  });

  it.each([
    ['negative', -1],
    ['over 30 minutes', 30 * 60_000 + 1],
    ['fractional', 1.5],
    ['a string', '60000'],
  ])('rejects a stored cool-down that is %s', (_label, cooldownMs) => {
    expect(parseSeriesState(JSON.stringify({ ...fresh(3), settings: { ...settings, cooldownMs } }))).toBeNull();
  });

  it('counts down to the next run after a finished run and shows it as m:ss', () => {
    // Run 3 finishes at T0 + 1 s: the countdown targets run 4 at T0 + 1 s + 3 min.
    let s = cooling(10);
    s = finishRun(s, 'a', 5);
    s = finishRun(s, 'b', 5);
    s = finishRun(s, 'c', 5, T0 + 1_000);
    s = startCooldown(s, T0 + 1_000);
    expect(s.cooldownUntil).toBe(T0 + 181_000);
    expect(s.idleSince).toBe(T0 + 1_000);
    expect(cooldownRemainingMs(s, T0 + 1_000)).toBe(180_000);
    expect(cooldownRemainingMs(s, T0 + 16_000)).toBe(165_000);
    expect(cooldownStatusText(s, T0 + 16_000)).toBe('Cooling down: 2:45 until run 4 of 10');
    // A partial second rounds up, so the read-out never shows 0:00 while waiting.
    expect(cooldownStatusText(s, T0 + 180_500)).toBe('Cooling down: 0:01 until run 4 of 10');
    expect(cooldownRemainingMs(s, T0 + 181_000)).toBe(0);
    expect(cooldownStatusText(s, T0 + 181_000)).toBeNull();
    expect(cooldownRemainingMs(s, T0 + 999_000)).toBe(0);
  });

  it('a zero cool-down still starts the idle clock but never counts down', () => {
    const s = startCooldown(finishRun(cooling(3, 0), 'a', 5), T0 + 10);
    expect(s.idleSince).toBe(T0 + 10);
    expect(cooldownRemainingMs(s, T0 + 10)).toBe(0);
    expect(cooldownStatusText(s, T0 + 10)).toBeNull();
  });

  it('stop during the cool-down cancels the remaining runs at once', () => {
    const s = startCooldown(finishRun(cooling(10), 'a', 5), T0);
    // No run is in flight while cooling down, so the stop is immediate.
    expect(s.inFlightIndex).toBeNull();
    const stopped = requestStop(s, { runInProgress: s.inFlightIndex !== null, now: T0 + 30_000 });
    expect(stopped.status).toBe('stopped');
    expect(stopped.endedAt).toBe('2026-09-23T10:00:30.000Z');
    expect(stopped.cooldownUntil).toBeUndefined();
    expect(stopped.idleSince).toBeUndefined();
    expect(cooldownRemainingMs(stopped, T0 + 30_000)).toBe(0);
    expect(cooldownStatusText(stopped, T0 + 30_000)).toBeNull();
    expect(resolveSeriesOnLoad(stopped).action).toBe('show');
    expect(stopped.completed).toHaveLength(1);
  });

  it('a page reloaded during the cool-down keeps the countdown target', () => {
    const s = startCooldown(finishRun(cooling(3, 60_000), 'a', 5), T0);
    const { state, action } = resolveSeriesOnLoad(parseSeriesState(serializeSeriesState(s))!);
    expect(action).toBe('start-next');
    expect(cooldownRemainingMs(state, T0 + 20_000)).toBe(40_000);
  });

  it('measures the idle time before the next run and records it with the cool-down on harness.series', () => {
    let s = cooling(3, 60_000);
    s = markRunStarted(s, T0);
    expect(seriesHarness(s)).toEqual({ id: 'series-c', index: 1, count: 3, cooldownMs: 60_000 });
    s = recordRunFinished(s, { runId: 'a', durationMs: 5, outcome: 'exported' }, T0 + 5);
    s = startCooldown(s, T0 + 100);
    // The page reloads after the cool-down; run 2 starts 61.7 s after the idle began.
    s = markRunStarted(resolveSeriesOnLoad(s).state, T0 + 61_834);
    expect(s.cooldownUntil).toBeUndefined();
    expect(s.idleSince).toBeUndefined();
    expect(seriesHarness(s)).toEqual({ id: 'series-c', index: 2, count: 3, cooldownMs: 60_000, idleBeforeMs: 61_734 });
  });

  it('records no idle time on a run resumed after a pause, or when the clock went backwards', () => {
    let s = startCooldown(finishRun(cooling(3, 60_000), 'a', 5), T0);
    s = recordRunFailed(markRunStarted(s, T0 + 70_000), 'boom');
    expect(s.idleSince).toBeUndefined();
    s = markRunStarted(continueSeries(s), T0 + 900_000);
    expect(seriesHarness(s)).toEqual({ id: 'series-c', index: 2, count: 3, cooldownMs: 60_000 });

    const skewed = markRunStarted(startCooldown(finishRun(cooling(3, 0), 'a', 5), T0), T0 - 1);
    expect(seriesHarness(skewed).idleBeforeMs).toBeUndefined();
  });

  it('a run that crashed its page drops the idle clock', () => {
    const s = markRunStarted(startCooldown(finishRun(cooling(3, 60_000), 'a', 5), T0), T0 + 60_000);
    const { state } = resolveSeriesOnLoad(s);
    expect(state.status).toBe('paused');
    expect(state.idleSince).toBeUndefined();
    expect(state.cooldownUntil).toBeUndefined();
  });

  it('adds the cool-downs still ahead to the estimate', () => {
    let s = cooling(4, 60_000);
    s = finishRun(s, 'a', 100_000);
    s = startCooldown(s, T0);
    // 3 runs left at 100 s each, 45 s left of this cool-down, 2 more cool-downs of 60 s.
    expect(seriesEtaMs(s, T0 + 15_000)).toBe(3 * 100_000 + 45_000 + 2 * 60_000);
    // Once run 2 has started: 3 runs left (run 2 included) and the 2 cool-downs before runs 3 and 4.
    const started = markRunStarted(s, T0 + 60_000);
    expect(seriesEtaMs(started, T0 + 60_000)).toBe(3 * 100_000 + 2 * 60_000);
  });

  it('names the cool-down in the summary', () => {
    const text = seriesSummaryText(finishRun(cooling(2, 90_000), 'run-a', 5_000));
    expect(text.split('\n')[0]).toBe(
      'LocalMode Bench series series-c · thorough suite · quality on · publish on · clear caches after each run off · cool-down 1.5 min',
    );
  });
});
