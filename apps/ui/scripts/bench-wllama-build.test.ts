/**
 * The llama.cpp lanes' build record and the `wllama-compat` control kind:
 * every llama.cpp cell records `runtimeConfig.wllamaBuild`, the wllama build
 * its worker started on (`memory64` or `compat`, read from the provider's
 * `loadedBuild`, never from the lane's intent), and a `wllama-compat` control
 * run hands both llama.cpp lanes `wasmBuild: 'compat'` so they load through
 * wllama's compatibility build in every browser.
 *
 * The adapters (`createLLMAdapters` / `createEmbedAdapters`) and the page's
 * control-to-adapter mapping (`controlAdapterOptions`) run unmodified;
 * `@localmode/wllama` is replaced by a fake whose models behave as the
 * provider's do: nothing loads until the first inference, and `loadedBuild`
 * is then the build the "browser" picks (`memory64` unless a test says
 * otherwise) or `compat` when the settings force it. The runner integration
 * drives the real `runBenchmarkSuite` and validates the run it returns.
 *
 * Not covered here: the real worker start on the compatibility build. The
 * real-browser bench run of `?control=wllama-compat` exercises it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EMBED_WORKLOADS,
  LLM_WORKLOADS,
  RUN_POLICIES,
  runBenchmarkSuite,
  validateRunShape,
  type BenchModelRef,
  type EmbeddingRuntimeAdapter,
  type LLMRuntimeAdapter,
} from '@localmode/bench';
import { controlAdapterOptions, controlHarness } from '../src/lib/bench/control';

/** The build the fake runtime picks on its own (wllama 3.5.1: memory64 wherever JSPI and Memory64 exist). */
let browserBuild: 'memory64' | 'compat' = 'memory64';
const createdSettings: Array<Record<string, unknown>> = [];

class FakeWllamaModel {
  offloadedLayers: { gpu: number; total: number } | null = null;
  threadPool: { multithread: boolean; threads: number } | null = null;
  loadedBuild: 'memory64' | 'compat' | null = null;
  private loaded = false;
  readonly provider = 'wllama';
  readonly dimensions = 384;
  constructor(
    readonly modelId: string,
    readonly settings: Record<string, unknown>,
  ) {
    createdSettings.push(settings);
  }
  private load() {
    if (this.loaded) return;
    this.loaded = true;
    this.loadedBuild = this.settings.wasmBuild === 'compat' ? 'compat' : browserBuild;
    this.offloadedLayers = this.settings.nGpuLayers === 0 ? { gpu: 0, total: 31 } : { gpu: 31, total: 31 };
    this.threadPool = { multithread: true, threads: 4 };
  }
  async doGenerate() {
    this.load();
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
    this.loaded = false;
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
const ref = (base: BenchModelRef, runtimeId: 'wllama' | 'wllama-webgpu') => ({ ...base, runtimeId }) as BenchModelRef;

async function adapters(options?: Parameters<typeof import('../src/lib/bench/adapters').createLLMAdapters>[0]) {
  const mod = await import('../src/lib/bench/adapters');
  return { llm: mod.createLLMAdapters(options), embed: mod.createEmbedAdapters(options) };
}

/** The real adapter, available on this test page (jsdom has no SharedArrayBuffer-backed wllama). */
function available<T extends LLMRuntimeAdapter | EmbeddingRuntimeAdapter>(adapter: T): T {
  return Object.assign(Object.create(adapter), { isAvailable: async () => ({ ok: true }) }) as T;
}

beforeEach(() => {
  browserBuild = 'memory64';
  createdSettings.length = 0;
  vi.stubGlobal('navigator', { ...navigator, hardwareConcurrency: 8, gpu: { requestAdapter: async () => ({}) } });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('controlAdapterOptions(): what a control kind changes in the adapters', () => {
  it('wllama-compat hands the llama.cpp lanes the compatibility build and nothing else', () => {
    expect(controlAdapterOptions(controlHarness('wllama-compat', 8))).toEqual({ wllamaBuild: 'compat' });
  });

  it('a WASM-lane kind hands only its wasmLane; the order kinds and a protocol run hand nothing', () => {
    expect(controlAdapterOptions(controlHarness('wasm-threads', 8))).toEqual({ wasmLane: { dtype: 'q4', numThreads: 8, simd: true } });
    expect(controlAdapterOptions(controlHarness('fixed-order', 8))).toEqual({});
    expect(controlAdapterOptions(controlHarness('order-reversed', 8))).toEqual({});
    expect(controlAdapterOptions(undefined)).toEqual({});
  });
});

describe('llama.cpp lanes: runtimeConfig.wllamaBuild', () => {
  it('a protocol run passes no wasmBuild (wllama picks), and records the build the worker started on', async () => {
    const { llm, embed } = await adapters();
    for (const lane of ['wllama', 'wllama-webgpu'] as const) {
      const loaded = await llm.get(lane)!.load(ref(LLM_REF, lane), {});
      // Before the engine starts there is no build to record.
      expect(loaded.runtimeConfig && 'wllamaBuild' in loaded.runtimeConfig).toBe(false);
      await loaded.model.doGenerate({ prompt: 'hi', maxTokens: 2 });
      expect(loaded.runtimeConfig?.wllamaBuild, lane).toBe('memory64');
      const e = await embed.get(lane)!.load(ref(EMBED_REF, lane), {});
      await e.model.doEmbed({ values: ['x'] });
      expect(e.runtimeConfig?.wllamaBuild, lane).toBe('memory64');
    }
    expect(createdSettings).toHaveLength(4);
    for (const settings of createdSettings) expect('wasmBuild' in settings).toBe(false);
  });

  it('records compat on a protocol run where wllama itself picked the compatibility build (Safari)', async () => {
    browserBuild = 'compat';
    const loaded = await (await adapters()).llm.get('wllama')!.load(ref(LLM_REF, 'wllama'), {});
    await loaded.model.doGenerate({ prompt: 'hi', maxTokens: 2 });
    expect(loaded.runtimeConfig?.wllamaBuild).toBe('compat');
  });

  it('wllamaBuild: compat forces the compatibility build on both language and both embedding lanes', async () => {
    const { llm, embed } = await adapters({ wllamaBuild: 'compat' });
    for (const lane of ['wllama', 'wllama-webgpu'] as const) {
      const loaded = await llm.get(lane)!.load(ref(LLM_REF, lane), {});
      await loaded.settle!({});
      expect(loaded.runtimeConfig?.wllamaBuild, lane).toBe('compat');
      // Every other field is the protocol's.
      expect(loaded.runtimeConfig).toMatchObject({ n_gpu_layers: lane === 'wllama' ? 0 : -1, n_ctx: 2048, cache_prompt: false, mmproj: false });
      const e = await embed.get(lane)!.load(ref(EMBED_REF, lane), {});
      await e.settle!({});
      expect(e.runtimeConfig?.wllamaBuild, lane).toBe('compat');
      expect(e.runtimeConfig).toMatchObject({ n_ctx: 512 });
    }
    expect(createdSettings.map((s) => s.wasmBuild)).toEqual(['compat', 'compat', 'compat', 'compat']);
  });
});

describe('runner: a wllama-compat control run', () => {
  const cells = (lanes: Array<'wllama' | 'wllama-webgpu'>) =>
    lanes.flatMap((lane) => [
      { model: ref(LLM_REF, lane), workload: LLM_WORKLOADS[0] },
      { model: ref(EMBED_REF, lane), workload: EMBED_WORKLOADS[0] },
    ]);
  const policy = { ...RUN_POLICIES.quick, timedRuns: 1, cooldownMs: 1, pressureGate: false, measureWarmReload: true };

  async function run(control: ReturnType<typeof controlHarness>, options: ReturnType<typeof controlAdapterOptions>) {
    const { llm, embed } = await adapters(options);
    return runBenchmarkSuite({
      suite: 'custom',
      cells: cells(['wllama', 'wllama-webgpu']),
      policy,
      llmAdapters: new Map(['wllama', 'wllama-webgpu'].map((id) => [id, available(llm.get(id)!)])),
      embedAdapters: new Map(['wllama', 'wllama-webgpu'].map((id) => [id, available(embed.get(id)!)])),
      harness: { name: '@localmode/bench', version: 'test', control },
      skipFingerprint: true,
    });
  }

  it('every llama.cpp cell, warm reloads included, records compat, and the run validates', async () => {
    const control = controlHarness('wllama-compat', 8);
    const result = await run(control, controlAdapterOptions(control));
    expect(result.harness.control).toEqual({ kind: 'wllama-compat', runtimeOrder: control.runtimeOrder, wllamaBuild: 'compat' });
    // The protocol order: the WebGPU llama.cpp lane before the CPU lane.
    expect(result.cells[0].runtimeId).toBe('wllama-webgpu');
    expect(result.cells.at(-1)?.runtimeId).toBe('wllama');
    expect(result.cells.some((c) => c.workloadId === 'warm-reload')).toBe(true);
    for (const cell of result.cells) {
      expect(cell.status, cell.cellId).toBe('ok');
      expect(cell.runtimeConfig?.wllamaBuild, cell.cellId).toBe('compat');
    }
    expect(validateRunShape(result)).toEqual([]);
  });

  it('a run marked wllama-compat whose lanes were not switched fails validation (the record cannot disagree with the marker)', async () => {
    const control = controlHarness('wllama-compat', 8);
    const result = await run(control, {});
    expect(result.cells.every((c) => c.runtimeConfig?.wllamaBuild === 'memory64')).toBe(true);
    const errors = validateRunShape(result);
    expect(errors.length).toBe(result.cells.length);
    expect(errors[0]).toMatch(
      /^cells\[0\]: runtimeConfig\.wllamaBuild is "memory64" on a wllama-compat control run, which loads every llama\.cpp lane through the compatibility build$/,
    );
  });

  it('a fixed-order run records the memory64 build the browser picked, and validates', async () => {
    const control = controlHarness('fixed-order', 8);
    const result = await run(control, controlAdapterOptions(control));
    for (const cell of result.cells) expect(cell.runtimeConfig?.wllamaBuild, cell.cellId).toBe('memory64');
    expect(validateRunShape(result)).toEqual([]);
  });
});
