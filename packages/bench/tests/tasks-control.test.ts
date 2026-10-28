/**
 * The chrome-ai-tasks control kind: the session record, the task cell, the
 * order rule, and each shape and plausibility rule as kept, adapted or
 * skipped for task cells. Every rule is checked on a valid fixture (no
 * finding) and on the fixture with one field broken (the finding).
 */

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  CONTROL_KINDS,
  RUN_POLICIES,
  checkPlausibility,
  computeRunDigest,
  controlRuntimeOrder,
  controlTasksError,
  createHarnessControl,
  runBenchmarkSuite,
  sha256HexSync,
  summarizeRun,
  taskRuntimeOrder,
  taskSystemOrder,
  validateRunShape,
  validateSubmission,
  verifyRunDigest,
  type BenchRunResult,
  type TaskIteration,
} from '../src/index.js';
import { flatItem, makeDetectRun, makeTaskRun, streamedItem, tasksRecord } from './fixtures/task-runs.js';
import { makeAnalysisRun, makeSecondAnalysisRun } from './fixtures/analysis-runs.js';
import { errataRuns } from './fixtures/errata-runs.js';
import { makeRun } from './helpers.js';

const codes = (run: BenchRunResult) => checkPlausibility(run).map((f) => `${f.severity}:${f.code}`);
const shapeOf = (run: BenchRunResult) => validateRunShape(run);
const builtIn = (run: BenchRunResult) => run.cells[0].iterations as TaskIteration[];
const tasksOf = (run: BenchRunResult) => run.harness.control!.tasks!;

describe('sha256HexSync()', () => {
  it('matches node:crypto on ASCII, multi-byte, block-boundary and long inputs', () => {
    for (const s of ['', 'abc', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'zh 中文 ar العربية 🙂', 'x'.repeat(70_000)]) {
      expect(sha256HexSync(s)).toBe(createHash('sha256').update(s, 'utf8').digest('hex'));
    }
  });
});

describe('the chrome-ai-tasks kind', () => {
  it('is the tenth control kind', () => {
    expect(CONTROL_KINDS).toHaveLength(10);
    expect(CONTROL_KINDS[9]).toBe('chrome-ai-tasks');
  });

  it('has no fixed runtime order: controlRuntimeOrder refuses it', () => {
    expect(() => controlRuntimeOrder('chrome-ai-tasks')).toThrow(/no fixed runtime order/);
  });

  it('createHarnessControl derives runtimeOrder from systemOrder and copies the record', () => {
    const tasks = tasksRecord();
    const control = createHarnessControl('chrome-ai-tasks', { tasks });
    expect(control).toEqual({ kind: 'chrome-ai-tasks', runtimeOrder: ['chrome-ai', 'transformers-wasm'], tasks });
    expect(control.tasks).not.toBe(tasks);
  });

  it('createHarnessControl refuses a missing or bad record, extra options, and tasks on another kind', () => {
    expect(() => createHarnessControl('chrome-ai-tasks')).toThrow(/tasks must be an object/);
    expect(() => createHarnessControl('chrome-ai-tasks', { tasks: tasksRecord({ order: 'reversed' }) })).toThrow(/not in the reversed order/);
    expect(() => createHarnessControl('chrome-ai-tasks', { tasks: tasksRecord(), numThreads: 4 })).toThrow(/takes only \{ tasks \}/);
    expect(() => createHarnessControl('fixed-order', { tasks: tasksRecord() })).toThrow(/only on a chrome-ai-tasks control run, not on fixed-order/);
  });

  it('runBenchmarkSuite refuses the kind before running anything', async () => {
    const control = createHarnessControl('chrome-ai-tasks', { tasks: tasksRecord() });
    await expect(
      runBenchmarkSuite({
        suite: 'quick',
        cells: [],
        policy: RUN_POLICIES.quick,
        llmAdapters: new Map(),
        embedAdapters: new Map(),
        harness: { name: 'h', version: '1', control },
        skipFingerprint: true,
      }),
    ).rejects.toThrow(/use runTaskSession/);
  });
});

describe('taskSystemOrder() / taskRuntimeOrder()', () => {
  const arms = [
    'transformers-wasm/opus-mt-de-en@fp32',
    'transformers-webgpu/opus-mt-en-de@q8',
    'transformers-wasm/opus-mt-en-de@q8',
    'chrome-ai/chrome-summarizer-default',
    'chrome-ai/chrome-summarizer',
  ];

  it('fixed: built-in first (options-of-record before -default), then lane, then dtype; ties keep their order', () => {
    expect(taskSystemOrder(arms, 'fixed')).toEqual([
      'chrome-ai/chrome-summarizer',
      'chrome-ai/chrome-summarizer-default',
      'transformers-wasm/opus-mt-en-de@q8',
      'transformers-wasm/opus-mt-de-en@fp32',
      'transformers-webgpu/opus-mt-en-de@q8',
    ]);
  });

  it('reversed is the exact reverse of fixed', () => {
    expect(taskSystemOrder(arms, 'reversed')).toEqual([...taskSystemOrder(arms, 'fixed')].reverse());
  });

  it('runtimeOrder lists distinct runtimes, first appearance first', () => {
    expect(taskRuntimeOrder(taskSystemOrder(arms, 'reversed'))).toEqual(['transformers-webgpu', 'transformers-wasm', 'chrome-ai']);
  });

  it('refuses an entry that is not an arm id', () => {
    expect(() => taskSystemOrder(['webllm/x'], 'fixed')).toThrow(/not a task arm id/);
  });
});

describe('validateRunShape() on a chrome-ai-tasks run', () => {
  it('accepts the valid summarize and detect fixtures', () => {
    expect(shapeOf(makeTaskRun())).toEqual([]);
    expect(shapeOf(makeDetectRun())).toEqual([]);
  });

  it('keeps: protocol, schema, series bounds', () => {
    expect(shapeOf(makeTaskRun({ protocol: 'localmode-bench/4' as never }))).toContain('protocol must be "localmode-bench/5"');
    expect(shapeOf(makeTaskRun({ schemaVersion: 1 as never }))[0]).toMatch(/schemaVersion/);
    const run = makeTaskRun();
    run.harness.series = { id: 'block', index: 3, count: 2 };
    expect(shapeOf(run)).toEqual(['harness.series.index must be an integer from 1 to harness.series.count']);
  });

  it('adapts the order rule: fixed and reversed accepted, neither refused, a mismatch with `order` refused', () => {
    const reversed = makeTaskRun();
    tasksOf(reversed).order = 'reversed';
    tasksOf(reversed).systemOrder = ['transformers-wasm/distilbart-cnn-6-6@q8', 'chrome-ai/chrome-summarizer'];
    reversed.harness.control!.runtimeOrder = ['transformers-wasm', 'chrome-ai'];
    reversed.cells.reverse();
    expect(shapeOf(reversed)).toEqual([]);

    const mismatch = makeTaskRun();
    tasksOf(mismatch).order = 'reversed';
    expect(shapeOf(mismatch)).toEqual(['harness.control.tasks.systemOrder is not in the reversed order']);

    const neither = makeTaskRun();
    tasksOf(neither).systemOrder = ['transformers-wasm/a@fp32', 'chrome-ai/chrome-summarizer', 'transformers-wasm/a@q8'];
    expect(shapeOf(neither)[0]).toMatch(/neither the task's fixed order/);
  });

  it('runtimeOrder must be the runtimes of systemOrder (not RUNTIME_EXECUTION_ORDER)', () => {
    const run = makeTaskRun();
    run.harness.control!.runtimeOrder = ['transformers-wasm', 'chrome-ai'];
    expect(shapeOf(run)[0]).toMatch(/runtimeOrder must be the runtimes of harness.control.tasks.systemOrder in executed order \[chrome-ai, transformers-wasm\]/);
  });

  it('an archived tasks/1 session is refused for submission and read under anyProtocol', () => {
    const run = makeTaskRun();
    run.harness.control!.tasks!.protocol = 'tasks/1' as never;
    expect(shapeOf(run)).toContain('harness.control.tasks.protocol must be "tasks/2"');
    expect(validateRunShape(run, { anyProtocol: true })).toEqual([]);
    run.harness.control!.tasks!.protocol = 'tasks/x' as never;
    expect(validateRunShape(run, { anyProtocol: true })).toEqual(['harness.control.tasks.protocol must be a "tasks/<n>" identifier']);
  });

  it('refuses a malformed session record field by field', () => {
    const cases: Array<[Partial<ReturnType<typeof tasksRecord>>, RegExp]> = [
      [{ protocol: 'tasks/1' as never }, /protocol must be "tasks\/2"/],
      [{ phase: 'warm' as never }, /phase must be one of/],
      [{ set: 'flores-devtest' }, /does not serve the summarize task/],
      [{ subset: 'M' as never }, /subset must be one of/],
      [{ itemList: { id: 'x', count: 0, sha256: 'a'.repeat(64) } }, /itemList must be/],
      [{ itemList: { id: 'x', count: 3, sha256: 'xyz' } }, /itemList must be/],
      [{ sessionIndex: 0 }, /sessionIndex/],
      [{ processCold: 'yes' as never }, /processCold must be a boolean/],
      [{ repeat: 2 }, /repeat is set only on an R session/],
      [{ systemOrder: ['chrome-ai/chrome-summarizer', 'chrome-ai/chrome-summarizer'] }, /lists an arm twice/],
    ];
    for (const [patch, pattern] of cases) {
      const run = makeTaskRun();
      Object.assign(tasksOf(run), patch);
      expect(shapeOf(run).join('\n')).toMatch(pattern);
    }
    const r = makeTaskRun();
    Object.assign(tasksOf(r), { subset: 'R', repeat: 2 });
    expect(shapeOf(r)).toEqual([]);
  });

  it('refuses tasks on another kind, and a task record or task workload on another run', () => {
    expect(controlTasksError({ kind: 'fixed-order', tasks: tasksRecord() })).toBe(
      'harness.control.tasks is set only on a chrome-ai-tasks control run, not on fixed-order',
    );
    const protocolRun = makeRun();
    protocolRun.cells[0].task = { api: 'Summarizer' };
    expect(shapeOf(protocolRun)).toEqual(['cells[0]: task is set only on a cell of a chrome-ai-tasks control run']);
    const kindRun = makeRun();
    kindRun.cells[0].workloadKind = 'summarize';
    expect(shapeOf(kindRun)).toEqual(['cells[0]: workloadKind summarize is used only on a chrome-ai-tasks control run']);
  });

  it('requires a task record on every cell, the session task as workloadKind, and an arm from systemOrder', () => {
    const missing = makeTaskRun();
    delete missing.cells[1].task;
    expect(shapeOf(missing)).toEqual(['cells[1]: task is required on every cell of a chrome-ai-tasks control run']);
    const kind = makeTaskRun();
    kind.cells[0].workloadKind = 'translate';
    expect(shapeOf(kind)[0]).toMatch(/workloadKind must be the session's task summarize/);
    const arm = makeTaskRun();
    arm.cells[1].model.benchModelId = 'distilbart-cnn-12-6@q8';
    expect(shapeOf(arm).join('\n')).toMatch(/arm transformers-wasm\/distilbart-cnn-12-6@q8 is not in/);
  });

  it('item ids: index in list order, unique within the cell, at most the list count', () => {
    const order = makeTaskRun();
    builtIn(order)[1].index = 2;
    expect(shapeOf(order)).toEqual(['cells[0]: iterations[1].index must be 1 (items run in list order, one per call)']);
    const dup = makeTaskRun();
    builtIn(dup)[2].itemId = 'cnn/1';
    expect(shapeOf(dup)).toEqual(['cells[0]: iterations[2].itemId "cnn/1" repeats an item of the cell']);
    const over = makeTaskRun();
    tasksOf(over).itemList.count = 2;
    expect(shapeOf(over)[0]).toMatch(/ran 3 items, more than the list's 2/);
  });

  it('recomputes outputSha256, and sourceSha256 over source on a translate cell', () => {
    const out = makeTaskRun();
    builtIn(out)[0].text = 'Alpha beta gamma!';
    expect(shapeOf(out)).toEqual(["cells[0]: iterations[0].outputSha256 does not match the SHA-256 of the item's text"]);

    const translate = makeTaskRun();
    Object.assign(tasksOf(translate), {
      task: 'translate', set: 'flores-devtest', itemList: { id: 't', count: 1, sha256: 'c'.repeat(64) },
      systemOrder: ['chrome-ai/chrome-translator'],
    });
    translate.harness.control!.runtimeOrder = ['chrome-ai'];
    const source = 'Good morning.';
    const item = { ...streamedItem(0, 'flores/1/en-de', 1000, 'Guten Morgen.', source), source };
    translate.cells = [{ ...translate.cells[0], cellId: 'chrome-ai/chrome-translator/translate-en-de-L', model: { ...translate.cells[0].model, benchModelId: 'chrome-translator' }, workloadId: 'translate-en-de-L', workloadKind: 'translate', iterations: [item] }];
    expect(shapeOf(translate)).toEqual([]);
    (translate.cells[0].iterations[0] as TaskIteration).source = 'Good evening.';
    expect(shapeOf(translate)).toEqual(['cells[0]: iterations[0].sourceSha256 does not match the SHA-256 of source']);
    delete (translate.cells[0].iterations[0] as TaskIteration).source;
    expect(shapeOf(translate)).toEqual(['cells[0]: iterations[0].source is required on a translate cell']);
  });

  it('source and targetToken only on translate cells', () => {
    const run = makeTaskRun();
    builtIn(run)[0].targetToken = '>>cmn_Hans<<';
    expect(shapeOf(run)).toEqual(['cells[0]: iterations[0].targetToken is set only on a translate cell']);
  });

  it('detect: bounded to 20 candidates in [0, 1], and only on detect cells', () => {
    const many = makeDetectRun();
    (many.cells[0].iterations[0] as TaskIteration).detect = Array.from({ length: 21 }, (_, i) => ({ language: `l${i}`, confidence: 0.01 }));
    expect(shapeOf(many)).toEqual(['cells[0]: iterations[0].detect must list at most 20 candidates']);
    const bad = makeDetectRun();
    (bad.cells[0].iterations[0] as TaskIteration).detect = [{ language: 'de', confidence: 1.2 }];
    expect(shapeOf(bad)[0]).toMatch(/confidence \(0 to 1\)/);
    const off = makeTaskRun();
    builtIn(off)[0].detect = [{ language: 'en', confidence: 1 }];
    expect(shapeOf(off)).toEqual(['cells[0]: iterations[0].detect is set only on a detect-language cell']);
  });

  it('a non-streaming item records exactly one { t: endT, c: text.length } chunk', () => {
    const run = makeTaskRun();
    const it0 = run.cells[1].iterations[0] as TaskIteration;
    it0.chunks = [{ t: it0.endT - 1, c: it0.text.length }];
    expect(shapeOf(run)).toEqual(['cells[1]: iterations[0]: a non-streaming item records exactly one chunk { t: endT, c: text.length }']);
  });

  it('a failed item carries an empty text', () => {
    const run = makeTaskRun();
    const failed = flatItem(1, 'cnn/2', 6000, 60_000, '');
    failed.error = { name: 'TimeoutError', message: 'item cnn/2 took longer than 60000 ms' };
    run.cells[1].iterations[1] = failed;
    expect(shapeOf(run)).toEqual([]);
    run.cells[1].iterations[1] = { ...flatItem(1, 'cnn/2', 6000, 900, 'partial'), error: failed.error };
    expect(shapeOf(run)).toEqual(['cells[1]: iterations[1]: an item that failed carries an empty text']);
  });

  it('skips the quality.outputs rule: a task cell carries no quality at all', () => {
    const run = makeTaskRun();
    run.cells[0].quality = { taskId: 'x', score: 1, n: 1 };
    expect(shapeOf(run)).toEqual(['cells[0]: a task cell carries no quality record']);
  });

  it('keeps the iteration base checks (numeric times, text at most 20000)', () => {
    const run = makeTaskRun();
    const long = 'y'.repeat(20_001);
    run.cells[1].iterations[0] = flatItem(0, 'cnn/1', 5000, 900, long);
    expect(shapeOf(run)).toEqual(['cells[1].iterations[0].text exceeds 20000 chars']);
  });

  it('cells run arm by arm in systemOrder and every arm has a cell', () => {
    const swapped = makeTaskRun();
    swapped.cells.reverse();
    expect(shapeOf(swapped)).toEqual([
      'cells: cell of chrome-ai/chrome-summarizer runs after a later arm of harness.control.tasks.systemOrder',
    ]);
    const short = makeTaskRun();
    short.cells.pop();
    expect(shapeOf(short)).toEqual(['cells: no cell records the arm transformers-wasm/distilbart-cnn-6-6@q8 of harness.control.tasks.systemOrder']);
  });

  it('checks the driver record shape when present', () => {
    const run = makeTaskRun();
    const driver = {
      driverVersion: '1.0.0',
      launch: { executablePath: '/Applications/Google Chrome.app', args: ['--unlimited-storage'], ignoredDefaultArgs: ['--disable-component-update'], commandLine: 'chrome --unlimited-storage' },
      profileId: 'm4max-1',
      chromeVersionText: 'Google Chrome 156.0.8078.48',
      components: { start: { text: 'Optimization Guide On Device Models Manifest', parsed: [{ name: 'Optimization Guide On Device Models Manifest', id: 'abc', version: '2025.8.8.1141', status: 'Up-to-date' }] } },
      onDeviceInternals: { start: { text: 'Performance class: High', performanceClass: 'High' } },
      freeDiskBytes: { start: 30_000_000_000, end: 29_000_000_000 },
      profileFolderBytes: { start: { OptGuideOnDeviceModel: 4_000_000_000 } },
    };
    tasksOf(run).driver = driver as never;
    expect(shapeOf(run)).toEqual([]);
    tasksOf(run).driver = { ...driver, freeDiskBytes: { start: -1 } } as never;
    expect(shapeOf(run)).toEqual(['harness.control.tasks.driver.freeDiskBytes must be { start, end? } with each a byte count']);
    tasksOf(run).driver = { ...driver, launch: { ...driver.launch, args: 'x' } } as never;
    expect(shapeOf(run)[0]).toMatch(/driver.launch must be/);
  });

  it('keeps the earlier kinds and the archived fixtures valid', () => {
    for (const run of [makeRun(), makeAnalysisRun(), makeSecondAnalysisRun(), ...errataRuns()]) {
      expect(validateRunShape(run, { anyProtocol: true })).toEqual([]);
    }
    for (const kind of CONTROL_KINDS.filter((k) => k !== 'chrome-ai-tasks')) {
      const options = kind === 'wasm-default' || kind === 'wasm-threads' ? { numThreads: 8 } : kind === 'current-releases'
        ? { runtimeVersions: { '@huggingface/transformers': '4.3.1', '@mlc-ai/web-llm': '0.2.80', '@wllama/wllama': '3.5.1', '@wllama/wllama-compat': '3.5.1', '@litert-lm/core': '0.12.1' } }
        : {};
      const run = makeRun();
      run.harness.control = createHarnessControl(kind, options);
      expect(validateRunShape(run)).toEqual([]);
    }
  });
});

describe('checkPlausibility() on a chrome-ai-tasks run', () => {
  it('the valid fixtures carry no flag', () => {
    expect(codes(makeTaskRun())).toEqual([]);
    expect(codes(makeDetectRun())).toEqual([]);
  });

  it('keeps fingerprint-missing and fingerprint-implausible', () => {
    expect(codes(makeTaskRun({ fingerprint: null }))).toEqual(['reject:fingerprint-missing']);
    expect(codes(makeTaskRun({ fingerprint: { mflops: 0.5, n: 1, iterations: 1, durationMs: 1, checksum: 1 } }))).toEqual(['reject:fingerprint-implausible']);
  });

  it('keeps load-time-reversed', () => {
    const run = makeTaskRun();
    run.cells[0].load = { cached: true, startT: 900, endT: 800 };
    expect(codes(run)).toEqual(['reject:load-time-reversed']);
  });

  it('keeps trace-not-monotonic within an item', () => {
    const run = makeTaskRun();
    builtIn(run)[1].chunks[2].t = builtIn(run)[1].chunks[0].t - 1;
    expect(codes(run)).toEqual(['reject:trace-not-monotonic']);
  });

  it('adapts text-chunk-mismatch: holds on deltas and on a non-streaming item', () => {
    const delta = makeTaskRun();
    builtIn(delta)[0].chunks[0].c += 1;
    expect(codes(delta)).toEqual(['reject:text-chunk-mismatch']);
  });

  it('skips degenerate-generation: a 2-character code and an empty failed output are data', () => {
    const run = makeTaskRun();
    const failed = flatItem(1, 'cnn/2', 6000, 900, '');
    failed.error = { name: 'QuotaExceededError', message: 'input too large' };
    run.cells[1].iterations[1] = failed;
    run.cells[1].iterations[2] = flatItem(2, 'cnn/3', 7000, 850, 'ok');
    expect(codes(run)).toEqual([]);
    expect(codes(makeDetectRun())).toEqual([]);
  });

  it('skips the decode and overall rate envelopes (no model size for the built-in)', () => {
    const run = makeTaskRun();
    const text = 'z'.repeat(9000);
    run.cells[1].iterations[0] = flatItem(0, 'cnn/1', 5000, 10, text); // 900,000 chars/s
    builtIn(run)[0] = { ...streamedItem(0, 'cnn/1', 1000, text) };
    expect(codes(run)).toEqual([]);
  });

  it('adapts ttft-implausible: summarize and translate incremental items only', () => {
    const fast = makeTaskRun();
    for (const it of builtIn(fast)) {
      it.chunks = [{ t: it.startT + 0.3, c: 5 }, { t: it.startT + 200, c: 5 }, { t: it.startT + 400, c: it.text.length - 10 }];
    }
    expect(codes(fast)).toEqual(['reject:ttft-implausible']);
    // A warm language detection of 0.03 ms is no finding.
    expect(codes(makeDetectRun())).toEqual([]);
  });

  it('keeps the timer-grid warning', () => {
    const run = makeTaskRun({ environment: { ...makeTaskRun().environment, timerResolutionUs: 100 } });
    const items = Array.from({ length: 3 }, (_, i) => ({
      ...streamedItem(i, `cnn/${i + 1}`, 1000 + i * 1000),
    }));
    for (const it of items) for (const c of it.chunks) c.t += 0.037;
    for (const it of items) it.chunks.push(...Array.from({ length: 5 }, (_, k) => ({ t: it.endT - 5 + k * 0.5 + 0.037, c: 0 })));
    run.cells[0].iterations = items;
    expect(codes(run)).toEqual(['warn:timer-grid']);
  });

  it('keeps software-renderer (reject with a WebGPU cell, warn otherwise)', () => {
    const env = { ...makeTaskRun().environment, webglRenderer: 'ANGLE (Google, SwiftShader Device)' };
    expect(codes(makeTaskRun({ environment: env }))).toEqual(['warn:software-renderer']);
    const gpu = makeTaskRun({ environment: env });
    gpu.cells[1].resolvedBackend = 'webgpu';
    expect(codes(gpu)).toEqual(['reject:software-renderer']);
  });
});

describe('summaries, client-summary agreement and the digest', () => {
  it('first output only from incremental items, total over non-failed items, item 0 left out when processCold', () => {
    const run = makeTaskRun();
    const [chrome, fallback] = summarizeRun(run);
    expect(chrome.firstOutputMs?.n).toBe(2);
    expect(chrome.firstOutputMs?.median).toBe(200);
    expect(chrome.itemTotalMs?.median).toBe(450);
    expect(fallback.firstOutputMs).toBeUndefined();
    expect(fallback.itemTotalMs?.n).toBe(2);
    expect(fallback.itemTotalMs?.median).toBe(825);
    tasksOf(run).processCold = false;
    expect(summarizeRun(run)[1].itemTotalMs?.median).toBe(850);
  });

  it('counts failed items', () => {
    const run = makeTaskRun();
    run.cells[1].iterations[2] = { ...flatItem(2, 'cnn/3', 7000, 1, ''), error: { name: 'Error', message: 'x' } };
    expect(summarizeRun(run)[1].itemsFailed).toBe(1);
  });

  it('adapts client-summary-disagrees to firstOutputMs and itemTotalMs', () => {
    const run = makeTaskRun();
    run.clientSummaries = summarizeRun(run);
    expect(validateSubmission(run).ok).toBe(true);
    run.clientSummaries[1].itemTotalMs!.median = 900;
    run.clientSummaries[0].firstOutputMs!.median = 150;
    const flags = validateSubmission(run).flags.map((f) => `${f.code} ${f.message.split(' ')[0]}`);
    expect(flags).toEqual(['client-summary-disagrees firstOutputMs', 'client-summary-disagrees itemTotalMs']);
  });

  it('round-trips the digest and detects a changed item', async () => {
    const run = makeTaskRun();
    run.digest = await computeRunDigest(run);
    expect(await verifyRunDigest(run)).toBe(true);
    builtIn(run)[0].endT += 1;
    expect(await verifyRunDigest(run)).toBe(false);
  });
});
