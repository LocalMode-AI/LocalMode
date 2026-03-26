/**
 * Transformers Depth Estimation Model Implementation
 *
 * Implements DepthEstimationModel interface using Transformers.js
 *
 * @packageDocumentation
 */

import type {
  DepthEstimationModel,
  ImageInput,
  VisionUsage,
} from '@localmode/core';
import type { ModelSettings, TransformersDevice, ModelLoadProgress } from '../types.js';

// Dynamic import types
type DepthEstimationPipeline = Awaited<
  ReturnType<typeof import('@huggingface/transformers').pipeline<'depth-estimation'>>
>;

/**
 * Depth estimation model implementation using Transformers.js
 */
export class TransformersDepthEstimationModel implements DepthEstimationModel {
  readonly modelId: string;
  readonly provider = 'transformers';

  private pipeline: DepthEstimationPipeline | null = null;
  private loadPromise: Promise<DepthEstimationPipeline> | null = null;

  constructor(
    private baseModelId: string,
    private settings: {
      device?: TransformersDevice;
      quantized?: boolean;
      onProgress?: (progress: ModelLoadProgress) => void;
    } = {}
  ) {
    this.modelId = `transformers:${baseModelId}`;
  }

  private async loadPipeline(): Promise<DepthEstimationPipeline> {
    if (this.pipeline) {
      return this.pipeline;
    }

    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');

      env.backends.onnx.logLevel = 'error';

      const pipe = await pipeline('depth-estimation', this.baseModelId, {
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

  async doEstimate(options: {
    images: ImageInput[];
    abortSignal?: AbortSignal;
    providerOptions?: Record<string, Record<string, unknown>>;
  }): Promise<{
    depthMaps: Array<Float32Array | ImageData>;
    usage: VisionUsage;
  }> {
    const { images, abortSignal } = options;
    const startTime = Date.now();

    abortSignal?.throwIfAborted();

    const pipe = await this.loadPipeline();

    abortSignal?.throwIfAborted();

    const depthMaps: Array<Float32Array | ImageData> = [];

    for (const image of images) {
      abortSignal?.throwIfAborted();

      const preparedImage = this.prepareImage(image);
      const output = await pipe(preparedImage as unknown as string);

      // Transformers.js depth-estimation returns { predicted_depth, depth }
      // predicted_depth is a Tensor, depth is a RawImage
      const result = output as Record<string, unknown>;
      const predictedDepth = result.predicted_depth as { data?: Float32Array } | undefined;

      if (predictedDepth?.data instanceof Float32Array) {
        depthMaps.push(predictedDepth.data);
      } else {
        // Fallback: try to extract from depth RawImage
        const depthImage = result.depth as { data?: Uint8Array; width?: number; height?: number } | undefined;
        if (depthImage?.data) {
          // Convert Uint8Array to Float32Array (normalized 0-1)
          const float32 = new Float32Array(depthImage.data.length);
          for (let i = 0; i < depthImage.data.length; i++) {
            float32[i] = depthImage.data[i] / 255;
          }
          depthMaps.push(float32);
        } else {
          depthMaps.push(new Float32Array(0));
        }
      }
    }

    return {
      depthMaps,
      usage: {
        durationMs: Date.now() - startTime,
      },
    };
  }
}

/**
 * Create a depth estimation model using Transformers.js
 */
export function createDepthEstimationModel(
  modelId: string,
  settings?: ModelSettings
): TransformersDepthEstimationModel {
  return new TransformersDepthEstimationModel(modelId, settings);
}
