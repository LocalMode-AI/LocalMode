/**
 * Transformers OCR Model Implementation
 *
 * Implements OCRModel interface using Transformers.js (TrOCR)
 *
 * @packageDocumentation
 */

import type {
  OCRModel,
  OCRUsage,
  TextRegion,
  ImageInput,
} from '@localmode/core';
import type { ModelSettings, TransformersDevice, ModelLoadProgress } from '../types.js';

// Dynamic import types
type ImageToTextPipeline = Awaited<
  ReturnType<typeof import('@huggingface/transformers').pipeline<'image-to-text'>>
>;

/**
 * OCR model implementation using Transformers.js (TrOCR)
 *
 * Note: TrOCR models are specialized for OCR tasks and provide better
 * accuracy than generic image-to-text models for text extraction.
 */
export class TransformersOCRModel implements OCRModel {
  readonly modelId: string;
  readonly provider = 'transformers';

  private pipeline: ImageToTextPipeline | null = null;
  private loadPromise: Promise<ImageToTextPipeline> | null = null;

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

  private async loadPipeline(): Promise<ImageToTextPipeline> {
    if (this.pipeline) {
      return this.pipeline;
    }

    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = (async () => {
      const { pipeline } = await import('@huggingface/transformers');

      // TrOCR uses image-to-text pipeline
      const pipe = await pipeline('image-to-text', this.baseModelId, {
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

  async doOCR(options: {
    images: ImageInput[];
    languages?: string[];
    detectRegions?: boolean;
    abortSignal?: AbortSignal;
    providerOptions?: Record<string, Record<string, unknown>>;
  }): Promise<{
    texts: string[];
    regions?: TextRegion[][];
    usage: OCRUsage;
  }> {
    const { images, detectRegions, abortSignal } = options;
    const startTime = Date.now();

    abortSignal?.throwIfAborted();

    const pipe = await this.loadPipeline();

    abortSignal?.throwIfAborted();

    const texts: string[] = [];
    const regions: TextRegion[][] = [];

    for (const image of images) {
      abortSignal?.throwIfAborted();

      const preparedImage = this.prepareImage(image);

      // Image-to-text pipeline returns [{ generated_text: string }]
      const output = await pipe(preparedImage as unknown as string);

      const results = Array.isArray(output) ? output : [output];
      const extractedText = results
        .map((r: { generated_text?: string }) => r.generated_text ?? '')
        .join(' ')
        .trim();

      texts.push(extractedText);

      if (detectRegions) {
        // TrOCR doesn't provide bounding boxes, so we create a single region
        regions.push([
          {
            text: extractedText,
            bbox: { x: 0, y: 0, width: 0, height: 0 }, // No bbox from TrOCR
            confidence: 0.95, // High confidence assumed
          },
        ]);
      }
    }

    return {
      texts,
      regions: detectRegions ? regions : undefined,
      usage: {
        durationMs: Date.now() - startTime,
      },
    };
  }
}

/**
 * Create an OCR model using Transformers.js (TrOCR)
 */
export function createOCRModel(
  modelId: string,
  settings?: ModelSettings
): TransformersOCRModel {
  return new TransformersOCRModel(modelId, settings);
}

