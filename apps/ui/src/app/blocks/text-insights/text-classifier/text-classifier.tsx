'use client';

/**
 * @file text-classifier.tsx
 * @description Text Classifier block — MobileBERT MNLI custom-label zero-shot routing with an editable label set, a top-result hero over ranked candidate scores, and a message/email sample loader; model download gated behind Run.
 */
import { useState } from 'react';
import { Play, Sparkles, Square } from 'lucide-react';
import {
  useClassifyZeroShot,
  useModelLoad,
  toAppError,
  type UseModelLoadReturn,
} from '@localmode/react';
import { classifyZeroShot, type ZeroShotClassificationModel } from '@localmode/core';
import { transformers, isModelCached } from '@localmode/transformers';

import { EditableLabelSet } from '@/components/editable-label-set';
import { TopResultCard } from '@/components/top-result-card';
import { ScoredResultBarList } from '@/components/scored-result-bar-list';
import { ModelLoadingPanel } from '@/components/model-loading-panel';
import { CacheBadge } from '@/components/cache-badge';
import { ErrorAlert } from '@/components/error-alert';
import { ModeErrorBoundary } from '@/components/mode-error-boundary';

/** MobileBERT MNLI zero-shot classifier (email-classifier parity). */
const ZEROSHOT_MODEL_ID = 'Xenova/mobilebert-uncased-mnli';
const ZEROSHOT_MODEL_NAME = 'MobileBERT Zero-Shot';
const ZEROSHOT_MODEL_SIZE = '27 MB';

/** Default routing categories (editable at runtime). */
const DEFAULT_LABELS = ['Support', 'Sales', 'Billing', 'Spam', 'General Inquiry'];

/** Sample emails for quick testing (email-classifier parity). */
const SAMPLE_EMAILS = [
  'I cannot log into my account. I have tried resetting my password multiple times but keep getting an error.',
  'We are interested in your enterprise plan. Can we schedule a demo for our team of 50 people?',
  'I was charged twice for my subscription this month. Please process a refund immediately.',
  'CONGRATULATIONS! You have won a $1000 gift card! Click here to claim your prize now!!!',
  'When will the new version be released? We are excited about the upcoming features.',
];

export function TextClassifierBlock() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
      <p className="text-xs text-muted-foreground">
        Text Classifier: MobileBERT MNLI zero-shot. Model loads only behind an explicit action.
      </p>
      <ModeErrorBoundary>
        <ClassifyInner />
      </ModeErrorBoundary>
    </div>
  );
}

function ClassifyInner() {
  const load = useModelLoad<ZeroShotClassificationModel>({
    key: `text-insights-zeroshot:${ZEROSHOT_MODEL_ID}`,
    create: (onProgress) =>
      transformers.zeroShot(ZEROSHOT_MODEL_ID, {
        onProgress: (p) => onProgress(p as Parameters<typeof onProgress>[0]),
      }),
    warmup: (model) =>
      classifyZeroShot({ model, text: 'ready', candidateLabels: ['yes', 'no'] }),
    isCached: () => isModelCached(ZEROSHOT_MODEL_ID),
  });

  const model = load.model;
  if (!model) return <p className="text-sm text-muted-foreground">Preparing…</p>;
  return <ClassifySurface load={load} model={model} />;
}

function ClassifySurface({
  load,
  model,
}: {
  load: UseModelLoadReturn<ZeroShotClassificationModel>;
  model: ZeroShotClassificationModel;
}) {
  const [input, setInput] = useState('');
  const [labels, setLabels] = useState<string[]>(DEFAULT_LABELS);

  const { data, isLoading, error, execute, cancel, reset } = useClassifyZeroShot({ model });
  const appErr = toAppError(error) ?? (load.error ? toAppError(load.error) : null);

  const canRun = input.trim().length > 0 && labels.length > 0;

  const addLabel = (label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    setLabels((prev) => (prev.some((l) => l.toLowerCase() === trimmed.toLowerCase()) ? prev : [...prev, trimmed]));
  };

  const removeLabel = (_: string, index: number) => {
    setLabels((prev) => prev.filter((_, i) => i !== index));
  };

  const run = async () => {
    if (!canRun || isLoading) return;
    try {
      await load.load();
    } catch {
      return;
    }
    await execute({ text: input, candidateLabels: labels });
  };

  const loadSample = () => {
    setInput(SAMPLE_EMAILS[Math.floor(Math.random() * SAMPLE_EMAILS.length)]);
  };

  const ranked = data ? data.labels.map((label, i) => ({ label, score: data.scores[i] })) : [];
  const top = ranked[0];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>
          {ZEROSHOT_MODEL_NAME} · {ZEROSHOT_MODEL_SIZE}
        </span>
        {load.cached === true && (
          <span>
            <CacheBadge cached label="model cached" />
          </span>
        )}
      </div>

      {/* Editable label set. */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Categories</span>
          <span className="text-xs text-muted-foreground">
            {labels.length} {labels.length === 1 ? 'label' : 'labels'}
          </span>
        </div>
        <div>
          <EditableLabelSet
            labels={labels}
            onAdd={addLabel}
            onRemove={removeLabel}
            placeholder="Add a category…"
          />
        </div>
        {labels.length === 0 && (
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-500">
            Add at least one category to classify.
          </p>
        )}
      </div>

      {/* Email input. */}
      <div>
        <textarea
          aria-label="Email or message to route"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Paste an email or message to route…"
          rows={5}
          className="w-full resize-y rounded-md border border-border bg-background p-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="mt-1 flex justify-end">
          <button
            type="button"
            onClick={loadSample}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Sparkles className="h-3 w-3" aria-hidden /> Load sample
          </button>
        </div>
      </div>

      {/* Actions. */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void run()}
          disabled={!canRun || isLoading}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <Play className="h-3.5 w-3.5" aria-hidden /> Classify
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
      </div>

      {/* Model download gate. */}
      {load.status === 'loading' && (
        <div>
          <ModelLoadingPanel
            name={ZEROSHOT_MODEL_NAME}
            size={ZEROSHOT_MODEL_SIZE}
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

      {/* Results: top hero + ranked all-label scores. */}
      {(isLoading || ranked.length > 0) && (
        <div className="flex flex-col gap-3">
          {top && (
            <div
              role="status"
              aria-label="Top routing result"
              data-label={top.label}
              data-score={top.score.toFixed(4)}
            >
              <TopResultCard label={top.label} score={top.score} title="Routed to" />
            </div>
          )}
          <div>
            <ScoredResultBarList results={ranked} isLoading={isLoading && ranked.length === 0} />
          </div>
        </div>
      )}
    </div>
  );
}
