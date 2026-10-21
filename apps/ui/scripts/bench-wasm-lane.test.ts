/**
 * The Transformers.js WASM lane settings of the WASM-lane control runs
 * (`harness.control.wasmLane`): `wasm-default` (dtype q8 and ONNX Runtime's
 * WASM thread count set to the logical core count), `wasm-q8` (q8 alone, the
 * thread count left to the runtime) and `wasm-threads` (the thread count
 * alone, the protocol's q4/fp32 files), each applied ONLY in its mode.
 *
 * Two layers are exercised through their real code:
 * - the adapters (`createLLMAdapters` / `createEmbedAdapters`) with the worker
 *   client replaced by a recording fake, so the settings each mode sends to
 *   the worker and the runtimeConfig each mode records are observed;
 * - the worker's message handler (`transformers-worker.ts`, driven through its
 *   real `onmessage`), with the provider and Transformers.js modules replaced by
 *   fakes whose ONNX Runtime env behaves as ONNX Runtime Web 1.26 does on
 *   initialisation (`initializeFlags`: `initTimeout` set, `numThreads` kept
 *   when the host set it, else `min(4, ceil(cores / 2))`).
 *
 * Not covered here: the real download and the real ONNX Runtime thread pool.
 * The bench e2e control lane runs a real Quick suite with `?control=wasm-default`
 * and checks the exported cell's runtimeConfig (dtype q8, numThreads equal to
 * hardwareConcurrency, read back from the real runtime env), and the
 * fixed-order lane checks the protocol default on the same build.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHarnessControl, type BenchModelRef, type HarnessControlWasmLane } from '@localmode/bench';

// ---------------------------------------------------------------------------
// Adapter layer: a recording fake of the worker client.
// ---------------------------------------------------------------------------

interface LoadCall {
  kind: 'llm' | 'embedding';
  modelId: string;
  device: string;
  settings: unknown;
}
const loadCalls: LoadCall[] = [];
/** The thread count the fake worker reports back, as the real worker reads it from the runtime env. */
let reportedThreads: number | undefined = 4;

vi.mock('../src/lib/bench/transformers-worker-client', () => ({
  TransformersWorkerLane: class {
    async load(
      kind: 'llm' | 'embedding',
      modelId: string,
      device: string,
      options: { settings?: unknown },
    ): Promise<{ dimensions?: number; numThreads?: number }> {
      loadCalls.push({ kind, modelId, device, settings: options.settings });
      return { dimensions: kind === 'embedding' ? 384 : undefined, numThreads: reportedThreads };
    }
    languageModel(modelId: string) {
      return { modelId };
    }
    embeddingModel(modelId: string, dimensions: number) {
      return { modelId, dimensions };
    }
    async dispose() {}
  },
}));

// ---------------------------------------------------------------------------
// Worker layer: fakes of the provider and Transformers.js modules.
// ---------------------------------------------------------------------------

const CORES = 12;
const fakeEnv = { backends: { onnx: { wasm: {} as { numThreads?: number; initTimeout?: number } } } };
const events: string[] = [];
/** Whether the fake runtime initialises from `fakeEnv` (false: a second Transformers.js instance). */
let runtimeUsesSharedEnv = true;

/** What ONNX Runtime Web's initializeFlags does to the env on the first session. */
function initialiseRuntime() {
  if (!runtimeUsesSharedEnv) return;
  const wasm = fakeEnv.backends.onnx.wasm;
  if (typeof wasm.initTimeout !== 'number') wasm.initTimeout = 0;
  if (typeof wasm.numThreads !== 'number' || !Number.isInteger(wasm.numThreads) || wasm.numThreads <= 0) {
    wasm.numThreads = Math.min(4, Math.ceil(CORES / 2));
  }
}

vi.mock('@huggingface/transformers', () => ({
  env: fakeEnv,
  pipeline: vi.fn(async (task: string, modelId: string, options: Record<string, unknown>) => {
    events.push(
      `pipeline ${task} ${modelId} device=${String(options.device)} dtype=${String(options.dtype)} threadsAtCreate=${String(fakeEnv.backends.onnx.wasm.numThreads)}`,
    );
    initialiseRuntime();
    return { dispose: async () => events.push('pipeline.dispose') };
  }),
}));

vi.mock('@localmode/transformers', () => ({
  installResilientModelCache: vi.fn(() => {
    events.push('installResilientModelCache');
    return true;
  }),
  preloadModel: vi.fn(async (modelId: string, options: { device?: string; quantized?: boolean }) => {
    events.push(
      `preloadModel ${modelId} device=${String(options.device)} quantized=${String(options.quantized)} threadsAtCreate=${String(fakeEnv.backends.onnx.wasm.numThreads)}`,
    );
    initialiseRuntime();
  }),
  transformers: {
    languageModel: vi.fn((modelId: string, settings: Record<string, unknown>) => {
      events.push(`languageModel ${modelId} ${JSON.stringify(settings)}`);
      return { modelId };
    }),
    embedding: vi.fn((modelId: string, settings: Record<string, unknown>) => {
      events.push(`embedding ${modelId} ${JSON.stringify(settings)}`);
      return { modelId, dimensions: 384 };
    }),
  },
}));

const WASM_LANE: HarnessControlWasmLane = { dtype: 'q8', numThreads: CORES, simd: true };

const LLM_MODEL = {
  benchModelId: 'qwen3-0.6b',
  runtimeId: 'transformers-wasm',
  providerModelId: 'onnx-community/Qwen3-0.6B-ONNX',
  displayName: 'Qwen3 0.6B (ONNX, WASM)',
  task: 'llm',
  quantization: 'q4',
} as BenchModelRef;
const EMBED_MODEL = {
  benchModelId: 'bge-small-en',
  runtimeId: 'transformers-wasm',
  providerModelId: 'Xenova/bge-small-en-v1.5',
  displayName: 'BGE Small EN (ONNX, WASM)',
  task: 'embedding',
  quantization: 'q8',
} as BenchModelRef;

describe('WASM lane adapters: settings sent and recorded per mode', () => {
  beforeEach(() => {
    loadCalls.length = 0;
    reportedThreads = 4;
  });

  it('a protocol run sends no settings and records the protocol dtypes with the thread count the runtime used', async () => {
    const { createLLMAdapters, createEmbedAdapters } = await import('../src/lib/bench/adapters');
    const llm = await createLLMAdapters().get('transformers-wasm')!.load(LLM_MODEL, {});
    const embed = await createEmbedAdapters().get('transformers-wasm')!.load(EMBED_MODEL, {});
    expect(loadCalls).toEqual([
      { kind: 'llm', modelId: LLM_MODEL.providerModelId, device: 'wasm', settings: undefined },
      { kind: 'embedding', modelId: EMBED_MODEL.providerModelId, device: 'wasm', settings: undefined },
    ]);
    expect(llm.runtimeConfig).toEqual({ device: 'wasm', dtype: 'q4', worker: true, numThreads: 4 });
    // The provider loads an embedding model at fp32 unless asked for its q8 files.
    expect(embed.runtimeConfig).toEqual({ device: 'wasm', dtype: 'fp32', worker: true, numThreads: 4 });
  });

  it('an empty options object is a protocol run too', async () => {
    const { createLLMAdapters } = await import('../src/lib/bench/adapters');
    await createLLMAdapters({}).get('transformers-wasm')!.load(LLM_MODEL, {});
    expect(loadCalls[0].settings).toBeUndefined();
  });

  it('a wasm-default run sends dtype q8 and the thread count, and records them', async () => {
    reportedThreads = CORES;
    const { createLLMAdapters, createEmbedAdapters } = await import('../src/lib/bench/adapters');
    const llm = await createLLMAdapters({ wasmLane: WASM_LANE }).get('transformers-wasm')!.load(LLM_MODEL, {});
    const embed = await createEmbedAdapters({ wasmLane: WASM_LANE }).get('transformers-wasm')!.load(EMBED_MODEL, {});
    expect(loadCalls).toEqual([
      { kind: 'llm', modelId: LLM_MODEL.providerModelId, device: 'wasm', settings: { dtype: 'q8', numThreads: CORES } },
      { kind: 'embedding', modelId: EMBED_MODEL.providerModelId, device: 'wasm', settings: { dtype: 'q8', numThreads: CORES } },
    ]);
    expect(llm.runtimeConfig).toEqual({ device: 'wasm', dtype: 'q8', worker: true, numThreads: CORES });
    expect(embed.runtimeConfig).toEqual({ device: 'wasm', dtype: 'q8', worker: true, numThreads: CORES });
  });

  it('a wasm-q8 run sends dtype q8 only (no thread count), and records q8 with the runtime\'s own count', async () => {
    reportedThreads = 4; // ONNX Runtime's default, min(4, ceil(12 / 2))
    const wasmLane = createHarnessControl('wasm-q8').wasmLane;
    expect(wasmLane).toEqual({ dtype: 'q8', numThreads: null, simd: true });
    const { createLLMAdapters, createEmbedAdapters } = await import('../src/lib/bench/adapters');
    const llm = await createLLMAdapters({ wasmLane }).get('transformers-wasm')!.load(LLM_MODEL, {});
    const embed = await createEmbedAdapters({ wasmLane }).get('transformers-wasm')!.load(EMBED_MODEL, {});
    expect(loadCalls).toEqual([
      { kind: 'llm', modelId: LLM_MODEL.providerModelId, device: 'wasm', settings: { dtype: 'q8' } },
      { kind: 'embedding', modelId: EMBED_MODEL.providerModelId, device: 'wasm', settings: { dtype: 'q8' } },
    ]);
    expect(llm.runtimeConfig).toEqual({ device: 'wasm', dtype: 'q8', worker: true, numThreads: 4 });
    expect(embed.runtimeConfig).toEqual({ device: 'wasm', dtype: 'q8', worker: true, numThreads: 4 });
  });

  it('a wasm-threads run sends the thread count only (no dtype), and records the protocol dtypes on every core', async () => {
    reportedThreads = CORES;
    const wasmLane = createHarnessControl('wasm-threads', { numThreads: CORES }).wasmLane;
    expect(wasmLane).toEqual({ dtype: 'q4', numThreads: CORES, simd: true });
    const { createLLMAdapters, createEmbedAdapters } = await import('../src/lib/bench/adapters');
    const llm = await createLLMAdapters({ wasmLane }).get('transformers-wasm')!.load(LLM_MODEL, {});
    const embed = await createEmbedAdapters({ wasmLane }).get('transformers-wasm')!.load(EMBED_MODEL, {});
    expect(loadCalls).toEqual([
      { kind: 'llm', modelId: LLM_MODEL.providerModelId, device: 'wasm', settings: { numThreads: CORES } },
      { kind: 'embedding', modelId: EMBED_MODEL.providerModelId, device: 'wasm', settings: { numThreads: CORES } },
    ]);
    expect(llm.runtimeConfig).toEqual({ device: 'wasm', dtype: 'q4', worker: true, numThreads: CORES });
    // The protocol's embedding files: fp32, as on a protocol run.
    expect(embed.runtimeConfig).toEqual({ device: 'wasm', dtype: 'fp32', worker: true, numThreads: CORES });
  });

  it('the wasm-default settings sent are unchanged by the kind table', async () => {
    const { createLLMAdapters } = await import('../src/lib/bench/adapters');
    await createLLMAdapters({ wasmLane: createHarnessControl('wasm-default', { numThreads: CORES }).wasmLane }).get('transformers-wasm')!.load(LLM_MODEL, {});
    expect(JSON.stringify(loadCalls[0].settings)).toBe(`{"dtype":"q8","numThreads":${CORES}}`);
  });

  it('the thread count recorded is the one the worker read back, not the one requested', async () => {
    reportedThreads = 1; // the runtime fell back to one thread
    const { createLLMAdapters } = await import('../src/lib/bench/adapters');
    const llm = await createLLMAdapters({ wasmLane: WASM_LANE }).get('transformers-wasm')!.load(LLM_MODEL, {});
    expect(llm.runtimeConfig).toEqual({ device: 'wasm', dtype: 'q8', worker: true, numThreads: 1 });
    reportedThreads = undefined; // a worker that could not read it records no thread count
    const again = await createLLMAdapters().get('transformers-wasm')!.load(LLM_MODEL, {});
    expect(again.runtimeConfig).toEqual({ device: 'wasm', dtype: 'q4', worker: true });
  });

  it('no other lane is handed the WASM lane settings', async () => {
    const { createLLMAdapters, createEmbedAdapters } = await import('../src/lib/bench/adapters');
    const withLane = createLLMAdapters({ wasmLane: WASM_LANE });
    const without = createLLMAdapters();
    expect([...withLane.keys()]).toEqual([...without.keys()]);
    expect([...createEmbedAdapters({ wasmLane: WASM_LANE }).keys()]).toEqual([...createEmbedAdapters().keys()]);
    // The worker lane is used by the WASM lane only; loading it once records one call.
    await withLane.get('transformers-wasm')!.load(LLM_MODEL, {});
    expect(loadCalls).toHaveLength(1);
  });
});

describe('transformers-worker: applies the settings only when asked', () => {
  let replies: Array<Record<string, unknown>>;
  let onmessage: (e: { data: unknown }) => void;

  beforeEach(async () => {
    replies = [];
    events.length = 0;
    fakeEnv.backends.onnx.wasm = {};
    runtimeUsesSharedEnv = true;
    vi.resetModules();
    const scope: { postMessage: (m: Record<string, unknown>) => void; onmessage: ((e: { data: unknown }) => void) | null } = {
      postMessage: (m) => replies.push(m),
      onmessage: null,
    };
    vi.stubGlobal('self', scope);
    await import('../src/lib/bench/transformers-worker');
    onmessage = scope.onmessage!;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function load(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    onmessage({ data: { id: 1, type: 'load', device: 'wasm', ...data } });
    await vi.waitFor(() => expect(replies.some((r) => r.type === 'loaded' || r.type === 'error')).toBe(true));
    return replies.find((r) => r.type === 'loaded' || r.type === 'error')!;
  }

  it('protocol LLM load: the provider preload at its own dtype, the runtime default thread count, reported back', async () => {
    const reply = await load({ kind: 'llm', modelId: 'onnx-community/Qwen3-0.6B-ONNX' });
    expect(reply).toEqual({ id: 1, type: 'loaded', numThreads: 4 });
    expect(events).toEqual([
      'preloadModel onnx-community/Qwen3-0.6B-ONNX device=wasm quantized=undefined threadsAtCreate=undefined',
      'languageModel onnx-community/Qwen3-0.6B-ONNX {"device":"wasm"}',
    ]);
  });

  it('protocol embedding load: no quantized flag, so the provider loads fp32', async () => {
    const reply = await load({ kind: 'embedding', modelId: 'Xenova/bge-small-en-v1.5' });
    expect(reply).toEqual({ id: 1, type: 'loaded', dimensions: 384, numThreads: 4 });
    expect(events).toEqual([
      'preloadModel Xenova/bge-small-en-v1.5 device=wasm quantized=undefined threadsAtCreate=undefined',
      'embedding Xenova/bge-small-en-v1.5 {"device":"wasm"}',
    ]);
  });

  it('wasm-default LLM load: thread count set before the first session, q8 download + throwaway session, q8 model', async () => {
    const reply = await load({
      kind: 'llm',
      modelId: 'onnx-community/Qwen3-0.6B-ONNX',
      settings: { dtype: 'q8', numThreads: CORES },
    });
    expect(reply).toEqual({ id: 1, type: 'loaded', numThreads: CORES });
    expect(events).toEqual([
      'installResilientModelCache',
      `pipeline text-generation onnx-community/Qwen3-0.6B-ONNX device=wasm dtype=q8 threadsAtCreate=${CORES}`,
      'pipeline.dispose',
      'languageModel onnx-community/Qwen3-0.6B-ONNX {"device":"wasm","dtype":"q8"}',
    ]);
  });

  it('wasm-default embedding load: the quantized (q8) files for the preload and the model', async () => {
    const reply = await load({
      kind: 'embedding',
      modelId: 'Xenova/bge-small-en-v1.5',
      settings: { dtype: 'q8', numThreads: CORES },
    });
    expect(reply).toEqual({ id: 1, type: 'loaded', dimensions: 384, numThreads: CORES });
    expect(events).toEqual([
      `preloadModel Xenova/bge-small-en-v1.5 device=wasm quantized=true threadsAtCreate=${CORES}`,
      'embedding Xenova/bge-small-en-v1.5 {"device":"wasm","quantized":true}',
    ]);
  });

  it('wasm-q8 LLM load: no thread count set, q8 download + throwaway session, the runtime default read back', async () => {
    const reply = await load({ kind: 'llm', modelId: 'onnx-community/Qwen3-0.6B-ONNX', settings: { dtype: 'q8' } });
    expect(reply).toEqual({ id: 1, type: 'loaded', numThreads: 4 });
    expect(events).toEqual([
      'installResilientModelCache',
      'pipeline text-generation onnx-community/Qwen3-0.6B-ONNX device=wasm dtype=q8 threadsAtCreate=undefined',
      'pipeline.dispose',
      'languageModel onnx-community/Qwen3-0.6B-ONNX {"device":"wasm","dtype":"q8"}',
    ]);
  });

  it('wasm-q8 embedding load: the q8 files, the runtime default thread count', async () => {
    const reply = await load({ kind: 'embedding', modelId: 'Xenova/bge-small-en-v1.5', settings: { dtype: 'q8' } });
    expect(reply).toEqual({ id: 1, type: 'loaded', dimensions: 384, numThreads: 4 });
    expect(events).toEqual([
      'preloadModel Xenova/bge-small-en-v1.5 device=wasm quantized=true threadsAtCreate=undefined',
      'embedding Xenova/bge-small-en-v1.5 {"device":"wasm","quantized":true}',
    ]);
  });

  it('wasm-threads LLM load: the provider preload at its own (q4) files, thread count set before the first session', async () => {
    const reply = await load({ kind: 'llm', modelId: 'onnx-community/Qwen3-0.6B-ONNX', settings: { numThreads: CORES } });
    expect(reply).toEqual({ id: 1, type: 'loaded', numThreads: CORES });
    expect(events).toEqual([
      `preloadModel onnx-community/Qwen3-0.6B-ONNX device=wasm quantized=undefined threadsAtCreate=${CORES}`,
      'languageModel onnx-community/Qwen3-0.6B-ONNX {"device":"wasm"}',
    ]);
  });

  it('wasm-threads embedding load: the protocol fp32 files, thread count set before the first session', async () => {
    const reply = await load({ kind: 'embedding', modelId: 'Xenova/bge-small-en-v1.5', settings: { numThreads: CORES } });
    expect(reply).toEqual({ id: 1, type: 'loaded', dimensions: 384, numThreads: CORES });
    expect(events).toEqual([
      `preloadModel Xenova/bge-small-en-v1.5 device=wasm quantized=undefined threadsAtCreate=${CORES}`,
      'embedding Xenova/bge-small-en-v1.5 {"device":"wasm"}',
    ]);
  });

  it('a thread count the runtime never read fails the load instead of recording a setting that did not apply', async () => {
    runtimeUsesSharedEnv = false;
    const reply = await load({
      kind: 'embedding',
      modelId: 'Xenova/bge-small-en-v1.5',
      settings: { dtype: 'q8', numThreads: CORES },
    });
    expect(reply).toMatchObject({
      type: 'error',
      message: 'ONNX Runtime did not initialise from the Transformers.js env the thread count was set on',
    });
    expect(events.some((e) => e.startsWith('embedding '))).toBe(false);
  });

  it('a protocol load on an env the runtime never read records no thread count', async () => {
    runtimeUsesSharedEnv = false;
    const reply = await load({ kind: 'llm', modelId: 'onnx-community/Qwen3-0.6B-ONNX' });
    expect(reply).toEqual({ id: 1, type: 'loaded', numThreads: undefined });
  });
});
