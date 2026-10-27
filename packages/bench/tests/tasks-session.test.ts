/**
 * runTaskSession() over in-memory systems that stream through real timer
 * boundaries: ordering, the per-item watchdog, chunk modes, preflight,
 * beforeLoad, load failure, the finalize handshake, and that the result
 * passes the validator and its digest verifies. The model boundary (Chrome's
 * task APIs, Transformers.js, MediaPipe) is exercised by the host's
 * real-browser spec, not here.
 */

import { describe, expect, it } from 'vitest';
import {
  TaskPreflightError,
  createHarnessControl,
  runTaskSession,
  sha256HexSync,
  validateSubmission,
  verifyRunDigest,
  type BenchModelRef,
  type HarnessInfo,
  type LoadedTaskSystem,
  type TaskItem,
  type TaskPlannedCell,
  type TaskSessionOptions,
  type TaskSystemAdapter,
  type TaskIteration,
} from '../src/index.js';
import { tasksRecord } from './fixtures/task-runs.js';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function items(n: number, prefix = 'cnn'): TaskItem[] {
  return Array.from({ length: n }, (_, i) => {
    const text = `Article ${i} text for the session.`;
    return { id: `${prefix}/${i}`, text, sha256: sha256HexSync(text) };
  });
}

function model(runtimeId: BenchModelRef['runtimeId'], systemId: string): BenchModelRef {
  return { benchModelId: systemId, runtimeId, providerModelId: systemId, displayName: systemId, task: 'task' };
}

type Mode = 'delta' | 'cumulative' | 'none';

/** A system that answers each item after real timer gaps, in the given mode. */
function system(
  log: string[],
  name: string,
  mode: Mode,
  opts: { hangOn?: string; failLoad?: boolean; failOn?: string; download?: boolean } = {},
): TaskSystemAdapter {
  return {
    async availability() {
      log.push(`${name}:availability`);
      return 'available';
    },
    async load(_cell, ctx) {
      log.push(`${name}:load`);
      await wait(3);
      ctx.onProgress(50);
      ctx.onProgress(100);
      if (opts.failLoad) throw Object.assign(new Error('create failed'), { name: 'NotSupportedError' });
      const loaded: LoadedTaskSystem = {
        api: name,
        resolvedBackend: mode === 'none' ? 'wasm' : 'chrome-builtin',
        runtimeConfig: { dtype: 'q8' },
        availabilityAtCreate: 'available',
        inputQuota: 4000,
        ...(opts.download ? { download: { events: [{ t: 1, loaded: 0, total: 1 }, { t: 2, loaded: 1, total: 1 }], wallMs: 12 } } : {}),
        async measureInputUsage(item) {
          return { value: item.text.length / 4, unit: 'chrome-quota' };
        },
        async runItem(item, ctx) {
          log.push(`${name}:item:${item.id}`);
          if (item.id === opts.hangOn) {
            await new Promise<void>((_, reject) => ctx.abortSignal.addEventListener('abort', () => reject(new Error('aborted by watchdog'))));
          }
          if (item.id === opts.failOn) throw new DOMException('input too large', 'QuotaExceededError');
          const words = ['Short ', 'summary ', 'of ', item.id];
          if (mode === 'none') {
            await wait(4);
            return { mode, text: words.join('') };
          }
          let acc = '';
          for (const w of words) {
            await wait(2);
            acc += w;
            ctx.onChunk(mode === 'delta' ? w : acc, performance.now());
          }
          return { mode, text: acc };
        },
        async availability() {
          return 'available';
        },
        async dispose() {
          log.push(`${name}:dispose`);
        },
      };
      return loaded;
    },
  };
}

function session(overrides: Partial<TaskSessionOptions> = {}, tasksOverrides = {}): { options: TaskSessionOptions; log: string[] } {
  const log: string[] = [];
  const tasks = tasksRecord({ itemList: { id: 'summarize-cnndm-pilot', count: 3, sha256: 'd'.repeat(64) }, subset: 'pilot', phase: 'pilot', ...tasksOverrides });
  const harness: HarnessInfo = { name: '@localmode/bench', version: '0.10.0', control: createHarnessControl('chrome-ai-tasks', { tasks }) };
  const cells: TaskPlannedCell[] = [
    { model: model('transformers-wasm', 'distilbart-cnn-6-6@q8'), workloadId: 'summarize-cnndm-pilot', items: items(3) },
    { model: model('chrome-ai', 'chrome-summarizer'), workloadId: 'summarize-cnndm-pilot', items: items(3) },
  ];
  const adapters = new Map<string, TaskSystemAdapter>([
    ['chrome-ai/chrome-summarizer', system(log, 'chrome', 'delta')],
    ['transformers-wasm/distilbart-cnn-6-6@q8', system(log, 'fallback', 'none')],
  ]);
  return { options: { harness, cells, adapters, skipFingerprint: true, memorySampleTimeoutMs: 50, ...overrides }, log };
}

describe('runTaskSession()', () => {
  it('runs the cells in systemOrder, one item per call, and yields a valid run with a verifying digest', async () => {
    const { options, log } = session({ skipFingerprint: false });
    const run = await runTaskSession(options);
    expect(log.filter((l) => !l.includes(':item:'))).toEqual([
      'chrome:availability', 'chrome:load', 'chrome:dispose',
      'fallback:availability', 'fallback:load', 'fallback:dispose',
    ]);
    expect(run.cells.map((c) => c.cellId)).toEqual([
      'chrome-ai/chrome-summarizer/summarize-cnndm-pilot',
      'transformers-wasm/distilbart-cnn-6-6@q8/summarize-cnndm-pilot',
    ]);
    expect(run.harness.control?.runtimeOrder).toEqual(['chrome-ai', 'transformers-wasm']);
    expect(run.suite).toBe('custom');
    const chrome = run.cells[0];
    expect(chrome.task).toMatchObject({ api: 'chrome', availabilityBefore: 'available', availabilityAtCreate: 'available', availabilityAfter: 'available', inputQuota: 4000 });
    expect(chrome.load?.progress?.map((p) => p.pct)).toEqual([50, 100]);
    const it0 = chrome.iterations[0] as TaskIteration;
    expect(it0).toMatchObject({ itemId: 'cnn/0', index: 0, chunkMode: 'delta', text: 'Short summary of cnn/0', inputUsage: { value: options.cells[0].items[0].text.length / 4, unit: 'chrome-quota' } });
    expect(it0.chunks.map((c) => c.c)).toEqual([6, 8, 3, 5]);
    expect(it0.chunks[0].t).toBeGreaterThan(it0.startT);
    expect(it0.endT).toBeGreaterThanOrEqual(it0.chunks[3].t);
    expect(it0.outputSha256).toBe(sha256HexSync(it0.text));
    expect(it0.source).toBeUndefined();
    const flat = run.cells[1].iterations[2] as TaskIteration;
    expect(flat.chunkMode).toBe('none');
    expect(flat.chunks).toEqual([{ t: flat.endT, c: flat.text.length }]);
    expect(run.fingerprint?.mflops).toBeGreaterThan(1);
    expect(await verifyRunDigest(run)).toBe(true);
    const report = validateSubmission(run);
    expect(report.shapeErrors).toEqual([]);
    expect(report.flags).toEqual([]);
    expect(report.ok).toBe(true);
    expect(run.events.map((e) => e.type)).toContain('suite-end');
  });

  it('converts a cumulative stream to deltas and marks it', async () => {
    const { options, log } = session();
    (options.adapters as Map<string, TaskSystemAdapter>).set('chrome-ai/chrome-summarizer', system(log, 'chrome', 'cumulative'));
    const run = await runTaskSession(options);
    const it = run.cells[0].iterations[1] as TaskIteration;
    expect(it.chunkMode).toBe('cumulative-converted');
    expect(it.text).toBe('Short summary of cnn/1');
    expect(it.chunks.map((c) => c.c)).toEqual([6, 8, 3, 5]);
    expect(validateSubmission(run).shapeErrors).toEqual([]);
  });

  it('waits on the pressure gate between arms only', async () => {
    const { options } = session();
    const events: Array<{ t: number; type: string; detail?: string }> = [];
    const trace = {
      async attach() {},
      async dispose() {},
      record(type: string, detail?: string) {
        events.push({ t: performance.now(), type, ...(detail ? { detail } : {}) });
      },
      pressureState: 'critical',
      get all() {
        return events;
      },
    };
    const start = performance.now();
    await runTaskSession({ ...options, trace: trace as never, pressureGateMs: 60 });
    expect(events.filter((e) => e.type === 'cooldown-start')).toHaveLength(1);
    expect(performance.now() - start).toBeGreaterThanOrEqual(60);
  });

  it('records a watchdog timeout as that item\'s error, emits item-error, and runs the next item', async () => {
    const { options, log } = session({ watchdogMs: { summarize: 40 } });
    (options.adapters as Map<string, TaskSystemAdapter>).set('chrome-ai/chrome-summarizer', system(log, 'chrome', 'delta', { hangOn: 'cnn/1' }));
    const run = await runTaskSession(options);
    const its = run.cells[0].iterations as TaskIteration[];
    expect(its.map((i) => i.itemId)).toEqual(['cnn/0', 'cnn/1', 'cnn/2']);
    expect(its[1].error).toMatchObject({ name: 'TimeoutError' });
    expect(its[1].text).toBe('');
    expect(its[2].text).toBe('Short summary of cnn/2');
    expect(run.events.filter((e) => e.type === 'item-error').map((e) => e.detail)).toEqual([
      'chrome-ai/chrome-summarizer/summarize-cnndm-pilot cnn/1: TimeoutError',
    ]);
    expect(log.filter((l) => l === 'chrome:item:cnn/1')).toHaveLength(1);
    // The only finding is the fingerprint these sequencing tests skip.
    const report = validateSubmission(run);
    expect(report.shapeErrors).toEqual([]);
    expect(report.flags.map((f) => f.code)).toEqual(['fingerprint-missing']);
    expect(report.summaries[0].itemsFailed).toBe(1);
  });

  it('records a thrown item error with its name and keeps going', async () => {
    const { options, log } = session();
    (options.adapters as Map<string, TaskSystemAdapter>).set('chrome-ai/chrome-summarizer', system(log, 'chrome', 'delta', { failOn: 'cnn/0' }));
    const run = await runTaskSession(options);
    const its = run.cells[0].iterations as TaskIteration[];
    expect(its[0].error?.name).toBe('QuotaExceededError');
    expect(its[1].error).toBeUndefined();
  });

  it('a failed preflight records the preflight event and throws TaskPreflightError (no run)', async () => {
    const events: string[] = [];
    const trace = {
      async attach() {},
      async dispose() {},
      record(type: string, detail?: string) {
        events.push(`${type}:${detail ?? ''}`);
      },
      pressureState: undefined,
      all: [],
    };
    const { options, log } = session({ preflight: async () => ({ ok: false, detail: 'Translator en-de reads downloadable' }), trace: trace as never });
    await expect(runTaskSession(options)).rejects.toBeInstanceOf(TaskPreflightError);
    expect(events).toContain('preflight:failed: Translator en-de reads downloadable');
    expect(log).toEqual([]);
  });

  it('records a passing preflight', async () => {
    const { options } = session({ preflight: async () => ({ ok: true, detail: 'every API available' }) });
    const run = await runTaskSession(options);
    expect(run.events.find((e) => e.type === 'preflight')?.detail).toBe('ok: every API available');
  });

  it('awaits beforeLoad before each load', async () => {
    const { options, log } = session({
      beforeLoad: async (cell) => {
        await wait(5);
        log.push(`beforeLoad:${cell.model.benchModelId}`);
      },
    });
    await runTaskSession(options);
    expect(log.indexOf('beforeLoad:chrome-summarizer')).toBe(log.indexOf('chrome:load') - 1);
    expect(log.indexOf('beforeLoad:distilbart-cnn-6-6@q8')).toBe(log.indexOf('fallback:load') - 1);
  });

  it('a load failure gives an error cell and the session continues', async () => {
    const { options, log } = session();
    (options.adapters as Map<string, TaskSystemAdapter>).set('chrome-ai/chrome-summarizer', system(log, 'chrome', 'delta', { failLoad: true }));
    const run = await runTaskSession(options);
    expect(run.cells[0]).toMatchObject({ status: 'error', iterations: [], error: { name: 'NotSupportedError', message: 'create failed' } });
    expect(run.cells[1].status).toBe('ok');
    expect(validateSubmission(run).shapeErrors).toEqual([]);
  });

  it('verify() runs untimed after the load and its entries join runtimeConfig', async () => {
    const { options, log } = session();
    const base = system(log, 'fallback', 'none');
    (options.adapters as Map<string, TaskSystemAdapter>).set('transformers-wasm/distilbart-cnn-6-6@q8', {
      ...base,
      async load(cell, ctx) {
        const loaded = await base.load(cell, ctx);
        return { ...loaded, async verify() { log.push('fallback:verify'); return { pinVerified: true, pinFiles: 6 }; } };
      },
    });
    const run = await runTaskSession(options);
    expect(log.indexOf('fallback:verify')).toBe(log.indexOf('fallback:load') + 1);
    expect(log.indexOf('fallback:verify')).toBeLessThan(log.findIndex((l) => l.startsWith('fallback:item:')));
    expect(run.cells[1].runtimeConfig).toEqual({ dtype: 'q8', pinVerified: true, pinFiles: 6 });
    expect(run.cells[1].iterations).toHaveLength(3);
  });

  it('a verify() failure makes an error cell: the system is disposed and no item runs', async () => {
    const { options, log } = session();
    const base = system(log, 'fallback', 'none');
    (options.adapters as Map<string, TaskSystemAdapter>).set('transformers-wasm/distilbart-cnn-6-6@q8', {
      ...base,
      async load(cell, ctx) {
        const loaded = await base.load(cell, ctx);
        return { ...loaded, async verify() { throw Object.assign(new Error('onnx/encoder_model_quantized.onnx sha256 mismatch'), { name: 'PinError' }); } };
      },
    });
    const run = await runTaskSession(options);
    expect(run.cells[1]).toMatchObject({ status: 'error', iterations: [], error: { name: 'PinError', message: 'onnx/encoder_model_quantized.onnx sha256 mismatch' } });
    expect(log.filter((l) => l.startsWith('fallback:item:'))).toEqual([]);
    expect(log).toContain('fallback:dispose');
    expect(validateSubmission(run).shapeErrors).toEqual([]);
  });

  it('writes the finalize captures into tasks.driver and the download records, inside the digest', async () => {
    const driver = {
      driverVersion: '1.0.0',
      launch: { executablePath: '/chrome', args: [], ignoredDefaultArgs: [], commandLine: 'chrome' },
      profileId: 'p1',
      chromeVersionText: 'Google Chrome 156',
      components: { start: { text: 'start', parsed: [] } },
      onDeviceInternals: { start: { text: 'start' } },
      freeDiskBytes: { start: 1000 },
      profileFolderBytes: { start: { TranslateKit: 10 } },
    };
    const { options, log } = session(
      {
        finalize: async () => ({
          components: { text: 'end', parsed: [{ name: 'Optimization Guide On Device Models Manifest', id: 'x', version: '2025.8.8.1141', status: 'Up-to-date' }] },
          onDeviceInternals: { text: 'end', performanceClass: 'High' },
          freeDiskBytes: 900,
          profileFolderBytes: { TranslateKit: 110 },
          profileBytesDeltaByCell: { 'chrome-ai/chrome-summarizer/summarize-cnndm-pilot': 100 },
        }),
      },
      { driver },
    );
    (options.adapters as Map<string, TaskSystemAdapter>).set('chrome-ai/chrome-summarizer', system(log, 'chrome', 'delta', { download: true }));
    const run = await runTaskSession(options);
    const d = run.harness.control!.tasks!.driver!;
    expect(d.components.end?.parsed[0].version).toBe('2025.8.8.1141');
    expect(d.onDeviceInternals.end?.performanceClass).toBe('High');
    expect(d.freeDiskBytes).toEqual({ start: 1000, end: 900 });
    expect(d.profileFolderBytes.end).toEqual({ TranslateKit: 110 });
    expect(run.cells[0].task?.download).toEqual({ events: [{ t: 1, loaded: 0, total: 1 }, { t: 2, loaded: 1, total: 1 }], wallMs: 12, profileBytesDelta: 100 });
    // The caller's record is untouched.
    expect((options.harness.control!.tasks!.driver as typeof driver & { freeDiskBytes: { end?: number } }).freeDiskBytes.end).toBeUndefined();
    expect(await verifyRunDigest(run)).toBe(true);
    expect(validateSubmission(run).shapeErrors).toEqual([]);
  });

  it('runs a download session (no items) to an ok cell', async () => {
    const { options } = session({}, { phase: 'download', subset: 'pilot' });
    const cells = options.cells.map((c) => ({ ...c, items: [] }));
    const run = await runTaskSession({ ...options, cells });
    expect(run.cells.map((c) => [c.status, c.iterations.length])).toEqual([['ok', 0], ['ok', 0]]);
    expect(validateSubmission(run).shapeErrors).toEqual([]);
  });

  it('refuses a cell whose arm is not in systemOrder, an arm without a cell, and a missing adapter', async () => {
    const { options } = session();
    await expect(runTaskSession({ ...options, cells: [...options.cells, { model: model('mediapipe', 'x'), workloadId: 'w', items: [] }] })).rejects.toThrow(/arm not in/);
    await expect(runTaskSession({ ...options, cells: options.cells.slice(0, 1) })).rejects.toThrow(/has no cell/);
    await expect(runTaskSession({ ...options, adapters: new Map() })).rejects.toThrow(/no adapter for arm/);
    await expect(runTaskSession({ ...options, harness: { name: 'h', version: '1' } })).rejects.toThrow(/needs harness.control/);
  });
});
