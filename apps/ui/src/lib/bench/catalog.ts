/**
 * Bench model catalog: the cross-runtime pairings the benchmark ships. Each
 * `benchModelId` groups builds of the same weights family across runtimes so
 * the leaderboard can compare engines on equal footing. Entries mirror the
 * provider catalogs; `scripts/bench-catalog.test.ts` asserts they never drift.
 */

import type { BenchModelRef, BenchSuiteId } from '@localmode/bench';

/**
 * The lanes authored by hand. The `wllama` entries are the CPU lane; the
 * `wllama-webgpu` lane is derived from them below (same GGUF files, every
 * layer offloaded to WebGPU), so the two llama.cpp lanes can never drift.
 */
const AUTHORED_MODELS: readonly BenchModelRef[] = [
  // --- SmolLM2 135M — the quick-suite tiny pairing ---
  {
    benchModelId: 'smollm2-135m',
    runtimeId: 'webllm',
    providerModelId: 'SmolLM2-135M-Instruct-q0f16-MLC',
    displayName: 'SmolLM2 135M (MLC q0f16)',
    task: 'llm',
    parameterCount: '135M',
    quantization: 'q0f16',
    sizeBytes: 271_206_869,
    contextLength: 2048,
    requiresWebGPU: true,
  },
  {
    benchModelId: 'smollm2-135m',
    runtimeId: 'wllama',
    providerModelId: 'SmolLM2-135M-Instruct-Q4_K_M',
    displayName: 'SmolLM2 135M (GGUF Q4_K_M)',
    task: 'llm',
    parameterCount: '135M',
    quantization: 'Q4_K_M',
    sizeBytes: 105_454_432,
    contextLength: 8192,
  },

  // --- Qwen3 0.6B — the headline 4-runtime pairing ---
  {
    benchModelId: 'qwen3-0.6b',
    runtimeId: 'webllm',
    providerModelId: 'Qwen3-0.6B-q4f16_1-MLC',
    displayName: 'Qwen3 0.6B (MLC q4f16)',
    task: 'llm',
    parameterCount: '0.6B',
    quantization: 'q4f16_1',
    sizeBytes: 350 * 1024 * 1024,
    contextLength: 4096,
    requiresWebGPU: true,
    qualityPromptSuffix: ' /no_think',
  },
  {
    benchModelId: 'qwen3-0.6b',
    runtimeId: 'wllama',
    providerModelId: 'Qwen3-0.6B-Q4_K_M',
    displayName: 'Qwen3 0.6B (GGUF Q4_K_M)',
    task: 'llm',
    parameterCount: '0.6B',
    quantization: 'Q4_K_M',
    sizeBytes: 396_705_472,
    contextLength: 40960,
    url: 'https://huggingface.co/unsloth/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q4_K_M.gguf',
    qualityPromptSuffix: ' /no_think',
  },
  {
    benchModelId: 'qwen3-0.6b',
    runtimeId: 'litert',
    providerModelId: 'qwen3-0.6B',
    displayName: 'Qwen3 0.6B (LiteRT)',
    task: 'llm',
    parameterCount: '0.6B',
    quantization: 'litertlm',
    sizeBytes: 614_236_160,
    contextLength: 4096,
    url: 'https://huggingface.co/litert-community/Qwen3-0.6B/resolve/main/Qwen3-0.6B.litertlm',
    qualityPromptSuffix: ' /no_think',
  },
  {
    benchModelId: 'qwen3-0.6b',
    runtimeId: 'transformers-webgpu',
    providerModelId: 'onnx-community/Qwen3-0.6B-ONNX',
    displayName: 'Qwen3 0.6B (ONNX, WebGPU)',
    task: 'llm',
    parameterCount: '0.6B',
    quantization: 'q4',
    sizeBytes: 928_224_461,
    contextLength: 4096,
    requiresWebGPU: true,
    qualityPromptSuffix: ' /no_think',
  },
  {
    benchModelId: 'qwen3-0.6b',
    runtimeId: 'transformers-wasm',
    providerModelId: 'onnx-community/Qwen3-0.6B-ONNX',
    displayName: 'Qwen3 0.6B (ONNX, WASM)',
    task: 'llm',
    parameterCount: '0.6B',
    quantization: 'q4',
    sizeBytes: 928_224_461,
    contextLength: 4096,
    qualityPromptSuffix: ' /no_think',
  },

  // --- Llama 3.2 1B — the 3-runtime mid-size pairing ---
  {
    benchModelId: 'llama-3.2-1b',
    runtimeId: 'webllm',
    providerModelId: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    displayName: 'Llama 3.2 1B (MLC q4f16)',
    task: 'llm',
    parameterCount: '1B',
    quantization: 'q4f16_1',
    sizeBytes: 712 * 1024 * 1024,
    contextLength: 4096,
    requiresWebGPU: true,
  },
  {
    benchModelId: 'llama-3.2-1b',
    runtimeId: 'wllama',
    providerModelId: 'Llama-3.2-1B-Instruct-Q4_K_M',
    displayName: 'Llama 3.2 1B (GGUF Q4_K_M)',
    task: 'llm',
    parameterCount: '1B',
    quantization: 'Q4_K_M',
    sizeBytes: 807_694_464,
    contextLength: 131072,
    url: 'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf',
  },
  {
    benchModelId: 'llama-3.2-1b',
    runtimeId: 'transformers-webgpu',
    providerModelId: 'onnx-community/Llama-3.2-1B-Instruct-ONNX',
    displayName: 'Llama 3.2 1B (ONNX, WebGPU)',
    task: 'llm',
    parameterCount: '1B',
    quantization: 'q4',
    sizeBytes: 1_704_451_656,
    contextLength: 8192,
    requiresWebGPU: true,
  },

  // --- Gemma 4 E2B — current-gen medium class, 3-runtime pairing.
  // Thorough suite only: 2.0-5.2 GB downloads per lane; the GGUF brushes the
  // 4 GiB link-time memory cap of wllama's memory64 build and the litert/ONNX
  // builds need WebGPU. ---
  {
    benchModelId: 'gemma-4-e2b',
    runtimeId: 'litert',
    providerModelId: 'gemma-4-E2B',
    displayName: 'Gemma 4 E2B (LiteRT)',
    task: 'llm',
    parameterCount: 'E2B',
    quantization: 'litertlm',
    sizeBytes: 2_008_432_640,
    contextLength: 8192,
    url: 'https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.litertlm',
    requiresWebGPU: true,
  },
  {
    benchModelId: 'gemma-4-e2b',
    runtimeId: 'wllama',
    providerModelId: 'Gemma-4-E2B-IT-Q4_K_M',
    displayName: 'Gemma 4 E2B (GGUF Q4_K_M)',
    task: 'llm',
    parameterCount: 'E2B',
    quantization: 'Q4_K_M',
    sizeBytes: 3_462_680_032,
    contextLength: 131072,
    url: 'https://huggingface.co/bartowski/google_gemma-4-E2B-it-GGUF/resolve/main/google_gemma-4-E2B-it-Q4_K_M.gguf',
  },
  {
    benchModelId: 'gemma-4-e2b',
    runtimeId: 'transformers-webgpu',
    providerModelId: 'onnx-community/gemma-4-E2B-it-ONNX',
    displayName: 'Gemma 4 E2B (ONNX, WebGPU)',
    task: 'llm',
    parameterCount: 'E2B',
    quantization: 'q4f16',
    sizeBytes: 5_163_395_208,
    contextLength: 131072,
    requiresWebGPU: true,
  },

  // --- Chrome Built-in AI — its own lane (weights not comparable) ---
  {
    benchModelId: 'gemini-nano',
    runtimeId: 'chrome-ai',
    providerModelId: 'gemini-nano',
    displayName: 'Gemini Nano (Chrome Built-in)',
    task: 'llm',
    contextLength: 6144,
  },

  // --- BGE Small EN v1.5 — the embedding pairing ---
  {
    benchModelId: 'bge-small-en',
    runtimeId: 'transformers-webgpu',
    providerModelId: 'Xenova/bge-small-en-v1.5',
    displayName: 'BGE Small EN (ONNX, WebGPU)',
    task: 'embedding',
    parameterCount: '33M',
    quantization: 'q8',
    requiresWebGPU: true,
  },
  {
    benchModelId: 'bge-small-en',
    runtimeId: 'transformers-wasm',
    providerModelId: 'Xenova/bge-small-en-v1.5',
    displayName: 'BGE Small EN (ONNX, WASM)',
    task: 'embedding',
    parameterCount: '33M',
    quantization: 'q8',
  },
  {
    benchModelId: 'bge-small-en',
    runtimeId: 'wllama',
    providerModelId: 'bge-small-en-v1.5-Q8_0',
    displayName: 'BGE Small EN (GGUF Q8_0)',
    task: 'embedding',
    parameterCount: '33M',
    quantization: 'Q8_0',
    sizeBytes: 36_806_944,
    contextLength: 512,
    url: 'https://huggingface.co/CompendiumLabs/bge-small-en-v1.5-gguf/resolve/main/bge-small-en-v1.5-q8_0.gguf',
  },

  // --- MediaPipe Universal Sentence Encoder — the non-transformer baseline ---
  {
    benchModelId: 'use-mediapipe',
    runtimeId: 'mediapipe',
    providerModelId: 'universal_sentence_encoder',
    displayName: 'Universal Sentence Encoder (MediaPipe)',
    task: 'embedding',
    parameterCount: '~110M',
  },
] as const;

/** The llama.cpp WebGPU lane: the wllama entries with all layers offloaded to the GPU. */
const WLLAMA_WEBGPU_MODELS: readonly BenchModelRef[] = AUTHORED_MODELS.filter(
  (m) => m.runtimeId === 'wllama',
).map((m) => ({
  ...m,
  runtimeId: 'wllama-webgpu',
  displayName: m.displayName.replace('(GGUF', '(GGUF WebGPU,'),
  requiresWebGPU: true,
}));

/** All benchmarkable model lanes. */
export const BENCH_MODELS: readonly BenchModelRef[] = [...AUTHORED_MODELS, ...WLLAMA_WEBGPU_MODELS];

/** Model lanes per suite preset (custom suites pick freely). */
export const SUITE_MODELS: Record<Exclude<BenchSuiteId, 'custom'>, string[]> = {
  // Quick: tiny LLM pairing + the embedding pairing (~10 min incl. downloads).
  quick: ['smollm2-135m', 'bge-small-en', 'use-mediapipe'],
  // Standard: adds the headline 4-runtime Qwen3 pairing + Gemini Nano.
  standard: ['smollm2-135m', 'qwen3-0.6b', 'gemini-nano', 'bge-small-en', 'use-mediapipe'],
  // Thorough: everything, including the multi-GB Gemma 4 E2B pairing.
  thorough: [
    'smollm2-135m',
    'qwen3-0.6b',
    'llama-3.2-1b',
    'gemma-4-e2b',
    'gemini-nano',
    'bge-small-en',
    'use-mediapipe',
  ],
};

/** Lookup helpers. */
export function benchModelsFor(benchModelIds: readonly string[]): BenchModelRef[] {
  return BENCH_MODELS.filter((m) => benchModelIds.includes(m.benchModelId));
}

/**
 * The provider cache a lane's model files land in. The two llama.cpp lanes
 * load the same GGUF, and the Transformers.js WASM and WebGPU lanes load the
 * same ONNX files (a text-only model uses `dtype: 'q4'` on both devices), so
 * lanes that differ only in backend share one download.
 */
function artifactProvider(runtimeId: string): string {
  if (runtimeId === 'wllama-webgpu') return 'wllama';
  if (runtimeId === 'transformers-wasm' || runtimeId === 'transformers-webgpu') return 'transformers';
  return runtimeId;
}

/**
 * The identity of the model files a lane downloads: the file URL when the
 * catalog declares one, otherwise the provider cache, model id and
 * quantization.
 */
function artifactKey(model: BenchModelRef): string {
  return model.url ?? `${artifactProvider(model.runtimeId)}|${model.providerModelId}|${model.quantization ?? ''}`;
}

/**
 * The pre-run download estimate for a set of lanes, in bytes: each model file
 * is counted once, however many lanes load it (a second lane loads it from the
 * provider cache).
 *
 * @param models - The lanes that will run
 * @returns The summed declared size of the unique model files
 */
export function estimateDownloadBytes(models: readonly BenchModelRef[]): number {
  const unique = new Map(models.map((m) => [artifactKey(m), m.sizeBytes ?? 0]));
  return [...unique.values()].reduce((acc, bytes) => acc + bytes, 0);
}
