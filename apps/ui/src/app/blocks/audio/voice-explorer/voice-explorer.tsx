'use client';

/**
 * @file voice-explorer.tsx
 * @description Voice Explorer — browse, search, preview, and A/B-compare all 29 Kokoro voices; Kokoro downloads only on the first preview or comparison.
 */

import { useState } from 'react';
import { useModelLoad, useSynthesizeSpeech, type UseModelLoadReturn } from '@localmode/react';
import { synthesizeSpeech } from '@localmode/core';
import type { TextToSpeechModel } from '@localmode/core';
import {
  transformers,
  isModelCached,
  KOKORO_VOICES,
  KOKORO_DEFAULT_VOICE,
} from '@localmode/transformers';

import { VoiceCard, type VoiceOption } from '@/components/voice-picker';
import { VoiceComparisonPanel } from '@/components/voice-comparison-panel';
import { AudioScrubPlayer } from '@/components/audio-scrub-player';
import { ModelLoadingPanel } from '@/components/model-loading-panel';
import { ErrorAlert } from '@/components/error-alert';

/** Proven Kokoro TTS model (voice block / voice-studio parity). */
const TTS_MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const TTS_MODEL_SIZE = '~86MB';

/** Per-voice preview sample text (voice-studio parity). */
const PREVIEW_TEXT = 'Hello! This is a preview of this voice.';

/** The full Kokoro catalog mapped to the voice-picker's `VoiceOption` shape. */
const VOICE_OPTIONS: VoiceOption[] = KOKORO_VOICES.map((v) => ({
  id: v.id,
  name: v.name,
  gender: v.gender,
  languageLabel: v.languageLabel,
}));

const DEFAULT_COMPARE_TEXT = 'The quick brown fox jumps over the lazy dog.';

/** The Voice Explorer block: browse/preview all 29 Kokoro voices + A/B comparison. */
export function VoiceExplorerBlock() {
  const ttsLoad = useModelLoad<TextToSpeechModel>({
    key: `voice-explorer-tts:${TTS_MODEL_ID}`,
    create: (onProgress) =>
      transformers.textToSpeech(TTS_MODEL_ID, {
        onProgress: (p) => onProgress(p as Parameters<typeof onProgress>[0]),
      }),
    warmup: (model) => synthesizeSpeech({ model, text: 'Ready.', voice: KOKORO_DEFAULT_VOICE }),
    isCached: () => isModelCached(TTS_MODEL_ID),
  });

  const ttsModel = ttsLoad.model;
  if (!ttsModel) return <p className="p-4 text-sm text-muted-foreground">Preparing…</p>;
  return <VoiceExplorerSurface ttsLoad={ttsLoad} ttsModel={ttsModel} />;
}

interface VoiceExplorerSurfaceProps {
  ttsLoad: UseModelLoadReturn<TextToSpeechModel>;
  ttsModel: TextToSpeechModel;
}

function VoiceExplorerSurface({ ttsLoad, ttsModel }: VoiceExplorerSurfaceProps) {
  const previewTts = useSynthesizeSpeech({ model: ttsModel });
  const compareTts = useSynthesizeSpeech({ model: ttsModel });

  // ── browse + preview state ──
  const [search, setSearch] = useState('');
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | undefined>();
  const [pendingPreviewId, setPendingPreviewId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ voiceId: string; audio: Blob } | null>(null);
  const [dismissedError, setDismissedError] = useState<string | null>(null);

  // ── comparison state (voice-studio defaults) ──
  const [voiceA, setVoiceA] = useState('af_heart');
  const [voiceB, setVoiceB] = useState('am_michael');
  const [compareText, setCompareText] = useState(DEFAULT_COMPARE_TEXT);
  const [audioA, setAudioA] = useState<Blob | null>(null);
  const [audioB, setAudioB] = useState<Blob | null>(null);
  const [comparing, setComparing] = useState(false);

  const query = search.trim().toLowerCase();
  const filtered = query
    ? VOICE_OPTIONS.filter(
        (v) =>
          v.name.toLowerCase().includes(query) ||
          v.id.toLowerCase().includes(query) ||
          v.gender.includes(query),
      )
    : VOICE_OPTIONS;
  const groups = [...new Set(filtered.map((v) => v.languageLabel))].map((label) => ({
    label,
    voices: filtered.filter((v) => v.languageLabel === label),
  }));

  /** Play/stop toggle: previewing a voice stops (unmounts) any other preview. */
  const previewVoice = async (voiceId: string) => {
    if (preview?.voiceId === voiceId) {
      // Toggle off — unmounting the player stops playback + revokes the URL.
      setPreview(null);
      return;
    }
    setPendingPreviewId(voiceId);
    setPreview(null);
    setDismissedError(null);
    try {
      await ttsLoad.load(); // gated Kokoro download with visible progress
      const result = await previewTts.execute(PREVIEW_TEXT, { voice: voiceId });
      if (result) setPreview({ voiceId, audio: result.audio });
    } catch {
      // Load failures surface via ttsLoad.error below.
    } finally {
      setPendingPreviewId(null);
    }
  };

  /** Sequential A→B synthesis over the shared text (voice-studio parity). */
  const runCompare = async () => {
    if (comparing || !compareText.trim()) return;
    setComparing(true);
    setDismissedError(null);
    setAudioA(null);
    setAudioB(null);
    try {
      await ttsLoad.load();
      const a = await compareTts.execute(compareText, { voice: voiceA });
      if (!a) return; // cancelled or errored
      setAudioA(a.audio);
      const b = await compareTts.execute(compareText, { voice: voiceB });
      if (!b) return;
      setAudioB(b.audio);
    } catch {
      // Load failures surface via ttsLoad.error below.
    } finally {
      setComparing(false);
    }
  };

  const cancelCompare = () => {
    compareTts.cancel();
    setComparing(false);
  };

  const rawErrorText =
    previewTts.error?.message ?? compareTts.error?.message ?? ttsLoad.error?.message ?? null;
  const errorText = rawErrorText && rawErrorText !== dismissedError ? rawErrorText : null;

  const busy = previewTts.isLoading || comparing;
  const statusText = busy
    ? 'synthesizing'
    : errorText
      ? 'error'
      : preview || audioA || audioB
        ? 'ready'
        : 'idle';
  const statusLabel =
    statusText === 'synthesizing'
      ? 'Synthesizing…'
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
          onDismiss={() => {
            setDismissedError(rawErrorText);
            previewTts.reset();
            compareTts.reset();
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

      {/* ── browse all 29 voices (grouped, searchable) ── */}
      <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium">
            Voices <span className="text-xs text-muted-foreground">({VOICE_OPTIONS.length} Kokoro voices)</span>
          </h2>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, id, or gender…"
            aria-label="Search voices"
            className="h-8 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:w-56"
          />
        </div>

        <div className="flex flex-col gap-4">
          {groups.length === 0 && (
            <p className="text-sm text-muted-foreground">No voices match “{search}”.</p>
          )}
          {groups.map((group) => (
            <div key={group.label} className="flex flex-col gap-2">
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {group.label} <span className="normal-case">({group.voices.length})</span>
              </h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {group.voices.map((voice) => (
                  <div key={voice.id} data-voice-id={voice.id}>
                    <VoiceCard
                      voice={voice}
                      selected={selectedVoiceId === voice.id}
                      onSelect={setSelectedVoiceId}
                      onPreview={(id) => void previewVoice(id)}
                      loading={pendingPreviewId === voice.id}
                      playing={preview?.voiceId === voice.id}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {preview && (
          <div
            data-voice-id={preview.voiceId}
            role="region"
            aria-label="Voice preview"
            className="flex flex-col gap-1"
          >
            <p className="text-xs text-muted-foreground">
              Previewing <span className="font-medium">{preview.voiceId}</span>: “{PREVIEW_TEXT}”
            </p>
            <AudioScrubPlayer audio={preview.audio} autoPlay />
          </div>
        )}
      </section>

      {/* ── A/B comparison (voice-studio Compare parity) ── */}
      <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-medium">Compare two voices</h2>
          <span
            data-ready={audioA ? 'true' : 'false'}
            data-voice={voiceA}
            className="rounded-md bg-muted px-1.5 py-0.5 text-xs tabular-nums text-foreground/70"
          >
            A: {voiceA} · {audioA ? 'Ready' : 'Pending'}
          </span>
          <span
            data-ready={audioB ? 'true' : 'false'}
            data-voice={voiceB}
            className="rounded-md bg-muted px-1.5 py-0.5 text-xs tabular-nums text-foreground/70"
          >
            B: {voiceB} · {audioB ? 'Ready' : 'Pending'}
          </span>
          {comparing && (
            <button
              type="button"
              onClick={cancelCompare}
              className="inline-flex h-7 items-center rounded-md border border-border px-2.5 text-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              Cancel
            </button>
          )}
        </div>
        <div role="group" aria-label="Voice comparison">
          <VoiceComparisonPanel
            voices={VOICE_OPTIONS}
            columnA={{ voiceId: voiceA, audio: audioA }}
            columnB={{ voiceId: voiceB, audio: audioB }}
            onVoiceAChange={setVoiceA}
            onVoiceBChange={setVoiceB}
            text={compareText}
            onTextChange={setCompareText}
            onCompare={() => void runCompare()}
            loading={comparing}
          />
        </div>
      </section>
    </div>
  );
}
