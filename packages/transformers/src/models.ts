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
  /** Small, fast, general-purpose embeddings (384 dimensions, ~22MB) */
  ALL_MINILM_L6_V2: 'Xenova/all-MiniLM-L6-v2',

  /** Multilingual embeddings for 50+ languages (384 dimensions, ~120MB) */
  PARAPHRASE_MULTILINGUAL_MINILM: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2',

  /** Higher quality but larger (768 dimensions, ~420MB) */
  ALL_MPNET_BASE_V2: 'Xenova/all-mpnet-base-v2',

  /** BGE embeddings - excellent for RAG (384 dimensions, ~33MB) */
  BGE_SMALL_EN: 'Xenova/bge-small-en-v1.5',

  /** BGE base model - better quality (768 dimensions, ~110MB) */
  BGE_BASE_EN: 'Xenova/bge-base-en-v1.5',
} as const;

/**
 * Popular text classification models.
 */
export const CLASSIFICATION_MODELS = {
  /** Fast sentiment analysis (POSITIVE/NEGATIVE) */
  DISTILBERT_SST2: 'Xenova/distilbert-base-uncased-finetuned-sst-2-english',

  /** Twitter sentiment (positive/neutral/negative) */
  TWITTER_ROBERTA_SENTIMENT: 'Xenova/twitter-roberta-base-sentiment-latest',

  /** Emotion detection */
  DISTILROBERTA_EMOTION: 'Xenova/distilroberta-base-emotion',
} as const;

/**
 * Popular zero-shot classification models.
 */
export const ZERO_SHOT_MODELS = {
  /** BART-based zero-shot classification */
  BART_LARGE_MNLI: 'Xenova/bart-large-mnli',

  /** Smaller, faster zero-shot model */
  DISTILBART_MNLI: 'Xenova/distilbart-mnli-12-3',
} as const;

/**
 * Popular NER (Named Entity Recognition) models.
 */
export const NER_MODELS = {
  /** Standard NER: PERSON, ORG, LOC, MISC */
  BERT_BASE_NER: 'Xenova/bert-base-NER',

  /** Multilingual NER */
  XLM_ROBERTA_NER: 'Xenova/xlm-roberta-large-finetuned-conll03-english',
} as const;

/**
 * Popular reranking models.
 */
export const RERANKER_MODELS = {
  /** Fast, small reranker (~22MB) */
  MS_MARCO_MINILM_L6: 'Xenova/ms-marco-MiniLM-L-6-v2',

  /** Higher quality reranker */
  BGE_RERANKER_BASE: 'Xenova/bge-reranker-base',
} as const;

/**
 * Popular speech-to-text models.
 */
export const SPEECH_TO_TEXT_MODELS = {
  /** Smallest Whisper - fastest, good for short audio (~70MB) */
  WHISPER_TINY: 'Xenova/whisper-tiny',

  /** Small Whisper - better accuracy (~240MB) */
  WHISPER_SMALL: 'Xenova/whisper-small',

  /** Base Whisper - balanced (~140MB) */
  WHISPER_BASE: 'Xenova/whisper-base',

  /** Distilled Whisper - fast and accurate */
  DISTIL_WHISPER_SMALL: 'Xenova/distil-whisper-small.en',
} as const;

/**
 * Popular image classification models.
 */
export const IMAGE_CLASSIFICATION_MODELS = {
  /** ViT base model - ImageNet classes */
  VIT_BASE_PATCH16: 'Xenova/vit-base-patch16-224',

  /** Smaller ViT model */
  VIT_SMALL_PATCH16: 'Xenova/vit-small-patch16-224',

  /** ResNet alternative */
  RESNET_50: 'Xenova/resnet-50',
} as const;

/**
 * Popular zero-shot image classification models.
 */
export const ZERO_SHOT_IMAGE_MODELS = {
  /** CLIP ViT-Base - versatile zero-shot image classification */
  CLIP_VIT_BASE_PATCH32: 'Xenova/clip-vit-base-patch32',

  /** Larger CLIP model with better accuracy */
  CLIP_VIT_LARGE_PATCH14: 'Xenova/clip-vit-large-patch14',

  /** SigLIP - improved CLIP variant */
  SIGLIP_BASE_PATCH16: 'Xenova/siglip-base-patch16-224',
} as const;

/**
 * Popular image captioning models.
 */
export const IMAGE_CAPTION_MODELS = {
  /** BLIP base - fast, good quality captions */
  BLIP_BASE: 'Xenova/blip-image-captioning-base',

  /** BLIP large - better quality, slower */
  BLIP_LARGE: 'Xenova/blip-image-captioning-large',

  /** GIT base - alternative captioning model */
  GIT_BASE: 'Xenova/git-base-coco',
} as const;

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
  imageClassification: IMAGE_CLASSIFICATION_MODELS,
  zeroShotImage: ZERO_SHOT_IMAGE_MODELS,
  imageCaption: IMAGE_CAPTION_MODELS,
} as const;

