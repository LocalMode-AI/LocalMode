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

  /** Set to `true` for vision-language GGUFs (multimodal text+image). */
  vision?: boolean;

  /** URL to the vision projection model (mmproj GGUF). Required for vision models. */
  mmprojUrl?: string;

  /** Whether this model supports tool calling via OAI-compatible tools API. */
  supportsToolCalling?: boolean;

  /** Set to `true` for embedding-only models (used with wllama.embedding()). */
  isEmbeddingModel?: boolean;

  /** Embedding vector dimensions (for embedding models). */
  dimensions?: number;

  /** Recommended number of GPU layers for this model. */
  nGpuLayers?: number;

  /** Set to `true` for reranker/cross-encoder models (used with wllama.reranker()). */
  isRerankerModel?: boolean;

  /** Set to `true` for reasoning/thinking models (e.g., DeepSeek-R1). */
  supportsReasoning?: boolean;
}

/**
 * Popular GGUF models curated for browser use.
 *
 * These are Q4_K_M quantized models that balance quality and size for browser inference.
 * All URLs point to HuggingFace repositories. Compatible with wllama v3.
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
    supportsToolCalling: true,
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
    supportsToolCalling: true,
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
    supportsToolCalling: true,
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
    supportsToolCalling: true,
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
    supportsToolCalling: true,
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
    supportsToolCalling: true,
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
    supportsToolCalling: true,
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
    supportsToolCalling: true,
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

  // === QWEN 3 ===
  'Qwen3-0.6B-Q4_K_M': {
    name: 'Qwen3 0.6B',
    contextLength: 40960,
    sizeBytes: 530 * 1024 * 1024,
    size: '530MB',
    description: 'Qwen3 0.6B, fast multilingual reasoning with hybrid thinking',
    url: 'https://huggingface.co/unsloth/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q4_K_M.gguf',
    architecture: 'qwen3',
    quantization: 'Q4_K_M',
    parameterCount: 600_000_000,
    supportsToolCalling: true,
  },
  'Qwen3-1.7B-Q4_K_M': {
    name: 'Qwen3 1.7B',
    contextLength: 40960,
    sizeBytes: 1.2 * 1024 * 1024 * 1024,
    size: '1.2GB',
    description: 'Qwen3 1.7B, strong multilingual reasoning with hybrid thinking',
    url: 'https://huggingface.co/Qwen/Qwen3-1.7B-GGUF/resolve/main/qwen3-1.7b-q4_k_m.gguf',
    architecture: 'qwen3',
    quantization: 'Q4_K_M',
    parameterCount: 1_700_000_000,
    supportsToolCalling: true,
  },
  'Qwen3-4B-Q4_K_M': {
    name: 'Qwen3 4B',
    contextLength: 40960,
    sizeBytes: 2.7 * 1024 * 1024 * 1024,
    size: '2.7GB',
    description: 'Qwen3 4B, excellent multilingual reasoning and code generation',
    url: 'https://huggingface.co/unsloth/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf',
    architecture: 'qwen3',
    quantization: 'Q4_K_M',
    parameterCount: 4_000_000_000,
    supportsToolCalling: true,
  },

  // === DEEPSEEK R1 DISTILL (reasoning models) ===
  'DeepSeek-R1-Distill-Qwen-1.5B-Q4_K_M': {
    name: 'DeepSeek R1 1.5B',
    contextLength: 131072,
    sizeBytes: 1.1 * 1024 * 1024 * 1024,
    size: '1.1GB',
    description: 'DeepSeek R1 distilled to Qwen 1.5B, reasoning/thinking model',
    url: 'https://huggingface.co/bartowski/DeepSeek-R1-Distill-Qwen-1.5B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-1.5B-Q4_K_M.gguf',
    architecture: 'qwen2',
    quantization: 'Q4_K_M',
    parameterCount: 1_500_000_000,
    supportsReasoning: true,
  },
  'DeepSeek-R1-Distill-Qwen-7B-Q4_K_M': {
    name: 'DeepSeek R1 7B',
    contextLength: 131072,
    sizeBytes: 4.7 * 1024 * 1024 * 1024,
    size: '4.7GB',
    description: 'DeepSeek R1 distilled to Qwen 7B, strong reasoning/thinking model',
    url: 'https://huggingface.co/bartowski/DeepSeek-R1-Distill-Qwen-7B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-7B-Q4_K_M.gguf',
    architecture: 'qwen2',
    quantization: 'Q4_K_M',
    parameterCount: 7_000_000_000,
    supportsReasoning: true,
  },

  // === GEMMA 4 (PLE architecture — effective params < total params) ===
  'Gemma-4-E2B-IT-Q4_K_M': {
    name: 'Gemma 4 E2B IT',
    contextLength: 131072,
    sizeBytes: 3.46 * 1024 * 1024 * 1024,
    size: '3.46GB',
    description: 'Google Gemma 4 E2B, 2.3B effective params (PLE), strong multilingual + reasoning + vision',
    url: 'https://huggingface.co/bartowski/google_gemma-4-E2B-it-GGUF/resolve/main/google_gemma-4-E2B-it-Q4_K_M.gguf',
    architecture: 'gemma4',
    quantization: 'Q4_K_M',
    parameterCount: 5_100_000_000,
    vision: true,
    mmprojUrl: 'https://huggingface.co/ggml-org/gemma-4-E2B-it-GGUF/resolve/main/mmproj-gemma-4-E2B-it-Q8_0.gguf',
    supportsToolCalling: true,
  },
  'Gemma-4-E4B-IT-Q4_K_M': {
    name: 'Gemma 4 E4B IT',
    contextLength: 131072,
    sizeBytes: 5.41 * 1024 * 1024 * 1024,
    size: '5.41GB',
    description: 'Google Gemma 4 E4B, ~4B effective params (PLE), top quality at its size class + vision',
    url: 'https://huggingface.co/bartowski/google_gemma-4-E4B-it-GGUF/resolve/main/google_gemma-4-E4B-it-Q4_K_M.gguf',
    architecture: 'gemma4',
    quantization: 'Q4_K_M',
    parameterCount: 8_000_000_000,
    vision: true,
    mmprojUrl: 'https://huggingface.co/ggml-org/gemma-4-E4B-it-GGUF/resolve/main/mmproj-gemma-4-E4B-it-Q8_0.gguf',
    supportsToolCalling: true,
  },

  // === VISION-LANGUAGE MODELS (UI grounding) ===
  'Holo2-4B-Q4_K_M': {
    name: 'Holo2 4B',
    contextLength: 262144, // 256K native (Qwen3-VL family)
    sizeBytes: 2.8 * 1024 * 1024 * 1024, // ~2.8GB
    size: '2.8GB',
    description:
      'Hcompany Holo2 4B UI-grounding VLM, vision + text. Best for browser-agent / GUI navigation tasks.',
    url: 'https://huggingface.co/mradermacher/Holo2-4B-GGUF/resolve/main/Holo2-4B.Q4_K_M.gguf',
    architecture: 'qwen3',
    quantization: 'Q4_K_M',
    parameterCount: 4_000_000_000,
    vision: true,
    mmprojUrl: 'https://huggingface.co/mradermacher/Holo2-4B-GGUF/resolve/main/Holo2-4B-mmproj-f16.gguf',
  },
  'Holo2-8B-Q4_K_M': {
    name: 'Holo2 8B',
    contextLength: 262144,
    sizeBytes: 5.1 * 1024 * 1024 * 1024,
    size: '5.1GB',
    description:
      'Hcompany Holo2 8B premium UI-grounding VLM, vision + text. Highest-quality grounding for capable devices.',
    url: 'https://huggingface.co/mradermacher/Holo2-8B-GGUF/resolve/main/Holo2-8B.Q4_K_M.gguf',
    architecture: 'qwen3',
    quantization: 'Q4_K_M',
    parameterCount: 8_000_000_000,
    vision: true,
    mmprojUrl: 'https://huggingface.co/mradermacher/Holo2-8B-GGUF/resolve/main/Holo2-8B-mmproj-f16.gguf',
  },

  // === EMBEDDING MODELS ===
  'nomic-embed-text-v1.5-Q4_K_M': {
    name: 'Nomic Embed Text v1.5',
    contextLength: 8192,
    sizeBytes: 78 * 1024 * 1024,
    size: '78MB',
    description: 'Nomic Embed Text v1.5, high-quality text embeddings for semantic search',
    url: 'https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-GGUF/resolve/main/nomic-embed-text-v1.5.Q4_K_M.gguf',
    architecture: 'nomic-bert',
    quantization: 'Q4_K_M',
    parameterCount: 137_000_000,
    isEmbeddingModel: true,
    dimensions: 768,
  },
  'mxbai-embed-large-v1-Q4_K_M': {
    name: 'MxBai Embed Large v1',
    contextLength: 512,
    sizeBytes: 197 * 1024 * 1024,
    size: '197MB',
    description: 'MxBai Embed Large v1, top-quality English embeddings',
    url: 'https://huggingface.co/mixedbread-ai/mxbai-embed-large-v1-GGUF/resolve/main/mxbai-embed-large-v1.Q4_K_M.gguf',
    architecture: 'bert',
    quantization: 'Q4_K_M',
    parameterCount: 335_000_000,
    isEmbeddingModel: true,
    dimensions: 1024,
  },
  'bge-small-en-v1.5-Q8_0': {
    name: 'BGE Small EN v1.5',
    contextLength: 512,
    sizeBytes: 35 * 1024 * 1024,
    size: '35MB',
    description: 'BAAI BGE Small, lightweight English embeddings, great for on-device semantic search',
    url: 'https://huggingface.co/CompendiumLabs/bge-small-en-v1.5-gguf/resolve/main/bge-small-en-v1.5-q8_0.gguf',
    architecture: 'bert',
    quantization: 'Q8_0',
    parameterCount: 33_000_000,
    isEmbeddingModel: true,
    dimensions: 384,
  },

  // === RERANKER MODELS ===
  'jina-reranker-v2-base-multilingual-Q4_K_M': {
    name: 'Jina Reranker v2',
    contextLength: 1024,
    sizeBytes: 163 * 1024 * 1024,
    size: '163MB',
    description: 'Jina Reranker v2 multilingual, high-quality cross-encoder reranking for search',
    url: 'https://huggingface.co/gpustack/jina-reranker-v2-base-multilingual-GGUF/resolve/main/jina-reranker-v2-base-multilingual-Q4_K_M.gguf',
    architecture: 'xlm-roberta',
    quantization: 'Q4_K_M',
    parameterCount: 278_000_000,
    isRerankerModel: true,
  },
  'bge-reranker-v2-m3-Q4_K_M': {
    name: 'BGE Reranker v2 M3',
    contextLength: 8192,
    sizeBytes: 218 * 1024 * 1024,
    size: '218MB',
    description: 'BAAI BGE Reranker v2 M3, multilingual cross-encoder reranking with long context',
    url: 'https://huggingface.co/gpustack/bge-reranker-v2-m3-GGUF/resolve/main/bge-reranker-v2-m3-Q4_K_M.gguf',
    architecture: 'xlm-roberta',
    quantization: 'Q4_K_M',
    parameterCount: 568_000_000,
    isRerankerModel: true,
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
