/**
 * Transformers Provider Types
 *
 * Provider-specific types for the Transformers.js integration.
 *
 * @packageDocumentation
 */

import type {
  // Core model types
  EmbeddingModel,
  ClassificationModel,
  ZeroShotClassificationModel,
  NERModel,
  RerankerModel,
  SpeechToTextModel,
  ImageClassificationModel,
  ZeroShotImageClassificationModel,
  ImageCaptionModel,
  // Extended model types
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
  // Multimodal
  MultimodalEmbeddingModel,
  // Audio Classification & Depth Estimation
  AudioClassificationModel,
  ZeroShotAudioClassificationModel,
  DepthEstimationModel,
  // Generation
  LanguageModel,
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
  status: 'initiate' | 'download' | 'progress' | 'progress_total' | 'done' | 'ready';

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
 * Settings specific to language model (LLM) instances.
 *
 * Extends {@link ModelSettings} with text generation parameters.
 *
 * **Experimental**: Uses Transformers.js v4 (preview release).
 *
 * @example
 * ```ts
 * import { transformers } from '@localmode/transformers';
 *
 * const model = transformers.languageModel('onnx-community/Qwen3.5-0.8B-ONNX', {
 *   contextLength: 32768,
 *   maxTokens: 1024,
 *   temperature: 0.7,
 *   device: 'webgpu',
 * });
 * ```
 */
export interface LanguageModelSettings extends ModelSettings {
  /**
   * Maximum context length in tokens.
   * @default 4096
   */
  contextLength?: number;

  /**
   * Default maximum tokens to generate per response.
   * @default 512
   */
  maxTokens?: number;

  /**
   * Default temperature for sampling (0-2).
   * @default 0.7
   */
  temperature?: number;

  /**
   * Default top-p (nucleus) sampling parameter.
   * @default 0.95
   */
  topP?: number;

  /**
   * Default system prompt prepended to all generations.
   */
  systemPrompt?: string;

  /**
   * Per-component dtype config for multimodal models (Qwen3.5).
   * Auto-detected if not set — defaults to q4 for all components.
   *
   * @example
   * ```ts
   * const model = transformers.languageModel('onnx-community/Qwen3.5-0.8B-ONNX', {
   *   dtype: { embed_tokens: 'q4', vision_encoder: 'q4', decoder_model_merged: 'q4' },
   * });
   * ```
   */
  dtype?: Record<string, string>;
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
   * const model = transformers.embedding('Xenova/bge-small-en-v1.5');
   * const { embedding } = await embed({ model, value: 'Hello' });
   * ```
   */
  embedding(modelId: string, settings?: ModelSettings): EmbeddingModel;

  /**
   * Create a text classification model.
   *
   * @example
   * ```ts
   * const model = transformers.classifier('Xenova/distilbert-base-uncased-finetuned-sst-2-english');
   * const { label } = await classify({ model, text: 'Great!' });
   * ```
   */
  classifier(modelId: string, settings?: ModelSettings): ClassificationModel;

  /**
   * Create a zero-shot classification model.
   *
   * @example
   * ```ts
   * const model = transformers.zeroShot('Xenova/mobilebert-uncased-mnli');
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
   * const model = transformers.speechToText('onnx-community/moonshine-tiny-ONNX');
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
   * const model = transformers.zeroShotImageClassifier('Xenova/siglip-base-patch16-224');
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
   * const model = transformers.captioner('onnx-community/Florence-2-base-ft');
   * const { caption } = await captionImage({ model, image: imageBlob });
   * ```
   */
  captioner(modelId: string, settings?: ModelSettings): ImageCaptionModel;

  // ═══════════════════════════════════════════════════════════════
  // EXTENDED MODEL FACTORIES
  // ═══════════════════════════════════════════════════════════════

  /**
   * Create an image segmentation model.
   *
   * @example
   * ```ts
   * const model = transformers.segmenter('briaai/RMBG-1.4');
   * const { masks } = await segmentImage({ model, image: imageBlob });
   * ```
   */
  segmenter(modelId: string, settings?: ModelSettings): SegmentationModel;

  /**
   * Create an object detection model.
   *
   * @example
   * ```ts
   * const model = transformers.objectDetector('onnx-community/dfine_n_coco-ONNX');
   * const { objects } = await detectObjects({ model, image: imageBlob });
   * ```
   */
  objectDetector(modelId: string, settings?: ModelSettings): ObjectDetectionModel;

  /**
   * Create an image feature extraction model (e.g., CLIP, DINOv2).
   *
   * @example
   * ```ts
   * const model = transformers.imageFeatures('Xenova/siglip-base-patch16-224');
   * const { features } = await extractImageFeatures({ model, image: imageBlob });
   * ```
   */
  imageFeatures(modelId: string, settings?: ModelSettings): ImageFeatureModel;

  /**
   * Create an image-to-image model (e.g., super resolution).
   *
   * @example
   * ```ts
   * const model = transformers.imageToImage('Xenova/swin2SR-lightweight-x2-64');
   * const { image } = await imageToImage({ model, image: imageBlob });
   * ```
   */
  imageToImage(modelId: string, settings?: ModelSettings): ImageToImageModel;

  /**
   * Create a text-to-speech model.
   *
   * @example
   * ```ts
   * const model = transformers.textToSpeech('onnx-community/Kokoro-82M-v1.0-ONNX');
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
   * const model = transformers.summarizer('Xenova/distilbart-cnn-6-6');
   * const { text } = await summarize({ model, text: longText });
   * ```
   */
  summarizer(modelId: string, settings?: ModelSettings): SummarizationModel;

  /**
   * Create a fill-mask model.
   *
   * @example
   * ```ts
   * const model = transformers.fillMask('onnx-community/ModernBERT-base-ONNX');
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
   * const model = transformers.ocr('Xenova/trocr-small-printed');
   * const { fullText } = await extractText({ model, image: imageBlob });
   * ```
   */
  ocr(modelId: string, settings?: ModelSettings): OCRModel;

  /**
   * Create a document QA model.
   *
   * @example
   * ```ts
   * const model = transformers.documentQA('onnx-community/Florence-2-base-ft');
   * const { answers } = await askDocument({ model, question: 'What is the total?', document });
   * ```
   */
  documentQA(modelId: string, settings?: ModelSettings): DocumentQAModel;

  // ═══════════════════════════════════════════════════════════════
  // MULTIMODAL MODEL FACTORIES
  // ═══════════════════════════════════════════════════════════════

  /**
   * Create a multimodal embedding model (e.g., CLIP, SigLIP).
   *
   * Produces text and image embeddings in the same vector space,
   * enabling cross-modal similarity search.
   *
   * @example
   * ```ts
   * import { embed, embedImage, cosineSimilarity } from '@localmode/core';
   *
   * const model = transformers.multimodalEmbedding('Xenova/clip-vit-base-patch32');
   *
   * const { embedding: textVec } = await embed({ model, value: 'a cat' });
   * const { embedding: imgVec } = await embedImage({ model, image: catBlob });
   *
   * const similarity = cosineSimilarity(textVec, imgVec);
   * ```
   */
  multimodalEmbedding(modelId: string, settings?: ModelSettings): MultimodalEmbeddingModel;

  // ═══════════════════════════════════════════════════════════════
  // AUDIO CLASSIFICATION & DEPTH ESTIMATION
  // ═══════════════════════════════════════════════════════════════

  /**
   * Create an audio classification model.
   *
   * @example
   * ```ts
   * const model = transformers.audioClassifier('Xenova/wav2vec2-large-xlsr-53-gender-recognition-librispeech');
   * const { predictions } = await classifyAudio({ model, audio: audioBlob });
   * ```
   */
  audioClassifier(modelId: string, settings?: ModelSettings): AudioClassificationModel;

  /**
   * Create a zero-shot audio classification model (e.g., CLAP).
   *
   * @example
   * ```ts
   * const model = transformers.zeroShotAudioClassifier('Xenova/clap-htsat-unfused');
   * const { labels, scores } = await classifyAudioZeroShot({
   *   model,
   *   audio: audioBlob,
   *   candidateLabels: ['music', 'speech', 'noise'],
   * });
   * ```
   */
  zeroShotAudioClassifier(
    modelId: string,
    settings?: ModelSettings
  ): ZeroShotAudioClassificationModel;

  /**
   * Create a depth estimation model.
   *
   * @example
   * ```ts
   * const model = transformers.depthEstimator('Xenova/depth-anything-small-hf');
   * const { depthMap } = await estimateDepth({ model, image: imageBlob });
   * ```
   */
  depthEstimator(modelId: string, settings?: ModelSettings): DepthEstimationModel;

  // ═══════════════════════════════════════════════════════════════
  // LANGUAGE MODEL FACTORY (Experimental — TJS v4)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Create a language model for text generation using Transformers.js v4.
   *
   * Uses ONNX models with WebGPU acceleration and automatic WASM fallback.
   *
   * **Experimental**: Uses Transformers.js v4 which is a preview release.
   *
   * @example
   * ```ts
   * import { transformers } from '@localmode/transformers';
   * import { generateText, streamText } from '@localmode/core';
   *
   * const model = transformers.languageModel('onnx-community/Qwen3.5-0.8B-ONNX');
   *
   * // Single-shot generation
   * const { text } = await generateText({ model, prompt: 'What is 2+2?' });
   *
   * // Streaming generation
   * const stream = await streamText({ model, prompt: 'Write a story' });
   * for await (const chunk of stream.stream) {
   *   process.stdout.write(chunk.text);
   * }
   * ```
   */
  languageModel(modelId: string, settings?: LanguageModelSettings): LanguageModel;
}
