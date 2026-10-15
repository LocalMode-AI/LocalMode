/**
 * Control runs on /bench/run (`?control=order-reversed`), a control
 * experiment for the methodology: the query parsing and its refusals, the
 * series state that carries the control kind across reloads, the preset link,
 * the upload guard and the completion-code guard. The page wiring (banner,
 * Export JSON only, no upload request, the record's order) is covered by the
 * bench e2e spec against a real run.
 */
import { describe, expect, it } from 'vitest';
import { createHarnessControl, RUNTIME_EXECUTION_ORDER } from '@localmode/bench';
import {
  CONTROL_STUDY_REFUSAL,
  controlBannerText,
  controlHarness,
  effectiveControlKind,
  mayUpload,
  parseControlRequest,
} from '../src/lib/bench/control';
import {
  createSeries,
  markRunStarted,
  parseSeriesState,
  presetQuery,
  recordRunFinished,
  resolveSeriesOnLoad,
  serializeSeriesState,
  seriesSummaryText,
  startCooldown,
  type SeriesSettings,
} from '../src/lib/bench/series';
import { shouldIssueCompletionCode } from '../src/lib/bench/study-completion';
import { makeRun } from '../../../packages/bench/tests/helpers';

const settings: SeriesSettings = {
  suite: 'quick',
  includeQuality: false,
  publish: false,
  clearAfterRun: false,
  cooldownMs: 0,
  disabledLanes: [],
};

describe('parseControlRequest()', () => {
  it('opts in only on the control parameter with a known kind', () => {
    expect(parseControlRequest('')).toEqual({ status: 'none' });
    expect(parseControlRequest('?tier=quick&runs=10')).toEqual({ status: 'none' });
    expect(parseControlRequest('?control=order-reversed')).toEqual({ status: 'control', kind: 'order-reversed' });
    expect(parseControlRequest('tier=quick&control=order-reversed&runs=10&cold=on')).toEqual({
      status: 'control',
      kind: 'order-reversed',
    });
  });

  it('refuses an unknown or empty kind instead of running a protocol run', () => {
    const unknown = parseControlRequest('?control=order-shuffled');
    expect(unknown).toEqual({
      status: 'refused',
      message:
        'Unknown control run kind "order-shuffled"; the supported kind is order-reversed. Remove the control parameter for a protocol run.',
    });
    expect(parseControlRequest('?control=').status).toBe('refused');
  });

  it('refuses a paid-study link carrying the control parameter', () => {
    expect(parseControlRequest('?PROLIFIC_PID=abc&cc=CODE1234&control=order-reversed')).toEqual({
      status: 'refused',
      message: CONTROL_STUDY_REFUSAL,
    });
    expect(parseControlRequest('?cc=CODE1234&control=order-reversed').status).toBe('refused');
    expect(parseControlRequest('?PROLIFIC_PID=abc&control=order-reversed').status).toBe('refused');
  });
});

describe('effectiveControlKind()', () => {
  it('an open series keeps the mode it started in; otherwise the URL decides', () => {
    const url = parseControlRequest('?control=order-reversed');
    const none = parseControlRequest('');
    expect(effectiveControlKind(url, undefined)).toBe('order-reversed');
    expect(effectiveControlKind(none, undefined)).toBeNull();
    // A resumed control series stays in control mode even if the reload lost the parameter.
    expect(effectiveControlKind(none, 'order-reversed')).toBe('order-reversed');
    // A protocol series stays a protocol series.
    expect(effectiveControlKind(url, null)).toBeNull();
  });
});

describe('banner, harness record and upload guard', () => {
  it('the banner names the kind and that the run is not published', () => {
    expect(controlBannerText('order-reversed')).toBe(
      'Control run: reversed runtime order; not published to the leaderboard',
    );
  });

  it('the harness record is the bench package one, with the exact reverse of the protocol order', () => {
    expect(controlHarness('order-reversed')).toEqual(createHarnessControl('order-reversed'));
    expect(controlHarness('order-reversed').runtimeOrder).toEqual([...RUNTIME_EXECUTION_ORDER].reverse());
  });

  it('a run carrying harness.control may not be uploaded; a protocol run may', () => {
    expect(mayUpload(makeRun())).toBe(true);
    expect(mayUpload(makeRun({ harness: { name: 'n', version: 'v', control: controlHarness('order-reversed') } }))).toBe(false);
  });
});

describe('a control series', () => {
  it('carries the control kind and never publishes, through storage and a reload', () => {
    const created = createSeries({
      seriesId: 'series-ctl',
      count: 10,
      settings: { ...settings, publish: true, control: 'order-reversed' },
      now: 0,
    });
    expect(created.settings.control).toBe('order-reversed');
    expect(created.settings.publish).toBe(false);
    // Run 1 finishes (exported), the cool-down starts, the page reloads.
    const afterRun1 = startCooldown(
      recordRunFinished(markRunStarted(created, 1), { runId: 'r1', durationMs: 10, outcome: 'exported' }, 2),
      3,
    );
    const reloaded = parseSeriesState(serializeSeriesState(afterRun1));
    expect(reloaded?.settings.control).toBe('order-reversed');
    expect(resolveSeriesOnLoad(reloaded!).action).toBe('start-next');
    expect(seriesSummaryText(reloaded!)).toContain('LocalMode Bench control series (order-reversed) series-ctl');
  });

  it('a protocol series stores no control key', () => {
    const created = createSeries({ seriesId: 's', count: 2, settings: { ...settings, control: undefined }, now: 0 });
    expect('control' in created.settings).toBe(false);
    expect(seriesSummaryText(created)).toContain('LocalMode Bench series s');
  });

  it('a stored series with an unknown kind, or a control series that publishes, reads as no series', () => {
    const created = createSeries({ seriesId: 's', count: 2, settings: { ...settings, control: 'order-reversed' }, now: 0 });
    const raw = JSON.parse(serializeSeriesState(created));
    expect(parseSeriesState(JSON.stringify({ ...raw, settings: { ...raw.settings, control: 'order-shuffled' } }))).toBeNull();
    expect(parseSeriesState(JSON.stringify({ ...raw, settings: { ...raw.settings, publish: true } }))).toBeNull();
  });
});

describe('preset link and completion code', () => {
  it('the preset link of a control page keeps the control parameter and publish=off', () => {
    const p = { suite: 'quick' as const, includeQuality: false, runs: 10, cooldownMinutes: 1, clearAfterRun: true, publish: true };
    expect(presetQuery(p, 'order-reversed')).toBe(
      'tier=quick&quality=off&runs=10&cooldown=1&cold=on&publish=off&control=order-reversed',
    );
    expect(presetQuery(p)).toBe('tier=quick&quality=off&runs=10&cooldown=1&cold=on&publish=on');
  });

  it('a control run never issues a completion code', () => {
    const base = {
      mode: 'attempt' as const,
      suiteEnded: true,
      allCellsAttempted: true,
      submitState: { kind: 'failed' as const },
      stoppedByUser: false,
      lastRunOfSeries: true,
      runSettings: { suite: 'quick', includeQuality: false },
      linkSettings: { suite: 'quick' as const, includeQuality: false },
    };
    expect(shouldIssueCompletionCode(base)).toBe(true);
    expect(shouldIssueCompletionCode({ ...base, controlRun: true })).toBe(false);
  });
});
