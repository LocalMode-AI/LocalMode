/**
 * The LiteRT lane's record: `resolvedBackend` follows the backend the engine
 * actually loaded on (the provider's `loadInfo`), so a GPU attempt the
 * `@litert-lm/core` GPU backend refuses ("Streaming ... is not supported
 * yet") and the provider retries on the CPU backend records `cpu` with
 * `gpu_fallback: true`; `runtimeConfig` carries `modelRevision` (the commit
 * the catalog URL is pinned to) and `modelBytes` (the bytes the engine read).
 *
 * The adapter and the real `@localmode/litert` provider run unmodified;
 * `@litert-lm/core` (the WASM engine) is replaced by a fake that reads the
 * model stream to the end, as the real engine does, and refuses a GPU load
 * when told to. `fetch` serves a small model body. The runner integration
 * drives the real `runBenchmarkSuite` and validates the run it returns.
 *
 * Not covered here: the real engine's backend choice. The real-Chrome bench
 * lane exercises it.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LLM_WORKLOADS,
  RUN_POLICIES,
  runBenchmarkSuite,
  validateRunShape,
  type BenchModelRef,
  type LLMRuntimeAdapter,
} from '@localmode/bench';
import { BENCH_MODELS } from '../src/lib/bench/catalog';

const engine = vi.hoisted(() => ({
  /** Refuse GPU loads with the 0.12.1 streaming error. */
  refuseGpu: true,
  creates: [] as Array<{ backend: number | undefined; bytes: number }>,
}));

// The engine module as the provider resolves it (a dependency of
// packages/litert, not of this app), so the fake replaces exactly that module.
const LITERT_CORE = createRequire(
  fileURLToPath(new URL('../../../packages/litert/package.json', import.meta.url)),
).resolve('@litert-lm/core');

vi.doMock(LITERT_CORE, () => {
  const Backend = { UNSPECIFIED: 0, CPU_ARTISAN: 1, GPU_ARTISAN: 2, CPU: 3, GPU: 4 };
  return {
    Backend,
    Engine: {
      async create(settings: { model: ReadableStream<Uint8Array>; backend?: number }) {
        if (engine.refuseGpu && settings.backend !== Backend.CPU) {
          throw new Error('Streaming kTfLitePrefillDecode models is not supported yet');
        }
        let bytes = 0;
        const reader = settings.model.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
        }
        engine.creates.push({ backend: settings.backend, bytes });
        return {
          async createConversation() {
            return {
              sendMessageStreaming() {
                return new ReadableStream({
                  async start(controller) {
                    for (let i = 0; i < 6; i++) {
                      await new Promise((r) => setTimeout(r, 2));
                      controller.enqueue({ role: 'assistant', content: 'token ' });
                    }
                    controller.close();
                  },
                });
              },
              cancel() {},
              async delete() {},
            };
          },
          async delete() {},
        };
      },
    },
  };
});

// The provider runs from its source so the engine mock above applies to its
// `@litert-lm/core` imports (a prebuilt dependency is loaded outside Vite).
vi.mock('@localmode/litert', async () => import('../../../packages/litert/src/index'));

/** Bytes of the fake model file every fetch serves (two chunks). */
const MODEL_BYTES = 3_000;

const QWEN_LITERT = BENCH_MODELS.find((m) => m.runtimeId === 'litert' && m.benchModelId === 'qwen3-0.6b')!;

async function adapter(): Promise<LLMRuntimeAdapter> {
  const mod = await import('../src/lib/bench/adapters');
  return mod.createLLMAdapters().get('litert')!;
}

beforeEach(() => {
  engine.refuseGpu = true;
  engine.creates.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array(2_000));
            controller.enqueue(new Uint8Array(1_000));
            controller.close();
          },
        }),
        { status: 200, headers: { 'Content-Length': String(MODEL_BYTES) } },
      ),
    ),
  );
  vi.stubGlobal('navigator', {
    ...navigator,
    gpu: { requestAdapter: async () => ({ requestDevice: async () => ({ destroy() {} }) }) },
  });
});
afterEach(async () => {
  vi.unstubAllGlobals();
  (await import('@localmode/litert')).resetWebGPUUsableCache();
});

describe('modelRevisionOf()', () => {
  it('reads the 40-hex commit of a pinned URL, and says unpinned otherwise', async () => {
    const { modelRevisionOf } = await import('../src/lib/bench/adapters');
    expect(modelRevisionOf(QWEN_LITERT.url)).toBe('a3c5d805ae362dff7f580bc25f2dfb9a5a7eaa76');
    expect(modelRevisionOf('https://huggingface.co/a/b/resolve/main/x.litertlm')).toBe('unpinned');
    expect(modelRevisionOf(undefined)).toBe('unpinned');
  });
});

describe('LiteRT lane: resolvedBackend follows the engine, not a WebGPU probe', () => {
  it('before the engine loads: unknown, with the pinned revision and no load fields', async () => {
    const loaded = await (await adapter()).load(QWEN_LITERT, {});
    // preloadModel created (and released) one engine; the lane's own engine is not loaded yet.
    expect(loaded.resolvedBackend).toBe('unknown');
    expect(loaded.runtimeConfig).toEqual({
      modelRevision: 'a3c5d805ae362dff7f580bc25f2dfb9a5a7eaa76',
      webgpu_adapter: true,
    });
  });

  it('GPU backend refuses the stream: cpu, gpu_fallback true, the bytes the CPU engine read', async () => {
    const loaded = await (await adapter()).load(QWEN_LITERT, {});
    for await (const _ of loaded.model.doStream!({ prompt: 'hi', maxTokens: 4 })) void _;
    expect(loaded.resolvedBackend).toBe('cpu');
    expect(loaded.runtimeConfig).toEqual({
      modelRevision: 'a3c5d805ae362dff7f580bc25f2dfb9a5a7eaa76',
      webgpu_adapter: true,
      modelBytes: MODEL_BYTES,
      requestedBackend: 'gpu',
      gpu_fallback: true,
    });
    // Preload and the lane each ended on CPU (backend 3), reading the whole file.
    expect(engine.creates).toEqual([
      { backend: 3, bytes: MODEL_BYTES },
      { backend: 3, bytes: MODEL_BYTES },
    ]);
    // The provider fetched the pinned URL.
    expect(vi.mocked(fetch).mock.calls.every(([url]) => url === QWEN_LITERT.url)).toBe(true);
  });

  it('GPU backend accepts the stream: gpu, gpu_fallback false', async () => {
    engine.refuseGpu = false;
    const loaded = await (await adapter()).load(QWEN_LITERT, {});
    await loaded.settle!({});
    expect(loaded.resolvedBackend).toBe('gpu');
    expect(loaded.runtimeConfig).toMatchObject({ requestedBackend: 'gpu', gpu_fallback: false, modelBytes: MODEL_BYTES });
  });

  it('no usable WebGPU device: the provider pins CPU, cpu without gpu_fallback', async () => {
    vi.stubGlobal('navigator', { ...navigator, gpu: undefined });
    (await import('@localmode/litert')).resetWebGPUUsableCache();
    const loaded = await (await adapter()).load(QWEN_LITERT, {});
    await loaded.settle!({});
    expect(loaded.resolvedBackend).toBe('cpu');
    expect(loaded.runtimeConfig).toEqual({
      modelRevision: 'a3c5d805ae362dff7f580bc25f2dfb9a5a7eaa76',
      webgpu_adapter: false,
      modelBytes: MODEL_BYTES,
      requestedBackend: 'cpu',
    });
  });

  it('settle() loads the engine once with the warmup probe, and is a no-op after', async () => {
    const loaded = await (await adapter()).load(QWEN_LITERT, {});
    const before = engine.creates.length;
    await loaded.settle!({});
    await loaded.settle!({});
    expect(engine.creates.length - before).toBe(1);
  });
});

describe('runner: timed and warm-reload LiteRT cells carry the engine record, and the run validates', () => {
  it('records cpu + gpu_fallback on every cell after a refused GPU load', async () => {
    const lane = await adapter();
    const result = await runBenchmarkSuite({
      suite: 'custom',
      cells: [{ model: QWEN_LITERT as BenchModelRef, workload: LLM_WORKLOADS[0] }],
      policy: { ...RUN_POLICIES.quick, timedRuns: 1, cooldownMs: 1, pressureGate: false, measureWarmReload: true },
      llmAdapters: new Map([['litert', lane]]),
      embedAdapters: new Map(),
      harness: { name: '@localmode/bench', version: 'test' },
      skipFingerprint: true,
    });
    expect(result.cells.map((c) => c.cellId)).toEqual([
      `litert/qwen3-0.6b/${LLM_WORKLOADS[0].id}`,
      'litert/qwen3-0.6b/warm-reload',
    ]);
    for (const cell of result.cells) {
      expect(cell.resolvedBackend, cell.cellId).toBe('cpu');
      expect(cell.runtimeConfig, cell.cellId).toEqual({
        modelRevision: 'a3c5d805ae362dff7f580bc25f2dfb9a5a7eaa76',
        webgpu_adapter: true,
        modelBytes: MODEL_BYTES,
        requestedBackend: 'gpu',
        gpu_fallback: true,
      });
    }
    expect(validateRunShape(result)).toEqual([]);
  });
});
