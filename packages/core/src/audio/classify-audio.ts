/**
 * Audio Classification Functions
 *
 * Core classifyAudio() and classifyAudioZeroShot() functions.
 * These functions accept AudioClassificationModel interface - implementations come from provider packages.
 *
 * @packageDocumentation
 */

import type {
  AudioClassificationModel,
  ZeroShotAudioClassificationModel,
  ClassifyAudioOptions,
  ClassifyAudioResult,
  ClassifyAudioZeroShotOptions,
  ClassifyAudioZeroShotResult,
} from './types.js';

// Global provider registry for string model ID resolution
let globalAudioClassificationRegistry: GlobalAudioClassificationRegistry | null = null;

interface GlobalAudioClassificationRegistry {
  resolveClassifier(id: string): AudioClassificationModel;
  resolveZeroShot(id: string): ZeroShotAudioClassificationModel;
}

/**
 * Set the global audio classification provider registry for string model ID resolution.
 * Call this once at app initialization.
 *
 * @example
 * ```ts
 * import { setGlobalAudioClassificationProvider } from '@localmode/core';
 * import { transformers } from '@localmode/transformers';
 *
 * setGlobalAudioClassificationProvider({
 *   transformers,
 * });
 *
 * // Now string model IDs work
 * const { predictions } = await classifyAudio({
 *   model: 'transformers:Xenova/wav2vec2-large-xlsr-53-gender-recognition-librispeech',
 *   audio: audioBlob,
 * });
 * ```
 */
export function setGlobalAudioClassificationProvider(
  providers: Record<
    string,
    {
      audioClassifier: (modelId: string) => AudioClassificationModel;
      zeroShotAudioClassifier: (modelId: string) => ZeroShotAudioClassificationModel;
    }
  >,
  options?: { separator?: string }
): void {
  const separator = options?.separator ?? ':';

  globalAudioClassificationRegistry = {
    resolveClassifier(id: string): AudioClassificationModel {
      const sepIndex = id.indexOf(separator);
      if (sepIndex === -1) {
        throw new Error(
          `Invalid model ID format: "${id}". Expected "provider${separator}modelId" format.`
        );
      }

      const providerName = id.slice(0, sepIndex);
      const modelId = id.slice(sepIndex + 1);

      const provider = providers[providerName];
      if (!provider) {
        throw new Error(
          `Unknown provider: "${providerName}". Available providers: ${Object.keys(providers).join(', ')}`
        );
      }

      return provider.audioClassifier(modelId);
    },

    resolveZeroShot(id: string): ZeroShotAudioClassificationModel {
      const sepIndex = id.indexOf(separator);
      if (sepIndex === -1) {
        throw new Error(
          `Invalid model ID format: "${id}". Expected "provider${separator}modelId" format.`
        );
      }

      const providerName = id.slice(0, sepIndex);
      const modelId = id.slice(sepIndex + 1);

      const provider = providers[providerName];
      if (!provider) {
        throw new Error(
          `Unknown provider: "${providerName}". Available providers: ${Object.keys(providers).join(', ')}`
        );
      }

      return provider.zeroShotAudioClassifier(modelId);
    },
  };
}

/**
 * Resolve an audio classification model from string ID or return the model object as-is.
 */
function resolveAudioClassificationModel(
  modelOrId: AudioClassificationModel | string
): AudioClassificationModel {
  if (typeof modelOrId !== 'string') {
    return modelOrId;
  }

  if (!globalAudioClassificationRegistry) {
    throw new Error(
      'No global provider configured. Call setGlobalAudioClassificationProvider() first, or pass a model object instead of a string.'
    );
  }

  return globalAudioClassificationRegistry.resolveClassifier(modelOrId);
}

/**
 * Resolve a zero-shot audio classification model from string ID or return the model object as-is.
 */
function resolveZeroShotAudioModel(
  modelOrId: ZeroShotAudioClassificationModel | string
): ZeroShotAudioClassificationModel {
  if (typeof modelOrId !== 'string') {
    return modelOrId;
  }

  if (!globalAudioClassificationRegistry) {
    throw new Error(
      'No global provider configured. Call setGlobalAudioClassificationProvider() first, or pass a model object instead of a string.'
    );
  }

  return globalAudioClassificationRegistry.resolveZeroShot(modelOrId);
}

/**
 * Classify audio using the specified model.
 *
 * This function uses pre-trained audio classification models to identify
 * sounds, music genres, emotions, or other audio characteristics.
 *
 * This function is in @localmode/core - model implementations are in provider packages.
 *
 * @param options - Classification options
 * @returns Promise with predictions, usage, and response information
 *
 * @example Basic usage
 * ```ts
 * import { classifyAudio } from '@localmode/core';
 * import { transformers } from '@localmode/transformers';
 *
 * const { predictions, usage } = await classifyAudio({
 *   model: transformers.audioClassifier('Xenova/wav2vec2-large-xlsr-53-gender-recognition-librispeech'),
 *   audio: audioBlob,
 *   topK: 5,
 * });
 *
 * predictions.forEach(p => {
 *   console.log(`${p.label}: ${(p.score * 100).toFixed(1)}%`);
 * });
 * ```
 *
 * @example With AbortSignal
 * ```ts
 * const controller = new AbortController();
 * setTimeout(() => controller.abort(), 5000);
 *
 * const { predictions } = await classifyAudio({
 *   model: transformers.audioClassifier('Xenova/wav2vec2-large-xlsr-53-gender-recognition-librispeech'),
 *   audio: audioBlob,
 *   abortSignal: controller.signal,
 * });
 * ```
 *
 * @throws {Error} If classification fails after all retries
 * @throws {Error} If aborted via AbortSignal
 *
 * @see {@link classifyAudioZeroShot} for zero-shot audio classification
 */
export async function classifyAudio(
  options: ClassifyAudioOptions
): Promise<ClassifyAudioResult> {
  const {
    model: modelOrId,
    audio,
    topK = 5,
    abortSignal,
    maxRetries = 2,
    providerOptions,
  } = options;

  // Resolve string model ID to model object
  const model = resolveAudioClassificationModel(modelOrId);

  // Check for cancellation before starting
  abortSignal?.throwIfAborted();

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Check before each retry
    abortSignal?.throwIfAborted();

    try {
      const result = await model.doClassify({
        audio: [audio],
        topK,
        abortSignal,
        providerOptions,
      });

      return {
        predictions: result.results[0],
        usage: result.usage,
        response: {
          modelId: model.modelId,
          timestamp: new Date(),
        },
      };
    } catch (error) {
      lastError = error as Error;

      // Don't retry if aborted
      if (abortSignal?.aborted) {
        throw new Error('Audio classification was cancelled', { cause: lastError });
      }

      // Don't retry on the last attempt
      if (attempt === maxRetries) {
        break;
      }
    }
  }

  throw new Error(`Audio classification failed after ${maxRetries + 1} attempts`, {
    cause: lastError,
  });
}

/**
 * Classify audio into arbitrary labels using zero-shot classification.
 *
 * Zero-shot audio classification (e.g., using CLAP) allows you to classify audio
 * into any set of labels without fine-tuning the model.
 *
 * @param options - Zero-shot classification options
 * @returns Promise with labels, scores, usage, and response information
 *
 * @example Basic usage
 * ```ts
 * import { classifyAudioZeroShot } from '@localmode/core';
 * import { transformers } from '@localmode/transformers';
 *
 * const { labels, scores } = await classifyAudioZeroShot({
 *   model: transformers.zeroShotAudioClassifier('Xenova/clap-htsat-unfused'),
 *   audio: audioBlob,
 *   candidateLabels: ['music', 'speech', 'noise'],
 * });
 *
 * console.log(`Top prediction: ${labels[0]} (${(scores[0] * 100).toFixed(1)}%)`);
 * ```
 *
 * @see {@link classifyAudio} for standard audio classification with fixed labels
 */
export async function classifyAudioZeroShot(
  options: ClassifyAudioZeroShotOptions
): Promise<ClassifyAudioZeroShotResult> {
  const {
    model: modelOrId,
    audio,
    candidateLabels,
    abortSignal,
    maxRetries = 2,
    providerOptions,
  } = options;

  // Resolve string model ID to model object
  const model = resolveZeroShotAudioModel(modelOrId);

  // Check for cancellation before starting
  abortSignal?.throwIfAborted();

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Check before each retry
    abortSignal?.throwIfAborted();

    try {
      const result = await model.doClassifyZeroShot({
        audio: [audio],
        candidateLabels,
        abortSignal,
        providerOptions,
      });

      const item = result.results[0];

      return {
        labels: item.labels,
        scores: item.scores,
        usage: result.usage,
        response: {
          modelId: model.modelId,
          timestamp: new Date(),
        },
      };
    } catch (error) {
      lastError = error as Error;

      // Don't retry if aborted
      if (abortSignal?.aborted) {
        throw new Error('Zero-shot audio classification was cancelled', { cause: lastError });
      }

      // Don't retry on the last attempt
      if (attempt === maxRetries) {
        break;
      }
    }
  }

  throw new Error(`Zero-shot audio classification failed after ${maxRetries + 1} attempts`, {
    cause: lastError,
  });
}
