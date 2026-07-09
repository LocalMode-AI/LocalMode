'use client';

/**
 * @file sentiment-analyzer.tsx
 * @description Sentiment Analyzer block — DistilBERT SST-2 sentiment for one or many texts (one per line, or a .txt/.csv first column) with streaming results, determinate throughput, aggregate stats, and a 100-row windowed list; model download gated behind Run.
 */
import { useEffect, useRef, useState } from 'react';
import { FileUp, Play, Sparkles, Square, Trash2 } from 'lucide-react';
import {
  useModelLoad,
  useSequentialBatch,
  toAppError,
  type UseModelLoadReturn,
} from '@localmode/react';
import { classify, type ClassificationModel } from '@localmode/core';
import { transformers, isModelCached } from '@localmode/transformers';

import { ConfidenceScoreBadge } from '@/components/confidence-score-badge';
import { EntityStatsBar } from '@/components/entity-stats-bar';
import { ModelLoadingPanel } from '@/components/model-loading-panel';
import { CacheBadge } from '@/components/cache-badge';
import { ErrorAlert } from '@/components/error-alert';
import { ModeErrorBoundary } from '@/components/mode-error-boundary';
import { cn } from '@/lib/utils';

/** DistilBERT SST-2 binary sentiment classifier. */
const SENTIMENT_MODEL_ID = 'Xenova/distilbert-base-uncased-finetuned-sst-2-english';
const SENTIMENT_MODEL_NAME = 'DistilBERT Sentiment';
const SENTIMENT_MODEL_SIZE = '67 MB';

/** Sample reviews loaded from the empty state (one per line). */
const SAMPLE_REVIEWS = [
  'This product is amazing! Best purchase I ever made.',
  'Terrible experience. The item broke after one day.',
  'Pretty average product, nothing special about it.',
  'I love how easy this is to use. Highly recommend!',
  'Waste of money. Customer support was unhelpful too.',
  'Great quality and fast shipping. Will buy again.',
];

/** Above this many rows the result list renders a window (DOM stays small). */
const WINDOW_CAP = 100;

/** Format a 0–1 score as a percentage string (0.833 → "83.3%"). */
function formatScore(score: number) {
  return `${(score * 100).toFixed(1)}%`;
}

/** Format milliseconds to human-readable duration (4200 → "4.2s"). */
function formatDuration(ms: number) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Parse raw text into analysis items: one item per line, blank lines dropped.
 * With `csv: true` (a `.csv` upload) each row is reduced to its first
 * comma-separated column; plain textarea/`.txt` input is never comma-split.
 */
function parseItems(raw: string, options?: { csv?: boolean }): string[] {
  return raw
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return '';
      return options?.csv && trimmed.includes(',') ? trimmed.split(',')[0].trim() : trimmed;
    })
    .filter((line) => line.length > 0);
}

/** A single sentiment result paired with its source text. */
interface SentimentItem {
  text: string;
  label: string;
  score: number;
  status: 'ok' | 'error';
}

/** Sentiment badge (label + tinted pill). */
function SentimentLabel({ label }: { label: string }) {
  const positive = label.toUpperCase() === 'POSITIVE';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        positive
          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
          : 'bg-rose-500/15 text-rose-700 dark:text-rose-400',
      )}
    >
      {label}
    </span>
  );
}

export function SentimentAnalyzerBlock() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
      <p className="text-xs text-muted-foreground">
        Sentiment Analyzer: DistilBERT SST-2. Model loads only behind an explicit action.
      </p>
      <ModeErrorBoundary>
        <AnalyzeInner />
      </ModeErrorBoundary>
    </div>
  );
}

function AnalyzeInner() {
  // DistilBERT SST-2 singleton + real download-progress source. `load()` is
  // called on Run (gated); the create-bound onProgress streams into `.progress`.
  const load = useModelLoad<ClassificationModel>({
    key: `text-insights-sentiment:${SENTIMENT_MODEL_ID}`,
    create: (onProgress) =>
      transformers.classifier(SENTIMENT_MODEL_ID, {
        onProgress: (p) => onProgress(p as Parameters<typeof onProgress>[0]),
      }),
    warmup: (model) => classify({ model, text: 'ready' }),
    isCached: () => isModelCached(SENTIMENT_MODEL_ID),
  });

  const model = load.model;
  if (!model) return <p className="text-sm text-muted-foreground">Preparing…</p>;
  return <AnalyzeSurface load={load} model={model} />;
}

function AnalyzeSurface({
  load,
  model,
}: {
  load: UseModelLoadReturn<ClassificationModel>;
  model: ClassificationModel;
}) {
  const [input, setInput] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  // CSV first-column extraction applies ONLY to .csv uploads; typing/pasting
  // into the textarea (or loading samples) keeps full lines intact.
  const [isCsv, setIsCsv] = useState(false);
  // Items captured at run start, index-aligned with the batch results.
  const [runItems, setRunItems] = useState<string[]>([]);
  // Throughput clock: ticks while a run is in flight.
  const [elapsedMs, setElapsedMs] = useState(0);
  const startRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const batch = useSequentialBatch<string, { label: string; score: number }>({
    fn: async (text, signal) => {
      const r = await classify({ model, text, abortSignal: signal });
      return { label: r.label, score: r.score };
    },
  });

  // Live elapsed clock during a run (throughput inputs).
  useEffect(() => {
    if (!batch.isRunning) return;
    const id = window.setInterval(() => setElapsedMs(Date.now() - startRef.current), 200);
    return () => window.clearInterval(id);
  }, [batch.isRunning]);

  const items = parseItems(input, { csv: isCsv });
  const lineCount = items.length;
  const charCount = input.length;
  const appErr = toAppError(batch.error) ?? (load.error ? toAppError(load.error) : null);

  // Completed results (index-aligned with runItems), for streaming display.
  const results: SentimentItem[] = [];
  for (let i = 0; i < batch.results.length; i++) {
    const r = batch.results[i];
    const text = runItems[i] ?? '';
    if (r !== null) {
      results.push({ text, label: r.label, score: r.score, status: 'ok' });
    } else if (batch.itemErrors[i]) {
      results.push({ text, label: 'ERROR', score: 0, status: 'error' });
    }
  }

  // Aggregate stats over ALL completed OK items (never the rendered window).
  const ok = results.filter((r) => r.status === 'ok');
  const positive = ok.filter((r) => r.label.toUpperCase() === 'POSITIVE').length;
  const negative = ok.filter((r) => r.label.toUpperCase() === 'NEGATIVE').length;
  const total = ok.length;
  const avgScore = total > 0 ? ok.reduce((s, r) => s + r.score, 0) / total : 0;

  // Throughput derivations.
  const done = batch.progress.current;
  const totalItems = batch.progress.total;
  const elapsedSec = elapsedMs / 1000;
  const rate = elapsedSec > 0 ? done / elapsedSec : 0;
  const etaSec = rate > 0 ? (totalItems - done) / rate : 0;

  const run = async () => {
    if (items.length === 0 || batch.isRunning) return;
    setRunItems(items);
    setElapsedMs(0);
    startRef.current = Date.now();
    try {
      await load.load(); // gated download with visible progress
    } catch {
      return; // load failure surfaces via load.error → appErr
    }
    await batch.execute(items);
    setElapsedMs(Date.now() - startRef.current);
  };

  const loadSample = () => {
    setInput(SAMPLE_REVIEWS.join('\n'));
    setFileName(null);
    setIsCsv(false);
  };

  const clear = () => {
    setInput('');
    setFileName(null);
    setIsCsv(false);
    setRunItems([]);
    batch.reset();
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    setInput(text);
    setFileName(file.name);
    setIsCsv(/\.csv$/i.test(file.name));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void run();
    }
  };

  const visible = results.length > WINDOW_CAP ? results.slice(0, WINDOW_CAP) : results;
  const windowed = results.length > WINDOW_CAP;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>
          {SENTIMENT_MODEL_NAME} · {SENTIMENT_MODEL_SIZE}
        </span>
        {load.cached === true && (
          <span>
            <CacheBadge cached latencyMs={undefined} label="model cached" />
          </span>
        )}
      </div>

      {/* Input: one item per line, or upload a .txt/.csv. */}
      <div>
        <textarea
          aria-label="Texts to analyze, one per line"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setIsCsv(false);
          }}
          onKeyDown={onKeyDown}
          placeholder="Enter one text per line: reviews, comments, messages…"
          rows={6}
          className="w-full resize-y rounded-md border border-border bg-background p-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {lineCount} {lineCount === 1 ? 'line' : 'lines'} · {charCount} chars
            {fileName && <span className="ml-1">· {fileName}</span>}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={loadSample}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Sparkles className="h-3 w-3" aria-hidden /> Load samples
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <FileUp className="h-3 w-3" aria-hidden /> Upload
            </button>
            <input
              ref={fileInputRef}
              type="file"
              aria-label="Upload a .txt or .csv file"
              accept=".txt,.csv,text/plain,text/csv"
              className="hidden"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
          </div>
        </div>
      </div>

      {/* Actions. */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void run()}
          disabled={items.length === 0 || batch.isRunning}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <Play className="h-3.5 w-3.5" aria-hidden /> Analyze
        </button>
        {batch.isRunning && (
          <button
            type="button"
            onClick={batch.cancel}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Square className="h-3.5 w-3.5" aria-hidden /> Stop
          </button>
        )}
        {results.length > 0 && !batch.isRunning && (
          <button
            type="button"
            onClick={clear}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden /> Clear
          </button>
        )}
      </div>

      {/* Model download gate. */}
      {load.status === 'loading' && (
        <div>
          <ModelLoadingPanel
            name={SENTIMENT_MODEL_NAME}
            size={SENTIMENT_MODEL_SIZE}
            progress={load.progressValue}
            cached={load.cached === true}
          />
        </div>
      )}

      {appErr && (
        <span>
          <ErrorAlert message={appErr.message} onRetry={() => void run()} onDismiss={batch.reset} />
        </span>
      )}

      {/* Progress + throughput — live during a run, and the final summary stays
          visible after completion (items/sec + total elapsed). */}
      {(batch.isRunning || totalItems > 0) && (
        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          <div className="flex items-center justify-between text-xs">
            <span
              data-current={done}
              data-total={totalItems}
              data-running={batch.isRunning}
            >
              {done} / {totalItems} analyzed
            </span>
            <span
              role="status"
              aria-label="Throughput"
              data-rate={rate.toFixed(2)}
              data-elapsed={elapsedMs}
              data-eta={etaSec.toFixed(1)}
              className="font-mono text-muted-foreground"
            >
              {rate.toFixed(1)}/s · {formatDuration(elapsedMs)}
              {batch.isRunning && ` · ETA ${etaSec.toFixed(0)}s`}
            </span>
          </div>
          {batch.isRunning && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${totalItems > 0 ? (done / totalItems) * 100 : 0}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Aggregate stats over all completed items. */}
      {total > 0 && (
        <div
          data-positive={positive}
          data-negative={negative}
          data-total={total}
          data-avg={avgScore.toFixed(4)}
          className="flex flex-col gap-2 rounded-md border border-border p-3"
        >
          <EntityStatsBar
            counts={{ POSITIVE: positive, NEGATIVE: negative }}
            itemNoun="result"
            registry={{
              POSITIVE: { label: 'Positive', color: 'var(--color-emerald-500, #10b981)' },
              NEGATIVE: { label: 'Negative', color: 'var(--color-rose-500, #f43f5e)' },
            }}
          />
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>Positive: {total > 0 ? formatScore(positive / total) : '0%'}</span>
            <span>Negative: {total > 0 ? formatScore(negative / total) : '0%'}</span>
            <span>Total analyzed: {total}</span>
            <span>Avg confidence: {formatScore(avgScore)}</span>
          </div>
        </div>
      )}

      {/* Results list (windowed above the cutoff). */}
      {results.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {windowed && (
            <p className="text-xs text-muted-foreground">
              Showing first {WINDOW_CAP} of {results.length} results (stats cover all).
            </p>
          )}
          <div role="list" aria-label="Sentiment results" className="flex flex-col gap-1.5">
          {visible.map((r, i) => (
            <div
              key={i}
              role="listitem"
              data-label={r.label}
              data-score={r.score.toFixed(4)}
              data-status={r.status}
              className={cn(
                'flex items-center gap-3 rounded-md border p-2 text-sm',
                r.status === 'error' ? 'border-destructive/40 bg-destructive/5' : 'border-border',
              )}
            >
              <span className="min-w-0 flex-1 truncate" title={r.text}>
                {r.text}
              </span>
              <SentimentLabel label={r.label} />
              {r.status === 'ok' && <ConfidenceScoreBadge score={r.score} />}
            </div>
          ))}
          </div>
        </div>
      )}
    </div>
  );
}
