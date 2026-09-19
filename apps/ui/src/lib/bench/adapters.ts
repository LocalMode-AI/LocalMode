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
      const mod = await import('@localmode/transformers');
      abortSignal?.throwIfAborted();
      // Preload on the lane's own device so the cached artifacts and the
      // throwaway session match what the timed lane runs (the preload
      // disposes its session; the runner's warmup builds the real one).
      await mod.preloadModel(model.providerModelId, { onProgress: normalizeProgress(onProgress), device });
      abortSignal?.throwIfAborted();
      const llm = mod.transformers.languageModel(model.providerModelId, { device });
      return {
        model: llm as unknown as LoadedLLM['model'],
        resolvedBackend: device,
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

/** wllama lane (llama.cpp WASM; GPU offload only when explicitly enabled). */
function makeWllamaAdapter(): LLMRuntimeAdapter {
  return {
    runtimeId: 'wllama',
    runtimeVersion: runtimeVersionFor('wllama'),
    displayName: 'wllama (llama.cpp WASM)',
    async isAvailable() {
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
      const llm = mod.wllama.languageModel(model.providerModelId, {});
      return {
        model: withoutPromptCache(llm) as unknown as LoadedLLM['model'],
        // WASM by default; gpuAccelerated flips when WebGPU offload engages.
        get resolvedBackend() {
          return (llm as unknown as { gpuAccelerated?: boolean }).gpuAccelerated ? 'webgpu' : 'wasm';
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
      const mod = await import('@localmode/transformers');
      abortSignal?.throwIfAborted();
      await mod.preloadModel(model.providerModelId, { onProgress: normalizeProgress(onProgress), device });
      abortSignal?.throwIfAborted();
      const embedder = mod.transformers.embedding(model.providerModelId, { device });
      return {
        model: embedder as unknown as LoadedEmbedder['model'],
        resolvedBackend: device,
        dispose: () => disposeModel(embedder),
      };
    },
  };
}

/** wllama GGUF embedding lane. */
function makeWllamaEmbedAdapter(): EmbeddingRuntimeAdapter {
  return {
    runtimeId: 'wllama',
    runtimeVersion: runtimeVersionFor('wllama'),
    displayName: 'wllama embeddings (GGUF)',
    async isAvailable() {
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
      const embedder = mod.wllama.embedding(model.providerModelId, {});
      return {
        model: embedder as unknown as LoadedEmbedder['model'],
        resolvedBackend: 'wasm',
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
    ['wllama', makeWllamaAdapter()],
    ['litert', makeLiteRTAdapter()],
    ['chrome-ai', makeChromeAIAdapter()],
  ]);
}

/** All embedding adapters keyed by runtime lane. */
export function createEmbedAdapters(): Map<string, EmbeddingRuntimeAdapter> {
  return new Map<string, EmbeddingRuntimeAdapter>([
    ['transformers-webgpu', makeTransformersEmbedAdapter('webgpu')],
    ['transformers-wasm', makeTransformersEmbedAdapter('wasm')],
    ['wllama', makeWllamaEmbedAdapter()],
    ['mediapipe', makeMediaPipeEmbedAdapter()],
  ]);
}
