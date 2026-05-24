/**
 * TurnTaker Orchestrator Tests
 *
 * Builds a fake transcriber that exposes manual `triggerUtterance()` /
 * `triggerBargeIn()` helpers, and uses mock language/TTS models. Mocks
 * `Audio` and `URL.createObjectURL` so playback completes deterministically.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTurnTaker } from '../src/audio/turn-taker.js';
import {
  createMockLanguageModel,
  createMockTextToSpeechModel,
} from '../src/testing/index.js';
import type {
  LiveTranscriber,
  LiveUtterance,
  LiveBargeInListener,
  LiveErrorListener,
  LiveUtteranceListener,
  LiveChunkListener,
  LiveStateChangeListener,
} from '../src/audio/live-transcribe-types.js';

class FakeTranscriber implements LiveTranscriber {
  state: LiveTranscriber['state'] = 'idle';
  startCalls = 0;
  stopCalls = 0;
  disposeCalls = 0;

  private utteranceListeners = new Set<LiveUtteranceListener>();
  private bargeInListeners = new Set<LiveBargeInListener>();
  private errorListeners = new Set<LiveErrorListener>();
  private chunkListeners = new Set<LiveChunkListener>();
  private stateChangeListeners = new Set<LiveStateChangeListener>();

  async start() {
    this.startCalls++;
    this.state = 'listening';
  }
  async stop() {
    this.stopCalls++;
    this.state = 'idle';
  }
  async dispose() {
    this.disposeCalls++;
    this.state = 'disposed';
  }
  onUtteranceEnd(l: LiveUtteranceListener) {
    this.utteranceListeners.add(l);
    return () => this.utteranceListeners.delete(l);
  }
  onBargeIn(l: LiveBargeInListener) {
    this.bargeInListeners.add(l);
    return () => this.bargeInListeners.delete(l);
  }
  onError(l: LiveErrorListener) {
    this.errorListeners.add(l);
    return () => this.errorListeners.delete(l);
  }
  onChunk(l: LiveChunkListener) {
    this.chunkListeners.add(l);
    return () => this.chunkListeners.delete(l);
  }
  onStateChange(l: LiveStateChangeListener) {
    this.stateChangeListeners.add(l);
    return () => this.stateChangeListeners.delete(l);
  }

  // Test helpers
  triggerUtterance(text: string) {
    const audio = new Float32Array(16000);
    const u: LiveUtterance = {
      utteranceId: `u_${Date.now()}`,
      text,
      audio,
      durationSec: 1,
      truncated: false,
      timestamp: new Date(),
    };
    for (const l of this.utteranceListeners) l(u);
  }
  triggerBargeIn() {
    for (const l of this.bargeInListeners) l({ timestamp: new Date(), audioLevelDb: -10 });
  }
  triggerError(error: Error) {
    for (const l of this.errorListeners) l(error);
  }
}

// Audio mock that resolves immediately so we don't deadlock on play().
class MockAudio extends EventTarget {
  src = '';
  paused = false;
  ended = false;

  play() {
    // Resolve playback by firing 'ended' after a tick.
    queueMicrotask(() => {
      this.ended = true;
      this.dispatchEvent(new Event('ended'));
    });
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
    this.ended = true;
  }
  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    super.addEventListener(type, listener);
  }
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    super.removeEventListener(type, listener);
  }
}

let originalAudio: typeof globalThis.Audio | undefined;
let originalCreateObjectURL: typeof URL.createObjectURL | undefined;
let originalRevokeObjectURL: typeof URL.revokeObjectURL | undefined;

beforeEach(() => {
  originalAudio = (globalThis as { Audio?: typeof Audio }).Audio;
  (globalThis as { Audio: unknown }).Audio = MockAudio;
  originalCreateObjectURL = URL.createObjectURL;
  originalRevokeObjectURL = URL.revokeObjectURL;
  URL.createObjectURL = vi.fn(() => 'blob:mock');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  if (originalAudio !== undefined) {
    (globalThis as { Audio: unknown }).Audio = originalAudio;
  }
  if (originalCreateObjectURL) URL.createObjectURL = originalCreateObjectURL;
  if (originalRevokeObjectURL) URL.revokeObjectURL = originalRevokeObjectURL;
});

describe('createTurnTaker()', () => {
  it('drives a single turn end-to-end through the state machine', async () => {
    const transcriber = new FakeTranscriber();
    const planner = createMockLanguageModel({ mockResponse: 'hello back' });
    const voice = createMockTextToSpeechModel();

    const turn = await createTurnTaker({
      transcriber: transcriber as unknown as LiveTranscriber,
      planner,
      voice,
    });

    const transitions: string[] = [];
    turn.onStateTransition((e) => transitions.push(`${e.from}->${e.to}`));

    const userTexts: string[] = [];
    const agentTexts: string[] = [];
    turn.onUserUtterance((t) => userTexts.push(t));
    turn.onAgentResponse((t) => agentTexts.push(t));

    await turn.start();
    expect(turn.state).toBe('listening');

    transcriber.triggerUtterance('hello agent');

    // Wait for full async loop: planner -> tts -> playback.
    await new Promise((r) => setTimeout(r, 50));

    expect(userTexts).toEqual(['hello agent']);
    expect(agentTexts).toEqual(['hello back']);
    expect(transitions).toContain('idle->listening');
    expect(transitions).toContain('listening->planning');
    expect(transitions).toContain('planning->speaking');
    expect(transitions).toContain('speaking->listening');

    await turn.dispose();
  });

  it('barge-in during planning aborts the planner and returns to listening', async () => {
    const transcriber = new FakeTranscriber();
    // Slow planner so we can interrupt it.
    const planner = createMockLanguageModel({ mockResponse: 'never seen', delay: 200 });
    const voice = createMockTextToSpeechModel();

    const turn = await createTurnTaker({
      transcriber: transcriber as unknown as LiveTranscriber,
      planner,
      voice,
    });

    const bargeIns: number[] = [];
    turn.onBargeIn(() => bargeIns.push(Date.now()));

    const transitions: string[] = [];
    turn.onStateTransition((e) => transitions.push(`${e.from}->${e.to}`));

    await turn.start();
    transcriber.triggerUtterance('start a long answer');
    // Let planning begin.
    await new Promise((r) => setTimeout(r, 5));
    expect(turn.state).toBe('planning');

    transcriber.triggerBargeIn();

    expect(bargeIns.length).toBe(1);
    expect(turn.state).toBe('listening');
    expect(transitions).toContain('planning->listening');

    await turn.dispose();
  });

  it('interrupt() is the programmatic equivalent of barge-in', async () => {
    const transcriber = new FakeTranscriber();
    const planner = createMockLanguageModel({ mockResponse: 'long', delay: 200 });
    const voice = createMockTextToSpeechModel();

    const turn = await createTurnTaker({
      transcriber: transcriber as unknown as LiveTranscriber,
      planner,
      voice,
    });

    const bargeIns: unknown[] = [];
    turn.onBargeIn(() => bargeIns.push(true));

    await turn.start();
    transcriber.triggerUtterance('foo');
    await new Promise((r) => setTimeout(r, 5));

    turn.interrupt();
    expect(bargeIns.length).toBe(1);
    expect(turn.state).toBe('listening');

    await turn.dispose();
  });

  it('stop() halts the loop and disposes the transcriber on dispose()', async () => {
    const transcriber = new FakeTranscriber();
    const planner = createMockLanguageModel({ mockResponse: 'x' });
    const voice = createMockTextToSpeechModel();

    const turn = await createTurnTaker({
      transcriber: transcriber as unknown as LiveTranscriber,
      planner,
      voice,
    });

    await turn.start();
    await turn.stop();
    expect(transcriber.stopCalls).toBeGreaterThanOrEqual(1);
    expect(turn.state).toBe('idle');

    await turn.dispose();
    expect(transcriber.disposeCalls).toBe(1);
  });

  it('listener unsubscribe stops further notifications', async () => {
    const transcriber = new FakeTranscriber();
    const planner = createMockLanguageModel({ mockResponse: 'yo' });
    const voice = createMockTextToSpeechModel();

    const turn = await createTurnTaker({
      transcriber: transcriber as unknown as LiveTranscriber,
      planner,
      voice,
    });

    const transitions: string[] = [];
    const off = turn.onStateTransition((e) => transitions.push(`${e.from}->${e.to}`));

    await turn.start();
    expect(transitions.length).toBeGreaterThan(0);

    off();
    const before = transitions.length;

    await turn.stop();
    expect(transitions.length).toBe(before);

    await turn.dispose();
  });
});
