/**
 * Runtime adapters wiring @localmode/bench to the five LLM runtimes and three
 * embedding runtimes. Providers are loaded via dynamic import() (bundle
 * isolation — nothing loads until a benchmark actually runs). Load phase =
 * the provider's preloadModel: download-to-cache for wllama; download plus a
 * first engine/session init that is released again for webllm, litert, and
 * transformers. The runner's untimed warmup then measures first-inference
 * readiness (engine init + shader/JIT compile), so cold start = load + warmup
 * is the figure comparable across runtimes.
 */

import type {
  AdapterAvailability,
  BenchModelRef,
  EmbeddingRuntimeAdapter,
  HarnessControlWasmLane,
  LLMRuntimeAdapter,
  LoadedEmbedder,
  LoadedLLM,
} from '@localmode/bench';
import { runtimeVersionFor } from './runtime-versions';
import { TransformersWorkerLane } from './transformers-worker-client';
import type { WorkerLaneSettings } from './transformers-worker';
import {
  chromeAIDownloadInFlight,
  chromeAIDownloadPct,
  chromeAIStatus,
  onChromeAIDownloadProgress,
} from './chrome-ai-download';

type ProgressCb = (p: { pct?: number }) => void;

/** Normalize provider progress events ({progress: 0-100} | {loaded,total}). */
function normalizeProgress(onProgress?: ProgressCb) {
  if (!onProgress) return undefined;
  return (p: { progress?: number; loaded?: number; total?: number }) => {
    if (typeof p.progress === 'number') onProgress({ pct: p.progress });
    else if (typeof p.loaded === 'number' && typeof p.total === 'number' && p.total > 0) {
      onProgress({ pct: (p.loaded / p.total) * 100 });
    } else onProgress({});
  };
}

/** Duck-typed dispose: every provider model ships unload(), core doesn't type it. */
async function disposeModel(model: unknown): Promise<void> {
  const unload = (model as { unload?: () => Promise<void> | void }).unload;
  if (typeof unload === 'function') await unload.call(model);
}

type GenerateOptions = { providerOptions?: Record<string, Record<string, unknown>> };

/**
 * llama.cpp reuses the prompt's KV cache across requests by default, so a
 * benchmark that repeats one fixed prompt would skip prefill from the second
 * iteration on (observed TTFT 1018ms → 24ms). Every timed request must pay
 * prefill like the other runtimes, so the lane pins `cache_prompt: false`.
 */
function withoutPromptCache<T extends { doGenerate: (o: never) => unknown; doStream?: (o: never) => unknown }>(
  llm: T,
): T {
  const pin = <O extends GenerateOptions>(options: O): O => ({
    ...options,
    providerOptions: {
      ...options.providerOptions,
      wllama: { ...options.providerOptions?.wllama, cache_prompt: false },
    },
  });
  return new Proxy(llm, {
    get(target, prop, receiver) {
      if (prop === 'doGenerate') {
        return (options: GenerateOptions) => target.doGenerate(pin(options) as never);
      }
      if (prop === 'doStream' && typeof target.doStream === 'function') {
        return (options: GenerateOptions) => target.doStream!(pin(options) as never);
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

/**
 * Wrap a lazily loading wllama model so the adapter knows when llama.cpp has
 * loaded: after the first `doGenerate`/`doEmbed` resolves, or once `doStream`
 * yields its first chunk (the load precedes every token). The wrapped model
 * behaves exactly as the original.
 */
function trackEngineLoad<T extends object>(model: T, onLoaded: () => void): T {
  return new Proxy(model, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') return value;
      if (prop === 'doGenerate' || prop === 'doEmbed') {
        return async (...args: unknown[]) => {
          const result = await (value as (...a: unknown[]) => Promise<unknown>).apply(target, args);
          onLoaded();
          return result;
        };
      }
      if (prop === 'doStream') {
        return (...args: unknown[]) => {
          const inner = (value as (...a: unknown[]) => AsyncIterable<unknown>).apply(target, args);
          return (async function* () {
            for await (const chunk of inner) {
              onLoaded();
              yield chunk;
            }
          })();
        };
      }
      return value;
    },
  });
}

/** WebGPU adapter probe with a 3s guard (isWebGPUSupported() from core is async). */
async function hasWebGPUAdapter(): Promise<boolean> {
  try {
    const gpu = (navigator as { gpu?: { requestAdapter(): Promise<unknown | null> } }).gpu;
    if (!gpu) return false;
    const adapter = await Promise.race([
      gpu.requestAdapter(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3_000)),
    ]);
    return adapter !== null;
  } catch {
    return false;
  }
}

const NO_WEBGPU: AdapterAvailability = { ok: false, reason: 'no WebGPU adapter' };

/**
 * wllama's WASM builds (default and Safari compat alike) import a SHARED
 * memory with a 4 GB maximum, so the runtime needs SharedArrayBuffer (a
 * cross-origin-isolated page) and a browser willing to reserve that range.
 * WebKit on iPhone refused with "Out of memory" and every wllama cell errored;
 * probing the same allocation up front turns that into a skipped lane with the
 * reason recorded.
 */
export async function wllamaAvailability(): Promise<AdapterAvailability> {
  const isolated = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated;
  try {
    new WebAssembly.Memory({ initial: 16, maximum: 65_536, shared: true });
  } catch (error) {
    const detail = (error as Error)?.message ?? String(error);
    return {
      ok: false,
      reason: isolated
        ? `this browser cannot reserve the shared 4 GB WASM memory wllama needs (${detail})`
        : `page is not cross-origin isolated, so wllama has no shared WASM memory (${detail})`,
    };
  }
  // wllama's model cache lives in the Origin Private File System. WebKit
  // contexts that cannot open it throw DOMException UnknownError ("The
  // operation failed for an unknown transient reason") before any WASM runs.
  try {
    await navigator.storage.getDirectory();
  } catch (error) {
    const detail = (error as Error)?.message ?? String(error);
    return {
      ok: false,
      reason: `no Origin Private File System for wllama's model cache in this browser (${detail})`,
    };
  }
  return { ok: true };
}

/**
 * Options for `createLLMAdapters` / `createEmbedAdapters`. Empty on a
 * protocol run and on the order kinds; a WASM-lane control kind
 * (`wasm-default`, `wasm-q8`, `wasm-threads`) sets `wasmLane`, and
 * `wllama-compat` sets `wllamaBuild` (see `controlAdapterOptions`).
 */
export interface BenchAdapterOptions {
  /**
   * Transformers.js WASM lane settings of a WASM-lane control run
   * (`harness.control.wasmLane`): with `dtype` `q8` the lane's models load
   * their q8 files (`q4` keeps the protocol's files), and a non-null
   * `numThreads` sets ONNX Runtime's WASM thread count (`null` leaves the
   * runtime's default). No other lane reads it.
   */
  wasmLane?: HarnessControlWasmLane;
  /**
   * The wllama build of a `wllama-compat` control run
   * (`harness.control.wllamaBuild`): both llama.cpp lanes, language and
   * embedding, load through wllama's compatibility build
   * (`@wllama/wllama-compat`) in every browser. Absent, wllama picks the
   * build itself (memory64 wherever the browser has JSPI and Memory64, and
   * on Firefox). No other lane reads it.
   */
  wllamaBuild?: 'compat';
}

/**
 * The provider settings that put a llama.cpp lane on the build a control run
 * asks for: none on a protocol run (the settings stay the protocol's).
 */
function wllamaBuildSettings(options: BenchAdapterOptions): { wasmBuild?: 'compat' } {
  return options.wllamaBuild === 'compat' ? { wasmBuild: 'compat' } : {};
}

/**
 * The worker settings for the WASM lane: none on a protocol run; otherwise
 * only what the control kind changes from the protocol's configuration
 * (`dtype: 'q8'` when the lane loads q8, `numThreads` when the host sets it).
 */
function wasmLaneSettings(wasmLane: HarnessControlWasmLane | undefined): WorkerLaneSettings | undefined {
  if (!wasmLane) return undefined;
  return {
    ...(wasmLane.dtype === 'q8' ? { dtype: 'q8' as const } : {}),
    ...(wasmLane.numThreads !== null ? { numThreads: wasmLane.numThreads } : {}),
  };
}

/**
 * The WASM lane's runtimeConfig: the dtype the models loaded at and the ONNX
 * Runtime WASM thread count the worker read back after the runtime initialised
 * (omitted when the worker could not read it).
 */
function wasmRuntimeConfig(dtype: string, numThreads: number | undefined): Record<string, string | number | boolean> {
  return { device: 'wasm', dtype, worker: true, ...(numThreads !== undefined ? { numThreads } : {}) };
}

/** Transformers.js lane (device pinned per lane: webgpu or wasm). */
function makeTransformersLLMAdapter(device: 'webgpu' | 'wasm', options: BenchAdapterOptions = {}): LLMRuntimeAdapter {
  return {
    runtimeId: device === 'webgpu' ? 'transformers-webgpu' : 'transformers-wasm',
    runtimeVersion: runtimeVersionFor(device === 'webgpu' ? 'transformers-webgpu' : 'transformers-wasm'),
    displayName: `Transformers.js (${device.toUpperCase()})`,
    async isAvailable() {
      if (device === 'webgpu' && !(await hasWebGPUAdapter())) return NO_WEBGPU;
      return { ok: true };
    },
    async isModelCached(model: BenchModelRef) {
      const { isModelCached } = await import('@localmode/transformers');
      return isModelCached(model.providerModelId);
    },
    async load(model, { onProgress, abortSignal }): Promise<LoadedLLM> {
      abortSignal?.throwIfAborted();
      if (device === 'wasm') {
        // The WASM lane runs in a dedicated worker: ONNX Runtime computes on
        // the calling thread, and a generation on the main thread would leave
        // the page unable to repaint (and the watchdog unable to fire) until
        // the request ends. The worker owns its own ONNX runtime instance.
        const settings = wasmLaneSettings(options.wasmLane);
        const lane = new TransformersWorkerLane();
        let numThreads: number | undefined;
        try {
          ({ numThreads } = await lane.load('llm', model.providerModelId, device, {
            onProgress: (pct) => onProgress?.({ pct }),
            abortSignal,
            ...(settings ? { settings } : {}),
          }));
        } catch (error) {
          await lane.dispose();
          throw error;
        }
        return {
          model: lane.languageModel(model.providerModelId) as unknown as LoadedLLM['model'],
          resolvedBackend: device,
          runtimeConfig: wasmRuntimeConfig(settings?.dtype ?? model.quantization ?? 'default', numThreads),
          dispose: () => lane.dispose(),
        };
      }
      const mod = await import('@localmode/transformers');
      // Preload on the lane's own device so the cached artifacts and the
      // throwaway session match what the timed lane runs (the preload
      // disposes its session; the runner's warmup builds the real one).
      await mod.preloadModel(model.providerModelId, { onProgress: normalizeProgress(onProgress), device });
      abortSignal?.throwIfAborted();
      const llm = mod.transformers.languageModel(model.providerModelId, { device });
      return {
        model: llm as unknown as LoadedLLM['model'],
        resolvedBackend: device,
        runtimeConfig: { device, dtype: model.quantization ?? 'default', worker: false },
        dispose: () => disposeModel(llm),
      };
    },
  };
}

/** WebLLM lane (WebGPU-only, MLC engine). */
function makeWebLLMAdapter(): LLMRuntimeAdapter {
  return {
    runtimeId: 'webllm',
    runtimeVersion: runtimeVersionFor('webllm'),
    displayName: 'WebLLM (MLC)',
    async isAvailable() {
      return (await hasWebGPUAdapter()) ? { ok: true } : NO_WEBGPU;
    },
    async isModelCached(model) {
      const { isModelCached } = await import('@localmode/webllm');
      return isModelCached(model.providerModelId);
    },
    async load(model, { onProgress, abortSignal }): Promise<LoadedLLM> {
      const mod = await import('@localmode/webllm');
      abortSignal?.throwIfAborted();
      await mod.preloadModel(model.providerModelId, { onProgress: normalizeProgress(onProgress) });
      abortSignal?.throwIfAborted();
      const llm = mod.webllm.languageModel(model.providerModelId, {});
      return {
        model: llm as unknown as LoadedLLM['model'],
        resolvedBackend: 'webgpu',
        dispose: () => disposeModel(llm),
      };
    },
  };
}

/**
 * Thread count the llama.cpp lanes request: half the logical threads the
 * browser reports, at least two. A pool over every logical thread ran at half
 * speed with high variance wherever the CPU is hybrid or SMT (measured natively
 * on an M1 Pro: tg128 178 ± 42 tokens/s at 10 threads against 395 ± 16 at 8,
 * and in the browser on the M4 Max, whose 16-thread pool ran a third as fast
 * as the M1 Pro's 10). Half the logical count lands on the performance cores
 * or the physical cores on every lab device; the browser exposes no topology
 * to do better. The requested count and the pool the runtime built are both
 * recorded on the cell.
 */
export function wllamaThreads(): number {
  const logical = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 1;
  return Math.max(2, Math.ceil((logical || 1) / 2));
}

/**
 * Context sizes the llama.cpp lanes load with. The language workloads need at
 * most ~700 tokens (pp512 + 128 generated + template); 2048 leaves room while
 * keeping the KV cache small enough for the 3.46 GB Gemma 4 E2B GGUF inside
 * the CPU lane, under the 4 GiB link-time memory cap of wllama's memory64
 * build, where the provider's 8192 default failed the
 * quality cell on every run. The embedding model's context is its own 512.
 */
export const WLLAMA_BENCH_CONTEXT_LLM = 2048;
export const WLLAMA_BENCH_CONTEXT_EMBED = 512;

/** The prompt a llama.cpp warm-reload handle's untimed settle() sends: the runner's warmup probe. */
const WLLAMA_SETTLE_PROMPT = 'Reply with the single word: ready';

/**
 * Backend and configuration record for a loaded wllama model, from what
 * llama.cpp itself reported at load (`offloaded N/M layers to GPU`), never
 * from the lane's intent. wllama 3.5 offloads every layer to WebGPU by
 * default wherever `navigator.gpu` exists, which is why each lane pins
 * `n_gpu_layers` explicitly: the CPU lane to 0, the WebGPU lane to all.
 *
 * The backend is `webgpu` only when llama.cpp offloaded at least one layer,
 * and `wasm` otherwise, including a WebGPU-lane load where llama.cpp printed
 * no offload line (it prints one only when it found a GPU device): that lane
 * then records `gpu_fallback: true`. Until the engine has loaded (wllama
 * loads on first use) there is no report, so the backend reads `unknown` and
 * `gpu_fallback` is absent; it never falls back to the lane's prediction.
 * `wllamaBuild` is the WASM build wllama started its worker on (`memory64`
 * or `compat`), as the provider recorded it.
 */
function wllamaLoadedInfo(
  llm: {
    offloadedLayers?: { gpu: number; total: number } | null;
    threadPool?: { multithread: boolean; threads: number } | null;
    loadedBuild?: 'memory64' | 'compat' | null;
  },
  requestedGpuLayers: number,
  webgpuAdapter: boolean,
  engineLoaded: boolean,
  options: { textOnly?: boolean; nCtx?: number } = {},
): { resolvedBackend: string; runtimeConfig: Record<string, string | number | boolean> } {
  const offloaded = llm.offloadedLayers ?? null;
  const gpu = offloaded !== null && offloaded.gpu > 0;
  const pool = llm.threadPool ?? null;
  const build = llm.loadedBuild ?? null;
  return {
    resolvedBackend: engineLoaded ? (gpu ? 'webgpu' : 'wasm') : 'unknown',
    runtimeConfig: {
      n_threads: wllamaThreads(),
      // What wllama built, from its own report: a lane whose pool fell back to
      // one thread says so here whatever n_threads asked for.
      ...(pool ? { multithread: pool.multithread, n_threads_used: pool.threads } : {}),
      ...(options.nCtx !== undefined ? { n_ctx: options.nCtx } : {}),
      // The wllama build the worker started on, from the provider's own
      // record (known once wllama starts its worker, absent before).
      ...(build ? { wllamaBuild: build } : {}),
      n_gpu_layers: requestedGpuLayers,
      // llama.cpp prints its offload line only when it found a GPU device, so
      // "unreported" together with webgpu_adapter: false is an unambiguous CPU run.
      webgpu_adapter: webgpuAdapter,
      offloadedLayers: offloaded ? `${offloaded.gpu}/${offloaded.total}` : 'unreported',
      // A lane that asked for GPU layers and got none ran on the CPU.
      ...(engineLoaded && requestedGpuLayers !== 0 ? { gpu_fallback: !gpu } : {}),
      cache_prompt: false,
      // Language lanes load without a vision projector (see makeWllamaAdapter).
      ...(options.textOnly ? { mmproj: false } : {}),
    },
  };
}

/**
 * The two llama.cpp lanes over the same GGUF files: `wllama` runs on the CPU
 * (WASM SIMD, `n_gpu_layers: 0`) and `wllama-webgpu` offloads every layer
 * to WebGPU (`n_gpu_layers: -1`). The recorded backend comes from llama.cpp's
 * own load report, so a lane that did not get what it asked for says so.
 */
function makeWllamaAdapter(gpu: boolean, options: BenchAdapterOptions = {}): LLMRuntimeAdapter {
  const runtimeId = gpu ? 'wllama-webgpu' : 'wllama';
  const requestedGpuLayers = gpu ? -1 : 0;
  return {
    runtimeId,
    runtimeVersion: runtimeVersionFor(runtimeId),
    displayName: gpu ? 'wllama (llama.cpp WebGPU)' : 'wllama (llama.cpp WASM, CPU)',
    async isAvailable() {
      if (gpu && !(await hasWebGPUAdapter())) return NO_WEBGPU;
      return wllamaAvailability();
    },
    async isModelCached(model) {
      const { isModelCached } = await import('@localmode/wllama');
      return isModelCached(model.providerModelId);
    },
    async load(model, { onProgress, abortSignal }): Promise<LoadedLLM> {
      const mod = await import('@localmode/wllama');
      abortSignal?.throwIfAborted();
      await mod.preloadModel(model.providerModelId, { onProgress: normalizeProgress(onProgress) });
      abortSignal?.throwIfAborted();
      // Text-only workloads: never load a catalog vision projector (Gemma 4
      // E2B ships one). It is unused, costs a 557 MB download and CLIP warmup,
      // turns wllama's model cache off for the pair, and does not fit on the CPU
      // lane beside the 3.46 GB weights under the 4 GiB link-time memory cap of
      // wllama's memory64 build.
      const llm = mod.wllama.languageModel(model.providerModelId, {
        nGpuLayers: requestedGpuLayers,
        vision: false,
        numThreads: wllamaThreads(),
        contextLength: WLLAMA_BENCH_CONTEXT_LLM,
        ...wllamaBuildSettings(options),
      });
      const webgpuAdapter = await hasWebGPUAdapter();
      // The model loads on first use (the runner's untimed warmup, or settle()
      // on a warm reload), so the backend and offload report are read lazily,
      // after that load.
      let engineLoaded = false;
      const tracked = trackEngineLoad(withoutPromptCache(llm), () => {
        engineLoaded = true;
      });
      const info = () =>
        wllamaLoadedInfo(llm as unknown as Parameters<typeof wllamaLoadedInfo>[0], requestedGpuLayers, webgpuAdapter, engineLoaded, {
          textOnly: true,
          nCtx: WLLAMA_BENCH_CONTEXT_LLM,
        });
      return {
        model: tracked as unknown as LoadedLLM['model'],
        get resolvedBackend() {
          return info().resolvedBackend;
        },
        get runtimeConfig() {
          return info().runtimeConfig;
        },
        // Untimed: load llama.cpp with the same probe the runner's warmup sends.
        async settle({ abortSignal }) {
          if (engineLoaded) return;
          await tracked.doGenerate({ prompt: WLLAMA_SETTLE_PROMPT, maxTokens: 4, temperature: 0, abortSignal } as never);
        },
        dispose: () => disposeModel(llm),
      };
    },
  };
}

/**
 * The repository revision a pinned Hugging Face model URL names (the 40-hex
 * commit in `/resolve/<commit>/`), or `unpinned` for a URL that follows a
 * branch.
 *
 * @param url - The model file URL.
 * @returns The commit hash, or `unpinned`.
 */
export function modelRevisionOf(url: string | undefined): string {
  const match = url ? /\/resolve\/([0-9a-f]{40})\//.exec(url) : null;
  return match ? match[1] : 'unpinned';
}

/** The LiteRT provider's load report (`LiteRTLanguageModel.loadInfo`). */
interface LiteRTLoadReport {
  requestedBackend: 'GPU' | 'CPU';
  backend: 'GPU' | 'CPU';
  gpuFallback: boolean;
  modelUrl: string;
  modelBytes: number;
}

/**
 * Backend and configuration record for a LiteRT model, from the provider's
 * load report, never from a WebGPU probe: on `@litert-lm/core` 0.12.1 the GPU
 * backend refuses to stream-load some builds (Qwen3 0.6B among them) and the
 * provider creates the engine on the CPU backend instead. `resolvedBackend` is
 * `gpu` or `cpu` from the backend the engine loaded on, and `unknown` until
 * the engine has loaded (the provider loads on first use). `gpu_fallback` is
 * present once loaded when the first attempt used the GPU backend, `true`
 * exactly when the engine ended on the CPU. `modelRevision` is the commit the
 * catalog URL is pinned to; `modelBytes` is what the engine read (the cached
 * file on a warm load).
 */
export function liteRtLoadedInfo(
  report: LiteRTLoadReport | null,
  catalogUrl: string | undefined,
  webgpuAdapter: boolean,
): { resolvedBackend: string; runtimeConfig: Record<string, string | number | boolean> } {
  return {
    resolvedBackend: report ? (report.backend === 'GPU' ? 'gpu' : 'cpu') : 'unknown',
    runtimeConfig: {
      modelRevision: modelRevisionOf(report?.modelUrl ?? catalogUrl),
      webgpu_adapter: webgpuAdapter,
      ...(report
        ? {
            modelBytes: report.modelBytes,
            requestedBackend: report.requestedBackend === 'GPU' ? 'gpu' : 'cpu',
            ...(report.requestedBackend === 'GPU' ? { gpu_fallback: report.gpuFallback } : {}),
          }
        : {}),
    },
  };
}

/** The prompt a LiteRT warm-reload handle's untimed settle() sends: the runner's warmup probe. */
const LITERT_SETTLE_PROMPT = 'Reply with the single word: ready';

/** LiteRT lane (.litertlm; GPU-compiled builds require WebGPU, others fall back to CPU). */
function makeLiteRTAdapter(): LLMRuntimeAdapter {
  return {
    runtimeId: 'litert',
    runtimeVersion: runtimeVersionFor('litert'),
    displayName: 'LiteRT-LM',
    async isAvailable() {
      // The catalog's CPU-capable models run without WebGPU; hard-gated models
      // carry requiresWebGPU and are filtered by the planner.
      return { ok: true };
    },
    async isModelCached(model) {
      const { isModelCached } = await import('@localmode/litert');
      return isModelCached(model.providerModelId);
    },
    async load(model, { onProgress, abortSignal }): Promise<LoadedLLM> {
      const mod = await import('@localmode/litert');
      abortSignal?.throwIfAborted();
      await mod.preloadModel(model.providerModelId, { onProgress: normalizeProgress(onProgress) });
      abortSignal?.throwIfAborted();
      const llm = mod.litert.languageModel(model.providerModelId, {});
      const webgpuAdapter = await hasWebGPUAdapter();
      // The engine loads on first use (the runner's untimed warmup, or
      // settle() on a warm reload); the record is read from its load report.
      const report = () => (llm as unknown as { loadInfo?: LiteRTLoadReport | null }).loadInfo ?? null;
      const info = () => liteRtLoadedInfo(report(), model.url, webgpuAdapter);
      return {
        model: llm as unknown as LoadedLLM['model'],
        get resolvedBackend() {
          return info().resolvedBackend;
        },
        get runtimeConfig() {
          return info().runtimeConfig;
        },
        // Untimed: load the engine with the same probe the runner's warmup sends.
        async settle({ abortSignal }) {
          if (report()) return;
          await llm.doGenerate({ prompt: LITERT_SETTLE_PROMPT, maxTokens: 4, temperature: 0, abortSignal } as never);
        },
        dispose: () => disposeModel(llm),
      };
    },
  };
}

/**
 * Chrome Built-in AI lane (Gemini Nano). Chrome supplies the model and
 * downloads it once, browser-wide, but only from a user activation: the Run
 * click starts that download (`startChromeAIDownload`) and this lane waits
 * for it, so a device with Gemini Nano merely "downloadable" runs the lane
 * like any other instead of sitting it out. The lane is cold when the model
 * had to download; its load phase measures the remaining wait, since the
 * download began at the click while other lanes ran.
 */
function makeChromeAIAdapter(): LLMRuntimeAdapter {
  return {
    runtimeId: 'chrome-ai',
    runtimeVersion: runtimeVersionFor('chrome-ai'),
    displayName: 'Chrome Built-in AI (Gemini Nano)',
    async isAvailable() {
      const { isPromptAPISupported } = await import('@localmode/chrome-ai');
      if (!isPromptAPISupported()) {
        return { ok: false, reason: 'Prompt API not supported (needs Chrome 148+ desktop)' };
      }
      const status = await chromeAIStatus();
      if (status === 'available') return { ok: true };
      if ((status === 'downloadable' || status === 'downloading') && chromeAIDownloadInFlight()) {
        return { ok: true };
      }
      if (status === 'downloadable') {
        return { ok: false, reason: 'Gemini Nano needs a download that only a click can start' };
      }
      return { ok: false, reason: `Gemini Nano not ready (${status})` };
    },
    async isModelCached() {
      // Chrome owns the model: ready means warm; a download in flight means cold.
      return (await chromeAIStatus()) === 'available';
    },
    async load(_model, { onProgress, abortSignal }): Promise<LoadedLLM> {
      const download = chromeAIDownloadInFlight();
      if (download) {
        onProgress?.({ pct: chromeAIDownloadPct() });
        const unsubscribe = onChromeAIDownloadProgress((pct) => onProgress?.({ pct }));
        try {
          await download;
        } finally {
          unsubscribe();
        }
      }
      const mod = await import('@localmode/chrome-ai');
      abortSignal?.throwIfAborted();
      const llm = mod.chromeAI.languageModel({});
      return {
        model: llm as unknown as LoadedLLM['model'],
        resolvedBackend: 'chrome-builtin',
        dispose: () => disposeModel(llm),
      };
    },
  };
}

/** Transformers.js embedding lane. */
function makeTransformersEmbedAdapter(device: 'webgpu' | 'wasm', options: BenchAdapterOptions = {}): EmbeddingRuntimeAdapter {
  return {
    runtimeId: device === 'webgpu' ? 'transformers-webgpu' : 'transformers-wasm',
    runtimeVersion: runtimeVersionFor(device === 'webgpu' ? 'transformers-webgpu' : 'transformers-wasm'),
    displayName: `Transformers.js embeddings (${device.toUpperCase()})`,
    async isAvailable() {
      if (device === 'webgpu' && !(await hasWebGPUAdapter())) return NO_WEBGPU;
      return { ok: true };
    },
    async isModelCached(model) {
      const { isModelCached } = await import('@localmode/transformers');
      return isModelCached(model.providerModelId);
    },
    async load(model, { onProgress, abortSignal }): Promise<LoadedEmbedder> {
      abortSignal?.throwIfAborted();
      if (device === 'wasm') {
        const settings = wasmLaneSettings(options.wasmLane);
        const lane = new TransformersWorkerLane();
        let dimensions: number | undefined;
        let numThreads: number | undefined;
        try {
          ({ dimensions, numThreads } = await lane.load('embedding', model.providerModelId, device, {
            onProgress: (pct) => onProgress?.({ pct }),
            abortSignal,
            ...(settings ? { settings } : {}),
          }));
        } catch (error) {
          await lane.dispose();
          throw error;
        }
        return {
          model: lane.embeddingModel(model.providerModelId, dimensions ?? 0) as unknown as LoadedEmbedder['model'],
          resolvedBackend: device,
          // The provider loads an embedding model at fp32 unless asked for its quantized (q8) files.
          runtimeConfig: wasmRuntimeConfig(settings?.dtype ?? 'fp32', numThreads),
          dispose: () => lane.dispose(),
        };
      }
      const mod = await import('@localmode/transformers');
      await mod.preloadModel(model.providerModelId, { onProgress: normalizeProgress(onProgress), device });
      abortSignal?.throwIfAborted();
      const embedder = mod.transformers.embedding(model.providerModelId, { device });
      return {
        model: embedder as unknown as LoadedEmbedder['model'],
        resolvedBackend: device,
        runtimeConfig: { device, worker: false },
        dispose: () => disposeModel(embedder),
      };
    },
  };
}

/** wllama GGUF embedding lanes (CPU-pinned and WebGPU, like the LLM lanes). */
function makeWllamaEmbedAdapter(gpu: boolean, options: BenchAdapterOptions = {}): EmbeddingRuntimeAdapter {
  const runtimeId = gpu ? 'wllama-webgpu' : 'wllama';
  const requestedGpuLayers = gpu ? -1 : 0;
  return {
    runtimeId,
    runtimeVersion: runtimeVersionFor(runtimeId),
    displayName: gpu ? 'wllama embeddings (GGUF, WebGPU)' : 'wllama embeddings (GGUF, CPU)',
    async isAvailable() {
      if (gpu && !(await hasWebGPUAdapter())) return NO_WEBGPU;
      return wllamaAvailability();
    },
    async isModelCached(model) {
      const { isModelCached } = await import('@localmode/wllama');
      return isModelCached(model.providerModelId);
    },
    async load(model, { onProgress, abortSignal }): Promise<LoadedEmbedder> {
      const mod = await import('@localmode/wllama');
      abortSignal?.throwIfAborted();
      await mod.preloadModel(model.providerModelId, { onProgress: normalizeProgress(onProgress) });
      abortSignal?.throwIfAborted();
      const embedder = mod.wllama.embedding(model.providerModelId, {
        nGpuLayers: requestedGpuLayers,
        numThreads: wllamaThreads(),
        contextLength: WLLAMA_BENCH_CONTEXT_EMBED,
        ...wllamaBuildSettings(options),
      });
      const webgpuAdapter = await hasWebGPUAdapter();
      let engineLoaded = false;
      const tracked = trackEngineLoad(embedder, () => {
        engineLoaded = true;
      });
      const info = () =>
        wllamaLoadedInfo(embedder as unknown as Parameters<typeof wllamaLoadedInfo>[0], requestedGpuLayers, webgpuAdapter, engineLoaded, {
          nCtx: WLLAMA_BENCH_CONTEXT_EMBED,
        });
      return {
        model: tracked as unknown as LoadedEmbedder['model'],
        get resolvedBackend() {
          return info().resolvedBackend;
        },
        get runtimeConfig() {
          return info().runtimeConfig;
        },
        // Untimed: load llama.cpp with the same probe the runner's warmup sends.
        async settle({ abortSignal }) {
          if (engineLoaded) return;
          await tracked.doEmbed({ values: ['warmup probe'], abortSignal });
        },
        dispose: () => disposeModel(embedder),
      };
    },
  };
}

/** MediaPipe text-embedding lane (Universal Sentence Encoder). */
function makeMediaPipeEmbedAdapter(): EmbeddingRuntimeAdapter {
  return {
    runtimeId: 'mediapipe',
    runtimeVersion: runtimeVersionFor('mediapipe'),
    displayName: 'MediaPipe Text Embedder (USE)',
    async isAvailable() {
      return { ok: true };
    },
    async isModelCached() {
      return undefined; // MediaPipe manages its own fetch; no public cache probe.
    },
    async load(_model, { abortSignal }): Promise<LoadedEmbedder> {
      const mod = await import('@localmode/mediapipe');
      abortSignal?.throwIfAborted();
      const embedder = mod.mediapipe.textEmbedder();
      return {
        model: embedder as unknown as LoadedEmbedder['model'],
        resolvedBackend: 'wasm',
        dispose: () => disposeModel(embedder),
      };
    },
  };
}

/**
 * All LLM adapters keyed by runtime lane.
 *
 * @param options - `wasmLane` for a `wasm-default`, `wasm-q8` or `wasm-threads` control run, `wllamaBuild` for a
 *   `wllama-compat` one (see `controlAdapterOptions`); empty on every other run.
 */
export function createLLMAdapters(options: BenchAdapterOptions = {}): Map<string, LLMRuntimeAdapter> {
  return new Map<string, LLMRuntimeAdapter>([
    ['transformers-webgpu', makeTransformersLLMAdapter('webgpu')],
    ['transformers-wasm', makeTransformersLLMAdapter('wasm', options)],
    ['webllm', makeWebLLMAdapter()],
    ['wllama', makeWllamaAdapter(false, options)],
    ['wllama-webgpu', makeWllamaAdapter(true, options)],
    ['litert', makeLiteRTAdapter()],
    ['chrome-ai', makeChromeAIAdapter()],
  ]);
}

/**
 * All embedding adapters keyed by runtime lane.
 *
 * @param options - `wasmLane` for a `wasm-default`, `wasm-q8` or `wasm-threads` control run, `wllamaBuild` for a
 *   `wllama-compat` one (see `controlAdapterOptions`); empty on every other run.
 */
export function createEmbedAdapters(options: BenchAdapterOptions = {}): Map<string, EmbeddingRuntimeAdapter> {
  return new Map<string, EmbeddingRuntimeAdapter>([
    ['transformers-webgpu', makeTransformersEmbedAdapter('webgpu')],
    ['transformers-wasm', makeTransformersEmbedAdapter('wasm', options)],
    ['wllama', makeWllamaEmbedAdapter(false, options)],
    ['wllama-webgpu', makeWllamaEmbedAdapter(true, options)],
    ['mediapipe', makeMediaPipeEmbedAdapter()],
  ]);
}
