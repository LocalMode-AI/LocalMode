/**
 * Transformers Object Detection Model Implementation
 *
 * Implements ObjectDetectionModel interface using Transformers.js
 *
 * @packageDocumentation
 */

import type {
  ObjectDetectionModel,
  ImageInput,
  VisionUsage,
  DetectedObject,
} from '@localmode/core';
import type { ModelSettings, TransformersDevice, ModelLoadProgress } from '../types.js';

// Dynamic import types
type ObjectDetectionPipeline = Awaited<
  ReturnType<typeof import('@huggingface/transformers').pipeline<'object-detection'>>
>;

/**
 * Object detection model implementation using Transformers.js
 */
export class TransformersObjectDetectionModel implements ObjectDetectionModel {
  readonly modelId: string;
  readonly provider = 'transformers';

  private pipeline: ObjectDetectionPipeline | null = null;
  private loadPromise: Promise<ObjectDetectionPipeline> | null = null;

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

  private async loadPipeline(): Promise<ObjectDetectionPipeline> {
    if (this.pipeline) {
      return this.pipeline;
    }

    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = (async () => {
      const { pipeline } = await import('@huggingface/transformers');

      const pipe = await pipeline('object-detection', this.baseModelId, {
        device: this.settings.device ?? 'auto',
        dtype: this.settings.quantized !== false ? 'q8' : 'fp32',
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

  async doDetect(options: {
    images: ImageInput[];
    threshold?: number;
    abortSignal?: AbortSignal;
    providerOptions?: Record<string, Record<string, unknown>>;
  }): Promise<{
    results: Array<{ objects: DetectedObject[] }>;
    usage: VisionUsage;
  }> {
    const { images, threshold = 0.5, abortSignal } = options;
    const startTime = Date.now();

    abortSignal?.throwIfAborted();

    const pipe = await this.loadPipeline();

    abortSignal?.throwIfAborted();

    const results: Array<{ objects: DetectedObject[] }> = [];

    for (const image of images) {
      abortSignal?.throwIfAborted();

      const preparedImage = this.prepareImage(image);
      const output = await pipe(preparedImage as unknown as string, { threshold });

      // Output is array of { label, score, box: { xmin, ymin, xmax, ymax } }
      const detections = (Array.isArray(output) ? output : [output]) as Array<Record<string, unknown>>;

      const objects: DetectedObject[] = detections.map((det) => {
        const box = det.box as { xmin: number; ymin: number; xmax: number; ymax: number } | undefined;
        return {
          label: String(det.label ?? 'unknown'),
          score: Number(det.score ?? 0),
          box: box
            ? {
                x: box.xmin,
                y: box.ymin,
                width: box.xmax - box.xmin,
                height: box.ymax - box.ymin,
              }
            : { x: 0, y: 0, width: 0, height: 0 },
        };
      });

      results.push({ objects });
    }

    return {
      results,
      usage: {
        durationMs: Date.now() - startTime,
      },
    };
  }
}

/**
 * Create an object detection model using Transformers.js
 */
export function createObjectDetectionModel(
  modelId: string,
  settings?: ModelSettings
): TransformersObjectDetectionModel {
  return new TransformersObjectDetectionModel(modelId, settings);
}

