'use client';

/**
 * @file model-evaluator.tsx
 * @description Model Evaluator block — classifier evaluation over labeled datasets: radio model/dataset selectors, `useEvaluateModel` with completed/total progress + cancel, accuracy + macro P/R/F1, run duration, a color-coded confusion matrix, and JSON export. Model download gated behind Run.
 */
import { useState } from 'react';
import { Download, Play, Square, Trash2 } from 'lucide-react';
import { useEvaluateModel, useModelLoad, toAppError } from '@localmode/react';
import {
  classify,
  accuracy,
  precision,
  recall,
  f1Score,
  confusionMatrix,
  type ClassificationModel,
  type ConfusionMatrix,
} from '@localmode/core';
import { transformers, isModelCached } from '@localmode/transformers';

import { EvaluationMetricsDashboard } from '@/components/evaluation-metrics-dashboard';
import { ModelLoadingPanel } from '@/components/model-loading-panel';
import { CacheBadge } from '@/components/cache-badge';
import { ErrorAlert } from '@/components/error-alert';
import { ModeErrorBoundary } from '@/components/mode-error-boundary';
import { cn } from '@/lib/utils';

/** A selectable model option (id + display metadata). */
interface ModelOption {
  id: string;
  name: string;
  description: string;
  size: string;
}

const CLASSIFIER_MODELS: ModelOption[] = [
  {
    id: 'Xenova/distilbert-base-uncased-finetuned-sst-2-english',
    name: 'DistilBERT Sentiment',
    description: 'Fine-tuned for binary sentiment classification (POSITIVE / NEGATIVE)',
    size: '67 MB',
  },
  {
    id: 'Xenova/mobilebert-uncased-mnli',
    name: 'MobileBERT Zero-Shot',
    description: 'Zero-shot classification via natural language inference',
    size: '27 MB',
  },
];

/** A single labeled dataset entry. */
interface DatasetEntry {
  input: string;
  expected: string;
}

/** A built-in labeled dataset for evaluation. */
interface SampleDataset {
  id: string;
  name: string;
  description: string;
  entries: DatasetEntry[];
}

const SAMPLE_DATASETS: SampleDataset[] = [
  {
    id: 'sentiment',
    name: 'Sentiment Analysis',
    description: 'Product reviews labeled as POSITIVE or NEGATIVE',
    entries: [
      { input: 'This product is amazing! Best purchase I ever made.', expected: 'POSITIVE' },
      { input: 'Terrible quality. Broke after one day of use.', expected: 'NEGATIVE' },
      { input: 'I love how easy this is to set up. Highly recommend!', expected: 'POSITIVE' },
      { input: 'Waste of money. Very disappointed with this item.', expected: 'NEGATIVE' },
      { input: 'Great value for the price. Works perfectly.', expected: 'POSITIVE' },
      { input: 'Awful customer service and the product is defective.', expected: 'NEGATIVE' },
      { input: 'Exceeded my expectations. Beautiful design and build.', expected: 'POSITIVE' },
      { input: 'Cheap materials, poor construction. Do not buy.', expected: 'NEGATIVE' },
      { input: 'Fast shipping and excellent packaging. Very happy!', expected: 'POSITIVE' },
      { input: 'The worst purchase I have ever made. Total scam.', expected: 'NEGATIVE' },
      { input: 'Absolutely fantastic! My whole family loves it.', expected: 'POSITIVE' },
      { input: 'Returned immediately. Nothing like the description.', expected: 'NEGATIVE' },
      { input: 'Perfect gift idea. Arrived on time and looks great.', expected: 'POSITIVE' },
      { input: 'Flimsy and cheaply made. Falls apart easily.', expected: 'NEGATIVE' },
      { input: 'Outstanding performance. Best in its class.', expected: 'POSITIVE' },
      { input: 'Overpriced for what you get. Not worth it.', expected: 'NEGATIVE' },
      { input: 'So glad I bought this. Life-changing product!', expected: 'POSITIVE' },
      { input: 'Stopped working after a week. No refund offered.', expected: 'NEGATIVE' },
      { input: 'Sleek design and works as advertised. Five stars.', expected: 'POSITIVE' },
      { input: 'Unbelievably bad. Save your money and avoid this.', expected: 'NEGATIVE' },
      { input: 'My favorite purchase this year. Truly impressed.', expected: 'POSITIVE' },
      { input: 'Misleading product images. Very poor quality.', expected: 'NEGATIVE' },
      { input: 'Incredible sound quality for the price. Love it!', expected: 'POSITIVE' },
      { input: 'Complete garbage. Threw it away after one use.', expected: 'NEGATIVE' },
    ],
  },
  {
    id: 'topic',
    name: 'News Topic Classification',
    description: 'News headlines labeled by category',
    entries: [
      { input: 'Stocks rally as Fed signals rate cuts ahead', expected: 'business' },
      { input: 'Lakers defeat Celtics in overtime thriller', expected: 'sports' },
      { input: 'New AI chip promises 10x faster inference', expected: 'technology' },
      { input: 'Senate passes bipartisan infrastructure bill', expected: 'politics' },
      { input: 'Tesla reports record quarterly earnings', expected: 'business' },
      { input: 'World Cup final draws 1 billion viewers', expected: 'sports' },
      { input: 'Apple unveils next-generation MacBook Pro', expected: 'technology' },
      { input: 'President signs executive order on climate', expected: 'politics' },
      { input: 'Inflation falls to lowest level in two years', expected: 'business' },
      { input: 'Olympic swimmer breaks three world records', expected: 'sports' },
      { input: 'Google launches open-source language model', expected: 'technology' },
      { input: 'Election results spark debate over voting laws', expected: 'politics' },
      { input: 'Amazon acquires streaming platform for $5B', expected: 'business' },
      { input: 'Champions League draw reveals exciting matchups', expected: 'sports' },
      { input: 'Quantum computer solves protein folding puzzle', expected: 'technology' },
      { input: 'Supreme Court rules on digital privacy case', expected: 'politics' },
      { input: 'Startup raises $200M in Series C funding round', expected: 'business' },
      { input: 'Tennis star announces retirement after 20 seasons', expected: 'sports' },
      { input: 'SpaceX successfully lands reusable rocket booster', expected: 'technology' },
      { input: 'Governor proposes sweeping education reform plan', expected: 'politics' },
    ],
  },
];

/** Format a 0–1 score as a percentage string (0.833 → "83.3%"). */
function formatScore(score: number) {
  return `${(score * 100).toFixed(1)}%`;
}

/** Format milliseconds to human-readable duration (4200 → "4.2s"). */
function formatDuration(ms: number) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** A single selectable option with rich metadata. */
interface RichOption {
  id: string;
  name: string;
  description: string;
  /** Optional size / count badge (e.g. "67MB", "24 items"). */
  meta?: string;
}

/** Props for {@link OptionCardList}. */
interface OptionCardListProps {
  /** The options to render as radio cards. */
  options: RichOption[];
  /** Currently selected option id. */
  selectedId: string;
  /** Fired with the chosen option id. */
  onSelect: (id: string) => void;
  /** Accessible group label. */
  label: string;
  /** Disable interaction (e.g. while a run is in progress). */
  disabled?: boolean;
}

/**
 * A radio-style list of option cards (name + description + size/count badge) for
 * the model / dataset / corpus selectors. Fully controlled.
 */
function OptionCardList({
  options,
  selectedId,
  onSelect,
  label,
  disabled,
}: OptionCardListProps) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-2">
      {options.map((option) => {
        const active = option.id === selectedId;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            data-active={active}
            onClick={() => onSelect(option.id)}
            className={cn(
              'flex items-start gap-3 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60',
              active ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted',
            )}
          >
            <span
              className={cn(
                'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                active ? 'border-primary' : 'border-muted-foreground/50',
              )}
              aria-hidden
            >
              {active && <span className="h-2 w-2 rounded-full bg-primary" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-foreground">{option.name}</span>
                {option.meta && (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {option.meta}
                  </span>
                )}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{option.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Full evaluation results after a completed run. */
interface EvalResults {
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  predictions: string[];
  expected: string[];
  matrix: ConfusionMatrix;
  datasetSize: number;
  durationMs: number;
  modelId: string;
  datasetName: string;
}

/** Trigger a JSON download via a temporary anchor. */
function downloadJson(data: object, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const MODEL_OPTIONS: RichOption[] = CLASSIFIER_MODELS.map((m) => ({
  id: m.id,
  name: m.name,
  description: m.description,
  meta: m.size,
}));
const DATASET_OPTIONS: RichOption[] = SAMPLE_DATASETS.map((d) => ({
  id: d.id,
  name: d.name,
  description: d.description,
  meta: `${d.entries.length} items`,
}));

export function ModelEvaluatorBlock() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
      <p className="text-xs text-muted-foreground">
        Model Evaluator: classifier evaluation over labeled datasets. Model loads only behind an
        explicit action.
      </p>
      <ModeErrorBoundary>
        <EvaluateInner />
      </ModeErrorBoundary>
    </div>
  );
}

function EvaluateInner() {
  const [modelId, setModelId] = useState(CLASSIFIER_MODELS[0].id);
  const [datasetId, setDatasetId] = useState(SAMPLE_DATASETS[0].id);
  const [results, setResults] = useState<EvalResults | null>(null);
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null);

  const { isLoading, error, execute, cancel, reset } = useEvaluateModel<string, string>();

  // Per-selected-model download gate — keyed on the selected model id so
  // switching models loads (and shows progress for) the right weights.
  const load = useModelLoad<ClassificationModel>({
    key: `text-insights-eval:${modelId}`,
    create: (onProgress) =>
      transformers.classifier(modelId, {
        onProgress: (p) => onProgress(p as Parameters<typeof onProgress>[0]),
      }),
    warmup: (model) => classify({ model, text: 'ready' }),
    isCached: () => isModelCached(modelId),
  });

  const appErr = toAppError(error) ?? (load.error ? toAppError(load.error) : null);
  const modelMeta = CLASSIFIER_MODELS.find((m) => m.id === modelId);

  const resetResults = () => {
    setResults(null);
    setProgress(null);
    reset();
  };

  const selectModel = (id: string) => {
    setModelId(id);
    resetResults();
  };
  const selectDataset = (id: string) => {
    setDatasetId(id);
    resetResults();
  };

  const run = async () => {
    const dataset = SAMPLE_DATASETS.find((d) => d.id === datasetId);
    if (!dataset || isLoading) return;

    setResults(null);
    setProgress({ completed: 0, total: dataset.entries.length });

    try {
      await load.load();
    } catch {
      setProgress(null);
      return;
    }
    const model = load.model;
    if (!model) {
      setProgress(null);
      return;
    }

    const inputs = dataset.entries.map((e) => e.input);
    const expected = dataset.entries.map((e) => e.expected);

    const evalResult = await execute({
      dataset: { inputs, expected },
      predict: async (text: string, signal: AbortSignal) => {
        const r = await classify({ model, text, abortSignal: signal });
        return r.label;
      },
      metric: accuracy,
      onProgress: (completed: number, total: number) => setProgress({ completed, total }),
    });

    if (evalResult) {
      const preds = evalResult.predictions;
      setResults({
        accuracy: evalResult.score,
        precision: precision(preds, expected),
        recall: recall(preds, expected),
        f1: f1Score(preds, expected),
        predictions: preds,
        expected,
        matrix: confusionMatrix(preds, expected),
        datasetSize: evalResult.datasetSize,
        durationMs: evalResult.durationMs,
        modelId,
        datasetName: dataset.name,
      });
    }
    setProgress(null);
  };

  const exportJson = () => {
    if (!results) return;
    downloadJson(
      {
        modelId: results.modelId,
        datasetName: results.datasetName,
        datasetSize: results.datasetSize,
        durationMs: results.durationMs,
        metrics: {
          accuracy: results.accuracy,
          precision: results.precision,
          recall: results.recall,
          f1: results.f1,
        },
        predictions: results.predictions,
        expected: results.expected,
      },
      'evaluation-results.json',
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Model</p>
          <OptionCardList
            options={MODEL_OPTIONS}
            selectedId={modelId}
            onSelect={selectModel}
            label="Classifier model"
            disabled={isLoading}
          />
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Dataset</p>
          <OptionCardList
            options={DATASET_OPTIONS}
            selectedId={datasetId}
            onSelect={selectDataset}
            label="Labeled dataset"
            disabled={isLoading}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void run()}
          disabled={isLoading}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <Play className="h-3.5 w-3.5" aria-hidden /> Evaluate
        </button>
        {isLoading && (
          <button
            type="button"
            onClick={cancel}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Square className="h-3.5 w-3.5" aria-hidden /> Stop
          </button>
        )}
        {results && (
          <>
            <button
              type="button"
              onClick={exportJson}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Download className="h-3.5 w-3.5" aria-hidden /> Export JSON
            </button>
            <button
              type="button"
              onClick={resetResults}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden /> Clear
            </button>
          </>
        )}
        {load.cached === true && (
          <span>
            <CacheBadge cached label="model cached" />
          </span>
        )}
      </div>

      {load.status === 'loading' && (
        <div>
          <ModelLoadingPanel
            name={modelMeta?.name ?? modelId}
            size={modelMeta?.size}
            progress={load.progressValue}
            cached={load.cached === true}
          />
        </div>
      )}

      {appErr && (
        <span>
          <ErrorAlert message={appErr.message} onRetry={() => void run()} onDismiss={reset} />
        </span>
      )}

      {progress && (
        <div className="flex flex-col gap-1.5 rounded-md border border-border p-3">
          <span
            data-completed={progress.completed}
            data-total={progress.total}
            className="text-xs text-muted-foreground"
          >
            {progress.completed} / {progress.total} evaluated
          </span>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progress.total > 0 ? (progress.completed / progress.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {results && (
        <div className="flex flex-col gap-3">
          {/* Machine-readable witnesses for exact assertions (values are also
              rendered visibly in the dashboard below). */}
          <span
            role="status"
            aria-label="Evaluation metrics"
            data-accuracy={results.accuracy.toFixed(6)}
            data-precision={results.precision.toFixed(6)}
            data-recall={results.recall.toFixed(6)}
            data-f1={results.f1.toFixed(6)}
            className="sr-only"
          />
          <span
            role="status"
            aria-label="Confusion matrix data"
            data-labels={JSON.stringify(results.matrix.labels)}
            data-matrix={JSON.stringify(results.matrix.matrix)}
            className="sr-only"
          />
          <p className="text-xs text-muted-foreground">
            Ran in {formatDuration(results.durationMs)} · {results.datasetSize} items ·{' '}
            {formatScore(results.accuracy)} accuracy
          </p>
          <EvaluationMetricsDashboard
            stats={[
              { label: 'Dataset size', value: results.datasetSize },
              { label: 'Duration', value: formatDuration(results.durationMs) },
            ]}
            metrics={[
              { label: 'Accuracy', value: results.accuracy },
              { label: 'Precision', value: results.precision },
              { label: 'Recall', value: results.recall },
              { label: 'F1', value: results.f1 },
            ]}
            confusionMatrix={{ labels: results.matrix.labels, matrix: results.matrix.matrix }}
          />
        </div>
      )}
    </div>
  );
}
