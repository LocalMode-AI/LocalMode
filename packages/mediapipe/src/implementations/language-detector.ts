/**
 * MediaPipe Language Detector
 *
 * Implements the core `LanguageDetectionModel` interface using
 * `@mediapipe/tasks-text`'s `LanguageDetector` task.
 *
 * @packageDocumentation
 */

import type {
  LanguageDetectionModel,
  DoDetectLanguageOptions,
  DoDetectLanguageResult,
} from '@localmode/core';
import { TranslationError } from '@localmode/core';
import type { LanguageDetector } from '@mediapipe/tasks-text';
import type { MediaPipeModelSettings, MediaPipeProviderSettings } from '../types.js';
import { resolveModelUrl } from '../models.js';
import { resolveWasmPath } from '../utils.js';
import { LazyMediaPipeTask } from './base.js';

/**
 * Language detection model backed by MediaPipe's `LanguageDetector`.
 */
export class MediaPipeLanguageDetector implements LanguageDetectionModel {
  readonly modelId: string;
  readonly provider = 'mediapipe';

  private readonly task: LazyMediaPipeTask<LanguageDetector>;

  constructor(
    modelId: string,
    settings: MediaPipeModelSettings = {},
    providerSettings: MediaPipeProviderSettings = {}
  ) {
    this.modelId = `mediapipe:${modelId}`;
    const modelUrl = resolveModelUrl(modelId, settings.modelPath);
    const wasmPath = resolveWasmPath('text', providerSettings.wasmBasePath, settings.wasmBasePath);
    const delegate = settings.delegate ?? providerSettings.delegate ?? 'GPU';

    this.task = new LazyMediaPipeTask<LanguageDetector>(async () => {
      const { FilesetResolver, LanguageDetector } = await import('@mediapipe/tasks-text');
      const fileset = await FilesetResolver.forTextTasks(wasmPath);
      return LanguageDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: modelUrl, delegate },
      });
    }, this.modelId);
  }

  async doDetect(options: DoDetectLanguageOptions): Promise<DoDetectLanguageResult> {
    const { text, abortSignal } = options;
    abortSignal?.throwIfAborted();

    const detector = await this.task.get();
    abortSignal?.throwIfAborted();

    const startTime = performance.now();

    try {
      const raw = detector.detect(text);
      const languages = raw.languages.map((l) => ({
        languageCode: l.languageCode,
        confidence: l.probability,
      }));

      return {
        languages,
        usage: { durationMs: performance.now() - startTime },
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error;
      throw new TranslationError(
        `Language detection failed: ${(error as Error)?.message ?? String(error)}`,
        {
          hint: 'Ensure the input text is a non-empty string.',
          cause: error instanceof Error ? error : undefined,
        }
      );
    }
  }

  /** Dispose the underlying MediaPipe task and free WASM resources. */
  close(): void {
    this.task.close();
  }
}
