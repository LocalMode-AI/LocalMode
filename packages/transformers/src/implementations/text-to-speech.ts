/**
 * Transformers Text-to-Speech Model Implementation
 *
 * Implements TextToSpeechModel interface using Transformers.js (SpeechT5, etc.)
 *
 * @packageDocumentation
 */

import type {
  TextToSpeechModel,
} from '@localmode/core';
import type { ModelSettings, TransformersDevice, ModelLoadProgress } from '../types.js';

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
  readonly sampleRate: number = 16000;
  readonly voices: string[] = [];

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
    if (settings.sampleRate) {
      (this as { sampleRate: number }).sampleRate = settings.sampleRate;
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

      // Suppress ONNX runtime warnings about node execution providers
      env.backends.onnx.logLevel = 'error';

      // TTS models use ops (GatherND int64, MatMul) that fail on WebGPU JSEP —
      // force WASM for TTS to avoid runtime kernel failures
      const device = this.settings.device ?? 'wasm';
      const dtype = this.settings.quantized === true ? 'q8' : undefined;

      const pipe = await pipeline('text-to-speech', this.baseModelId, {
        device,
        dtype,
        progress_callback: this.settings.onProgress,
      });

      // SpeechT5 models need a HiFi-GAN vocoder; VITS models generate waveforms directly.
      // Only load vocoder for SpeechT5-type models (which have a processor but no built-in vocoder).
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
    const { text, abortSignal } = options;
    const startTime = Date.now();

    abortSignal?.throwIfAborted();

    const pipe = await this.loadPipeline();

    abortSignal?.throwIfAborted();

    // SpeechT5 requires speaker embeddings; VITS models (mms-tts) don't need them
    const isSpeechT5 = this.baseModelId.toLowerCase().includes('speecht5');
    const pipelineOptions: Record<string, unknown> = {};

    if (isSpeechT5) {
      pipelineOptions.speaker_embeddings =
        'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/speaker_embeddings.bin';
    }

    const output = await pipe(text, pipelineOptions);

    const audioData = (output as { audio: Float32Array }).audio;
    const samplingRate = (output as { sampling_rate: number }).sampling_rate || this.sampleRate;

    // Convert Float32Array to WAV Blob
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

  /**
   * Convert Float32Array audio data to WAV Blob
   */
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

