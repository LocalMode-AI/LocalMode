'use client';

/**
 * @file audiobook-reader.tsx
 * @description Audiobook Reader — long-text streaming synthesis (useStreamSpeech) with early playback, speed, pause/resume/stop, WAV download, a one-shot path, and a 10,000-char limit; Kokoro downloads on first synthesize/stream.
 */

import { useState } from 'react';
import {
  downloadBlob,
  useModelLoad,
  useStreamSpeech,
  useSynthesizeSpeech,
  type UseModelLoadReturn,
} from '@localmode/react';
import { synthesizeSpeech } from '@localmode/core';
import type { SynthesizedClause, TextToSpeechModel } from '@localmode/core';
import {
  transformers,
  isModelCached,
  KOKORO_VOICES,
  KOKORO_DEFAULT_VOICE,
} from '@localmode/transformers';

import { VoicePicker, type VoiceOption } from '@/components/voice-picker';
import { ParameterSlider } from '@/components/parameter-slider';
import { CharLimitIndicator } from '@/components/char-limit-indicator';
import { StreamingSpeechPanel } from '@/components/streaming-speech-panel';
import { WaveformActivityBars } from '@/components/waveform-activity-bars';
import { AudioScrubPlayer } from '@/components/audio-scrub-player';
import { ModelLoadingPanel } from '@/components/model-loading-panel';
import { ErrorAlert } from '@/components/error-alert';

// ─────────────────────────────────────────────────────────────
// Audiobook constants (inlined from the audio-studio catalog)
// ─────────────────────────────────────────────────────────────

/** Proven Kokoro TTS model (all 29 `KOKORO_VOICES`). */
const TTS_MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const TTS_MODEL_SIZE = '~86MB';

/** Maximum audiobook text length. */
const AUDIOBOOK_MAX_TEXT_LENGTH = 10_000;

/** Speed control range. */
const SPEED_MIN = 0.5;
const SPEED_MAX = 2.0;
const SPEED_STEP = 0.1;
const SPEED_DEFAULT = 1.0;

/** Pre-populated audiobook default text. */
const AUDIOBOOK_DEFAULT_TEXT =
  'Welcome to the LocalMode Audio Studio. This application converts your text into natural-sounding speech, entirely in your browser. No servers, no API keys. Your text never leaves your device.';

/** One-click sample texts. */
const SAMPLE_TEXTS: readonly string[] = [
  'The quick brown fox jumps over the lazy dog. A wonderful journey through the countryside begins with a single step.',
  'In the beginning, there was silence. Then came the sound of waves crashing against ancient shores, a rhythm as old as time itself.',
  'Technology has transformed the way we communicate. Today, artificial intelligence runs entirely in your browser, no servers needed.',
  'Once upon a time, in a land far away, there lived a wise old owl who knew the secrets of the forest.',
];

/**
 * Merge streamed clauses into one 16-bit PCM mono WAV blob for download.
 * Returns `null` when there are no clauses.
 */
function encodeWavFromClauses(clauses: readonly SynthesizedClause[]): Blob | null {
  if (clauses.length === 0) return null;

  const totalSamples = clauses.reduce((acc, c) => acc + c.audio.length, 0);
  const merged = new Float32Array(totalSamples);
  let offset = 0;
  for (const clause of clauses) {
    merged.set(clause.audio, offset);
    offset += clause.audio.length;
  }

  const sampleRate = clauses[0].sampleRate;
  const dataSize = merged.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeString = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < merged.length; i++) {
    const s = Math.max(-1, Math.min(1, merged[i]));
    view.setInt16(44 + i * 2, s * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

/** The full Kokoro catalog mapped to the voice-picker's `VoiceOption` shape. */
const VOICE_OPTIONS: VoiceOption[] = KOKORO_VOICES.map((v) => ({
  id: v.id,
  name: v.name,
  gender: v.gender,
  languageLabel: v.languageLabel,
}));

/**
 * The Audiobook Reader block: gates the Kokoro TTS download, owns the audiobook
 * text state, and hands both down to the streaming synthesis surface.
 */
export function AudiobookReaderBlock() {
  const [text, setText] = useState(AUDIOBOOK_DEFAULT_TEXT);

  const ttsLoad = useModelLoad<TextToSpeechModel>({
    key: `audiobook-reader-tts:${TTS_MODEL_ID}`,
    create: (onProgress) =>
      transformers.textToSpeech(TTS_MODEL_ID, {
        onProgress: (p) => onProgress(p as Parameters<typeof onProgress>[0]),
      }),
    warmup: (model) => synthesizeSpeech({ model, text: 'Ready.', voice: KOKORO_DEFAULT_VOICE }),
    isCached: () => isModelCached(TTS_MODEL_ID),
  });

  const ttsModel = ttsLoad.model;
  if (!ttsModel) return <p className="p-4 text-sm text-muted-foreground">Preparing…</p>;
  return <AudiobookSurface ttsLoad={ttsLoad} ttsModel={ttsModel} text={text} onTextChange={setText} />;
}

interface AudiobookSurfaceProps {
  ttsLoad: UseModelLoadReturn<TextToSpeechModel>;
  ttsModel: TextToSpeechModel;
  /** The audiobook text (block-owned). */
  text: string;
  /** Update the block-owned text. */
  onTextChange: (text: string) => void;
}

/** The Audiobook surface: long-text streaming synthesis + one-shot TTS. */
function AudiobookSurface({ ttsLoad, ttsModel, text, onTextChange }: AudiobookSurfaceProps) {
  const [voiceId, setVoiceId] = useState(KOKORO_DEFAULT_VOICE);
  const [speed, setSpeed] = useState(SPEED_DEFAULT);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  /** The last action, for the error row's Retry. */
  const [lastAction, setLastAction] = useState<'synthesize' | 'stream' | null>(null);

  const tts = useSynthesizeSpeech({ model: ttsModel, voice: voiceId, speed });
  const stream = useStreamSpeech({ model: ttsModel, voice: voiceId, speed });

  const streamActive = stream.isSynthesizing || stream.isPlaying;
  const streamFinished = !streamActive && stream.clauses.length > 0;
  const streamStarted = streamActive || stream.clauses.length > 0;
  const runActive = streamActive || tts.isLoading;
  const overLimit = text.length > AUDIOBOOK_MAX_TEXT_LENGTH;

  /** Pre-flight validation. */
  const validate = (): boolean => {
    if (!text.trim()) {
      setValidationError('Please enter some text to convert to speech.');
      return false;
    }
    if (overLimit) {
      setValidationError(
        `Text is too long. Maximum ${AUDIOBOOK_MAX_TEXT_LENGTH.toLocaleString()} characters allowed.`,
      );
      return false;
    }
    setValidationError(null);
    return true;
  };

  /** One-shot synthesis → `tts-ready` scrub player. */
  const synthesizeOnce = async () => {
    if (runActive || !validate()) return;
    setLastAction('synthesize');
    setDismissedError(null);
    try {
      await ttsLoad.load(); // gated Kokoro download with visible progress
      await tts.execute(text); // errors surface via tts.error
    } catch {
      // Load failures surface via ttsLoad.error below.
    }
  };

  /** Streaming synthesis with progressive playback. */
  const streamSpeak = async () => {
    if (runActive || !validate()) return;
    setLastAction('stream');
    setDismissedError(null);
    try {
      await ttsLoad.load();
      await stream.speak(text); // errors surface via stream.error
    } catch {
      // Load failures surface via ttsLoad.error below.
    }
  };

  const downloadWav = () => {
    const wav = encodeWavFromClauses(stream.clauses);
    if (!wav) return;
    downloadBlob(wav, `audio-${voiceId}-${Date.now()}.wav`, 'audio/wav');
  };

  /** Explicit reset: stop playback, clear audio + text + errors. */
  const resetAll = () => {
    stream.stop();
    stream.reset();
    tts.reset();
    onTextChange(AUDIOBOOK_DEFAULT_TEXT);
    setVoiceId(KOKORO_DEFAULT_VOICE);
    setSpeed(SPEED_DEFAULT);
    setValidationError(null);
    setDismissedError(null);
    setLastAction(null);
  };

  const retry = () => {
    setDismissedError(rawErrorText);
    tts.reset();
    stream.reset();
    if (lastAction === 'synthesize') void synthesizeOnce();
    else if (lastAction === 'stream') void streamSpeak();
  };

  const rawErrorText =
    validationError ?? tts.error?.message ?? stream.error?.message ?? ttsLoad.error?.message ?? null;
  const errorText = rawErrorText && rawErrorText !== dismissedError ? rawErrorText : null;

  const ttsBlob = tts.data?.audio ?? null;

  const statusText = tts.isLoading
    ? 'synthesizing'
    : stream.isSynthesizing || stream.isPlaying
      ? 'streaming-speech'
      : errorText
        ? 'error'
        : ttsBlob || stream.clauses.length > 0
          ? 'ready'
          : 'idle';
  const statusLabel =
    statusText === 'synthesizing'
      ? 'Synthesizing…'
      : statusText === 'streaming-speech'
        ? 'Streaming speech…'
        : statusText === 'error'
          ? 'Error'
          : statusText === 'ready'
            ? 'Ready'
            : 'Idle';

  return (
    <div className="flex flex-col gap-4 p-4">
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
          onRetry={validationError ? undefined : retry}
          onDismiss={() => {
            setDismissedError(rawErrorText);
            setValidationError(null);
          }}
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

      {/* ── text input + char limit + sample texts ── */}
      <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Text</h2>
          <CharLimitIndicator charCount={text.length} maxLength={AUDIOBOOK_MAX_TEXT_LENGTH} />
        </div>
        <textarea
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          rows={8}
          disabled={runActive}
          aria-label="Audiobook text"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
        />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Samples:</span>
          {SAMPLE_TEXTS.map((sample, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onTextChange(sample)}
              disabled={runActive}
              title={sample}
              aria-label={`Sample ${i + 1}: ${sample.slice(0, 50)}…`}
              className="inline-flex h-7 items-center rounded-md border border-border px-2.5 text-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
            >
              Sample {i + 1}
            </button>
          ))}
        </div>
      </section>

      {/* ── voice + speed (disabled during runs) ── */}
      <section className="flex flex-wrap items-end gap-6 rounded-lg border border-border p-4">
        <VoicePicker
          voices={VOICE_OPTIONS}
          value={voiceId}
          onValueChange={setVoiceId}
          disabled={runActive}
          label="Voice"
        />
        <div className="min-w-56 flex-1">
          <ParameterSlider
            label="Speed"
            value={speed}
            onChange={setSpeed}
            min={SPEED_MIN}
            max={SPEED_MAX}
            step={SPEED_STEP}
            precision={1}
            unit="×"
            disabled={runActive}
          />
        </div>
      </section>

      {/* ── actions ── */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void streamSpeak()}
          disabled={runActive || !text.trim()}
          className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
        >
          {stream.isSynthesizing ? 'Generating…' : 'Generate audiobook (stream & play)'}
        </button>
        <button
          type="button"
          onClick={() => void synthesizeOnce()}
          disabled={runActive || !text.trim()}
          className="inline-flex h-8 items-center rounded-md border border-border px-3 text-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
        >
          {tts.isLoading ? 'Synthesizing…' : 'Synthesize (single take)'}
        </button>
        <button
          type="button"
          onClick={resetAll}
          className="inline-flex h-8 items-center rounded-md border border-border px-3 text-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          Reset
        </button>
      </div>

      {/* ── streaming run: panel + transport controls ── */}
      <section
        data-synthesizing={stream.isSynthesizing ? 'true' : 'false'}
        data-playing={stream.isPlaying ? 'true' : 'false'}
        role="region"
        aria-label="Streaming playback"
        className="flex flex-col gap-3 rounded-lg border border-border p-4"
      >
        {streamStarted && (
          <>
            {/* transport controls */}
            <div className="flex flex-wrap items-center gap-2">
              <WaveformActivityBars active={stream.isPlaying} height={24} barCount={7} />
              <button
                type="button"
                onClick={stream.pause}
                disabled={!stream.isPlaying}
                className="inline-flex h-7 items-center rounded-md border border-border px-2.5 text-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
              >
                Pause
              </button>
              <button
                type="button"
                onClick={stream.resume}
                disabled={stream.isPlaying || (!streamActive && stream.clauses.length === 0)}
                className="inline-flex h-7 items-center rounded-md border border-border px-2.5 text-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
              >
                Resume
              </button>
              <button
                type="button"
                onClick={stream.stop}
                disabled={!streamActive}
                className="inline-flex h-7 items-center rounded-md border border-border px-2.5 text-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
              >
                Stop
              </button>
            </div>

            {/* clause count + download (own row so neither jumps lines unpredictably) */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span
                data-count={stream.clauses.length}
                className="text-xs tabular-nums text-muted-foreground"
              >
                Streamed {stream.clauses.length} clause{stream.clauses.length === 1 ? '' : 's'}
              </span>
              <button
                type="button"
                onClick={downloadWav}
                disabled={!streamFinished}
                className="inline-flex h-7 items-center rounded-md border border-border px-2.5 text-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
              >
                Download WAV
              </button>
            </div>

            <p className="min-h-5 text-sm">
              {stream.currentClause ? (
                <>
                  <span className="mr-2 text-[11px] font-medium tracking-wide text-primary uppercase">
                    Now playing
                  </span>
                  {stream.currentClause.text}
                </>
              ) : (
                <span className="text-muted-foreground text-xs">
                  {streamActive ? 'Buffering next clause…' : 'The playing clause appears here during a run.'}
                </span>
              )}
            </p>
          </>
        )}

        <StreamingSpeechPanel
          isSynthesizing={stream.isSynthesizing}
          isPlaying={stream.isPlaying}
          currentClause={stream.currentClause}
          clauses={stream.clauses}
        />
      </section>

      {/* ── one-shot result ── */}
      {ttsBlob && !tts.isLoading && (
        <div
          role="region"
          aria-label="Single-take result"
          className="flex flex-col gap-2 rounded-lg border border-border p-4"
        >
          <p className="text-xs text-muted-foreground">Single-take synthesis: {voiceId}</p>
          <AudioScrubPlayer audio={ttsBlob} />
        </div>
      )}
    </div>
  );
}
