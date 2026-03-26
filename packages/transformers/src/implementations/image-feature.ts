/**
 * Transformers Image Feature Extraction Model Implementation
 *
 * Implements ImageFeatureModel interface using Transformers.js (CLIP, DINOv2, etc.)
 *
 * @packageDocumentation
 */

import type {
  ImageFeatureModel,
  ImageInput,
  VisionUsage,
} from '@localmode/core';
import type { ModelSettings, TransformersDevice, ModelLoadProgress } from '../types.js';

// Dynamic import types
type FeatureExtractionPipeline = Awaited<
  ReturnType<typeof import('@huggingface/transformers').pipeline<'image-feature-extraction'>>
>;

/**
 * Image feature extraction model implementation using Transformers.js
 */
export class TransformersImageFeatureModel implements ImageFeatureModel {
  readonly modelId: string;
  readonly provider = 'transformers';
  readonly dimensions: number;

  private pipeline: FeatureExtractionPipeline | null = null;
  private loadPromise: Promise<FeatureExtractionPipeline> | null = null;

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
    // Default dimensions based on common models
    this.dimensions = settings.dimensions ?? 512;
  }

  private async loadPipeline(): Promise<FeatureExtractionPipeline> {
    if (this.pipeline) {
      return this.pipeline;
    }

    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');

      // Suppress ONNX runtime warnings about node execution providers
      env.backends.onnx.logLevel = 'error';

      const pipe = await pipeline('image-feature-extraction', this.baseModelId, {
        device: this.settings.device ?? 'auto',
        dtype: this.settings.quantized === true ? 'q8' : undefined,
        progress_callback: this.settings.onProgress,
      });

      this.pipeline = pipe;
      return pipe;
    })();

    return this.loadPromise;
  }

  private prepareImage(image: ImageInput): string | Blob | ImageData {
    if (typeof image === 'string') {
      return image;
    }
    if (image instanceof Blob) {
      return image;
    }
    if (image instanceof ImageData) {
      return image;
    }
    if (image instanceof ArrayBuffer) {
      return new Blob([image], { type: 'image/png' });
    }
    return image as string;
  }

  async doExtract(options: {
    images: ImageInput[];
    abortSignal?: AbortSignal;
    providerOptions?: Record<string, Record<string, unknown>>;
  }): Promise<{
    features: Float32Array[];
    usage: VisionUsage;
  }> {
    const { images, abortSignal } = options;
    const startTime = Date.now();

    abortSignal?.throwIfAborted();

    const pipe = await this.loadPipeline();

    abortSignal?.throwIfAborted();

    const features: Float32Array[] = [];

    for (const image of images) {
      abortSignal?.throwIfAborted();

      const preparedImage = this.prepareImage(image);
      const output = await pipe(preparedImage as unknown as string);

      // Extract feature vector from pipeline output.
      // Output is a Tensor with shape [1, seq_len, hidden_dim] or [1, hidden_dim].
      // For models without a pooler (e.g. CLIP), we take the first token (CLS) or mean-pool.
      let featureArray: number[];
      if (output && typeof output === 'object' && 'dims' in output && 'data' in output) {
        // It's a Tensor object with dims and data properties
        const tensor = output as { dims: number[]; data: Float32Array | number[] };
        const data = tensor.data instanceof Float32Array ? Array.from(tensor.data) : tensor.data;

        if (tensor.dims.length === 3) {
          // Shape [1, seq_len, hidden_dim] — take first token (CLS) as the feature vector
          const hiddenDim = tensor.dims[2];
          featureArray = data.slice(0, hiddenDim) as number[];
        } else if (tensor.dims.length === 2) {
          // Shape [1, hidden_dim] — already pooled
          featureArray = data.slice(0, tensor.dims[1]) as number[];
        } else {
          featureArray = data as number[];
        }
      } else if (output && typeof output === 'object' && 'tolist' in output) {
        // Fallback: Tensor with tolist()
        const list = (output as { tolist: () => number[][] }).tolist();
        featureArray = Array.isArray(list[0]) ? list[0] : list as unknown as number[];
      } else if (Array.isArray(output)) {
        featureArray = (output as number[]).flat() as number[];
      } else {
        featureArray = [];
      }

      features.push(new Float32Array(featureArray));
    }

    return {
      features,
      usage: {
        durationMs: Date.now() - startTime,
      },
    };
  }
}

/**
 * Create an image feature extraction model using Transformers.js
 */
export function createImageFeatureModel(
  modelId: string,
  settings?: ModelSettings & { dimensions?: number }
): TransformersImageFeatureModel {
  return new TransformersImageFeatureModel(modelId, settings);
}

