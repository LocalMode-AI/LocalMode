/**
 * MediaPipe Audio Classifier
 *
 * Implements the core `AudioClassificationModel` interface using
 * `@mediapipe/tasks-audio`'s `AudioClassifier` task (YAMNet).
 *
 * @packageDocumentation
 */

import type {
  AudioClassificationModel,
  DoClassifyAudioOptions,
  DoClassifyAudioResult,
  AudioClassificationResultItem,
} from '@localmode/core';
import { AudioError } from '@localmode/core';
import type { AudioClassifier } from '@mediapipe/tasks-audio';
import type { MediaPipeModelSettings, MediaPipeProviderSettings } from '../types.js';
import { resolveModelUrl } from '../models.js';
import { resolveWasmPath, toAudioSamples } from '../utils.js';
import { LazyMediaPipeTask } from './base.js';

/** YAMNet expects 16 kHz mono audio. */
const YAMNET_SAMPLE_RATE = 16000;

/**
 * Audio classification model backed by MediaPipe's `AudioClassifier`.
 *
 * MediaPipe classifies audio in overlapping frame windows; this implementation
 * averages category scores across all windows to produce one ranked result
 * per input clip.
 */
export class MediaPipeAudioClassifier implements AudioClassificationModel {
  readonly modelId: string;
  readonly provider = 'mediapipe';

  private readonly task: LazyMediaPipeTask<AudioClassifier>;

  constructor(
    modelId: string,
    settings: MediaPipeModelSettings = {},
    providerSettings: MediaPipeProviderSettings = {}
  ) {
    this.modelId = `mediapipe:${modelId}`;
    const modelUrl = resolveModelUrl(modelId, settings.modelPath);
    const wasmPath = resolveWasmPath('audio', providerSettings.wasmBasePath, settings.wasmBasePath);
    const delegate = settings.delegate ?? providerSettings.delegate ?? 'GPU';

    this.task = new LazyMediaPipeTask<AudioClassifier>(async () => {
      const { FilesetResolver, AudioClassifier } = await import('@mediapipe/tasks-audio');
      const fileset = await FilesetResolver.forAudioTasks(wasmPath);
      return AudioClassifier.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: modelUrl, delegate },
      });
    }, this.modelId);
  }

  async doClassify(options: DoClassifyAudioOptions): Promise<DoClassifyAudioResult> {
    const { audio, topK = 5, abortSignal } = options;
    abortSignal?.throwIfAborted();

    const classifier = await this.task.get();
    abortSignal?.throwIfAborted();

    const startTime = performance.now();
    const results: AudioClassificationResultItem[][] = [];

    try {
      for (const clip of audio) {
        abortSignal?.throwIfAborted();
        const { samples } = await toAudioSamples(clip, YAMNET_SAMPLE_RATE);
        const frameResults = classifier.classify(samples, YAMNET_SAMPLE_RATE);

        // Average category scores across all frame windows.
        const totals = new Map<string, { sum: number; count: number }>();
        for (const frame of frameResults) {
          for (const category of frame.classifications[0]?.categories ?? []) {
            const label =
              category.categoryName || category.displayName || `class_${category.index}`;
            const entry = totals.get(label) ?? { sum: 0, count: 0 };
            entry.sum += category.score;
            entry.count += 1;
            totals.set(label, entry);
          }
        }

        const frameCount = Math.max(frameResults.length, 1);
        const predictions: AudioClassificationResultItem[] = [...totals.entries()]
          .map(([label, { sum }]) => ({ label, score: sum / frameCount }))
          .sort((a, b) => b.score - a.score)
          .slice(0, topK);

        results.push(predictions);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error;
      throw new AudioError(
        `Audio classification failed: ${(error as Error)?.message ?? String(error)}`,
        {
          hint: 'Ensure the audio is a valid Blob, ArrayBuffer, or Float32Array of PCM samples.',
          cause: error instanceof Error ? error : undefined,
        }
      );
    }

    return {
      results,
      usage: { durationMs: performance.now() - startTime },
    };
  }

  /** Dispose the underlying MediaPipe task and free WASM resources. */
  close(): void {
    this.task.close();
  }
}
