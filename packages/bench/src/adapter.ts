/**
 * Runtime adapter contract. Adapters wire a browser ML runtime (Transformers.js,
 * WebLLM, wllama, LiteRT, Chrome Built-in AI, MediaPipe) to the runner. They are
 * injected by the harness host (e.g. the localmode.ai bench page) so this
 * package stays free of provider dependencies — the same pattern the LocalMode
 * blocks use for provider wiring.
 *
 * The runner consumes the `@localmode/core` model interfaces structurally
 * (type-only peer dependency): any object with a compatible `doStream`/`doEmbed`
 * works, including models from other libraries.
 */

import type { BenchCellProfile, BenchModelRef, BenchRuntimeId, BenchWorkloadKind, ProviderUsage } from './types.js';

/** Structural subset of `@localmode/core`'s StreamChunk. */
export interface BenchStreamChunk {
  text: string;
  done: boolean;
  finishReason?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    durationMs: number;
  };
}

/** Structural subset of `@localmode/core`'s LanguageModel. */
export interface BenchLanguageModel {
  readonly modelId: string;
  readonly provider: string;
  doStream?(options: {
    prompt: string;
    systemPrompt?: string;
    maxTokens?: number;
    temperature?: number;
    abortSignal?: AbortSignal;
  }): AsyncIterable<BenchStreamChunk>;
  doGenerate(options: {
    prompt: string;
    systemPrompt?: string;
    maxTokens?: number;
    temperature?: number;
    abortSignal?: AbortSignal;
  }): Promise<{ text: string; finishReason: string; usage: ProviderUsage | Omit<ProviderUsage, 'fidelity'> }>;
}

/** Structural subset of `@localmode/core`'s EmbeddingModel. */
export interface BenchEmbeddingModel {
  readonly modelId: string;
  readonly provider: string;
  readonly dimensions: number;
  doEmbed(options: { values: string[]; abortSignal?: AbortSignal }): Promise<{
    embeddings: Float32Array[];
  }>;
}

/** Availability probe result for a runtime lane on this device. */
export interface AdapterAvailability {
  ok: boolean;
  /** Human-readable reason when not available ('no WebGPU adapter', ...). */
  reason?: string;
}

/** Load-progress callback payload (normalized percent when known). */
export interface AdapterLoadProgress {
  pct?: number;
}

/**
 * A loaded model's profiler on a profile control run (since bench 0.9.14):
 * `ort-profile` (Transformers.js lanes) or `llamacpp-profile` (llama.cpp
 * lanes). The runner calls `beginCell` before a cell's first request and
 * `endCell` after its last (retries included; the group's untimed warmup
 * runs before the first cell, outside every cell), then `collect` once,
 * untimed, after the group's last cell and after `dispose` (so a profiler
 * that runs a profiling pass of its own has the memory to itself). The profiler
 * returns a profile for the cells it profiled, keyed by cell id (and the
 * cells it failed to profile, with the reason), and decides itself which
 * cells those are (the host profiles only some models and workloads).
 */
export interface BenchCellProfiler {
  beginCell(cell: { cellId: string; workloadKind: BenchWorkloadKind }): void;
  endCell(cellId: string): void;
  collect(): Promise<BenchProfileCollection>;
}

/**
 * What a profiler's `collect()` returns: a profile per profiled cell, and the
 * cells whose profile could not be taken with the reason (the runner records
 * each as a `profile-error` trace event; the cell's measurements stand).
 */
export interface BenchProfileCollection {
  profiles: Record<string, BenchCellProfile>;
  errors?: Record<string, string>;
}

/** A loaded LLM handle: the model plus its resolved execution backend. */
export interface LoadedLLM {
  model: BenchLanguageModel;
  /** Backend actually in use — 'webgpu' | 'wasm' | 'gpu' | 'cpu' | 'chrome-builtin'. */
  resolvedBackend: string;
  /** Post-load runtime configuration worth recording on every cell (threads, GPU layers, dtype, ...). */
  runtimeConfig?: Record<string, string | number | boolean>;
  /**
   * Optional, untimed (since bench 0.9.9): finish any engine load the adapter
   * defers to first use, so `resolvedBackend` and `runtimeConfig` read the
   * engine's own report instead of a prediction. The runner calls it on a
   * warm-reload handle after the reload's timed span ends, before reading the
   * record; the timed cells read the record after the untimed warmup, which
   * loads the engine the same way. Adapters that load eagerly omit it.
   */
  settle?(options: { abortSignal?: AbortSignal }): Promise<void>;
  /** Optional: the model's profiler on a profile control run (see `BenchCellProfiler`). */
  profiler?: BenchCellProfiler;
  dispose(): Promise<void>;
}

/** A loaded embedding-model handle. */
export interface LoadedEmbedder {
  model: BenchEmbeddingModel;
  resolvedBackend: string;
  runtimeConfig?: Record<string, string | number | boolean>;
  /** See `LoadedLLM.settle`. */
  settle?(options: { abortSignal?: AbortSignal }): Promise<void>;
  /** See `LoadedLLM.profiler`. */
  profiler?: BenchCellProfiler;
  dispose(): Promise<void>;
}

/** Adapter for an LLM runtime lane. */
export interface LLMRuntimeAdapter {
  readonly runtimeId: BenchRuntimeId;
  readonly displayName: string;
  /** Underlying runtime library version, when known (recorded per cell). */
  readonly runtimeVersion?: string;
  /** Is this lane usable on the current device/browser? */
  isAvailable(): Promise<AdapterAvailability>;
  /** Provider cache probe — true=warm, false=cold, undefined=unknown. */
  isModelCached(model: BenchModelRef): Promise<boolean | undefined>;
  /** Load (download + compile) the model. Must NOT run any inference. */
  load(
    model: BenchModelRef,
    options: { onProgress?: (p: AdapterLoadProgress) => void; abortSignal?: AbortSignal },
  ): Promise<LoadedLLM>;
}

/** Adapter for an embedding runtime lane. */
export interface EmbeddingRuntimeAdapter {
  readonly runtimeId: BenchRuntimeId;
  readonly displayName: string;
  readonly runtimeVersion?: string;
  isAvailable(): Promise<AdapterAvailability>;
  isModelCached(model: BenchModelRef): Promise<boolean | undefined>;
  load(
    model: BenchModelRef,
    options: { onProgress?: (p: AdapterLoadProgress) => void; abortSignal?: AbortSignal },
  ): Promise<LoadedEmbedder>;
}

/** Usage fidelity per runtime — how trustworthy provider token counts are. */
export const USAGE_FIDELITY: Record<BenchRuntimeId, ProviderUsage['fidelity']> = {
  'transformers-webgpu': 'estimated',
  'transformers-wasm': 'estimated',
  webllm: 'chunk-count',
  wllama: 'estimated',
  'wllama-webgpu': 'estimated',
  litert: 'estimated',
  'chrome-ai': 'estimated',
  mediapipe: 'estimated',
};
