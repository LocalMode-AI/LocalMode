/**
 * Generative OCR Model Implementation
 *
 * Implements OCRModel interface using Transformers.js
 * AutoModelForImageTextToText + AutoProcessor. Supports vision-language OCR
 * models like GLM-OCR and LightOnOCR-2 that use a chat template with
 * image + text prompt for document-level text extraction.
 *
 * @packageDocumentation
 */

import type {
  OCRModel,
  OCRUsage,
  TextRegion,
  ImageInput,
} from '@localmode/core';
import { ModelLoadError } from '@localmode/core';
import type { ModelSettings, TransformersDevice, ModelLoadProgress } from '../types.js';

const DEFAULT_PROMPT = 'Text Recognition:';

/**
 * Loaded model state for generative OCR.
 */
interface LoadedGenerativeOCR {
  model: { generate: (options: Record<string, unknown>) => Promise<unknown> };
  processor: {
    apply_chat_template: (messages: unknown[], options: Record<string, unknown>) => string;
    (text: string, ...args: unknown[]): Promise<Record<string, unknown>>;
    tokenizer: { decode: (ids: unknown, options?: Record<string, unknown>) => string };
    batch_decode: (ids: unknown, options?: Record<string, unknown>) => string[];
  };
}

/**
 * Detect if a model ID refers to a GLM-OCR model.
 */
export function isGlmOcrModel(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  return lower.includes('glm-ocr') || lower.includes('glm_ocr') || lower.includes('glmocr');
}

/**
 * Detect if a model ID refers to a LightOnOCR model.
 */
export function isLightOnOCRModel(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  return lower.includes('lightonocr') || lower.includes('lighton-ocr') || lower.includes('lighton_ocr');
}

/**
 * Detect if a model ID refers to a generative OCR model (GLM-OCR or LightOnOCR).
 */
export function isGenerativeOCRModel(modelId: string): boolean {
  return isGlmOcrModel(modelId) || isLightOnOCRModel(modelId);
}

/**
 * Generative OCR model using TJS v4 AutoModelForImageTextToText.
 *
 * Supports prompt-based OCR modes:
 * - `"Text Recognition:"` — plain text extraction (default)
 * - `"Table Recognition:"` — table structure
 * - `"Formula Recognition:"` — LaTeX/math notation
 *
 * @example
 * ```ts
 * import { extractText } from '@localmode/core';
 * import { transformers } from '@localmode/transformers';
 *
 * const { text } = await extractText({
 *   model: transformers.ocr('onnx-community/GLM-OCR-ONNX'),
 *   image: documentImage,
 *   prompt: 'Table Recognition:',
 * });
 * ```
 */
export class TransformersGenerativeOCRModel implements OCRModel {
  readonly modelId: string;
  readonly provider = 'transformers';

  private loaded: LoadedGenerativeOCR | null = null;
  private loadPromise: Promise<LoadedGenerativeOCR> | null = null;

  constructor(
    private baseModelId: string,
    private settings: {
      device?: TransformersDevice;
      dtype?: string | Record<string, string>;
      onProgress?: (progress: ModelLoadProgress) => void;
    } = {}
  ) {
    this.modelId = `transformers:${baseModelId}`;
  }

  private getDevice(): string {
    if (this.settings.device) return this.settings.device;
    const hasWebGPU =
      typeof navigator !== 'undefined' &&
      'gpu' in navigator &&
      navigator.gpu !== undefined;
    return hasWebGPU ? 'webgpu' : 'wasm';
  }

  private async load(): Promise<LoadedGenerativeOCR> {
    if (this.loaded) return this.loaded;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = (async () => {
      try {
        const tjs = await import('@huggingface/transformers');
        tjs.env.backends.onnx.logLevel = 'error';

        const device = this.getDevice();
        const dtype = this.settings.dtype ?? {
          embed_tokens: 'q4',
          vision_encoder: 'fp16',
          decoder_model_merged: 'q4',
        };

        const [processor, model] = await Promise.all([
          tjs.AutoProcessor.from_pretrained(this.baseModelId, {
            progress_callback: this.settings.onProgress,
          } as Record<string, unknown>),
          (tjs as Record<string, unknown>).AutoModelForImageTextToText
            ? (tjs as { AutoModelForImageTextToText: { from_pretrained: Function } })
                .AutoModelForImageTextToText.from_pretrained(this.baseModelId, {
                  dtype,
                  device,
                  progress_callback: this.settings.onProgress,
                } as Record<string, unknown>)
            : tjs.AutoModelForCausalLM.from_pretrained(this.baseModelId, {
                dtype,
                device,
                progress_callback: this.settings.onProgress,
              } as Record<string, unknown>),
        ]);

        const result: LoadedGenerativeOCR = {
          model: model as LoadedGenerativeOCR['model'],
          processor: processor as LoadedGenerativeOCR['processor'],
        };
        this.loaded = result;
        return result;
      } catch (error) {
        this.loadPromise = null;
        if (error instanceof DOMException && error.name === 'AbortError') throw error;
        if (error instanceof ModelLoadError) throw error;
        const cause = error instanceof Error ? error : undefined;
        throw new ModelLoadError(this.baseModelId, cause);
      }
    })();

    return this.loadPromise;
  }

  private async prepareImage(image: ImageInput): Promise<unknown> {
    const tjs = await import('@huggingface/transformers');

    if (typeof image === 'string') {
      return tjs.RawImage.read(image);
    }
    if (image instanceof Blob) {
      const url = URL.createObjectURL(image);
      try {
        return await tjs.RawImage.read(url);
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    if (image instanceof ArrayBuffer) {
      const blob = new Blob([image], { type: 'image/png' });
      const url = URL.createObjectURL(blob);
      try {
        return await tjs.RawImage.read(url);
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    // ImageData — convert to blob then read
    if (typeof ImageData !== 'undefined' && image instanceof ImageData) {
      const canvas = new OffscreenCanvas(image.width, image.height);
      const ctx = canvas.getContext('2d')!;
      ctx.putImageData(image, 0, 0);
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      const url = URL.createObjectURL(blob);
      try {
        return await tjs.RawImage.read(url);
      } finally {
        URL.revokeObjectURL(url);
      }
    }

    return tjs.RawImage.read(image as unknown as string);
  }

  async doOCR(options: {
    images: ImageInput[];
    languages?: string[];
    detectRegions?: boolean;
    prompt?: string;
    abortSignal?: AbortSignal;
    providerOptions?: Record<string, Record<string, unknown>>;
  }): Promise<{
    texts: string[];
    regions?: TextRegion[][];
    usage: OCRUsage;
  }> {
    const { images, detectRegions, prompt = DEFAULT_PROMPT, abortSignal } = options;
    const startTime = Date.now();

    abortSignal?.throwIfAborted();

    const { model, processor } = await this.load();

    abortSignal?.throwIfAborted();

    const texts: string[] = [];
    const regions: TextRegion[][] = [];

    for (const image of images) {
      abortSignal?.throwIfAborted();

      const rawImage = await this.prepareImage(image);

      const messages = [
        {
          role: 'user',
          content: [
            { type: 'image' },
            { type: 'text', text: prompt },
          ],
        },
      ];

      const text = processor.apply_chat_template(messages, {
        add_generation_prompt: true,
      });

      const inputs = await (processor as Function)(text, rawImage, null, {
        add_special_tokens: false,
      }) as Record<string, unknown>;

      abortSignal?.throwIfAborted();

      const inputIds = inputs.input_ids as { dims?: number[] };
      const inputTokenCount = inputIds?.dims?.[1] ?? 0;

      const output = await model.generate({
        ...inputs,
        max_new_tokens: 8192,
        do_sample: false,
      });

      const outputArray = output as { tolist: () => number[][] };
      const allIds = outputArray.tolist ? outputArray.tolist() : [[]];
      const generatedIds = inputTokenCount > 0
        ? allIds.map((seq: number[]) => seq.slice(inputTokenCount))
        : allIds;

      const decoded = processor.batch_decode(generatedIds, { skip_special_tokens: true });
      const extractedText = (Array.isArray(decoded) ? decoded[0] : String(decoded)).trim();

      texts.push(extractedText);

      if (detectRegions) {
        regions.push([
          {
            text: extractedText,
            bbox: { x: 0, y: 0, width: 0, height: 0 },
            confidence: 0.95,
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
 * Create a generative OCR model using TJS v4.
 *
 * @param modelId - HuggingFace model ID (e.g., 'onnx-community/GLM-OCR-ONNX')
 * @param settings - Model settings (device, dtype, onProgress)
 */
export function createGenerativeOCRModel(
  modelId: string,
  settings?: ModelSettings
): TransformersGenerativeOCRModel {
  return new TransformersGenerativeOCRModel(modelId, settings);
}
