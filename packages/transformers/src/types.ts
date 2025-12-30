/**
 * Transformers Provider Types
 *
 * Provider-specific types for the Transformers.js integration.
 *
 * @packageDocumentation
 */

import type {
  // P0/P1 model types
  EmbeddingModel,
  ClassificationModel,
  ZeroShotClassificationModel,
  NERModel,
  RerankerModel,
  SpeechToTextModel,
  ImageClassificationModel,
  ZeroShotImageClassificationModel,
  ImageCaptionModel,
  // P2 model types
  SegmentationModel,
  ObjectDetectionModel,
  ImageFeatureModel,
  ImageToImageModel,
  TextToSpeechModel,
  TranslationModel,
  SummarizationModel,
  FillMaskModel,
  QuestionAnsweringModel,
  OCRModel,
  DocumentQAModel,
} from '@localmode/core';

/**
 * Supported compute devices for Transformers.js.
 */
export type TransformersDevice = 'webgpu' | 'wasm' | 'cpu' | 'auto';

/**
 * Progress callback for model loading.
 * Status types include all possible states from the underlying transformers library.
 */
export interface ModelLoadProgress {
  /** Current status */
  status: 'initiate' | 'download' | 'progress' | 'done' | 'ready';

  /** Model name being loaded */
  name?: string;

  /** File being downloaded */
  file?: string;

  /** Download progress (0-100) */
  progress?: number;

  /** Bytes loaded */
  loaded?: number;

  /** Total bytes */
  total?: number;
}

/**
 * Provider-level settings for all Transformers.js models.
 */
export interface TransformersProviderSettings {
  /**
   * Compute device to use.
   * @default 'auto' (prefers WebGPU if available, falls back to WASM)
   */
  device?: TransformersDevice;

  /**
   * Whether to run inference in a Web Worker.
   * This keeps the main thread responsive during model inference.
   * @default false
   */
  useWorker?: boolean;

  /**
   * Progress callback for model loading.
   */
  onProgress?: (progress: ModelLoadProgress) => void;

  /**
   * Custom cache directory (for Node.js environments).
   */
  cacheDir?: string;

  /**
   * Whether to use quantized models for smaller size.
   * @default true
   */
  quantized?: boolean;
}

/**
 * Model-level settings that can override provider settings.
 */
export interface ModelSettings {
  /**
   * Override the compute device for this specific model.
   */
  device?: TransformersDevice;

  /**
   * Override worker usage for this specific model.
   */
  useWorker?: boolean;

  /**
   * Override quantization for this specific model.
   */
  quantized?: boolean;

  /**
   * Progress callback for this specific model.
   */
  onProgress?: (progress: ModelLoadProgress) => void;
}

/**
 * The Transformers provider interface.
 *
 * Provides factory methods for all supported model types.
 */
export interface TransformersProvider {
  /**
   * Create an embedding model.
   *
   * @example
   * ```ts
   * const model = transformers.embedding('Xenova/all-MiniLM-L6-v2');
   * const { embedding } = await embed({ model, value: 'Hello' });
   * ```
   */
  embedding(modelId: string, settings?: ModelSettings): EmbeddingModel;

  /**
   * Create a text classification model.
   *
   * @example
   * ```ts
   * const model = transformers.classifier('Xenova/distilbert-sst-2');
   * const { label } = await classify({ model, text: 'Great!' });
   * ```
   */
  classifier(modelId: string, settings?: ModelSettings): ClassificationModel;

  /**
   * Create a zero-shot classification model.
   *
   * @example
   * ```ts
   * const model = transformers.zeroShot('Xenova/bart-large-mnli');
   * const { labels } = await classifyZeroShot({
   *   model,
   *   text: 'I love pizza',
   *   candidateLabels: ['food', 'sports', 'politics'],
   * });
   * ```
   */
  zeroShot(modelId: string, settings?: ModelSettings): ZeroShotClassificationModel;

  /**
   * Create a named entity recognition model.
   *
   * @example
   * ```ts
   * const model = transformers.ner('Xenova/bert-base-NER');
   * const { entities } = await extractEntities({ model, text: 'John works at Google' });
   * ```
   */
  ner(modelId: string, settings?: ModelSettings): NERModel;

  /**
   * Create a reranker model.
   *
   * @example
   * ```ts
   * const model = transformers.reranker('Xenova/ms-marco-MiniLM-L-6-v2');
   * const { results } = await rerank({ model, query: 'What is ML?', documents });
   * ```
   */
  reranker(modelId: string, settings?: ModelSettings): RerankerModel;

  /**
   * Create a speech-to-text model.
   *
   * @example
   * ```ts
   * const model = transformers.speechToText('Xenova/whisper-tiny');
   * const { text } = await transcribe({ model, audio: audioBlob });
   * ```
   */
  speechToText(modelId: string, settings?: ModelSettings): SpeechToTextModel;

  /**
   * Create an image classification model.
   *
   * @example
   * ```ts
   * const model = transformers.imageClassifier('Xenova/vit-base-patch16-224');
   * const { predictions } = await classifyImage({ model, image: imageBlob });
   * ```
   */
  imageClassifier(modelId: string, settings?: ModelSettings): ImageClassificationModel;

  /**
   * Create a zero-shot image classification model (e.g., CLIP).
   *
   * @example
   * ```ts
   * const model = transformers.zeroShotImageClassifier('Xenova/clip-vit-base-patch32');
   * const { labels, scores } = await classifyImageZeroShot({
   *   model,
   *   image: imageBlob,
   *   candidateLabels: ['cat', 'dog', 'bird'],
   * });
   * ```
   */
  zeroShotImageClassifier(
    modelId: string,
    settings?: ModelSettings
  ): ZeroShotImageClassificationModel;

  /**
   * Create an image captioning model (e.g., BLIP).
   *
   * @example
   * ```ts
   * const model = transformers.captioner('Xenova/blip-image-captioning-base');
   * const { caption } = await captionImage({ model, image: imageBlob });
   * ```
   */
  captioner(modelId: string, settings?: ModelSettings): ImageCaptionModel;

  // ═══════════════════════════════════════════════════════════════
  // P2 MODEL FACTORIES
  // ═══════════════════════════════════════════════════════════════

  /**
   * Create an image segmentation model.
   *
   * @example
   * ```ts
   * const model = transformers.segmenter('Xenova/segformer-b0-finetuned-ade-512-512');
   * const { masks } = await segmentImage({ model, image: imageBlob });
   * ```
   */
  segmenter(modelId: string, settings?: ModelSettings): SegmentationModel;

  /**
   * Create an object detection model.
   *
   * @example
   * ```ts
   * const model = transformers.objectDetector('Xenova/detr-resnet-50');
   * const { objects } = await detectObjects({ model, image: imageBlob });
   * ```
   */
  objectDetector(modelId: string, settings?: ModelSettings): ObjectDetectionModel;

  /**
   * Create an image feature extraction model (e.g., CLIP, DINOv2).
   *
   * @example
   * ```ts
   * const model = transformers.imageFeatures('Xenova/clip-vit-base-patch32');
   * const { features } = await extractImageFeatures({ model, image: imageBlob });
   * ```
   */
  imageFeatures(modelId: string, settings?: ModelSettings): ImageFeatureModel;

  /**
   * Create an image-to-image model (e.g., super resolution).
   *
   * @example
   * ```ts
   * const model = transformers.imageToImage('Xenova/swin2SR-classical-sr-x2-64');
   * const { image } = await imageToImage({ model, image: imageBlob });
   * ```
   */
  imageToImage(modelId: string, settings?: ModelSettings): ImageToImageModel;

  /**
   * Create a text-to-speech model.
   *
   * @example
   * ```ts
   * const model = transformers.textToSpeech('Xenova/speecht5-tts');
   * const { audio } = await synthesizeSpeech({ model, text: 'Hello world' });
   * ```
   */
  textToSpeech(modelId: string, settings?: ModelSettings): TextToSpeechModel;

  /**
   * Create a translation model.
   *
   * @example
   * ```ts
   * const model = transformers.translator('Xenova/opus-mt-en-de');
   * const { text } = await translate({ model, text: 'Hello', targetLanguage: 'de' });
   * ```
   */
  translator(modelId: string, settings?: ModelSettings): TranslationModel;

  /**
   * Create a summarization model.
   *
   * @example
   * ```ts
   * const model = transformers.summarizer('Xenova/bart-large-cnn');
   * const { text } = await summarize({ model, text: longText });
   * ```
   */
  summarizer(modelId: string, settings?: ModelSettings): SummarizationModel;

  /**
   * Create a fill-mask model.
   *
   * @example
   * ```ts
   * const model = transformers.fillMask('Xenova/bert-base-uncased');
   * const { predictions } = await fillMask({ model, text: 'The capital of France is [MASK].' });
   * ```
   */
  fillMask(modelId: string, settings?: ModelSettings): FillMaskModel;

  /**
   * Create a question answering model.
   *
   * @example
   * ```ts
   * const model = transformers.questionAnswering('Xenova/distilbert-base-cased-distilled-squad');
   * const { answers } = await answerQuestion({ model, question: 'What is ML?', context });
   * ```
   */
  questionAnswering(modelId: string, settings?: ModelSettings): QuestionAnsweringModel;

  /**
   * Create an OCR model (TrOCR).
   *
   * @example
   * ```ts
   * const model = transformers.ocr('Xenova/trocr-base-handwritten');
   * const { fullText } = await extractText({ model, image: imageBlob });
   * ```
   */
  ocr(modelId: string, settings?: ModelSettings): OCRModel;

  /**
   * Create a document QA model.
   *
   * @example
   * ```ts
   * const model = transformers.documentQA('Xenova/donut-base-finetuned-docvqa');
   * const { answers } = await askDocument({ model, question: 'What is the total?', document });
   * ```
   */
  documentQA(modelId: string, settings?: ModelSettings): DocumentQAModel;
}
