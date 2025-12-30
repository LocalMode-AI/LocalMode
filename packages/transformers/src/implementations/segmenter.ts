/**
 * Transformers Image Segmentation Model Implementation
 *
 * Implements SegmentationModel interface using Transformers.js
 *
 * @packageDocumentation
 */

import type {
  SegmentationModel,
  ImageInput,
  VisionUsage,
  SegmentMask,
} from '@localmode/core';
import type { ModelSettings, TransformersDevice, ModelLoadProgress } from '../types.js';

// Dynamic import types
type SegmentationPipeline = Awaited<
  ReturnType<typeof import('@huggingface/transformers').pipeline<'image-segmentation'>>
>;

/**
 * Image segmentation model implementation using Transformers.js
 */
export class TransformersSegmentationModel implements SegmentationModel {
  readonly modelId: string;
  readonly provider = 'transformers';
  readonly segmentationType: 'semantic' | 'instance' | 'panoptic' = 'semantic';

  private pipeline: SegmentationPipeline | null = null;
  private loadPromise: Promise<SegmentationPipeline> | null = null;

  constructor(
    private baseModelId: string,
    private settings: {
      device?: TransformersDevice;
      quantized?: boolean;
      segmentationType?: 'semantic' | 'instance' | 'panoptic';
      onProgress?: (progress: ModelLoadProgress) => void;
    } = {}
  ) {
    this.modelId = `transformers:${baseModelId}`;
    if (settings.segmentationType) {
      (this as { segmentationType: string }).segmentationType = settings.segmentationType;
    }
  }

  private async loadPipeline(): Promise<SegmentationPipeline> {
    if (this.pipeline) {
      return this.pipeline;
    }

    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = (async () => {
      const { pipeline } = await import('@huggingface/transformers');

      const pipe = await pipeline('image-segmentation', this.baseModelId, {
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

  async doSegment(options: {
    images: ImageInput[];
    threshold?: number;
    abortSignal?: AbortSignal;
    providerOptions?: Record<string, Record<string, unknown>>;
  }): Promise<{
    results: Array<{ masks: SegmentMask[] }>;
    usage: VisionUsage;
  }> {
    const { images, threshold = 0.5, abortSignal } = options;
    const startTime = Date.now();

    abortSignal?.throwIfAborted();

    const pipe = await this.loadPipeline();

    abortSignal?.throwIfAborted();

    const results: Array<{ masks: SegmentMask[] }> = [];

    for (const image of images) {
      abortSignal?.throwIfAborted();

      const preparedImage = this.prepareImage(image);
      const output = await pipe(preparedImage as unknown as string, { threshold });

      // Output is array of { label, score, mask (RawImage) }
      const segments = Array.isArray(output) ? output : [output];

      const masks: SegmentMask[] = segments.map((seg: Record<string, unknown>) => {
        // The mask is a RawImage, convert to Uint8Array
        const maskData = (seg.mask as { data?: Uint8Array })?.data ?? new Uint8Array(0);
        return {
          label: String(seg.label ?? 'unknown'),
          score: Number(seg.score ?? 0),
          mask: maskData,
        };
      });

      results.push({ masks });
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
 * Create an image segmentation model using Transformers.js
 */
export function createSegmentationModel(
  modelId: string,
  settings?: ModelSettings & { segmentationType?: 'semantic' | 'instance' | 'panoptic' }
): TransformersSegmentationModel {
  return new TransformersSegmentationModel(modelId, settings);
}

