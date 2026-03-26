/**
 * Popular WebLLM Model Constants
 *
 * Pre-defined model IDs for commonly used WebLLM models.
 * 4-bit quantized for efficient browser-based inference.
 *
 * @packageDocumentation
 */

/**
 * Popular WebLLM models (4-bit quantized for browser use).
 * Model IDs must match exactly what @mlc-ai/web-llm supports.
 *
 * includes Qwen 3, DeepSeek R1, Mistral v0.3, Ministral 3,
 * Llama 3.1/3.2, Phi 3/3.5, Gemma 2, and SmolLM2 families.
 */
export const WEBLLM_MODELS = {
  // === TINY MODELS (< 500MB) - Fast loading, quick responses ===
  'SmolLM2-135M-Instruct-q0f16-MLC': {
    name: 'SmolLM2 135M',
    contextLength: 2048,
    sizeBytes: 78 * 1024 * 1024, // ~78MB
    size: '78MB',
    description: 'Tiniest model, instant loading',
  },
  'SmolLM2-360M-Instruct-q4f16_1-MLC': {
    name: 'SmolLM2 360M',
    contextLength: 2048,
    sizeBytes: 210 * 1024 * 1024, // ~210MB
    size: '210MB',
    description: 'Very small, surprisingly capable',
  },
  'Qwen2.5-0.5B-Instruct-q4f16_1-MLC': {
    name: 'Qwen 2.5 0.5B',
    contextLength: 4096,
    sizeBytes: 278 * 1024 * 1024, // ~278MB
    size: '278MB',
    description: 'Tiny Qwen, great quality for size',
  },
  'Qwen3-0.6B-q4f16_1-MLC': {
    name: 'Qwen 3 0.6B',
    contextLength: 4096,
    sizeBytes: 350 * 1024 * 1024, // ~350MB
    size: '350MB',
    description: 'Qwen 3 0.6B, latest tiny model',
  },

  'TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC': {
    name: 'TinyLlama 1.1B',
    contextLength: 2048,
    sizeBytes: 400 * 1024 * 1024, // ~400MB
    size: '400MB',
    description: 'TinyLlama 1.1B, fast and capable chat',
  },

  // === SMALL MODELS (500MB - 1GB) - Good balance ===
  'Llama-3.2-1B-Instruct-q4f16_1-MLC': {
    name: 'Llama 3.2 1B',
    contextLength: 4096,
    sizeBytes: 712 * 1024 * 1024, // ~712MB
    size: '712MB',
    description: 'Llama 3.2 1B, great for simple tasks',
  },
  'Qwen2.5-1.5B-Instruct-q4f16_1-MLC': {
    name: 'Qwen 2.5 1.5B',
    contextLength: 4096,
    sizeBytes: 868 * 1024 * 1024, // ~868MB
    size: '868MB',
    description: 'Qwen 2.5 1.5B, multilingual',
  },
  'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC': {
    name: 'Qwen 2.5 Coder 1.5B',
    contextLength: 4096,
    sizeBytes: 868 * 1024 * 1024, // ~868MB
    size: '868MB',
    description: 'Qwen 2.5 Coder 1.5B, code-specialized',
  },

  // === MEDIUM MODELS (1GB - 2GB) - Better quality ===
  'Qwen3-1.7B-q4f16_1-MLC': {
    name: 'Qwen 3 1.7B',
    contextLength: 4096,
    sizeBytes: 1100 * 1024 * 1024, // ~1.1GB
    size: '1.1GB',
    description: 'Qwen 3 1.7B, latest multilingual',
  },
  'SmolLM2-1.7B-Instruct-q4f16_1-MLC': {
    name: 'SmolLM2 1.7B',
    contextLength: 2048,
    sizeBytes: 1 * 1024 * 1024 * 1024, // ~1GB
    size: '1GB',
    description: 'SmolLM 2 1.7B, best small model (requires shader-f16)',
  },
  'gemma-2-2b-it-q4f16_1-MLC': {
    name: 'Gemma 2 2B',
    contextLength: 2048,
    sizeBytes: 1.44 * 1024 * 1024 * 1024, // ~1.44GB
    size: '1.44GB',
    description: 'Google Gemma 2, instruction-tuned (requires shader-f16)',
  },
  'Qwen2.5-3B-Instruct-q4f16_1-MLC': {
    name: 'Qwen 2.5 3B',
    contextLength: 4096,
    sizeBytes: 1.7 * 1024 * 1024 * 1024, // ~1.7GB
    size: '1.7GB',
    description: 'Qwen 2.5 3B, high quality',
  },
  'Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC': {
    name: 'Qwen 2.5 Coder 3B',
    contextLength: 4096,
    sizeBytes: 1.7 * 1024 * 1024 * 1024, // ~1.7GB
    size: '1.7GB',
    description: 'Qwen 2.5 Coder 3B, mid-range code model',
  },
  'Llama-3.2-3B-Instruct-q4f16_1-MLC': {
    name: 'Llama 3.2 3B',
    contextLength: 4096,
    sizeBytes: 1.76 * 1024 * 1024 * 1024, // ~1.76GB
    size: '1.76GB',
    description: 'Llama 3.2 3B, excellent quality',
  },
  'Hermes-3-Llama-3.2-3B-q4f16_1-MLC': {
    name: 'Hermes 3 Llama 3.2 3B',
    contextLength: 4096,
    sizeBytes: 1.76 * 1024 * 1024 * 1024, // ~1.76GB
    size: '1.76GB',
    description: 'Hermes Llama 3.2, enhanced chat',
  },
  'Ministral-3-3B-Instruct-2512-BF16-q4f16_1-MLC': {
    name: 'Ministral 3 3B',
    contextLength: 4096,
    sizeBytes: 1.8 * 1024 * 1024 * 1024, // ~1.8GB
    size: '1.8GB',
    description: 'Mistral Ministral 3B, latest 3B architecture',
  },
  'Ministral-3-3B-Reasoning-2512-q4f16_1-MLC': {
    name: 'Ministral 3 3B Reasoning',
    contextLength: 4096,
    sizeBytes: 1.8 * 1024 * 1024 * 1024, // ~1.8GB
    size: '1.8GB',
    description: 'Ministral 3B reasoning-tuned, strong logical tasks',
  },

  // === LARGE MODELS (> 2GB) - Best quality, requires dedicated GPU ===
  'Phi-3.5-mini-instruct-q4f16_1-MLC': {
    name: 'Phi 3.5 Mini',
    contextLength: 4096,
    sizeBytes: 2.1 * 1024 * 1024 * 1024, // ~2.1GB
    size: '2.1GB',
    description: 'Microsoft Phi-3.5, excellent reasoning',
  },
  'Phi-3-mini-4k-instruct-q4f16_1-MLC': {
    name: 'Phi 3 Mini 4K',
    contextLength: 4096,
    sizeBytes: 2.2 * 1024 * 1024 * 1024, // ~2.2GB
    size: '2.2GB',
    description: 'Microsoft Phi-3, reasoning and coding',
  },
  'Phi-3.5-vision-instruct-q4f16_1-MLC': {
    name: 'Phi 3.5 Vision',
    contextLength: 1024,
    sizeBytes: 2.4 * 1024 * 1024 * 1024, // ~2.4GB
    size: '2.4GB',
    description: 'Microsoft Phi-3.5 Vision, multimodal (text + images)',
    vision: true,
  },
  'Qwen3-4B-q4f16_1-MLC': {
    name: 'Qwen 3 4B',
    contextLength: 4096,
    sizeBytes: 2.2 * 1024 * 1024 * 1024, // ~2.2GB
    size: '2.2GB',
    description: 'Qwen 3 4B, best quality in medium range',
  },
  'Mistral-7B-Instruct-v0.3-q4f16_1-MLC': {
    name: 'Mistral 7B v0.3',
    contextLength: 4096,
    sizeBytes: 4.0 * 1024 * 1024 * 1024, // ~4GB
    size: '4GB',
    description: 'Mistral 7B v0.3, strong general-purpose',
  },
  'Qwen2.5-7B-Instruct-q4f16_1-MLC': {
    name: 'Qwen 2.5 7B',
    contextLength: 4096,
    sizeBytes: 4.0 * 1024 * 1024 * 1024, // ~4GB
    size: '4GB',
    description: 'Qwen 2.5 7B, excellent multilingual',
  },
  'Qwen2.5-Coder-7B-Instruct-q4f16_1-MLC': {
    name: 'Qwen 2.5 Coder 7B',
    contextLength: 4096,
    sizeBytes: 4.0 * 1024 * 1024 * 1024, // ~4GB
    size: '4GB',
    description: 'Qwen 2.5 Coder 7B, best-in-class code model',
  },
  'DeepSeek-R1-Distill-Qwen-7B-q4f16_1-MLC': {
    name: 'DeepSeek R1 Distill Qwen 7B',
    contextLength: 4096,
    sizeBytes: 4.18 * 1024 * 1024 * 1024, // ~4.18GB
    size: '4.18GB',
    description: 'DeepSeek R1, advanced reasoning',
  },
  'DeepSeek-R1-Distill-Llama-8B-q4f16_1-MLC': {
    name: 'DeepSeek R1 Distill Llama 8B',
    contextLength: 4096,
    sizeBytes: 4.41 * 1024 * 1024 * 1024, // ~4.41GB
    size: '4.41GB',
    description: 'DeepSeek R1 Llama, best reasoning',
  },
  'Hermes-3-Llama-3.1-8B-q4f16_1-MLC': {
    name: 'Hermes 3 Llama 3.1 8B',
    contextLength: 4096,
    sizeBytes: 4.9 * 1024 * 1024 * 1024, // ~4.9GB
    size: '4.9GB',
    description: 'Hermes 3 8B, DPO-optimized chat',
  },
  'Llama-3.1-8B-Instruct-q4f16_1-MLC': {
    name: 'Llama 3.1 8B',
    contextLength: 4096,
    sizeBytes: 4.5 * 1024 * 1024 * 1024, // ~4.5GB
    size: '4.5GB',
    description: 'Llama 3.1 8B, strong general-purpose',
  },
  'Qwen3-8B-q4f16_1-MLC': {
    name: 'Qwen 3 8B',
    contextLength: 4096,
    sizeBytes: 4.5 * 1024 * 1024 * 1024, // ~4.5GB
    size: '4.5GB',
    description: 'Qwen 3 8B, highest quality multilingual',
  },
  'gemma-2-9b-it-q4f16_1-MLC': {
    name: 'Gemma 2 9B',
    contextLength: 1024,
    sizeBytes: 5.0 * 1024 * 1024 * 1024, // ~5GB
    size: '5GB',
    description: 'Google Gemma 2 9B, highest quality Google model',
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

export type WebLLMModelId = keyof typeof WEBLLM_MODELS;
