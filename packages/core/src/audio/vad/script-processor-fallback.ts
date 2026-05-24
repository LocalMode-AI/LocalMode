/**
 * ScriptProcessorNode VAD Fallback
 *
 * Used when `AudioWorklet` is unavailable (e.g., older Safari/iOS). Mimics
 * the worklet's `frame` message contract by accumulating samples into a
 * frame buffer of the requested size and posting frame events through a
 * `MessagePort`-style interface.
 *
 * @packageDocumentation
 */

import type { VADFrame } from './types.js';

let WARNED_ONCE = false;

/**
 * Options for {@link createScriptProcessorVADNode}.
 */
export interface ScriptProcessorVADNodeOptions {
  /** Samples per emitted frame. */
  frameSize: number;

  /** Buffer size passed to `createScriptProcessor`. */
  bufferSize?: number;
}

/**
 * Lightweight node-like object that emits `frame` events using
 * `ScriptProcessorNode`. The caller is responsible for connecting it
 * (see {@link ScriptProcessorVADNode.connect}).
 */
export interface ScriptProcessorVADNode {
  /** Underlying `ScriptProcessorNode` for connection to the audio graph. */
  readonly node: AudioNode;

  /** Register a frame listener. Returns an unsubscribe function. */
  onFrame(listener: (frame: VADFrame) => void): () => void;

  /** Disconnect and release resources. */
  dispose(): void;
}

/**
 * Create a `ScriptProcessorNode`-based VAD frame emitter.
 *
 * Logs a one-time deprecation warning on first construction.
 *
 * @example
 * ```ts
 * const node = createScriptProcessorVADNode(audioContext, { frameSize: 512 });
 * micSource.connect(node.node);
 * const off = node.onFrame(frame => console.log(frame.rmsDb));
 * // ...
 * off();
 * node.dispose();
 * ```
 */
export function createScriptProcessorVADNode(
  context: AudioContext,
  options: ScriptProcessorVADNodeOptions
): ScriptProcessorVADNode {
  if (!WARNED_ONCE) {
    WARNED_ONCE = true;
    // eslint-disable-next-line no-console
    console.warn(
      '[localmode/audio] AudioWorklet unavailable; falling back to deprecated ScriptProcessorNode. Audio quality and latency may be degraded.'
    );
  }

  const frameSize = options.frameSize;
  const bufferSize = options.bufferSize ?? 4096;

  // ScriptProcessorNode is deprecated but still required for older browsers.
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  const node = (context as AudioContext & {
    createScriptProcessor: (bufferSize: number, in_: number, out_: number) => ScriptProcessorNode;
  }).createScriptProcessor(bufferSize, 1, 1);

  const listeners = new Set<(frame: VADFrame) => void>();
  const buffer = new Float32Array(frameSize);
  let bufferIndex = 0;

  const onAudio = (event: AudioProcessingEvent) => {
    const channel = event.inputBuffer.getChannelData(0);
    for (let i = 0; i < channel.length; i++) {
      buffer[bufferIndex++] = channel[i];
      if (bufferIndex >= frameSize) {
        emitFrame();
      }
    }
  };

  const emitFrame = () => {
    let sumSq = 0;
    for (let i = 0; i < buffer.length; i++) {
      sumSq += buffer[i] * buffer[i];
    }
    const rms = Math.sqrt(sumSq / buffer.length);
    const rmsDb = rms > 0 ? 20 * Math.log10(rms) : -200;
    const samples = new Float32Array(buffer);
    const frame: VADFrame = {
      samples,
      rmsDb,
      timestamp: Date.now(),
    };
    bufferIndex = 0;
    for (const listener of listeners) {
      try {
        listener(frame);
      } catch {
        // Swallow listener errors so one bad listener doesn't break the rest.
      }
    }
  };

  node.addEventListener('audioprocess', onAudio as EventListener);

  return {
    node,
    onFrame(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      node.removeEventListener('audioprocess', onAudio as EventListener);
      listeners.clear();
      try {
        node.disconnect();
      } catch {
        // Already disconnected — ignore.
      }
    },
  };
}

/**
 * Reset the one-time deprecation warning. Used by tests.
 *
 * @internal
 */
export function _resetScriptProcessorWarningForTests(): void {
  WARNED_ONCE = false;
}
