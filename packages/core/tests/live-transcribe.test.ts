/**
 * Live Transcribe Tests
 *
 * Mocks `navigator.mediaDevices.getUserMedia` and `AudioContext`. Uses a
 * custom in-memory `VADProvider` so the tests do not depend on
 * AudioWorklet support.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLiveTranscriber } from '../src/audio/live-transcribe.js';
import { createMockSpeechToTextModel } from '../src/testing/index.js';
import type { VADProvider, VADStartOptions } from '../src/audio/vad/types.js';

// ── Test doubles ─────────────────────────────────────────────────────────────

class MockMediaStreamTrack extends EventTarget {
  readyState: 'live' | 'ended' = 'live';
  kind = 'audio';
  stop = vi.fn(() => {
    this.readyState = 'ended';
  });
}

class MockMediaStream {
  private tracks: MockMediaStreamTrack[];
  constructor(tracks: MockMediaStreamTrack[]) {
    this.tracks = tracks;
  }
  getTracks() {
    return this.tracks;
  }
  getAudioTracks() {
    return this.tracks;
  }
}

class MockAudioContext {
  state: AudioContextState = 'running';
  audioWorklet: undefined; // force fallback / never-actually-used path
  destination = {} as AudioDestinationNode;
  sampleRate = 16000;
  createMediaStreamSource = vi.fn(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
  }));
  createScriptProcessor = vi.fn(() => {
    const node = new MockScriptProcessorNode();
    scriptProcessors.push(node);
    return node;
  });
  close = vi.fn(async () => {
    this.state = 'closed';
  });
  resume = vi.fn(async () => {
    this.state = 'running';
  });
}

class MockScriptProcessorNode extends EventTarget {
  connect = vi.fn();
  disconnect = vi.fn();

  emit(samples: Float32Array): void {
    const event = new Event('audioprocess') as Event & {
      inputBuffer: { getChannelData: () => Float32Array };
    };
    Object.defineProperty(event, 'inputBuffer', {
      value: {
        getChannelData: () => samples,
      },
    });
    this.dispatchEvent(event);
  }
}

/** Custom in-memory VAD that lets tests fire speech-start/end manually. */
class InMemoryVAD implements VADProvider {
  readonly provider: string;
  readonly frameSize = 512;
  readonly sampleRate = 16000;

  private opts: VADStartOptions | null = null;
  startCalls = 0;
  stopCalls = 0;
  disposeCalls = 0;
  processFrameCalls = 0;
  processedSamples: Float32Array[] = [];

  constructor(provider = 'memory') {
    this.provider = provider;
  }

  async start(opts: VADStartOptions): Promise<void> {
    this.opts = opts;
    this.startCalls++;
  }
  processFrame(samples: Float32Array): void {
    this.processFrameCalls++;
    this.processedSamples.push(new Float32Array(samples));
  }
  async stop(): Promise<void> {
    this.stopCalls++;
  }
  async dispose(): Promise<void> {
    this.disposeCalls++;
  }

  // Test helpers
  fireSpeechStart(rmsDb = -10) {
    this.opts?.onSpeechStart({ timestamp: Date.now(), rmsDb });
  }
  fireSpeechEnd(rmsDb = -100) {
    this.opts?.onSpeechEnd({ timestamp: Date.now(), rmsDb });
  }
  fireFrame(samples: Float32Array, rmsDb = -10) {
    this.opts?.onFrame?.({ samples, rmsDb, timestamp: Date.now() });
  }
}

// ── Global setup ─────────────────────────────────────────────────────────────

let originalGetUserMedia: typeof navigator.mediaDevices.getUserMedia | undefined;
let originalAudioContext: typeof globalThis.AudioContext | undefined;
let scriptProcessors: MockScriptProcessorNode[] = [];

beforeEach(() => {
  scriptProcessors = [];
  // Mock navigator.mediaDevices.getUserMedia
  if (!('mediaDevices' in navigator)) {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {},
    });
  }
  originalGetUserMedia = navigator.mediaDevices.getUserMedia;
  navigator.mediaDevices.getUserMedia = vi.fn(async () => {
    return new MockMediaStream([new MockMediaStreamTrack()]) as unknown as MediaStream;
  }) as typeof navigator.mediaDevices.getUserMedia;

  // Mock AudioContext
  originalAudioContext = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
  (globalThis as { AudioContext: unknown }).AudioContext = MockAudioContext;
  // Also expose ScriptProcessorNode so isLiveTranscribeSupported() returns true
  // even though our MockAudioContext doesn't have audioWorklet.
  if (!('ScriptProcessorNode' in globalThis)) {
    (globalThis as { ScriptProcessorNode?: unknown }).ScriptProcessorNode = class {};
  }
});

afterEach(() => {
  if (originalGetUserMedia !== undefined) {
    navigator.mediaDevices.getUserMedia = originalGetUserMedia;
  }
  if (originalAudioContext !== undefined) {
    (globalThis as { AudioContext: unknown }).AudioContext = originalAudioContext;
  }
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('createLiveTranscriber()', () => {
  it('returns a controller in idle state', async () => {
    const model = createMockSpeechToTextModel({ mockText: 'hello' });
    const vad = new InMemoryVAD();

    const controller = await createLiveTranscriber({
      model,
      mode: 'push-to-talk',
      vad,
    });

    expect(controller.state).toBe('idle');
    expect(typeof controller.start).toBe('function');
    expect(typeof controller.stop).toBe('function');
    expect(typeof controller.dispose).toBe('function');
    expect(typeof controller.onChunk).toBe('function');
    expect(typeof controller.onUtteranceEnd).toBe('function');
    await controller.dispose();
  });

  it('rejects with AbortError when abortSignal is already aborted at construction', async () => {
    const model = createMockSpeechToTextModel();
    const vad = new InMemoryVAD();
    const ctrl = new AbortController();
    ctrl.abort();

    await expect(
      createLiveTranscriber({
        model,
        vad,
        abortSignal: ctrl.signal,
      })
    ).rejects.toThrow();
  });

  it('propagates getUserMedia rejection', async () => {
    navigator.mediaDevices.getUserMedia = vi.fn(async () => {
      const e = new Error('mic blocked');
      e.name = 'NotAllowedError';
      throw e;
    }) as typeof navigator.mediaDevices.getUserMedia;

    const model = createMockSpeechToTextModel();
    const vad = new InMemoryVAD();

    await expect(
      createLiveTranscriber({ model, vad })
    ).rejects.toThrow('mic blocked');
  });

  it("vad: 'silero' throws ValidationError pointing to transformers.vad()", async () => {
    const model = createMockSpeechToTextModel();
    let caught: unknown;
    try {
      await createLiveTranscriber({ model, vad: 'silero' });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    const err = caught as { hint?: string; message?: string };
    expect(err.hint ?? '').toMatch(/transformers\.vad/);
  });

  it('feeds microphone worklet frames into an external VAD provider', async () => {
    const model = createMockSpeechToTextModel({ mockText: 'hello world' });
    const vad = new InMemoryVAD('transformers');
    const controller = await createLiveTranscriber({
      model,
      mode: 'open-mic',
      vad,
      chunkInterval: 0,
    });

    await controller.start();
    expect(scriptProcessors).toHaveLength(1);
    const samples = new Float32Array(512);
    samples.fill(0.08);
    scriptProcessors[0]!.emit(samples);

    expect(vad.processFrameCalls).toBeGreaterThan(0);
    expect(vad.processedSamples[0]?.[0]).toBeCloseTo(0.08);
    await controller.dispose();
  });

  it('buffers raw microphone frames while an external VAD controls speech boundaries', async () => {
    const model = createMockSpeechToTextModel({ mockText: 'hello world' });
    const vad = new InMemoryVAD('transformers');
    const controller = await createLiveTranscriber({
      model,
      mode: 'open-mic',
      vad,
      chunkInterval: 0,
    });
    const utterances: Array<{ text: string; durationSec: number; audio: Float32Array }> = [];
    controller.onUtteranceEnd((utterance) => utterances.push(utterance));

    await controller.start();
    expect(scriptProcessors).toHaveLength(1);

    vad.fireSpeechStart();
    const samples = new Float32Array(512);
    samples.fill(0.12);
    scriptProcessors[0]!.emit(samples);
    vad.fireSpeechEnd();

    await vi.waitFor(() => {
      expect(utterances).toHaveLength(1);
    });
    expect(utterances[0]!.text).toBe('hello world');
    expect(utterances[0]!.audio.length).toBe(512);
    expect(utterances[0]!.durationSec).toBeCloseTo(512 / 16000);
    await controller.dispose();
  });
});

describe('LiveTranscriber push-to-talk', () => {
  it('start() transitions idle → listening and emits a final chunk on stop()', async () => {
    const model = createMockSpeechToTextModel({ mockText: 'hello world' });
    const vad = new InMemoryVAD();

    const controller = await createLiveTranscriber({
      model,
      mode: 'push-to-talk',
      vad,
      chunkInterval: 0, // disable partial chunks for determinism
    });

    const states: string[] = [];
    controller.onStateChange((e) => states.push(`${e.from}->${e.to}`));

    const chunks: Array<{ text: string; isFinal: boolean }> = [];
    controller.onChunk((c) => chunks.push({ text: c.text, isFinal: c.isFinal }));

    const utterances: string[] = [];
    controller.onUtteranceEnd((u) => utterances.push(u.text));

    await controller.start();
    expect(controller.state).toBe('listening');
    expect(states).toContain('idle->listening');
    expect(vad.startCalls).toBe(1);

    // Push some audio frames into the in-memory VAD (which forwards to the controller).
    const frame = new Float32Array(512);
    frame.fill(0.05);
    vad.fireFrame(frame);
    vad.fireFrame(frame);

    await controller.stop();

    expect(controller.state).toBe('idle');
    expect(states).toContain('listening->idle');
    expect(chunks.some((c) => c.isFinal)).toBe(true);
    expect(utterances.length).toBe(1);
    expect(utterances[0]).toBe('hello world');

    await controller.dispose();
  });

  it('long pauses do NOT auto-end the utterance in push-to-talk', async () => {
    const model = createMockSpeechToTextModel({ mockText: 't' });
    const vad = new InMemoryVAD();
    const controller = await createLiveTranscriber({
      model,
      mode: 'push-to-talk',
      vad,
      chunkInterval: 0,
    });
    const utterances: string[] = [];
    controller.onUtteranceEnd((u) => utterances.push(u.text));
    await controller.start();

    // Even if the VAD reports speech-end (e.g. spurious), push-to-talk ignores it.
    vad.fireSpeechEnd();

    expect(utterances.length).toBe(0);
    await controller.dispose();
  });
});

describe('LiveTranscriber open-mic', () => {
  it('VAD speech-start begins an utterance and speech-end emits a final chunk', async () => {
    const model = createMockSpeechToTextModel({ mockText: 'open mic test' });
    const vad = new InMemoryVAD();
    const controller = await createLiveTranscriber({
      model,
      mode: 'open-mic',
      vad,
      chunkInterval: 0,
    });

    const utterances: string[] = [];
    controller.onUtteranceEnd((u) => utterances.push(u.text));

    await controller.start();
    vad.fireSpeechStart();
    const frame = new Float32Array(512);
    frame.fill(0.05);
    vad.fireFrame(frame);
    vad.fireFrame(frame);
    vad.fireSpeechEnd();

    // Allow microtasks for the async final-chunk transcribe.
    await new Promise((r) => setTimeout(r, 0));

    expect(utterances.length).toBe(1);
    expect(utterances[0]).toBe('open mic test');
    expect(controller.state).toBe('listening');

    await controller.dispose();
  });

  it('supports multiple utterances in one open-mic session', async () => {
    const model = createMockSpeechToTextModel({ mockText: 'utt' });
    const vad = new InMemoryVAD();
    const controller = await createLiveTranscriber({
      model,
      mode: 'open-mic',
      vad,
      chunkInterval: 0,
    });
    const utterances: string[] = [];
    controller.onUtteranceEnd((u) => utterances.push(u.text));

    await controller.start();

    const frame = new Float32Array(512);
    frame.fill(0.05);

    // Utterance 1
    vad.fireSpeechStart();
    vad.fireFrame(frame);
    vad.fireSpeechEnd();
    await new Promise((r) => setTimeout(r, 0));

    // Utterance 2
    vad.fireSpeechStart();
    vad.fireFrame(frame);
    vad.fireSpeechEnd();
    await new Promise((r) => setTimeout(r, 0));

    expect(utterances.length).toBe(2);
    await controller.dispose();
  });

  it('can gate speech-start without emitting a malformed utterance', async () => {
    const model = createMockSpeechToTextModel({ mockText: 'user speech' });
    const vad = new InMemoryVAD();
    let allowStart = false;
    const controller = await createLiveTranscriber({
      model,
      mode: 'open-mic',
      vad,
      chunkInterval: 0,
      shouldStartUtterance: () => allowStart,
    });
    const utterances: string[] = [];
    controller.onUtteranceEnd((u) => utterances.push(u.text));

    await controller.start();

    const frame = new Float32Array(512);
    frame.fill(0.05);

    vad.fireSpeechStart();
    vad.fireFrame(frame);
    vad.fireSpeechEnd();
    await new Promise((r) => setTimeout(r, 0));
    expect(utterances).toEqual([]);

    allowStart = true;
    vad.fireSpeechStart();
    vad.fireFrame(frame);
    vad.fireSpeechEnd();
    await new Promise((r) => setTimeout(r, 0));
    expect(utterances).toEqual(['user speech']);

    await controller.dispose();
  });
});

describe('LiveTranscriber barge-in', () => {
  it('fires onBargeIn when speechStart occurs while playback isPlaying()', async () => {
    const model = createMockSpeechToTextModel({ mockText: 'x' });
    const vad = new InMemoryVAD();
    const stop = vi.fn();
    const handle = {
      isPlaying: vi.fn(() => true),
      stop,
    };

    const controller = await createLiveTranscriber({
      model,
      mode: 'open-mic',
      vad,
      bargeInWhilePlaying: handle,
      chunkInterval: 0,
    });

    const bargeIns: number[] = [];
    controller.onBargeIn((e) => bargeIns.push(e.audioLevelDb));

    await controller.start();
    vad.fireSpeechStart(-12);

    expect(bargeIns.length).toBe(1);
    expect(stop).toHaveBeenCalledTimes(1);

    await controller.dispose();
  });

  it('does NOT fire onBargeIn when handle.isPlaying() is false', async () => {
    const model = createMockSpeechToTextModel();
    const vad = new InMemoryVAD();
    const handle = {
      isPlaying: vi.fn(() => false),
      stop: vi.fn(),
    };

    const controller = await createLiveTranscriber({
      model,
      mode: 'open-mic',
      vad,
      bargeInWhilePlaying: handle,
      chunkInterval: 0,
    });
    const bargeIns: number[] = [];
    controller.onBargeIn((e) => bargeIns.push(e.audioLevelDb));

    await controller.start();
    vad.fireSpeechStart();

    expect(bargeIns.length).toBe(0);
    expect(handle.stop).not.toHaveBeenCalled();
    await controller.dispose();
  });
});

describe('LiveTranscriber abort and dispose', () => {
  it('dispose() is idempotent and stops the VAD provider', async () => {
    const model = createMockSpeechToTextModel();
    const vad = new InMemoryVAD();
    const controller = await createLiveTranscriber({ model, vad });
    await controller.start();
    await controller.dispose();
    await expect(controller.dispose()).resolves.toBeUndefined();
    expect(controller.state).toBe('disposed');
    // User-owned VAD: controller calls stop() but not dispose().
    expect(vad.stopCalls).toBeGreaterThanOrEqual(1);
  });

  it('start() after dispose() throws', async () => {
    const model = createMockSpeechToTextModel();
    const vad = new InMemoryVAD();
    const controller = await createLiveTranscriber({ model, vad });
    await controller.dispose();
    await expect(controller.start()).rejects.toThrow(/disposed/);
  });

  it('external abortSignal disposes the controller and emits onError', async () => {
    const model = createMockSpeechToTextModel();
    const vad = new InMemoryVAD();
    const ac = new AbortController();
    const controller = await createLiveTranscriber({
      model,
      vad,
      abortSignal: ac.signal,
    });

    const errors: Error[] = [];
    controller.onError((e) => errors.push(e));

    await controller.start();
    ac.abort();
    // Allow async dispose to run.
    await new Promise((r) => setTimeout(r, 0));

    expect(errors.length).toBe(1);
    expect(controller.state).toBe('disposed');
  });
});
