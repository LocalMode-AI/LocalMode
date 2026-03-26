/**
 * Popular GGUF Model Constants
 *
 * Pre-defined model catalog for commonly used GGUF models curated for browser use.
 *
 * @packageDocumentation
 */

/**
 * Entry in the recommended GGUF model catalog.
 */
export interface WllamaModelEntry {
  /** Human-readable model name */
  name: string;

  /** Maximum context window in tokens */
  contextLength: number;

  /** File size in bytes */
  sizeBytes: number;

  /** Human-readable file size (e.g., '600MB') */
  size: string;

  /** Short description */
  description: string;

  /** HuggingFace download URL */
  url: string;

  /** Model architecture family */
  architecture: string;

  /** Quantization type (e.g., 'Q4_K_M') */
  quantization: string;

  /** Approximate parameter count */
  parameterCount: number;
}

/**
 * Popular GGUF models curated for browser use.
 *
 * These are Q4_K_M quantized models that balance quality and size for browser inference.
 * All URLs point to HuggingFace repositories. Compatible with wllama v2.3.7 / llama.cpp b7179.
 *
 */
export const WLLAMA_MODELS = {
  // === TINY MODELS (< 500MB) - Fast loading, quick responses ===
  'SmolLM2-135M-Instruct-Q4_K_M': {
    name: 'SmolLM2 135M',
    contextLength: 8192,
    sizeBytes: 70 * 1024 * 1024, // ~70MB
    size: '70MB',
    description: 'Tiniest GGUF model, instant loading, good for testing',
    url: 'https://huggingface.co/bartowski/SmolLM2-135M-Instruct-GGUF/resolve/main/SmolLM2-135M-Instruct-Q4_K_M.gguf',
    architecture: 'llama',
    quantization: 'Q4_K_M',
    parameterCount: 135_000_000,
  },
  'SmolLM2-360M-Instruct-Q4_K_M': {
    name: 'SmolLM2 360M',
    contextLength: 8192,
    sizeBytes: 234 * 1024 * 1024, // ~234MB
    size: '234MB',
    description: 'Very small, surprisingly capable for its size',
    url: 'https://huggingface.co/bartowski/SmolLM2-360M-Instruct-GGUF/resolve/main/SmolLM2-360M-Instruct-Q4_K_M.gguf',
    architecture: 'llama',
    quantization: 'Q4_K_M',
    parameterCount: 360_000_000,
  },
  'Qwen2.5-0.5B-Instruct-Q4_K_M': {
    name: 'Qwen 2.5 0.5B',
    contextLength: 4096,
    sizeBytes: 386 * 1024 * 1024, // ~386MB
    size: '386MB',
    description: 'Tiny Qwen with great quality for its size',
    url: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf',
    architecture: 'qwen2',
    quantization: 'Q4_K_M',
    parameterCount: 500_000_000,
  },

  // === SMALL MODELS (500MB - 1GB) - Good balance ===
  'TinyLlama-1.1B-Chat-Q4_K_M': {
    name: 'TinyLlama 1.1B Chat',
    contextLength: 2048,
    sizeBytes: 670 * 1024 * 1024, // ~670MB
    size: '670MB',
    description: 'Classic tiny Llama, fast and reliable',
    url: 'https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf',
    architecture: 'llama',
    quantization: 'Q4_K_M',
    parameterCount: 1_100_000_000,
  },
  'Llama-3.2-1B-Instruct-Q4_K_M': {
    name: 'Llama 3.2 1B',
    contextLength: 131072,
    sizeBytes: 750 * 1024 * 1024, // ~750MB
    size: '750MB',
    description: 'Llama 3.2 1B, great for simple tasks with huge context',
    url: 'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    architecture: 'llama',
    quantization: 'Q4_K_M',
    parameterCount: 1_236_000_000,
  },
  'Qwen2.5-1.5B-Instruct-Q4_K_M': {
    name: 'Qwen 2.5 1.5B',
    contextLength: 32768,
    sizeBytes: 986 * 1024 * 1024, // ~986MB
    size: '986MB',
    description: 'Qwen 2.5 1.5B, strong multilingual support',
    url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    architecture: 'qwen2',
    quantization: 'Q4_K_M',
    parameterCount: 1_500_000_000,
  },

  // === MEDIUM MODELS (1GB - 2GB) - Better quality ===
  'Qwen2.5-Coder-1.5B-Instruct-Q4_K_M': {
    name: 'Qwen 2.5 Coder 1.5B',
    contextLength: 32768,
    sizeBytes: 1.0 * 1024 * 1024 * 1024, // ~1.0GB
    size: '1.0GB',
    description: 'Code-specialized Qwen 2.5, great for programming tasks',
    url: 'https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf',
    architecture: 'qwen2',
    quantization: 'Q4_K_M',
    parameterCount: 1_500_000_000,
  },
  'SmolLM2-1.7B-Instruct-Q4_K_M': {
    name: 'SmolLM2 1.7B',
    contextLength: 8192,
    sizeBytes: 1.06 * 1024 * 1024 * 1024, // ~1.06GB
    size: '1.06GB',
    description: 'Largest SmolLM2, excellent efficiency per parameter',
    url: 'https://huggingface.co/bartowski/SmolLM2-1.7B-Instruct-GGUF/resolve/main/SmolLM2-1.7B-Instruct-Q4_K_M.gguf',
    architecture: 'llama',
    quantization: 'Q4_K_M',
    parameterCount: 1_700_000_000,
  },
  'Phi-3.5-mini-instruct-Q4_K_M': {
    name: 'Phi 3.5 Mini',
    contextLength: 4096,
    sizeBytes: 1.24 * 1024 * 1024 * 1024, // ~1.24GB
    size: '1.24GB',
    description: 'Microsoft Phi-3.5, excellent reasoning and coding',
    url: 'https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf',
    architecture: 'phi3',
    quantization: 'Q4_K_M',
    parameterCount: 3_800_000_000,
  },
  'Gemma-2-2B-IT-Q4_K_M': {
    name: 'Gemma 2 2B IT',
    contextLength: 8192,
    sizeBytes: 1.3 * 1024 * 1024 * 1024, // ~1.3GB
    size: '1.3GB',
    description: 'Google Gemma 2, strong instruction following',
    url: 'https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf',
    architecture: 'gemma',
    quantization: 'Q4_K_M',
    parameterCount: 2_000_000_000,
  },
  'Llama-3.2-3B-Instruct-Q4_K_M': {
    name: 'Llama 3.2 3B',
    contextLength: 131072,
    sizeBytes: 1.93 * 1024 * 1024 * 1024, // ~1.93GB
    size: '1.93GB',
    description: 'Llama 3.2 3B, excellent quality with huge context',
    url: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    architecture: 'llama',
    quantization: 'Q4_K_M',
    parameterCount: 3_213_000_000,
  },
  'Qwen2.5-3B-Instruct-Q4_K_M': {
    name: 'Qwen 2.5 3B',
    contextLength: 32768,
    sizeBytes: 1.94 * 1024 * 1024 * 1024, // ~1.94GB
    size: '1.94GB',
    description: 'Qwen 2.5 3B, high quality multilingual generation',
    url: 'https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf',
    architecture: 'qwen2',
    quantization: 'Q4_K_M',
    parameterCount: 3_000_000_000,
  },

  // === LARGE MODELS (2GB+) - Best quality ===
  'Phi-4-mini-instruct-Q4_K_M': {
    name: 'Phi-4 Mini',
    contextLength: 4096,
    sizeBytes: 2.3 * 1024 * 1024 * 1024, // ~2.3GB
    size: '2.3GB',
    description: 'Microsoft Phi-4, strong reasoning and coding',
    url: 'https://huggingface.co/bartowski/microsoft_Phi-4-mini-instruct-GGUF/resolve/main/microsoft_Phi-4-mini-instruct-Q4_K_M.gguf',
    architecture: 'phi4',
    quantization: 'Q4_K_M',
    parameterCount: 3_800_000_000,
  },
  'Qwen2.5-Coder-7B-Instruct-Q4_K_M': {
    name: 'Qwen 2.5 Coder 7B',
    contextLength: 32768,
    sizeBytes: 4.5 * 1024 * 1024 * 1024, // ~4.5GB
    size: '4.5GB',
    description: 'Qwen 2.5 Coder 7B, best code generation quality',
    url: 'https://huggingface.co/bartowski/Qwen2.5-Coder-7B-Instruct-GGUF/resolve/main/Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf',
    architecture: 'qwen2',
    quantization: 'Q4_K_M',
    parameterCount: 7_000_000_000,
  },
  'Mistral-7B-Instruct-v0.3-Q4_K_M': {
    name: 'Mistral 7B v0.3',
    contextLength: 32768,
    sizeBytes: 4.37 * 1024 * 1024 * 1024, // ~4.37GB
    size: '4.37GB',
    description: 'Mistral 7B, strong general performance',
    url: 'https://huggingface.co/bartowski/Mistral-7B-Instruct-v0.3-GGUF/resolve/main/Mistral-7B-Instruct-v0.3-Q4_K_M.gguf',
    architecture: 'llama',
    quantization: 'Q4_K_M',
    parameterCount: 7_248_000_000,
  },
  'Llama-3.1-8B-Instruct-Q4_K_M': {
    name: 'Llama 3.1 8B',
    contextLength: 131072,
    sizeBytes: 4.92 * 1024 * 1024 * 1024, // ~4.92GB
    size: '4.92GB',
    description: 'Llama 3.1 8B, best quality for capable devices',
    url: 'https://huggingface.co/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF/resolve/main/Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf',
    architecture: 'llama',
    quantization: 'Q4_K_M',
    parameterCount: 8_030_000_000,
  },
} as const;

/** Size thresholds for model categories (in bytes) */
export const MODEL_SIZE_THRESHOLDS = {
  tiny: 500 * 1024 * 1024, // < 500MB
  small: 1024 * 1024 * 1024, // 500MB - 1GB
  medium: 2 * 1024 * 1024 * 1024, // 1GB - 2GB
  // large: > 2GB
} as const;

/** Get model category based on size */
export function getModelCategory(sizeBytes: number): 'tiny' | 'small' | 'medium' | 'large' {
  if (sizeBytes < MODEL_SIZE_THRESHOLDS.tiny) return 'tiny';
  if (sizeBytes < MODEL_SIZE_THRESHOLDS.small) return 'small';
  if (sizeBytes < MODEL_SIZE_THRESHOLDS.medium) return 'medium';
  return 'large';
}

/** Type-safe model ID for curated models */
export type WllamaModelId = keyof typeof WLLAMA_MODELS;
