/**
 * Model Registry
 *
 * Curated catalog of popular ML models across all providers with
 * runtime extensibility via {@link registerModel}.
 *
 * @packageDocumentation
 */

import type { ModelRegistryEntry } from './types.js';

// ============================================================================
// Default Curated Catalog
// ============================================================================

/**
 * Curated catalog of popular models across all LocalMode providers.
 *
 * Each entry contains provider-agnostic metadata: model ID, provider name,
 * task category, download size, hardware requirements, and quality/speed tiers.
 * Sizes are approximate and may vary by 10-20% depending on quantization format.
 *
 * The catalog is a starting point — use {@link registerModel} to add custom
 * entries at runtime.
 *
 * @example
 * ```typescript
 * import { DEFAULT_MODEL_REGISTRY } from '@localmode/core';
 *
 * const embeddingModels = DEFAULT_MODEL_REGISTRY.filter(e => e.task === 'embedding');
 * console.log(`${embeddingModels.length} embedding models available`);
 * ```
 */
export const DEFAULT_MODEL_REGISTRY: readonly ModelRegistryEntry[] = [
  // ==========================================================================
  // Transformers — Embedding Models
  // ==========================================================================

  {
    modelId: 'Xenova/bge-small-en-v1.5',
    provider: 'transformers',
    task: 'embedding',
    name: 'BGE Small EN v1.5',
    sizeMB: 33,
    dimensions: 384,
    recommendedDevice: 'wasm',
    speedTier: 'fast',
    qualityTier: 'medium',
    description: 'Small, fast, high-quality embeddings for RAG',
  },
  {
    modelId: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
    provider: 'transformers',
    task: 'embedding',
    name: 'Paraphrase Multilingual MiniLM',
    sizeMB: 120,
    dimensions: 384,
    recommendedDevice: 'wasm',
    speedTier: 'medium',
    qualityTier: 'medium',
    description: 'Multilingual embeddings for 50+ languages',
  },
  {
    modelId: 'Xenova/all-mpnet-base-v2',
    provider: 'transformers',
    task: 'embedding',
    name: 'All MPNet Base v2',
    sizeMB: 420,
    dimensions: 768,
    recommendedDevice: 'wasm',
    speedTier: 'slow',
    qualityTier: 'high',
    description: 'Higher quality but larger embedding model',
  },
  {
    modelId: 'Xenova/bge-base-en-v1.5',
    provider: 'transformers',
    task: 'embedding',
    name: 'BGE Base EN v1.5',
    sizeMB: 110,
    dimensions: 768,
    recommendedDevice: 'wasm',
    speedTier: 'medium',
    qualityTier: 'high',
    description: 'BGE base model with better quality',
  },
  {
    modelId: 'Snowflake/snowflake-arctic-embed-xs',
    provider: 'transformers',
    task: 'embedding',
    name: 'Arctic Embed XS',
    sizeMB: 23,
    dimensions: 384,
    recommendedDevice: 'wasm',
    speedTier: 'fast',
    qualityTier: 'medium',
    description: 'Tiny, high-quality retrieval embeddings',
  },

  // ==========================================================================
  // Transformers — Classification Models
  // ==========================================================================

  {
    modelId: 'Xenova/distilbert-base-uncased-finetuned-sst-2-english',
    provider: 'transformers',
    task: 'classification',
    name: 'DistilBERT SST-2',
    sizeMB: 67,
    recommendedDevice: 'wasm',
    speedTier: 'fast',
    qualityTier: 'medium',
    description: 'Fast sentiment analysis (POSITIVE/NEGATIVE)',
  },
  {
    modelId: 'Xenova/twitter-roberta-base-sentiment-latest',
    provider: 'transformers',
    task: 'classification',
    name: 'Twitter RoBERTa Sentiment',
    sizeMB: 125,
    recommendedDevice: 'wasm',
    speedTier: 'medium',
    qualityTier: 'high',
    description: 'Twitter sentiment (positive/neutral/negative)',
  },

  // ==========================================================================
  // Transformers — Zero-Shot Classification
  // ==========================================================================

  {
    modelId: 'Xenova/mobilebert-uncased-mnli',
    provider: 'transformers',
    task: 'zero-shot',
    name: 'MobileBERT MNLI',
    sizeMB: 21,
    recommendedDevice: 'wasm',
    speedTier: 'fast',
    qualityTier: 'low',
    description: 'Fast, mobile-friendly zero-shot classification',
  },
  {
    modelId: 'Xenova/nli-deberta-v3-xsmall',
    provider: 'transformers',
    task: 'zero-shot',
    name: 'NLI DeBERTa v3 XSmall',
    sizeMB: 90,
    recommendedDevice: 'wasm',
    speedTier: 'medium',
    qualityTier: 'medium',
    description: 'Mid-tier zero-shot with good accuracy',
  },

  // ==========================================================================
  // Transformers — NER
  // ==========================================================================

  {
    modelId: 'Xenova/bert-base-NER',
    provider: 'transformers',
    task: 'ner',
    name: 'BERT Base NER',
    sizeMB: 110,
    recommendedDevice: 'wasm',
    speedTier: 'medium',
    qualityTier: 'medium',
    description: 'Standard NER: PERSON, ORG, LOC, MISC',
  },

  // ==========================================================================
  // Transformers — Reranking
  // ==========================================================================

  {
    modelId: 'Xenova/ms-marco-MiniLM-L-6-v2',
    provider: 'transformers',
    task: 'reranking',
    name: 'MS MARCO MiniLM L6',
    sizeMB: 23,
    recommendedDevice: 'wasm',
    speedTier: 'fast',
    qualityTier: 'medium',
    description: 'Fast, small reranker for RAG pipelines',
  },

  // ==========================================================================
  // Transformers — Speech-to-Text
  // ==========================================================================

  {
    modelId: 'onnx-community/moonshine-tiny-ONNX',
    provider: 'transformers',
    task: 'speech-to-text',
    name: 'Moonshine Tiny',
    sizeMB: 50,
    recommendedDevice: 'wasm',
    speedTier: 'fast',
    qualityTier: 'medium',
    description: 'Fast, low error rate, edge-optimized STT',
  },
  {
    modelId: 'onnx-community/moonshine-base-ONNX',
    provider: 'transformers',
    task: 'speech-to-text',
    name: 'Moonshine Base',
    sizeMB: 237,
    recommendedDevice: 'wasm',
    speedTier: 'medium',
    qualityTier: 'high',
    description: 'Best quality/size ratio for browser STT',
  },

  // ==========================================================================
  // Transformers — Text-to-Speech
  // ==========================================================================

  {
    modelId: 'onnx-community/Kokoro-82M-v1.0-ONNX',
    provider: 'transformers',
    task: 'text-to-speech',
    name: 'Kokoro 82M',
    sizeMB: 86,
    recommendedDevice: 'wasm',
    speedTier: 'medium',
    qualityTier: 'high',
    description: 'Natural speech, 28 voices, 24kHz',
  },

  // ==========================================================================
  // Transformers — Translation
  // ==========================================================================

  {
    modelId: 'Xenova/opus-mt-en-de',
    provider: 'transformers',
    task: 'translation',
    name: 'Opus MT EN-DE',
    sizeMB: 100,
    recommendedDevice: 'wasm',
    speedTier: 'medium',
    qualityTier: 'medium',
    description: 'English to German translation',
  },
  {
    modelId: 'Xenova/opus-mt-en-fr',
    provider: 'transformers',
    task: 'translation',
    name: 'Opus MT EN-FR',
    sizeMB: 100,
    recommendedDevice: 'wasm',
    speedTier: 'medium',
    qualityTier: 'medium',
    description: 'English to French translation',
  },

  // ==========================================================================
  // Transformers — Summarization
  // ==========================================================================

  {
    modelId: 'Xenova/distilbart-cnn-6-6',
    provider: 'transformers',
    task: 'summarization',
    name: 'DistilBART CNN 6-6',
    sizeMB: 284,
    recommendedDevice: 'wasm',
    speedTier: 'medium',
    qualityTier: 'high',
    description: 'Best quality browser summarizer',
  },

  // ==========================================================================
  // Transformers — Fill-Mask
  // ==========================================================================

  {
    modelId: 'onnx-community/ModernBERT-base-ONNX',
    provider: 'transformers',
    task: 'fill-mask',
    name: 'ModernBERT Base',
    sizeMB: 140,
    recommendedDevice: 'wasm',
    speedTier: 'medium',
    qualityTier: 'high',
    description: '8192 token context, fast fill-mask',
  },

  // ==========================================================================
  // Transformers — Question Answering
  // ==========================================================================

  {
    modelId: 'Xenova/distilbert-base-cased-distilled-squad',
    provider: 'transformers',
    task: 'question-answering',
    name: 'DistilBERT SQuAD',
    sizeMB: 65,
    recommendedDevice: 'wasm',
    speedTier: 'fast',
    qualityTier: 'medium',
    description: 'Fast extractive question answering',
  },

  // ==========================================================================
  // Transformers — Object Detection
  // ==========================================================================

  {
    modelId: 'onnx-community/dfine_n_coco-ONNX',
    provider: 'transformers',
    task: 'object-detection',
    name: 'D-FINE Nano COCO',
    sizeMB: 5,
    recommendedDevice: 'wasm',
    speedTier: 'fast',
    qualityTier: 'medium',
    description: 'State-of-the-art, tiny object detector',
  },

  // ==========================================================================
  // Transformers — Segmentation
  // ==========================================================================

  {
    modelId: 'Xenova/segformer-b0-finetuned-ade-512-512',
    provider: 'transformers',
    task: 'segmentation',
    name: 'SegFormer B0 ADE',
    sizeMB: 14,
    recommendedDevice: 'wasm',
    speedTier: 'fast',
    qualityTier: 'medium',
    description: 'Lightweight semantic segmentation',
  },

  // ==========================================================================
  // Transformers — OCR
  // ==========================================================================

  {
    modelId: 'Xenova/trocr-small-printed',
    provider: 'transformers',
    task: 'ocr',
    name: 'TrOCR Small Printed',
    sizeMB: 120,
    recommendedDevice: 'wasm',
    speedTier: 'medium',
    qualityTier: 'medium',
    description: 'Printed text recognition',
  },

  // ==========================================================================
  // Transformers — Document QA
  // ==========================================================================

  {
    modelId: 'onnx-community/Florence-2-base-ft',
    provider: 'transformers',
    task: 'document-qa',
    name: 'Florence-2 Base',
    sizeMB: 223,
    recommendedDevice: 'wasm',
    speedTier: 'medium',
    qualityTier: 'high',
    description: 'Unified vision-language for document QA',
  },

  // ==========================================================================
  // Transformers — Image Classification
  // ==========================================================================

  {
    modelId: 'Xenova/vit-base-patch16-224',
    provider: 'transformers',
    task: 'image-classification',
    name: 'ViT Base Patch16',
    sizeMB: 87,
    recommendedDevice: 'wasm',
    speedTier: 'medium',
    qualityTier: 'high',
    description: 'ViT base model for ImageNet classification',
  },

  // ==========================================================================
  // Transformers — Image Captioning
  // ==========================================================================

  {
    modelId: 'onnx-community/Florence-2-base-ft',
    provider: 'transformers',
    task: 'image-captioning',
    name: 'Florence-2 Base (Captioning)',
    sizeMB: 223,
    recommendedDevice: 'wasm',
    speedTier: 'medium',
    qualityTier: 'high',
    description: 'Unified vision-language for image captioning',
  },

  // ==========================================================================
  // Transformers — Image Features
  // ==========================================================================

  {
    modelId: 'Xenova/siglip-base-patch16-224',
    provider: 'transformers',
    task: 'image-features',
    name: 'SigLIP Base Patch16',
    sizeMB: 400,
    dimensions: 768,
    recommendedDevice: 'wasm',
    speedTier: 'medium',
    qualityTier: 'high',
    description: 'Vision + text embeddings via SigLIP',
  },

  // ==========================================================================
  // Transformers — Multimodal Embedding
  // ==========================================================================

  {
    modelId: 'Xenova/clip-vit-base-patch32',
    provider: 'transformers',
    task: 'multimodal-embedding',
    name: 'CLIP ViT-Base/32',
    sizeMB: 340,
    dimensions: 512,
    recommendedDevice: 'wasm',
    speedTier: 'fast',
    qualityTier: 'medium',
    description: 'Fast cross-modal embeddings (text + image)',
  },
  {
    modelId: 'Xenova/siglip-base-patch16-224',
    provider: 'transformers',
    task: 'multimodal-embedding',
    name: 'SigLIP Base Patch16',
    sizeMB: 400,
    dimensions: 768,
    recommendedDevice: 'wasm',
    speedTier: 'medium',
    qualityTier: 'high',
    description: 'Improved CLIP variant with sigmoid loss',
  },

  // ==========================================================================
  // WebLLM — Generation Models (4-bit quantized, WebGPU required)
  // ==========================================================================

  {
    modelId: 'SmolLM2-135M-Instruct-q0f16-MLC',
    provider: 'webllm',
    task: 'generation',
    name: 'SmolLM2 135M',
    sizeMB: 78,
    minMemoryMB: 512,
    recommendedDevice: 'webgpu',
    speedTier: 'fast',
    qualityTier: 'low',
    description: 'Tiniest WebLLM model, instant loading',
  },
  {
    modelId: 'SmolLM2-360M-Instruct-q4f16_1-MLC',
    provider: 'webllm',
    task: 'generation',
    name: 'SmolLM2 360M',
    sizeMB: 210,
    minMemoryMB: 1024,
    recommendedDevice: 'webgpu',
    speedTier: 'fast',
    qualityTier: 'low',
    description: 'Very small, surprisingly capable',
  },
  {
    modelId: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
    provider: 'webllm',
    task: 'generation',
    name: 'Qwen 2.5 0.5B',
    sizeMB: 278,
    minMemoryMB: 1024,
    recommendedDevice: 'webgpu',
    speedTier: 'fast',
    qualityTier: 'medium',
    description: 'Tiny Qwen, great quality for size',
  },
  {
    modelId: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    provider: 'webllm',
    task: 'generation',
    name: 'Llama 3.2 1B',
    sizeMB: 712,
    minMemoryMB: 2048,
    recommendedDevice: 'webgpu',
    speedTier: 'medium',
    qualityTier: 'medium',
    description: 'Llama 3.2 1B, great for simple tasks',
  },
  {
    modelId: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    provider: 'webllm',
    task: 'generation',
    name: 'Qwen 2.5 1.5B',
    sizeMB: 868,
    minMemoryMB: 2048,
    recommendedDevice: 'webgpu',
    speedTier: 'medium',
    qualityTier: 'medium',
    description: 'Qwen 2.5 1.5B, multilingual',
  },
  {
    modelId: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
    provider: 'webllm',
    task: 'generation',
    name: 'Llama 3.2 3B',
    sizeMB: 1802,
    minMemoryMB: 4096,
    recommendedDevice: 'webgpu',
    speedTier: 'slow',
    qualityTier: 'high',
    description: 'Llama 3.2 3B, excellent quality',
  },
  {
    modelId: 'Phi-3.5-mini-instruct-q4f16_1-MLC',
    provider: 'webllm',
    task: 'generation',
    name: 'Phi 3.5 Mini',
    sizeMB: 2150,
    minMemoryMB: 4096,
    recommendedDevice: 'webgpu',
    speedTier: 'slow',
    qualityTier: 'high',
    description: 'Microsoft Phi-3.5, excellent reasoning',
  },
  {
    modelId: 'Qwen3-4B-q4f16_1-MLC',
    provider: 'webllm',
    task: 'generation',
    name: 'Qwen 3 4B',
    sizeMB: 2253,
    minMemoryMB: 6144,
    recommendedDevice: 'webgpu',
    speedTier: 'slow',
    qualityTier: 'high',
    description: 'Qwen 3 4B, best quality in medium range',
  },

  // ==========================================================================
  // Wllama — Generation Models (GGUF, universal browser support via WASM)
  // ==========================================================================

  {
    modelId: 'SmolLM2-135M-Instruct-Q4_K_M',
    provider: 'wllama',
    task: 'generation',
    name: 'SmolLM2 135M (GGUF)',
    sizeMB: 70,
    minMemoryMB: 512,
    recommendedDevice: 'wasm',
    speedTier: 'fast',
    qualityTier: 'low',
    description: 'Tiniest GGUF model, instant loading',
  },
  {
    modelId: 'TinyLlama-1.1B-Chat-Q4_K_M',
    provider: 'wllama',
    task: 'generation',
    name: 'TinyLlama 1.1B Chat (GGUF)',
    sizeMB: 670,
    minMemoryMB: 2048,
    recommendedDevice: 'wasm',
    speedTier: 'medium',
    qualityTier: 'medium',
    description: 'Classic tiny Llama, fast and reliable via WASM',
  },

  // ==========================================================================
  // Transformers — ONNX LLM Models (experimental, via TJS v4)
  // ==========================================================================

  {
    modelId: 'onnx-community/granite-4.0-350m-ONNX-web',
    provider: 'transformers',
    task: 'generation',
    name: 'Granite 4.0 350M (ONNX)',
    sizeMB: 120,
    minMemoryMB: 512,
    recommendedDevice: 'webgpu',
    speedTier: 'fast',
    qualityTier: 'low',
    description: 'IBM Granite ultra-compact, 12 languages',
  },
  {
    modelId: 'onnx-community/Qwen3-0.6B-ONNX',
    provider: 'transformers',
    task: 'generation',
    name: 'Qwen3 0.6B (ONNX)',
    sizeMB: 570,
    minMemoryMB: 2048,
    recommendedDevice: 'webgpu',
    speedTier: 'medium',
    qualityTier: 'medium',
    description: 'Smallest Qwen3 text model, lightweight',
  },
  {
    modelId: 'onnx-community/TinyLlama-1.1B-Chat-v1.0-ONNX',
    provider: 'transformers',
    task: 'generation',
    name: 'TinyLlama 1.1B Chat (ONNX)',
    sizeMB: 350,
    minMemoryMB: 1024,
    recommendedDevice: 'webgpu',
    speedTier: 'medium',
    qualityTier: 'medium',
    description: 'Tiny but capable chat model, no login required',
  },
  {
    modelId: 'onnx-community/Llama-3.2-1B-Instruct-ONNX',
    provider: 'transformers',
    task: 'generation',
    name: 'Llama 3.2 1B Instruct (ONNX)',
    sizeMB: 380,
    minMemoryMB: 2048,
    recommendedDevice: 'webgpu',
    speedTier: 'medium',
    qualityTier: 'medium',
    description: 'Meta Llama 3.2 1B instruction-tuned, 8K context',
  },

  // ==========================================================================
  // Chrome AI — Built-in Models (zero download)
  // ==========================================================================

  {
    modelId: 'chrome-ai:summarizer',
    provider: 'chrome-ai',
    task: 'summarization',
    name: 'Chrome AI Summarizer',
    sizeMB: 0,
    recommendedDevice: 'cpu',
    speedTier: 'fast',
    qualityTier: 'medium',
    description: 'Chrome Built-in AI summarization (Gemini Nano, zero download)',
  },
  {
    modelId: 'chrome-ai:translator',
    provider: 'chrome-ai',
    task: 'translation',
    name: 'Chrome AI Translator',
    sizeMB: 0,
    recommendedDevice: 'cpu',
    speedTier: 'fast',
    qualityTier: 'medium',
    description: 'Chrome Built-in AI translation (Gemini Nano, zero download)',
  },
] as const;

// ============================================================================
// Runtime Extension
// ============================================================================

/**
 * Module-scoped mutable array for custom entries added via {@link registerModel}.
 * Kept separate from the frozen default catalog.
 */
let customEntries: ModelRegistryEntry[] = [];

/**
 * Register a custom model entry in the runtime registry.
 *
 * Registered entries appear in subsequent calls to {@link getModelRegistry}
 * and {@link recommendModels}. If an entry with the same `modelId` already
 * exists in the custom registry, it is replaced (latest registration wins).
 *
 * @param entry - The model registry entry to add
 *
 * @example
 * ```typescript
 * import { registerModel } from '@localmode/core';
 *
 * registerModel({
 *   modelId: 'custom/my-embedder',
 *   provider: 'custom',
 *   task: 'embedding',
 *   name: 'My Custom Embedder',
 *   sizeMB: 50,
 *   dimensions: 384,
 *   recommendedDevice: 'wasm',
 *   speedTier: 'fast',
 *   qualityTier: 'medium',
 * });
 * ```
 */
export function registerModel(entry: ModelRegistryEntry): void {
  // Remove any existing entry with the same modelId (latest wins)
  customEntries = customEntries.filter((e) => e.modelId !== entry.modelId);
  customEntries.push(entry);
}

/**
 * Get the full combined model registry.
 *
 * Returns the default curated catalog merged with any entries added
 * via {@link registerModel}. Custom entries with the same `modelId`
 * as a default entry take precedence (override the default).
 *
 * The returned array is a new copy — mutations do not affect the registry.
 *
 * @returns Combined registry of default and custom entries
 *
 * @example
 * ```typescript
 * import { getModelRegistry } from '@localmode/core';
 *
 * const registry = getModelRegistry();
 * console.log(`${registry.length} models in registry`);
 * ```
 */
export function getModelRegistry(): readonly ModelRegistryEntry[] {
  if (customEntries.length === 0) {
    return [...DEFAULT_MODEL_REGISTRY];
  }

  // Custom entries override defaults with the same modelId
  const customIds = new Set(customEntries.map((e) => e.modelId));
  const defaults = DEFAULT_MODEL_REGISTRY.filter((e) => !customIds.has(e.modelId));

  return [...defaults, ...customEntries];
}

/**
 * Reset custom entries (used for testing).
 * @internal
 */
export function _resetCustomEntries(): void {
  customEntries = [];
}
