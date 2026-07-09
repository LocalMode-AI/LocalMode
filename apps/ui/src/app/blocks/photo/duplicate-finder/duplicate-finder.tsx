'use client';

/**
 * @file duplicate-finder.tsx
 * @description Duplicate Finder block — a self-sufficient CLIP workbench that ingests its own photos, then union-find groups near-duplicates over the cached image embeddings (no re-embedding) with a tunable threshold + Strict/Balanced/Relaxed presets, per-group average similarity, keep-first select + bulk delete, and a cancellable RE-GROUP scan.
 */

import { useEffect, useRef, useState } from 'react';
import { Grid3x3, List, Loader2, Trash2 } from 'lucide-react';
import {
  usePhotoLibrary,
  groupDuplicates,
  duplicateIds,
  selectAllDuplicateIds,
  type DuplicateGroup,
  type PhotoEntry,
  type PhotoLibrary,
} from '@localmode/react';
import { transformers, isModelCached } from '@localmode/transformers';

import { cn } from '@/lib/utils';
import { ModelSelector, type SelectableModel } from '@/components/model-selector';
import { ModelDownloader } from '@/components/model-downloader';
import { MediaDropzone } from '@/components/media-dropzone';
import { ParameterSlider } from '@/components/parameter-slider';
import { CosineSimilarityMeter } from '@/components/cosine-similarity-meter';
import { ImageResultGallery, type ImageResultCard } from '@/components/image-result-gallery';

/* ────────────────── block-local slices (ported from photo-search/lib.ts) ─────────────────
 * These helpers are NOT re-exported from @localmode/react, so a thin verbatim slice of only
 * what this block needs is inlined (per the split-block conventions). The pure union-find
 * algorithms (groupDuplicates / duplicateIds / selectAllDuplicateIds) and the shared library
 * hook DO come from @localmode/react — imported above, never re-inlined. */

/** A selectable CLIP-family multimodal model (one model powers both embeddings + categorization). */
interface PhotoSearchModel {
  id: string;
  name: string;
  size: string;
  dimensions: number;
}

/** Default: smallest CLIP family member (512-dim), proven for true cross-modal search. */
const DEFAULT_MODEL_ID = 'Xenova/clip-vit-base-patch32';

/** Model catalog: CLIP default + SigLIP alternative (768-dim, incompatible vector space). */
const MODEL_CATALOG: PhotoSearchModel[] = [
  { id: 'Xenova/clip-vit-base-patch32', name: 'CLIP ViT-B/32', size: '~350 MB', dimensions: 512 },
  { id: 'Xenova/siglip-base-patch16-224', name: 'SigLIP Base', size: '~400 MB', dimensions: 768 },
];

/** Look up a catalog model by id (falls back to the default). */
function getModel(id: string): PhotoSearchModel {
  return MODEL_CATALOG.find((m) => m.id === id) ?? MODEL_CATALOG[0];
}

/** smart-gallery's 10 photo labels (order preserved). */
const PHOTO_LABELS = [
  'nature', 'people', 'animals', 'food', 'architecture',
  'vehicles', 'art', 'technology', 'sports', 'other',
];

/** product-search's 10 product labels (order preserved). */
const PRODUCT_LABELS = [
  'Electronics', 'Clothing', 'Home & Garden', 'Toys', 'Food & Beverage',
  'Sports', 'Books', 'Automotive', 'Health', 'Other',
];

/** The two starting label presets the shared library categorizes against. */
const LABEL_PRESETS: Record<string, { label: string; labels: string[] }> = {
  photo: { label: 'Photo', labels: [...PHOTO_LABELS] },
  product: { label: 'Product', labels: [...PRODUCT_LABELS] },
};

/** Named duplicate-threshold presets for CLIP image↔image similarity. */
const DUPLICATE_PRESETS = [
  { id: 'strict', label: 'Strict', value: 0.95 },
  { id: 'balanced', label: 'Balanced', value: 0.9 },
  { id: 'relaxed', label: 'Relaxed', value: 0.85 },
] as const;

/** Default duplicate threshold (Balanced). */
const DEFAULT_DUPLICATE_THRESHOLD = 0.9;

/** Format a 0–1 score as an integer percentage string. */
function formatScore(score: number): string {
  return `${Math.round(score * 100)}%`;
}

/* ──────────────────────────────── model-selector mapping ──────────────────────────────── */

/** Model catalog mapped to the `model-selector` contract. */
const SELECTABLE_MODELS: SelectableModel[] = MODEL_CATALOG.map((m) => ({
  id: m.id,
  name: m.name,
  backend: 'onnx',
  category: 'Multimodal (CLIP)',
  size: m.size,
  vision: true,
}));

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp'];

const toCard = (photo: PhotoEntry): ImageResultCard => ({
  id: photo.id,
  src: photo.src,
  label: photo.filename,
});

/**
 * The Duplicate Finder block. Owns its own `usePhotoLibrary` instance (model gate +
 * media-dropzone ingest) and runs union-find near-duplicate grouping over the cached
 * embeddings — RE-GROUPING (never re-embedding) on a threshold change or a library edit.
 */
export function DuplicateFinderBlock() {
  const lib: PhotoLibrary = usePhotoLibrary({
    modelId: DEFAULT_MODEL_ID,
    createEmbeddingModel: (id, onProgress) =>
      transformers.multimodalEmbedding(id, {
        onProgress: (p) => onProgress(p as Parameters<typeof onProgress>[0]),
      }),
    createZeroShotClassifier: (id) => transformers.zeroShotImageClassifier(id),
    isModelCached: (id) => isModelCached(id),
    labelPresets: LABEL_PRESETS,
    getModelDimensions: (id) => getModel(id).dimensions,
  });

  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [threshold, setThreshold] = useState(DEFAULT_DUPLICATE_THRESHOLD);
  const [groups, setGroups] = useState<DuplicateGroup[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scanning, setScanning] = useState(false);
  const cancelRef = useRef(false);

  const model = getModel(lib.activeModelId);
  const hasPhotos = lib.photos.length > 0;
  const disabled = !lib.modelReady || lib.busy || lib.switching;
  const embeddedCount = lib.photos.filter((p) => p.embedding !== null).length;
  const canScan = lib.modelReady && !lib.switching && embeddedCount >= 2;

  const dupIds = groups ? duplicateIds(groups) : new Set<string>();
  const uniquePhotos = lib.photos.filter((p) => p.embedding !== null && !dupIds.has(p.id));
  const hasDuplicates = (groups?.length ?? 0) > 0;

  /* ── status line (block-root testid the platform/redirect specs attach to) ── */
  const statusText = lib.switching
    ? lib.reindexProgress
      ? `re-indexing ${lib.reindexProgress.completed}/${lib.reindexProgress.total}…`
      : 're-indexing library…'
    : lib.modelStatus === 'loading'
      ? `loading ${model.name}… ${Math.round(lib.modelProgress * 100)}%`
      : lib.ingestProgress
        ? `embedding ${lib.ingestProgress.completed}/${lib.ingestProgress.total}…`
        : scanning
          ? 'scanning for duplicates…'
          : lib.error
            ? 'error'
            : groups !== null
              ? `${groups.length} duplicate group${groups.length === 1 ? '' : 's'} · ${dupIds.size} duplicate${dupIds.size === 1 ? '' : 's'}`
              : lib.modelReady
                ? `ready - ${lib.photos.length} photo${lib.photos.length === 1 ? '' : 's'} indexed`
                : 'idle - load a model to start';

  /* ── scan / re-group (pure O(n²) over cached embeddings — never re-embeds) ── */
  const recompute = (th: number) => setGroups(groupDuplicates(lib.photos, th));

  const scan = () => {
    if (!canScan) return;
    cancelRef.current = false;
    setScanning(true);
    setSelected(new Set());
    // Cancellable scan (honors the in-progress-cancel contract even though the
    // pure pass is fast for a session-only library).
    setTimeout(() => {
      if (cancelRef.current) {
        setScanning(false);
        return;
      }
      setGroups(groupDuplicates(lib.photos, threshold));
      setScanning(false);
    }, 0);
  };

  const cancelScan = () => {
    cancelRef.current = true;
  };

  // Keep grouping consistent as the library changes (delete/bulk-delete/add) once a scan
  // has run — RE-GROUP from cached embeddings, prune selection of vanished photos.
  useEffect(() => {
    if (groups === null) return;
    setGroups(groupDuplicates(lib.photos, threshold));
    const present = new Set(lib.photos.map((p) => p.id));
    setSelected((prev) => {
      const filtered = new Set([...prev].filter((id) => present.has(id)));
      return filtered.size === prev.size ? prev : filtered;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lib.photos]);

  const applyThreshold = (th: number) => {
    setThreshold(th);
    if (groups !== null) recompute(th); // RE-GROUP only, no re-embed
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkDelete = () => {
    if (selected.size === 0) return;
    lib.deletePhotos(new Set(selected));
    setSelected(new Set());
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4">
      {/* ── status + error ── */}
      <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
        {statusText}
      </p>
      {lib.error && (
        <div
          className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          <span>{lib.error}</span>
          <button
            type="button"
            onClick={lib.clearError}
            className="rounded px-2 py-0.5 font-medium hover:bg-destructive/20 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── model load gate ── */}
      <div
        data-status={lib.modelStatus}
        data-model-id={lib.activeModelId}
        role="group"
        aria-label="CLIP model status"
        className="flex flex-col gap-3 rounded-xl border border-border bg-muted/40 p-4 sm:flex-row sm:items-start"
      >
        <div className="w-full sm:max-w-sm">
          <ModelSelector
            models={SELECTABLE_MODELS}
            selectedId={lib.activeModelId}
            onSelect={(id) => lib.requestModel(id)}
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {lib.modelStatus === 'idle' ? (
            <>
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{model.name}</span> ({model.size}) -
                not loaded. It embeds every photo so duplicates can be found by cosine similarity.
                Nothing downloads until you press Load.
              </p>
              <button
                type="button"
                onClick={() => void lib.loadModel()}
                className="inline-flex h-9 w-fit items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Load {model.name}
              </button>
            </>
          ) : (
            <div>
              <ModelDownloader
                name={model.name}
                size={model.size}
                category="Multimodal (CLIP)"
                progress={lib.modelProgressValue}
                cached={lib.modelCached}
                ready={lib.modelReady && !lib.switching}
                className="max-w-sm"
              />
            </div>
          )}

          {/* model-switch confirm (non-empty library re-index) */}
          {lib.pendingModelId && (
            <div
              className="flex flex-col gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs"
            >
              <span className="text-foreground">
                Switch to <span className="font-medium">{getModel(lib.pendingModelId).name}</span>?
                The {getModel(lib.pendingModelId).dimensions}-dim vector space is incompatible - all{' '}
                {lib.photos.length} photos will be re-embedded.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={lib.confirmModelSwitch}
                  className="inline-flex h-7 items-center rounded-md bg-primary px-3 font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  Confirm switch
                </button>
                <button
                  type="button"
                  onClick={lib.cancelModelSwitch}
                  className="inline-flex h-7 items-center rounded-md border border-border px-3 font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* re-index progress */}
          {lib.switching && lib.reindexProgress && (
            <div
              data-completed={lib.reindexProgress.completed}
              data-total={lib.reindexProgress.total}
              role="status"
              aria-live="polite"
              aria-label="Re-index progress"
              className="text-xs tabular-nums text-muted-foreground"
            >
              Re-indexing {lib.reindexProgress.completed}/{lib.reindexProgress.total} photos through{' '}
              {model.name}…
            </div>
          )}
        </div>
      </div>

      {/* ── ingest zone (this block ingests its own photos) ── */}
      <div role="group" aria-label="Photo library upload">
        <MediaDropzone
          accept={ACCEPTED}
          multiple
          disabled={disabled}
          addAnother={hasPhotos}
          processing={lib.ingestProgress != null}
          processingLabel={
            lib.ingestProgress
              ? `Embedding ${lib.ingestProgress.completed}/${lib.ingestProgress.total}…`
              : 'Processing…'
          }
          title={lib.modelReady ? 'Drop photos here' : 'Load a model to start'}
          subtitle="PNG, JPEG or WebP - or click to browse"
          onFiles={(files) => void lib.ingest(files)}
          onReject={(rejections) =>
            lib.setRejection({
              filename: rejections[0].file.name,
              reason: rejections[0].reason,
            })
          }
        />
      </div>

      {/* ── rejection error (does not abort valid files) ── */}
      {lib.rejection && (
        <div
          className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <span>
            Rejected <span className="font-medium">{lib.rejection.filename}</span>:{' '}
            {lib.rejection.reason}
          </span>
          <button
            type="button"
            onClick={() => lib.setRejection(null)}
            className="rounded px-2 py-0.5 text-xs font-medium hover:bg-destructive/20 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── ingest progress + cancel ── */}
      {lib.ingestProgress && (
        <div
          data-completed={lib.ingestProgress.completed}
          data-total={lib.ingestProgress.total}
          role="status"
          aria-live="polite"
          aria-label="Ingest progress"
          className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm"
        >
          <span className="tabular-nums text-muted-foreground">
            Embedding {lib.ingestProgress.completed}/{lib.ingestProgress.total}…
          </span>
          <button
            type="button"
            onClick={lib.cancelIngest}
            className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            Cancel
          </button>
        </div>
      )}

      {/* ── library header: count, view toggle, clear ── */}
      {hasPhotos && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium tabular-nums">
            {lib.photos.length} photo{lib.photos.length === 1 ? '' : 's'}
            <span className="ml-1 font-normal text-muted-foreground">
              ({embeddedCount} embedded)
            </span>
          </span>

          <div className="ml-auto flex items-center gap-1">
            <div
              data-view={view}
              role="group"
              aria-label="View mode"
              className="inline-flex items-center rounded-md border border-border bg-muted/40 p-0.5"
            >
              {(['grid', 'list'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={view === mode}
                  aria-label={mode === 'grid' ? 'Grid view' : 'List view'}
                  onClick={() => setView(mode)}
                  className={cn(
                    'inline-flex h-7 items-center rounded px-2 transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                    view === mode
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {mode === 'grid' ? <Grid3x3 className="size-4" /> : <List className="size-4" />}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={lib.clearAll}
              disabled={lib.busy || lib.switching}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-destructive hover:text-destructive disabled:opacity-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <Trash2 className="size-3.5" />
              Clear all
            </button>
          </div>
        </div>
      )}

      {/* ── threshold controls + scan ── */}
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
        <div data-value={threshold}>
          <ParameterSlider
            label="Similarity threshold"
            value={Math.round(threshold * 100)}
            onChange={(v) => applyThreshold(v / 100)}
            min={50}
            max={100}
            step={1}
            precision={0}
            unit="%"
            description="Photos above this cosine similarity group as duplicates. Changing it re-groups instantly - no re-embedding."
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Duplicate threshold presets" className="flex items-center gap-1">
            {DUPLICATE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                data-preset={preset.id}
                aria-pressed={threshold === preset.value}
                onClick={() => applyThreshold(preset.value)}
                className={cn(
                  'whitespace-nowrap rounded-md border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  threshold === preset.value
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-foreground hover:bg-accent',
                )}
              >
                {preset.label} · {formatScore(preset.value)}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={scan}
            disabled={!canScan || scanning}
            className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {scanning && <Loader2 className="size-4 animate-spin" />}
            {groups === null ? 'Scan for duplicates' : 'Re-scan'}
          </button>
          {scanning && (
            <button
              type="button"
              onClick={cancelScan}
              className="inline-flex h-8 items-center rounded-md border border-border px-2.5 text-xs font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {!canScan && (
        <p className="text-sm text-muted-foreground">
          Ingest at least two photos above to scan for duplicates.
        </p>
      )}

      {/* ── stats + bulk actions ── */}
      {groups !== null && (
        <div className="flex flex-wrap items-center gap-2">
          <span
            data-total={embeddedCount}
            data-duplicates={dupIds.size}
            data-groups={groups.length}
            data-threshold={threshold}
            role="group"
            aria-label="Duplicate scan stats"
            className="text-sm tabular-nums text-muted-foreground"
          >
            {embeddedCount} photos ·{' '}
            {hasDuplicates ? (
              <span className="font-medium text-foreground">{dupIds.size} duplicates</span>
            ) : (
              <span className="font-medium text-emerald-500">no duplicates</span>
            )}{' '}
            · threshold {formatScore(threshold)}
          </span>

          {hasDuplicates && (
            <div className="ml-auto flex items-center gap-1.5">
              {selected.size > 0 ? (
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  className="inline-flex h-8 items-center rounded-md border border-border px-2.5 text-xs font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  Deselect all
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setSelected(selectAllDuplicateIds(groups))}
                  className="inline-flex h-8 items-center rounded-md border border-border px-2.5 text-xs font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  Select duplicates
                </button>
              )}
              {selected.size > 0 && (
                <button
                  type="button"
                  data-count={selected.size}
                  onClick={bulkDelete}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-destructive px-3 text-xs font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <Trash2 className="size-3.5" />
                  Delete {selected.size} selected
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── duplicate groups ── */}
      {hasDuplicates && (
        <div className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold">Duplicate groups ({groups!.length})</h2>
          {groups!.map((group, i) => (
            <div
              key={group.photos[0].id}
              data-size={group.photos.length}
              data-similarity={group.similarity.toFixed(4)}
              data-members={group.photos.map((p) => p.filename).join(',')}
              role="group"
              aria-label="Duplicate group"
              className="flex flex-col gap-3 rounded-lg border border-amber-500/30 bg-card p-3 sm:flex-row sm:items-center"
            >
              <CosineSimilarityMeter
                similarity={group.similarity}
                caption={`Group ${i + 1} · ${group.photos.length} photos`}
                className="w-full sm:w-auto shrink-0"
              />
              <div className="min-w-0 flex-1">
                <ImageResultGallery
                  cards={group.photos.map(toCard)}
                  layout="grid"
                  selectedIds={[...selected]}
                  onSelect={(id) => toggleSelect(id)}
                  scoreThresholds={{ high: 0.35, medium: 0.2 }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── unique section (after a scan) ── */}
      {groups !== null && uniquePhotos.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Unique photos ({uniquePhotos.length})</h2>
          <ImageResultGallery
            cards={uniquePhotos.map(toCard)}
            layout={view}
            scoreThresholds={{ high: 0.35, medium: 0.2 }}
          />
        </div>
      )}

      {/* ── none-found ── */}
      {groups !== null && !hasDuplicates && (
        <p
          role="status"
          aria-live="polite"
          aria-label="Duplicate scan result"
          className="rounded-lg border border-dashed border-emerald-500/40 bg-emerald-500/5 px-4 py-8 text-center text-sm text-emerald-600 dark:text-emerald-400"
        >
          No duplicates found at {formatScore(threshold)} - all {embeddedCount} photos are unique.
        </p>
      )}

      {/* ── pre-scan library preview (so you can see what you ingested) ── */}
      {hasPhotos && groups === null && (
        <div>
          <ImageResultGallery
            cards={lib.photos.map(toCard)}
            layout={view}
            onDelete={(id) => lib.deletePhoto(id)}
            scoreThresholds={{ high: 0.35, medium: 0.2 }}
          />
        </div>
      )}

      {/* ── accessibility-hidden per-photo driver mirror (E2E contract) ── */}
      <ul aria-label="Indexed photos" className="sr-only">
        {lib.photos.map((photo) => (
          <li
            key={photo.id}
            data-id={photo.id}
            data-filename={photo.filename}
            data-embedded={photo.embedding !== null}
            data-processing={photo.processing}
          >
            {photo.filename}
            {photo.embedding !== null ? ' (embedded)' : ' (embedding…)'}
          </li>
        ))}
      </ul>
    </div>
  );
}
