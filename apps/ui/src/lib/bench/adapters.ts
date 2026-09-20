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
  LLMRuntimeAdapter,
  LoadedEmbedder,
  LoadedLLM,
} from '@localmode/bench';
import { runtimeVersionFor } from './runtime-versions';
import { TransformersWorkerLane } from './transformers-worker-client';
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
        ? `browser cannot reserve wllama's shared 4 GB WASM memory (${detail})`
        : `page is not cross-origin isolated (no SharedArrayBuffer), which wllama's shared WASM memory requires (${detail})`,
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
      reason: `wllama's model cache needs the Origin Private File System, which this browser context does not provide (${detail})`,
    };
  }
  return { ok: true };
}

/** Transformers.js lane (device pinned per lane: webgpu or wasm). */
function makeTransformersLLMAdapter(device: 'webgpu' | 'wasm'): LLMRuntimeAdapter {
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
        const lane = new TransformersWorkerLane();
        try {
          await lane.load('llm', model.providerModelId, device, { onProgress: (pct) => onProgress?.({ pct }), abortSignal });
        } catch (error) {
          await lane.dispose();
          throw error;
        }
        return {
          model: lane.languageModel(model.providerModelId) as unknown as LoadedLLM['model'],
          resolvedBackend: device,
          runtimeConfig: { device, dtype: model.quantization ?? 'default', worker: true },
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

/** Thread count the wllama provider uses on an isolated page (its default). */
function wllamaThreads(): number {
  return typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 1;
}

/**
 * Backend and configuration record for a loaded wllama model, from what
 * llama.cpp itself reported at load (`offloaded N/M layers to GPU`), never
 * from the lane's intent. wllama 3.5 offloads every layer to WebGPU by
 * default wherever `navigator.gpu` exists, which is why each lane pins
 * `n_gpu_layers` explicitly: the CPU lane to 0, the WebGPU lane to all.
 */
function wllamaLoadedInfo(
  llm: { gpuAccelerated?: boolean; offloadedLayers?: { gpu: number; total: number } | null },
  requestedGpuLayers: number,
  webgpuAdapter: boolean,
): { resolvedBackend: string; runtimeConfig: Record<string, string | number | boolean> } {
  const offloaded = llm.offloadedLayers ?? null;
  const gpu = offloaded ? offloaded.gpu > 0 : Boolean(llm.gpuAccelerated);
  return {
    resolvedBackend: gpu ? 'webgpu' : 'wasm',
    runtimeConfig: {
      n_threads: wllamaThreads(),
      n_gpu_layers: requestedGpuLayers,
      // llama.cpp prints its offload line only when it found a GPU device, so
      // "unreported" together with webgpu_adapter: false is an unambiguous CPU run.
      webgpu_adapter: webgpuAdapter,
      offloadedLayers: offloaded ? `${offloaded.gpu}/${offloaded.total}` : 'unreported',
      cache_prompt: false,
    },
  };
}

/**
 * The two llama.cpp lanes over the same GGUF files: `wllama` runs on the CPU
 * (WASM SIMD, `n_gpu_layers: 0`) and `wllama-webgpu` offloads every layer
 * to WebGPU (`n_gpu_layers: -1`). The recorded backend comes from llama.cpp's
 * own load report, so a lane that did not get what it asked for says so.
 */
function makeWllamaAdapter(gpu: boolean): LLMRuntimeAdapter {
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
      const llm = mod.wllama.languageModel(model.providerModelId, { nGpuLayers: requestedGpuLayers });
      const webgpuAdapter = await hasWebGPUAdapter();
      // The model loads on first use (the runner's untimed warmup), so the
      // backend and offload report are read lazily, after that load.
      const info = () =>
        wllamaLoadedInfo(llm as unknown as Parameters<typeof wllamaLoadedInfo>[0], requestedGpuLayers, webgpuAdapter);
      return {
        model: withoutPromptCache(llm) as unknown as LoadedLLM['model'],
        get resolvedBackend() {
          return info().resolvedBackend;
        },
        get runtimeConfig() {
          return info().runtimeConfig;
        },
        dispose: () => disposeModel(llm),
      };
    },
  };
}

/** LiteRT lane (.litertlm; GPU-compiled builds require WebGPU, others pin CPU). */
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
      const gpuUsable = await hasWebGPUAdapter();
      return {
        model: llm as unknown as LoadedLLM['model'],
        resolvedBackend: gpuUsable ? 'gpu' : 'cpu',
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
function makeTransformersEmbedAdapter(device: 'webgpu' | 'wasm'): EmbeddingRuntimeAdapter {
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
        const lane = new TransformersWorkerLane();
        let dimensions: number | undefined;
        try {
          ({ dimensions } = await lane.load('embedding', model.providerModelId, device, {
            onProgress: (pct) => onProgress?.({ pct }),
            abortSignal,
          }));
        } catch (error) {
          await lane.dispose();
          throw error;
        }
        return {
          model: lane.embeddingModel(model.providerModelId, dimensions ?? 0) as unknown as LoadedEmbedder['model'],
          resolvedBackend: device,
          runtimeConfig: { device, worker: true },
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
function makeWllamaEmbedAdapter(gpu: boolean): EmbeddingRuntimeAdapter {
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
      const embedder = mod.wllama.embedding(model.providerModelId, { nGpuLayers: requestedGpuLayers });
      const webgpuAdapter = await hasWebGPUAdapter();
      const info = () =>
        wllamaLoadedInfo(embedder as unknown as Parameters<typeof wllamaLoadedInfo>[0], requestedGpuLayers, webgpuAdapter);
      return {
        model: embedder as unknown as LoadedEmbedder['model'],
        get resolvedBackend() {
          return info().resolvedBackend;
        },
        get runtimeConfig() {
          return info().runtimeConfig;
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

/** All LLM adapters keyed by runtime lane. */
export function createLLMAdapters(): Map<string, LLMRuntimeAdapter> {
  return new Map<string, LLMRuntimeAdapter>([
    ['transformers-webgpu', makeTransformersLLMAdapter('webgpu')],
    ['transformers-wasm', makeTransformersLLMAdapter('wasm')],
    ['webllm', makeWebLLMAdapter()],
    ['wllama', makeWllamaAdapter(false)],
    ['wllama-webgpu', makeWllamaAdapter(true)],
    ['litert', makeLiteRTAdapter()],
    ['chrome-ai', makeChromeAIAdapter()],
  ]);
}

/** All embedding adapters keyed by runtime lane. */
export function createEmbedAdapters(): Map<string, EmbeddingRuntimeAdapter> {
  return new Map<string, EmbeddingRuntimeAdapter>([
    ['transformers-webgpu', makeTransformersEmbedAdapter('webgpu')],
    ['transformers-wasm', makeTransformersEmbedAdapter('wasm')],
    ['wllama', makeWllamaEmbedAdapter(false)],
    ['wllama-webgpu', makeWllamaEmbedAdapter(true)],
    ['mediapipe', makeMediaPipeEmbedAdapter()],
  ]);
}
