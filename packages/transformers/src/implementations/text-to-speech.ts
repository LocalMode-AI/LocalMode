/**
 * Transformers Text-to-Speech Model Implementation
 *
 * Implements TextToSpeechModel interface using Transformers.js.
 * Routes Kokoro models to a dedicated phonemizer-backed path for
 * dramatically better pronunciation; non-Kokoro models (SpeechT5,
 * MMS-TTS/VITS) use the generic pipeline.
 *
 * @packageDocumentation
 */

import type {
  TextToSpeechModel,
} from '@localmode/core';
import type { ModelSettings, TransformersDevice, ModelLoadProgress } from '../types.js';
import { isKokoroModel, kokoroSynthesize, getKokoroVoiceIds } from './kokoro-tts.js';
import { KOKORO_DEFAULT_VOICE } from '../kokoro-voices.js';

// Dynamic import types
type TTSPipeline = Awaited<
  ReturnType<typeof import('@huggingface/transformers').pipeline<'text-to-speech'>>
>;

/**
 * Text-to-speech model implementation using Transformers.js
 */
export class TransformersTextToSpeechModel implements TextToSpeechModel {
  readonly modelId: string;
  readonly provider = 'transformers';
  readonly sampleRate: number;
  readonly voices: string[];

  private readonly isKokoro: boolean;
  private pipeline: TTSPipeline | null = null;
  private loadPromise: Promise<TTSPipeline> | null = null;

  constructor(
    private baseModelId: string,
    private settings: {
      device?: TransformersDevice;
      quantized?: boolean;
      sampleRate?: number;
      onProgress?: (progress: ModelLoadProgress) => void;
    } = {}
  ) {
    this.modelId = `transformers:${baseModelId}`;
    this.isKokoro = isKokoroModel(baseModelId);

    if (this.isKokoro) {
      this.sampleRate = 24000;
      this.voices = getKokoroVoiceIds();
    } else {
      this.sampleRate = settings.sampleRate ?? 16000;
      this.voices = [];
    }
  }

  private async loadPipeline(): Promise<TTSPipeline> {
    if (this.pipeline) {
      return this.pipeline;
    }

    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = (async () => {
      const { pipeline, AutoModel, env } = await import('@huggingface/transformers');

      env.backends.onnx.logLevel = 'error';

      const device = this.settings.device ?? 'wasm';
      const dtype = this.settings.quantized === true ? 'q8' : 'fp32';

      const pipe = await pipeline('text-to-speech', this.baseModelId, {
        device,
        dtype,
        progress_callback: this.settings.onProgress,
      });

      const isSpeechT5 = this.baseModelId.toLowerCase().includes('speecht5');
      if (isSpeechT5 && !pipe.vocoder) {
        const vocoderModel = await AutoModel.from_pretrained(
          'Xenova/speecht5_hifigan',
          { dtype: 'fp32', device }
        );
        (pipe as unknown as { vocoder: unknown }).vocoder = vocoderModel;
      }

      this.pipeline = pipe;
      return pipe;
    })();

    return this.loadPromise;
  }

  async doSynthesize(options: {
    text: string;
    voice?: string;
    speed?: number;
    pitch?: number;
    abortSignal?: AbortSignal;
    providerOptions?: Record<string, Record<string, unknown>>;
  }): Promise<{
    audio: Blob;
    sampleRate: number;
    usage: {
      characterCount: number;
      durationMs: number;
    };
  }> {
    const { text, voice, speed, abortSignal, providerOptions } = options;

    abortSignal?.throwIfAborted();

    if (this.isKokoro) {
      return this.synthesizeKokoro(text, voice, speed, abortSignal, providerOptions);
    }

    return this.synthesizeGeneric(text, abortSignal);
  }

  private async synthesizeKokoro(
    text: string,
    voice: string | undefined,
    speed: number | undefined,
    abortSignal: AbortSignal | undefined,
    providerOptions: Record<string, Record<string, unknown>> | undefined,
  ): Promise<{
    audio: Blob;
    sampleRate: number;
    usage: { characterCount: number; durationMs: number };
  }> {
    const startTime = Date.now();
    const kokoroOpts = providerOptions?.kokoro ?? {};
    const dtype = (kokoroOpts.dtype as string) ?? 'q8';

    const result = await kokoroSynthesize({
      modelId: this.baseModelId,
      text,
      voice: voice ?? KOKORO_DEFAULT_VOICE,
      speed: speed ?? 1.0,
      dtype: dtype as 'q8' | 'fp16' | 'fp32' | 'q4' | 'q4f16',
      device: this.settings.device ?? 'wasm',
      abortSignal,
      onProgress: this.settings.onProgress,
    });

    const wavBlob = this.floatToWav(result.audio, result.sampleRate);

    return {
      audio: wavBlob,
      sampleRate: result.sampleRate,
      usage: {
        characterCount: text.length,
        durationMs: Date.now() - startTime,
      },
    };
  }

  private async synthesizeGeneric(
    text: string,
    abortSignal: AbortSignal | undefined,
  ): Promise<{
    audio: Blob;
    sampleRate: number;
    usage: { characterCount: number; durationMs: number };
  }> {
    const startTime = Date.now();
    const pipe = await this.loadPipeline();

    abortSignal?.throwIfAborted();

    const isSpeechT5 = this.baseModelId.toLowerCase().includes('speecht5');
    const pipelineOptions: Record<string, unknown> = {};

    if (isSpeechT5) {
      pipelineOptions.speaker_embeddings =
        'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/speaker_embeddings.bin';
    }

    const output = await pipe(text, pipelineOptions);

    const audioData = (output as { audio: Float32Array }).audio;
    const samplingRate = (output as { sampling_rate: number }).sampling_rate || this.sampleRate;

    const wavBlob = this.floatToWav(audioData, samplingRate);

    return {
      audio: wavBlob,
      sampleRate: samplingRate,
      usage: {
        characterCount: text.length,
        durationMs: Date.now() - startTime,
      },
    };
  }

  private floatToWav(audioData: Float32Array, sampleRate: number): Blob {
    const numChannels = 1;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = audioData.length * bytesPerSample;
    const headerSize = 44;
    const totalSize = headerSize + dataSize;

    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);

    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, totalSize - 8, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    const offset = 44;
    for (let i = 0; i < audioData.length; i++) {
      const sample = Math.max(-1, Math.min(1, audioData[i]));
      view.setInt16(offset + i * 2, sample * 0x7fff, true);
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }
}

/**
 * Create a text-to-speech model using Transformers.js
 */
export function createTextToSpeechModel(
  modelId: string,
  settings?: ModelSettings & { sampleRate?: number }
): TransformersTextToSpeechModel {
  return new TransformersTextToSpeechModel(modelId, settings);
}
