'use client';

/**
 * @file smart-gallery.tsx
 * @description Smart Gallery block — an on-device CLIP photo library: multi-file/drag-drop ingest → progressive adaptively-batched `streamEmbedManyImages` embeddings + per-batch zero-shot categorization, rendered as a grid/list gallery with per-photo delete, clear-all, and a cancellable ingest.
 */

import { useState } from 'react';
import { Grid3x3, List, Trash2 } from 'lucide-react';
import { usePhotoLibrary, type PhotoEntry, type PhotoLibrary } from '@localmode/react';
import { transformers, isModelCached } from '@localmode/transformers';

import { cn } from '@/lib/utils';
import { ModelSelector, type SelectableModel } from '@/components/model-selector';
import { ModelDownloader } from '@/components/model-downloader';
import { MediaDropzone } from '@/components/media-dropzone';
import { ImageResultGallery, type ImageResultCard } from '@/components/image-result-gallery';
import { AdaptiveBatchBadge } from '@/components/adaptive-batch-card';

/* ─────────────── block-local slices (ported verbatim from photo-search/lib.ts) ─────────────── */

/** Model metadata — inlined so this block owns its CLIP catalog without a shared lib file. */
interface PhotoSearchModel {
  /** HuggingFace model id passed to the transformers factories. */
  id: string;
  /** Display name. */
  name: string;
  /** Human-readable download size. */
  size: string;
  /** Embedding dimensions (CLIP ViT-B/32 → 512, SigLIP base → 768). */
  dimensions: number;
}

/** Default CLIP model — the storage key `photo-search:${modelId}` must stay verbatim. */
const DEFAULT_MODEL_ID = 'Xenova/clip-vit-base-patch32';

/** CLIP default + SigLIP alternative (incompatible 768-dim space → switch re-indexes). */
const MODEL_CATALOG: PhotoSearchModel[] = [
  { id: 'Xenova/clip-vit-base-patch32', name: 'CLIP ViT-B/32', size: '~350 MB', dimensions: 512 },
  { id: 'Xenova/siglip-base-patch16-224', name: 'SigLIP Base', size: '~400 MB', dimensions: 768 },
];

/** Look up a catalog model by id (falls back to the default). */
function getModel(id: string): PhotoSearchModel {
  return MODEL_CATALOG.find((m) => m.id === id) ?? MODEL_CATALOG[0];
}

/** smart-gallery's 10 photo labels (drives per-batch zero-shot categorization). */
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
] as const;

/** product-search's 10 product labels (the alternate categorization preset). */
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
] as const;

/** The two starting label presets the categorizer offers (photo is the default). */
const LABEL_PRESETS: Record<'photo' | 'product', { labels: string[] }> = {
  photo: { labels: [...PHOTO_LABELS] },
  product: { labels: [...PRODUCT_LABELS] },
};

/** Format a 0–1 score as an integer percentage string. */
function formatScore(score: number): string {
  return `${Math.round(score * 100)}%`;
}

/* ─────────────────────────────── model-selector mapping ─────────────────────────────── */

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

/** Map a library photo to an image-result-gallery card (filename + category ·
 * similar-count secondary + confidence score badge). */
function toCard(photo: PhotoEntry): ImageResultCard {
  const category = photo.processing
    ? 'Analyzing…'
    : photo.category
      ? `${photo.category} · ${photo.similarCount} similar`
      : undefined;
  return {
    id: photo.id,
    src: photo.src,
    label: photo.filename,
    category,
    score: photo.processing || photo.confidence === 0 ? undefined : photo.confidence,
    processing: photo.processing,
  };
}

/**
 * Smart Gallery — owns a `usePhotoLibrary()` instance, its own model gate, and
 * the ingest + library-management surface (dropzone → progressive embeddings +
 * categorization → grid/list gallery with per-photo delete).
 */
export function SmartGalleryBlock() {
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

  const model = getModel(lib.activeModelId);
  const hasPhotos = lib.photos.length > 0;
  const disabled = !lib.modelReady || lib.busy || lib.switching;

  const statusText = lib.switching
    ? lib.reindexProgress
      ? `re-indexing ${lib.reindexProgress.completed}/${lib.reindexProgress.total}…`
      : 're-indexing library…'
    : lib.modelStatus === 'loading'
      ? `loading ${model.name}… ${Math.round(lib.modelProgress * 100)}%`
      : lib.ingestProgress
        ? `embedding ${lib.ingestProgress.completed}/${lib.ingestProgress.total}…`
        : lib.error
          ? 'error'
          : lib.modelReady
            ? `ready - ${lib.photos.length} photo${lib.photos.length === 1 ? '' : 's'} indexed`
            : 'idle - load a model to start';

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
                not loaded. It powers both the image embeddings and categorization. Nothing downloads
                until you press Load.
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

      {/* ── ingest zone ── */}
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

      {/* ── library header: count, batch badge, view toggle, clear ── */}
      {hasPhotos && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium tabular-nums">
            {lib.photos.length} photo{lib.photos.length === 1 ? '' : 's'}
          </span>

          <span
            role="group"
            aria-label="Adaptive batch info"
            className="ml-1 inline-flex"
          >
            <AdaptiveBatchBadge result={lib.batchInfo} />
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

      {/* ── the library grid/list (per-photo delete via the gallery's Delete image button) ── */}
      {hasPhotos ? (
        <div>
          <ImageResultGallery
            cards={lib.photos.map(toCard)}
            layout={view}
            scoreThresholds={{ high: 0.35, medium: 0.2 }}
            onDelete={(id) => lib.deletePhoto(id)}
          />
        </div>
      ) : lib.modelReady ? (
        <p
          className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground"
        >
          No photos yet. Drop some images above to build your library.
        </p>
      ) : null}

      {/* ── accessibility-hidden per-photo driver mirror (E2E contract) ── */}
      <ul aria-label="Indexed photos" className="sr-only">
        {lib.photos.map((photo) => (
          <li
            key={photo.id}
            data-id={photo.id}
            data-filename={photo.filename}
            data-category={photo.category}
            data-confidence={photo.confidence.toFixed(4)}
            data-similar={photo.similarCount}
            data-embedded={photo.embedding !== null}
            data-processing={photo.processing}
          >
            {photo.filename}: {photo.category} ({formatScore(photo.confidence)}), {photo.similarCount}{' '}
            similar
          </li>
        ))}
      </ul>
    </div>
  );
}
