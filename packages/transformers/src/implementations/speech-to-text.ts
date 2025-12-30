/**
 * Transformers Speech-to-Text Model Implementation
 *
 * Implements SpeechToTextModel interface using Transformers.js
 *
 * @packageDocumentation
 */

import type {
  SpeechToTextModel,
  AudioInput,
  TranscriptionSegment,
  AudioUsage,
} from '@localmode/core';
import type { ModelSettings, TransformersDevice, ModelLoadProgress } from '../types.js';

// Dynamic import types
type AutomaticSpeechRecognitionPipeline = Awaited<
  ReturnType<typeof import('@huggingface/transformers').pipeline<'automatic-speech-recognition'>>
>;

/**
 * Speech-to-text model implementation using Transformers.js (Whisper)
 */
export class TransformersSpeechToTextModel implements SpeechToTextModel {
  readonly modelId: string;
  readonly provider = 'transformers';
  readonly languages = [
    'en',
    'zh',
    'de',
    'es',
    'ru',
    'ko',
    'fr',
    'ja',
    'pt',
    'tr',
    'pl',
    'ca',
    'nl',
    'ar',
    'sv',
    'it',
    'id',
    'hi',
    'fi',
    'vi',
    'he',
    'uk',
    'el',
    'ms',
    'cs',
    'ro',
    'da',
    'hu',
    'ta',
    'no',
    'th',
    'ur',
    'hr',
    'bg',
    'lt',
    'la',
    'mi',
    'ml',
    'cy',
    'sk',
    'te',
    'fa',
    'lv',
    'bn',
    'sr',
    'az',
    'sl',
    'kn',
    'et',
    'mk',
    'br',
    'eu',
    'is',
    'hy',
    'ne',
    'mn',
    'bs',
    'kk',
    'sq',
    'sw',
    'gl',
    'mr',
    'pa',
    'si',
    'km',
    'sn',
    'yo',
    'so',
    'af',
    'oc',
    'ka',
    'be',
    'tg',
    'sd',
    'gu',
    'am',
    'yi',
    'lo',
    'uz',
    'fo',
    'ht',
    'ps',
    'tk',
    'nn',
    'mt',
    'sa',
    'lb',
    'my',
    'bo',
    'tl',
    'mg',
    'as',
    'tt',
    'haw',
    'ln',
    'ha',
    'ba',
    'jw',
    'su',
  ];

  private pipeline: AutomaticSpeechRecognitionPipeline | null = null;
  private loadPromise: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

  constructor(
    private baseModelId: string,
    private settings: {
      device?: TransformersDevice;
      quantized?: boolean;
      onProgress?: (progress: ModelLoadProgress) => void;
    } = {}
  ) {
    this.modelId = `transformers:${baseModelId}`;
  }

  private async loadPipeline(): Promise<AutomaticSpeechRecognitionPipeline> {
    if (this.pipeline) {
      return this.pipeline;
    }

    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = (async () => {
      const { pipeline } = await import('@huggingface/transformers');

      const pipe = await pipeline('automatic-speech-recognition', this.baseModelId, {
        device: this.settings.device ?? 'auto',
        dtype: this.settings.quantized !== false ? 'q8' : 'fp32',
        progress_callback: this.settings.onProgress,
      });

      this.pipeline = pipe;
      return pipe;
    })();

    return this.loadPromise;
  }

  // Track object URLs for cleanup
  private objectUrls: string[] = [];

  /**
   * Convert Float32Array PCM samples to a WAV blob URL.
   * This ensures transformers.js correctly interprets the audio format.
   */
  private createWavUrl(samples: Float32Array, sampleRate: number = 16000): string {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    // WAV header
    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, samples.length * 2, true);

    // Convert Float32 to Int16
    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
      const sample = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }

    const blob = new Blob([buffer], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    this.objectUrls.push(url);
    return url;
  }

  /**
   * Convert AudioInput to a format Transformers.js can process.
   * For raw PCM samples, converts to WAV URL to ensure correct interpretation.
   */
  private async prepareAudio(audio: AudioInput): Promise<string> {
    // Float32Array - convert to WAV URL for reliable processing
    if (audio instanceof Float32Array) {
      // Debug: log audio stats
      if (typeof console !== 'undefined') {
        let sum = 0;
        let max = 0;
        for (let i = 0; i < audio.length; i++) {
          sum += audio[i] * audio[i];
          const abs = Math.abs(audio[i]);
          if (abs > max) max = abs;
        }
        const rms = Math.sqrt(sum / audio.length);
        console.log(
          '[STT] Audio stats - samples:',
          audio.length,
          'RMS:',
          rms.toFixed(4),
          'Max:',
          max.toFixed(4),
          'Duration:',
          (audio.length / 16000).toFixed(2) + 's'
        );

        if (rms < 0.001) {
          console.warn('[STT] Warning: Audio appears to be nearly silent (RMS < 0.001)');
        }
      }

      // Convert to WAV URL - this ensures transformers.js correctly interprets the format
      const url = this.createWavUrl(audio, 16000);
      console.log('[STT] Created WAV URL for pipeline');
      return url;
    }

    // For Blob, create an Object URL - transformers.js will fetch and decode it
    // This handles WebM and other formats that AudioContext.decodeAudioData doesn't support
    if (audio instanceof Blob) {
      const url = URL.createObjectURL(audio);
      this.objectUrls.push(url);
      return url;
    }

    // For ArrayBuffer, create a Blob URL
    if (audio instanceof ArrayBuffer) {
      const blob = new Blob([audio], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      this.objectUrls.push(url);
      return url;
    }

    // If it's a URL string, return as-is
    return audio as string;
  }

  /**
   * Cleanup any created Object URLs
   */
  private cleanupObjectUrls(): void {
    for (const url of this.objectUrls) {
      URL.revokeObjectURL(url);
    }
    this.objectUrls = [];
  }

  async doTranscribe(options: {
    audio: AudioInput;
    language?: string;
    task?: 'transcribe' | 'translate';
    returnTimestamps?: boolean | 'word';
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
    providerOptions?: Record<string, Record<string, unknown>>;
  }): Promise<{
    text: string;
    segments?: TranscriptionSegment[];
    language?: string;
    usage: AudioUsage;
  }> {
    const { audio, language, task, returnTimestamps, abortSignal } = options;
    const startTime = Date.now();

    abortSignal?.throwIfAborted();

    const pipe = await this.loadPipeline();

    abortSignal?.throwIfAborted();

    const preparedAudio = await this.prepareAudio(audio);

    abortSignal?.throwIfAborted();

    try {
      // Build pipeline options
      const pipelineOptions: Record<string, unknown> = {
        language: language,
        task: task ?? 'transcribe',
        return_timestamps: returnTimestamps ?? false,
        // Chunk settings to help with short audio
        chunk_length_s: 30,
        stride_length_s: 5,
      };

      if (returnTimestamps === 'word') {
        pipelineOptions.return_timestamps = 'word';
      }

      console.log('[STT] Pipeline options:', JSON.stringify(pipelineOptions));

      const output = await pipe(preparedAudio, pipelineOptions);

      console.log('[STT] Raw output:', JSON.stringify(output));

      // Output format depends on options
      // Without timestamps: { text: string }
      // With timestamps: { text: string, chunks: Array<{ text, timestamp }> }
      const result = output as {
        text: string;
        chunks?: Array<{ text: string; timestamp: [number, number] }>;
      };

      let segments: TranscriptionSegment[] | undefined;

      if (result.chunks && result.chunks.length > 0) {
        segments = result.chunks.map((chunk) => ({
          text: chunk.text,
          start: chunk.timestamp[0],
          end: chunk.timestamp[1],
        }));
      }

      // Estimate audio duration from segments or from original audio
      let audioDurationSec = 0;
      if (segments && segments.length > 0) {
        audioDurationSec = segments[segments.length - 1].end;
      } else if (audio instanceof Float32Array) {
        // Original audio at 16kHz sample rate
        audioDurationSec = audio.length / 16000;
      }

      return {
        text: result.text.trim(),
        segments,
        language,
        usage: {
          audioDurationSec,
          durationMs: Date.now() - startTime,
        },
      };
    } finally {
      // Clean up any Object URLs we created
      this.cleanupObjectUrls();
    }
  }
}

/**
 * Create a speech-to-text model using Transformers.js
 */
export function createSpeechToTextModel(
  modelId: string,
  settings?: ModelSettings
): TransformersSpeechToTextModel {
  return new TransformersSpeechToTextModel(modelId, settings);
}
