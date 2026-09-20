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

import type { BenchModelRef, BenchRuntimeId, ProviderUsage } from './types.js';

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

/** A loaded LLM handle: the model plus its resolved execution backend. */
export interface LoadedLLM {
  model: BenchLanguageModel;
  /** Backend actually in use — 'webgpu' | 'wasm' | 'gpu' | 'cpu' | 'chrome-builtin'. */
  resolvedBackend: string;
  /** Post-load runtime configuration worth recording on every cell (threads, GPU layers, dtype, ...). */
  runtimeConfig?: Record<string, string | number | boolean>;
  dispose(): Promise<void>;
}

/** A loaded embedding-model handle. */
export interface LoadedEmbedder {
  model: BenchEmbeddingModel;
  resolvedBackend: string;
  runtimeConfig?: Record<string, string | number | boolean>;
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
