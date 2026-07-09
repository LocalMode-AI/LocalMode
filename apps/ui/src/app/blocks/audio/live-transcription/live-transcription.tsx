'use client';

/**
 * @file live-transcription.tsx
 * @description Live Transcription — open-mic streaming STT (useLiveTranscribe) + a listen→plan→speak turn-taking assistant (useTurnTaker) with an energy/Silero VAD picker; owns its STT selector, its adapter-backed device probe, and a block-local Silero provider.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  useLiveTranscribe,
  useModelLoad,
  useTurnTaker,
  type UseModelLoadReturn,
} from '@localmode/react';
import {
  createLiveTranscriber,
  isWebGPUSupported,
  synthesizeSpeech,
  transcribe,
} from '@localmode/core';
import type {
  LanguageModel,
  LiveTranscriber,
  SpeechToTextModel,
  TextToSpeechModel,
} from '@localmode/core';
import { transformers, isModelCached, KOKORO_DEFAULT_VOICE } from '@localmode/transformers';

import { VoiceOrb, type VoiceOrbState } from '@/components/voice-orb';
import { WaveformActivityBars } from '@/components/waveform-activity-bars';
import { SegmentedModePicker } from '@/components/segmented-mode-picker';
import { ModelSelector } from '@/components/model-selector';
import { ModelLoadingPanel } from '@/components/model-loading-panel';
import { ErrorAlert } from '@/components/error-alert';
import { cn } from '@/lib/utils';

/* ─────────────────────────── inlined model catalog ────────────────────────── */
// Only this block's slice of the audio-studio catalog — the note/meeting/
// audiobook models are intentionally not inlined. Nothing here downloads at
// import time; every load is gated behind an explicit in-block action.

/** One selectable speech-to-text model. */
interface SttModelEntry {
  /** Transformers.js model id. */
  id: string;
  /** Display name. */
  name: string;
  /** Human-readable download size. */
  size: string;
  /** True when segment timestamps are validated for this model (Whisper only). */
  timestamps: boolean;
}

/** The block's STT choices (VERBATIM from the audio-studio catalog). */
const STT_MODELS: readonly SttModelEntry[] = [
  { id: 'Xenova/whisper-tiny.en', name: 'Whisper Tiny EN', size: '~40MB', timestamps: true },
  { id: 'onnx-community/moonshine-tiny-ONNX', name: 'Moonshine Tiny', size: '~50MB', timestamps: false },
  { id: 'onnx-community/moonshine-base-ONNX', name: 'Moonshine Base', size: '~237MB', timestamps: false },
];

/** Default STT model. */
const DEFAULT_STT_MODEL_ID = STT_MODELS[0].id;

/**
 * Smallest generateObject-capable transformers ONNX LM — powers the turn-taking
 * planner (same id the chat block ships as its transformers default).
 */
const PLANNER_MODEL_ID = 'onnx-community/granite-4.0-350m-ONNX-web';
const PLANNER_MODEL_SIZE = '~120MB';

/** Proven Kokoro TTS model (turn-taking spoken replies). */
const TTS_MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const TTS_MODEL_SIZE = '~86MB';

/** Silero VAD ONNX model (opt-in; the energy VAD needs no download). */
const SILERO_VAD_MODEL_ID = 'onnx-community/silero-vad';
const SILERO_VAD_MODEL_SIZE = '~2MB';

/**
 * The Silero VAD provider type as constructed by `transformers.vad()`. Pure
 * type — erased at compile time, so it carries no module-scoped runtime state.
 */
type SileroVad = ReturnType<typeof transformers.vad>;

type LiveMode = 'transcribe' | 'turn';
type VadChoice = 'energy' | 'silero';

/** Bound so VAD-less capture windows force-flush an utterance promptly. */
const MAX_UTTERANCE_SEC = 15;

const TURN_SYSTEM_PROMPT =
  'You are a concise voice assistant running entirely in the browser. Reply in one or two short sentences.';

/* ────────────────────────── LiveTranscriptionBlock ────────────────────────── */

/**
 * Outer component: owns the STT model choice and the adapter-backed transformers
 * device probe. The inner session is remounted (React `key`) per STT model so
 * the model instance, its `useModelLoad` lifecycle, and every STT-bound hook
 * stay coherent (audio-studio SessionHost pattern).
 */
export function LiveTranscriptionBlock() {
  const [sttModelId, setSttModelId] = useState(DEFAULT_STT_MODEL_ID);

  // Resolve the transformers inference device ONCE with an adapter-backed probe.
  // The transformers LanguageModel auto-detects `navigator.gpu` PRESENCE only
  // and would pick webgpu in adapterless browsers (headless CI, some
  // Firefox/Linux configs), then fail the load outright — so the Granite
  // turn-taking planner gets an explicit device, mirroring the audio-studio
  // shell. This probe downloads no model bytes (page-load invariant).
  const [device, setDevice] = useState<'webgpu' | 'wasm' | null>(null);
  useEffect(() => {
    let alive = true;
    void isWebGPUSupported().then((ok) => {
      if (alive) setDevice(ok ? 'webgpu' : 'wasm');
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="flex flex-col gap-4 p-4">
      {device ? (
        <LiveSession
          key={sttModelId}
          sttModelId={sttModelId}
          onSttModelIdChange={setSttModelId}
          device={device}
        />
      ) : (
        <p className="p-4 text-sm text-muted-foreground">Preparing…</p>
      )}
    </div>
  );
}

/* ────────────────────────────── LiveSession ───────────────────────────────── */

interface LiveSessionProps {
  sttModelId: string;
  onSttModelIdChange: (id: string) => void;
  /** Resolved transformers inference device for the Granite planner. */
  device: 'webgpu' | 'wasm';
}

/**
 * Inner host, remounted per STT model id: owns THE `useModelLoad` for the
 * selected STT model, renders the STT selector + loading panel, and holds the
 * block-local Silero VAD provider (replacing the killed module-scoped singleton
 * from the audio-studio `models.ts`). The Live surface mounts once the model
 * instance exists (null for exactly one client tick — no download).
 */
function LiveSession({ sttModelId, onSttModelIdChange, device }: LiveSessionProps) {
  // ── STT model load lifecycle (explicit-action gated) ──
  const stt = useModelLoad<SpeechToTextModel>({
    key: `live-transcription-stt:${sttModelId}`,
    create: (onProgress) =>
      transformers.speechToText(sttModelId, {
        onProgress: (p) => onProgress(p as Parameters<typeof onProgress>[0]),
      }),
    // Real inference on 1 s of silence forces the provider's lazy pipeline
    // load to completion (useModelLoad's default warmup only knows
    // LanguageModel/EmbeddingModel).
    warmup: (model) => transcribe({ model, audio: new Float32Array(16_000) }),
    isCached: () => isModelCached(sttModelId),
  });

  const sttEntry = STT_MODELS.find((m) => m.id === sttModelId) ?? STT_MODELS[0];

  // ── block-local Silero VAD provider (de-singletonized) ──
  // The audio-studio `models.ts` held Silero as a module-scoped mutable
  // singleton (`let sileroVad`, a module `Set` of listeners, and the
  // `getSileroVad`/`onSileroProgress` module functions). That state is moved
  // into refs here and exposed through stable `useCallback` closures so BOTH
  // `useLiveTranscribe` (called every render) and `createLiveTranscriber`
  // (called in `startTurn`) resolve to the SAME ref-held provider instance.
  const sileroVadRef = useRef<SileroVad | null>(null);
  const sileroProgressListenersRef = useRef(new Set<(p: unknown) => void>());

  const getSileroVad = useCallback((): SileroVad => {
    if (!sileroVadRef.current) {
      sileroVadRef.current = transformers.vad(SILERO_VAD_MODEL_ID, {
        onProgress: (p) => {
          for (const listener of sileroProgressListenersRef.current) listener(p);
        },
      });
    }
    return sileroVadRef.current;
  }, []);

  const onSileroProgress = useCallback((listener: (p: unknown) => void) => {
    sileroProgressListenersRef.current.add(listener);
  }, []);

  return (
    <>
      {/* ── STT model choice (folded in from the audio-studio shell) ── */}
      <section className="flex flex-col gap-2">
        <div data-model-id={sttModelId}>
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Speech-to-text model - downloads only when you start a live session or press its
            download action.
          </p>
          <ModelSelector
            models={STT_MODELS.map((m) => ({
              id: m.id,
              name: m.name,
              backend: 'onnx' as const,
              category: m.timestamps ? 'STT · timestamps' : 'STT',
              size: m.size,
            }))}
            selectedId={sttModelId}
            busyIds={stt.status === 'loading' ? new Set([sttModelId]) : undefined}
            onSelect={onSttModelIdChange}
            onDownload={(id) => {
              if (id === sttModelId) void stt.load().catch(() => {});
              else onSttModelIdChange(id);
            }}
          />
        </div>
        {stt.status === 'loading' && (
          <ModelLoadingPanel
            name={sttEntry.name}
            size={sttEntry.size}
            category="Speech-to-text"
            progress={stt.progressValue}
            cached={stt.cached === true}
          />
        )}
      </section>

      {/* ── Live surface (gated on the loaded STT model instance) ── */}
      {stt.model ? (
        <LiveSurface
          stt={stt}
          sttModel={stt.model}
          sttModelId={sttModelId}
          device={device}
          getSileroVad={getSileroVad}
          onSileroProgress={onSileroProgress}
        />
      ) : (
        <p className="p-4 text-sm text-muted-foreground">Preparing…</p>
      )}
    </>
  );
}

/* ────────────────────────────── LiveSurface ───────────────────────────────── */

interface LiveSurfaceProps {
  /** Shared STT load lifecycle. */
  stt: UseModelLoadReturn<SpeechToTextModel>;
  /** The loaded STT model instance. */
  sttModel: SpeechToTextModel;
  /** The selected STT model id (for display). */
  sttModelId: string;
  /** Resolved transformers inference device for the Granite planner. */
  device: 'webgpu' | 'wasm';
  /** Stable getter for the block-local Silero VAD provider (same instance every call). */
  getSileroVad: () => SileroVad;
  /** Register a Silero download-progress listener against the block-local provider. */
  onSileroProgress: (listener: (p: unknown) => void) => void;
}

/** The Live surface: streaming transcription + turn-taking demo (ported from live-tab.tsx). */
function LiveSurface({
  stt,
  sttModel,
  sttModelId,
  device,
  getSileroVad,
  onSileroProgress,
}: LiveSurfaceProps) {
  const [mode, setMode] = useState<LiveMode>('transcribe');
  const [vadChoice, setVadChoice] = useState<VadChoice>('energy');
  const [actionError, setActionError] = useState<string | null>(null);
  const [dismissedError, setDismissedError] = useState<string | null>(null);

  // ── gated model loads (Silero VAD, planner LM, Kokoro TTS) ──
  const sileroLoad = useModelLoad<SileroVad>({
    key: 'live-transcription-vad:silero',
    create: (onProgress) => {
      onSileroProgress((p) => onProgress(p as Parameters<typeof onProgress>[0]));
      return getSileroVad();
    },
    // A start/stop cycle through the public VADProvider contract forces the
    // ONNX session download (the adapter loads lazily on first start()).
    warmup: async (vad) => {
      await vad.start({ onSpeechStart: () => {}, onSpeechEnd: () => {} });
      await vad.stop();
    },
  });
  const plannerLoad = useModelLoad<LanguageModel>({
    key: `live-transcription-planner:${PLANNER_MODEL_ID}`,
    create: (onProgress) =>
      transformers.languageModel(PLANNER_MODEL_ID, {
        device,
        onProgress: (p) => onProgress(p as Parameters<typeof onProgress>[0]),
      }),
    isCached: () => isModelCached(PLANNER_MODEL_ID),
  });
  const ttsLoad = useModelLoad<TextToSpeechModel>({
    key: `live-transcription-tts:${TTS_MODEL_ID}`,
    create: (onProgress) =>
      transformers.textToSpeech(TTS_MODEL_ID, {
        onProgress: (p) => onProgress(p as Parameters<typeof onProgress>[0]),
      }),
    warmup: (model) => synthesizeSpeech({ model, text: 'Ready.', voice: KOKORO_DEFAULT_VOICE }),
    isCached: () => isModelCached(TTS_MODEL_ID),
  });

  // ── live transcription session ──
  // Options are captured when the controller is first constructed (inside
  // `start()`), so a VAD change disposes the controller (effect below) and the
  // next start builds a fresh one with the new options.
  const live = useLiveTranscribe({
    model: sttModel,
    mode: 'open-mic',
    vad: vadChoice === 'silero' ? getSileroVad() : 'energy',
    maxUtteranceSec: MAX_UTTERANCE_SEC,
  });

  const liveDisposeRef = useRef(live.dispose);
  useEffect(() => {
    // Sync the latest dispose post-render (react-hooks/refs: no ref writes
    // during render) so the VAD-change cleanup below — which runs before the
    // next render's effects — always disposes the outgoing controller.
    liveDisposeRef.current = live.dispose;
  });
  useEffect(() => {
    // On VAD change: dispose the old controller (releases the mic if a
    // session was running) so the next start binds the newly selected VAD.
    return () => {
      void liveDisposeRef.current();
    };
  }, [vadChoice]);

  // ── turn-taking session ──
  // useTurnTaker needs a constructed LiveTranscriber; it is created on the
  // first turn start (user gesture → getUserMedia) and pushed through state
  // with flushSync so the hook's optionsRef sees it before `turn.start()`.
  const [turnTranscriber, setTurnTranscriber] = useState<LiveTranscriber | null>(null);
  const turn = useTurnTaker({
    // Instances exist from the first client tick (creation downloads nothing);
    // they are only USED after the gated loads in startTurn().
    transcriber: turnTranscriber as unknown as LiveTranscriber,
    planner: plannerLoad.model as unknown as LanguageModel,
    voice: ttsLoad.model as unknown as TextToSpeechModel,
    systemPrompt: TURN_SYSTEM_PROMPT,
  });

  const liveActive = live.state === 'listening' || live.state === 'transcribing';
  const turnActive = turn.state !== 'idle' && turn.state !== 'error';

  const startLive = async () => {
    setActionError(null);
    setDismissedError(null);
    try {
      await stt.load();
      if (vadChoice === 'silero') await sileroLoad.load();
      await live.start();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  /** Stop AND dispose — `dispose()` is what releases the microphone. */
  const stopLive = async () => {
    await live.stop();
    await live.dispose();
  };

  const startTurn = async () => {
    setActionError(null);
    setDismissedError(null);
    try {
      await stt.load();
      if (vadChoice === 'silero') await sileroLoad.load();
      await Promise.all([plannerLoad.load(), ttsLoad.load()]);
      let transcriber = turnTranscriber;
      if (!transcriber) {
        transcriber = await createLiveTranscriber({
          model: sttModel,
          mode: 'open-mic',
          vad: vadChoice === 'silero' ? getSileroVad() : 'energy',
          maxUtteranceSec: MAX_UTTERANCE_SEC,
        });
        // Force the render so useTurnTaker's optionsRef carries the
        // transcriber before start() constructs the orchestrator.
        flushSync(() => setTurnTranscriber(transcriber));
      }
      await turn.start();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  /** Turn stop disposes the orchestrator AND its transcriber (mic released). */
  const stopTurn = async () => {
    await turn.stop();
    await turn.dispose();
    setTurnTranscriber(null);
  };

  const selectMode = (next: LiveMode) => {
    if (next === mode) return;
    // Stop whatever the outgoing mode had running before switching surfaces.
    if (mode === 'transcribe') void stopLive();
    else void stopTurn();
    setMode(next);
  };

  const selectVad = (next: VadChoice) => {
    if (next === vadChoice || liveActive || turnActive) return;
    setVadChoice(next);
  };

  // ── orb state (state-driven) ──
  const orbState: VoiceOrbState =
    mode === 'turn'
      ? turn.state === 'listening'
        ? 'listening'
        : turn.state === 'planning'
          ? 'thinking'
          : turn.state === 'speaking'
            ? 'speaking'
            : 'idle'
      : live.state === 'listening'
        ? 'listening'
        : live.state === 'transcribing'
          ? 'thinking'
          : 'idle';

  const rawErrorText =
    actionError ??
    (mode === 'transcribe' ? live.error?.message : turn.error?.message) ??
    plannerLoad.error?.message ??
    ttsLoad.error?.message ??
    sileroLoad.error?.message ??
    null;
  const errorText = rawErrorText && rawErrorText !== dismissedError ? rawErrorText : null;

  const statusText =
    mode === 'turn'
      ? turnActive
        ? turn.state
        : errorText
          ? 'error'
          : turn.turns.length > 0
            ? 'ready'
            : 'idle'
      : liveActive
        ? live.state
        : errorText
          ? 'error'
          : live.utterances.length > 0
            ? 'ready'
            : 'idle';
  const statusLabel =
    ({
      idle: 'Idle',
      ready: 'Ready',
      error: 'Error',
      listening: 'Listening…',
      transcribing: 'Transcribing…',
      planning: 'Planning…',
      speaking: 'Speaking…',
    } as Record<string, string>)[statusText] ?? statusText;

  return (
    <div className="flex flex-col gap-4">
      <p
        data-status={statusText}
        role="status"
        aria-live="polite"
        aria-label="Status"
        className="text-xs text-muted-foreground"
      >
        {statusLabel}
      </p>
      {errorText && (
        <ErrorAlert
          message={errorText}
          onDismiss={() => {
            setDismissedError(rawErrorText);
            setActionError(null);
          }}
        />
      )}

      {/* ── mode + VAD pickers ── */}
      <div className="flex flex-wrap items-center gap-4">
        <SegmentedModePicker<LiveMode>
          items={[
            { id: 'transcribe', label: 'Transcribe' },
            { id: 'turn', label: 'Turn-taking' },
          ]}
          selectedId={mode}
          onSelect={selectMode}
          aria-label="Live mode"
        />
        <SegmentedModePicker<VadChoice>
          items={[
            { id: 'energy', label: 'Energy VAD' },
            { id: 'silero', label: `Silero VAD · ${SILERO_VAD_MODEL_SIZE}` },
          ]}
          selectedId={vadChoice}
          onSelect={selectVad}
          aria-label="Voice activity detector"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Energy VAD needs no download; Silero VAD downloads a small model for sharper voice-activity
        detection.
      </p>

      {vadChoice === 'silero' && sileroLoad.status === 'loading' && (
        <ModelLoadingPanel
          name="Silero VAD"
          size={SILERO_VAD_MODEL_SIZE}
          category="VAD"
          progress={sileroLoad.progressValue}
          cached={sileroLoad.cached === true}
        />
      )}

      {/* ── orb + session controls ── */}
      <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <VoiceOrb state={orbState} size={96} />
          </div>
          <WaveformActivityBars active={orbState === 'listening' || orbState === 'speaking'} height={28} barCount={9} />
          {mode === 'transcribe' ? (
            <>
              <button
                type="button"
                onClick={() => void startLive()}
                disabled={liveActive}
                className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
              >
                Start live session
              </button>
              <button
                type="button"
                onClick={() => void stopLive()}
                disabled={!liveActive}
                className="inline-flex h-8 items-center rounded-md border border-border px-3 text-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
              >
                Stop
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void startTurn()}
                disabled={turnActive}
                className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
              >
                Start turn-taking
              </button>
              <button
                type="button"
                onClick={() => void stopTurn()}
                disabled={!turnActive}
                className="inline-flex h-8 items-center rounded-md border border-border px-3 text-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
              >
                Stop
              </button>
              <button
                type="button"
                onClick={() => turn.interrupt()}
                disabled={!turnActive}
                className="inline-flex h-8 items-center rounded-md border border-border px-3 text-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
              >
                Interrupt
              </button>
            </>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {mode === 'transcribe'
            ? `Open-mic streaming transcription on ${sttModelId}: speak, pause, and finalized utterances appear below.`
            : 'Speak, then wait: the assistant plans a short reply and speaks it back. Speaking over it barges in.'}
        </p>
      </section>

      {mode === 'transcribe' ? (
        <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">Utterances</h2>
            <button
              type="button"
              onClick={() => live.clearUtterances()}
              disabled={live.utterances.length === 0}
              className="inline-flex h-7 items-center rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
            >
              Clear
            </button>
          </div>
          <div
            className={cn(
              'min-h-6 rounded-md bg-muted/50 p-2 text-sm italic',
              !live.currentUtterance && 'text-muted-foreground',
            )}
          >
            {live.currentUtterance || (liveActive ? 'Listening…' : 'Partial text appears here while you speak.')}
          </div>
          {live.utterances.length === 0 ? (
            <p className="text-sm text-muted-foreground">No utterances yet.</p>
          ) : (
            <ul aria-label="Utterances" className="flex flex-col gap-1.5">
              {live.utterances.map((u) => (
                <li
                  key={u.utteranceId}
                  className="rounded-md border border-border bg-card p-2 text-sm"
                >
                  <span className="mr-2 text-[11px] tabular-nums text-muted-foreground">
                    {u.durationSec.toFixed(1)}s{u.truncated ? ' · truncated' : ''}
                  </span>
                  {u.text}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span
              data-state={turn.state}
              className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium capitalize"
            >
              {turn.state}
            </span>
            {turn.lastBargeIn && (
              <span
                className="rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400"
              >
                Barge-in at {turn.lastBargeIn.toLocaleTimeString()}
              </span>
            )}
          </div>
          {(plannerLoad.status === 'loading' || ttsLoad.status === 'loading') && (
            <div className="flex flex-col gap-2">
              {plannerLoad.status === 'loading' && (
                <ModelLoadingPanel
                  name="Granite 4.0 350M"
                  size={PLANNER_MODEL_SIZE}
                  category="Planner LM"
                  progress={plannerLoad.progressValue}
                  cached={plannerLoad.cached === true}
                />
              )}
              {ttsLoad.status === 'loading' && (
                <ModelLoadingPanel
                  name="Kokoro 82M"
                  size={TTS_MODEL_SIZE}
                  category="Text-to-speech"
                  progress={ttsLoad.progressValue}
                  cached={ttsLoad.cached === true}
                />
              )}
            </div>
          )}
          {turn.turns.length === 0 ? (
            <p className="text-sm text-muted-foreground">No turns yet - start and say something.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {turn.turns.map((t, i) => (
                <li
                  key={`${t.timestamp.getTime()}-${i}`}
                  data-role={t.role}
                  className={cn(
                    'rounded-md border p-2 text-sm',
                    t.role === 'agent' ? 'border-primary/30 bg-primary/5' : 'border-border bg-card',
                  )}
                >
                  <span className="mr-2 text-[11px] font-medium uppercase text-muted-foreground">
                    {t.role}
                  </span>
                  {t.text}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
