'use client';

/**
 * @file summarize.tsx
 * @description Summarize block — extractive (on-device sentence extraction) & abstractive (DistilBART) modes with short/medium/long length presets, compression + reading-time-saved stats, copy, and truthful badging (Chrome Summarizer API ⇄ DistilBART fallback).
 */
import { useEffect, useState } from 'react';
import {
  useSummarize,
  useProviderFallback,
  toAppError,
  providerName,
  type ResolvedModel,
} from '@localmode/react';
import type { SummarizationModel } from '@localmode/core';

import { SegmentedModePicker } from '@/components/segmented-mode-picker';
import { TextProcessingPanel } from '@/components/text-processing-panel';
import { ProviderBadge } from '@/components/provider-badge';
import { ChromeAIDownloadGate } from '@/components/chrome-ai-download-gate';
import { CopyButton } from '@/components/copy-button';
import { ErrorAlert } from '@/components/error-alert';
import { cn } from '@/lib/utils';

/* ─────────────────────────────── summarize catalog ──────────────────────────────── */

/** Summary length id. */
type SummaryLength = 'short' | 'medium' | 'long';

/** Length preset: token bounds for the abstractive model + sentence budget for extractive. */
interface LengthPreset {
  label: string;
  /** Min tokens (abstractive model). */
  minLength: number;
  /** Max tokens (abstractive model) AND the Chrome length mapping input. */
  maxLength: number;
  /** Sentence budget for the block-side extractive algorithm. */
  sentences: number;
}

/** Length presets — token bounds carried over verbatim from the text-summarizer showcase. */
const LENGTH_PRESETS: Record<SummaryLength, LengthPreset> = {
  short: { label: 'Short', minLength: 20, maxLength: 50, sentences: 2 },
  medium: { label: 'Medium', minLength: 50, maxLength: 130, sentences: 3 },
  long: { label: 'Long', minLength: 100, maxLength: 250, sentences: 5 },
};

/** Summarization mode. */
type SummaryMode = 'extractive' | 'abstractive';

/** Chrome Built-in AI summary style (Summarizer API `type`). */
// `tldr` is the value Chrome's SummarizerType enum accepts; `'tl;dr'` throws.
type SummaryStyle = 'tldr' | 'key-points' | 'teaser' | 'headline';

/** Chrome summary styles, offered behind a capability gate. */
const SUMMARY_STYLES: { value: SummaryStyle; label: string }[] = [
  { value: 'tldr', label: 'TL;DR' },
  { value: 'key-points', label: 'Key Points' },
  { value: 'teaser', label: 'Teaser' },
  { value: 'headline', label: 'Headline' },
];

/**
 * Map a summarization mode to the Chrome Summarizer `type`. The transformers
 * path implements extractive block-side (see {@link extractiveSummarize}); on
 * Chrome, extractive is served by the behaviorally-adjacent `key-points` type
 * and abstractive by `tldr` (documented in-UI as an approximation).
 */
function modeToChromeStyle(mode: SummaryMode): SummaryStyle {
  return mode === 'extractive' ? 'key-points' : 'tldr';
}

/** The abstractive summarization model (DistilBART CNN, ~120 MB quantized). */
const SUMMARIZER_MODEL_ID = 'Xenova/distilbart-cnn-6-6';
const SUMMARIZER_MODEL_SIZE = '~120 MB';

/** Reading speed used for the time-saved estimate (words/minute). */
const READING_WPM = 238;

/** Count whitespace-delimited words. */
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Percentage the summary is shorter than the source (0 when source is empty). */
function compressionRatio(original: string, summary: string): number {
  const o = countWords(original);
  if (o === 0) return 0;
  return Math.round((1 - countWords(summary) / o) * 100);
}

/** Human-readable reading-time saved (238 wpm). */
function timeSaved(original: string, summary: string): string {
  const saved = Math.max(0, countWords(original) - countWords(summary));
  const minutes = Math.round(saved / READING_WPM);
  return minutes < 1 ? '< 1 min' : `${minutes} min`;
}

/** Minimal English stopword set for extractive scoring. */
const STOPWORDS = new Set(
  'a an and are as at be but by for from has have he her his i in is it its of on or she that the their them they this to was we were what when where which who will with you your'.split(
    ' ',
  ),
);

/** Split prose into sentences (kept verbatim so extraction draws from the source). */
function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'À-ɏ])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Real on-device extractive summarization: score each source sentence by the
 * summed frequency of its content words, keep the top `sentences`, and emit
 * them in their ORIGINAL order. The result is composed exclusively of
 * sentences drawn verbatim from the source — the honest realization of
 * "extractive mode" on the Transformers.js path (the DistilBART model is
 * purely abstractive and has no extractive capability).
 */
function extractiveSummarize(text: string, sentences: number): string {
  const source = splitSentences(text);
  if (source.length <= sentences) return source.join(' ');

  const freq = new Map<string, number>();
  for (const w of text.toLowerCase().match(/[a-zÀ-ɏ']+/g) ?? []) {
    if (!STOPWORDS.has(w) && w.length > 2) freq.set(w, (freq.get(w) ?? 0) + 1);
  }

  const scored = source.map((sentence, index) => {
    const words = (sentence.toLowerCase().match(/[a-zÀ-ɏ']+/g) ?? []).filter(
      (w) => !STOPWORDS.has(w) && w.length > 2,
    );
    const score = words.reduce((sum, w) => sum + (freq.get(w) ?? 0), 0) / Math.max(1, words.length);
    return { sentence, index, score };
  });

  return [...scored]
    .sort((a, b) => b.score - a.score)
    .slice(0, sentences)
    .sort((a, b) => a.index - b.index)
    .map((s) => s.sentence)
    .join(' ');
}

/** Model id reported for a block-side extractive summary (no model served). */
const EXTRACTIVE_MODEL_ID = 'local:extractive-frequency';

/** Summarize sample (verbatim from the text-summarizer showcase). */
const SUMMARIZE_SAMPLE =
  'Artificial intelligence has transformed the way we interact with technology. Machine learning models can now understand natural language, recognize images, and even generate creative content. These advances have led to practical applications in healthcare, where AI assists in diagnosing diseases; in transportation, where self-driving cars are becoming a reality; and in education, where personalized learning experiences are being created. However, these developments also raise important ethical questions about privacy, bias, and the future of work. As AI continues to evolve, society must carefully consider how to harness its benefits while mitigating potential risks. The key challenge lies in developing AI systems that are not only powerful but also fair, transparent, and accountable.';

/* ──────────────────────────────── component ─────────────────────────────────── */

const MODE_ITEMS: { id: SummaryMode; label: string }[] = [
  { id: 'extractive', label: 'Extractive' },
  { id: 'abstractive', label: 'Abstractive' },
];
const LENGTH_ITEMS: { id: SummaryLength; label: string }[] = (
  Object.keys(LENGTH_PRESETS) as SummaryLength[]
).map((id) => ({ id, label: LENGTH_PRESETS[id].label }));

/** A block-side extractive result (no model served). */
interface LocalSummary {
  summary: string;
  modelId: string;
}

export function SummarizeBlock() {
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<SummaryMode>('abstractive');
  const [length, setLength] = useState<SummaryLength>('medium');
  const [style, setStyle] = useState<SummaryStyle | null>(null);
  const [resolved, setResolved] = useState<ResolvedModel<SummarizationModel> | null>(null);
  const [local, setLocal] = useState<LocalSummary | null>(null);
  // Inject bundler-visible provider loaders (the hook's default Function()-hidden
  // import cannot be resolved as a bare specifier in the browser).
  const {
    resolveSummarizer,
    chromeAvailability,
    refreshChromeAvailability,
    requestChromeDownload,
    chromeDownloadProgress,
    downloadingCapability,
    error: providerError,
  } = useProviderFallback({
    loadChromeAI: () => import('@localmode/chrome-ai'),
    loadTransformers: () => import('@localmode/transformers'),
  });

  const { data, error, isLoading, execute, cancel, reset } = useSummarize({
    model: resolved?.model as SummarizationModel,
  });

  const chromeStyle = style ?? modeToChromeStyle(mode);
  const summarizeAvailability = chromeAvailability.summarize ?? 'unsupported';

  // Probe Chrome's model state. Reading availability() downloads nothing.
  useEffect(() => {
    void refreshChromeAvailability('summarize', { chromeStyle, length });
  }, [chromeStyle, length, refreshChromeAvailability]);

  // Resolve the summarizer for the current style/length (no download until run).
  // Re-runs when Chrome's availability flips, so a completed download promotes
  // this block from the Transformers.js fallback to Chrome AI.
  useEffect(() => {
    let alive = true;
    setResolved(null);
    void resolveSummarizer({
      chromeStyle,
      length,
      fallbackModelId: SUMMARIZER_MODEL_ID,
    }).then((r) => {
      if (alive) setResolved(r);
    });
    return () => {
      alive = false;
    };
  }, [chromeStyle, length, resolveSummarizer, summarizeAvailability]);

  const provider = resolved?.provider ?? null;
  const ready = !!resolved;
  const appErr = toAppError(error);

  // Chrome serves both modes via the model (type mapping). On Transformers.js,
  // abstractive uses the model and extractive uses the on-device algorithm.
  const usesModel = mode === 'abstractive' || provider === 'chrome-ai';

  const summary = local?.summary ?? data?.summary ?? '';
  const modelId = local?.modelId ?? data?.response.modelId ?? resolved?.modelId ?? null;

  const run = () => {
    if (!input.trim() || !ready) return;
    const preset = LENGTH_PRESETS[length];
    if (usesModel) {
      setLocal(null);
      void execute({ text: input, minLength: preset.minLength, maxLength: preset.maxLength });
    } else {
      reset();
      setLocal({
        summary: extractiveSummarize(input, preset.sentences),
        modelId: EXTRACTIVE_MODEL_ID,
      });
    }
  };

  const clearAll = () => {
    cancel();
    reset();
    setLocal(null);
    setInput('');
  };

  const originalWords = countWords(input);
  const summaryWords = countWords(summary);
  const ratio = compressionRatio(input, summary);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
      <p className="text-xs text-muted-foreground">
        Summarize - extractive & abstractive modes. Models load only behind an explicit action.
      </p>

      <div className="flex flex-col gap-3">
        <TextProcessingPanel
          value={input}
          onChange={setInput}
          result={summary}
          isProcessing={isLoading}
          onRun={run}
          onCancel={cancel}
          onClear={clearAll}
          inputLabel="Original"
          resultLabel="Summary"
          placeholder="Paste an article or long passage to summarize…"
          runLabel="Summarize"
          emptyState={<span className="text-sm text-muted-foreground">Your summary will appear here.</span>}
          header={
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span data-provider={provider ?? 'resolving'}>
                  <ProviderBadge
                    providerName={provider ? providerName(provider) : null}
                    tier={resolved?.tier ?? 'download'}
                    modelId={modelId}
                  />
                </span>
                <span
                  data-model-id={modelId ?? ''}
                  className="sr-only"
                >
                  {modelId ?? ''}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  DistilBART · {SUMMARIZER_MODEL_SIZE}
                </span>
              </div>
              <ChromeAIDownloadGate
                availability={summarizeAvailability}
                label="Chrome Summarizer"
                size="~1.5 GB, shared across every site"
                isDownloading={downloadingCapability === 'summarize'}
                progress={chromeDownloadProgress?.progress}
                error={providerError?.message ?? null}
                fallbackLabel="Transformers.js (DistilBART)"
                onDownload={() => {
                  void requestChromeDownload('summarize', { chromeStyle, length });
                }}
              />

              <div className="flex flex-wrap items-center gap-4">
                <div data-mode={mode} className="flex flex-col gap-1">
                  <span className="text-[10px] font-medium uppercase text-muted-foreground">Mode</span>
                  <SegmentedModePicker<SummaryMode>
                    items={MODE_ITEMS}
                    selectedId={mode}
                    onSelect={(m) => {
                      setMode(m);
                      setLocal(null);
                    }}
                    aria-label="Summary mode"
                  />
                </div>
                <div data-length={length} className="flex flex-col gap-1">
                  <span className="text-[10px] font-medium uppercase text-muted-foreground">Length</span>
                  <SegmentedModePicker<SummaryLength>
                    items={LENGTH_ITEMS}
                    selectedId={length}
                    onSelect={setLength}
                    aria-label="Summary length"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setInput(SUMMARIZE_SAMPLE)}
                  className="self-end rounded text-xs text-muted-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Load sample
                </button>
              </div>

              {/* Mode-mapping note (extractive on Transformers.js is on-device
                  sentence extraction; on Chrome it maps to key-points). */}
              <p className="text-[10px] text-muted-foreground">
                {mode === 'extractive'
                  ? provider === 'chrome-ai'
                    ? 'Extractive → Chrome “key-points”.'
                    : 'Extractive → on-device sentence extraction (DistilBART is abstractive-only).'
                  : provider === 'chrome-ai'
                    ? 'Abstractive → Chrome “tldr”.'
                    : 'Abstractive → DistilBART generated summary.'}
              </p>

              {/* Chrome-AI-only summary styles — rendered only when Chrome AI
                  actually serves the tab; otherwise the documented fallback. */}
              {provider === 'chrome-ai' ? (
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-medium uppercase text-muted-foreground">
                    Chrome summary style
                  </span>
                  <SegmentedModePicker<SummaryStyle>
                    items={SUMMARY_STYLES.map((s) => ({ id: s.value, label: s.label }))}
                    selectedId={style ?? modeToChromeStyle(mode)}
                    onSelect={setStyle}
                    aria-label="Chrome summary style"
                  />
                </div>
              ) : (
                <p
                  className="text-[10px] text-muted-foreground"
                >
                  Chrome summary styles (TL;DR / Key Points / Teaser / Headline) appear when Chrome
                  Built-in AI is available; this browser uses the Transformers.js path.
                </p>
              )}
            </div>
          }
        />
      </div>

      {appErr && (
        <span>
          <ErrorAlert message={appErr.message} onRetry={run} onDismiss={reset} />
        </span>
      )}

      {summary && !isLoading && (
        <div className="flex flex-wrap items-center gap-3">
          <div
            data-mode={mode}
            data-compression={ratio}
            data-original-words={originalWords}
            data-summary-words={summaryWords}
            data-time-saved={timeSaved(input, summary)}
            data-summary={summary}
            className="flex flex-1 flex-wrap items-center gap-2 text-xs text-muted-foreground"
          >
            <Stat label="Original" value={`${originalWords} words`} />
            <Stat label="Summary" value={`${summaryWords} words`} />
            <Stat label="Compression" value={`${ratio}% shorter`} />
            <Stat label="Time saved" value={timeSaved(input, summary)} />
          </div>
          <span>
            <CopyButton value={summary} />
          </span>
          <button
            type="button"
            onClick={clearAll}
            className={cn(
              'inline-flex h-7 items-center rounded-md border border-border px-2 text-xs font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            )}
          >
            Reset
          </button>
        </div>
      )}

      {/* Compression bar (parity with the text-summarizer showcase). */}
      {summary && !isLoading && (
        <div className="flex flex-col gap-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${Math.max(0, 100 - ratio)}%` }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground">{Math.max(0, 100 - ratio)}% of original</span>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5">
      <span className="font-medium text-foreground">{value}</span>
      <span>{label}</span>
    </span>
  );
}
