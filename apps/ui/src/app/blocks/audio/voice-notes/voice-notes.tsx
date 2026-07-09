'use client';

/**
 * @file voice-notes.tsx
 * @description Voice Notes — record or upload → Whisper/Moonshine transcription → saved notes with synced word replay and block-local semantic search; owns its STT selector.
 */

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import {
  useModelLoad,
  useTranscribe,
  useVoiceRecorder,
  type UseModelLoadReturn,
} from '@localmode/react';
import type { EmbeddingModel, SpeechToTextModel, VectorDB } from '@localmode/core';
import { transcribe, createVectorDB, embed } from '@localmode/core';
import { transformers, isModelCached } from '@localmode/transformers';

import { VoiceButton, type VoiceButtonState } from '@/components/voice-button';
import { MicSelector } from '@/components/mic-selector';
import { WaveformActivityBars } from '@/components/waveform-activity-bars';
import { FileDropzone } from '@/components/file-dropzone';
import { TranscribedNoteCard } from '@/components/transcribed-note-card';
import { SyncedTranscriptViewer } from '@/components/synced-transcript-viewer';
import { ScoredResultBarList, type ScoredResult } from '@/components/scored-result-bar-list';
import { ModelSelector } from '@/components/model-selector';
import { ModelLoadingPanel } from '@/components/model-loading-panel';
import { ErrorAlert } from '@/components/error-alert';

/* ─────────────────────────────── note index ─────────────────────────────── */

/** A ranked note-search hit. */
export interface NoteSearchHit {
  /** The matching note's id. */
  noteId: string;
  /** Cosine similarity score in 0–1. */
  score: number;
}

/** Minimal note shape the index needs. */
interface IndexableNote {
  id: string;
  text: string;
}

/**
 * Own a session-scoped semantic note index without any module-level state: the
 * `VectorDB` promise and the indexed-id `Set` live in refs, the DB is created
 * lazily on the first search (in-memory storage → ephemeral, dies with the
 * block), and it is closed on unmount. `search()` evicts deleted notes first,
 * then embeds-and-indexes any new notes, then ranks against the query vector.
 */
export function useNoteIndex() {
  const dbPromiseRef = useRef<Promise<VectorDB<{ text: string }>> | null>(null);
  const indexedIdsRef = useRef<Set<string>>(new Set());

  // Lazy per-session index. `storage: 'memory'` is ephemeral, so the name is
  // non-persistent.
  const getDb = (dimensions: number): Promise<VectorDB<{ text: string }>> => {
    if (!dbPromiseRef.current) {
      const promise = createVectorDB<{ text: string }>({
        name: 'voice-notes-search',
        dimensions,
        storage: 'memory',
      });
      // On construction failure, drop the ref so the next search retries.
      promise.catch(() => {
        if (dbPromiseRef.current === promise) dbPromiseRef.current = null;
      });
      dbPromiseRef.current = promise;
    }
    return dbPromiseRef.current;
  };

  // Dispose the in-memory VectorDB when the block unmounts (STT-model remount
  // or page leave). Reads the refs at cleanup time so the live instance closes.
  useEffect(() => {
    return () => {
      const pending = dbPromiseRef.current;
      dbPromiseRef.current = null;
      indexedIdsRef.current.clear();
      if (pending) void pending.then((db) => db.close()).catch(() => {});
    };
  }, []);

  /**
   * Sync the index with the current notes (evict deleted, embed + add new),
   * then run a semantic search for `query`. The caller gates the
   * embedding-model download (`useModelLoad`) before invoking this.
   */
  const search = async (
    model: EmbeddingModel,
    notes: readonly IndexableNote[],
    query: string,
    abortSignal?: AbortSignal,
  ): Promise<NoteSearchHit[]> => {
    abortSignal?.throwIfAborted();

    // Embed the query first — its length fixes the collection's dimensionality.
    const { embedding: queryVector } = await embed({
      model,
      value: query,
      ...(abortSignal ? { abortSignal } : {}),
    });
    const db = await getDb(queryVector.length);
    const indexedIds = indexedIdsRef.current;

    // Evict notes deleted since the last search.
    const liveIds = new Set(notes.map((n) => n.id));
    for (const id of [...indexedIds]) {
      if (!liveIds.has(id)) {
        abortSignal?.throwIfAborted();
        await db.delete(id);
        indexedIds.delete(id);
      }
    }

    // Index notes added since the last search.
    for (const note of notes) {
      if (indexedIds.has(note.id)) continue;
      abortSignal?.throwIfAborted();
      const { embedding } = await embed({
        model,
        value: note.text,
        ...(abortSignal ? { abortSignal } : {}),
      });
      await db.add({ id: note.id, vector: embedding, metadata: { text: note.text } });
      indexedIds.add(note.id);
    }

    abortSignal?.throwIfAborted();
    const results = await db.search(queryVector, { k: Math.max(notes.length, 1) });
    return results.map((r) => ({ noteId: r.id, score: r.score }));
  };

  return { search };
}

/* ─────────────────────────── model catalog (block slice) ─────────────────────────── */

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

/** The block's STT choices (voice-notes parity). */
const STT_MODELS: readonly SttModelEntry[] = [
  { id: 'Xenova/whisper-tiny.en', name: 'Whisper Tiny EN', size: '~40MB', timestamps: true },
  { id: 'onnx-community/moonshine-tiny-ONNX', name: 'Moonshine Tiny', size: '~50MB', timestamps: false },
  { id: 'onnx-community/moonshine-base-ONNX', name: 'Moonshine Base', size: '~237MB', timestamps: false },
];

/** Default STT model — the only timestamps-validated one (feeds the synced viewer). */
const DEFAULT_STT_MODEL_ID = STT_MODELS[0].id;

/** True when the given STT model has validated segment-timestamp support. */
function sttSupportsTimestamps(modelId: string): boolean {
  return STT_MODELS.find((m) => m.id === modelId)?.timestamps ?? false;
}

/** Note-search embedding model (384-dim; shared with the knowledge-base block for cache reuse). */
const EMBEDDING_MODEL_ID = 'Xenova/bge-small-en-v1.5';
const EMBEDDING_MODEL_SIZE = '~34MB';

/** Fallback note text when transcription finds no speech (voice-notes parity). */
const NO_SPEECH_TEXT = '[No speech detected]';

/** Audio MIME types accepted by the upload surface. */
const ACCEPTED_AUDIO_MIME_TYPES = [
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/mp3',
  'audio/mpeg',
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/m4a',
  'audio/aac',
  'video/mp4',
];

/** One timestamped span of a transcript (structurally = `TimedWord`). */
interface NoteWord {
  /** Span text. */
  text: string;
  /** Start time in seconds. */
  start: number;
  /** End time in seconds. */
  end: number;
}

/** One saved voice note (session-scoped). */
interface SavedNote {
  /** Stable id (also the vector-index id). */
  id: string;
  /** Transcript text (whitespace-preserved; `NO_SPEECH_TEXT` fallback). */
  text: string;
  /** The original recording/upload for inline playback. */
  audio: Blob;
  /** When the note was created. */
  timestamp: Date;
  /** Real Whisper SEGMENT timestamps (empty for Moonshine models). */
  words: NoteWord[];
}

/* ─────────────────────────────── VoiceNotesBlock ─────────────────────────────── */

/**
 * Outer component: owns everything that must SURVIVE an STT model switch — the
 * saved notes and the STT model id. The inner session is remounted (React
 * `key`) per STT model so the model instance, its `useModelLoad` lifecycle, and
 * every STT-bound hook stay coherent (shell SessionHost pattern).
 */
export function VoiceNotesBlock() {
  const [sttModelId, setSttModelId] = useState(DEFAULT_STT_MODEL_ID);
  const [notes, setNotes] = useState<SavedNote[]>([]);

  return (
    <div className="flex flex-col gap-4 p-4">
      <NotesSession
        key={sttModelId}
        sttModelId={sttModelId}
        onSttModelIdChange={setSttModelId}
        notes={notes}
        onNotesChange={setNotes}
      />
    </div>
  );
}

/* ─────────────────────────────── NotesSession ─────────────────────────────── */

interface NotesSessionProps {
  sttModelId: string;
  onSttModelIdChange: (id: string) => void;
  notes: SavedNote[];
  onNotesChange: Dispatch<SetStateAction<SavedNote[]>>;
}

/**
 * Inner host, remounted per STT model id: owns THE `useModelLoad` for the
 * selected STT model (real-inference warmup on a 1 s silent buffer), renders
 * the STT selector + download panel, then gates the Notes surface on the loaded
 * model instance (null for exactly one client-mount tick — no bytes download).
 */
function NotesSession({ sttModelId, onSttModelIdChange, notes, onNotesChange }: NotesSessionProps) {
  // ── STT model load lifecycle (explicit-action gated) ──
  const stt = useModelLoad<SpeechToTextModel>({
    key: `voice-notes-stt:${sttModelId}`,
    create: (onProgress) =>
      transformers.speechToText(sttModelId, {
        onProgress: (p) => onProgress(p as Parameters<typeof onProgress>[0]),
      }),
    // Real inference on 1 s of silence forces the provider's lazy pipeline load
    // to completion (useModelLoad's default warmup only knows
    // LanguageModel/EmbeddingModel).
    warmup: (model) => transcribe({ model, audio: new Float32Array(16_000) }),
    isCached: () => isModelCached(sttModelId),
  });

  const sttEntry = STT_MODELS.find((m) => m.id === sttModelId) ?? STT_MODELS[0];
  const supportsTimestamps = sttSupportsTimestamps(sttModelId);

  // ── note mutations (index sync happens lazily at search time) ──
  const addNote = (note: SavedNote) => onNotesChange((prev) => [note, ...prev]);
  const deleteNote = (id: string) => onNotesChange((prev) => prev.filter((n) => n.id !== id));

  return (
    <>
      {/* ── block-owned STT model choice ── */}
      <section className="flex flex-col gap-2">
        <div data-model-id={sttModelId}>
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Speech-to-text model - downloads only when you transcribe, upload audio, or press its
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

      {/* ── Notes surface (gated on the loaded STT model) ── */}
      {stt.model ? (
        <NotesSurface
          stt={stt as UseModelLoadReturn<SpeechToTextModel>}
          sttModel={stt.model}
          supportsTimestamps={supportsTimestamps}
          notes={notes}
          onAddNote={addNote}
          onDeleteNote={deleteNote}
        />
      ) : (
        <p className="p-4 text-sm text-muted-foreground">Preparing…</p>
      )}
    </>
  );
}

/* ─────────────────────────────── NotesSurface ─────────────────────────────── */

interface NotesSurfaceProps {
  /** STT load lifecycle (progress panel renders in the session host). */
  stt: UseModelLoadReturn<SpeechToTextModel>;
  /** The loaded STT model instance (non-null — session gates the null tick). */
  sttModel: SpeechToTextModel;
  /** True when the selected STT model has validated segment timestamps. */
  supportsTimestamps: boolean;
  /** Saved notes, newest first. */
  notes: SavedNote[];
  /** Persist a new note (prepends). */
  onAddNote: (note: SavedNote) => void;
  /** Delete a note by id. */
  onDeleteNote: (id: string) => void;
}

/** The Notes surface: record/upload → transcribe → manage + search notes. */
function NotesSurface({
  stt,
  sttModel,
  supportsTimestamps,
  notes,
  onAddNote,
  onDeleteNote,
}: NotesSurfaceProps) {
  const [micDeviceId, setMicDeviceId] = useState<string | undefined>();
  // The recorder records the SELECTED microphone (deviceId: { exact }) and
  // exposes getVolume().
  const recorder = useVoiceRecorder({ deviceId: micDeviceId });
  const transcriber = useTranscribe({ model: sttModel, returnTimestamps: supportsTimestamps });

  const [voiceState, setVoiceState] = useState<VoiceButtonState>('idle');
  const [micVolume, setMicVolume] = useState(0);
  const [dismissedError, setDismissedError] = useState<string | null>(null);

  // ── semantic note search (gated embedding model + block-local index) ──
  const noteIndex = useNoteIndex();
  const embedLoad = useModelLoad<EmbeddingModel>({
    key: `voice-notes-embedding:${EMBEDDING_MODEL_ID}`,
    create: (onProgress) =>
      transformers.embedding(EMBEDDING_MODEL_ID, {
        onProgress: (p) => onProgress(p as Parameters<typeof onProgress>[0]),
      }),
    isCached: () => isModelCached(EMBEDDING_MODEL_ID),
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ScoredResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const recordStartedAtRef = useRef(0);

  // useVoiceRecorder reports start failures (e.g. permission denied) via its
  // error state rather than throwing — derive the button's error state.
  const buttonState: VoiceButtonState =
    voiceState === 'recording' && recorder.error ? 'error' : voiceState;

  // Feed the VoiceButton's in-button waveform at ~10Hz while recording.
  useEffect(() => {
    if (buttonState !== 'recording') {
      setMicVolume(0);
      return;
    }
    const id = window.setInterval(() => setMicVolume(Math.min(1, recorder.getVolume() * 4)), 100);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buttonState]);

  const startRecording = async () => {
    setVoiceState('recording');
    recordStartedAtRef.current = Date.now();
    await recorder.startRecording(); // failures land in recorder.error
  };

  /** Transcribe a blob (recording or upload) into a saved note. */
  const transcribeToNote = async (blob: Blob) => {
    setVoiceState('processing');
    setDismissedError(null);
    // Explicit user action → surface the STT download in the session panel.
    try {
      await stt.load();
    } catch {
      setVoiceState('error');
      return;
    }
    const result = await transcriber.execute(blob);
    if (!result) {
      // Cancelled (returns to idle without a note) or errored — either way the
      // status/error lines derive from transcriber.error on the next render.
      setVoiceState('idle');
      return;
    }
    onAddNote({
      id: crypto.randomUUID(),
      text: result.text.trim() || NO_SPEECH_TEXT,
      audio: blob,
      timestamp: new Date(),
      words: supportsTimestamps
        ? (result.segments ?? [])
            .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end))
            .map((s) => ({ text: s.text.trim(), start: s.start, end: s.end }))
        : [],
    });
    setVoiceState('success');
  };

  const stopAndTranscribe = async () => {
    if (buttonState !== 'recording') return;
    // Guard against the press-click's own pointerup stopping the recording a
    // few ms after it started.
    if (Date.now() - recordStartedAtRef.current < 500) return;

    const blob = await recorder.stopRecording();
    if (!blob) {
      setVoiceState('error');
      return;
    }
    await transcribeToNote(blob);
  };

  const runSearch = async () => {
    const query = searchQuery.trim();
    if (!query || searching || notes.length === 0) return;
    setSearching(true);
    setSearchError(null);
    try {
      // Explicit user action → gated embedding download with visible progress.
      await embedLoad.load();
      const model = embedLoad.model;
      if (!model) throw new Error('Embedding model unavailable');
      const hits = await noteIndex.search(model, notes, query);
      const byId = new Map(notes.map((n) => [n.id, n]));
      setSearchResults(
        hits
          .filter((h) => byId.has(h.noteId))
          .map((h) => ({ label: byId.get(h.noteId)!.text, score: h.score })),
      );
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : String(err));
    } finally {
      setSearching(false);
    }
  };

  const latestTimestamped = notes.find((n) => n.words.length > 0);
  const latestText = notes[0]?.text ?? '';

  const rawErrorText =
    recorder.error?.message ??
    transcriber.error?.message ??
    searchError ??
    (buttonState === 'error' ? 'Recording failed' : null);
  const errorText = rawErrorText && rawErrorText !== dismissedError ? rawErrorText : null;

  const statusText =
    buttonState === 'recording'
      ? 'recording'
      : buttonState === 'processing'
        ? 'transcribing'
        : searching
          ? 'searching'
          : errorText
            ? 'error'
            : notes.length > 0
              ? 'ready'
              : 'idle';
  const statusLabel =
    statusText === 'recording'
      ? 'Recording…'
      : statusText === 'transcribing'
        ? 'Transcribing…'
        : statusText === 'searching'
          ? 'Searching…'
          : statusText === 'error'
            ? 'Error'
            : statusText === 'ready'
              ? 'Ready'
              : 'Idle';

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
            // A recorder error while "recording" means the start FAILED (no
            // mic / permission denied) — nothing is actually capturing, so
            // dismissing must also return the button to idle.
            const startFailed = !!recorder.error && voiceState === 'recording';
            setDismissedError(rawErrorText);
            setSearchError(null);
            recorder.clearError();
            transcriber.reset();
            if (voiceState === 'error' || startFailed) setVoiceState('idle');
          }}
        />
      )}

      {/* ── record → transcribe ── */}
      <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <h2 className="text-sm font-medium">Record a note</h2>
        <div className="flex flex-wrap items-center gap-4">
          <span>
            <VoiceButton
              state={buttonState}
              onStart={() => void startRecording()}
              onStop={() => void stopAndTranscribe()}
              volume={micVolume}
            />
          </span>
          <button
            type="button"
            onClick={() => void stopAndTranscribe()}
            disabled={buttonState !== 'recording'}
            className="inline-flex h-8 items-center rounded-md border border-border px-3 text-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
          >
            Stop &amp; transcribe
          </button>
          <WaveformActivityBars
            active={buttonState === 'recording'}
            volume={micVolume}
            height={28}
            barCount={9}
          />
          <span>
            <MicSelector value={micDeviceId} onValueChange={setMicDeviceId} />
          </span>
        </div>

        {latestText && (
          <div
            role="region"
            aria-label="Latest transcript"
            className="min-h-6 rounded-md bg-muted/50 p-2 text-sm whitespace-pre-wrap"
          >
            {latestText}
          </div>
        )}

        {buttonState === 'processing' && (
          <div className="flex items-center gap-2">
            <TranscribedNoteCard transcribing className="flex-1" />
            <button
              type="button"
              onClick={() => {
                transcriber.cancel();
                setVoiceState('idle');
              }}
              className="inline-flex h-8 items-center rounded-md border border-border px-3 text-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              Cancel
            </button>
          </div>
        )}
      </section>

      {/* ── upload path ── */}
      <section aria-label="Or upload audio" className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <h2 className="text-sm font-medium">Or upload audio</h2>
        <div>
          <FileDropzone
            onUpload={(files) => {
              const file = files[0];
              if (file) void transcribeToNote(file);
            }}
            accept={ACCEPTED_AUDIO_MIME_TYPES}
            multiple={false}
            disabled={buttonState === 'processing' || buttonState === 'recording'}
            processing={buttonState === 'processing'}
            processingLabel="Transcribing…"
            label="Drop an audio file or click to browse"
            hint=".wav, .mp3, .webm, .m4a, .ogg, .mp4"
          />
        </div>
      </section>

      {/* ── synced word-by-word replay of the latest timestamped note ── */}
      {supportsTimestamps ? (
        latestTimestamped && (
          <section
            aria-label="Synced transcript"
            className="flex flex-col gap-2 rounded-lg border border-border p-4"
          >
            <p className="text-xs text-muted-foreground">
              Synced transcript - real Whisper SEGMENT timestamps (each highlighted span is one
              segment, not a single word). Click a span to seek.
            </p>
            <SyncedTranscriptViewer words={latestTimestamped.words} audio={latestTimestamped.audio} />
          </section>
        )
      ) : (
        <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
          Synced replay is disabled - segment timestamps are only validated on Whisper Tiny EN.
          Plain transcripts still work with the selected Moonshine model.
        </p>
      )}

      {/* ── semantic search over saved notes ── */}
      <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <h2 className="text-sm font-medium">Search notes</h2>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void runSearch();
            }}
            placeholder={notes.length === 0 ? 'Save a note first…' : 'Semantic search…'}
            disabled={notes.length === 0}
            aria-label="Search notes"
            className="h-8 min-w-56 flex-1 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => void runSearch()}
            disabled={!searchQuery.trim() || searching || notes.length === 0}
            className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
          >
            {searching ? 'Searching…' : 'Search'}
          </button>
        </div>
        {embedLoad.status === 'loading' && (
          <ModelLoadingPanel
            name="BGE Small EN v1.5"
            size={EMBEDDING_MODEL_SIZE}
            category="Embedding"
            progress={embedLoad.progressValue}
            cached={embedLoad.cached === true}
          />
        )}
        {searchResults && (
          <div
            data-count={searchResults.length}
            data-top-label={searchResults[0]?.label ?? ''}
            role="region"
            aria-label="Note search results"
          >
            <ScoredResultBarList
              results={searchResults}
              isLoading={searching}
              emptyState="No matching notes"
            />
          </div>
        )}
      </section>

      {/* ── note list ── */}
      <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Saved notes</h2>
          <span className="text-xs tabular-nums text-muted-foreground">
            {notes.length} note{notes.length === 1 ? '' : 's'}
          </span>
        </div>
        {notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No notes yet - record or upload audio to create your first note.
          </p>
        ) : (
          <ul aria-label="Saved notes" className="flex flex-col gap-2">
            {notes.map((note) => (
              <li
                key={note.id}
                data-note-id={note.id}
                className="group/note flex flex-col gap-1"
              >
                <TranscribedNoteCard
                  text={note.text}
                  timestamp={note.timestamp}
                  audio={note.audio}
                  onDelete={() => onDeleteNote(note.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
