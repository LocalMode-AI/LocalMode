/**
 * Speech-to-Text Functions
 *
 * Core transcribe() function for audio transcription.
 * This function accepts SpeechToTextModel interface - implementations come from provider packages.
 *
 * @packageDocumentation
 */

import type { SpeechToTextModel, TranscribeOptions, TranscribeResult } from './types.js';

// Global provider registry for string model ID resolution
let globalSTTRegistry: GlobalSTTRegistry | null = null;

interface GlobalSTTRegistry {
  resolve(id: string): SpeechToTextModel;
}

/**
 * Set the global speech-to-text provider registry for string model ID resolution.
 * Call this once at app initialization.
 *
 * @example
 * ```ts
 * import { setGlobalSTTProvider } from '@localmode/core';
 * import { transformers } from '@localmode/transformers';
 *
 * setGlobalSTTProvider({
 *   transformers,
 * });
 *
 * // Now string model IDs work
 * const { text } = await transcribe({
 *   model: 'transformers:Xenova/whisper-tiny',
 *   audio: audioBlob,
 * });
 * ```
 */
export function setGlobalSTTProvider(
  providers: Record<string, { speechToText: (modelId: string) => SpeechToTextModel }>,
  options?: { separator?: string }
): void {
  const separator = options?.separator ?? ':';

  globalSTTRegistry = {
    resolve(id: string): SpeechToTextModel {
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

      return provider.speechToText(modelId);
    },
  };
}

/**
 * Resolve a speech-to-text model from string ID or return the model object as-is.
 */
function resolveSTTModel(modelOrId: SpeechToTextModel | string): SpeechToTextModel {
  if (typeof modelOrId !== 'string') {
    return modelOrId;
  }

  if (!globalSTTRegistry) {
    throw new Error(
      'No global provider configured. Call setGlobalSTTProvider() first, or pass a model object instead of a string.'
    );
  }

  return globalSTTRegistry.resolve(modelOrId);
}

/**
 * Transcribe audio to text using a speech-to-text model.
 *
 * This function supports Whisper and other ASR (Automatic Speech Recognition) models.
 * It can optionally return word-level or segment-level timestamps.
 *
 * This function is in @localmode/core - model implementations are in provider packages.
 *
 * @param options - Transcription options
 * @returns Promise with text, segments (if requested), usage, and response information
 *
 * @example Basic usage
 * ```ts
 * import { transcribe } from '@localmode/core';
 * import { transformers } from '@localmode/transformers';
 *
 * const { text, usage } = await transcribe({
 *   model: transformers.speechToText('Xenova/whisper-tiny'),
 *   audio: audioBlob,
 * });
 *
 * console.log(text); // "Hello, world!"
 * console.log(usage.audioDurationSec); // 3.5
 * ```
 *
 * @example With timestamps
 * ```ts
 * const { text, segments } = await transcribe({
 *   model: transformers.speechToText('Xenova/whisper-small'),
 *   audio: audioBlob,
 *   returnTimestamps: true,
 * });
 *
 * segments?.forEach(seg => {
 *   console.log(`[${seg.start}s - ${seg.end}s] ${seg.text}`);
 * });
 * ```
 *
 * @example With language specification
 * ```ts
 * const { text, language } = await transcribe({
 *   model: transformers.speechToText('Xenova/whisper-small'),
 *   audio: germanAudioBlob,
 *   language: 'de', // German
 * });
 *
 * console.log(text);     // German transcription
 * console.log(language); // "de"
 * ```
 *
 * @example Translation mode (translate to English)
 * ```ts
 * const { text } = await transcribe({
 *   model: transformers.speechToText('Xenova/whisper-small'),
 *   audio: frenchAudioBlob,
 *   task: 'translate', // Translates to English
 * });
 *
 * console.log(text); // English translation
 * ```
 *
 * @example With string model ID (requires global provider setup)
 * ```ts
 * const { text } = await transcribe({
 *   model: 'transformers:Xenova/whisper-tiny',
 *   audio: audioBlob,
 * });
 * ```
 *
 * @example With AbortSignal for cancellation
 * ```ts
 * const controller = new AbortController();
 * setTimeout(() => controller.abort(), 30000); // 30s timeout
 *
 * const { text } = await transcribe({
 *   model: transformers.speechToText('Xenova/whisper-small'),
 *   audio: longAudioBlob,
 *   abortSignal: controller.signal,
 * });
 * ```
 *
 * @throws {Error} If transcription fails after all retries
 * @throws {Error} If aborted via AbortSignal
 */
export async function transcribe(options: TranscribeOptions): Promise<TranscribeResult> {
  const {
    model: modelOrId,
    audio,
    language,
    task,
    returnTimestamps,
    abortSignal,
    maxRetries = 2,
    headers,
    providerOptions,
  } = options;

  // Resolve string model ID to model object
  const model = resolveSTTModel(modelOrId);

  // Check for cancellation before starting
  abortSignal?.throwIfAborted();

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Check before each retry
    abortSignal?.throwIfAborted();

    try {
      const result = await model.doTranscribe({
        audio,
        language,
        task,
        returnTimestamps,
        abortSignal,
        headers,
        providerOptions,
      });

      return {
        text: result.text,
        segments: result.segments,
        language: result.language,
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
        throw new Error('Transcription was cancelled', { cause: lastError });
      }

      // Don't retry on the last attempt
      if (attempt === maxRetries) {
        break;
      }
    }
  }

  throw new Error(`Transcription failed after ${maxRetries + 1} attempts`, {
    cause: lastError,
  });
}
