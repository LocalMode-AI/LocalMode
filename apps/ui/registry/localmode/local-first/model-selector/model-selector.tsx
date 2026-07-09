'use client';

import { useState } from 'react';
import {
  CheckCircle2,
  Download,
  Eye,
  Loader2,
  Trash2,
  Wrench,
} from 'lucide-react';

import { cn } from '@/registry/localmode/lib/utils';

/** A backend / runtime a model targets. */
export type ModelBackend = 'webgpu' | 'onnx' | 'wasm' | 'litert';

/** A single selectable model entry. */
export interface SelectableModel {
  /** Stable model identifier passed to `onSelect`. */
  id: string;
  /** Display name. */
  name: string;
  /** Backend the model runs on (drives filter chips and device-fit). */
  backend: ModelBackend;
  /** Category used for grouping (e.g. "Chat", "Vision"). */
  category: string;
  /** Human-readable size (e.g. "1.2 GB"). */
  size?: string;
  /** Whether the model supports image input. */
  vision?: boolean;
  /** Whether the model supports tool / function calling. */
  tools?: boolean;
  /** Whether the model is already cached on-device. */
  cached?: boolean;
}

/** Props for {@link ModelSelector}. */
export interface ModelSelectorProps {
  /** The models to list. */
  models: SelectableModel[];
  /** Currently selected model id (for the active ring). */
  selectedId?: string;
  /**
   * Whether the current device supports WebGPU. Models whose backend is
   * `webgpu` are de-emphasized when this is false.
   */
  hasWebGPU?: boolean;
  /** Set of model ids whose download/delete is in progress. */
  busyIds?: ReadonlySet<string>;
  /** Fired when a fit, available model is activated. */
  onSelect?: (modelId: string) => void;
  /** Fired when the download affordance on an uncached model is activated. */
  onDownload?: (modelId: string) => void;
  /** Fired when the delete-from-cache affordance on a cached model is activated. */
  onDelete?: (modelId: string) => void;
  /** Additional class names merged onto the root element. */
  className?: string;
}

const BACKENDS: { key: ModelBackend; label: string }[] = [
  { key: 'webgpu', label: 'WebGPU' },
  { key: 'onnx', label: 'ONNX' },
  { key: 'wasm', label: 'WASM' },
  { key: 'litert', label: 'LiteRT' },
];

/**
 * A device-aware model picker. Groups models by category, filters by backend
 * with live counts, surfaces vision / tool-calling / cached badges, and offers
 * download (uncached) and delete-from-cache (cached) affordances. Models that
 * cannot run on the current device — e.g. a WebGPU-only model on a device
 * without WebGPU — are visibly de-emphasized while their "Requires WebGPU"
 * reason stays at full contrast.
 *
 * The backend-filter row wraps at narrow widths and only appears when two or
 * more backends are actually present — a single-backend catalog (e.g. a CLIP
 * pair) hides the row entirely rather than showing zero-count chips. Filter
 * chips expose their pressed state (`aria-pressed`) inside a labelled group, and
 * the active model row is marked `aria-current` for assistive tech.
 *
 * Presentational and stateless about selection: it emits `onSelect(modelId)`
 * and the app owns the selected model. Bind `models` to
 * `useModelRecommendations`, `hasWebGPU` to `useCapabilities`, and `cached`/
 * `busyIds` to `useModelLoad` lifecycles (`cached`, `status === 'loading'`) or
 * per-model `useModelStatus` (`isLoading`).
 *
 * @example
 * ```tsx
 * <ModelSelector models={models} hasWebGPU={caps?.webgpu} onSelect={setModel} />
 * ```
 */
export function ModelSelector({
  models,
  selectedId,
  hasWebGPU = true,
  busyIds,
  onSelect,
  onDownload,
  onDelete,
  className,
}: ModelSelectorProps) {
  const [activeBackend, setActiveBackend] = useState<ModelBackend | 'all'>('all');

  const counts = BACKENDS.reduce<Record<string, number>>((acc, b) => {
    acc[b.key] = models.filter((m) => m.backend === b.key).length;
    return acc;
  }, {});

  // Only backends that actually have models are worth a chip; a single-backend
  // catalog needs no filter row at all (zero-count chips are pure clutter and a
  // second horizontal-overflow source at 375).
  const presentBackends = BACKENDS.filter((b) => counts[b.key] > 0);
  const showFilter = presentBackends.length > 1;

  // Guard against a stale active backend (e.g. the models prop changed and the
  // previously-selected backend now has zero entries): fall back to "all".
  const effectiveBackend =
    activeBackend !== 'all' && counts[activeBackend] === 0 ? 'all' : activeBackend;

  const visible =
    effectiveBackend === 'all'
      ? models
      : models.filter((m) => m.backend === effectiveBackend);

  // Group visible models by category, preserving first-seen order.
  const groups = new Map<string, SelectableModel[]>();
  for (const m of visible) {
    const list = groups.get(m.category) ?? [];
    list.push(m);
    groups.set(m.category, list);
  }

  const isUnfit = (m: SelectableModel) => m.backend === 'webgpu' && !hasWebGPU;

  return (
    <div
      className={cn(
        'flex w-full max-w-md flex-col gap-3 rounded-xl border border-border bg-card p-3 text-card-foreground',
        className,
      )}
    >
      {showFilter && (
        <div
          role="group"
          aria-label="Filter models by backend"
          className="flex flex-wrap gap-1.5"
        >
          <FilterChip
            active={effectiveBackend === 'all'}
            onClick={() => setActiveBackend('all')}
          >
            All
            <span className="ml-1 text-muted-foreground">{models.length}</span>
          </FilterChip>
          {presentBackends.map((b) => (
            <FilterChip
              key={b.key}
              active={effectiveBackend === b.key}
              onClick={() => setActiveBackend(b.key)}
            >
              {b.label}
              <span className="ml-1 text-muted-foreground">{counts[b.key]}</span>
            </FilterChip>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {[...groups.entries()].map(([category, items]) => (
          <div key={category} className="flex flex-col gap-1.5">
            <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {category}
            </p>
            <ul className="flex flex-col gap-1">
              {items.map((m) => {
                const unfit = isUnfit(m);
                const busy = busyIds?.has(m.id) ?? false;
                const isSelected = selectedId === m.id;
                return (
                  <li key={m.id}>
                    <div
                      className={cn(
                        'group flex items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 transition-colors',
                        isSelected && 'border-primary bg-accent',
                        !unfit && 'hover:border-border hover:bg-accent',
                      )}
                    >
                      <button
                        type="button"
                        disabled={unfit}
                        aria-current={isSelected ? 'true' : undefined}
                        onClick={() => !unfit && onSelect?.(m.id)}
                        className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed"
                      >
                        {m.cached ? (
                          <CheckCircle2
                            className="size-3.5 shrink-0 text-emerald-500"
                            aria-label="cached"
                          />
                        ) : (
                          <span className="size-3.5 shrink-0" />
                        )}
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn(
                              'block truncate text-sm font-medium',
                              // De-emphasize only the name on unfit rows — never
                              // dim the whole row, which would halve the contrast
                              // of the actionable "Requires WebGPU" reason.
                              unfit && 'text-muted-foreground',
                            )}
                          >
                            {m.name}
                          </span>
                          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            {m.size && <span>{m.size}</span>}
                            {unfit && (
                              <span className="font-medium text-amber-700 dark:text-amber-400">
                                Requires WebGPU
                              </span>
                            )}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1">
                          {m.vision && (
                            <Eye
                              className="size-3.5 text-muted-foreground"
                              aria-label="vision"
                            />
                          )}
                          {m.tools && (
                            <Wrench
                              className="size-3.5 text-muted-foreground"
                              aria-label="tool calling"
                            />
                          )}
                        </span>
                      </button>

                      {busy ? (
                        <span className="flex size-11 shrink-0 items-center justify-center sm:size-9">
                          <Loader2 className="size-4 animate-spin text-muted-foreground" />
                        </span>
                      ) : m.cached ? (
                        // Only render the delete affordance when the app wired a
                        // handler — otherwise it would be a focusable no-op.
                        onDelete ? (
                          <button
                            type="button"
                            aria-label={`Delete ${m.name} from cache`}
                            onClick={() => onDelete(m.id)}
                            className="flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:size-9 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        ) : null
                      ) : onDownload ? (
                        // Same for download: no dead button when a block loads
                        // models by another path (e.g. its own Load button).
                        <button
                          type="button"
                          disabled={unfit}
                          aria-label={`Download ${m.name}`}
                          onClick={() => !unfit && onDownload(m.id)}
                          className="flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 sm:size-9"
                        >
                          <Download className="size-4" />
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {visible.length === 0 && (
          <p className="px-1 py-6 text-center text-sm text-muted-foreground">
            No models for this backend.
          </p>
        )}
      </div>
    </div>
  );
}

/** Internal filter chip used by the backend tabs. */
function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-background text-foreground hover:bg-accent',
      )}
    >
      {children}
    </button>
  );
}
