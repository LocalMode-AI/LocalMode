'use client';

/**
 * @file threshold-calibrator.tsx
 * @description Threshold Calibrator block — similarity-threshold calibration from corpus embeddings via `useCalibrateThreshold` (percentile 90) rendered through threshold-calibration-panel: calibrated threshold vs the model's `getDefaultThreshold` preset, distribution stats, and the `MODEL_THRESHOLD_PRESETS` reference; model download gated behind Calibrate.
 */
import { useState } from 'react';
import { Play, Square } from 'lucide-react';
import {
  useCalibrateThreshold,
  useModelLoad,
  toAppError,
  type UseModelLoadReturn,
} from '@localmode/react';
import {
  embed,
  getDefaultThreshold,
  MODEL_THRESHOLD_PRESETS,
  type EmbeddingModel,
} from '@localmode/core';
import { transformers, isModelCached } from '@localmode/transformers';

import { ThresholdCalibrationPanel } from '@/components/threshold-calibration-panel';
import { ModelLoadingPanel } from '@/components/model-loading-panel';
import { CacheBadge } from '@/components/cache-badge';
import { ErrorAlert } from '@/components/error-alert';
import { ModeErrorBoundary } from '@/components/mode-error-boundary';
import { cn } from '@/lib/utils';

// ── Fixtures (inlined) ───────────────────────────────────────────────────────

/** Default percentile for threshold calibration (model-evaluator parity). */
const DEFAULT_PERCENTILE = 90;

/** A selectable model option (id + display metadata). */
interface ModelOption {
  id: string;
  name: string;
  description: string;
  size: string;
}

const EMBEDDING_MODELS: ModelOption[] = [
  {
    id: 'Xenova/bge-small-en-v1.5',
    name: 'BGE Small',
    description: 'Compact English embedding model, 384 dimensions',
    size: '33 MB',
  },
  {
    id: 'Xenova/all-MiniLM-L6-v2',
    name: 'MiniLM L6 v2',
    description: 'Fast general-purpose embeddings, 384 dimensions',
    size: '23 MB',
  },
];

/** A built-in corpus for threshold calibration. */
interface SampleCorpus {
  id: string;
  name: string;
  description: string;
  texts: string[];
}

const SAMPLE_CORPORA: SampleCorpus[] = [
  {
    id: 'general',
    name: 'General Knowledge',
    description: 'Diverse sentences covering common topics',
    texts: [
      'The Eiffel Tower is located in Paris, France.',
      'Water boils at 100 degrees Celsius at sea level.',
      'The human heart beats about 100,000 times per day.',
      'Python is a popular programming language for data science.',
      'The Great Wall of China is visible from space.',
      'Photosynthesis converts sunlight into chemical energy.',
      'Shakespeare wrote Romeo and Juliet in the 16th century.',
      'The speed of light is approximately 300,000 km per second.',
      'DNA carries the genetic instructions for all living organisms.',
      'The Amazon rainforest produces 20% of the world oxygen.',
      'Mount Everest is the tallest mountain above sea level.',
      'The internet was originally developed for military communication.',
      'Elephants are the largest land animals on Earth.',
      'The Pacific Ocean is the largest and deepest ocean.',
      'Coffee is the second most traded commodity after oil.',
      'The human brain contains approximately 86 billion neurons.',
      'Mars is known as the Red Planet due to iron oxide.',
      'Classical music can improve concentration and focus.',
      'The stock market operates on supply and demand principles.',
      'Antibiotics cannot treat viral infections like the common cold.',
    ],
  },
  {
    id: 'technical',
    name: 'Technical Documentation',
    description: 'Software engineering and ML terminology',
    texts: [
      'Neural networks consist of interconnected layers of nodes.',
      'RESTful APIs use HTTP methods for CRUD operations.',
      'Gradient descent optimizes model parameters iteratively.',
      'Docker containers package applications with their dependencies.',
      'Transformers use self-attention mechanisms for sequence modeling.',
      'Kubernetes orchestrates containerized applications at scale.',
      'Convolutional neural networks excel at image recognition tasks.',
      'GraphQL provides a flexible query language for APIs.',
      'Reinforcement learning agents learn through trial and error.',
      'Microservices architecture splits applications into small services.',
      'BERT uses bidirectional context for language understanding.',
      'CI/CD pipelines automate software testing and deployment.',
      'Embeddings represent words as dense vectors in high-dimensional space.',
      'Load balancers distribute incoming traffic across multiple servers.',
      'Attention mechanisms allow models to focus on relevant inputs.',
      'Version control systems track changes in source code over time.',
      'Fine-tuning adapts pretrained models to specific downstream tasks.',
      'WebAssembly enables near-native performance in web browsers.',
      'Batch normalization stabilizes and accelerates neural network training.',
      'Event-driven architectures process data as streams of events.',
    ],
  },
];

// ── Inlined OptionCardList (radio-style rich option selector) ────────────────

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
 * the model / corpus selectors. Fully controlled.
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

// ── Derivations ──────────────────────────────────────────────────────────────

/** Preset reference list (mirrors `MODEL_THRESHOLD_PRESETS`). */
const PRESETS = Object.entries(MODEL_THRESHOLD_PRESETS).map(([modelId, threshold]) => ({
  modelId,
  threshold,
}));

const MODEL_OPTIONS: RichOption[] = EMBEDDING_MODELS.map((m) => ({
  id: m.id,
  name: m.name,
  description: m.description,
  meta: m.size,
}));
const CORPUS_OPTIONS: RichOption[] = SAMPLE_CORPORA.map((c) => ({
  id: c.id,
  name: c.name,
  description: c.description,
  meta: `${c.texts.length} texts`,
}));

// ── Block ────────────────────────────────────────────────────────────────────

export function ThresholdCalibratorBlock() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
      <p className="text-xs text-muted-foreground">
        Threshold Calibrator: similarity-threshold calibration from corpus embeddings. Model loads
        only behind an explicit action.
      </p>
      <ModeErrorBoundary>
        <CalibrateInner />
      </ModeErrorBoundary>
    </div>
  );
}

function CalibrateInner() {
  const [modelId, setModelId] = useState(EMBEDDING_MODELS[0].id);
  const [corpusId, setCorpusId] = useState(SAMPLE_CORPORA[0].id);
  const corpus = SAMPLE_CORPORA.find((c) => c.id === corpusId) ?? SAMPLE_CORPORA[0];
  const modelMeta = EMBEDDING_MODELS.find((m) => m.id === modelId);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Embedding model</p>
          <OptionCardList
            options={MODEL_OPTIONS}
            selectedId={modelId}
            onSelect={setModelId}
            label="Embedding model"
          />
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Corpus</p>
          <OptionCardList
            options={CORPUS_OPTIONS}
            selectedId={corpusId}
            onSelect={setCorpusId}
            label="Calibration corpus"
          />
        </div>
      </div>

      {/* Keyed on the model id so switching models loads the right weights and
          starts a fresh calibration context. */}
      <CalibrateRun key={modelId} modelId={modelId} corpus={corpus} modelName={modelMeta?.name} modelSize={modelMeta?.size} />
    </div>
  );
}

function CalibrateRun({
  modelId,
  corpus,
  modelName,
  modelSize,
}: {
  modelId: string;
  corpus: SampleCorpus;
  modelName?: string;
  modelSize?: string;
}) {
  const load = useModelLoad<EmbeddingModel>({
    key: `text-insights-embed:${modelId}`,
    create: (onProgress) =>
      transformers.embedding(modelId, {
        onProgress: (p) => onProgress(p as Parameters<typeof onProgress>[0]),
      }),
    warmup: (model) => embed({ model, value: 'ready' }),
    isCached: () => isModelCached(modelId),
  });

  const model = load.model;
  if (!model) return <p className="text-sm text-muted-foreground">Preparing…</p>;
  return (
    <CalibrateSurface
      load={load}
      model={model}
      modelId={modelId}
      corpus={corpus}
      modelName={modelName}
      modelSize={modelSize}
    />
  );
}

function CalibrateSurface({
  load,
  model,
  modelId,
  corpus,
  modelName,
  modelSize,
}: {
  load: UseModelLoadReturn<EmbeddingModel>;
  model: EmbeddingModel;
  modelId: string;
  corpus: SampleCorpus;
  modelName?: string;
  modelSize?: string;
}) {
  const { calibration, isCalibrating, error, calibrate, cancel, clearError } = useCalibrateThreshold({
    model,
    percentile: DEFAULT_PERCENTILE,
  });
  const [ran, setRan] = useState(false);

  const appErr = toAppError(error) ?? (load.error ? toAppError(load.error) : null);
  const presetThreshold = getDefaultThreshold(modelId);

  // The model instance reports a provider-prefixed id ("transformers:<id>");
  // strip it so the panel display, the preset highlight, and MODEL_THRESHOLD_PRESETS
  // (bare Hugging Face ids) all line up on the same key.
  const panelCalibration = calibration
    ? { ...calibration, modelId: calibration.modelId.replace(/^transformers:/, '') }
    : null;

  const run = async () => {
    if (isCalibrating) return;
    setRan(true);
    try {
      await load.load();
    } catch {
      return;
    }
    await calibrate(corpus.texts);
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void run()}
          disabled={isCalibrating}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <Play className="h-3.5 w-3.5" aria-hidden /> Calibrate
        </button>
        {isCalibrating && (
          <button
            type="button"
            onClick={cancel}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Square className="h-3.5 w-3.5" aria-hidden /> Stop
          </button>
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
            name={modelName ?? modelId}
            size={modelSize}
            progress={load.progressValue}
            cached={load.cached === true}
          />
        </div>
      )}

      {appErr && (
        <span>
          <ErrorAlert message={appErr.message} onRetry={() => void run()} onDismiss={clearError} />
        </span>
      )}

      {/* Only mount the panel once a run has started (empty state otherwise). */}
      {(ran || calibration) && (
        <div>
          <ThresholdCalibrationPanel
            calibration={panelCalibration}
            presetThreshold={presetThreshold}
            presets={PRESETS}
            isCalibrating={isCalibrating}
            onCalibrate={() => void run()}
            onCancel={cancel}
          />
        </div>
      )}
    </>
  );
}
