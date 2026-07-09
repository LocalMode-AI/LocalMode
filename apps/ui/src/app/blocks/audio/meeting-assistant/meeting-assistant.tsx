'use client';

/**
 * @file meeting-assistant.tsx
 * @description Meeting Assistant — audio upload OR pasted transcript → Transcribe → Summarize (DistilBART) → Extract action items (Granite 4.0 350M) with a three-step indicator, cancel-preserves-completed-steps, priority/toggle/progress, and a dated .txt export; owns its STT selector + adapter-backed device probe.
 */

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import {
  downloadBlob,
  useGenerateObject,
  useModelLoad,
  useSummarize,
  useTranscribe,
  type UseModelLoadReturn,
} from '@localmode/react';
import { summarize, transcribe, isWebGPUSupported } from '@localmode/core';
import type {
  LanguageModel,
  ObjectSchema,
  SpeechToTextModel,
  SummarizationModel,
} from '@localmode/core';
import { transformers, isModelCached } from '@localmode/transformers';

import { FileDropzone } from '@/components/file-dropzone';
import { AudioScrubPlayer } from '@/components/audio-scrub-player';
import { ModelSelector } from '@/components/model-selector';
import { ModelLoadingPanel } from '@/components/model-loading-panel';
import { ErrorAlert } from '@/components/error-alert';
import { cn } from '@/lib/utils';

/* ═══════════════════════ inlined meeting slice (from audio-studio/models.ts) ═══════════════════════ */

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

/** The block's STT choices (voice-notes / meeting-assistant parity). */
const STT_MODELS: readonly SttModelEntry[] = [
  { id: 'Xenova/whisper-tiny.en', name: 'Whisper Tiny EN', size: '~40MB', timestamps: true },
  { id: 'onnx-community/moonshine-tiny-ONNX', name: 'Moonshine Tiny', size: '~50MB', timestamps: false },
  { id: 'onnx-community/moonshine-base-ONNX', name: 'Moonshine Base', size: '~237MB', timestamps: false },
];

// Whisper Tiny EN stays the STT default (parity / segment-timestamp reasons) —
// the in-surface Moonshine-Base recommendation hint stays; the default is NOT
// changed to Moonshine.
/** Default STT model — the only timestamps-validated one. */
const DEFAULT_STT_MODEL_ID = STT_MODELS[0].id;

/** True when the given STT model has validated segment-timestamp support. */
function sttSupportsTimestamps(modelId: string): boolean {
  return STT_MODELS.find((m) => m.id === modelId)?.timestamps ?? false;
}

/** Meeting summarization model (meeting-assistant parity). */
const SUMMARIZER_MODEL_ID = 'Xenova/distilbart-cnn-6-6';
const SUMMARIZER_MODEL_SIZE = '~200MB';

/** Meeting summary length bounds (meeting-assistant parity). */
const SUMMARY_MAX_LENGTH = 200;
const SUMMARY_MIN_LENGTH = 60;

/**
 * Smallest generateObject-capable transformers ONNX LM — powers meeting
 * action-item extraction (same id the chat block ships as its transformers
 * default).
 */
const PLANNER_MODEL_ID = 'onnx-community/granite-4.0-350m-ONNX-web';
const PLANNER_MODEL_SIZE = '~120MB';

/** Fallback text when transcription finds no speech (voice-notes parity). */
const NO_SPEECH_TEXT = '[No speech detected]';

/** Audio MIME types accepted by the Meeting upload surface. */
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

/** One extracted meeting action item (pre-UI shape). */
interface ExtractedActionItem {
  /** The task / commitment text. */
  text: string;
  /** Extraction-assigned priority. */
  priority: 'high' | 'medium' | 'low';
}

const PRIORITIES = new Set(['high', 'medium', 'low']);

/**
 * Hand-written `ObjectSchema` for `generateObject()` action-item extraction —
 * no Zod dependency needed. `parse` throws on structural mismatch (which
 * triggers generateObject's validate-and-retry loop) and coerces sloppy
 * priorities from the small LM to `'medium'`.
 */
const ACTION_ITEMS_SCHEMA: ObjectSchema<{ items: ExtractedActionItem[] }> = {
  description: 'Action items extracted from a meeting transcript',
  jsonSchema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'The task or commitment' },
            priority: { type: 'string', enum: ['high', 'medium', 'low'] },
          },
          required: ['text', 'priority'],
        },
      },
    },
    required: ['items'],
  },
  parse: (value: unknown) => {
    if (typeof value !== 'object' || value === null || !Array.isArray((value as { items?: unknown }).items)) {
      throw new Error('Expected an object with an "items" array');
    }
    const items: ExtractedActionItem[] = [];
    for (const raw of (value as { items: unknown[] }).items) {
      if (typeof raw !== 'object' || raw === null) continue;
      const text = (raw as { text?: unknown }).text;
      if (typeof text !== 'string' || text.trim().length === 0) continue;
      const rawPriority = String((raw as { priority?: unknown }).priority ?? '').toLowerCase();
      items.push({
        text: text.trim(),
        priority: (PRIORITIES.has(rawPriority) ? rawPriority : 'medium') as ExtractedActionItem['priority'],
      });
    }
    return { items: items.slice(0, 12) };
  },
};

/** The extraction prompt handed to `useGenerateObject.execute()`. */
function buildActionItemsPrompt(transcript: string): string {
  return [
    'Extract the action items from this meeting transcript. An action item is a specific task, commitment, or follow-up that someone agreed to do.',
    'For each item provide the task text and a priority: "high" for urgent or deadline-bound items, "medium" for important items, "low" for nice-to-haves.',
    'Return at most 8 items. If there are none, return an empty items list.',
    '',
    'Transcript:',
    '"""',
    transcript,
    '"""',
  ].join('\n');
}

/** One meeting action item (UI shape — extraction result + completion). */
interface MeetingActionItem extends ExtractedActionItem {
  /** Stable id for toggling. */
  id: string;
  /** Whether the user checked this item off. */
  completed: boolean;
}

/** Completed (or partially completed) meeting-pipeline results. */
interface MeetingData {
  /** Where the transcript came from (file name or 'Pasted transcript'). */
  sourceLabel: string;
  /** Uploaded meeting audio for inline playback (null on the paste path). */
  audio: Blob | null;
  /** Transcript text (or `NO_SPEECH_TEXT`). */
  transcript: string;
  /** Summary, once the Summarize step completed. */
  summary: string | null;
  /** Extracted action items, once the Extract step completed. */
  actionItems: MeetingActionItem[] | null;
  /** True when the audio contained no detectable speech. */
  noSpeech: boolean;
}

/** Count whitespace-separated words in a text. */
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Build the structured `.txt` export (meeting-assistant parity format). */
function buildMeetingExport(
  transcript: string,
  summary: string | null,
  actionItems: Array<{ text: string; completed: boolean; priority: string }>,
): string {
  const lines: string[] = ['MEETING TRANSCRIPT', '==================', '', transcript];

  if (summary) {
    lines.push('', 'SUMMARY', '-------', summary);
  }

  if (actionItems.length > 0) {
    lines.push('', 'ACTION ITEMS', '------------');
    actionItems.forEach((item, i) => {
      const status = item.completed ? '[x]' : '[ ]';
      lines.push(`${status} ${i + 1}. ${item.text} (${item.priority})`);
    });
  }

  return lines.join('\n');
}

/** Dated export filename, e.g. `meeting-transcript-2026-07-03.txt`. */
function meetingExportFilename(now = new Date()): string {
  return `meeting-transcript-${now.toISOString().slice(0, 10)}.txt`;
}

/* ═══════════════════════════════ block ═══════════════════════════════ */

type MeetingStep = 'transcribe' | 'summarize' | 'extract';
type StepState = 'pending' | 'active' | 'done' | 'skipped';

const STEPS: ReadonlyArray<{ id: MeetingStep; label: string }> = [
  { id: 'transcribe', label: 'Transcribe' },
  { id: 'summarize', label: 'Summarize' },
  { id: 'extract', label: 'Extract' },
];

const PRIORITY_BADGE: Record<ExtractedActionItem['priority'], string> = {
  high: 'bg-destructive/10 text-destructive ring-1 ring-inset ring-destructive/20',
  medium: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-1 ring-inset ring-amber-500/20',
  low: 'bg-muted text-muted-foreground ring-1 ring-inset ring-border',
};

/**
 * Outer component: owns everything that must SURVIVE an STT model switch — the
 * meeting results and the STT model id. The inner session is remounted (React
 * `key`) per STT model so the model instance, its `useModelLoad` lifecycle, and
 * every STT-bound hook stay coherent (audio-studio SessionHost pattern).
 */
export function MeetingAssistantBlock() {
  const [sttModelId, setSttModelId] = useState(DEFAULT_STT_MODEL_ID);
  const [meeting, setMeeting] = useState<MeetingData | null>(null);

  // Resolve the transformers inference device ONCE with an adapter-backed probe.
  // The transformers LanguageModel auto-detects `navigator.gpu` PRESENCE only
  // and would pick webgpu in adapterless browsers (headless CI, some
  // Firefox/Linux configs), then fail the load outright — so the Granite planner
  // (action-item extraction) gets an explicit device. This probe downloads no
  // model bytes (page-load invariant).
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
        <MeetingSession
          key={sttModelId}
          sttModelId={sttModelId}
          onSttModelIdChange={setSttModelId}
          device={device}
          meeting={meeting}
          onMeetingChange={setMeeting}
        />
      ) : (
        <p className="p-4 text-sm text-muted-foreground">Preparing…</p>
      )}
    </div>
  );
}

interface MeetingSessionProps {
  sttModelId: string;
  onSttModelIdChange: (id: string) => void;
  /** Resolved transformers inference device for the Granite action-item LM. */
  device: 'webgpu' | 'wasm';
  meeting: MeetingData | null;
  onMeetingChange: Dispatch<SetStateAction<MeetingData | null>>;
}

/**
 * Inner host, remounted per STT model id: owns THE `useModelLoad` for the
 * selected STT model (real-inference warmup on a 1 s silent buffer) + renders
 * the shared STT selector, then hands the shared model + load lifecycle to the
 * meeting pipeline once the model instance exists. The model instance is
 * created in a client mount effect — null for exactly one tick.
 */
function MeetingSession({
  sttModelId,
  onSttModelIdChange,
  device,
  meeting,
  onMeetingChange,
}: MeetingSessionProps) {
  // ── STT model load lifecycle (explicit-action gated) ──
  const stt = useModelLoad<SpeechToTextModel>({
    key: `meeting-assistant-stt:${sttModelId}`,
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

  return (
    <div className="flex flex-col gap-4">
      {/* ── shared STT model choice ── */}
      <section className="flex flex-col gap-2">
        <div data-model-id={sttModelId}>
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Speech-to-text model - downloads only when you transcribe a meeting or press its download
            action.
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

      {/* ── meeting pipeline (gated on the STT instance existing) ── */}
      {stt.model ? (
        <MeetingPipeline
          stt={stt as UseModelLoadReturn<SpeechToTextModel>}
          sttModel={stt.model}
          sttModelId={sttModelId}
          device={device}
          meeting={meeting}
          onMeetingChange={onMeetingChange}
        />
      ) : (
        <p className="p-4 text-sm text-muted-foreground">Preparing…</p>
      )}
    </div>
  );
}

interface MeetingPipelineProps {
  /** Shared STT load lifecycle. */
  stt: UseModelLoadReturn<SpeechToTextModel>;
  /** The shared STT model instance. */
  sttModel: SpeechToTextModel;
  /** The selected STT model id (for the Moonshine Base recommendation hint). */
  sttModelId: string;
  /** Resolved transformers inference device for the Granite action-item LM. */
  device: 'webgpu' | 'wasm';
  /** Completed / partial meeting results. */
  meeting: MeetingData | null;
  /** Update the meeting results. */
  onMeetingChange: Dispatch<SetStateAction<MeetingData | null>>;
}

/**
 * Gates the summarizer (DistilBART) + planner (Granite) model instances — each
 * downloads only when its pipeline step runs — then renders the meeting surface
 * once both instances exist (creation downloads nothing; the instances exist
 * after the first client tick).
 */
function MeetingPipeline({
  stt,
  sttModel,
  sttModelId,
  device,
  meeting,
  onMeetingChange,
}: MeetingPipelineProps) {
  const transcriber = useTranscribe({ model: sttModel });
  const summarizerLoad = useModelLoad<SummarizationModel>({
    key: `meeting-assistant-summarizer:${SUMMARIZER_MODEL_ID}`,
    create: (onProgress) =>
      transformers.summarizer(SUMMARIZER_MODEL_ID, {
        onProgress: (p) => onProgress(p as Parameters<typeof onProgress>[0]),
      }),
    warmup: (model) =>
      summarize({
        model,
        text: 'The team met to plan the release. The release ships next week after testing completes.',
        maxLength: 20,
        minLength: 5,
      }),
    isCached: () => isModelCached(SUMMARIZER_MODEL_ID),
  });
  const plannerLoad = useModelLoad<LanguageModel>({
    key: `meeting-assistant-planner:${PLANNER_MODEL_ID}`,
    create: (onProgress) =>
      transformers.languageModel(PLANNER_MODEL_ID, {
        device,
        onProgress: (p) => onProgress(p as Parameters<typeof onProgress>[0]),
      }),
    isCached: () => isModelCached(PLANNER_MODEL_ID),
  });

  // The hooks below need non-null models; instances exist after the first
  // client tick (creation downloads nothing) — gate on that tick.
  const summarizerModel = summarizerLoad.model;
  const plannerModel = plannerLoad.model;
  if (!summarizerModel || !plannerModel) {
    return <p className="p-4 text-sm text-muted-foreground">Preparing…</p>;
  }
  return (
    <MeetingSurface
      stt={stt}
      transcriber={transcriber}
      summarizerLoad={summarizerLoad}
      summarizerModel={summarizerModel}
      plannerLoad={plannerLoad}
      plannerModel={plannerModel}
      sttModelId={sttModelId}
      meeting={meeting}
      onMeetingChange={onMeetingChange}
    />
  );
}

interface MeetingSurfaceProps {
  stt: UseModelLoadReturn<SpeechToTextModel>;
  transcriber: ReturnType<typeof useTranscribe>;
  summarizerLoad: UseModelLoadReturn<SummarizationModel>;
  summarizerModel: SummarizationModel;
  plannerLoad: UseModelLoadReturn<LanguageModel>;
  plannerModel: LanguageModel;
  sttModelId: string;
  meeting: MeetingData | null;
  onMeetingChange: Dispatch<SetStateAction<MeetingData | null>>;
}

/** The Meeting surface: upload/paste → pipeline → transcript/summary/actions. */
function MeetingSurface({
  stt,
  transcriber,
  summarizerLoad,
  summarizerModel,
  plannerLoad,
  plannerModel,
  sttModelId,
  meeting,
  onMeetingChange,
}: MeetingSurfaceProps) {
  const summarizer = useSummarize({ model: summarizerModel });
  const extractor = useGenerateObject({
    model: plannerModel,
    schema: ACTION_ITEMS_SCHEMA,
    temperature: 0,
    maxTokens: 512,
  });

  const [pastedText, setPastedText] = useState('');
  const [activeStep, setActiveStep] = useState<MeetingStep | null>(null);
  const [doneSteps, setDoneSteps] = useState<ReadonlySet<MeetingStep>>(new Set());
  const [transcribeSkipped, setTranscribeSkipped] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [dismissedError, setDismissedError] = useState<string | null>(null);

  /** Bumped by cancel/reset so a stale pipeline run stops writing state. */
  const runIdRef = useRef(0);

  const running = activeStep !== null;

  const markDone = (step: MeetingStep) =>
    setDoneSteps((prev) => {
      const next = new Set(prev);
      next.add(step);
      return next;
    });

  /**
   * Run the pipeline. `source` is either uploaded audio or a pasted
   * transcript (which skips Transcribe). Each hook's `execute` returns null
   * on cancel — the run stops there, preserving completed steps.
   */
  const runPipeline = async (source: { file?: File; text?: string }) => {
    const runId = ++runIdRef.current;
    const cancelled = () => runIdRef.current !== runId;

    setActionError(null);
    setDismissedError(null);
    setDoneSteps(new Set());
    setTranscribeSkipped(!!source.text);
    transcriber.reset();
    summarizer.reset();
    extractor.reset();

    const base: MeetingData = {
      sourceLabel: source.file ? source.file.name : 'Pasted transcript',
      audio: source.file ?? null,
      transcript: '',
      summary: null,
      actionItems: null,
      noSpeech: false,
    };
    onMeetingChange(base);

    try {
      // ── step 1: transcribe (audio path only) ──
      let transcript = source.text?.trim() ?? '';
      if (source.file) {
        setActiveStep('transcribe');
        await stt.load();
        if (cancelled()) return;
        const result = await transcriber.execute(source.file);
        if (!result || cancelled()) return; // cancelled or errored (hook surfaces it)
        transcript = result.text.trim();
        if (!transcript) {
          // No speech: surface the fallback and skip the remaining steps.
          onMeetingChange({ ...base, transcript: NO_SPEECH_TEXT, noSpeech: true });
          markDone('transcribe');
          return;
        }
        markDone('transcribe');
      }
      onMeetingChange((prev) => (prev ? { ...prev, transcript } : prev));

      // ── step 2: summarize ──
      setActiveStep('summarize');
      await summarizerLoad.load();
      if (cancelled()) return;
      const summaryResult = await summarizer.execute({
        text: transcript,
        maxLength: SUMMARY_MAX_LENGTH,
        minLength: SUMMARY_MIN_LENGTH,
      });
      if (!summaryResult || cancelled()) return;
      onMeetingChange((prev) => (prev ? { ...prev, summary: summaryResult.summary } : prev));
      markDone('summarize');

      // ── step 3: extract action items (structured generation) ──
      setActiveStep('extract');
      await plannerLoad.load();
      if (cancelled()) return;
      const extraction = await extractor.execute(buildActionItemsPrompt(transcript));
      if (!extraction || cancelled()) return;
      onMeetingChange((prev) =>
        prev
          ? {
              ...prev,
              actionItems: extraction.object.items.map((item) => ({
                ...item,
                id: crypto.randomUUID(),
                completed: false,
              })),
            }
          : prev,
      );
      markDone('extract');
    } catch (err) {
      if (!cancelled()) setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      if (runIdRef.current === runId) setActiveStep(null);
    }
  };

  /** Abort the in-flight step; completed steps stay. */
  const cancelPipeline = () => {
    runIdRef.current++;
    transcriber.cancel();
    summarizer.cancel();
    extractor.cancel();
    setActiveStep(null);
  };

  /** New Meeting: clear everything (the audio object URL is revoked when the
   * AudioScrubPlayer unmounts — it owns the URL via useObjectUrl). */
  const resetMeeting = () => {
    cancelPipeline();
    onMeetingChange(null);
    setPastedText('');
    setDoneSteps(new Set());
    setTranscribeSkipped(false);
    setActionError(null);
  };

  const toggleActionItem = (id: string) => {
    onMeetingChange((prev) =>
      prev && prev.actionItems
        ? {
            ...prev,
            actionItems: prev.actionItems.map((item) =>
              item.id === id ? { ...item, completed: !item.completed } : item,
            ),
          }
        : prev,
    );
  };

  const exportMeeting = () => {
    if (!meeting) return;
    downloadBlob(
      buildMeetingExport(meeting.transcript, meeting.summary, meeting.actionItems ?? []),
      meetingExportFilename(),
    );
  };

  const stepState = (step: MeetingStep): StepState => {
    if (step === 'transcribe' && transcribeSkipped) return 'skipped';
    if (doneSteps.has(step)) return 'done';
    if (activeStep === step) return 'active';
    return 'pending';
  };

  const rawErrorText =
    actionError ??
    transcriber.error?.message ??
    summarizer.error?.message ??
    extractor.error?.message ??
    null;
  const errorText = rawErrorText && rawErrorText !== dismissedError ? rawErrorText : null;

  const statusText = running
    ? activeStep === 'transcribe'
      ? 'transcribing'
      : activeStep === 'summarize'
        ? 'summarizing'
        : 'extracting'
    : errorText
      ? 'error'
      : meeting
        ? 'ready'
        : 'idle';
  const statusLabel =
    statusText === 'transcribing'
      ? 'Transcribing…'
      : statusText === 'summarizing'
        ? 'Summarizing…'
        : statusText === 'extracting'
          ? 'Extracting…'
          : statusText === 'error'
            ? 'Error'
            : statusText === 'ready'
              ? 'Ready'
              : 'Idle';

  const doneCount = meeting?.actionItems?.filter((i) => i.completed).length ?? 0;
  const totalCount = meeting?.actionItems?.length ?? 0;

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

      {/* ── input paths ── */}
      {!meeting && !running && (
        <div className="grid gap-4 sm:grid-cols-2">
          <section aria-label="Upload meeting audio" className="flex flex-col gap-2 rounded-lg border border-border p-4">
            <h2 className="text-sm font-medium">Upload meeting audio</h2>
            <div>
              <FileDropzone
                onUpload={(files) => {
                  const file = files[0];
                  if (file) void runPipeline({ file });
                }}
                accept={ACCEPTED_AUDIO_MIME_TYPES}
                multiple={false}
                label="Drop a recording or click to browse"
                hint=".mp3, .wav, .webm, .m4a, .mp4"
              />
            </div>
            {sttModelId !== 'onnx-community/moonshine-base-ONNX' && (
              <p className="text-xs text-muted-foreground">
                Tip: Moonshine Base (~237MB) gives the best meeting transcription - pick it in the
                speech-to-text selector above.
              </p>
            )}
          </section>
          <section className="flex flex-col gap-2 rounded-lg border border-border p-4">
            <h2 className="text-sm font-medium">Or paste a transcript</h2>
            <textarea
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              rows={6}
              placeholder="Paste a meeting transcript - skips the transcription step."
              aria-label="Meeting transcript"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
            <button
              type="button"
              onClick={() => void runPipeline({ text: pastedText })}
              disabled={!pastedText.trim()}
              className="inline-flex h-8 w-fit items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
            >
              Process transcript
            </button>
          </section>
        </div>
      )}

      {/* ── pipeline indicator ── */}
      {(running || meeting) && (
        <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
          {/* Step track and the action cluster live on their own rows so the
              actions never awkwardly reflow into the middle of the chips at 375. */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <ol aria-label="Meeting pipeline" className="flex flex-wrap items-center gap-2">
              {STEPS.map((step, i) => {
                const state = stepState(step.id);
                return (
                  <li
                    key={step.id}
                    data-step={step.id}
                    data-state={state}
                    aria-label={step.label}
                    className="flex items-center gap-2"
                  >
                    {i > 0 && (
                      <span className="text-muted-foreground" aria-hidden="true">
                        →
                      </span>
                    )}
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium',
                        state === 'done' && 'bg-primary/10 text-primary',
                        state === 'active' && 'bg-primary text-primary-foreground',
                        state === 'pending' && 'bg-muted text-muted-foreground',
                        state === 'skipped' && 'bg-muted text-muted-foreground line-through',
                      )}
                    >
                      {state === 'active' && (
                        <span
                          className="size-3 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground motion-reduce:animate-none"
                          aria-hidden="true"
                        />
                      )}
                      {state === 'done' && <span aria-hidden="true">✓</span>}
                      {step.label}
                    </span>
                  </li>
                );
              })}
            </ol>
            <div className="flex flex-wrap gap-2">
              {running && (
                <button
                  type="button"
                  onClick={cancelPipeline}
                  className="inline-flex h-7 items-center rounded-md border border-border px-2.5 text-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  Cancel
                </button>
              )}
              <button
                type="button"
                onClick={exportMeeting}
                disabled={!meeting || !meeting.transcript}
                className="inline-flex h-7 items-center rounded-md border border-border px-2.5 text-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
              >
                Export .txt
              </button>
              <button
                type="button"
                onClick={resetMeeting}
                className="inline-flex h-7 items-center rounded-md border border-border px-2.5 text-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                New meeting
              </button>
            </div>
          </div>

          {activeStep === 'summarize' && summarizerLoad.status === 'loading' && (
            <ModelLoadingPanel
              name="DistilBART CNN 6-6"
              size={SUMMARIZER_MODEL_SIZE}
              category="Summarization"
              progress={summarizerLoad.progressValue}
              cached={summarizerLoad.cached === true}
            />
          )}
          {activeStep === 'extract' && plannerLoad.status === 'loading' && (
            <ModelLoadingPanel
              name="Granite 4.0 350M"
              size={PLANNER_MODEL_SIZE}
              category="Action-item LM"
              progress={plannerLoad.progressValue}
              cached={plannerLoad.cached === true}
            />
          )}
        </section>
      )}

      {/* ── results ── */}
      {meeting && (
        <div className="flex flex-col gap-4">
          {meeting.audio && (
            <section className="flex flex-col gap-2 rounded-lg border border-border p-4">
              <h2 className="text-sm font-medium">{meeting.sourceLabel}</h2>
              <AudioScrubPlayer audio={meeting.audio} />
            </section>
          )}

          <section className="flex flex-col gap-2 rounded-lg border border-border p-4">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-medium">Transcript</h2>
              {meeting.transcript && !meeting.noSpeech && (
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs tabular-nums text-foreground/70">
                  {countWords(meeting.transcript)} words
                </span>
              )}
            </div>
            <p className="whitespace-pre-wrap text-sm">
              {meeting.transcript || (activeStep === 'transcribe' ? 'Transcribing…' : '')}
            </p>
          </section>

          {meeting.summary !== null && (
            <section aria-label="Summary" className="flex flex-col gap-2 rounded-lg border border-border p-4">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-medium">Summary</h2>
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs tabular-nums text-foreground/70">
                  {countWords(meeting.summary)} words
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm">
                {meeting.summary}
              </p>
            </section>
          )}

          {meeting.actionItems !== null && (
            <section className="flex flex-col gap-2 rounded-lg border border-border p-4">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-medium">Action items</h2>
                <span
                  data-done={doneCount}
                  data-total={totalCount}
                  className="rounded-md bg-muted px-1.5 py-0.5 text-xs tabular-nums text-foreground/70"
                >
                  {doneCount}/{totalCount} done
                </span>
              </div>
              {meeting.actionItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">No action items found.</p>
              ) : (
                <ul aria-label="Action items" className="flex flex-col gap-1.5">
                  {meeting.actionItems.map((item) => (
                    <li
                      key={item.id}
                      data-priority={item.priority}
                      className="flex items-start gap-2 rounded-md border border-border bg-card p-2"
                    >
                      {/* 44px touch target via a padded label; negative margin
                          keeps the visual row height compact (a11y finding). */}
                      <label className="-m-1 flex size-11 shrink-0 cursor-pointer items-center justify-center">
                        <input
                          type="checkbox"
                          checked={item.completed}
                          onChange={() => toggleActionItem(item.id)}
                          aria-label={`Mark "${item.text}" ${item.completed ? 'incomplete' : 'complete'}`}
                          className="size-4 accent-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                        />
                      </label>
                      <span
                        className={cn(
                          'mt-1.5 flex-1 text-sm',
                          item.completed && 'text-muted-foreground line-through',
                        )}
                      >
                        {item.text}
                      </span>
                      <span
                        className={cn(
                          'rounded-md px-1.5 py-0.5 text-[11px] font-medium capitalize',
                          PRIORITY_BADGE[item.priority],
                        )}
                      >
                        {item.priority}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
