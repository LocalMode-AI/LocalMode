'use client';

/**
 * @file photo-categorizer.tsx
 * @description Self-sufficient CLIP zero-shot photo categorizer — ingest photos (categorized on embed), edit the Photo/Product label set, re-categorize the whole library, and facet-filter by category.
 */

import { useState } from 'react';
import { Loader2, RefreshCw, Trash2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { ModelSelector, type SelectableModel } from '@/components/model-selector';
import { ModelDownloader } from '@/components/model-downloader';
import { MediaDropzone } from '@/components/media-dropzone';
import { ImageResultGallery, type ImageResultCard } from '@/components/image-result-gallery';
import { CategoryFacetList } from '@/components/category-facet-list';
import { EditableLabelSet } from '@/components/editable-label-set';

import { usePhotoLibrary, type PhotoEntry, type PhotoLibrary } from '@localmode/react';
import { transformers, isModelCached } from '@localmode/transformers';

/* ────────────────────────── block-local slices ─────────────────────────── */
// Ported verbatim from `photo-search/lib.ts`. These are NOT re-exported by
// `@localmode/react`, so the block inlines only the categorization surface it
// needs (model catalog, the two starting label sets, faceting, score format).

/** A selectable CLIP-family multimodal model — one model powers BOTH image
 * embeddings and zero-shot categorization. */
interface PhotoModel {
  id: string;
  name: string;
  size: string;
  dimensions: number;
}

/** Default: CLIP ViT-B/32 — 512-dim, smallest of the family. */
const DEFAULT_MODEL_ID = 'Xenova/clip-vit-base-patch32';

/** Model catalog: CLIP default + SigLIP alternative (768-dim, incompatible
 * vector space → switching after ingest requires a confirmed re-index). */
const MODEL_CATALOG: PhotoModel[] = [
  { id: 'Xenova/clip-vit-base-patch32', name: 'CLIP ViT-B/32', size: '~350 MB', dimensions: 512 },
  { id: 'Xenova/siglip-base-patch16-224', name: 'SigLIP Base', size: '~400 MB', dimensions: 768 },
];

/** Look up a catalog model by id (falls back to the default). */
function getModel(id: string): PhotoModel {
  return MODEL_CATALOG.find((m) => m.id === id) ?? MODEL_CATALOG[0];
}

/** smart-gallery's 10 photo labels (order preserved). */
const PHOTO_LABELS = [
  'nature',
  'people',
  'animals',
  'food',
  'architecture',
  'vehicles',
  'art',
  'technology',
  'sports',
  'other',
];

/** product-search's 10 product labels (order preserved). */
const PRODUCT_LABELS = [
  'Electronics',
  'Clothing',
  'Home & Garden',
  'Toys',
  'Food & Beverage',
  'Sports',
  'Books',
  'Automotive',
  'Health',
  'Other',
];

/** The two starting presets the label editor offers. */
const LABEL_PRESETS: Record<string, { label: string; labels: string[] }> = {
  photo: { label: 'Photo', labels: PHOTO_LABELS },
  product: { label: 'Product', labels: PRODUCT_LABELS },
};

/** Per-category photo counts over the library (only categorized photos). */
function categoryCounts(entries: PhotoEntry[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of entries) {
    if (entry.processing || !entry.category) continue;
    counts[entry.category] = (counts[entry.category] ?? 0) + 1;
  }
  return counts;
}

/** Format a 0–1 score as an integer percentage string. */
function formatScore(score: number): string {
  return `${Math.round(score * 100)}%`;
}

/* ─────────────────────────────── mappings ──────────────────────────────── */

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp'];

/** Model catalog mapped to the `model-selector` contract. */
const SELECTABLE_MODELS: SelectableModel[] = MODEL_CATALOG.map((m) => ({
  id: m.id,
  name: m.name,
  backend: 'onnx',
  category: 'Multimodal (CLIP)',
  size: m.size,
  vision: true,
}));

/** Map a library photo to an image-result-gallery card. */
const toCard = (photo: PhotoEntry): ImageResultCard => ({
  id: photo.id,
  src: photo.src,
  label: photo.filename,
  category: photo.processing
    ? 'Analyzing…'
    : photo.category
      ? photo.category
      : undefined,
  score: photo.processing || photo.confidence === 0 ? undefined : photo.confidence,
});

/* ──────────────────────────────── block ────────────────────────────────── */

/**
 * Photo Categorizer block. Owns its own `usePhotoLibrary` instance, model gate,
 * dropzone ingest (photos are zero-shot categorized as they embed), an editable
 * Photo/Product label set, whole-library re-categorization (no re-embedding),
 * and category faceting over the shared library.
 */
export function PhotoCategorizerBlock() {
  const lib: PhotoLibrary = usePhotoLibrary({
    modelId: DEFAULT_MODEL_ID,
    createEmbeddingModel: (id, onProgress) =>
      transformers.multimodalEmbedding(id, { onProgress: (p) => onProgress(p as never) }),
    createZeroShotClassifier: (id) => transformers.zeroShotImageClassifier(id),
    isModelCached: (id) => isModelCached(id),
    labelPresets: LABEL_PRESETS,
    getModelDimensions: (id) => getModel(id).dimensions,
  });

  const [selected, setSelected] = useState<string | null>(null);

  const model = getModel(lib.activeModelId);
  const hasPhotos = lib.photos.length > 0;
  const disabled = !lib.modelReady || lib.busy || lib.switching;

  const counts = categoryCounts(lib.photos);
  const facetCategories = Array.from(new Set([...lib.labels, ...Object.keys(counts)]));
  const embeddedCount = lib.photos.filter((p) => p.embedding !== null).length;
  const filtered = selected ? lib.photos.filter((p) => p.category === selected) : lib.photos;
  const recategorizing = lib.recategorizeProgress != null;

  const statusText = lib.switching
    ? lib.reindexProgress
      ? `re-indexing ${lib.reindexProgress.completed}/${lib.reindexProgress.total}…`
      : 're-indexing library…'
    : lib.modelStatus === 'loading'
      ? `loading ${model.name}… ${Math.round(lib.modelProgress * 100)}%`
      : lib.ingestProgress
        ? `categorizing ${lib.ingestProgress.completed}/${lib.ingestProgress.total}…`
        : recategorizing && lib.recategorizeProgress
          ? `re-categorizing ${lib.recategorizeProgress.completed}/${lib.recategorizeProgress.total}…`
          : lib.error
            ? 'error'
            : lib.modelReady
              ? `ready - ${lib.photos.length} photo${lib.photos.length === 1 ? '' : 's'} categorized`
              : 'idle - load a model to start';

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4">
      {/* ── status + error ── */}
      <p
        role="status"
        aria-live="polite"
        className="text-xs text-muted-foreground"
      >
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
                not loaded. It powers both the image embeddings and the zero-shot categorization.
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

          {/* model-switch confirm (non-empty library) */}
          {lib.pendingModelId && (
            <div
              className="flex flex-col gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs"
            >
              <span className="text-foreground">
                Switch to <span className="font-medium">{getModel(lib.pendingModelId).name}</span>?
                The {getModel(lib.pendingModelId).dimensions}-dim vector space is incompatible - all{' '}
                {lib.photos.length} photos will be re-embedded and re-categorized.
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

      {/* ── ingest zone (photos are categorized on embed) ── */}
      <div role="group" aria-label="Photo library upload">
        <MediaDropzone
          accept={ACCEPTED}
          multiple
          disabled={disabled}
          addAnother={hasPhotos}
          processing={lib.ingestProgress != null}
          processingLabel={
            lib.ingestProgress
              ? `Categorizing ${lib.ingestProgress.completed}/${lib.ingestProgress.total}…`
              : 'Processing…'
          }
          title={lib.modelReady ? 'Drop photos here' : 'Load a model to start'}
          subtitle="PNG, JPEG or WebP - categorized as they embed"
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
          aria-label="Categorization progress"
          className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm"
        >
          <span className="tabular-nums text-muted-foreground">
            Categorizing {lib.ingestProgress.completed}/{lib.ingestProgress.total}…
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

      {/* ── categories body: facets sidebar + label editor + filtered gallery ── */}
      <div className="flex flex-col gap-4 lg:flex-row">
        {/* facets sidebar — after the ingest/label controls on mobile so the
            first screen leads with the actionable surface, left rail on lg. */}
        <aside className="order-last w-full shrink-0 lg:order-none lg:w-56">
          <h2 className="mb-2 text-sm font-semibold">Categories</h2>
          <div
            data-selected={selected ?? ''}
            role="group"
            aria-label="Category facets"
          >
            <CategoryFacetList
              categories={facetCategories}
              counts={counts}
              selected={selected}
              onSelect={setSelected}
            />
          </div>
        </aside>

        {/* main */}
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {/* label presets */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">Label set:</span>
            <div
              role="group"
              aria-label="Label set presets"
              className="flex items-center gap-1"
            >
              {(Object.keys(LABEL_PRESETS) as Array<keyof typeof LABEL_PRESETS>).map((id) => (
                <button
                  key={id}
                  type="button"
                  data-preset={id}
                  aria-pressed={lib.activePreset === id}
                  onClick={() => lib.applyPreset(id)}
                  className={cn(
                    'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                    lib.activePreset === id
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background text-foreground hover:bg-accent',
                  )}
                >
                  {LABEL_PRESETS[id].label}
                </button>
              ))}
              {lib.activePreset === 'custom' && (
                <span className="rounded-md border border-border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  Custom
                </span>
              )}
            </div>
          </div>

          {/* editable labels */}
          <div>
            <EditableLabelSet
              labels={lib.labels}
              onAdd={(label) => lib.addLabel(label)}
              onRemove={(_, index) => lib.removeLabel(index)}
              placeholder="Add a category label…"
            />
          </div>

          {/* re-categorize action (no re-embedding) */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void lib.recategorize()}
              disabled={!lib.modelReady || embeddedCount === 0 || lib.busy || lib.switching}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {recategorizing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Re-categorize library
            </button>
            {recategorizing && lib.recategorizeProgress && (
              <div
                data-completed={lib.recategorizeProgress.completed}
                data-total={lib.recategorizeProgress.total}
                role="status"
                aria-live="polite"
                aria-label="Re-categorization progress"
                className="flex items-center gap-2 text-xs tabular-nums text-muted-foreground"
              >
                Re-categorizing {lib.recategorizeProgress.completed}/
                {lib.recategorizeProgress.total}…
                <button
                  type="button"
                  onClick={lib.cancelRecategorize}
                  className="rounded border border-border px-2 py-0.5 font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  Cancel
                </button>
              </div>
            )}
            <span
              className="ml-auto text-xs text-muted-foreground"
            >
              {embeddedCount} categorized photo{embeddedCount === 1 ? '' : 's'}
            </span>
            {hasPhotos && (
              <button
                type="button"
                onClick={lib.clearAll}
                disabled={lib.busy || lib.switching}
                className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-destructive hover:text-destructive disabled:opacity-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <Trash2 className="size-3.5" />
                Clear all
              </button>
            )}
          </div>

          {/* filtered gallery */}
          {filtered.length > 0 ? (
            <div
              data-count={filtered.length}
              role="region"
              aria-label="Categorized photos"
            >
              <ImageResultGallery
                cards={filtered.map(toCard)}
                layout="grid"
                scoreThresholds={{ high: 0.35, medium: 0.2 }}
                onDelete={(id) => lib.deletePhoto(id)}
              />
            </div>
          ) : lib.photos.length === 0 && !lib.modelReady ? null : (
            <p
              className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground"
            >
              {lib.photos.length === 0
                ? 'No photos yet. Drop images above - they are categorized as they embed.'
                : `No photos in “${selected}”.`}
            </p>
          )}
        </div>
      </div>

      {/* ── accessibility-hidden per-photo driver mirror (E2E contract) ── */}
      <ul aria-label="Indexed photos" className="sr-only">
        {lib.photos.map((photo) => (
          <li
            key={photo.id}
            data-id={photo.id}
            data-filename={photo.filename}
            data-category={photo.category}
            data-confidence={photo.confidence.toFixed(4)}
            data-embedded={photo.embedding !== null}
            data-processing={photo.processing}
          >
            {photo.filename}: {photo.category} ({formatScore(photo.confidence)})
          </li>
        ))}
      </ul>
    </div>
  );
}
