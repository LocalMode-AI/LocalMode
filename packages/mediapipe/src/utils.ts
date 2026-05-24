/**
 * MediaPipe Provider Utilities
 *
 * WASM runtime resolution and input conversion helpers shared across all
 * MediaPipe task implementations.
 *
 * @packageDocumentation
 */

import type { ImageInput, AudioInput } from '@localmode/core';
import type { MediaPipeTaskDomain } from './models.js';
import type { MediaPipeWasmPaths } from './types.js';

/** Pinned MediaPipe version range used for the default CDN WASM path. */
const MEDIAPIPE_CDN_VERSION = '0.10';

/**
 * Resolve the WASM runtime base path for a MediaPipe task domain.
 *
 * Resolution order: model-level override → provider-level setting → jsDelivr CDN.
 *
 * @param domain - Task domain (vision / audio / text)
 * @param providerSetting - Provider-level `wasmBasePath`
 * @param modelSetting - Model-level `wasmBasePath` override
 * @returns The WASM runtime base path
 */
export function resolveWasmPath(
  domain: MediaPipeTaskDomain,
  providerSetting?: string | MediaPipeWasmPaths,
  modelSetting?: string
): string {
  if (modelSetting) {
    return modelSetting;
  }
  if (typeof providerSetting === 'string') {
    return providerSetting;
  }
  if (providerSetting && providerSetting[domain]) {
    return providerSetting[domain]!;
  }
  return `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-${domain}@${MEDIAPIPE_CDN_VERSION}/wasm`;
}

/**
 * A MediaPipe-compatible image source.
 */
export type MediaPipeImageSource =
  | ImageBitmap
  | ImageData
  | HTMLImageElement
  | HTMLVideoElement
  | HTMLCanvasElement;

/**
 * Convert a LocalMode {@link ImageInput} into a MediaPipe image source.
 *
 * `ImageData` is passed through. Blobs, `ArrayBuffer`s, and URL/data-URL
 * strings are decoded into an `ImageBitmap`.
 *
 * @param input - The image input to convert
 * @returns A MediaPipe-compatible image source
 */
export async function toImageSource(input: ImageInput): Promise<MediaPipeImageSource> {
  if (typeof ImageData !== 'undefined' && input instanceof ImageData) {
    return input;
  }

  if (input instanceof Blob) {
    return createImageBitmap(input);
  }

  if (input instanceof ArrayBuffer) {
    return createImageBitmap(new Blob([input]));
  }

  if (typeof input === 'string') {
    const response = await fetch(input);
    if (!response.ok) {
      throw new Error(`Failed to fetch image from "${input}": HTTP ${response.status}`);
    }
    const blob = await response.blob();
    return createImageBitmap(blob);
  }

  throw new Error('Unsupported image input type for MediaPipe');
}

/**
 * Release an image source created by {@link toImageSource}.
 *
 * Closes the underlying `ImageBitmap` if one was created. Safe to call with
 * any image source and in environments where `ImageBitmap` is undefined.
 *
 * @param source - The image source to release
 */
export function releaseImageSource(source: MediaPipeImageSource): void {
  if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) {
    source.close();
  }
}

/** Decoded audio samples plus their sample rate. */
export interface DecodedAudio {
  /** Mono PCM samples in the range [-1, 1] */
  samples: Float32Array;
  /** Sample rate in Hz */
  sampleRate: number;
}

/**
 * Convert a LocalMode {@link AudioInput} into mono PCM samples.
 *
 * `Float32Array` input is treated as already-decoded mono PCM at
 * `inputSampleRate`. Blobs and `ArrayBuffer`s are decoded (and resampled to
 * `targetSampleRate`) via an `OfflineAudioContext`.
 *
 * @param input - The audio input to convert
 * @param targetSampleRate - Desired sample rate in Hz (default: 16000)
 * @param inputSampleRate - Sample rate of raw `Float32Array` input (default: targetSampleRate)
 * @returns Decoded mono audio samples
 */
export async function toAudioSamples(
  input: AudioInput,
  targetSampleRate = 16000,
  inputSampleRate?: number
): Promise<DecodedAudio> {
  if (input instanceof Float32Array) {
    return { samples: input, sampleRate: inputSampleRate ?? targetSampleRate };
  }

  const arrayBuffer =
    input instanceof Blob ? await input.arrayBuffer() : (input as ArrayBuffer);

  const AudioCtx =
    typeof OfflineAudioContext !== 'undefined'
      ? OfflineAudioContext
      : (globalThis as { webkitOfflineAudioContext?: typeof OfflineAudioContext })
          .webkitOfflineAudioContext;

  if (!AudioCtx) {
    throw new Error('OfflineAudioContext is not available — cannot decode audio');
  }

  // A short-lived context to decode the source audio.
  const decodeCtx = new AudioCtx(1, 1, targetSampleRate);
  const decoded = await decodeCtx.decodeAudioData(arrayBuffer.slice(0));

  // Resample to mono at the target sample rate.
  const offline = new AudioCtx(
    1,
    Math.ceil((decoded.duration * targetSampleRate) || 1),
    targetSampleRate
  );
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();

  return { samples: rendered.getChannelData(0), sampleRate: targetSampleRate };
}

/**
 * Map a MediaPipe normalized landmark to a LocalMode {@link import('@localmode/core').Landmark}.
 */
export function mapLandmark(lm: {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}): { x: number; y: number; z: number; visibility?: number } {
  return {
    x: lm.x,
    y: lm.y,
    z: lm.z,
    ...(lm.visibility !== undefined ? { visibility: lm.visibility } : {}),
  };
}
