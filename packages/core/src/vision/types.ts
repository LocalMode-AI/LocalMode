/**
 * Vision Domain Types
 *
 * Vision interfaces for:
 * - Image classification
 * - Zero-shot image classification
 * - Image captioning / Visual QA
 * - Object detection
 * - Image segmentation
 * - Depth estimation
 * - Image feature extraction
 *
 * @packageDocumentation
 */

// ═══════════════════════════════════════════════════════════════
// COMMON TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Image input type - supports multiple formats.
 */
export type ImageInput = Blob | ImageData | string | ArrayBuffer;

/**
 * Bounding box for object detection and other vision tasks.
 */
export interface BoundingBox {
  /** X coordinate of top-left corner */
  x: number;
  /** Y coordinate of top-left corner */
  y: number;
  /** Width of the box */
  width: number;
  /** Height of the box */
  height: number;
}

/**
 * Vision task usage information.
 */
export interface VisionUsage {
  /** Time spent on processing (milliseconds) */
  durationMs: number;
}

/**
 * Vision task response metadata.
 */
export interface VisionResponse {
  /** Optional request ID */
  id?: string;
  /** Model ID used */
  modelId: string;
  /** Timestamp of the response */
  timestamp: Date;
}

// ═══════════════════════════════════════════════════════════════
// IMAGE CLASSIFICATION MODEL INTERFACE
// ═══════════════════════════════════════════════════════════════

/**
 * Interface for image classification models.
 */
export interface ImageClassificationModel {
  /** Unique identifier for this model */
  readonly modelId: string;

  /** Provider name */
  readonly provider: string;

  /**
   * Classify the given images.
   *
   * @param options - Classification options
   * @returns Promise with classification results
   */
  doClassify(options: DoClassifyImageOptions): Promise<DoClassifyImageResult>;
}

/**
 * Options passed to ImageClassificationModel.doClassify()
 */
export interface DoClassifyImageOptions {
  /** Images to classify */
  images: ImageInput[];

  /** Number of top predictions to return */
  topK?: number;

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from ImageClassificationModel.doClassify()
 */
export interface DoClassifyImageResult {
  /** Classification results (one array per input image) */
  results: ImageClassificationResultItem[][];

  /** Usage information */
  usage: VisionUsage;
}

/**
 * A single image classification prediction.
 */
export interface ImageClassificationResultItem {
  /** The predicted label */
  label: string;

  /** Confidence score (0-1) */
  score: number;
}

// ═══════════════════════════════════════════════════════════════
// ZERO-SHOT IMAGE CLASSIFICATION MODEL INTERFACE
// ═══════════════════════════════════════════════════════════════

/**
 * Interface for zero-shot image classification models (e.g., CLIP).
 */
export interface ZeroShotImageClassificationModel {
  /** Unique identifier for this model */
  readonly modelId: string;

  /** Provider name */
  readonly provider: string;

  /**
   * Classify images into candidate labels without fine-tuning.
   *
   * @param options - Classification options
   * @returns Promise with classification results
   */
  doClassifyZeroShot(
    options: DoClassifyImageZeroShotOptions
  ): Promise<DoClassifyImageZeroShotResult>;
}

/**
 * Options passed to ZeroShotImageClassificationModel.doClassifyZeroShot()
 */
export interface DoClassifyImageZeroShotOptions {
  /** Images to classify */
  images: ImageInput[];

  /** Candidate labels to classify into */
  candidateLabels: string[];

  /** Hypothesis template */
  hypothesisTemplate?: string;

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from ZeroShotImageClassificationModel.doClassifyZeroShot()
 */
export interface DoClassifyImageZeroShotResult {
  /** Classification results (one per input image) */
  results: ZeroShotImageClassificationResultItem[];

  /** Usage information */
  usage: VisionUsage;
}

/**
 * A single zero-shot image classification result.
 */
export interface ZeroShotImageClassificationResultItem {
  /** Labels sorted by score (highest first) */
  labels: string[];

  /** Corresponding scores for each label */
  scores: number[];
}

// ═══════════════════════════════════════════════════════════════
// CLASSIFY IMAGE FUNCTION OPTIONS & RESULTS
// ═══════════════════════════════════════════════════════════════

/**
 * Options for the classifyImage() function.
 *
 * @example
 * ```ts
 * const { predictions } = await classifyImage({
 *   model: transformers.imageClassifier('Xenova/vit-base-patch16-224'),
 *   image: imageBlob,
 *   topK: 5,
 * });
 * ```
 */
export interface ClassifyImageOptions {
  /** The image classification model to use */
  model: ImageClassificationModel | string;

  /** The image to classify */
  image: ImageInput;

  /** Number of top predictions to return (default: 5) */
  topK?: number;

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Maximum retry attempts (default: 2) */
  maxRetries?: number;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from the classifyImage() function.
 */
export interface ClassifyImageResult {
  /** Top predictions sorted by score */
  predictions: ImageClassificationResultItem[];

  /** Usage information */
  usage: VisionUsage;

  /** Response metadata */
  response: VisionResponse;
}

/**
 * Options for the classifyImageZeroShot() function.
 */
export interface ClassifyImageZeroShotOptions {
  /** The zero-shot image classification model to use */
  model: ZeroShotImageClassificationModel | string;

  /** The image to classify */
  image: ImageInput;

  /** Candidate labels to classify into */
  candidateLabels: string[];

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Maximum retry attempts (default: 2) */
  maxRetries?: number;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from the classifyImageZeroShot() function.
 */
export interface ClassifyImageZeroShotResult {
  /** Labels sorted by score (highest first) */
  labels: string[];

  /** Corresponding scores for each label */
  scores: number[];

  /** Usage information */
  usage: VisionUsage;

  /** Response metadata */
  response: VisionResponse;
}

// ═══════════════════════════════════════════════════════════════
// IMAGE CAPTIONING MODEL INTERFACE
// ═══════════════════════════════════════════════════════════════

/**
 * Interface for image captioning models (e.g., BLIP).
 */
export interface ImageCaptionModel {
  /** Unique identifier for this model */
  readonly modelId: string;

  /** Provider name */
  readonly provider: string;

  /**
   * Generate captions for the given images.
   *
   * @param options - Captioning options
   * @returns Promise with captions
   */
  doCaption(options: DoCaptionImageOptions): Promise<DoCaptionImageResult>;
}

/**
 * Options passed to ImageCaptionModel.doCaption()
 */
export interface DoCaptionImageOptions {
  /** Images to caption */
  images: ImageInput[];

  /** Maximum caption length */
  maxLength?: number;

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from ImageCaptionModel.doCaption()
 */
export interface DoCaptionImageResult {
  /** Generated captions (one per input image) */
  captions: string[];

  /** Usage information */
  usage: VisionUsage;
}

/**
 * Options for the captionImage() function.
 *
 * @example
 * ```ts
 * const { caption } = await captionImage({
 *   model: transformers.captioner('Xenova/blip-image-captioning-base'),
 *   image: imageBlob,
 * });
 * ```
 */
export interface CaptionImageOptions {
  /** The image captioning model to use */
  model: ImageCaptionModel | string;

  /** The image to caption */
  image: ImageInput;

  /** Maximum caption length */
  maxLength?: number;

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Maximum retry attempts (default: 2) */
  maxRetries?: number;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from the captionImage() function.
 */
export interface CaptionImageResult {
  /** Generated caption */
  caption: string;

  /** Usage information */
  usage: VisionUsage;

  /** Response metadata */
  response: VisionResponse;
}

// ═══════════════════════════════════════════════════════════════
// OBJECT DETECTION MODEL INTERFACE
// ═══════════════════════════════════════════════════════════════

/**
 * Interface for object detection models (e.g., DETR, YOLO).
 */
export interface ObjectDetectionModel {
  /** Unique identifier for this model */
  readonly modelId: string;

  /** Provider name */
  readonly provider: string;

  /**
   * Detect objects in the given images.
   *
   * @param options - Detection options
   * @returns Promise with detection results
   */
  doDetect(options: DoDetectObjectsOptions): Promise<DoDetectObjectsResult>;
}

/**
 * Options passed to ObjectDetectionModel.doDetect()
 */
export interface DoDetectObjectsOptions {
  /** Images to detect objects in */
  images: ImageInput[];

  /** Minimum confidence threshold (0-1) */
  threshold?: number;

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from ObjectDetectionModel.doDetect()
 */
export interface DoDetectObjectsResult {
  /** Detection results (one per input image) */
  results: ObjectDetectionResultItem[];

  /** Usage information */
  usage: VisionUsage;
}

/**
 * Object detection results for a single image.
 */
export interface ObjectDetectionResultItem {
  /** Detected objects */
  objects: DetectedObject[];
}

/**
 * A single detected object.
 */
export interface DetectedObject {
  /** Object label/class */
  label: string;

  /** Confidence score (0-1) */
  score: number;

  /** Bounding box */
  box: BoundingBox;
}

/**
 * Interface for zero-shot object detection models (e.g., OWL-ViT).
 */
export interface ZeroShotObjectDetectionModel {
  /** Unique identifier for this model */
  readonly modelId: string;

  /** Provider name */
  readonly provider: string;

  /**
   * Detect objects matching candidate labels.
   *
   * @param options - Detection options
   * @returns Promise with detection results
   */
  doDetectZeroShot(options: DoDetectObjectsZeroShotOptions): Promise<DoDetectObjectsResult>;
}

/**
 * Options for zero-shot object detection.
 */
export interface DoDetectObjectsZeroShotOptions {
  /** Images to detect objects in */
  images: ImageInput[];

  /** Candidate object labels to detect */
  candidateLabels: string[];

  /** Minimum confidence threshold (0-1) */
  threshold?: number;

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Options for the detectObjects() function.
 */
export interface DetectObjectsOptions {
  /** The object detection model to use */
  model: ObjectDetectionModel | string;

  /** The image to detect objects in */
  image: ImageInput;

  /** Minimum confidence threshold (0-1, default: 0.5) */
  threshold?: number;

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Maximum retry attempts (default: 2) */
  maxRetries?: number;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from the detectObjects() function.
 */
export interface DetectObjectsResult {
  /** Detected objects */
  objects: DetectedObject[];

  /** Usage information */
  usage: VisionUsage;

  /** Response metadata */
  response: VisionResponse;
}

// ═══════════════════════════════════════════════════════════════
// IMAGE SEGMENTATION MODEL INTERFACE
// ═══════════════════════════════════════════════════════════════

/**
 * Interface for image segmentation models.
 */
export interface SegmentationModel {
  /** Unique identifier for this model */
  readonly modelId: string;

  /** Provider name */
  readonly provider: string;

  /** Type of segmentation */
  readonly segmentationType: 'semantic' | 'instance' | 'panoptic';

  /**
   * Segment the given images.
   *
   * @param options - Segmentation options
   * @returns Promise with segmentation results
   */
  doSegment(options: DoSegmentImageOptions): Promise<DoSegmentImageResult>;
}

/**
 * Options passed to SegmentationModel.doSegment()
 */
export interface DoSegmentImageOptions {
  /** Images to segment */
  images: ImageInput[];

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from SegmentationModel.doSegment()
 */
export interface DoSegmentImageResult {
  /** Segmentation results (one per input image) */
  results: SegmentationResultItem[];

  /** Usage information */
  usage: VisionUsage;
}

/**
 * Segmentation results for a single image.
 */
export interface SegmentationResultItem {
  /** Segmentation masks */
  masks: SegmentMask[];
}

/**
 * A single segmentation mask.
 */
export interface SegmentMask {
  /** Segment label */
  label: string;

  /** Confidence score (0-1) */
  score: number;

  /** Mask data (ImageData or Uint8Array) */
  mask: ImageData | Uint8Array;
}

/**
 * Options for the segmentImage() function.
 */
export interface SegmentImageOptions {
  /** The segmentation model to use */
  model: SegmentationModel | string;

  /** The image to segment */
  image: ImageInput;

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Maximum retry attempts (default: 2) */
  maxRetries?: number;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from the segmentImage() function.
 */
export interface SegmentImageResult {
  /** Segmentation masks */
  masks: SegmentMask[];

  /** Usage information */
  usage: VisionUsage;

  /** Response metadata */
  response: VisionResponse;
}

// ═══════════════════════════════════════════════════════════════
// DEPTH ESTIMATION MODEL INTERFACE
// ═══════════════════════════════════════════════════════════════

/**
 * Interface for depth estimation models.
 */
export interface DepthEstimationModel {
  /** Unique identifier for this model */
  readonly modelId: string;

  /** Provider name */
  readonly provider: string;

  /**
   * Estimate depth for the given images.
   *
   * @param options - Depth estimation options
   * @returns Promise with depth maps
   */
  doEstimate(options: DoEstimateDepthOptions): Promise<DoEstimateDepthResult>;
}

/**
 * Options passed to DepthEstimationModel.doEstimate()
 */
export interface DoEstimateDepthOptions {
  /** Images to estimate depth for */
  images: ImageInput[];

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from DepthEstimationModel.doEstimate()
 */
export interface DoEstimateDepthResult {
  /** Depth maps (one per input image) */
  depthMaps: Array<Float32Array | ImageData>;

  /** Usage information */
  usage: VisionUsage;
}

/**
 * Options for the estimateDepth() function.
 */
export interface EstimateDepthOptions {
  /** The depth estimation model to use */
  model: DepthEstimationModel | string;

  /** The image to estimate depth for */
  image: ImageInput;

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Maximum retry attempts (default: 2) */
  maxRetries?: number;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from the estimateDepth() function.
 */
export interface EstimateDepthResult {
  /** Depth map */
  depthMap: Float32Array | ImageData;

  /** Usage information */
  usage: VisionUsage;

  /** Response metadata */
  response: VisionResponse;
}

// ═══════════════════════════════════════════════════════════════
// IMAGE FEATURE EXTRACTION MODEL INTERFACE
// ═══════════════════════════════════════════════════════════════

/**
 * Interface for image feature extraction models (e.g., CLIP image encoder).
 */
export interface ImageFeatureModel {
  /** Unique identifier for this model */
  readonly modelId: string;

  /** Provider name */
  readonly provider: string;

  /** Feature vector dimensions */
  readonly dimensions: number;

  /**
   * Extract features from the given images.
   *
   * @param options - Feature extraction options
   * @returns Promise with feature vectors
   */
  doExtract(options: DoExtractImageFeaturesOptions): Promise<DoExtractImageFeaturesResult>;
}

/**
 * Options passed to ImageFeatureModel.doExtract()
 */
export interface DoExtractImageFeaturesOptions {
  /** Images to extract features from */
  images: ImageInput[];

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from ImageFeatureModel.doExtract()
 */
export interface DoExtractImageFeaturesResult {
  /** Feature vectors (one per input image) */
  features: Float32Array[];

  /** Usage information */
  usage: VisionUsage;
}

/**
 * Options for the extractImageFeatures() function.
 */
export interface ExtractImageFeaturesOptions {
  /** The image feature model to use */
  model: ImageFeatureModel | string;

  /** The image to extract features from */
  image: ImageInput;

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Maximum retry attempts (default: 2) */
  maxRetries?: number;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from the extractImageFeatures() function.
 */
export interface ExtractImageFeaturesResult {
  /** Feature vector */
  features: Float32Array;

  /** Usage information */
  usage: VisionUsage;

  /** Response metadata */
  response: VisionResponse;
}

// ═══════════════════════════════════════════════════════════════
// PROVIDER FACTORY TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Factory function type for creating image classification models.
 */
export type ImageClassificationModelFactory = (
  modelId: string,
  settings?: Record<string, unknown>
) => ImageClassificationModel;

/**
 * Factory function type for creating zero-shot image classification models.
 */
export type ZeroShotImageClassificationModelFactory = (
  modelId: string,
  settings?: Record<string, unknown>
) => ZeroShotImageClassificationModel;

/**
 * Factory function type for creating image captioning models.
 */
export type ImageCaptionModelFactory = (
  modelId: string,
  settings?: Record<string, unknown>
) => ImageCaptionModel;

/**
 * Factory function type for creating object detection models.
 */
export type ObjectDetectionModelFactory = (
  modelId: string,
  settings?: Record<string, unknown>
) => ObjectDetectionModel;

/**
 * Factory function type for creating segmentation models.
 */
export type SegmentationModelFactory = (
  modelId: string,
  settings?: Record<string, unknown>
) => SegmentationModel;

/**
 * Factory function type for creating depth estimation models.
 */
export type DepthEstimationModelFactory = (
  modelId: string,
  settings?: Record<string, unknown>
) => DepthEstimationModel;

/**
 * Factory function type for creating image feature models.
 */
export type ImageFeatureModelFactory = (
  modelId: string,
  settings?: Record<string, unknown>
) => ImageFeatureModel;

// ═══════════════════════════════════════════════════════════════
// IMAGE-TO-IMAGE MODEL INTERFACE (Super Resolution, Style Transfer)
// ═══════════════════════════════════════════════════════════════

/**
 * Interface for image-to-image transformation models (e.g., super resolution).
 */
export interface ImageToImageModel {
  /** Unique identifier for this model */
  readonly modelId: string;

  /** Provider name */
  readonly provider: string;

  /** Output scale factor (for super resolution) */
  readonly outputScale?: number;

  /**
   * Transform the given images.
   *
   * @param options - Transformation options
   * @returns Promise with transformed images
   */
  doTransform(options: DoTransformImageOptions): Promise<DoTransformImageResult>;
}

/**
 * Options passed to ImageToImageModel.doTransform()
 */
export interface DoTransformImageOptions {
  /** Images to transform */
  images: ImageInput[];

  /** Scale factor (for super resolution) */
  scale?: number;

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from ImageToImageModel.doTransform()
 */
export interface DoTransformImageResult {
  /** Transformed images */
  images: Array<ImageData | Blob>;

  /** Usage information */
  usage: VisionUsage;
}

/**
 * Options for the upscaleImage() function.
 *
 * @example
 * ```ts
 * const { image } = await upscaleImage({
 *   model: transformers.imageToImage('Xenova/swin2SR-classical-sr-x2-64'),
 *   image: lowResImage,
 *   scale: 2,
 * });
 * ```
 */
export interface UpscaleImageOptions {
  /** The image-to-image model to use */
  model: ImageToImageModel | string;

  /** The image to upscale */
  image: ImageInput;

  /** Scale factor (default: 2) */
  scale?: number;

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Maximum retry attempts (default: 2) */
  maxRetries?: number;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from the upscaleImage() function.
 */
export interface UpscaleImageResult {
  /** Upscaled image */
  image: ImageData | Blob;

  /** Usage information */
  usage: VisionUsage;

  /** Response metadata */
  response: VisionResponse;
}

/**
 * Factory function type for creating image-to-image models.
 */
export type ImageToImageModelFactory = (
  modelId: string,
  settings?: Record<string, unknown>
) => ImageToImageModel;

