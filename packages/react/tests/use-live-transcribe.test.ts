/**
 * @file use-live-transcribe.test.tsx
 * @description Tests for the useLiveTranscribe React hook
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLiveTranscribe } from '../src/hooks/use-live-transcribe.js';

// Mock @localmode/core's createLiveTranscriber so we don't depend on AudioContext.
vi.mock('@localmode/core', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@localmode/core');

  // Lightweight fake controller used by the mocked createLiveTranscriber.
  class FakeController {
    state: 'idle' | 'listening' | 'transcribing' | 'error' | 'disposed' = 'idle';
    private chunkListeners = new Set<(chunk: unknown) => void>();
    private utteranceListeners = new Set<(u: unknown) => void>();
    private bargeInListeners = new Set<(e: unknown) => void>();
    private errorListeners = new Set<(e: unknown) => void>();
    private stateChangeListeners = new Set<(e: unknown) => void>();

    async start() {
      this.state = 'listening';
      for (const l of this.stateChangeListeners) {
        l({ from: 'idle', to: 'listening', timestamp: new Date() });
      }
    }
    async stop() {
      const prev = this.state;
      this.state = 'idle';
      for (const l of this.stateChangeListeners) {
        l({ from: prev, to: 'idle', timestamp: new Date() });
      }
    }
    async dispose() {
      const prev = this.state;
      this.state = 'disposed';
      for (const l of this.stateChangeListeners) {
        l({ from: prev, to: 'disposed', timestamp: new Date() });
      }
    }
    onChunk(l: (c: unknown) => void) {
      this.chunkListeners.add(l);
      return () => this.chunkListeners.delete(l);
    }
    onUtteranceEnd(l: (u: unknown) => void) {
      this.utteranceListeners.add(l);
      return () => this.utteranceListeners.delete(l);
    }
    onBargeIn(l: (e: unknown) => void) {
      this.bargeInListeners.add(l);
      return () => this.bargeInListeners.delete(l);
    }
    onError(l: (e: unknown) => void) {
      this.errorListeners.add(l);
      return () => this.errorListeners.delete(l);
    }
    onStateChange(l: (e: unknown) => void) {
      this.stateChangeListeners.add(l);
      return () => this.stateChangeListeners.delete(l);
    }

    // Test helpers exposed on the fake.
    fireChunk(chunk: unknown) {
      for (const l of this.chunkListeners) l(chunk);
    }
    fireUtterance(u: unknown) {
      for (const l of this.utteranceListeners) l(u);
    }
  }

  // Track the most recently created controller so tests can poke it.
  const created: FakeController[] = [];
  (globalThis as { __lastFakeController__?: () => FakeController }).__lastFakeController__ = () =>
    created[created.length - 1];

  return {
    ...actual,
    createLiveTranscriber: vi.fn(async () => {
      const c = new FakeController();
      created.push(c);
      return c;
    }),
  };
});

beforeEach(() => {
  // Ensure the spy is cleared between tests.
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useLiveTranscribe', () => {
  it('does NOT auto-construct the controller on mount', async () => {
    const { createLiveTranscriber } = await import('@localmode/core');
    renderHook(() =>
      useLiveTranscribe({
        // The model is unused by our fake; the mock ignores it.
        model: { modelId: 'test', provider: 'test', doTranscribe: async () => ({ text: '', usage: { audioDurationSec: 0, durationMs: 0 } }) } as unknown as Parameters<typeof useLiveTranscribe>[0]['model'],
      })
    );
    expect(createLiveTranscriber).not.toHaveBeenCalled();
  });

  it('lazy-constructs on start() and updates state to listening', async () => {
    const { createLiveTranscriber } = await import('@localmode/core');
    const { result } = renderHook(() =>
      useLiveTranscribe({
        model: { modelId: 't', provider: 't', doTranscribe: async () => ({ text: '', usage: { audioDurationSec: 0, durationMs: 0 } }) } as unknown as Parameters<typeof useLiveTranscribe>[0]['model'],
      })
    );
    expect(result.current.state).toBe('idle');

    await act(async () => {
      await result.current.start();
    });

    expect(createLiveTranscriber).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe('listening');
    expect(result.current.isListening).toBe(true);
  });

  it('updates currentChunks and lastUtterance from controller events', async () => {
    const { result } = renderHook(() =>
      useLiveTranscribe({
        model: { modelId: 't', provider: 't', doTranscribe: async () => ({ text: '', usage: { audioDurationSec: 0, durationMs: 0 } }) } as unknown as Parameters<typeof useLiveTranscribe>[0]['model'],
      })
    );

    await act(async () => {
      await result.current.start();
    });

    const fake = (globalThis as { __lastFakeController__: () => { fireChunk(c: unknown): void; fireUtterance(u: unknown): void } }).__lastFakeController__();

    await act(async () => {
      fake.fireChunk({
        text: 'hello',
        audioDurationSec: 0.5,
        isFinal: false,
        chunkIndex: 0,
        utteranceId: 'u1',
        timestamp: new Date(),
      });
    });
    expect(result.current.currentUtterance).toBe('hello');
    expect(result.current.currentChunks.length).toBe(1);

    await act(async () => {
      fake.fireUtterance({
        utteranceId: 'u1',
        text: 'hello world',
        durationSec: 1,
        audio: new Float32Array(0),
        truncated: false,
        timestamp: new Date(),
      });
    });
    expect(result.current.lastUtterance?.text).toBe('hello world');
    // currentChunks resets after utterance end.
    expect(result.current.currentChunks.length).toBe(0);
  });

  it('disposes on unmount', async () => {
    const { result, unmount } = renderHook(() =>
      useLiveTranscribe({
        model: { modelId: 't', provider: 't', doTranscribe: async () => ({ text: '', usage: { audioDurationSec: 0, durationMs: 0 } }) } as unknown as Parameters<typeof useLiveTranscribe>[0]['model'],
      })
    );

    await act(async () => {
      await result.current.start();
    });

    const fake = (globalThis as { __lastFakeController__: () => { state: string } }).__lastFakeController__();
    expect(fake.state).toBe('listening');

    unmount();
    // dispose runs async; spin once.
    await new Promise((r) => setTimeout(r, 0));
    expect(fake.state).toBe('disposed');
  });
});
