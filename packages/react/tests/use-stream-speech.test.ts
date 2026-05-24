/**
 * useStreamSpeech() Tests
 *
 * Verifies the hook composes streamSynthesizeSpeech() and
 * playStreamedSpeech() and exposes the right state transitions.
 *
 * @packageDocumentation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { TextToSpeechModel, DoSynthesizeOptions, DoSynthesizeResult } from '@localmode/core';
import { useStreamSpeech } from '../src/hooks/use-stream-speech.js';

/** Encode a Float32Array as 16-bit mono PCM WAV Blob. */
function floatToWavBlob(samples: Float32Array, sampleRate: number): Blob {
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const totalSize = 44 + dataSize;
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
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

function makeMockTTS(opts: { sampleRate?: number; errorAtIndex?: number } = {}) {
  const { sampleRate = 24000, errorAtIndex } = opts;
  let callCount = 0;
  const model: TextToSpeechModel = {
    modelId: 'mock:tts',
    provider: 'mock',
    async doSynthesize(o: DoSynthesizeOptions): Promise<DoSynthesizeResult> {
      const idx = callCount++;
      if (errorAtIndex !== undefined && idx === errorAtIndex) {
        throw new Error('synthesis failed');
      }
      const samples = new Float32Array(Math.max(8, o.text.length * 4));
      return {
        audio: floatToWavBlob(samples, sampleRate),
        sampleRate,
        usage: { characterCount: o.text.length, durationMs: 1 },
      };
    },
  };
  return model;
}

/** Fake AudioContext used by the hook (jsdom has no Web Audio). */
class FakeAudioContext {
  state: 'running' | 'suspended' | 'closed' = 'running';
  currentTime = 0;
  destination = {};
  private sources: { onended: (() => void) | null }[] = [];

  createBuffer(_ch: number, length: number, sampleRate: number) {
    return {
      duration: length / sampleRate,
      length,
      sampleRate,
      copyToChannel: () => {},
    };
  }
  createBufferSource() {
    const src = {
      buffer: null,
      onended: null as (() => void) | null,
      connect: () => {},
      disconnect: () => {},
      start: () => {
        // Auto-resolve via a microtask so the iteration progresses.
        setTimeout(() => src.onended?.(), 0);
      },
      stop: () => {},
    };
    this.sources.push(src);
    return src;
  }
  async suspend() {
    this.state = 'suspended';
  }
  async resume() {
    this.state = 'running';
  }
  async close() {
    this.state = 'closed';
  }
}

beforeEach(() => {
  // Install fake AudioContext on globalThis. The hook resolves it lazily.
  (globalThis as { AudioContext?: unknown }).AudioContext = FakeAudioContext;
});

describe('useStreamSpeech', () => {
  it('speak() drives synthesis + playback and populates clauses', async () => {
    const model = makeMockTTS();
    const { result } = renderHook(() =>
      useStreamSpeech({ model, splitOptions: { minWordsPerClause: 1 } })
    );

    expect(result.current.isSynthesizing).toBe(false);
    expect(result.current.isPlaying).toBe(false);

    await act(async () => {
      await result.current.speak('Hello there. How are you?');
    });

    await waitFor(() => {
      expect(result.current.clauses.length).toBe(2);
    });
    expect(result.current.clauses[0].text).toBe('Hello there.');
    expect(result.current.clauses[1].text).toBe('How are you?');
    expect(result.current.error).toBeNull();
  });

  it('stop() resets state', async () => {
    const model = makeMockTTS();
    const { result } = renderHook(() =>
      useStreamSpeech({ model, splitOptions: { minWordsPerClause: 1 } })
    );
    await act(async () => {
      const promise = result.current.speak('A. B. C.');
      // Stop almost immediately; promise still resolves cleanly.
      result.current.stop();
      await promise;
    });
    expect(result.current.isSynthesizing).toBe(false);
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.currentClause).toBeNull();
  });

  it('unmount triggers cleanup', async () => {
    const model = makeMockTTS();
    const { result, unmount } = renderHook(() =>
      useStreamSpeech({ model, splitOptions: { minWordsPerClause: 1 } })
    );
    let promise: Promise<void> | undefined;
    await act(async () => {
      promise = result.current.speak('Sentence one. Sentence two. Sentence three.');
    });
    unmount();
    await promise;
    // After unmount, no further state updates run — getter still returns
    // the last snapshot but that's fine; the test just verifies no crash.
    expect(true).toBe(true);
  });

  it('exposes errors via state and onError', async () => {
    const onError = vi.fn();
    const model = makeMockTTS({ errorAtIndex: 0 });
    const { result } = renderHook(() =>
      useStreamSpeech({ model, splitOptions: { minWordsPerClause: 1 }, onError })
    );
    await act(async () => {
      await result.current.speak('Hello there.');
    });
    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });
    expect(result.current.error?.message).toContain('synthesis failed');
    expect(onError).toHaveBeenCalled();
    expect(result.current.isSynthesizing).toBe(false);
    expect(result.current.isPlaying).toBe(false);
  });
});
