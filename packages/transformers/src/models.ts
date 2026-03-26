/**
 * Popular Model Constants
 *
 * Pre-defined model IDs for commonly used models.
 *
 * @packageDocumentation
 */

/**
 * Popular embedding models.
 */
export const EMBEDDING_MODELS = {
  /** Small, fast, high-quality embeddings for RAG (384 dimensions, ~33MB) */
  BGE_SMALL_EN: 'Xenova/bge-small-en-v1.5',

  /** Multilingual embeddings for 50+ languages (384 dimensions, ~120MB) */
  PARAPHRASE_MULTILINGUAL_MINILM: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2',

  /** Higher quality but larger (768 dimensions, ~420MB) */
  ALL_MPNET_BASE_V2: 'Xenova/all-mpnet-base-v2',

  /** BGE base model - better quality (768 dimensions, ~110MB) */
  BGE_BASE_EN: 'Xenova/bge-base-en-v1.5',

  /** Tiny, high-quality retrieval embeddings (384 dimensions, ~23MB) */
  ARCTIC_EMBED_XS: 'Snowflake/snowflake-arctic-embed-xs',
} as const;

/**
 * Popular text classification models.
 */
export const CLASSIFICATION_MODELS = {
  /** Fast sentiment analysis (POSITIVE/NEGATIVE) */
  DISTILBERT_SST2: 'Xenova/distilbert-base-uncased-finetuned-sst-2-english',

  /** Twitter sentiment (positive/neutral/negative) */
  TWITTER_ROBERTA_SENTIMENT: 'Xenova/twitter-roberta-base-sentiment-latest',

  /** Toxicity detection (multi-label) */
  TOXIC_BERT: 'Xenova/toxic-bert',
} as const;

/**
 * Popular zero-shot classification models.
 */
export const ZERO_SHOT_MODELS = {
  /** Fast, mobile-friendly zero-shot model (~21MB q4f16, recommended for browser) */
  MOBILEBERT_MNLI: 'Xenova/mobilebert-uncased-mnli',

  /** Mid-tier: DeBERTa-v3 xsmall — good accuracy, browser-friendly (~90MB int8) */
  NLI_DEBERTA_V3_XSMALL: 'Xenova/nli-deberta-v3-xsmall',

  /** High accuracy but large download (~297MB q4f16). Consider MobileBERT or DeBERTa-v3-xsmall for browser use. */
  MODERNBERT_LARGE_ZEROSHOT: 'onnx-community/ModernBERT-large-zeroshot-v2.0-ONNX',
} as const;

/**
 * Popular NER (Named Entity Recognition) models.
 */
export const NER_MODELS = {
  /** Standard NER: PERSON, ORG, LOC, MISC */
  BERT_BASE_NER: 'Xenova/bert-base-NER',

  /** Multilingual NER */
  BERT_MULTILINGUAL_NER: 'Xenova/bert-base-multilingual-cased-ner-hrl',
} as const;

/**
 * Popular reranking models.
 */
export const RERANKER_MODELS = {
  /** Fast, small reranker (~23MB int8, recommended for browser) */
  MS_MARCO_MINILM_L6: 'Xenova/ms-marco-MiniLM-L-6-v2',

  /** Higher quality but large (~279MB int8). Prefer MiniLM-L-6-v2 for browser use. */
  BGE_RERANKER_BASE: 'Xenova/bge-reranker-base',
} as const;

/**
 * Popular speech-to-text models.
 */
export const SPEECH_TO_TEXT_MODELS = {
  /** Moonshine tiny - fast, low error rate, edge-optimized (~50MB) */
  MOONSHINE_TINY: 'onnx-community/moonshine-tiny-ONNX',

  /** Moonshine base - best quality/size ratio for browser (~237MB) */
  MOONSHINE_BASE: 'onnx-community/moonshine-base-ONNX',

  /** Legacy: Smallest Whisper (~70MB) */
  WHISPER_TINY: 'Xenova/whisper-tiny',

  /** Legacy: Small Whisper (~240MB) */
  WHISPER_SMALL: 'Xenova/whisper-small',
} as const;

/**
 * Popular image classification models.
 */
export const IMAGE_CLASSIFICATION_MODELS = {
  /** ViT base model - ImageNet classes */
  VIT_BASE_PATCH16: 'Xenova/vit-base-patch16-224',

  /** DeiT small distilled model - lighter alternative */
  DEIT_SMALL: 'Xenova/deit-small-distilled-patch16-224',

  /** ResNet alternative */
  RESNET_50: 'Xenova/resnet-50',
} as const;

/**
 * Popular zero-shot image classification models.
 */
export const ZERO_SHOT_IMAGE_MODELS = {
  /** SigLIP - superior zero-shot image classification via sigmoid loss (768d, ~400MB) */
  SIGLIP_BASE_PATCH16: 'Xenova/siglip-base-patch16-224',

  /** Legacy: CLIP ViT-Base (512d, ~340MB) */
  CLIP_VIT_BASE_PATCH32: 'Xenova/clip-vit-base-patch32',

  /** Larger CLIP model with better accuracy */
  CLIP_VIT_LARGE_PATCH14: 'Xenova/clip-vit-large-patch14',
} as const;

/**
 * Popular image captioning models.
 */
export const IMAGE_CAPTION_MODELS = {
  /** Florence-2 - unified vision-language model for captioning, OCR, and detection (~223MB q4f16) */
  FLORENCE_2_BASE: 'onnx-community/Florence-2-base-ft',

  /** Legacy: ViT-GPT2 captioning (~250MB) */
  VIT_GPT2: 'Xenova/vit-gpt2-image-captioning',
} as const;

/**
 * Popular text-to-speech models.
 */
export const TEXT_TO_SPEECH_MODELS = {
  /** Kokoro 82M - natural speech, 28 voices, 24kHz (~86MB q8f16) */
  KOKORO_82M: 'onnx-community/Kokoro-82M-v1.0-ONNX',

  /** Legacy: SpeechT5 TTS, 16kHz, requires separate vocoder */
  SPEECHT5_TTS: 'Xenova/speecht5_tts',
} as const;

/**
 * Popular translation models (Helsinki-NLP Opus-MT).
 */
export const TRANSLATION_MODELS = {
  /** English to German (~100MB quantized per pair) */
  OPUS_MT_EN_DE: 'Xenova/opus-mt-en-de',

  /** English to French */
  OPUS_MT_EN_FR: 'Xenova/opus-mt-en-fr',

  /** English to Spanish */
  OPUS_MT_EN_ES: 'Xenova/opus-mt-en-es',

  /** German to English */
  OPUS_MT_DE_EN: 'Xenova/opus-mt-de-en',

  /** French to English */
  OPUS_MT_FR_EN: 'Xenova/opus-mt-fr-en',

  /** Spanish to English */
  OPUS_MT_ES_EN: 'Xenova/opus-mt-es-en',
} as const;

/**
 * Popular summarization models.
 */
export const SUMMARIZATION_MODELS = {
  /** DistilBART CNN 6-6 - best quality browser summarizer (~284MB quantized) */
  DISTILBART_CNN_6_6: 'Xenova/distilbart-cnn-6-6',

  /** DistilBART CNN 12-6 - higher quality, larger */
  DISTILBART_CNN_12_6: 'Xenova/distilbart-cnn-12-6',
} as const;

/**
 * Popular fill-mask models.
 */
export const FILL_MASK_MODELS = {
  /** ModernBERT base - 8192 token context, fast (~140MB q4f16) */
  MODERNBERT_BASE: 'onnx-community/ModernBERT-base-ONNX',

  /** BERT base uncased - classic, lightweight (~45MB quantized) */
  BERT_BASE_UNCASED: 'Xenova/bert-base-uncased',
} as const;

/**
 * Popular question answering models (extractive QA).
 */
export const QUESTION_ANSWERING_MODELS = {
  /** DistilBERT SQuAD - fast extractive QA (~65MB quantized) */
  DISTILBERT_SQUAD: 'Xenova/distilbert-base-cased-distilled-squad',
} as const;

/**
 * Popular object detection models.
 */
export const OBJECT_DETECTION_MODELS = {
  /** D-FINE nano - state-of-the-art, tiny (~4.5MB) */
  DFINE_NANO_COCO: 'onnx-community/dfine_n_coco-ONNX',

  /** DETR ResNet-50 - classic transformer-based detection */
  DETR_RESNET_50: 'Xenova/detr-resnet-50',
} as const;

/**
 * Popular image segmentation models.
 */
export const SEGMENTATION_MODELS = {
  /** SegFormer B0 - lightweight semantic segmentation (ADE20K) */
  SEGFORMER_B0_ADE: 'Xenova/segformer-b0-finetuned-ade-512-512',
} as const;

/**
 * Popular OCR models.
 */
export const OCR_MODELS = {
  /** TrOCR small - printed text recognition */
  TROCR_SMALL_PRINTED: 'Xenova/trocr-small-printed',

  /** TrOCR small - handwritten text recognition */
  TROCR_SMALL_HANDWRITTEN: 'Xenova/trocr-small-handwritten',
} as const;

/**
 * Popular document QA models.
 */
export const DOCUMENT_QA_MODELS = {
  /** Florence-2 - unified vision-language, handles DocVQA via text prompt (~223MB q4f16) */
  FLORENCE_2_BASE: 'onnx-community/Florence-2-base-ft',

  /** Donut - OCR-free document understanding, fine-tuned on DocVQA (~218MB quantized) */
  DONUT_DOCVQA: 'Xenova/donut-base-finetuned-docvqa',
} as const;

/**
 * Popular image-to-image (super resolution) models.
 */
export const IMAGE_TO_IMAGE_MODELS = {
  /** Swin2SR lightweight - 2x upscale, fast */
  SWIN2SR_LIGHTWEIGHT_X2: 'Xenova/swin2SR-lightweight-x2-64',

  /** Swin2SR classical - 4x upscale, higher quality */
  SWIN2SR_CLASSICAL_X4: 'Xenova/swin2SR-classical-sr-x4-64',
} as const;

/**
 * Popular image feature extraction models.
 *
 * Note: The `dinov3` in `onnx-community/dinov3-vits16-pretrain-lvd1689m-ONNX` is a
 * community naming convention on HuggingFace. Only DINOv1 and DINOv2 exist as official
 * Meta research models. The "v3" variant is a community-converted DINOv2-based model.
 */
export const IMAGE_FEATURE_MODELS = {
  /** SigLIP - vision + text embeddings (768d, ~400MB) */
  SIGLIP_BASE_PATCH16: 'Xenova/siglip-base-patch16-224',

  /** DINOv2 base - self-supervised image features (official Meta model) */
  DINOV2_BASE: 'onnx-community/dinov2-base-ONNX',

  /**
   * Community-converted DINOv2-based model for image similarity.
   * Note: "dinov3" is a community naming convention — only DINOv1/v2 are official Meta models.
   */
  DINOV3_VITS16: 'onnx-community/dinov3-vits16-pretrain-lvd1689m-ONNX',
} as const;

/**
 * Popular multimodal embedding models (CLIP/SigLIP).
 *
 * These models embed both text and images into the same vector space,
 * enabling cross-modal similarity search.
 */
export const MULTIMODAL_EMBEDDING_MODELS = {
  /** CLIP ViT-Base/32 - fast, 512 dimensions */
  CLIP_VIT_BASE_PATCH32: 'Xenova/clip-vit-base-patch32',

  /** CLIP ViT-Base/16 - better accuracy, 512 dimensions */
  CLIP_VIT_BASE_PATCH16: 'Xenova/clip-vit-base-patch16',

  /** SigLIP Base/16 - improved CLIP variant, 768 dimensions */
  SIGLIP_BASE_PATCH16: 'Xenova/siglip-base-patch16-224',
} as const;

/**
 * Curated ONNX LLM models verified to work with Transformers.js v4 in the browser.
 *
 * **Experimental**: These models use TJS v4 (preview release) and the
 * `text-generation` pipeline with WebGPU/WASM acceleration.
 *
 * All models listed here are **public** (no HuggingFace login required).
 *
 * Users can pass any valid HuggingFace ONNX model ID to
 * `transformers.languageModel()` — this catalog provides curated,
 * browser-tested models as a starting point.
 *
 */
export const TRANSFORMERS_LLM_MODELS: Record<
  string,
  {
    name: string;
    contextLength: number;
    size: string;
    sizeBytes: number;
    description: string;
    vision?: boolean;
  }
> = {
  // ---------------------------------------------------------------------------
  // Tiny (<500MB)
  // ---------------------------------------------------------------------------

  /** Granite 4.0 350M — IBM's ultra-compact multilingual model, 12 languages (~120MB) */
  'onnx-community/granite-4.0-350m-ONNX-web': {
    name: 'Granite 4.0 350M (ONNX)',
    contextLength: 4096,
    size: '~120MB',
    sizeBytes: 120 * 1024 * 1024,
    description:
      'IBM Granite 4.0 350M — ultra-compact, 12 languages, 4K context. Fastest download.',
  },

  // ---------------------------------------------------------------------------
  // Small (500MB–1GB)
  // ---------------------------------------------------------------------------

  /** Qwen3.5 0.8B — best quality sub-1B ONNX model, 32K context, multimodal (WebGPU recommended) */
  'onnx-community/Qwen3.5-0.8B-ONNX': {
    name: 'Qwen3.5 0.8B (ONNX)',
    contextLength: 32768,
    size: '~500MB',
    sizeBytes: 500 * 1024 * 1024,
    description:
      'Best quality sub-1B multimodal ONNX model with 32K context. WebGPU recommended.',
    vision: true,
  },
  /** Qwen3 0.6B — smallest Qwen text-only ONNX model, fast and lightweight */
  'onnx-community/Qwen3-0.6B-ONNX': {
    name: 'Qwen3 0.6B (ONNX)',
    contextLength: 4096,
    size: '~570MB',
    sizeBytes: 570 * 1024 * 1024,
    description: 'Smallest Qwen3 text model. Fast, lightweight, WebGPU recommended.',
  },
  /** Granite 4.0 1B — IBM's small multilingual model, 12 languages (~350MB) */
  'onnx-community/granite-4.0-1b-ONNX-web': {
    name: 'Granite 4.0 1B (ONNX)',
    contextLength: 4096,
    size: '~350MB',
    sizeBytes: 350 * 1024 * 1024,
    description: 'IBM Granite 4.0 1B — 12 languages, 4K context. Good quality/size ratio.',
  },
  /** Llama 3.2 1B Instruct — Meta's small instruction-tuned model, 8K context */
  'onnx-community/Llama-3.2-1B-Instruct-ONNX': {
    name: 'Llama 3.2 1B Instruct (ONNX)',
    contextLength: 8192,
    size: '~380MB',
    sizeBytes: 380 * 1024 * 1024,
    description: 'Meta Llama 3.2 1B instruction-tuned, q4f16. 8K context, good general quality.',
  },
  /** TinyLlama 1.1B Chat — small, fast, public access */
  'onnx-community/TinyLlama-1.1B-Chat-v1.0-ONNX': {
    name: 'TinyLlama 1.1B Chat (ONNX)',
    contextLength: 2048,
    size: '~350MB',
    sizeBytes: 350 * 1024 * 1024,
    description: 'Tiny but capable chat model, q4f16. Fast download, no login required.',
  },
  /** Qwen2.5 Coder 1.5B — code-specialized model, public, good for programming tasks */
  'onnx-community/Qwen2.5-Coder-1.5B-Instruct': {
    name: 'Qwen2.5 Coder 1.5B (ONNX)',
    contextLength: 4096,
    size: '~450MB',
    sizeBytes: 450 * 1024 * 1024,
    description: 'Code-specialized Qwen2.5, q4f16. Great for programming tasks, public.',
  },
  /** DeepSeek-R1-Distill-Qwen-1.5B — reasoning-focused distillation of DeepSeek-R1 */
  'onnx-community/DeepSeek-R1-Distill-Qwen-1.5B-ONNX': {
    name: 'DeepSeek-R1 Distill 1.5B (ONNX)',
    contextLength: 4096,
    size: '~500MB',
    sizeBytes: 500 * 1024 * 1024,
    description:
      'DeepSeek-R1 distilled into Qwen 1.5B, q4f16. Strong reasoning for its size.',
  },

  // ---------------------------------------------------------------------------
  // Medium (1–2.5GB)
  // ---------------------------------------------------------------------------

  /** Qwen3.5 2B — high quality 2B multimodal ONNX model, needs 4GB+ RAM */
  'onnx-community/Qwen3.5-2B-ONNX': {
    name: 'Qwen3.5 2B (ONNX)',
    contextLength: 32768,
    size: '~1.5GB',
    sizeBytes: 1500 * 1024 * 1024,
    description:
      'High quality 2B multimodal model with 32K context. Needs 4GB+ RAM, WebGPU recommended.',
    vision: true,
  },
  /** Llama 3.2 3B Instruct — Meta's best small instruction-tuned model, 8K context */
  'onnx-community/Llama-3.2-3B-Instruct-ONNX': {
    name: 'Llama 3.2 3B Instruct (ONNX)',
    contextLength: 8192,
    size: '~900MB',
    sizeBytes: 900 * 1024 * 1024,
    description: 'Meta Llama 3.2 3B instruction-tuned, q4f16. 8K context, strong quality.',
  },
  /** Phi-4 Mini Instruct — Microsoft Phi-4, strong reasoning and coding (web-optimized q4f16) */
  'onnx-community/Phi-4-mini-instruct-web-q4f16': {
    name: 'Phi-4 Mini (ONNX)',
    contextLength: 4096,
    size: '~2.3GB',
    sizeBytes: 2300 * 1024 * 1024,
    description:
      'Microsoft Phi-4 Mini, strong reasoning and coding. Web-optimized q4f16, WebGPU recommended.',
  },
  /** Phi-3 Mini 4K — strong reasoning from Microsoft (official ONNX web build) */
  'microsoft/Phi-3-mini-4k-instruct-onnx-web': {
    name: 'Phi-3 Mini 4K (ONNX)',
    contextLength: 4096,
    size: '~1.2GB',
    sizeBytes: 1200 * 1024 * 1024,
    description:
      'Strong reasoning from Microsoft, q4. Official ONNX web build, no login required.',
  },
  /** Qwen3 4B — high quality text-only ONNX, needs 4GB+ RAM */
  'onnx-community/Qwen3-4B-ONNX': {
    name: 'Qwen3 4B (ONNX)',
    contextLength: 4096,
    size: '~1.2GB',
    sizeBytes: 1200 * 1024 * 1024,
    description:
      'High quality Qwen3 text model, q4f16. Needs 4GB+ RAM, WebGPU recommended.',
  },

  // ---------------------------------------------------------------------------
  // Large (2.5GB+)
  // ---------------------------------------------------------------------------

  /** Qwen3.5 4B — largest browser-viable Qwen3.5 ONNX, needs 8GB+ RAM */
  'onnx-community/Qwen3.5-4B-ONNX': {
    name: 'Qwen3.5 4B (ONNX)',
    contextLength: 32768,
    size: '~2.5GB',
    sizeBytes: 2500 * 1024 * 1024,
    description:
      'Best quality Qwen3.5 ONNX for browser. 32K multimodal, needs 8GB+ RAM, WebGPU required.',
    vision: true,
  },
} as const;

/**
 * Get model category by size in bytes for ONNX LLM models.
 *
 * @param sizeBytes - Model size in bytes
 * @returns The model category
 */
export function getLLMModelCategory(sizeBytes: number): 'tiny' | 'small' | 'medium' | 'large' {
  if (sizeBytes < 500 * 1024 * 1024) return 'tiny';
  if (sizeBytes < 1024 * 1024 * 1024) return 'small';
  if (sizeBytes < 2048 * 1024 * 1024) return 'medium';
  return 'large';
}

/**
 * All popular models organized by task.
 */
export const MODELS = {
  embedding: EMBEDDING_MODELS,
  classification: CLASSIFICATION_MODELS,
  zeroShot: ZERO_SHOT_MODELS,
  ner: NER_MODELS,
  reranker: RERANKER_MODELS,
  speechToText: SPEECH_TO_TEXT_MODELS,
  textToSpeech: TEXT_TO_SPEECH_MODELS,
  imageClassification: IMAGE_CLASSIFICATION_MODELS,
  zeroShotImage: ZERO_SHOT_IMAGE_MODELS,
  imageCaption: IMAGE_CAPTION_MODELS,
  multimodalEmbedding: MULTIMODAL_EMBEDDING_MODELS,
  translation: TRANSLATION_MODELS,
  summarization: SUMMARIZATION_MODELS,
  fillMask: FILL_MASK_MODELS,
  questionAnswering: QUESTION_ANSWERING_MODELS,
  objectDetection: OBJECT_DETECTION_MODELS,
  segmentation: SEGMENTATION_MODELS,
  ocr: OCR_MODELS,
  documentQA: DOCUMENT_QA_MODELS,
  imageToImage: IMAGE_TO_IMAGE_MODELS,
  imageFeature: IMAGE_FEATURE_MODELS,
} as const;

