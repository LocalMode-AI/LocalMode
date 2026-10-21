/**
 * The llama.cpp lanes' backend record: `resolvedBackend` follows llama.cpp's
 * own offload report (`webgpu` only when at least one layer was offloaded),
 * a WebGPU-lane load that offloaded nothing records `wasm` with
 * `gpu_fallback: true`, a record read before the engine loaded says
 * `unknown` instead of the lane's prediction, and the warm-reload handle's
 * untimed `settle()` loads the engine so the warm-reload cell carries the
 * same report as the timed cells.
 *
 * The adapters (`createLLMAdapters` / `createEmbedAdapters`) run unmodified;
 * `@localmode/wllama` is replaced by a fake whose models behave as the
 * provider's do: nothing loads until the first inference, which sets
 * `offloadedLayers` from what the fake llama.cpp "printed" (null when it
 * printed no offload line, as llama.cpp does when it finds no GPU device).
 * The runner integration drives the real `runBenchmarkSuite` with the real
 * adapter and validates the run it returns.
 *
 * Not covered here: the real llama.cpp load log. The real-Chrome bench lanes
 * exercise the provider's offload capture.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LLM_WORKLOADS,
  EMBED_WORKLOADS,
  RUN_POLICIES,
  runBenchmarkSuite,
  validateRunShape,
  type BenchModelRef,
  type LLMRuntimeAdapter,
  type EmbeddingRuntimeAdapter,
} from '@localmode/bench';

/** What the fake llama.cpp reports on load, per model instance created from now on. */
let engineReport: { gpu: number; total: number } | null = { gpu: 31, total: 31 };
const engineLoads: string[] = [];
const generateCalls: Array<Record<string, unknown>> = [];

class FakeWllamaModel {
  offloadedLayers: { gpu: number; total: number } | null = null;
  threadPool: { multithread: boolean; threads: number } | null = null;
  private loaded = false;
  private readonly report = engineReport;
  constructor(
    readonly modelId: string,
    readonly settings: Record<string, unknown>,
  ) {}
  readonly provider = 'wllama';
  readonly dimensions = 384;
  private load() {
    if (this.loaded) return;
    this.loaded = true;
    engineLoads.push(`${this.modelId} nGpuLayers=${String(this.settings.nGpuLayers)}`);
    this.offloadedLayers = this.report;
    this.threadPool = { multithread: true, threads: 4 };
  }
  async doGenerate(options: Record<string, unknown>) {
    this.load();
    generateCalls.push(options);
    return { text: 'ready', finishReason: 'stop', usage: { inputTokens: 5, outputTokens: 1, totalTokens: 6, durationMs: 1 } };
  }
  async *doStream(options: { maxTokens?: number }) {
    this.load();
    const n = Math.min(6, options.maxTokens ?? 6);
    for (let i = 0; i < n; i++) {
      await new Promise((r) => setTimeout(r, 2));
      yield { text: 'token ', done: false };
    }
    yield { text: '', done: true, finishReason: 'stop', usage: { inputTokens: 10, outputTokens: n, totalTokens: 10 + n, durationMs: 12 } };
  }
  async doEmbed(options: { values: string[] }) {
    this.load();
    return { embeddings: options.values.map(() => new Float32Array(384).fill(0.1)) };
  }
  async unload() {
    // As the provider does: the load report is forgotten on unload.
    this.loaded = false;
    this.offloadedLayers = null;
    this.threadPool = null;
  }
}

vi.mock('@localmode/wllama', () => ({
  preloadModel: vi.fn(async () => {}),
  isModelCached: vi.fn(async () => false),
  wllama: {
    languageModel: (id: string, settings: Record<string, unknown>) => new FakeWllamaModel(id, settings),
    embedding: (id: string, settings: Record<string, unknown>) => new FakeWllamaModel(id, settings),
  },
}));

const LLM_REF = {
  benchModelId: 'smollm2-135m',
  runtimeId: 'wllama-webgpu',
  providerModelId: 'smollm2-135m',
  displayName: 'SmolLM2 135M',
  task: 'llm',
  quantization: 'q8',
} as BenchModelRef;
const EMBED_REF = { ...LLM_REF, benchModelId: 'bge-small', providerModelId: 'bge-small', task: 'embedding' } as BenchModelRef;

async function adapters() {
  const mod = await import('../src/lib/bench/adapters');
  return { llm: mod.createLLMAdapters(), embed: mod.createEmbedAdapters() };
}

beforeEach(() => {
  engineReport = { gpu: 31, total: 31 };
  engineLoads.length = 0;
  generateCalls.length = 0;
  vi.stubGlobal('navigator', { ...navigator, hardwareConcurrency: 8, gpu: { requestAdapter: async () => ({}) } });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('llama.cpp lanes: resolvedBackend follows the engine report', () => {
  it('before the engine loads: unknown, offloadedLayers unreported, no gpu_fallback (never the lane prediction)', async () => {
    const loaded = await (await adapters()).llm.get('wllama-webgpu')!.load(LLM_REF, {});
    expect(engineLoads).toEqual([]);
    expect(loaded.resolvedBackend).toBe('unknown');
    expect(loaded.runtimeConfig?.offloadedLayers).toBe('unreported');
    expect(loaded.runtimeConfig && 'gpu_fallback' in loaded.runtimeConfig).toBe(false);
  });

  it('WebGPU lane with every layer offloaded: webgpu, gpu_fallback false', async () => {
    const loaded = await (await adapters()).llm.get('wllama-webgpu')!.load(LLM_REF, {});
    for await (const _ of loaded.model.doStream!({ prompt: 'hi', maxTokens: 4 })) void _;
    expect(loaded.resolvedBackend).toBe('webgpu');
    expect(loaded.runtimeConfig).toMatchObject({ n_gpu_layers: -1, offloadedLayers: '31/31', gpu_fallback: false, webgpu_adapter: true });
  });

  it('WebGPU lane where llama.cpp printed no offload line (CPU fallback): wasm, gpu_fallback true', async () => {
    engineReport = null;
    const loaded = await (await adapters()).llm.get('wllama-webgpu')!.load(LLM_REF, {});
    await loaded.model.doGenerate({ prompt: 'hi', maxTokens: 2 });
    expect(loaded.resolvedBackend).toBe('wasm');
    expect(loaded.runtimeConfig).toMatchObject({ n_gpu_layers: -1, offloadedLayers: 'unreported', gpu_fallback: true });
  });

  it('WebGPU lane where llama.cpp offloaded 0 layers: wasm, gpu_fallback true', async () => {
    engineReport = { gpu: 0, total: 31 };
    const loaded = await (await adapters()).llm.get('wllama-webgpu')!.load(LLM_REF, {});
    await loaded.model.doGenerate({ prompt: 'hi', maxTokens: 2 });
    expect(loaded.resolvedBackend).toBe('wasm');
    expect(loaded.runtimeConfig).toMatchObject({ offloadedLayers: '0/31', gpu_fallback: true });
  });

  it('CPU lane: wasm, and no gpu_fallback key (it requested no GPU layers)', async () => {
    engineReport = { gpu: 0, total: 31 };
    const loaded = await (await adapters()).llm.get('wllama')!.load({ ...LLM_REF, runtimeId: 'wllama' }, {});
    await loaded.model.doGenerate({ prompt: 'hi', maxTokens: 2 });
    expect(loaded.resolvedBackend).toBe('wasm');
    expect(loaded.runtimeConfig).toMatchObject({ n_gpu_layers: 0, offloadedLayers: '0/31' });
    expect(loaded.runtimeConfig && 'gpu_fallback' in loaded.runtimeConfig).toBe(false);
  });

  it('embedding lane: the same record once the engine loads', async () => {
    engineReport = null;
    const loaded = await (await adapters()).embed.get('wllama-webgpu')!.load(EMBED_REF, {});
    expect(loaded.resolvedBackend).toBe('unknown');
    await loaded.model.doEmbed({ values: ['x'] });
    expect(loaded.resolvedBackend).toBe('wasm');
    expect(loaded.runtimeConfig).toMatchObject({ offloadedLayers: 'unreported', gpu_fallback: true, n_ctx: 512 });
  });
});

describe('settle(): the untimed engine load a warm-reload handle gets', () => {
  it('loads llama.cpp with the warmup probe (prompt cache off), once, and the record then carries the report', async () => {
    const loaded = await (await adapters()).llm.get('wllama-webgpu')!.load(LLM_REF, {});
    expect(typeof loaded.settle).toBe('function');
    await loaded.settle!({});
    await loaded.settle!({});
    expect(engineLoads).toEqual(['smollm2-135m nGpuLayers=-1']);
    expect(generateCalls).toHaveLength(1);
    expect(generateCalls[0]).toMatchObject({
      prompt: 'Reply with the single word: ready',
      maxTokens: 4,
      temperature: 0,
      providerOptions: { wllama: { cache_prompt: false } },
    });
    expect(loaded.resolvedBackend).toBe('webgpu');
    expect(loaded.runtimeConfig).toMatchObject({ offloadedLayers: '31/31', gpu_fallback: false });
  });

  it('is a no-op once the warmup has loaded the engine', async () => {
    const loaded = await (await adapters()).llm.get('wllama-webgpu')!.load(LLM_REF, {});
    for await (const _ of loaded.model.doStream!({ prompt: 'warm', maxTokens: 2 })) void _;
    await loaded.settle!({});
    expect(generateCalls).toEqual([]);
  });

  it('embedding handle: settle embeds the warmup probe', async () => {
    engineReport = { gpu: 0, total: 31 };
    const loaded = await (await adapters()).embed.get('wllama')!.load({ ...EMBED_REF, runtimeId: 'wllama' }, {});
    await loaded.settle!({});
    expect(engineLoads).toEqual(['bge-small nGpuLayers=0']);
    expect(loaded.resolvedBackend).toBe('wasm');
  });
});

describe('runner: the warm-reload cell carries the same engine report as the timed cells', () => {
  /** The real adapter, available on this test page (jsdom has no SharedArrayBuffer-backed wllama). */
  function available<T extends LLMRuntimeAdapter | EmbeddingRuntimeAdapter>(adapter: T): T {
    return Object.assign(Object.create(adapter), { isAvailable: async () => ({ ok: true }) }) as T;
  }

  it.each([
    { name: 'every layer offloaded', report: { gpu: 31, total: 31 }, backend: 'webgpu', offloaded: '31/31', fallback: false },
    { name: 'CPU fallback (no offload line)', report: null, backend: 'wasm', offloaded: 'unreported', fallback: true },
  ])('WebGPU lane, $name: timed and warm-reload cells agree, and the run validates', async ({ report, backend, offloaded, fallback }) => {
    engineReport = report;
    const { llm, embed } = await adapters();
    const result = await runBenchmarkSuite({
      suite: 'custom',
      cells: [
        { model: LLM_REF, workload: LLM_WORKLOADS[0] },
        { model: EMBED_REF, workload: EMBED_WORKLOADS[0] },
      ],
      policy: { ...RUN_POLICIES.quick, timedRuns: 1, cooldownMs: 1, pressureGate: false, measureWarmReload: true },
      llmAdapters: new Map([['wllama-webgpu', available(llm.get('wllama-webgpu')!)]]),
      embedAdapters: new Map([['wllama-webgpu', available(embed.get('wllama-webgpu')!)]]),
      harness: { name: '@localmode/bench', version: 'test' },
      skipFingerprint: true,
    });
    const ids = result.cells.map((c) => c.cellId);
    expect(ids).toEqual(expect.arrayContaining(['wllama-webgpu/smollm2-135m/warm-reload', 'wllama-webgpu/bge-small/warm-reload']));
    for (const cell of result.cells) {
      expect(cell.status, cell.cellId).toBe('ok');
      expect(cell.resolvedBackend, cell.cellId).toBe(backend);
      expect(cell.runtimeConfig, cell.cellId).toMatchObject({ offloadedLayers: offloaded, gpu_fallback: fallback });
    }
    // The warm reload stays timed over the provider's preload only: the engine
    // load settle() runs comes after the cell's load span.
    const warm = result.cells.find((c) => c.cellId === 'wllama-webgpu/smollm2-135m/warm-reload')!;
    expect(warm.load?.endT).toBeGreaterThanOrEqual(warm.load!.startT);
    expect(validateRunShape(result)).toEqual([]);
  });
});
