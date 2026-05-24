/**
 * Web Audio Playback Queue
 *
 * Pure Web Audio glue (no dependencies) that consumes an
 * `AsyncIterable<SynthesizedClause>` (typically produced by
 * `streamSynthesizeSpeech()`) and schedules each clause as an
 * `AudioBufferSourceNode` on a caller-provided `AudioContext` so clause
 * `n+1` begins immediately after clause `n` ends (gap-free playback).
 *
 * The caller owns the `AudioContext` — Safari and mobile browsers require
 * the context be created or resumed inside a user-gesture handler, which
 * the helper cannot do for the caller. The helper never closes the
 * context.
 *
 * @packageDocumentation
 */

import type {
  PlayStreamedSpeechHandle,
  PlayStreamedSpeechOptions,
  SynthesizedClause,
} from './types.js';

/** Tiny epsilon to keep newly-scheduled clauses safely in the future. */
const SCHEDULE_EPSILON_SEC = 0.005;

/**
 * Convert a `Float32Array` of mono samples to an `AudioBuffer` on the
 * given context. Uses `copyToChannel` rather than the deprecated
 * `getChannelData` mutation pattern.
 */
function floatToAudioBuffer(
  samples: Float32Array,
  sampleRate: number,
  audioContext: AudioContext
): AudioBuffer {
  const buffer = audioContext.createBuffer(1, samples.length, sampleRate);
  // `copyToChannel` is typed `Float32Array<ArrayBuffer>` in lib.dom (TS 5.7+),
  // which is narrower than `Float32Array<ArrayBufferLike>`. Cast to `any`
  // to keep the helper signature simple for callers — the runtime accepts
  // either, and we never construct samples on a `SharedArrayBuffer`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  buffer.copyToChannel(samples as any, 0);
  return buffer;
}

/**
 * Play a stream of synthesized clauses gap-free on the caller's `AudioContext`.
 *
 * Returns a {@link PlayStreamedSpeechHandle} that exposes `pause` / `resume`
 * / `stop` and a `playing` promise that resolves when the last clause
 * finishes (or rejects on error / abort / sample-rate mismatch).
 *
 * The helper:
 *   - lazily calls `audioContext.resume()` on first schedule if the
 *     context is suspended;
 *   - schedules each clause at `max(nextStartTime, currentTime + ε)` to
 *     keep playback gap-free even when the iterable is slower than
 *     real-time (the worst case is an audible gap, never an overlap);
 *   - asserts every clause has the same `sampleRate` as the first;
 *   - on `stop()` halts upstream synthesis via `iterator.return()`;
 *   - on `abortSignal` abort, halts upstream and rejects `playing`.
 *
 * The helper does NOT close the `AudioContext` — the caller is responsible
 * for `audioContext.close()` cleanup.
 *
 * @example Full voice-loop
 * ```ts
 * import { streamSynthesizeSpeech, playStreamedSpeech } from '@localmode/core';
 *
 * function onSpeakClick() { // user gesture — context creation is allowed here
 *   const ctx = new AudioContext();
 *   const stream = streamSynthesizeSpeech({ model, text, voice: 'af_heart' });
 *   const handle = await playStreamedSpeech(stream, ctx, {
 *     onClause: (c) => console.log('start', c.clauseIndex),
 *     onClauseEnd: (c) => console.log('end', c.clauseIndex),
 *   });
 *   handle.playing.then(() => ctx.close());
 * }
 * ```
 */
export async function playStreamedSpeech(
  stream: AsyncIterable<SynthesizedClause>,
  audioContext: AudioContext,
  options: PlayStreamedSpeechOptions = {}
): Promise<PlayStreamedSpeechHandle> {
  const { abortSignal, onClause, onClauseEnd } = options;

  // Acquire the iterator manually so we can call `return()` on stop / abort.
  const iterator = (stream as AsyncIterable<SynthesizedClause>)[Symbol.asyncIterator]();

  let firstSampleRate: number | null = null;
  let nextStartTime = audioContext.currentTime;
  const scheduledSources = new Set<AudioBufferSourceNode>();

  let stopped = false;
  let resolvePlaying!: () => void;
  let rejectPlaying!: (reason: unknown) => void;
  let resolved = false;
  const playing = new Promise<void>((res, rej) => {
    resolvePlaying = res;
    rejectPlaying = rej;
  });
  const settle = (action: 'resolve' | 'reject', reason?: unknown) => {
    if (resolved) return;
    resolved = true;
    if (action === 'resolve') resolvePlaying();
    else rejectPlaying(reason);
  };

  // Tracking for "all clauses ended" coordination.
  let endedClauseCount = 0;
  let scheduledClauseCount = 0;
  let producerDone = false;

  const tryFinishIfDone = () => {
    if (producerDone && endedClauseCount === scheduledClauseCount) {
      settle('resolve');
    }
  };

  const stopAllSources = () => {
    for (const src of scheduledSources) {
      try {
        src.stop();
      } catch {
        // already stopped — ignore
      }
      try {
        src.disconnect();
      } catch {
        // already disconnected — ignore
      }
    }
    scheduledSources.clear();
  };

  const haltUpstream = () => {
    if (typeof iterator.return === 'function') {
      // Fire-and-forget; we don't await iterator.return().
      iterator.return().catch(() => {
        /* ignore */
      });
    }
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    stopAllSources();
    haltUpstream();
    settle('resolve');
  };

  const onAbort = () => {
    if (stopped || resolved) return;
    stopped = true;
    stopAllSources();
    haltUpstream();
    settle('reject', abortSignal?.reason ?? new DOMException('Aborted', 'AbortError'));
  };
  if (abortSignal) {
    if (abortSignal.aborted) {
      onAbort();
      return {
        playing,
        pause: () => {},
        resume: () => {},
        stop: () => {},
      };
    }
    abortSignal.addEventListener('abort', onAbort, { once: true });
  }

  // Resume the AudioContext if suspended, before starting consumption.
  if (audioContext.state === 'suspended') {
    try {
      await audioContext.resume();
    } catch (err) {
      settle('reject', err);
      return {
        playing,
        pause: () => {},
        resume: () => {},
        stop: () => {},
      };
    }
    nextStartTime = audioContext.currentTime;
  }

  // Background consumer — pulls clauses, schedules them, advances the cursor.
  // We attach a `.catch` to the IIFE itself so any rejection that escapes
  // the inner try/catch (e.g. an async-generator that re-throws on
  // `iterator.return()`) is silently swallowed rather than appearing as
  // an unhandled rejection. The iterable's error is already routed to
  // `playing` via `settle('reject', err)`.
  void (async () => {
    try {
      while (!stopped) {
        const next = await iterator.next();
        if (stopped) break;
        if (next.done) {
          producerDone = true;
          // If nothing was scheduled, resolve immediately.
          tryFinishIfDone();
          break;
        }
        const clause = next.value;

        if (firstSampleRate === null) {
          firstSampleRate = clause.sampleRate;
        } else if (clause.sampleRate !== firstSampleRate) {
          stopAllSources();
          haltUpstream();
          settle(
            'reject',
            new Error(
              `playStreamedSpeech: sample rate mismatch at clauseIndex=${clause.clauseIndex}: ` +
                `expected ${firstSampleRate}, got ${clause.sampleRate}.`
            )
          );
          return;
        }

        const buffer = floatToAudioBuffer(clause.audio, clause.sampleRate, audioContext);
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);

        const startAt = Math.max(nextStartTime, audioContext.currentTime + SCHEDULE_EPSILON_SEC);

        // Wire onended BEFORE start so we never miss a quick clause.
        source.onended = () => {
          scheduledSources.delete(source);
          endedClauseCount++;
          try {
            onClauseEnd?.(clause);
          } catch {
            // Swallow callback errors so they don't reject `playing`.
          }
          tryFinishIfDone();
        };

        scheduledSources.add(source);
        scheduledClauseCount++;
        try {
          onClause?.(clause);
        } catch {
          // Swallow callback errors.
        }
        source.start(startAt);

        nextStartTime = startAt + buffer.duration;
      }
    } catch (err) {
      // Iterable threw — propagate to `playing`.
      stopAllSources();
      haltUpstream();
      settle('reject', err);
    }
  })().catch(() => {
    // Defensive: swallow any rejection that escaped the inner catch
    // (e.g. async-generators that re-reject on `iterator.return()`).
    // The error has already been routed to `playing` via `settle('reject')`.
  });

  const pause = () => {
    if (audioContext.state === 'running') {
      audioContext.suspend().catch(() => {
        /* ignore */
      });
    }
  };

  const resume = () => {
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {
        /* ignore */
      });
    }
  };

  return {
    playing,
    pause,
    resume,
    stop,
  };
}
