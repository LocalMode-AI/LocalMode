/**
 * The llama.cpp offload record: `offloadReportError` (run by
 * `validateRunShape` on every cell) requires `resolvedBackend` to agree with
 * the engine's offload report, and the runner's warm-reload path calls an
 * adapter's untimed `settle()` after the timed span so a lazily loading
 * engine's report reaches the warm-reload cell. The runner is driven through
 * the public `runBenchmarkSuite` with a mock adapter whose engine, like
 * wllama's, loads only on first use.
 */
import { describe, expect, it } from 'vitest';
import {
  LLM_WORKLOADS,
  offloadReportError,
  runBenchmarkSuite,
  RUN_POLICIES,
  validateRunShape,
  type LLMRuntimeAdapter,
  type LoadedLLM,
} from '../src/index.js';
import { makeRun, MODEL_REF } from './helpers.js';

const TEST_POLICY = { ...RUN_POLICIES.quick, cooldownMs: 1, pressureGate: false, measureWarmReload: true };

describe('offloadReportError()', () => {
  const cell = (resolvedBackend: string, runtimeConfig: Record<string, unknown>) => ({ resolvedBackend, runtimeConfig });

  it('accepts records that agree, and every record shape archived runs carry', () => {
    expect(offloadReportError(cell('webgpu', { n_gpu_layers: -1, offloadedLayers: '31/31' }))).toBeUndefined();
    expect(offloadReportError(cell('wasm', { n_gpu_layers: 0, offloadedLayers: '0/31' }))).toBeUndefined();
    expect(offloadReportError(cell('webgpu', { n_gpu_layers: -1, offloadedLayers: '31/31', gpu_fallback: false }))).toBeUndefined();
    expect(offloadReportError(cell('wasm', { n_gpu_layers: -1, offloadedLayers: 'unreported', gpu_fallback: true }))).toBeUndefined();
    expect(offloadReportError(cell('wasm', { n_gpu_layers: -1, offloadedLayers: '0/31', gpu_fallback: true }))).toBeUndefined();
    // Before 0.9.9: an unreported WebGPU-lane record carried the requested backend and no gpu_fallback.
    expect(offloadReportError(cell('webgpu', { n_gpu_layers: -1, offloadedLayers: 'unreported' }))).toBeUndefined();
    // A record read before the engine loaded.
    expect(offloadReportError(cell('unknown', { n_gpu_layers: -1, offloadedLayers: 'unreported' }))).toBeUndefined();
    // Cells without an offload report are not llama.cpp cells.
    expect(offloadReportError(cell('wasm', { device: 'wasm', dtype: 'q4' }))).toBeUndefined();
    expect(offloadReportError({ resolvedBackend: 'webgpu' })).toBeUndefined();
  });

  it('rejects a backend the offload report contradicts', () => {
    expect(offloadReportError(cell('webgpu', { n_gpu_layers: -1, offloadedLayers: '0/31' }))).toBe(
      'resolvedBackend is "webgpu" but llama.cpp offloaded 0/31 layers (expected "wasm")',
    );
    expect(offloadReportError(cell('wasm', { n_gpu_layers: -1, offloadedLayers: '12/31' }))).toBe(
      'resolvedBackend is "wasm" but llama.cpp offloaded 12/31 layers (expected "webgpu")',
    );
    expect(offloadReportError(cell('webgpu', { n_gpu_layers: -1, offloadedLayers: 'unreported', gpu_fallback: true }))).toBe(
      'resolvedBackend is "webgpu" but runtimeConfig.gpu_fallback is true (expected "wasm")',
    );
    expect(offloadReportError(cell('webgpu', { n_gpu_layers: -1, offloadedLayers: 'unreported', gpu_fallback: false }))).toBe(
      'runtimeConfig.gpu_fallback is false but llama.cpp offloaded no layers (unreported)',
    );
    expect(offloadReportError(cell('webgpu', { n_gpu_layers: -1, offloadedLayers: '31/31', gpu_fallback: true }))).toBe(
      'runtimeConfig.gpu_fallback is true but llama.cpp offloaded 31/31 layers',
    );
    expect(offloadReportError(cell('wasm', { n_gpu_layers: 0, offloadedLayers: '0/31', gpu_fallback: true }))).toBe(
      'runtimeConfig.gpu_fallback is set only on a lane that requested GPU layers (n_gpu_layers not 0)',
    );
    expect(offloadReportError(cell('wasm', { offloadedLayers: '0/31', gpu_fallback: 'yes' }))).toBe(
      'runtimeConfig.gpu_fallback must be a boolean',
    );
    expect(offloadReportError(cell('wasm', { offloadedLayers: 'none' }))).toBe(
      'runtimeConfig.offloadedLayers must be "N/M" or "unreported", got "none"',
    );
  });

  it('validateRunShape reports a disagreeing cell by index', () => {
    const run = makeRun();
    run.cells[0].resolvedBackend = 'webgpu';
    run.cells[0].runtimeConfig = { n_gpu_layers: -1, offloadedLayers: 'unreported', gpu_fallback: true };
    expect(validateRunShape(run)).toEqual([
      'cells[0]: resolvedBackend is "webgpu" but runtimeConfig.gpu_fallback is true (expected "wasm")',
    ]);
    run.cells[0].resolvedBackend = 'wasm';
    expect(validateRunShape(run)).toEqual([]);
  });
});

/** A wllama-like adapter: the engine loads on first use; the record reads the engine's report. */
function lazyEngineAdapter(options: { settleFails?: boolean; withSettle?: boolean } = {}) {
  const events: string[] = [];
  let clock = 0;
  const adapter: LLMRuntimeAdapter = {
    runtimeId: 'wllama-webgpu',
    displayName: 'lazy engine',
    runtimeVersion: 'mock',
    isAvailable: async () => ({ ok: true }),
    isModelCached: async () => false,
    async load(): Promise<LoadedLLM> {
      events.push('load');
      let engineLoaded = false;
      const loadEngine = () => {
        if (!engineLoaded) events.push(`engine-load #${++clock}`);
        engineLoaded = true;
      };
      const handle: LoadedLLM = {
        model: {
          modelId: 'm',
          provider: 'wllama',
          async *doStream() {
            loadEngine();
            for (let i = 0; i < 6; i++) {
              await new Promise((r) => setTimeout(r, 2));
              yield { text: 'token ', done: false };
            }
            yield { text: '', done: true, finishReason: 'stop' };
          },
          async doGenerate() {
            loadEngine();
            return { text: 'ready', finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, durationMs: 1 } };
          },
        },
        get resolvedBackend() {
          return engineLoaded ? 'wasm' : 'unknown';
        },
        get runtimeConfig() {
          return engineLoaded
            ? { n_gpu_layers: -1, offloadedLayers: 'unreported', gpu_fallback: true }
            : { n_gpu_layers: -1, offloadedLayers: 'unreported' };
        },
        dispose: async () => {
          events.push('dispose');
        },
      };
      if (options.withSettle !== false) {
        handle.settle = async () => {
          events.push('settle');
          if (options.settleFails) throw new Error('engine failed to load');
          loadEngine();
        };
      }
      return handle;
    },
  };
  return { adapter, events };
}

async function run(adapter: LLMRuntimeAdapter) {
  return runBenchmarkSuite({
    suite: 'custom',
    cells: [{ model: { ...MODEL_REF, runtimeId: 'wllama-webgpu' }, workload: LLM_WORKLOADS[0] }],
    policy: TEST_POLICY,
    llmAdapters: new Map([['wllama-webgpu', adapter]]),
    embedAdapters: new Map(),
    harness: { name: '@localmode/bench', version: 'test' },
    skipFingerprint: true,
  });
}

describe('runner: warm-reload settle()', () => {
  it('settles the reloaded handle after its timed span and records the engine report, as the timed cell does', async () => {
    const { adapter, events } = lazyEngineAdapter();
    const result = await run(adapter);
    // Cold load, warmup loads the engine, timed cell, dispose; reload, settle, dispose.
    expect(events).toEqual(['load', 'engine-load #1', 'dispose', 'load', 'settle', 'engine-load #2', 'dispose']);
    const timed = result.cells.find((c) => c.workloadId === LLM_WORKLOADS[0].id)!;
    const warm = result.cells.find((c) => c.workloadId === 'warm-reload')!;
    expect(timed.resolvedBackend).toBe('wasm');
    expect(warm.resolvedBackend).toBe('wasm');
    expect(warm.runtimeConfig).toEqual(timed.runtimeConfig);
    expect(warm.runtimeConfig).toEqual({ n_gpu_layers: -1, offloadedLayers: 'unreported', gpu_fallback: true });
    expect(validateRunShape(result)).toEqual([]);
  });

  it('a settle failure keeps the timed warm-reload cell, with the record as the adapter reads it', async () => {
    const { adapter, events } = lazyEngineAdapter({ settleFails: true });
    const result = await run(adapter);
    expect(events.slice(-3)).toEqual(['load', 'settle', 'dispose']);
    const warm = result.cells.find((c) => c.workloadId === 'warm-reload')!;
    expect(warm.status).toBe('ok');
    expect(warm.resolvedBackend).toBe('unknown');
    expect(warm.runtimeConfig).toEqual({ n_gpu_layers: -1, offloadedLayers: 'unreported' });
    expect(validateRunShape(result)).toEqual([]);
  });

  it('an adapter without settle() is read as before', async () => {
    const { adapter, events } = lazyEngineAdapter({ withSettle: false });
    const result = await run(adapter);
    expect(events.slice(-2)).toEqual(['load', 'dispose']);
    expect(result.cells.find((c) => c.workloadId === 'warm-reload')!.resolvedBackend).toBe('unknown');
  });
});
