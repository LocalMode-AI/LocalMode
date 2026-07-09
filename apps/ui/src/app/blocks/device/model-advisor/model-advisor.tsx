'use client';

/**
 * @file model-advisor.tsx
 * @description Self-sufficient block: computes its own device context via useCapabilities and ranks useModelRecommendations over the in-memory registry, with two-model comparison and custom model registration — zero network on mount.
 */

import { useState, type FormEvent, type ReactNode } from 'react';
import { AlertTriangle, Plus, RefreshCw, X } from 'lucide-react';
import {
  getModelRegistry,
  registerModel,
  type ModelRegistryEntry,
  type TaskCategory,
} from '@localmode/core';
import { useCapabilities, useModelRecommendations } from '@localmode/react';

import { ModelRecommendationCard } from '@/components/model-recommendation-card';
import {
  ModelComparisonPanel,
  type ComparisonEntry,
} from '@/components/model-comparison-panel';
import { cn } from '@/lib/utils';

/** Default task on load (parity: model-advisor default). */
const DEFAULT_TASK: TaskCategory = 'embedding';

/**
 * Recommendation list cap. High enough that every registry entry for a task
 * (the largest default group, `generation`, has 14) plus custom registrations
 * always appear in the ranked results — required so a freshly registered
 * model is visible after refresh.
 */
const RECOMMENDATION_LIMIT = 24;

/** Human-readable label per task category. */
const TASK_LABELS: Record<TaskCategory, string> = {
  'embedding': 'Embedding',
  'classification': 'Classification',
  'zero-shot': 'Zero-Shot Classification',
  'ner': 'Named Entity Recognition',
  'reranking': 'Reranking',
  'generation': 'Text Generation',
  'translation': 'Translation',
  'summarization': 'Summarization',
  'fill-mask': 'Fill-Mask',
  'question-answering': 'Question Answering',
  'speech-to-text': 'Speech to Text',
  'text-to-speech': 'Text to Speech',
  'image-classification': 'Image Classification',
  'image-captioning': 'Image Captioning',
  'object-detection': 'Object Detection',
  'segmentation': 'Segmentation',
  'ocr': 'OCR',
  'document-qa': 'Document QA',
  'image-features': 'Image Features',
  'image-to-image': 'Image to Image',
  'multimodal-embedding': 'Multimodal Embedding',
};

/**
 * The five model-advisor task groups covering all 21 `TaskCategory` values
 * (parity ledger A5): Text ×7, Generation ×1, Translation & Summarization ×2,
 * Vision ×9, Audio ×2.
 */
const TASK_GROUPS: ReadonlyArray<{ label: string; tasks: readonly TaskCategory[] }> = [
  {
    label: 'Text',
    tasks: [
      'embedding',
      'classification',
      'zero-shot',
      'ner',
      'reranking',
      'fill-mask',
      'question-answering',
    ],
  },
  { label: 'Generation', tasks: ['generation'] },
  { label: 'Translation & Summarization', tasks: ['translation', 'summarization'] },
  {
    label: 'Vision',
    tasks: [
      'image-classification',
      'image-captioning',
      'object-detection',
      'segmentation',
      'ocr',
      'document-qa',
      'image-features',
      'image-to-image',
      'multimodal-embedding',
    ],
  },
  { label: 'Audio', tasks: ['speech-to-text', 'text-to-speech'] },
];

/** One ranked recommendation as returned by `useModelRecommendations`. */
type Recommendation = ReturnType<typeof useModelRecommendations>['recommendations'][number];

/** Human-readable model size from megabytes. */
function formatSize(sizeMB: number): string {
  if (sizeMB >= 1024) return `${(sizeMB / 1024).toFixed(1)} GB`;
  return `${sizeMB} MB`;
}

/** Drop any unbalanced trailing `(…` fragment so a GPU label never renders dangling parens. */
function sanitizeGpuLabel(raw: string): string {
  let out = raw.trim();
  while ((out.match(/\(/g) ?? []).length > (out.match(/\)/g) ?? []).length) {
    const cut = out.replace(/\s*\([^()]*$/, '').trim();
    if (cut === out) break;
    out = cut;
  }
  return out;
}

/**
 * Shorten a raw WebGL/ANGLE GPU renderer string to a human label — e.g.
 * `ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)` → `Apple M4`,
 * `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0)…)` → `SwiftShader`
 * — always returning a balanced-parenthesis token that stays short at narrow widths.
 */
function simplifyGpuName(raw: string): string {
  const renderer = raw.match(/Renderer:\s*([^,()]+)/i);
  if (renderer?.[1]) return renderer[1].trim();
  // Software renderers → a short canonical label (skips the deeply nested paren noise).
  if (/SwiftShader/i.test(raw)) return 'SwiftShader';
  if (/llvmpipe/i.test(raw)) return 'llvmpipe';
  const angle = raw.match(/^ANGLE\s*\((.*)\)\s*$/i);
  if (angle?.[1]) {
    const parts = angle[1]
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    const label = (parts[1] ?? parts[0] ?? '').replace(/\bDirect3D.*$/i, '').trim();
    if (label) return sanitizeGpuLabel(label);
  }
  return sanitizeGpuLabel(raw);
}

/** Human MB figure (133.7 GB rather than a raw 136893 MB). */
function humanMB(mb: number): string {
  if (!Number.isFinite(mb)) return `${mb} MB`;
  if (mb >= 1024 * 1024) return `${(mb / (1024 * 1024)).toFixed(1)} TB`;
  if (mb >= 1024) return `${(mb / 1024).toFixed(mb >= 10240 ? 0 : 1)} GB`;
  return `${Math.round(mb)} MB`;
}

/**
 * Humanize raw byte/MB figures inside a recommendation reason so a chip reads
 * `Fits within available storage (110 MB of ~134 GB)` instead of `… of 136893 MB`.
 */
function humanizeReason(reason: string): string {
  return reason.replace(
    /(\d+(?:\.\d+)?)\s*MB\s+of\s+(\d+(?:\.\d+)?)\s*MB/gi,
    (_m, a: string, b: string) => `${humanMB(Number(a))} of ${humanMB(Number(b))}`,
  );
}

/** Snapshot a recommendation for the comparison panel. */
function toComparisonEntry(rec: Recommendation): ComparisonEntry {
  return {
    modelId: rec.entry.modelId,
    name: rec.entry.name,
    score: rec.score,
    sizeMB: rec.entry.sizeMB,
    size: formatSize(rec.entry.sizeMB),
    ...(rec.entry.speedTier ? { speedTier: rec.entry.speedTier } : {}),
    ...(rec.entry.qualityTier ? { qualityTier: rec.entry.qualityTier } : {}),
    ...(rec.entry.recommendedDevice ? { device: rec.entry.recommendedDevice } : {}),
    ...(rec.entry.dimensions != null ? { dimensions: rec.entry.dimensions } : {}),
  };
}

// ---------------------------------------------------------------------------
// Custom model registration (parity ledger A9)
// ---------------------------------------------------------------------------

/** String-typed draft of the 11 registration fields (parsed on submit). */
interface RegistrationDraft {
  modelId: string;
  name: string;
  provider: string;
  task: TaskCategory;
  sizeMB: string;
  minMemoryMB: string;
  dimensions: string;
  recommendedDevice: 'webgpu' | 'wasm' | 'cpu';
  speedTier: 'fast' | 'medium' | 'slow';
  qualityTier: 'low' | 'medium' | 'high';
  description: string;
}

const EMPTY_DRAFT: RegistrationDraft = {
  modelId: '',
  name: '',
  provider: '',
  task: DEFAULT_TASK,
  sizeMB: '',
  minMemoryMB: '',
  dimensions: '',
  recommendedDevice: 'wasm',
  speedTier: 'medium',
  qualityTier: 'medium',
  description: '',
};

/** Required-field + numeric validation. Returns per-field messages. */
function validateDraft(draft: RegistrationDraft): Partial<Record<keyof RegistrationDraft, string>> {
  const errors: Partial<Record<keyof RegistrationDraft, string>> = {};
  if (!draft.modelId.trim()) errors.modelId = 'Model id is required.';
  if (!draft.name.trim()) errors.name = 'Name is required.';
  if (!draft.provider.trim()) errors.provider = 'Provider is required.';
  if (!draft.sizeMB.trim()) {
    errors.sizeMB = 'Size is required.';
  } else {
    const size = Number(draft.sizeMB);
    if (!Number.isFinite(size) || size < 1) errors.sizeMB = 'Size must be a number of at least 1 MB.';
  }
  if (draft.minMemoryMB.trim()) {
    const mem = Number(draft.minMemoryMB);
    if (!Number.isFinite(mem) || mem <= 0) errors.minMemoryMB = 'Min memory must be a positive number of MB.';
  }
  if (draft.dimensions.trim()) {
    const dims = Number(draft.dimensions);
    if (!Number.isInteger(dims) || dims <= 0) errors.dimensions = 'Dimensions must be a positive integer.';
  }
  return errors;
}

const INPUT_CLASS =
  'h-8 w-full rounded-md border border-input bg-background px-2 text-sm font-normal ' +
  'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';

/** Labeled form field with an inline validation message slot. */
function Field({
  label,
  name,
  required = false,
  error,
  className,
  children,
}: {
  label: string;
  name: keyof RegistrationDraft;
  required?: boolean;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-1 text-xs font-medium', className)}>
      <span>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </span>
      {children}
      {error && (
        <span
          className="font-normal text-destructive"
        >
          {error}
        </span>
      )}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Block
// ---------------------------------------------------------------------------

/**
 * Model Advisor: task-filtered ranked recommendations, two-model comparison,
 * and custom model registration — all from the in-memory registry, zero
 * network on mount.
 */
export function ModelAdvisorBlock() {
  const [selectedTask, setSelectedTask] = useState<TaskCategory>(DEFAULT_TASK);
  const [compare, setCompare] = useState<ComparisonEntry[]>([]);

  // Registration form state
  const [registerOpen, setRegisterOpen] = useState(false);
  const [draft, setDraft] = useState<RegistrationDraft>(EMPTY_DRAFT);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof RegistrationDraft, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [registerSuccess, setRegisterSuccess] = useState<string | null>(null);

  // Recommendations from the in-memory registry, ranked against the device
  // (detectCapabilities reads browser APIs only — no network).
  const { recommendations, isLoading, error, refresh } = useModelRecommendations({
    task: selectedTask,
    limit: RECOMMENDATION_LIMIT,
  });

  // Typed device snapshot for the "ranked for your device" context line.
  const { capabilities: device, isDetecting, refresh: refreshDevice } = useCapabilities();

  // Total registry entries (default catalog + custom registrations) for the
  // selected task — lets the count line and empty state distinguish "none in
  // the registry" from "none fit this device".
  const registryTotal = getModelRegistry().filter((e) => e.task === selectedTask).length;

  const deviceSummary = device
    ? [
        `${device.hardware.cores} cores`,
        device.hardware.memory != null ? `${device.hardware.memory} GB RAM` : 'RAM unknown',
        device.hardware.gpu ? `GPU: ${simplifyGpuName(device.hardware.gpu)}` : null,
        device.features.webgpu ? 'WebGPU available' : 'WebGPU unavailable (WASM fallback)',
      ]
        .filter(Boolean)
        .join(' · ')
    : null;

  const onTaskChange = (task: TaskCategory) => {
    setSelectedTask(task);
    // Cross-task comparisons are not meaningful — reset the selection.
    setCompare([]);
  };

  /** Toggle a model in/out of the (max 2) comparison selection. */
  const toggleCompare = (modelId: string) => {
    setCompare((prev) => {
      if (prev.some((entry) => entry.modelId === modelId)) {
        return prev.filter((entry) => entry.modelId !== modelId);
      }
      const rec = recommendations.find((r) => r.entry.modelId === modelId);
      if (!rec) return prev;
      const entry = toComparisonEntry(rec);
      if (prev.length < 2) return [...prev, entry];
      // Sensible replacement: keep the most recent pick, swap out the older.
      const last = prev[prev.length - 1];
      return last ? [last, entry] : [entry];
    });
  };

  const clearCompare = () => setCompare([]);

  const openRegisterForm = () => {
    if (registerOpen) {
      setRegisterOpen(false);
      return;
    }
    setRegisterSuccess(null);
    setFormError(null);
    setFieldErrors({});
    // Pre-select the task the user is currently looking at.
    setDraft((d) => ({ ...d, task: selectedTask }));
    setRegisterOpen(true);
  };

  const setDraftField = <K extends keyof RegistrationDraft>(key: K, value: RegistrationDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const submitRegistration = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const errors = validateDraft(draft);
    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) return;

    const entry: ModelRegistryEntry = {
      modelId: draft.modelId.trim(),
      provider: draft.provider.trim(),
      task: draft.task,
      name: draft.name.trim(),
      sizeMB: Number(draft.sizeMB),
      recommendedDevice: draft.recommendedDevice,
      speedTier: draft.speedTier,
      qualityTier: draft.qualityTier,
      ...(draft.minMemoryMB.trim() ? { minMemoryMB: Number(draft.minMemoryMB) } : {}),
      ...(draft.dimensions.trim() ? { dimensions: Number(draft.dimensions) } : {}),
      ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
    };

    try {
      registerModel(entry);
      refresh();
      setRegisterSuccess(
        `Registered "${entry.name}" (${entry.modelId}) for ${TASK_LABELS[entry.task]} - recommendations refreshed.`,
      );
      setDraft({ ...EMPTY_DRAFT, task: selectedTask });
      setFieldErrors({});
      setRegisterOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    }
  };

  const taskSelectOptions = () =>
    TASK_GROUPS.map((group) => (
      <optgroup key={group.label} label={group.label}>
        {group.tasks.map((task) => (
          <option key={task} value={task}>
            {TASK_LABELS[task]}
          </option>
        ))}
      </optgroup>
    ));

  const [compareA, compareB] = compare;

  return (
    <section className="flex flex-col gap-4 p-4">
      {/* Block-root status for the platform no-download loop. */}
      <span
        data-state={isDetecting ? 'loading' : 'ready'}
        className="sr-only"
      />
      {/* Header: task selector + register CTA + device context */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs font-medium">
            <span>Task</span>
            <select
              aria-label="Task category"
              value={selectedTask}
              onChange={(e) => onTaskChange(e.target.value as TaskCategory)}
              className={cn(INPUT_CLASS, 'w-auto min-w-56')}
            >
              {taskSelectOptions()}
            </select>
          </label>
          <button
            type="button"
            aria-expanded={registerOpen}
            onClick={openRegisterForm}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {registerOpen ? (
              <X className="size-3.5" aria-hidden="true" />
            ) : (
              <Plus className="size-3.5" aria-hidden="true" />
            )}
            {registerOpen ? 'Close' : 'Register custom model'}
          </button>
        </div>
        {deviceSummary && (
          <p className="text-xs text-muted-foreground">
            Ranked for your device - {deviceSummary}
          </p>
        )}
        {registerSuccess && (
          <p
            role="status"
            aria-live="polite"
            className="text-xs text-emerald-600 dark:text-emerald-400"
          >
            {registerSuccess}
          </p>
        )}
      </div>

      {/* (A11) Error alert with retry */}
      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">Could not compute recommendations: {error.message}</span>
          <button
            type="button"
            onClick={() => {
              refresh();
              void refreshDevice();
            }}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-destructive/40 bg-background px-2 text-xs font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <RefreshCw className="size-3" aria-hidden="true" />
            Retry
          </button>
        </div>
      )}

      {/* (A9) Custom model registration — collapsible, block-level wiring */}
      {registerOpen && (
        <form
          aria-label="Register a custom model"
          noValidate
          onSubmit={submitRegistration}
          className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Register a custom model</h2>
          </div>
          <p
            className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-300"
          >
            Custom models are registered in-memory only - they are lost on page refresh.
          </p>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Model id" name="modelId" required error={fieldErrors.modelId}>
              <input
                value={draft.modelId}
                onChange={(e) => setDraftField('modelId', e.target.value)}
                placeholder="org/my-custom-model"
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="Name" name="name" required error={fieldErrors.name}>
              <input
                value={draft.name}
                onChange={(e) => setDraftField('name', e.target.value)}
                placeholder="My Custom Model"
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="Provider" name="provider" required error={fieldErrors.provider}>
              <input
                value={draft.provider}
                onChange={(e) => setDraftField('provider', e.target.value)}
                placeholder="transformers, wllama, custom…"
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="Task" name="task" required error={fieldErrors.task}>
              <select
                value={draft.task}
                onChange={(e) => setDraftField('task', e.target.value as TaskCategory)}
                className={INPUT_CLASS}
              >
                {taskSelectOptions()}
              </select>
            </Field>
            <Field label="Size (MB)" name="sizeMB" required error={fieldErrors.sizeMB}>
              <input
                type="number"
                min={1}
                value={draft.sizeMB}
                onChange={(e) => setDraftField('sizeMB', e.target.value)}
                placeholder="50"
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="Min memory (MB, optional)" name="minMemoryMB" error={fieldErrors.minMemoryMB}>
              <input
                type="number"
                min={1}
                value={draft.minMemoryMB}
                onChange={(e) => setDraftField('minMemoryMB', e.target.value)}
                placeholder="512"
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="Dimensions (optional)" name="dimensions" error={fieldErrors.dimensions}>
              <input
                type="number"
                min={1}
                value={draft.dimensions}
                onChange={(e) => setDraftField('dimensions', e.target.value)}
                placeholder="384"
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="Recommended device" name="recommendedDevice" required error={fieldErrors.recommendedDevice}>
              <select
                value={draft.recommendedDevice}
                onChange={(e) =>
                  setDraftField('recommendedDevice', e.target.value as RegistrationDraft['recommendedDevice'])
                }
                className={INPUT_CLASS}
              >
                <option value="webgpu">webgpu</option>
                <option value="wasm">wasm</option>
                <option value="cpu">cpu</option>
              </select>
            </Field>
            <Field label="Speed tier" name="speedTier" required error={fieldErrors.speedTier}>
              <select
                value={draft.speedTier}
                onChange={(e) => setDraftField('speedTier', e.target.value as RegistrationDraft['speedTier'])}
                className={INPUT_CLASS}
              >
                <option value="fast">fast</option>
                <option value="medium">medium</option>
                <option value="slow">slow</option>
              </select>
            </Field>
            <Field label="Quality tier" name="qualityTier" required error={fieldErrors.qualityTier}>
              <select
                value={draft.qualityTier}
                onChange={(e) => setDraftField('qualityTier', e.target.value as RegistrationDraft['qualityTier'])}
                className={INPUT_CLASS}
              >
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select>
            </Field>
            <Field
              label="Description (optional)"
              name="description"
              error={fieldErrors.description}
              className="sm:col-span-2 lg:col-span-3"
            >
              <input
                value={draft.description}
                onChange={(e) => setDraftField('description', e.target.value)}
                placeholder="One-line description shown on the recommendation card"
                className={INPUT_CLASS}
              />
            </Field>
          </div>

          {formError && (
            <p role="alert" className="text-xs text-destructive">
              Registration failed: {formError}
            </p>
          )}

          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              Register model
            </button>
            <button
              type="button"
              onClick={() => setRegisterOpen(false)}
              className="inline-flex h-8 items-center rounded-md border border-border bg-background px-3 text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* (A8) Two-model comparison */}
      {compare.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Compare models ({compare.length}/2)</h2>
            <button
              type="button"
              onClick={clearCompare}
              className="inline-flex h-7 items-center rounded-md border border-border bg-background px-2 text-xs font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              Clear comparison
            </button>
          </div>
          {compareA && compareB ? (
            <div role="group" aria-label="Model comparison">
              <ModelComparisonPanel entries={[compareA, compareB]} onClear={clearCompare} />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Select one more model with a card&apos;s Compare toggle to see the side-by-side comparison.
            </p>
          )}
        </div>
      )}

      {/* (A6/A7) Ranked recommendations + count line + empty state */}
      <div className="flex flex-col gap-2">
        {isLoading ? (
          <p role="status" className="text-xs text-muted-foreground">
            Detecting device capabilities…
          </p>
        ) : (
          !error && (
            <p className="text-sm">
              <span aria-label="Recommendation count" className="font-semibold tabular-nums">
                {recommendations.length}
              </span>{' '}
              of {registryTotal} registry {registryTotal === 1 ? 'model' : 'models'} fit this device for{' '}
              {TASK_LABELS[selectedTask]}
            </p>
          )
        )}

        {/* A proper labelled list — each ranked item is a named list entry. */}
        <ul
          aria-label="Ranked model recommendations"
          className="grid min-w-0 list-none items-start gap-4 p-0 lg:grid-cols-2"
        >
          {recommendations.map((rec) => {
            const comparing = compare.some((entry) => entry.modelId === rec.entry.modelId);
            return (
              <li
                key={rec.entry.modelId}
                aria-label={rec.entry.name}
                data-model-id={rec.entry.modelId}
                data-score={String(rec.score)}
                className="min-w-0"
              >
                <ModelRecommendationCard
                  className="max-w-none"
                  comparing={comparing}
                  onToggleCompare={toggleCompare}
                  recommendation={{
                    modelId: rec.entry.modelId,
                    name: rec.entry.name,
                    provider: rec.entry.provider,
                    // Primitive-prop gap: the card has no dedicated dimensions
                    // prop, so dimensions ride along in the size badge string.
                    size:
                      rec.entry.dimensions != null
                        ? `${formatSize(rec.entry.sizeMB)} · ${rec.entry.dimensions} dims`
                        : formatSize(rec.entry.sizeMB),
                    score: rec.score,
                    recommendedDevice: rec.entry.recommendedDevice,
                    speedTier: rec.entry.speedTier,
                    qualityTier: rec.entry.qualityTier,
                    ...(rec.entry.description ? { description: rec.entry.description } : {}),
                    // Humanize raw MB storage figures in reason chips.
                    reasons: rec.reasons.map(humanizeReason),
                  }}
                />
              </li>
            );
          })}
        </ul>

        {!isLoading && !error && recommendations.length === 0 && (
          <div
            className="rounded-xl border border-dashed border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground"
          >
            {registryTotal === 0
              ? `The registry has no models for ${TASK_LABELS[selectedTask]} yet - register a custom model to see it ranked here, or try a different task.`
              : `No registry models fit ${TASK_LABELS[selectedTask]} on this device - try a different task or register a custom model.`}
          </div>
        )}
      </div>
    </section>
  );
}
