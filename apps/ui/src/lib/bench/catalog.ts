/**
 * Bench model catalog: the cross-runtime pairings the benchmark ships. Each
 * `benchModelId` groups builds of the same weights family across runtimes so
 * the leaderboard can compare engines on equal footing. Entries mirror the
 * provider catalogs; `scripts/bench-catalog.test.ts` asserts they never drift.
 */

import type { BenchModelRef, BenchSuiteId } from '@localmode/bench';

/** All benchmarkable model lanes. */
export const BENCH_MODELS: readonly BenchModelRef[] = [
  // --- SmolLM2 135M — the quick-suite tiny pairing ---
  {
    benchModelId: 'smollm2-135m',
    runtimeId: 'webllm',
    providerModelId: 'SmolLM2-135M-Instruct-q0f16-MLC',
    displayName: 'SmolLM2 135M (MLC q0f16)',
    task: 'llm',
    parameterCount: '135M',
    quantization: 'q0f16',
    sizeBytes: 78 * 1024 * 1024,
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
    sizeBytes: 70 * 1024 * 1024,
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
  },
  {
    benchModelId: 'qwen3-0.6b',
    runtimeId: 'wllama',
    providerModelId: 'Qwen3-0.6B-Q4_K_M',
    displayName: 'Qwen3 0.6B (GGUF Q4_K_M)',
    task: 'llm',
    parameterCount: '0.6B',
    quantization: 'Q4_K_M',
    sizeBytes: 530 * 1024 * 1024,
    contextLength: 40960,
    url: 'https://huggingface.co/unsloth/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q4_K_M.gguf',
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
  },
  {
    benchModelId: 'qwen3-0.6b',
    runtimeId: 'transformers-webgpu',
    providerModelId: 'onnx-community/Qwen3-0.6B-ONNX',
    displayName: 'Qwen3 0.6B (ONNX, WebGPU)',
    task: 'llm',
    parameterCount: '0.6B',
    quantization: 'q4',
    sizeBytes: 570 * 1024 * 1024,
    contextLength: 4096,
    requiresWebGPU: true,
  },
  {
    benchModelId: 'qwen3-0.6b',
    runtimeId: 'transformers-wasm',
    providerModelId: 'onnx-community/Qwen3-0.6B-ONNX',
    displayName: 'Qwen3 0.6B (ONNX, WASM)',
    task: 'llm',
    parameterCount: '0.6B',
    quantization: 'q4',
    sizeBytes: 570 * 1024 * 1024,
    contextLength: 4096,
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
    sizeBytes: 750 * 1024 * 1024,
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
    sizeBytes: 380 * 1024 * 1024,
    contextLength: 8192,
    requiresWebGPU: true,
  },

  // --- Gemma 4 E2B — current-gen medium class, 3-runtime pairing.
  // Thorough suite only: 1.5-3.5 GB downloads per lane; the GGUF brushes the
  // wasm32 heap ceiling and the litert/ONNX builds need WebGPU. ---
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
    sizeBytes: 3.46 * 1024 * 1024 * 1024,
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
    sizeBytes: 1500 * 1024 * 1024,
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
    sizeBytes: 35 * 1024 * 1024,
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
