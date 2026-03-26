/**
 * Transformers CLIP Multimodal Embedding Model Implementation
 *
 * Implements MultimodalEmbeddingModel interface using CLIP/SigLIP models
 * from Transformers.js. Produces text and image embeddings in a shared
 * 512-dimensional vector space for cross-modal similarity search.
 *
 * Key design decisions:
 * - Lazy encoder loading: text encoder loads on first doEmbed(), vision
 *   encoder on first doEmbedImage(). This avoids downloading unused
 *   encoders if only one modality is needed.
 * - L2-normalized outputs: Both text and image embeddings are normalized
 *   so cosine similarity gives meaningful cross-modal scores.
 * - Uses CLIPTextModelWithProjection + CLIPVisionModelWithProjection
 *   (or SigLIP variants) instead of the full CLIPModel, reducing memory.
 *
 * @packageDocumentation
 */

import type {
  MultimodalEmbeddingModel,
  EmbeddingModality,
  DoEmbedImageOptions,
  ImageInput,
} from '@localmode/core';
import type { DoEmbedOptions, DoEmbedResult } from '@localmode/core';
import type { ModelSettings, TransformersDevice, ModelLoadProgress } from '../types.js';

/**
 * CLIP multimodal embedding model using Transformers.js.
 *
 * Embeds both text and images into the same vector space using separate
 * text and vision encoders that are loaded lazily on first use.
 */
export class TransformersCLIPEmbeddingModel implements MultimodalEmbeddingModel {
  readonly modelId: string;
  readonly provider = 'transformers';
  readonly dimensions: number;
  readonly maxEmbeddingsPerCall = 32;
  readonly supportsParallelCalls = false;
  readonly supportedModalities: EmbeddingModality[] = ['text', 'image'];

  // Lazy-loaded text encoder components
  private textTokenizer: unknown | null = null;
  private textModel: unknown | null = null;
  private textLoadPromise: Promise<void> | null = null;

  // Lazy-loaded vision encoder components
  private imageProcessor: unknown | null = null;
  private visionModel: unknown | null = null;
  private visionLoadPromise: Promise<void> | null = null;

  constructor(
    private baseModelId: string,
    private settings: {
      device?: TransformersDevice;
      quantized?: boolean;
      dimensions?: number;
      onProgress?: (progress: ModelLoadProgress) => void;
    } = {}
  ) {
    this.modelId = `transformers:${baseModelId}`;
    // CLIP ViT-Base models produce 512-d vectors; ViT-Large produce 768-d
    this.dimensions = settings.dimensions ?? this.inferDimensions(baseModelId);
  }

  /**
   * Infer embedding dimensions from the model ID.
   */
  private inferDimensions(modelId: string): number {
    const lower = modelId.toLowerCase();
    if (lower.includes('large') || lower.includes('patch14')) {
      return 768;
    }
    // Default for base CLIP/SigLIP models
    return 512;
  }

  // ═══════════════════════════════════════════════════════════════
  // TEXT ENCODER (lazy load on first doEmbed call)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Load the text encoder components (tokenizer + text model) if not loaded.
   */
  private async loadTextEncoder(): Promise<void> {
    if (this.textTokenizer && this.textModel) {
      return;
    }

    if (this.textLoadPromise) {
      return this.textLoadPromise;
    }

    this.textLoadPromise = (async () => {
      const {
        AutoTokenizer,
        CLIPTextModelWithProjection,
        env,
      } = await import('@huggingface/transformers');

      // Suppress ONNX runtime warnings
      env.backends.onnx.logLevel = 'error';

      const dtype = this.settings.quantized !== false ? 'q8' : 'fp32';

      const [tokenizer, model] = await Promise.all([
        AutoTokenizer.from_pretrained(this.baseModelId, {
          progress_callback: this.settings.onProgress,
        }),
        CLIPTextModelWithProjection.from_pretrained(this.baseModelId, {
          device: this.settings.device ?? 'auto',
          dtype,
          progress_callback: this.settings.onProgress,
        }),
      ]);

      this.textTokenizer = tokenizer;
      this.textModel = model;
    })();

    return this.textLoadPromise;
  }

  // ═══════════════════════════════════════════════════════════════
  // VISION ENCODER (lazy load on first doEmbedImage call)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Load the vision encoder components (processor + vision model) if not loaded.
   */
  private async loadVisionEncoder(): Promise<void> {
    if (this.imageProcessor && this.visionModel) {
      return;
    }

    if (this.visionLoadPromise) {
      return this.visionLoadPromise;
    }

    this.visionLoadPromise = (async () => {
      const {
        AutoProcessor,
        CLIPVisionModelWithProjection,
        env,
      } = await import('@huggingface/transformers');

      // Suppress ONNX runtime warnings
      env.backends.onnx.logLevel = 'error';

      const dtype = this.settings.quantized !== false ? 'q8' : 'fp32';

      const [processor, model] = await Promise.all([
        AutoProcessor.from_pretrained(this.baseModelId, {
          progress_callback: this.settings.onProgress,
        }),
        CLIPVisionModelWithProjection.from_pretrained(this.baseModelId, {
          device: this.settings.device ?? 'auto',
          dtype,
          progress_callback: this.settings.onProgress,
        }),
      ]);

      this.imageProcessor = processor;
      this.visionModel = model;
    })();

    return this.visionLoadPromise;
  }

  // ═══════════════════════════════════════════════════════════════
  // TEXT EMBEDDING (EmbeddingModel interface)
  // ═══════════════════════════════════════════════════════════════

  async doEmbed(options: DoEmbedOptions<string>): Promise<DoEmbedResult> {
    const { values, abortSignal } = options;

    abortSignal?.throwIfAborted();

    await this.loadTextEncoder();

    abortSignal?.throwIfAborted();

    const tokenizer = this.textTokenizer as {
      (texts: string[], options: { padding: boolean; truncation: boolean }): {
        input_ids: unknown;
        attention_mask: unknown;
      };
    };
    const textModel = this.textModel as {
      (inputs: unknown): Promise<{ text_embeds: { data: ArrayLike<number>; dims: number[] } }>;
    };

    const embeddings: Float32Array[] = [];
    let totalTokens = 0;

    for (const value of values) {
      abortSignal?.throwIfAborted();

      const inputs = tokenizer([value], { padding: true, truncation: true });
      totalTokens += Math.ceil(value.split(/\s+/).length * 1.3);

      const output = await textModel(inputs);
      const embeddingData = output.text_embeds.data;
      const dims = output.text_embeds.dims;
      const vecLength = dims[dims.length - 1];

      // Extract the embedding for this single input and L2-normalize
      const rawVec = new Float32Array(vecLength);
      for (let i = 0; i < vecLength; i++) {
        rawVec[i] = Number(embeddingData[i]);
      }
      embeddings.push(this.l2Normalize(rawVec));
    }

    return {
      embeddings,
      usage: { tokens: totalTokens },
      response: {
        modelId: this.modelId,
        timestamp: new Date(),
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // IMAGE EMBEDDING (MultimodalEmbeddingModel extension)
  // ═══════════════════════════════════════════════════════════════

  async doEmbedImage(options: DoEmbedImageOptions): Promise<DoEmbedResult> {
    const { images, abortSignal } = options;

    abortSignal?.throwIfAborted();

    await this.loadVisionEncoder();

    abortSignal?.throwIfAborted();

    const processor = this.imageProcessor as {
      (images: unknown[], options?: Record<string, unknown>): Promise<unknown>;
    };
    const visionModel = this.visionModel as {
      (inputs: unknown): Promise<{ image_embeds: { data: ArrayLike<number>; dims: number[] } }>;
    };

    const embeddings: Float32Array[] = [];

    for (const image of images) {
      abortSignal?.throwIfAborted();

      const preparedImage = this.prepareImage(image);

      // Use RawImage.read for URL/data-URI strings, pass blobs directly
      let imageInput: unknown;
      if (typeof preparedImage === 'string') {
        const { RawImage } = await import('@huggingface/transformers');
        imageInput = await RawImage.read(preparedImage);
      } else {
        imageInput = preparedImage;
      }

      const pixelValues = await processor([imageInput]);
      const output = await visionModel(pixelValues);
      const embeddingData = output.image_embeds.data;
      const dims = output.image_embeds.dims;
      const vecLength = dims[dims.length - 1];

      const rawVec = new Float32Array(vecLength);
      for (let i = 0; i < vecLength; i++) {
        rawVec[i] = Number(embeddingData[i]);
      }
      embeddings.push(this.l2Normalize(rawVec));
    }

    return {
      embeddings,
      usage: { tokens: images.length }, // 1 "token" per image
      response: {
        modelId: this.modelId,
        timestamp: new Date(),
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Prepare an ImageInput for the processor.
   */
  private prepareImage(image: ImageInput): string | Blob | ImageData {
    if (typeof image === 'string') {
      return image;
    }
    if (image instanceof Blob) {
      return image;
    }
    if (typeof ImageData !== 'undefined' && image instanceof ImageData) {
      return image;
    }
    if (image instanceof ArrayBuffer) {
      return new Blob([image], { type: 'image/png' });
    }
    return image as unknown as string;
  }

  /**
   * L2-normalize a vector so cosine similarity is well-calibrated
   * between text and image embeddings.
   */
  private l2Normalize(vector: Float32Array): Float32Array {
    let sumSq = 0;
    for (let i = 0; i < vector.length; i++) {
      sumSq += vector[i] * vector[i];
    }
    const norm = Math.sqrt(sumSq);
    if (norm > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= norm;
      }
    }
    return vector;
  }
}

/**
 * Create a CLIP multimodal embedding model using Transformers.js.
 *
 * @param modelId - HuggingFace model ID (e.g., 'Xenova/clip-vit-base-patch32')
 * @param settings - Model settings (device, quantized, onProgress)
 * @returns TransformersCLIPEmbeddingModel instance
 */
export function createCLIPEmbeddingModel(
  modelId: string,
  settings?: ModelSettings & { dimensions?: number }
): TransformersCLIPEmbeddingModel {
  return new TransformersCLIPEmbeddingModel(modelId, settings);
}
