/**
 * Energy VAD Tests
 *
 * Tests the {@link EnergyVADProvider} state machine using
 * {@link EnergyVADProvider.processFrame} (the manual-driver path), so the
 * tests do not depend on a real `AudioContext`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EnergyVADProvider } from '../src/audio/vad/energy.js';

/**
 * Make a Float32Array sized to `samples` whose RMS amplitude is `amplitude`.
 * (Constant-amplitude signal — RMS == |amplitude|.)
 */
function makeFrame(samples: number, amplitude: number): Float32Array {
  const arr = new Float32Array(samples);
  for (let i = 0; i < samples; i++) arr[i] = amplitude;
  return arr;
}

/**
 * Create a stub audio source/context. Energy VAD's manual-driver path
 * does not need them to be functional, so we only need shapes that pass
 * the constructor.
 */
function createStubGraph() {
  const audioContext = {
    audioWorklet: undefined, // force fallback path off; we use processFrame directly
    createScriptProcessor: () => {
      throw new Error('createScriptProcessor should not be called in processFrame tests');
    },
    destination: {},
    close: vi.fn(),
  } as unknown as AudioContext;
  const source = {
    connect: vi.fn(),
    disconnect: vi.fn(),
  } as unknown as AudioNode;
  return { audioContext, source };
}

describe('EnergyVADProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('detects speech above threshold after the min duration', async () => {
    const { audioContext, source } = createStubGraph();
    const onSpeechStart = vi.fn();
    const onSpeechEnd = vi.fn();

    const vad = new EnergyVADProvider({
      audioContext,
      source,
      rmsThresholdDb: -45,
      speechMinDurationMs: 200,
      silenceTimeoutMs: 700,
      hangoverMs: 200,
      frameSize: 512,
    });

    // Use the manual-driver path so we don't depend on a real AudioContext.
    // We mark started by calling start() in a way that works with the stub —
    // the implementation only requires startOptions to be set.
    (vad as unknown as { startOptions: unknown }).startOptions = {
      onSpeechStart,
      onSpeechEnd,
      onFrame: () => {},
    };
    (vad as unknown as { isStarted: boolean }).isStarted = true;

    // Amplitude 0.1 ≈ -20 dBFS, well above -45 dB threshold.
    const loud = makeFrame(512, 0.1);

    // First frame at "now" — start candidate set, but min duration not yet reached.
    const t0 = Date.now();
    vi.setSystemTime(t0);
    vad.processFrame(loud);
    expect(onSpeechStart).not.toHaveBeenCalled();

    // 250 ms later — past speechMinDurationMs.
    vi.setSystemTime(t0 + 250);
    vad.processFrame(loud);
    expect(onSpeechStart).toHaveBeenCalledTimes(1);

    // While loud, no end.
    vi.setSystemTime(t0 + 600);
    vad.processFrame(loud);
    expect(onSpeechEnd).not.toHaveBeenCalled();
  });

  it('detects silence after hangover + silenceTimeout', () => {
    const { audioContext, source } = createStubGraph();
    const onSpeechStart = vi.fn();
    const onSpeechEnd = vi.fn();

    const vad = new EnergyVADProvider({
      audioContext,
      source,
      rmsThresholdDb: -45,
      speechMinDurationMs: 200,
      silenceTimeoutMs: 700,
      hangoverMs: 200,
      frameSize: 512,
    });

    (vad as unknown as { startOptions: unknown }).startOptions = {
      onSpeechStart,
      onSpeechEnd,
      onFrame: () => {},
    };
    (vad as unknown as { isStarted: boolean }).isStarted = true;

    const loud = makeFrame(512, 0.1);
    const quiet = makeFrame(512, 0.00001); // ~-100 dB

    const t0 = Date.now();
    vi.setSystemTime(t0);
    vad.processFrame(loud);
    vi.setSystemTime(t0 + 250);
    vad.processFrame(loud);
    expect(onSpeechStart).toHaveBeenCalledTimes(1);

    // Drop to silence.
    vi.setSystemTime(t0 + 500);
    vad.processFrame(quiet);
    // hangover (200) + silenceTimeout (700) = 900 ms required total
    // first quiet frame at t0+500, so we need t >= t0+1400.
    vi.setSystemTime(t0 + 1500);
    vad.processFrame(quiet);
    expect(onSpeechEnd).toHaveBeenCalledTimes(1);
  });

  it('does NOT end speech on a brief sub-threshold dip', () => {
    const { audioContext, source } = createStubGraph();
    const onSpeechStart = vi.fn();
    const onSpeechEnd = vi.fn();

    const vad = new EnergyVADProvider({
      audioContext,
      source,
      rmsThresholdDb: -45,
      speechMinDurationMs: 200,
      silenceTimeoutMs: 700,
      hangoverMs: 200,
      frameSize: 512,
    });

    (vad as unknown as { startOptions: unknown }).startOptions = {
      onSpeechStart,
      onSpeechEnd,
      onFrame: () => {},
    };
    (vad as unknown as { isStarted: boolean }).isStarted = true;

    const loud = makeFrame(512, 0.1);
    const quiet = makeFrame(512, 0.00001);

    const t0 = Date.now();
    vi.setSystemTime(t0);
    vad.processFrame(loud);
    vi.setSystemTime(t0 + 250);
    vad.processFrame(loud);

    // 100 ms dip (under hangover + timeout = 900 ms, also under hangover alone).
    vi.setSystemTime(t0 + 350);
    vad.processFrame(quiet);
    vi.setSystemTime(t0 + 400);
    vad.processFrame(loud);

    expect(onSpeechEnd).not.toHaveBeenCalled();
  });

  it('honors a custom rmsThresholdDb', () => {
    const { audioContext, source } = createStubGraph();
    const onSpeechStart = vi.fn();

    const vad = new EnergyVADProvider({
      audioContext,
      source,
      rmsThresholdDb: -10, // require very loud audio
      speechMinDurationMs: 50,
      frameSize: 512,
    });

    (vad as unknown as { startOptions: unknown }).startOptions = {
      onSpeechStart,
      onSpeechEnd: () => {},
      onFrame: () => {},
    };
    (vad as unknown as { isStarted: boolean }).isStarted = true;

    // Amplitude 0.1 ≈ -20 dB — below the -10 dB threshold.
    const moderate = makeFrame(512, 0.1);
    vad.processFrame(moderate);
    vi.setSystemTime(Date.now() + 200);
    vad.processFrame(moderate);
    expect(onSpeechStart).not.toHaveBeenCalled();
  });

  it('exposes provider/frameSize/sampleRate metadata', () => {
    const { audioContext, source } = createStubGraph();
    const vad = new EnergyVADProvider({
      audioContext,
      source,
      frameSize: 256,
      sampleRate: 24000,
    });
    expect(vad.provider).toBe('energy');
    expect(vad.frameSize).toBe(256);
    expect(vad.sampleRate).toBe(24000);
  });

  it('dispose() is idempotent', async () => {
    const { audioContext, source } = createStubGraph();
    const vad = new EnergyVADProvider({ audioContext, source });
    await vad.dispose();
    await expect(vad.dispose()).resolves.toBeUndefined();
  });
});
