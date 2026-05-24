/**
 * Streaming Text-to-Speech
 *
 * Async-iterable wrapper around any `TextToSpeechModel` that splits input
 * text into clauses and yields each clause's audio as soon as it is
 * synthesized. Used by real-time voice loops (e.g. LLM-driven assistants)
 * that need first audio to start playing while the rest of the response
 * is still being rendered.
 *
 * @packageDocumentation
 */

import type {
  StreamSynthesizeSpeechOptions,
  SynthesizedClause,
} from './types.js';
import { resolveTTSModel } from './tts-provider.js';
import { splitIntoClauses } from './clause-splitter.js';

/**
 * Decode a 16-bit PCM mono WAV `Blob` (RIFF/WAVE) into a `Float32Array`
 * of samples in `[-1, 1]` and report the file's sample rate.
 *
 * Supports the single subset every LocalMode TTS provider currently emits:
 * 1-channel, 16-bit signed little-endian PCM. Unsupported channel counts
 * or bit depths throw a descriptive error.
 *
 * If the input is NOT a RIFF/WAVE container (e.g. a future provider that
 * emits raw `Float32Array` bytes via `Blob`), the decoder falls back to
 * interpreting the buffer as raw `Float32Array` data and the caller's
 * provider-reported `sampleRate` is preserved (passed through by
 * `streamSynthesizeSpeech()` itself).
 */
async function decodePcm16Wav(
  blob: Blob,
  fallbackSampleRate: number
): Promise<{ samples: Float32Array; sampleRate: number }> {
  const buffer = await blob.arrayBuffer();
  const view = new DataView(buffer);

  // Check RIFF/WAVE magic bytes.
  if (buffer.byteLength < 44) {
    return decodeRawFloat32(buffer, fallbackSampleRate);
  }
  const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  const wave = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
  if (riff !== 'RIFF' || wave !== 'WAVE') {
    return decodeRawFloat32(buffer, fallbackSampleRate);
  }

  // Walk chunks to locate `fmt ` and `data`.
  let fmtChunkOffset = -1;
  let dataChunkOffset = -1;
  let dataChunkSize = 0;
  let cursor = 12;
  while (cursor + 8 <= buffer.byteLength) {
    const id = String.fromCharCode(
      view.getUint8(cursor),
      view.getUint8(cursor + 1),
      view.getUint8(cursor + 2),
      view.getUint8(cursor + 3)
    );
    const size = view.getUint32(cursor + 4, true);
    if (id === 'fmt ') {
      fmtChunkOffset = cursor + 8;
    } else if (id === 'data') {
      dataChunkOffset = cursor + 8;
      dataChunkSize = size;
      break;
    }
    cursor += 8 + size + (size % 2); // chunks are 2-byte aligned
  }

  if (fmtChunkOffset < 0 || dataChunkOffset < 0) {
    throw new Error(
      'streamSynthesizeSpeech: could not parse WAV blob (missing `fmt ` or `data` chunk).'
    );
  }

  const audioFormat = view.getUint16(fmtChunkOffset + 0, true);
  const numChannels = view.getUint16(fmtChunkOffset + 2, true);
  const sampleRate = view.getUint32(fmtChunkOffset + 4, true);
  const bitsPerSample = view.getUint16(fmtChunkOffset + 14, true);

  if (audioFormat !== 1) {
    throw new Error(
      `streamSynthesizeSpeech: only PCM (audioFormat=1) WAV is supported, got audioFormat=${audioFormat}.`
    );
  }
  if (numChannels !== 1) {
    throw new Error(
      `streamSynthesizeSpeech: only mono (1-channel) WAV is supported, got numChannels=${numChannels}.`
    );
  }
  if (bitsPerSample !== 16) {
    throw new Error(
      `streamSynthesizeSpeech: only 16-bit PCM WAV is supported, got bitsPerSample=${bitsPerSample}.`
    );
  }

  const sampleCount = dataChunkSize / 2;
  const samples = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const int16 = view.getInt16(dataChunkOffset + i * 2, true);
    samples[i] = int16 < 0 ? int16 / 0x8000 : int16 / 0x7fff;
  }

  return { samples, sampleRate };
}

/**
 * Fallback decode path for blobs that are NOT a RIFF/WAVE container —
 * interpret the buffer as raw `Float32Array` little-endian samples.
 */
function decodeRawFloat32(
  buffer: ArrayBuffer,
  sampleRate: number
): { samples: Float32Array; sampleRate: number } {
  if (buffer.byteLength % 4 !== 0) {
    throw new Error(
      `streamSynthesizeSpeech: cannot decode audio Blob — not a WAV container and ` +
        `byte length (${buffer.byteLength}) is not a multiple of 4 (expected raw Float32Array).`
    );
  }
  const samples = new Float32Array(buffer.slice(0));
  return { samples, sampleRate };
}

/**
 * Stream speech synthesis as an async-iterable of clauses.
 *
 * Splits `text` into clauses with {@link splitIntoClauses} (tunable via
 * `splitOptions`) then iterates them sequentially: clause `n+1`'s
 * `doSynthesize()` is started only after clause `n` has been yielded and
 * the consumer has resumed iteration. Each yielded item carries the
 * decoded mono PCM samples as a `Float32Array`, the clause text, the
 * provider-reported sample rate, and a zero-based `clauseIndex`.
 *
 * The same `voice`, `speed`, `pitch`, and `providerOptions` are passed
 * to every clause to preserve voice consistency. The `abortSignal` is
 * checked before each clause and forwarded into every `doSynthesize()`
 * call so an in-flight clause can reject early.
 *
 * The function never retries: if any clause's `doSynthesize()` rejects,
 * the iterable rejects with the same error and no further clauses are
 * synthesized. Callers who want retry can wrap the model with retry
 * middleware.
 *
 * @example Basic for-await consumption
 * ```ts
 * import { streamSynthesizeSpeech } from '@localmode/core';
 * import { transformers } from '@localmode/transformers';
 *
 * const model = transformers.textToSpeech('onnx-community/Kokoro-82M-v1.0-ONNX');
 * for await (const clause of streamSynthesizeSpeech({ model, text })) {
 *   console.log(clause.clauseIndex, clause.text, clause.audio.length);
 * }
 * ```
 *
 * @example Piped into the playback helper
 * ```ts
 * import { streamSynthesizeSpeech, playStreamedSpeech } from '@localmode/core';
 *
 * const ctx = new AudioContext();
 * const stream = streamSynthesizeSpeech({ model, text, voice: 'af_heart' });
 * const handle = await playStreamedSpeech(stream, ctx);
 * await handle.playing;
 * ```
 *
 * @example With voice, speed, and abort
 * ```ts
 * const controller = new AbortController();
 * const stream = streamSynthesizeSpeech({
 *   model,
 *   text: 'Hello there. How are you today?',
 *   voice: 'af_heart',
 *   speed: 1.1,
 *   abortSignal: controller.signal,
 * });
 * setTimeout(() => controller.abort(), 5000);
 * for await (const clause of stream) {
 *   process(clause);
 * }
 * ```
 *
 * @param options - Streaming synthesis options.
 * @returns An async-iterable that yields one {@link SynthesizedClause} per clause.
 * @throws {Error} Propagates any error from `doSynthesize()`. Throws an
 *   `Error` on sample-rate mismatch across clauses (the message identifies
 *   the offending `clauseIndex`, expected, and actual rates).
 */
export async function* streamSynthesizeSpeech(
  options: StreamSynthesizeSpeechOptions
): AsyncIterableIterator<SynthesizedClause> {
  const {
    model: modelOrId,
    text,
    voice,
    speed,
    pitch,
    splitOptions,
    abortSignal,
    providerOptions,
  } = options;

  abortSignal?.throwIfAborted();

  const model = resolveTTSModel(modelOrId);
  const clauses = splitIntoClauses(text, splitOptions);
  if (clauses.length === 0) return;

  let firstSampleRate: number | null = null;

  for (let clauseIndex = 0; clauseIndex < clauses.length; clauseIndex++) {
    abortSignal?.throwIfAborted();

    const clauseText = clauses[clauseIndex];
    const startTime = performance.now();

    const result = await model.doSynthesize({
      text: clauseText,
      voice,
      speed,
      pitch,
      abortSignal,
      providerOptions,
    });

    const { samples, sampleRate } = await decodePcm16Wav(result.audio, result.sampleRate);

    if (firstSampleRate === null) {
      firstSampleRate = sampleRate;
    } else if (sampleRate !== firstSampleRate) {
      throw new Error(
        `streamSynthesizeSpeech: sample rate mismatch at clauseIndex=${clauseIndex}: ` +
          `expected ${firstSampleRate}, got ${sampleRate}.`
      );
    }

    const durationMs = performance.now() - startTime;

    yield {
      audio: samples,
      text: clauseText,
      sampleRate,
      clauseIndex,
      usage: {
        characterCount: clauseText.length,
        durationMs,
      },
    };
  }
}
