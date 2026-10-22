/**
 * Control runs on /bench/run (`?control=order-reversed`, `?control=fixed-order`,
 * `?control=wasm-default`, `?control=wasm-q8`, `?control=wasm-threads`,
 * `?control=wllama-compat`), a control
 * experiment for the methodology: the query parsing and its refusals, the
 * series state that carries the control kind across reloads, the preset link,
 * the upload guard and the completion-code guard. The page wiring (banner,
 * Export JSON only, no upload request, the record's order) is covered by the
 * bench e2e spec against a real run.
 */
import { describe, expect, it } from 'vitest';
import { createHarnessControl, RUNTIME_EXECUTION_ORDER, validateRunShape } from '@localmode/bench';
import {
  CONTROL_STUDY_REFUSAL,
  controlBannerText,
  controlHarness,
  effectiveControlKind,
  mayUpload,
  parseControlRequest,
  wasmDefaultThreads,
} from '../src/lib/bench/control';
import {
  createSeries,
  markRunStarted,
  parseRunPresets,
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
import { SUITE_MODELS, benchModelsFor } from '../src/lib/bench/catalog';
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
    expect(parseControlRequest('?control=fixed-order')).toEqual({ status: 'control', kind: 'fixed-order' });
    expect(parseControlRequest('tier=standard&quality=off&runs=6&cooldown=5&cold=off&control=fixed-order')).toEqual({
      status: 'control',
      kind: 'fixed-order',
    });
    expect(parseControlRequest('?tier=quick&quality=off&runs=6&cooldown=5&cold=off&control=wasm-default')).toEqual({
      status: 'control',
      kind: 'wasm-default',
    });
    expect(parseControlRequest('?control=WASM-default').status).toBe('refused');
    expect(parseControlRequest('?tier=standard&quality=off&runs=6&cooldown=5&cold=off&control=wasm-q8')).toEqual({
      status: 'control',
      kind: 'wasm-q8',
    });
    expect(parseControlRequest('?tier=standard&quality=off&runs=6&cooldown=5&cold=off&control=wasm-threads')).toEqual({
      status: 'control',
      kind: 'wasm-threads',
    });
    expect(parseControlRequest('?control=wasm-q4').status).toBe('refused');
    expect(parseControlRequest('?control=wasm-thread').status).toBe('refused');
    expect(parseControlRequest('?PROLIFIC_PID=abc&cc=CODE1234&control=wasm-q8')).toEqual({
      status: 'refused',
      message: CONTROL_STUDY_REFUSAL,
    });
    expect(parseControlRequest('?cc=CODE1234&control=wasm-threads')).toEqual({
      status: 'refused',
      message: CONTROL_STUDY_REFUSAL,
    });
    expect(parseControlRequest('?PROLIFIC_PID=abc&cc=CODE1234&control=wasm-default')).toEqual({
      status: 'refused',
      message: CONTROL_STUDY_REFUSAL,
    });
  });

  it('refuses an unknown or empty kind instead of running a protocol run', () => {
    const unknown = parseControlRequest('?control=order-shuffled');
    expect(unknown).toEqual({
      status: 'refused',
      message:
        'Unknown control run kind "order-shuffled"; the supported kinds are order-reversed, fixed-order, wasm-default, wasm-q8, wasm-threads, wllama-compat. Remove the control parameter for a protocol run.',
    });
    expect(parseControlRequest('?control=').status).toBe('refused');
    expect(parseControlRequest('?control=Fixed-Order').status).toBe('refused');
    expect(parseControlRequest('?control=fixed').status).toBe('refused');
  });

  it('refuses a paid-study link carrying the control parameter', () => {
    expect(parseControlRequest('?PROLIFIC_PID=abc&cc=CODE1234&control=order-reversed')).toEqual({
      status: 'refused',
      message: CONTROL_STUDY_REFUSAL,
    });
    expect(parseControlRequest('?cc=CODE1234&control=order-reversed').status).toBe('refused');
    expect(parseControlRequest('?PROLIFIC_PID=abc&control=order-reversed').status).toBe('refused');
    expect(parseControlRequest('?PROLIFIC_PID=abc&cc=CODE1234&control=fixed-order')).toEqual({
      status: 'refused',
      message: CONTROL_STUDY_REFUSAL,
    });
    expect(parseControlRequest('?cc=CODE1234&control=fixed-order').status).toBe('refused');
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
    // A resumed series keeps its own kind whatever kind the URL names.
    expect(effectiveControlKind(parseControlRequest('?control=fixed-order'), 'order-reversed')).toBe('order-reversed');
    expect(effectiveControlKind(url, 'fixed-order')).toBe('fixed-order');
  });
});

describe('banner, harness record and upload guard', () => {
  it('the banner names the kind and that the run is not published', () => {
    expect(controlBannerText('order-reversed')).toBe(
      'Control run: reversed runtime order; not published to the leaderboard',
    );
    expect(controlBannerText('fixed-order')).toBe(
      'Control run: protocol runtime order; not published to the leaderboard',
    );
  });

  it('the harness record is the bench package one, with the exact reverse of the protocol order', () => {
    expect(controlHarness('order-reversed')).toEqual(createHarnessControl('order-reversed'));
    expect(controlHarness('order-reversed').runtimeOrder).toEqual([...RUNTIME_EXECUTION_ORDER].reverse());
  });

  it('the fixed-order harness record is the bench package one, with the protocol order itself', () => {
    expect(controlHarness('fixed-order')).toEqual(createHarnessControl('fixed-order'));
    expect(controlHarness('fixed-order')).toEqual({ kind: 'fixed-order', runtimeOrder: [...RUNTIME_EXECUTION_ORDER] });
  });

  it('the wasm-default banner names the WASM lane at runtime defaults and that the run is not published', () => {
    expect(controlBannerText('wasm-default')).toBe(
      'Control run: Transformers.js WASM lane at runtime defaults (q8, all cores); not published to the leaderboard',
    );
  });

  it('the wasm-default harness record keeps the protocol order and records q8, every logical core and SIMD', () => {
    expect(controlHarness('wasm-default', 12)).toEqual({
      kind: 'wasm-default',
      runtimeOrder: [...RUNTIME_EXECUTION_ORDER],
      wasmLane: { dtype: 'q8', numThreads: 12, simd: true },
    });
    expect(controlHarness('wasm-default', 12)).toEqual(createHarnessControl('wasm-default', { numThreads: 12 }));
    // The order kinds ignore the core count and carry no wasmLane.
    expect(controlHarness('fixed-order', 12)).toEqual(createHarnessControl('fixed-order'));
    expect(controlHarness('order-reversed', 12)).toEqual(createHarnessControl('order-reversed'));
  });

  it('the wasm-q8 and wasm-threads banners name the configuration and that the run is not published', () => {
    expect(controlBannerText('wasm-q8')).toBe(
      'Control run: Transformers.js WASM lane at q8, runtime thread default; not published to the leaderboard',
    );
    expect(controlBannerText('wasm-threads')).toBe(
      'Control run: Transformers.js WASM lane at q4 on all cores; not published to the leaderboard',
    );
  });

  it('wasm-q8 records q8 with the thread count left to the runtime (null), whatever the core count', () => {
    expect(controlHarness('wasm-q8', 12)).toEqual({
      kind: 'wasm-q8',
      runtimeOrder: [...RUNTIME_EXECUTION_ORDER],
      wasmLane: { dtype: 'q8', numThreads: null, simd: true },
    });
    expect(controlHarness('wasm-q8', 12)).toEqual(createHarnessControl('wasm-q8'));
    expect(controlHarness('wasm-q8')).toEqual(controlHarness('wasm-q8', 64));
  });

  it('wasm-threads records the protocol q4 files on every logical core', () => {
    expect(controlHarness('wasm-threads', 12)).toEqual({
      kind: 'wasm-threads',
      runtimeOrder: [...RUNTIME_EXECUTION_ORDER],
      wasmLane: { dtype: 'q4', numThreads: 12, simd: true },
    });
    expect(controlHarness('wasm-threads', 12)).toEqual(createHarnessControl('wasm-threads', { numThreads: 12 }));
    // The same clamping as wasm-default.
    expect(controlHarness('wasm-threads', undefined).wasmLane?.numThreads).toBe(1);
    expect(controlHarness('wasm-threads', 4096).wasmLane?.numThreads).toBe(1024);
  });

  it('wasmDefaultThreads is hardwareConcurrency, floored, at least 1 and at most 1024', () => {
    expect(wasmDefaultThreads(8)).toBe(8);
    expect(wasmDefaultThreads(1)).toBe(1);
    expect(wasmDefaultThreads(undefined)).toBe(1);
    expect(wasmDefaultThreads(0)).toBe(1);
    expect(wasmDefaultThreads(Number.NaN)).toBe(1);
    expect(wasmDefaultThreads(6.5)).toBe(6);
    expect(wasmDefaultThreads(4096)).toBe(1024);
  });

  it('a run carrying harness.control may not be uploaded; a protocol run may', () => {
    expect(mayUpload(makeRun())).toBe(true);
    expect(mayUpload(makeRun({ harness: { name: 'n', version: 'v', control: controlHarness('order-reversed') } }))).toBe(false);
    expect(mayUpload(makeRun({ harness: { name: 'n', version: 'v', control: controlHarness('fixed-order') } }))).toBe(false);
    expect(mayUpload(makeRun({ harness: { name: 'n', version: 'v', control: controlHarness('wasm-default', 8) } }))).toBe(false);
    expect(mayUpload(makeRun({ harness: { name: 'n', version: 'v', control: controlHarness('wasm-q8', 8) } }))).toBe(false);
    expect(mayUpload(makeRun({ harness: { name: 'n', version: 'v', control: controlHarness('wasm-threads', 8) } }))).toBe(false);
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

  it('a fixed-order series carries its kind and never publishes, through storage and a reload', () => {
    const created = createSeries({
      seriesId: 'series-fixed',
      count: 6,
      settings: { ...settings, publish: true, control: 'fixed-order' },
      now: 0,
    });
    expect(created.settings.control).toBe('fixed-order');
    expect(created.settings.publish).toBe(false);
    const reloaded = parseSeriesState(serializeSeriesState(startCooldown(
        recordRunFinished(markRunStarted(created, 1), { runId: 'f1', durationMs: 10, outcome: 'exported' }, 2),
        3,
      )));
    expect(reloaded?.settings.control).toBe('fixed-order');
    expect(seriesSummaryText(reloaded!)).toContain('LocalMode Bench control series (fixed-order) series-fixed');
  });

  it.each(['wasm-q8', 'wasm-threads'] as const)('a %s series carries its kind and never publishes, through storage and a reload', (kind) => {
    const created = createSeries({ seriesId: `series-${kind}`, count: 6, settings: { ...settings, publish: true, control: kind }, now: 0 });
    expect(created.settings.publish).toBe(false);
    const reloaded = parseSeriesState(serializeSeriesState(startCooldown(
        recordRunFinished(markRunStarted(created, 1), { runId: 'w1', durationMs: 10, outcome: 'exported' }, 2),
        3,
      )));
    expect(reloaded?.settings.control).toBe(kind);
    expect(seriesSummaryText(reloaded!)).toContain(`LocalMode Bench control series (${kind}) series-${kind}`);
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
    expect(presetQuery(p, 'fixed-order')).toBe(
      'tier=quick&quality=off&runs=10&cooldown=1&cold=on&publish=off&control=fixed-order',
    );
    const standard = { suite: 'standard' as const, includeQuality: false, runs: 6, cooldownMinutes: 5, clearAfterRun: false, publish: false };
    expect(presetQuery(standard, 'wasm-q8')).toBe('tier=standard&quality=off&runs=6&cooldown=5&cold=off&publish=off&control=wasm-q8');
    expect(presetQuery(standard, 'wasm-threads')).toBe(
      'tier=standard&quality=off&runs=6&cooldown=5&cold=off&publish=off&control=wasm-threads',
    );
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

describe('the wllama-compat kind', () => {
  const FIREFOX_STANDARD = 'tier=standard&quality=off&runs=6&cooldown=5&cold=off&control=wllama-compat';

  it('the author link opts in; a mistyped or browser-named kind is refused; a study link is refused', () => {
    expect(parseControlRequest(`?${FIREFOX_STANDARD}`)).toEqual({ status: 'control', kind: 'wllama-compat' });
    expect(parseRunPresets(`?${FIREFOX_STANDARD}`)).toEqual({ suite: 'standard', includeQuality: false, runs: 6, cooldownMinutes: 5, clearAfterRun: false });
    expect(parseControlRequest('?control=firefox-compat').status).toBe('refused');
    expect(parseControlRequest('?control=wllama').status).toBe('refused');
    expect(parseControlRequest('?control=WLLAMA-compat').status).toBe('refused');
    expect(parseControlRequest('?PROLIFIC_PID=abc&cc=CODE1234&control=wllama-compat')).toEqual({ status: 'refused', message: CONTROL_STUDY_REFUSAL });
  });

  it('the banner names the llama.cpp lanes, the compatibility build and that the run is not published', () => {
    expect(controlBannerText('wllama-compat')).toBe(
      'Control run: llama.cpp lanes on the wllama compatibility build; not published to the leaderboard',
    );
  });

  it('the harness record is the bench package one: the protocol order and wllamaBuild compat, whatever the core count', () => {
    expect(controlHarness('wllama-compat', 12)).toEqual({ kind: 'wllama-compat', runtimeOrder: [...RUNTIME_EXECUTION_ORDER], wllamaBuild: 'compat' });
    expect(controlHarness('wllama-compat', 12)).toEqual(createHarnessControl('wllama-compat'));
    expect(controlHarness('wllama-compat')).toEqual(controlHarness('wllama-compat', 64));
    expect(controlHarness('wllama-compat', 8).wasmLane).toBeUndefined();
  });

  it('may not be uploaded, and a series keeps the kind and never publishes through a reload', () => {
    expect(mayUpload(makeRun({ harness: { name: 'n', version: 'v', control: controlHarness('wllama-compat', 8) } }))).toBe(false);
    const created = createSeries({ seriesId: 'series-compat', count: 6, settings: { ...settings, suite: 'standard', publish: true, control: 'wllama-compat' }, now: 0 });
    expect(created.settings.publish).toBe(false);
    const reloaded = parseSeriesState(serializeSeriesState(startCooldown(
        recordRunFinished(markRunStarted(created, 1), { runId: 'c1', durationMs: 10, outcome: 'exported' }, 2),
        3,
      )));
    expect(reloaded?.settings.control).toBe('wllama-compat');
    expect(seriesSummaryText(reloaded!)).toContain('LocalMode Bench control series (wllama-compat) series-compat');
    const standard = { suite: 'standard' as const, includeQuality: false, runs: 6, cooldownMinutes: 5, clearAfterRun: false, publish: false };
    expect(presetQuery(standard, 'wllama-compat')).toBe(`${FIREFOX_STANDARD.replace('&control=', '&publish=off&control=')}`);
  });
});

describe('a Thorough-tier control run', () => {
  const THOROUGH_FIXED = 'tier=thorough&quality=off&runs=1&cooldown=0&cold=off&control=fixed-order';

  it('the Thorough fixed-order link opts in with the thorough suite and one run', () => {
    expect(parseControlRequest(`?${THOROUGH_FIXED}`)).toEqual({ status: 'control', kind: 'fixed-order' });
    expect(parseRunPresets(`?${THOROUGH_FIXED}`)).toEqual({ suite: 'thorough', includeQuality: false, runs: 1, cooldownMinutes: 0, clearAfterRun: false });
  });

  it('the Thorough suite holds every pairing, the Gemini Nano lane included, and the control record does not depend on the tier', () => {
    expect(SUITE_MODELS.thorough).toContain('gemini-nano');
    expect(benchModelsFor(SUITE_MODELS.thorough).some((m) => m.runtimeId === 'chrome-ai')).toBe(true);
    const control = controlHarness('fixed-order', 8);
    expect(control).toEqual({ kind: 'fixed-order', runtimeOrder: [...RUNTIME_EXECUTION_ORDER] });
    // A fixed-order run of the thorough suite validates like a protocol one.
    expect(validateRunShape(makeRun({ suite: 'thorough', harness: { name: 'n', version: 'v', control } }))).toEqual([]);
    const series = createSeries({ seriesId: 'thorough-fixed', count: 1, settings: { ...settings, suite: 'thorough', control: 'fixed-order' }, now: 0 });
    expect(series.settings).toMatchObject({ suite: 'thorough', control: 'fixed-order', publish: false });
  });
});
