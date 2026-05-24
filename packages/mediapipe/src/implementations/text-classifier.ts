/**
 * MediaPipe Text Classifier
 *
 * Implements the core `ClassificationModel` interface using
 * `@mediapipe/tasks-text`'s `TextClassifier` task.
 *
 * MediaPipe ships no general-purpose text classifier — a custom-trained
 * `.tflite` model (built with MediaPipe Model Maker) is required.
 *
 * @packageDocumentation
 */

import type {
  ClassificationModel,
  DoClassifyOptions,
  DoClassifyResult,
  ClassificationResultItem,
} from '@localmode/core';
import { ValidationError } from '@localmode/core';
import type { TextClassifier } from '@mediapipe/tasks-text';
import type { MediaPipeModelSettings, MediaPipeProviderSettings } from '../types.js';
import { resolveWasmPath } from '../utils.js';
import { LazyMediaPipeTask } from './base.js';

/**
 * Text classification model backed by MediaPipe's `TextClassifier`.
 *
 * Requires an explicit custom-trained model path — MediaPipe does not host a
 * default general-purpose text classifier.
 */
export class MediaPipeTextClassifier implements ClassificationModel {
  readonly modelId: string;
  readonly provider = 'mediapipe';
  /** Labels are model-defined and not known until inference returns them. */
  readonly labels: string[] = [];

  private readonly task: LazyMediaPipeTask<TextClassifier>;

  constructor(
    modelPath: string,
    settings: MediaPipeModelSettings = {},
    providerSettings: MediaPipeProviderSettings = {}
  ) {
    if (!modelPath) {
      throw new ValidationError(
        'MediaPipe text classification requires a custom-trained model.',
        'MediaPipe ships no default text classifier. Train one with MediaPipe Model Maker and pass its .tflite URL: mediapipe.textClassifier("https://your-cdn/model.tflite").'
      );
    }

    this.modelId = `mediapipe:text-classifier`;
    const wasmPath = resolveWasmPath('text', providerSettings.wasmBasePath, settings.wasmBasePath);
    const delegate = settings.delegate ?? providerSettings.delegate ?? 'GPU';

    this.task = new LazyMediaPipeTask<TextClassifier>(async () => {
      const { FilesetResolver, TextClassifier } = await import('@mediapipe/tasks-text');
      const fileset = await FilesetResolver.forTextTasks(wasmPath);
      return TextClassifier.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: modelPath, delegate },
      });
    }, this.modelId);
  }

  async doClassify(options: DoClassifyOptions): Promise<DoClassifyResult> {
    const { texts, abortSignal } = options;
    abortSignal?.throwIfAborted();

    const classifier = await this.task.get();
    abortSignal?.throwIfAborted();

    const startTime = performance.now();
    const results: ClassificationResultItem[] = [];

    try {
      for (const text of texts) {
        abortSignal?.throwIfAborted();
        const raw = classifier.classify(text);
        const categories = raw.classifications[0]?.categories ?? [];
        const sorted = [...categories].sort((a, b) => b.score - a.score);
        const top = sorted[0];
        const allScores: Record<string, number> = {};
        for (const c of categories) {
          allScores[c.categoryName || c.displayName || `class_${c.index}`] = c.score;
        }
        results.push({
          label: top?.categoryName || top?.displayName || 'unknown',
          score: top?.score ?? 0,
          allScores,
        });
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error;
      throw error;
    }

    return {
      results,
      usage: { inputTokens: 0, durationMs: performance.now() - startTime },
    };
  }

  /** Dispose the underlying MediaPipe task and free WASM resources. */
  close(): void {
    this.task.close();
  }
}
