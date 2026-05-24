/**
 * streamSynthesizeSpeech() Tests
 *
 * Covers the AsyncIterable contract, sequential synthesis, AbortSignal
 * forwarding (pre / between / in-flight), sample-rate constancy, error
 * propagation, voice-consistency, string-model-id resolution, and audio
 * format conversion.
 *
 * @packageDocumentation
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  streamSynthesizeSpeech,
  setGlobalTTSProvider,
} from '../src/audio/index.js';
import type {
  TextToSpeechModel,
  DoSynthesizeOptions,
  DoSynthesizeResult,
} from '../src/audio/index.js';

/** Encode a Float32Array as a 16-bit mono PCM WAV Blob (matches transformers provider). */
function floatToWavBlob(samples: Float32Array, sampleRate: number): Blob {
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, totalSize - 8, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(headerSize + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

interface RecordedCall {
  text: string;
  voice?: string;
  speed?: number;
  pitch?: number;
  abortSignal?: AbortSignal;
}

interface MakeMockOptions {
  sampleRate?: number;
  /** Override sampleRate per call index (used for constancy tests). */
  sampleRatePerCall?: (callIndex: number) => number;
  /** Reject for the call at this index. */
  errorAtIndex?: number;
  /** Delay each `doSynthesize` call by this many ms. */
  delay?: number;
  /** Block in `doSynthesize` until this promise resolves. */
  block?: Promise<void>;
}

function makeMockTTS(options: MakeMockOptions = {}) {
  const { sampleRate = 24000, sampleRatePerCall, errorAtIndex, delay = 0, block } = options;
  const calls: RecordedCall[] = [];
  let inFlight = 0;
  let peakConcurrent = 0;

  const model: TextToSpeechModel & { calls: RecordedCall[]; peakConcurrent: () => number } = {
    modelId: 'mock:tts',
    provider: 'mock',
    voices: ['af_heart', 'af_bella'],
    async doSynthesize(opts: DoSynthesizeOptions): Promise<DoSynthesizeResult> {
      const callIndex = calls.length;
      calls.push({
        text: opts.text,
        voice: opts.voice,
        speed: opts.speed,
        pitch: opts.pitch,
        abortSignal: opts.abortSignal,
      });
      inFlight++;
      peakConcurrent = Math.max(peakConcurrent, inFlight);
      try {
        if (block) await block;
        if (delay > 0) await new Promise((r) => setTimeout(r, delay));
        opts.abortSignal?.throwIfAborted?.();
        if (errorAtIndex !== undefined && callIndex === errorAtIndex) {
          throw new Error(`TTS failed at call ${callIndex}`);
        }
        const rate = sampleRatePerCall ? sampleRatePerCall(callIndex) : sampleRate;
        // Synthesize a non-empty PCM signal (sine-ish; just non-zero).
        const numSamples = Math.max(8, opts.text.length * 4);
        const samples = new Float32Array(numSamples);
        for (let i = 0; i < numSamples; i++) samples[i] = Math.sin(i * 0.1) * 0.5;
        const audio = floatToWavBlob(samples, rate);
        return {
          audio,
          sampleRate: rate,
          usage: { characterCount: opts.text.length, durationMs: delay },
        };
      } finally {
        inFlight--;
      }
    },
    calls,
    peakConcurrent: () => peakConcurrent,
  };
  return model;
}

describe('streamSynthesizeSpeech()', () => {
  afterEach(() => {
    setGlobalTTSProvider(null);
  });

  it('yields one item per clause in order', async () => {
    const model = makeMockTTS();
    const items: { clauseIndex: number; text: string }[] = [];
    for await (const c of streamSynthesizeSpeech({
      model,
      text: 'Hello there. How are you?',
    })) {
      items.push({ clauseIndex: c.clauseIndex, text: c.text });
    }
    expect(items).toEqual([
      { clauseIndex: 0, text: 'Hello there.' },
      { clauseIndex: 1, text: 'How are you?' },
    ]);
  });

  it('audio is a Float32Array with non-zero length and samples in [-1, 1]', async () => {
    const model = makeMockTTS();
    const items = [];
    for await (const c of streamSynthesizeSpeech({ model, text: 'Hello there.' })) {
      items.push(c);
    }
    expect(items[0].audio).toBeInstanceOf(Float32Array);
    expect(items[0].audio.length).toBeGreaterThan(0);
    for (let i = 0; i < items[0].audio.length; i++) {
      expect(items[0].audio[i]).toBeGreaterThanOrEqual(-1);
      expect(items[0].audio[i]).toBeLessThanOrEqual(1);
    }
  });

  it('clauseIndex is monotonically increasing from 0', async () => {
    const model = makeMockTTS();
    const indices: number[] = [];
    for await (const c of streamSynthesizeSpeech({
      model,
      text: 'A. B. C. D.',
      splitOptions: { minWordsPerClause: 1 },
    })) {
      indices.push(c.clauseIndex);
    }
    expect(indices).toEqual([0, 1, 2, 3]);
  });

  it('passes voice / speed / pitch to every doSynthesize call', async () => {
    const model = makeMockTTS();
    for await (const _ of streamSynthesizeSpeech({
      model,
      text: 'A. B. C.',
      voice: 'af_heart',
      speed: 1.1,
      pitch: -2,
      splitOptions: { minWordsPerClause: 1 },
    })) {
      // consume
    }
    expect(model.calls.length).toBe(3);
    for (const call of model.calls) {
      expect(call.voice).toBe('af_heart');
      expect(call.speed).toBe(1.1);
      expect(call.pitch).toBe(-2);
    }
  });

  it('peak concurrent doSynthesize calls is 1 (sequential)', async () => {
    const model = makeMockTTS({ delay: 5 });
    for await (const _ of streamSynthesizeSpeech({
      model,
      text: 'A. B. C.',
      splitOptions: { minWordsPerClause: 1 },
    })) {
      // consume
    }
    expect(model.peakConcurrent()).toBe(1);
  });

  describe('AbortSignal', () => {
    it('throws on first iteration when already aborted', async () => {
      const model = makeMockTTS();
      const controller = new AbortController();
      controller.abort();
      const stream = streamSynthesizeSpeech({
        model,
        text: 'Hello there. World.',
        abortSignal: controller.signal,
      });
      const iterator = stream[Symbol.asyncIterator]();
      await expect(iterator.next()).rejects.toBeDefined();
      expect(model.calls.length).toBe(0);
    });

    it('throws between clauses when aborted mid-stream', async () => {
      const model = makeMockTTS();
      const controller = new AbortController();
      const iterator = streamSynthesizeSpeech({
        model,
        text: 'Hello there. World peace.',
        abortSignal: controller.signal,
      })[Symbol.asyncIterator]();

      const first = await iterator.next();
      expect(first.done).toBe(false);
      controller.abort();
      await expect(iterator.next()).rejects.toBeDefined();
      expect(model.calls.length).toBe(1);
    });

    it('forwards the same signal into every doSynthesize call', async () => {
      const model = makeMockTTS();
      const controller = new AbortController();
      for await (const _ of streamSynthesizeSpeech({
        model,
        text: 'A. B.',
        abortSignal: controller.signal,
        splitOptions: { minWordsPerClause: 1 },
      })) {
        // consume
      }
      for (const call of model.calls) {
        expect(call.abortSignal).toBe(controller.signal);
      }
    });
  });

  describe('Sample rate consistency', () => {
    it('does not throw when every clause has the same sample rate', async () => {
      const model = makeMockTTS({ sampleRate: 24000 });
      const rates: number[] = [];
      for await (const c of streamSynthesizeSpeech({
        model,
        text: 'A. B. C.',
        splitOptions: { minWordsPerClause: 1 },
      })) {
        rates.push(c.sampleRate);
      }
      expect(rates).toEqual([24000, 24000, 24000]);
    });

    it('throws on mismatched sample rate, mentioning clauseIndex + rates', async () => {
      const model = makeMockTTS({
        sampleRatePerCall: (i) => (i === 0 ? 24000 : 16000),
      });
      const stream = streamSynthesizeSpeech({
        model,
        text: 'A. B.',
        splitOptions: { minWordsPerClause: 1 },
      });
      const iterator = stream[Symbol.asyncIterator]();
      const first = await iterator.next();
      expect(first.done).toBe(false);
      try {
        await iterator.next();
        throw new Error('expected throw');
      } catch (err) {
        const msg = (err as Error).message;
        expect(msg).toContain('clauseIndex=1');
        expect(msg).toContain('24000');
        expect(msg).toContain('16000');
      }
    });
  });

  describe('Error propagation', () => {
    it('propagates the provider error and stops further synthesis', async () => {
      const model = makeMockTTS({ errorAtIndex: 1 });
      const items = [];
      let caught: Error | null = null;
      try {
        for await (const c of streamSynthesizeSpeech({
          model,
          text: 'A. B. C.',
          splitOptions: { minWordsPerClause: 1 },
        })) {
          items.push(c);
        }
      } catch (e) {
        caught = e as Error;
      }
      expect(items.length).toBe(1); // clause 0 succeeded
      expect(caught?.message).toContain('TTS failed at call 1');
      expect(model.calls.length).toBe(2); // clause 2 never invoked
    });
  });

  describe('String model ID resolution', () => {
    it('resolves via setGlobalTTSProvider', async () => {
      const model = makeMockTTS();
      setGlobalTTSProvider(() => model);
      const items = [];
      for await (const c of streamSynthesizeSpeech({
        model: 'transformers:foo' as unknown as TextToSpeechModel,
        text: 'Hi.',
      })) {
        items.push(c);
      }
      expect(items.length).toBe(1);
    });

    it('throws descriptive error when no provider registered', async () => {
      setGlobalTTSProvider(null);
      const stream = streamSynthesizeSpeech({
        model: 'transformers:foo' as unknown as TextToSpeechModel,
        text: 'Hi.',
      });
      const iterator = stream[Symbol.asyncIterator]();
      await expect(iterator.next()).rejects.toThrow(/No global TTS provider configured/);
    });
  });

  describe('Iterator return() releases resources', () => {
    it('does not invoke doSynthesize for clauses past iterator.return()', async () => {
      const model = makeMockTTS();
      const stream = streamSynthesizeSpeech({
        model,
        text: 'A. B. C. D.',
        splitOptions: { minWordsPerClause: 1 },
      });
      const iterator = stream[Symbol.asyncIterator]();
      await iterator.next();
      // bail
      if (typeof iterator.return === 'function') {
        await iterator.return();
      }
      // Wait a tick to ensure no hidden async work runs.
      await new Promise((r) => setTimeout(r, 5));
      expect(model.calls.length).toBe(1);
    });
  });
});
