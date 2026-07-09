'use client';

/**
 * @file complete.tsx
 * @description Complete block — ModernBERT (topK 5) fill-mask word prediction with `[MASK]` authoring, ranked predictions, per-candidate substituted-sentence previews, and click-to-apply-and-iterate. Transformers.js-only — there is no Chrome AI fill-mask, so there is no provider to fall back from.
 */
import { useEffect, useState } from 'react';
import { useFillMask, toAppError } from '@localmode/react';
import type { FillMaskModel } from '@localmode/core';

import { MaskTokenInput } from '@/components/mask-token-input';
import { ScoredResultBarList } from '@/components/scored-result-bar-list';
import { ConfidenceScoreBadge } from '@/components/confidence-score-badge';
import { ProviderBadge } from '@/components/provider-badge';
import { ErrorAlert } from '@/components/error-alert';
import { cn } from '@/lib/utils';

/** Fill-mask model (ModernBERT base, ~150 MB) and its mask token. */
const FILL_MASK_MODEL_ID = 'onnx-community/ModernBERT-base-ONNX';
const FILL_MASK_MODEL_SIZE = '~150 MB';
const MASK_TOKEN = '[MASK]';

/** Random cloze sample sentences (carried over from the smart-autocomplete showcase). */
const COMPLETE_SAMPLES = [
  'The weather today is very [MASK].',
  'I love to eat [MASK] for breakfast.',
  'Paris is the capital of [MASK].',
  'She is a very [MASK] person.',
  'The cat sat on the [MASK].',
];

/** Confidence label from a fill-mask score (thresholds preserved from the showcase). */
function confidenceLabel(score: number): 'High' | 'Good' | 'Fair' | 'Low' {
  if (score >= 0.3) return 'High';
  if (score >= 0.1) return 'Good';
  if (score >= 0.05) return 'Fair';
  return 'Low';
}

/** Fill-mask confidence tiers for {@link ConfidenceScoreBadge} (fill-mask distribution). */
const FILL_MASK_THRESHOLDS = { high: 0.3, medium: 0.1 };

/** Replace the first mask token in `text` with `word`. */
function replaceMask(text: string, word: string): string {
  return text.replace(MASK_TOKEN, word);
}

/** A resolved fill-mask model instance plus the identity its badge/witness derive from. */
type ResolvedFillMask = { model: FillMaskModel; provider: 'transformers'; modelId: string };

// Fill-mask has no Chrome AI equivalent — this capability is Transformers.js
// only, so there is no provider to fall back FROM. Resolution just constructs
// the ModernBERT model lazily (downloaded on first predict). Session-cached.
let fillMaskCache: ResolvedFillMask | null = null;
async function resolveFillMask(modelId: string): Promise<ResolvedFillMask> {
  if (fillMaskCache) return fillMaskCache;
  const { transformers } = await import('@localmode/transformers');
  const model = transformers.fillMask(modelId);
  fillMaskCache = { model, provider: 'transformers', modelId: model.modelId };
  return fillMaskCache;
}

export function CompleteBlock() {
  const [input, setInput] = useState('The weather today is very [MASK].');
  const [resolved, setResolved] = useState<ResolvedFillMask | null>(null);

  // Construct the ModernBERT model instance lazily (no download until predict).
  useEffect(() => {
    let alive = true;
    void resolveFillMask(FILL_MASK_MODEL_ID).then((r) => {
      if (alive) setResolved(r);
    });
    return () => {
      alive = false;
    };
  }, []);

  const { data, error, isLoading, execute, cancel, reset } = useFillMask({
    model: resolved?.model as FillMaskModel,
    topK: 5,
  });

  const hasMask = input.includes(MASK_TOKEN);
  const ready = !!resolved;
  const predictions = data?.predictions ?? [];
  const appErr = toAppError(error);
  const modelId = data?.response.modelId ?? resolved?.modelId ?? null;

  const predict = () => {
    if (!hasMask || !ready || isLoading) return;
    void execute(input);
  };

  // Click-to-apply: substitute the mask, clear predictions, and let the user
  // add a new [MASK] and iterate (showcase behavior).
  const apply = (token: string) => {
    setInput(replaceMask(input, token));
    reset();
  };

  const top = predictions[0];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
      <p className="text-xs text-muted-foreground">
        Complete - ModernBERT fill-mask. Model loads only behind an explicit action.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <span data-provider={resolved?.provider ?? 'resolving'}>
          <ProviderBadge
            providerName={resolved ? 'Transformers.js' : null}
            tier="download"
            modelId={modelId}
            note={`ModernBERT · ${FILL_MASK_MODEL_SIZE} · no Chrome AI fill-mask exists`}
          />
        </span>
        <span data-model-id={modelId ?? ''} className="sr-only">
          {modelId ?? ''}
        </span>
      </div>

      <div>
        <MaskTokenInput
          value={input}
          onChange={setInput}
          maskToken={MASK_TOKEN}
          ariaLabel="Sentence with a [MASK] token"
          samples={COMPLETE_SAMPLES}
          onSubmit={predict}
          placeholder="The weather today is very [MASK]."
          disabled={isLoading}
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={isLoading ? cancel : predict}
          disabled={!ready || (!hasMask && !isLoading)}
          className={cn(
            'inline-flex h-8 items-center rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
            isLoading
              ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
              : 'bg-primary text-primary-foreground hover:bg-primary/90',
          )}
        >
          {isLoading ? 'Stop' : ready ? 'Predict' : 'Preparing…'}
        </button>
        {!hasMask && (
          <span className="text-xs text-amber-600 dark:text-amber-500">
            Add a {MASK_TOKEN} token to predict
          </span>
        )}
      </div>

      {appErr && (
        <span>
          <ErrorAlert message={appErr.message} onRetry={predict} onDismiss={reset} />
        </span>
      )}

      {(isLoading || predictions.length > 0) && (
        <div className="flex flex-col gap-3">
          <p className="text-xs font-medium text-muted-foreground">
            {isLoading ? 'Predicting…' : `Top ${predictions.length} predictions`}
          </p>

          {/* Ranked bars via the primitive (token + proportional bar + badge). */}
          <ScoredResultBarList
            results={predictions.map((p) => ({ label: p.token, score: p.score }))}
            isLoading={isLoading}
            skeletonRows={5}
            limit={5}
          />

          {/* Click-to-apply candidates: substituted preview + confidence label. */}
          {!isLoading && predictions.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {predictions.map((p, i) => (
                <li key={`${p.token}-${i}`}>
                  <button
                    type="button"
                    onClick={() => apply(p.token)}
                    className="flex w-full items-center gap-3 rounded-md border border-border p-2 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{p.token}</span>
                      <span className="ml-2 text-muted-foreground">
                        “{replaceMask(input, p.token)}”
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {confidenceLabel(p.score)}
                    </span>
                    <ConfidenceScoreBadge score={p.score} thresholds={FILL_MASK_THRESHOLDS} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Top-prediction witness (named status region) for the E2E. */}
          {top && (
            <span
              role="status"
              aria-label="Top prediction"
              className="sr-only"
            >
              {top.token}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
