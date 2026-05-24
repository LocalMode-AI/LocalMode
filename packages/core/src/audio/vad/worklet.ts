/**
 * Energy VAD AudioWorklet Registration
 *
 * Registers an inline blob-URL-backed `AudioWorkletProcessor` that
 * computes per-frame RMS (in dBFS) and posts frames to the main thread.
 *
 * The worklet name is `'localmode-energy-vad'`. The processor accepts
 * `{ type: 'config', frameSize, sampleRate }` messages from the main
 * thread and posts `{ type: 'frame', samples, rmsDb, timestamp }` messages
 * back on each render quantum (or accumulated frame, depending on
 * `frameSize`).
 *
 * @packageDocumentation
 */

/**
 * The processor name registered on the AudioWorklet global scope.
 */
export const ENERGY_VAD_PROCESSOR_NAME = 'localmode-energy-vad';

/**
 * Inline AudioWorkletProcessor source. Stays as a string so it can be
 * blob-URL-registered without requiring a separate worklet bundle from
 * the host application's bundler.
 *
 * Internal but exported for testing.
 */
export const ENERGY_VAD_WORKLET_SOURCE = `
class LocalModeEnergyVADProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const params = (options && options.processorOptions) || {};
    this._frameSize = typeof params.frameSize === 'number' ? params.frameSize : 512;
    this._sampleRate = typeof params.sampleRate === 'number' ? params.sampleRate : sampleRate;
    this._buffer = new Float32Array(this._frameSize);
    this._bufferIndex = 0;
    this.port.onmessage = (e) => {
      const msg = e.data || {};
      if (msg.type === 'config') {
        if (typeof msg.frameSize === 'number' && msg.frameSize > 0) {
          this._frameSize = msg.frameSize;
          this._buffer = new Float32Array(this._frameSize);
          this._bufferIndex = 0;
        }
      }
    };
  }

  _emitFrame() {
    let sumSq = 0;
    const buf = this._buffer;
    for (let i = 0; i < buf.length; i++) {
      const s = buf[i];
      sumSq += s * s;
    }
    const rms = Math.sqrt(sumSq / buf.length);
    const rmsDb = rms > 0 ? 20 * Math.log10(rms) : -200;
    // Copy to a fresh Float32Array so the transferred buffer doesn't alias.
    const samples = new Float32Array(buf);
    this.port.postMessage(
      { type: 'frame', samples, rmsDb, timestamp: currentTime * 1000 },
      [samples.buffer]
    );
    this._bufferIndex = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const channel = input[0];
    if (!channel) return true;

    for (let i = 0; i < channel.length; i++) {
      this._buffer[this._bufferIndex++] = channel[i];
      if (this._bufferIndex >= this._frameSize) {
        this._emitFrame();
      }
    }
    return true;
  }
}

registerProcessor('${ENERGY_VAD_PROCESSOR_NAME}', LocalModeEnergyVADProcessor);
`;

// Track which AudioContexts already have the worklet registered to keep
// `registerEnergyVADWorklet()` idempotent across calls.
const REGISTERED_CONTEXTS = new WeakSet<AudioContext>();

/**
 * Options for {@link registerEnergyVADWorklet}.
 */
export interface RegisterEnergyVADWorkletOptions {
  /**
   * Optional URL for the worklet processor module. Use this in strict-CSP
   * environments (Chrome MV3 service workers, sites that block `blob:` URLs).
   *
   * If omitted, the inline source is registered via a generated blob URL.
   */
  url?: string;
}

/**
 * Register the energy VAD `AudioWorkletProcessor` on the given context.
 *
 * Idempotent — calling it twice on the same `AudioContext` is safe.
 *
 * @param context - Target audio context
 * @param options - Optional `url` override for strict-CSP environments
 *
 * @example Default (blob URL)
 * ```ts
 * const ctx = new AudioContext({ sampleRate: 16000 });
 * await registerEnergyVADWorklet(ctx);
 * ```
 *
 * @example Custom URL (strict CSP)
 * ```ts
 * await registerEnergyVADWorklet(ctx, { url: '/assets/energy-vad.worklet.js' });
 * ```
 *
 * @throws {Error} When the context lacks `audioWorklet` support — callers
 *   should detect this with `isAudioWorkletSupported()` and use the
 *   ScriptProcessorNode fallback instead.
 */
export async function registerEnergyVADWorklet(
  context: AudioContext,
  options?: RegisterEnergyVADWorkletOptions
): Promise<void> {
  if (REGISTERED_CONTEXTS.has(context)) return;

  const worklet = (context as AudioContext & { audioWorklet?: AudioWorklet }).audioWorklet;
  if (!worklet) {
    throw new Error(
      'AudioWorklet is not available on this AudioContext. Use the ScriptProcessorNode fallback or upgrade the browser.'
    );
  }

  const url = options?.url ?? createBlobUrl();
  try {
    await worklet.addModule(url);
    REGISTERED_CONTEXTS.add(context);
  } finally {
    if (!options?.url) {
      // Best-effort cleanup of the synthesized blob URL.
      try {
        URL.revokeObjectURL(url);
      } catch {
        // Ignore — some environments throw on revoke after addModule.
      }
    }
  }
}

function createBlobUrl(): string {
  const blob = new Blob([ENERGY_VAD_WORKLET_SOURCE], { type: 'application/javascript' });
  return URL.createObjectURL(blob);
}

/**
 * Internal — clears the registration cache. Used by tests.
 *
 * @internal
 */
export function _clearWorkletRegistrationCache(): void {
  // WeakSet doesn't expose .clear(), but for testing we don't need
  // to reset across contexts — each test creates a fresh AudioContext.
  // This function exists so tests can express intent; it's a no-op.
}
