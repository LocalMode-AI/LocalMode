/**
 * playStreamedSpeech() Tests
 *
 * Uses a fake AudioContext (vitest-style mock) since jsdom does not
 * implement Web Audio. Verifies gap-free scheduling, pause/resume,
 * stop, abort, sample-rate mismatch, and onClause/onClauseEnd callbacks.
 *
 * @packageDocumentation
 */

import { describe, it, expect, vi } from 'vitest';
import { playStreamedSpeech } from '../src/audio/index.js';
import type { SynthesizedClause } from '../src/audio/index.js';

interface FakeBufferSource {
  buffer: { duration: number; sampleRate: number; length: number } | null;
  startCalls: number[];
  stopCalls: number;
  onended: (() => void) | null;
  connect: (dest: unknown) => void;
  disconnect: () => void;
  start: (when: number) => void;
  stop: () => void;
}

interface FakeAudioContext {
  currentTime: number;
  state: 'running' | 'suspended' | 'closed';
  destination: object;
  sources: FakeBufferSource[];
  createBuffer: (channels: number, length: number, sampleRate: number) => {
    duration: number;
    length: number;
    sampleRate: number;
    copyToChannel: (data: Float32Array, ch: number) => void;
  };
  createBufferSource: () => FakeBufferSource;
  suspend: () => Promise<void>;
  resume: () => Promise<void>;
  close: () => Promise<void>;
  closeCalls: number;
  /** Helper: fire `onended` for the source created at `index`. */
  endSource: (index: number) => void;
}

function makeFakeAudioContext(initialState: 'running' | 'suspended' = 'running'): FakeAudioContext {
  const ctx: FakeAudioContext = {
    currentTime: 0,
    state: initialState,
    destination: {},
    sources: [],
    closeCalls: 0,
    createBuffer(_channels: number, length: number, sampleRate: number) {
      return {
        duration: length / sampleRate,
        length,
        sampleRate,
        copyToChannel: () => {
          /* no-op */
        },
      };
    },
    createBufferSource() {
      const src: FakeBufferSource = {
        buffer: null,
        startCalls: [],
        stopCalls: 0,
        onended: null,
        connect() {
          /* no-op */
        },
        disconnect() {
          /* no-op */
        },
        start(when: number) {
          src.startCalls.push(when);
        },
        stop() {
          src.stopCalls++;
        },
      };
      ctx.sources.push(src);
      return src;
    },
    async suspend() {
      ctx.state = 'suspended';
    },
    async resume() {
      ctx.state = 'running';
    },
    async close() {
      ctx.state = 'closed';
      ctx.closeCalls++;
    },
    endSource(index: number) {
      const src = ctx.sources[index];
      src.onended?.();
    },
  };
  return ctx;
}

function clause(index: number, durationSec: number, sampleRate = 24000): SynthesizedClause {
  const samples = new Float32Array(Math.floor(sampleRate * durationSec));
  return {
    audio: samples,
    text: `clause ${index}`,
    sampleRate,
    clauseIndex: index,
    usage: { characterCount: 10, durationMs: 100 },
  };
}

async function* streamFrom(clauses: SynthesizedClause[]): AsyncIterable<SynthesizedClause> {
  for (const c of clauses) {
    yield c;
  }
}

/**
 * Stream with a fail injected at index k. We use a manual iterator (not
 * an async generator) so the rejection doesn't trigger Node's transient
 * unhandled-rejection detection while transitioning through the
 * generator's "errored" state.
 */
function streamThatThrows(
  clauses: SynthesizedClause[],
  throwAt: number
): AsyncIterableIterator<SynthesizedClause> {
  let i = 0;
  return {
    async next() {
      if (i === throwAt) throw new Error('upstream failure');
      if (i >= clauses.length) return { value: undefined, done: true };
      const v = clauses[i++];
      return { value: v, done: false };
    },
    async return() {
      return { value: undefined, done: true };
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };
}

/** Allow microtasks to flush. */
async function flush() {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

describe('playStreamedSpeech()', () => {
  it('schedules clauses gap-free (start times line up with previous end)', async () => {
    const ctx = makeFakeAudioContext();
    const clauses = [clause(0, 1, 24000), clause(1, 1, 24000), clause(2, 1, 24000)];
    const handle = await playStreamedSpeech(streamFrom(clauses), ctx as unknown as AudioContext);
    await flush();
    await flush();
    await flush();
    expect(ctx.sources.length).toBe(3);
    // Each subsequent start ~= previous start + 1.0
    const s0 = ctx.sources[0].startCalls[0];
    const s1 = ctx.sources[1].startCalls[0];
    const s2 = ctx.sources[2].startCalls[0];
    expect(s1 - s0).toBeCloseTo(1.0, 5);
    expect(s2 - s1).toBeCloseTo(1.0, 5);
    // Fire onended for all so playing resolves cleanly.
    for (let i = 0; i < ctx.sources.length; i++) ctx.endSource(i);
    await handle.playing;
  });

  it('pause() suspends the AudioContext', async () => {
    const ctx = makeFakeAudioContext();
    const suspendSpy = vi.spyOn(ctx, 'suspend');
    const handle = await playStreamedSpeech(streamFrom([clause(0, 1)]), ctx as unknown as AudioContext);
    handle.pause();
    expect(suspendSpy).toHaveBeenCalled();
    handle.stop();
    await handle.playing;
  });

  it('resume() resumes the AudioContext', async () => {
    const ctx = makeFakeAudioContext('running');
    const handle = await playStreamedSpeech(streamFrom([clause(0, 1)]), ctx as unknown as AudioContext);
    handle.pause();
    expect(ctx.state).toBe('suspended');
    const resumeSpy = vi.spyOn(ctx, 'resume');
    handle.resume();
    expect(resumeSpy).toHaveBeenCalled();
    handle.stop();
    await handle.playing;
  });

  it('auto-resumes a suspended AudioContext on first schedule', async () => {
    const ctx = makeFakeAudioContext('suspended');
    const resumeSpy = vi.spyOn(ctx, 'resume');
    const handle = await playStreamedSpeech(streamFrom([clause(0, 1)]), ctx as unknown as AudioContext);
    expect(resumeSpy).toHaveBeenCalled();
    expect(ctx.state).toBe('running');
    handle.stop();
    await handle.playing;
  });

  it('stop() halts upstream and resolves playing', async () => {
    const ctx = makeFakeAudioContext();
    let producedCount = 0;
    let returned = false;
    // Bounded stream — yields one clause per call but yields a macrotask
    // between iterations so the consumer's tight loop cannot busy-spin.
    const stream: AsyncIterableIterator<SynthesizedClause> = {
      async next() {
        if (returned) return { value: undefined, done: true };
        await new Promise((r) => setTimeout(r, 0));
        if (returned) return { value: undefined, done: true };
        producedCount++;
        return { value: clause(producedCount - 1, 1), done: false };
      },
      async return() {
        returned = true;
        return { value: undefined, done: true };
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    };
    const handle = await playStreamedSpeech(stream, ctx as unknown as AudioContext);
    await flush();
    handle.stop();
    await handle.playing; // resolves, never rejects
    expect(returned).toBe(true);
  });

  it('abort rejects playing with the abort reason', async () => {
    const ctx = makeFakeAudioContext();
    const controller = new AbortController();
    let returned = false;
    const stream: AsyncIterableIterator<SynthesizedClause> = {
      async next() {
        if (returned) return { value: undefined, done: true };
        await new Promise((r) => setTimeout(r, 0));
        if (returned) return { value: undefined, done: true };
        return { value: clause(0, 1), done: false };
      },
      async return() {
        returned = true;
        return { value: undefined, done: true };
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    };
    const handle = await playStreamedSpeech(stream, ctx as unknown as AudioContext, {
      abortSignal: controller.signal,
    });
    await flush();
    controller.abort(new Error('user cancel'));
    await expect(handle.playing).rejects.toBeDefined();
    expect(returned).toBe(true);
  });

  it('rejects on mismatched sample rate', async () => {
    const ctx = makeFakeAudioContext();
    const clauses = [clause(0, 1, 24000), clause(1, 1, 16000)];
    const handle = await playStreamedSpeech(streamFrom(clauses), ctx as unknown as AudioContext);
    await expect(handle.playing).rejects.toThrow(/sample rate mismatch/);
  });

  it('does not close the AudioContext on stop()', async () => {
    const ctx = makeFakeAudioContext();
    const handle = await playStreamedSpeech(streamFrom([clause(0, 1)]), ctx as unknown as AudioContext);
    handle.stop();
    await handle.playing;
    expect(ctx.closeCalls).toBe(0);
  });

  it('fires onClause when source starts and onClauseEnd on onended', async () => {
    const ctx = makeFakeAudioContext();
    const onClauseStarts: number[] = [];
    const onClauseEnds: number[] = [];
    const handle = await playStreamedSpeech(
      streamFrom([clause(0, 1), clause(1, 1)]),
      ctx as unknown as AudioContext,
      {
        onClause: (c) => onClauseStarts.push(c.clauseIndex),
        onClauseEnd: (c) => onClauseEnds.push(c.clauseIndex),
      }
    );
    await flush();
    await flush();
    expect(onClauseStarts).toEqual([0, 1]);
    expect(onClauseEnds).toEqual([]);
    ctx.endSource(0);
    ctx.endSource(1);
    expect(onClauseEnds).toEqual([0, 1]);
    await handle.playing;
  });

  it('rejects playing when the upstream iterable throws', async () => {
    const ctx = makeFakeAudioContext();
    const handle = await playStreamedSpeech(
      streamThatThrows([clause(0, 1), clause(1, 1)], 1),
      ctx as unknown as AudioContext
    );
    // Attach a passive rejection handler synchronously to silence Node's
    // unhandled-rejection tracker; the original `handle.playing` still
    // rejects and is asserted on below.
    handle.playing.catch(() => {});
    await flush();
    ctx.endSource(0);
    await expect(handle.playing).rejects.toThrow(/upstream failure/);
  });
});
