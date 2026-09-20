/**
 * Test fixtures: a hand-built, arithmetically-known BenchRunResult and mock
 * adapters that stream through real async boundaries (setTimeout gaps), so
 * runner tests exercise the genuine iterator/timing path.
 */

import type {
  BenchCellResult,
  BenchModelRef,
  BenchRunResult,
  EnvironmentCapture,
  LLMIteration,
} from '../src/types.js';
import { BENCH_PROTOCOL_VERSION, BENCH_SCHEMA_VERSION } from '../src/types.js';
import type {
  AdapterAvailability,
  EmbeddingRuntimeAdapter,
  LLMRuntimeAdapter,
  LoadedEmbedder,
  LoadedLLM,
} from '../src/adapter.js';

/** Deterministic environment fixture. */
export function makeEnvironment(overrides?: Partial<EnvironmentCapture>): EnvironmentCapture {
  return {
    capturedAt: '2026-07-16T00:00:00.000Z',
    browser: { name: 'Chrome', version: '140.0.0.0', source: 'ua-ch' },
    os: { platform: 'macOS', version: '15.5' },
    hardware: { cores: 8, coresClamped: false, deviceMemoryGB: 8, deviceMemoryCapped: true },
    gpu: { available: true, vendor: 'apple', architecture: 'metal-3' },
    webglRenderer: 'Apple M3',
    flags: { crossOriginIsolated: true, sharedArrayBuffer: true, wasmSimd: true },
    storage: { quotaBytes: 100_000_000_000, usageBytes: 1_000_000 },
    power: { batterySupported: true, charging: true },
    pressure: { supported: false },
    timerResolutionUs: 5,
    screen: { width: 1512, height: 982, dpr: 2 },
    ...overrides,
  };
}

export const MODEL_REF: BenchModelRef = {
  benchModelId: 'test-model',
  runtimeId: 'wllama',
  providerModelId: 'test/model.gguf',
  displayName: 'Test Model',
  task: 'llm',
  quantization: 'Q4_K_M',
  sizeBytes: 400_000_000,
};

/**
 * A known LLM iteration: startT=1000, first chunk at 1100 (TTFT=100ms),
 * 10 chunks of 5 chars each ending at 1550 → decode 45 chars / 450ms = 100 chars/s.
 */
export function makeIteration(offset = 0): LLMIteration {
  const chunks = Array.from({ length: 10 }, (_, i) => ({
    t: 1100 + offset + i * 50,
    c: 5,
  }));
  return {
    startT: 1000 + offset,
    chunks,
    endT: 1560 + offset,
    text: 'x'.repeat(50),
    gates: [],
  };
}

/** A single-cell run whose summary numbers are hand-computable. */
export function makeRun(overrides?: Partial<BenchRunResult>): BenchRunResult {
  const cell: BenchCellResult = {
    cellId: 'wllama/test-model/chat-pp128-tg128',
    runtimeId: 'wllama',
    model: MODEL_REF,
    workloadId: 'chat-pp128-tg128',
    workloadKind: 'llm-generate',
    resolvedBackend: 'wasm',
    load: { cached: false, startT: 0, endT: 800, declaredBytes: 400_000_000 },
    warmupMs: 120,
    iterations: [makeIteration(0), makeIteration(1000), makeIteration(2000)],
    status: 'ok',
  };
  return {
    protocol: BENCH_PROTOCOL_VERSION,
    schemaVersion: BENCH_SCHEMA_VERSION,
    runId: 'run-fixture-0001',
    createdAt: '2026-07-16T00:00:00.000Z',
    harness: { name: '@localmode/bench', version: '0.1.0' },
    suite: 'quick',
    environment: makeEnvironment(),
    fingerprint: { mflops: 1500, n: 160, iterations: 120, durationMs: 650, checksum: 1.5 },
    cells: [cell],
    events: [
      { t: 0, type: 'suite-start' },
      { t: 5000, type: 'suite-end' },
    ],
    ...overrides,
  };
}

/** Mock LLM adapter streaming N chunks through real timer boundaries. */
export function makeMockLLMAdapter(options?: {
  runtimeId?: 'wllama';
  available?: AdapterAvailability;
  cached?: boolean;
  chunkDelayMs?: number;
  chunkCount?: number;
  failLoad?: boolean;
  answerText?: string;
  /**
   * Report the backend and runtime configuration lazily, and only while the
   * instance is alive: the wllama adapter reads llama.cpp's offload report
   * off the provider, which forgets it once the model is unloaded.
   */
  lazyRuntimeConfig?: boolean;
}): LLMRuntimeAdapter & { loadCalls: number; disposeCalls: number } {
  const chunkDelayMs = options?.chunkDelayMs ?? 2;
  const chunkCount = options?.chunkCount ?? 8;
  const adapter = {
    runtimeId: (options?.runtimeId ?? 'wllama') as 'wllama',
    displayName: 'Mock LLM Runtime',
    runtimeVersion: 'mock-1.0.0',
    loadCalls: 0,
    disposeCalls: 0,
    async isAvailable() {
      return options?.available ?? { ok: true };
    },
    async isModelCached() {
      return options?.cached ?? false;
    },
    async load(): Promise<LoadedLLM> {
      adapter.loadCalls++;
      if (options?.failLoad) throw new Error('mock load failure');
      await new Promise((r) => setTimeout(r, 5));
      const model = {
        modelId: 'wllama:test/model.gguf',
        provider: 'wllama',
        async *doStream(streamOptions: { maxTokens?: number }) {
          const n = Math.min(chunkCount, streamOptions.maxTokens ?? chunkCount);
          for (let i = 0; i < n; i++) {
            await new Promise((r) => setTimeout(r, chunkDelayMs));
            yield { text: options?.answerText ?? 'token ', done: false };
          }
          yield {
            text: '',
            done: true,
            finishReason: 'stop',
            usage: { inputTokens: 10, outputTokens: n, totalTokens: 10 + n, durationMs: n * chunkDelayMs },
          };
        },
        async doGenerate(genOptions: { prompt: string }) {
          await new Promise((r) => setTimeout(r, chunkDelayMs));
          return {
            text: options?.answerText ?? `generated for: ${genOptions.prompt.slice(0, 16)}`,
            finishReason: 'stop',
            usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14, durationMs: chunkDelayMs },
          };
        },
      };
      if (options?.lazyRuntimeConfig) {
        let alive = true;
        return {
          model,
          get resolvedBackend() {
            return alive ? 'webgpu' : 'wasm';
          },
          get runtimeConfig() {
            return { n_gpu_layers: -1, offloadedLayers: alive ? '31/31' : 'unreported' };
          },
          dispose: async () => {
            alive = false;
            adapter.disposeCalls++;
          },
        };
      }
      return {
        model,
        resolvedBackend: 'wasm',
        dispose: async () => {
          adapter.disposeCalls++;
        },
      };
    },
  };
  return adapter;
}

/** Mock embedding adapter with deterministic vectors. */
export function makeMockEmbedAdapter(): EmbeddingRuntimeAdapter {
  return {
    runtimeId: 'transformers-wasm',
    displayName: 'Mock Embedder',
    async isAvailable() {
      return { ok: true };
    },
    async isModelCached() {
      return true;
    },
    async load(): Promise<LoadedEmbedder> {
      const model = {
        modelId: 'transformers:mock-embed',
        provider: 'transformers',
        dimensions: 4,
        async doEmbed({ values }: { values: string[] }) {
          await new Promise((r) => setTimeout(r, 1));
          return {
            embeddings: values.map((v, i) => {
              const vec = new Float32Array(4);
              // Deterministic: vary with text length so STS cosines vary.
              vec[0] = 1;
              vec[1] = (v.length % 13) / 13;
              vec[2] = (v.length % 7) / 7;
              vec[3] = i % 2 === 0 ? 0.1 : 0.2;
              return vec;
            }),
          };
        },
      };
      return { model, resolvedBackend: 'wasm', dispose: async () => {} };
    },
  };
}
