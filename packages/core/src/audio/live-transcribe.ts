/**
 * createLiveTranscriber()
 *
 * Streaming microphone-driven speech-to-text controller built on top of
 * the existing `SpeechToTextModel.doTranscribe()` interface.
 *
 * Layers on top of the one-shot {@link transcribe} function — this module
 * does NOT modify the existing function or `SpeechToTextModel` interface.
 *
 * @packageDocumentation
 */

import type {
  AudioPlaybackHandle,
  BargeInEvent,
  LiveBargeInListener,
  LiveChunk,
  LiveChunkListener,
  LiveErrorListener,
  LiveStateChangeListener,
  LiveTranscriber,
  LiveTranscriberOptions,
  LiveTranscriberState,
  LiveTranscriberStateChangeEvent,
  LiveTranscriberUnsubscribe,
  LiveUtterance,
  LiveUtteranceListener,
} from './live-transcribe-types.js';
import type { VADProvider, VADStartOptions } from './vad/types.js';
import { EnergyVADProvider } from './vad/energy.js';
import { ValidationError, MediaNotSupportedError } from '../errors/index.js';
import { isAudioWorkletSupported, isMediaCaptureSupported } from '../capabilities/features.js';

function debugVoice(marker: string, payload: Record<string, unknown>): void {
  if (!(globalThis as { __DEBUG_VOICE__?: boolean }).__DEBUG_VOICE__) return;
  // eslint-disable-next-line no-console
  console.info(`[bg-voice] ${marker} ${JSON.stringify(payload)}`);
}

const SCRIPT_PROCESSOR_AVAILABLE = (): boolean => {
  return (
    typeof globalThis !== 'undefined' &&
    typeof (globalThis as { ScriptProcessorNode?: unknown }).ScriptProcessorNode !== 'undefined'
  );
};

/**
 * Construct a microphone-driven streaming speech-to-text controller.
 *
 * Acquires `getUserMedia` and an `AudioContext`, registers the VAD audio
 * worklet, and resolves a `LiveTranscriber` in `state: 'idle'`. Does NOT
 * auto-start microphone capture — call `start()` from a user gesture so
 * the OS permission prompt happens during a click.
 *
 * @example Push-to-talk
 * ```ts
 * const transcriber = await createLiveTranscriber({
 *   model: transformers.speechToText('onnx-community/moonshine-tiny-ONNX'),
 *   mode: 'push-to-talk',
 * });
 *
 * transcriber.onChunk(chunk => console.log(chunk.text, chunk.isFinal));
 * transcriber.onUtteranceEnd(u => console.log('done:', u.text));
 *
 * button.onclick = async () => {
 *   await transcriber.start();
 * };
 * button.onmouseup = async () => {
 *   await transcriber.stop();
 * };
 * ```
 *
 * @example Open-mic
 * ```ts
 * const transcriber = await createLiveTranscriber({
 *   model: transformers.speechToText('onnx-community/moonshine-tiny-ONNX'),
 *   mode: 'open-mic',
 *   vad: 'energy',
 * });
 * await transcriber.start();
 * transcriber.onUtteranceEnd(u => console.log(u.text));
 * ```
 *
 * @throws {MediaNotSupportedError} When `getUserMedia` or `AudioContext` is unavailable
 * @throws {ValidationError} When `vad: 'silero'` is passed without a registered adapter
 */
export async function createLiveTranscriber(
  options: LiveTranscriberOptions
): Promise<LiveTranscriber> {
  const {
    model,
    mode = 'push-to-talk',
    vad = 'energy',
    sampleRate = 16000,
    chunkInterval = 800,
    maxUtteranceSec = 25,
    bargeInWhilePlaying,
    shouldStartUtterance,
    maxRetries = 1,
    abortSignal,
    workletUrl,
    onActivity,
  } = options;

  abortSignal?.throwIfAborted();

  if (!isMediaCaptureSupported()) {
    throw new MediaNotSupportedError(
      'navigator.mediaDevices.getUserMedia is not available in this environment'
    );
  }

  // Resolve the AudioContext constructor up front so we can fail fast.
  const AudioContextCtor =
    (globalThis as { AudioContext?: typeof AudioContext }).AudioContext ??
    (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) {
    throw new MediaNotSupportedError('AudioContext is not available in this environment');
  }

  if (vad === 'silero') {
    // The string 'silero' requires an external adapter; tell the user how to wire it.
    throw new ValidationError(
      "vad: 'silero' requires an external adapter",
      "Pass a VADProvider from @localmode/transformers — e.g. transformers.vad('onnx-community/silero-vad')"
    );
  }

  // Acquire microphone.
  let mediaStream: MediaStream;
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false,
        channelCount: 1,
        sampleRate,
      },
    });
  } catch (err) {
    abortSignal?.throwIfAborted();
    throw err;
  }

  // Diagnostic: log every MediaStreamTrack's state. If a track is
  // `muted: true` or `enabled: false`, the mic capture pipeline will
  // produce all-zero PCM buffers — the user observed exactly this on
  // 2026-05-04 with `peak:0, rmsDb:-200` frame-buckets after the
  // offscreen.createDocument was missing the USER_MEDIA reason.
  // Logging label / settings exposes which device was selected (helps
  // distinguish "wrong default device" from "permission silent zero").
  for (const track of mediaStream.getAudioTracks()) {
    let settings = {} as MediaTrackSettings;
    try {
      settings = track.getSettings();
    } catch {
      /* getSettings can throw on some Chromium builds */
    }
    debugVoice('live.gum.track', {
      muted: track.muted,
      enabled: track.enabled,
      readyState: track.readyState,
      label: track.label,
      sampleRate: settings.sampleRate,
      channelCount: settings.channelCount,
      echoCancellation: settings.echoCancellation,
      noiseSuppression: settings.noiseSuppression,
      autoGainControl: settings.autoGainControl,
      deviceId: settings.deviceId ? settings.deviceId.slice(0, 12) + '…' : undefined,
    });
    // Re-emit on subsequent state changes — `mute`/`unmute` events fire
    // when the OS or the user toggles the mic mid-session.
    track.addEventListener('mute', () => {
      debugVoice('live.gum.track.mute', { label: track.label });
    });
    track.addEventListener('unmute', () => {
      debugVoice('live.gum.track.unmute', { label: track.label });
    });
  }

  abortSignal?.throwIfAborted();

  // Construct the AudioContext at the requested sample rate. Some browsers
  // ignore `sampleRate` and use the device default — we resample only if
  // the live frame rate diverges, but for simplicity we trust the option.
  let audioContext: AudioContext;
  try {
    audioContext = new AudioContextCtor({ sampleRate });
  } catch {
    // Fall back to default sample rate if the requested one is rejected.
    audioContext = new AudioContextCtor();
  }

  if (abortSignal?.aborted) {
    mediaStream.getTracks().forEach((t) => t.stop());
    await audioContext.close().catch(() => {});
    abortSignal.throwIfAborted();
  }

  if (!isAudioWorkletSupported() && !SCRIPT_PROCESSOR_AVAILABLE()) {
    mediaStream.getTracks().forEach((t) => t.stop());
    await audioContext.close().catch(() => {});
    throw new MediaNotSupportedError(
      'Neither AudioWorklet nor ScriptProcessorNode is available in this environment'
    );
  }

  const sourceNode = audioContext.createMediaStreamSource(mediaStream);

  // Resolve the VAD provider.
  let vadProvider: VADProvider;
  let ownsVadProvider = false;
  let externalVadFrameDriver: EnergyVADProvider | null = null;
  if (vad === 'energy') {
    vadProvider = new EnergyVADProvider({
      audioContext,
      source: sourceNode,
      sampleRate,
      workletUrl,
    });
    ownsVadProvider = true;
  } else {
    vadProvider = vad;
    if (vad.provider === 'silero' || vad.provider === 'transformers') {
      externalVadFrameDriver = new EnergyVADProvider({
        audioContext,
        source: sourceNode,
        sampleRate,
        workletUrl,
        // This provider is only used as a microphone frame driver for the
        // external VAD. Set the energy threshold above any possible dBFS value
        // so it never emits its own speech-start/end decisions.
        rmsThresholdDb: 1,
      });
    }
  }

  // ── Listeners ──────────────────────────────────────────────────
  const chunkListeners = new Set<LiveChunkListener>();
  const utteranceListeners = new Set<LiveUtteranceListener>();
  const bargeInListeners = new Set<LiveBargeInListener>();
  const errorListeners = new Set<LiveErrorListener>();
  const stateChangeListeners = new Set<LiveStateChangeListener>();

  // ── Core state ─────────────────────────────────────────────────
  let state: LiveTranscriberState = 'idle';
  let isDisposed = false;
  let utteranceCounter = 0;

  // Per-utterance state
  let currentUtteranceId: string | null = null;
  let currentUtteranceBuffer: Float32Array[] = [];
  let currentUtteranceSampleCount = 0;
  let currentChunkIndex = 0;
  let inflightTranscribeAbort: AbortController | null = null;
  let chunkIntervalHandle: ReturnType<typeof setInterval> | null = null;
  let utteranceForceFlushTimer: ReturnType<typeof setTimeout> | null = null;
  let suppressedSpeechStart = false;

  const transition = (next: LiveTranscriberState): void => {
    if (state === next) return;
    const event: LiveTranscriberStateChangeEvent = {
      from: state,
      to: next,
      timestamp: new Date(),
    };
    state = next;
    debugVoice('live.state', {
      from: event.from,
      to: event.to,
      timestamp: event.timestamp.toISOString(),
    });
    for (const listener of stateChangeListeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors.
      }
    }
  };

  const emitError = (error: Error, transitionToError = true): void => {
    for (const listener of errorListeners) {
      try {
        listener(error);
      } catch {
        // Ignore listener errors.
      }
    }
    if (transitionToError) transition('error');
  };

  const emitChunk = (chunk: LiveChunk): void => {
    for (const listener of chunkListeners) {
      try {
        listener(chunk);
      } catch {
        // Ignore listener errors.
      }
    }
  };

  const emitUtterance = (utterance: LiveUtterance): void => {
    debugVoice('live.utterance.emit', {
      utteranceId: utterance.utteranceId,
      textLength: utterance.text.trim().length,
      durationSec: utterance.durationSec,
      truncated: utterance.truncated,
    });
    for (const listener of utteranceListeners) {
      try {
        listener(utterance);
      } catch {
        // Ignore listener errors.
      }
    }
  };

  const emitBargeIn = (event: BargeInEvent): void => {
    for (const listener of bargeInListeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors.
      }
    }
  };

  // ── Audio buffer helpers ────────────────────────────────────────
  const beginUtterance = (): void => {
    utteranceCounter++;
    currentUtteranceId = `u_${Date.now()}_${utteranceCounter}`;
    currentUtteranceBuffer = [];
    currentUtteranceSampleCount = 0;
    currentChunkIndex = 0;
    suppressedSpeechStart = false;
    debugVoice('live.utterance.begin', {
      utteranceId: currentUtteranceId,
      mode,
      timestamp: new Date().toISOString(),
    });

    if (chunkInterval > 0) {
      chunkIntervalHandle = setInterval(() => {
        void runPartialChunk();
      }, chunkInterval);
    }

    if (maxUtteranceSec > 0) {
      utteranceForceFlushTimer = setTimeout(() => {
        void endUtterance({ truncated: true });
      }, maxUtteranceSec * 1000);
    }
  };

  const appendSamples = (samples: Float32Array): void => {
    if (currentUtteranceId === null) return;
    // Copy so the orchestrator's buffer doesn't change underneath us.
    const copy = new Float32Array(samples);
    currentUtteranceBuffer.push(copy);
    currentUtteranceSampleCount += copy.length;
  };

  const concatBuffer = (): Float32Array => {
    const out = new Float32Array(currentUtteranceSampleCount);
    let offset = 0;
    for (const chunk of currentUtteranceBuffer) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  };

  /**
   * Compute the audio buffer's peak amplitude and RMS dBFS so we can tell
   * "STT model returned empty for *silent* audio (expected)" apart from
   * "STT model returned empty for *audible* audio (real bug)" without
   * having to dump entire PCM buffers across the bridge.
   */
  const audioStats = (audio: Float32Array): { peak: number; rmsDb: number } => {
    let peak = 0;
    let sumSq = 0;
    for (let i = 0; i < audio.length; i++) {
      const v = audio[i] ?? 0;
      const av = v < 0 ? -v : v;
      if (av > peak) peak = av;
      sumSq += v * v;
    }
    const rms = audio.length > 0 ? Math.sqrt(sumSq / audio.length) : 0;
    const rmsDb = rms > 0 ? 20 * Math.log10(rms) : -200;
    return { peak, rmsDb };
  };

  const rmsDbToLinear = (rmsDb: number): number => {
    if (!Number.isFinite(rmsDb) || rmsDb <= -199) return 0;
    return Math.min(1, Math.max(0, 10 ** (rmsDb / 20)));
  };

  const runDoTranscribeWithRetry = async (
    audio: Float32Array,
    chunkAbort: AbortController
  ): Promise<string | null> => {
    const stats = audioStats(audio);
    onActivity?.({
      phase: 'transcribing',
      rms: rmsDbToLinear(stats.rmsDb),
      peak: stats.peak,
      elapsedMs: Math.round((audio.length / sampleRate) * 1000),
    });
    debugVoice('live.transcribe.start', {
      durationSec: audio.length / sampleRate,
      peak: Number(stats.peak.toFixed(4)),
      rmsDb: Number(stats.rmsDb.toFixed(1)),
      modelId: model.modelId,
    });
    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (chunkAbort.signal.aborted) return null;
      try {
        const result = await model.doTranscribe({
          audio,
          abortSignal: chunkAbort.signal,
        });
        debugVoice('live.transcribe.result', {
          textLength: result.text.length,
          rmsDb: Number(stats.rmsDb.toFixed(1)),
          attempt,
        });
        return result.text;
      } catch (err) {
        if (chunkAbort.signal.aborted) return null;
        lastError = err as Error;
        debugVoice('live.transcribe.error', {
          message: err instanceof Error ? err.message : String(err),
          attempt,
        });
        if (attempt === maxRetries) break;
      }
    }
    if (lastError && !chunkAbort.signal.aborted) {
      emitError(lastError);
    }
    return null;
  };

  const runPartialChunk = async (): Promise<void> => {
    if (currentUtteranceId === null) return;
    if (currentUtteranceSampleCount === 0) return;

    // Cancel any in-flight previous chunk so we don't queue work.
    inflightTranscribeAbort?.abort();
    const ctrl = new AbortController();
    inflightTranscribeAbort = ctrl;

    const audio = concatBuffer();
    const chunkIndex = currentChunkIndex++;
    const utteranceId = currentUtteranceId;

    const text = await runDoTranscribeWithRetry(audio, ctrl);
    // Bail if the utterance was rotated or aborted.
    if (text === null || ctrl.signal.aborted) return;
    if (currentUtteranceId !== utteranceId) return;

    emitChunk({
      text,
      audioDurationSec: audio.length / sampleRate,
      isFinal: false,
      chunkIndex,
      utteranceId,
      timestamp: new Date(),
    });
  };

  const endUtterance = async (options?: { truncated?: boolean }): Promise<void> => {
    if (currentUtteranceId === null) return;

    const utteranceId = currentUtteranceId;
    const truncated = options?.truncated ?? false;
    debugVoice('live.utterance.end', {
      utteranceId,
      truncated,
      sampleCount: currentUtteranceSampleCount,
    });

    if (chunkIntervalHandle !== null) {
      clearInterval(chunkIntervalHandle);
      chunkIntervalHandle = null;
    }
    if (utteranceForceFlushTimer !== null) {
      clearTimeout(utteranceForceFlushTimer);
      utteranceForceFlushTimer = null;
    }

    inflightTranscribeAbort?.abort();
    const ctrl = new AbortController();
    inflightTranscribeAbort = ctrl;

    const audio = concatBuffer();
    const chunkIndex = currentChunkIndex++;

    // Reset utterance state immediately so concurrent VAD events don't double-flush.
    currentUtteranceId = null;
    currentUtteranceBuffer = [];
    currentUtteranceSampleCount = 0;

    if (audio.length === 0) {
      return;
    }

    const text = (await runDoTranscribeWithRetry(audio, ctrl)) ?? '';

    emitChunk({
      text,
      audioDurationSec: audio.length / sampleRate,
      isFinal: true,
      chunkIndex,
      utteranceId,
      timestamp: new Date(),
    });

    emitUtterance({
      utteranceId,
      text,
      durationSec: audio.length / sampleRate,
      audio,
      truncated,
      timestamp: new Date(),
    });

    // After truncation in open-mic, immediately begin a fresh utterance buffer
    // so the audio after the truncation point isn't dropped on the floor.
    if (truncated && state === 'listening' && mode === 'open-mic') {
      beginUtterance();
    }
  };

  // ── VAD wiring ─────────────────────────────────────────────────
  const handleSpeechStart = (event: { timestamp: number; rmsDb: number }): void => {
    if (state !== 'listening') return;
    debugVoice('live.vad.speech-start', {
      timestamp: event.timestamp,
      rmsDb: event.rmsDb,
      mode,
    });
    onActivity?.({
      phase: 'speech-started',
      rms: rmsDbToLinear(event.rmsDb),
      peak: rmsDbToLinear(event.rmsDb),
    });

    // Barge-in: external playback active when speech starts.
    const handle: AudioPlaybackHandle | undefined = bargeInWhilePlaying;
    if (handle && handle.isPlaying()) {
      try {
        const result = handle.stop();
        if (result instanceof Promise) {
          result.catch(() => {});
        }
      } catch {
        // Ignore — the application's stop may throw.
      }
      // Abort any prior in-flight chunk from the previous utterance.
      inflightTranscribeAbort?.abort();
      const bargeEvent: BargeInEvent = {
        timestamp: new Date(event.timestamp),
        audioLevelDb: event.rmsDb,
      };
      emitBargeIn(bargeEvent);
    }

    if (mode === 'open-mic') {
      if (shouldStartUtterance) {
        let shouldStart = true;
        try {
          shouldStart = shouldStartUtterance({
            timestamp: new Date(event.timestamp),
            audioLevelDb: event.rmsDb,
          });
        } catch (err) {
          debugVoice('live.utterance.gate-error', {
            message: err instanceof Error ? err.message : String(err),
          });
        }
        if (!shouldStart) {
          suppressedSpeechStart = true;
          debugVoice('live.utterance.gated', {
            timestamp: event.timestamp,
            rmsDb: event.rmsDb,
          });
          return;
        }
      }
      // If we somehow already had an utterance, end it before starting a new one.
      if (currentUtteranceId !== null) {
        void endUtterance();
      }
      beginUtterance();
    }
  };

  const handleSpeechEnd = (_event: { timestamp: number; rmsDb: number }): void => {
    if (state !== 'listening') return;
    debugVoice('live.vad.speech-end', {
      timestamp: _event.timestamp,
      rmsDb: _event.rmsDb,
      mode,
      suppressedSpeechStart,
    });
    onActivity?.({
      phase: 'speech-ended',
      rms: rmsDbToLinear(_event.rmsDb),
      peak: rmsDbToLinear(_event.rmsDb),
    });
    suppressedSpeechStart = false;
    if (mode === 'open-mic') {
      void endUtterance();
    }
  };

  // Per-second RMS diagnostic so we can tell "VAD is silent because the
  // fake-mic feed isn't reaching the worklet" apart from "VAD is silent
  // because the audio is below threshold". Sampled at 1 Hz to keep the
  // bridge quiet in production. Fires only when a VAD frame is received,
  // so absence-of-event also tells us the worklet is dead.
  let _vadDiagBucketStart = 0;
  let _vadDiagFrameCount = 0;
  let _vadDiagSumSq = 0;
  let _vadDiagPeak = 0;
  let hasReceivedVadFrame = false;
  let noFrameWatchdog: ReturnType<typeof setTimeout> | null = null;
  const handleVadFrame = (frame: { samples: Float32Array }): void => {
    if (state !== 'listening') return;
    hasReceivedVadFrame = true;
    if (currentUtteranceId !== null) {
      appendSamples(frame.samples);
    }
    const now = Date.now();
    if (_vadDiagBucketStart === 0) _vadDiagBucketStart = now;
    _vadDiagFrameCount++;
    let sq = 0;
    let peak = 0;
    for (let i = 0; i < frame.samples.length; i++) {
      const v = frame.samples[i] ?? 0;
      sq += v * v;
      const av = v < 0 ? -v : v;
      if (av > peak) peak = av;
    }
    _vadDiagSumSq += sq / Math.max(frame.samples.length, 1);
    if (peak > _vadDiagPeak) _vadDiagPeak = peak;
    if (now - _vadDiagBucketStart >= 1000) {
      const meanSq = _vadDiagSumSq / Math.max(_vadDiagFrameCount, 1);
      const rms = Math.sqrt(meanSq);
      const rmsDb = rms > 0 ? 20 * Math.log10(rms) : -200;
      debugVoice('live.vad.frame-bucket', {
        frames: _vadDiagFrameCount,
        peak: Number(_vadDiagPeak.toFixed(4)),
        rmsDb: Number(rmsDb.toFixed(1)),
        utteranceOpen: currentUtteranceId !== null,
      });
      onActivity?.({
        phase: 'listening',
        rms: Number(rms.toFixed(4)),
        peak: Number(_vadDiagPeak.toFixed(4)),
        elapsedMs: now - _vadDiagBucketStart,
      });
      _vadDiagBucketStart = now;
      _vadDiagFrameCount = 0;
      _vadDiagSumSq = 0;
      _vadDiagPeak = 0;
    }
  };

  // ── MediaStream watchdog ────────────────────────────────────────
  const onTrackEnded = (): void => {
    if (isDisposed) return;
    emitError(
      new MediaNotSupportedError(
        'MediaStream audio track ended unexpectedly (mic permission revoked or device disconnected)'
      )
    );
  };

  for (const track of mediaStream.getAudioTracks()) {
    track.addEventListener('ended', onTrackEnded);
  }

  // ── External abort signal ───────────────────────────────────────
  const onExternalAbort = (): void => {
    if (isDisposed) return;
    void (async () => {
      const reason = abortSignal?.reason;
      const error =
        reason instanceof Error
          ? reason
          : Object.assign(new Error('LiveTranscriber aborted'), { name: 'AbortError' });
      emitError(error, false);
      await disposeImpl();
    })();
  };

  if (abortSignal) {
    if (abortSignal.aborted) {
      // Caller aborted between the start of construction and now.
      mediaStream.getTracks().forEach((t) => t.stop());
      await audioContext.close().catch(() => {});
      abortSignal.throwIfAborted();
    }
    abortSignal.addEventListener('abort', onExternalAbort, { once: true });
  }

  // ── Lifecycle methods ───────────────────────────────────────────
  const ensureNotDisposed = (): void => {
    if (isDisposed) {
      throw new Error('LiveTranscriber has been disposed');
    }
  };

  const start = async (): Promise<void> => {
    ensureNotDisposed();
    if (state === 'listening') return;

    if (audioContext.state === 'suspended') {
      try {
        await audioContext.resume();
      } catch (err) {
        emitError(err as Error);
        throw err;
      }
    }

    transition('listening');

    // For our pipeline, in push-to-talk we begin an utterance immediately;
    // in open-mic we wait for VAD speech-start.
    if (mode === 'push-to-talk') {
      beginUtterance();
    }

    const startOptions: VADStartOptions = {
      onSpeechStart: handleSpeechStart,
      onSpeechEnd: handleSpeechEnd,
      onFrame: externalVadFrameDriver ? undefined : handleVadFrame,
    };

    try {
      await vadProvider.start(startOptions);
      await externalVadFrameDriver?.start({
        onSpeechStart: () => {},
        onSpeechEnd: () => {},
        onFrame: (frame) => {
          handleVadFrame(frame);
          vadProvider.processFrame(frame.samples);
        },
      });
      hasReceivedVadFrame = false;
      noFrameWatchdog = setTimeout(() => {
        if (state !== 'listening' || hasReceivedVadFrame || isDisposed) return;
        emitError(
          new MediaNotSupportedError(
            'Microphone started, but Compass did not receive any audio frames. Check browser and OS microphone permissions, then try again.'
          )
        );
      }, 4_000);
    } catch (err) {
      await externalVadFrameDriver?.stop().catch(() => {});
      await vadProvider.stop().catch(() => {});
      emitError(err as Error);
      throw err;
    }
  };

  const stop = async (): Promise<void> => {
    if (isDisposed) return;
    if (state === 'idle') return;

    // End any in-flight utterance — push-to-talk emits final chunk + utterance;
    // open-mic also flushes any captured audio.
    if (currentUtteranceId !== null) {
      await endUtterance();
    }

    inflightTranscribeAbort?.abort();
    inflightTranscribeAbort = null;

    if (chunkIntervalHandle !== null) {
      clearInterval(chunkIntervalHandle);
      chunkIntervalHandle = null;
    }
    if (utteranceForceFlushTimer !== null) {
      clearTimeout(utteranceForceFlushTimer);
      utteranceForceFlushTimer = null;
    }
    if (noFrameWatchdog !== null) {
      clearTimeout(noFrameWatchdog);
      noFrameWatchdog = null;
    }

    try {
      await externalVadFrameDriver?.stop();
      await vadProvider.stop();
    } catch (err) {
      emitError(err as Error, false);
    }

    if (state !== 'error') {
      transition('idle');
    }
  };

  const disposeImpl = async (): Promise<void> => {
    if (isDisposed) return;
    isDisposed = true;

    if (chunkIntervalHandle !== null) {
      clearInterval(chunkIntervalHandle);
      chunkIntervalHandle = null;
    }
    if (utteranceForceFlushTimer !== null) {
      clearTimeout(utteranceForceFlushTimer);
      utteranceForceFlushTimer = null;
    }
    if (noFrameWatchdog !== null) {
      clearTimeout(noFrameWatchdog);
      noFrameWatchdog = null;
    }

    inflightTranscribeAbort?.abort();
    inflightTranscribeAbort = null;

    for (const track of mediaStream.getAudioTracks()) {
      track.removeEventListener('ended', onTrackEnded);
      try {
        track.stop();
      } catch {
        // Ignore.
      }
    }

    if (ownsVadProvider) {
      try {
        await vadProvider.dispose();
      } catch {
        // Ignore.
      }
    } else {
      try {
        await externalVadFrameDriver?.dispose();
      } catch {
        // Ignore.
      }
      // Caller-owned VAD; just stop our subscription.
      try {
        await vadProvider.stop();
      } catch {
        // Ignore.
      }
    }

    try {
      await audioContext.close();
    } catch {
      // Ignore.
    }

    chunkListeners.clear();
    utteranceListeners.clear();
    bargeInListeners.clear();
    errorListeners.clear();
    // Keep stateChange listeners so the final transition to 'disposed' is observable.
    transition('disposed');
    stateChangeListeners.clear();

    if (abortSignal) {
      abortSignal.removeEventListener('abort', onExternalAbort);
    }
  };

  const dispose = (): Promise<void> => disposeImpl();

  // ── Listener registration helpers ──────────────────────────────
  const makeRegister =
    <T>(set: Set<T>) =>
    (listener: T): LiveTranscriberUnsubscribe => {
      if (isDisposed) return () => {};
      set.add(listener);
      return () => {
        set.delete(listener);
      };
    };

  const controller: LiveTranscriber = {
    get state() {
      return state;
    },
    start,
    stop,
    dispose,
    onChunk: makeRegister(chunkListeners),
    onUtteranceEnd: makeRegister(utteranceListeners),
    onBargeIn: makeRegister(bargeInListeners),
    onError: makeRegister(errorListeners),
    onStateChange: makeRegister(stateChangeListeners),
  };

  return controller;
}
