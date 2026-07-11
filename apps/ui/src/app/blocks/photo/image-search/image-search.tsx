'use client';

/**
 * @file image-search.tsx
 * @description Self-sufficient CLIP image-search block — ingest a photo library, then run text→image and image→image search over one shared multimodal vector space.
 */

import { useState } from 'react';
import { Loader2, Search, Trash2, X } from 'lucide-react';
import {
  usePhotoLibrary,
  readFileAsDataUrl,
  type PhotoEntry,
  type RankedHit,
  type PhotoLibrary,
} from '@localmode/react';
import { transformers, isModelCached } from '@localmode/transformers';

import { cn } from '@/lib/utils';
import { ModelSelector, type SelectableModel } from '@/components/model-selector';
import { ModelDownloader } from '@/components/model-downloader';
import { SegmentedModePicker } from '@/components/segmented-mode-picker';
import { ParameterSlider } from '@/components/parameter-slider';
import { MediaDropzone } from '@/components/media-dropzone';
import { ImageResultGallery, type ImageResultCard } from '@/components/image-result-gallery';
import { ScoredResultBarList } from '@/components/scored-result-bar-list';

/* ─────────────────────── inlined block-local slices ───────────────────────
 * Ported verbatim from photo-search/lib.ts. These are NOT re-exported by
 * `@localmode/react` (the hook is options-based), so each split block inlines
 * only the model catalog, label presets, search defaults, and CLIP-scale score
 * bands it uses — keeping the storage-key model ids byte-stable. */

/** A selectable CLIP-family multimodal model — one model powers BOTH embeddings
 * (text + image, one vector space) and zero-shot categorization. */
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

/** Default: CLIP ViT-B/32 — smallest of the family, 512-dim, shares weights
 * across the embedding + zero-shot factories. */
const DEFAULT_MODEL_ID = 'Xenova/clip-vit-base-patch32';

/** Model catalog: CLIP default + SigLIP alternative (768-dim, incompatible
 * vector space → switching after ingest requires a re-index). */
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

/** Editable label presets the categorization step starts from. */
const LABEL_PRESETS: Record<string, { labels: string[] }> = {
  photo: { labels: PHOTO_LABELS },
  product: { labels: PRODUCT_LABELS },
};

/** Default top-K (parity: all four absorbed apps use 20). */
const DEFAULT_TOP_K = 20;

/** Block-level min-similarity fallback for CLIP (product-search's
 * `getDefaultThreshold(modelId) ?? 0.2` — CLIP/SigLIP are not in the core
 * threshold-preset map, so this fallback is what actually applies). */
const MIN_SIMILARITY_FALLBACK = 0.2;

/** Format a 0–1 score as an integer percentage string. */
function formatScore(score: number): string {
  return `${Math.round(score * 100)}%`;
}

/** CLIP-scale score bands for result badges (cross-modal-search: ≥0.35 / ≥0.2).
 * Cross-modal cosine scores run lower than same-modality scores. */
function scoreTone(score: number): 'strong' | 'medium' | 'weak' {
  if (score >= 0.35) return 'strong';
  if (score >= 0.2) return 'medium';
  return 'weak';
}

/** Search-mode discriminator. */
type SearchMode = 'text' | 'image';

/* ─────────────────────────── local view helpers ──────────────────────────── */

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
function toLibraryCard(photo: PhotoEntry): ImageResultCard {
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
 * The Image Search block — a self-sufficient CLIP workbench: load a model,
 * ingest a photo library, then search it by text OR by a reference image over
 * the ONE shared multimodal vector space.
 */
export function ImageSearchBlock() {
  const lib: PhotoLibrary = usePhotoLibrary({
    modelId: DEFAULT_MODEL_ID,
    createEmbeddingModel: (id, onProgress) =>
      transformers.multimodalEmbedding(id, { onProgress: (p) => onProgress(p as any) }),
    createZeroShotClassifier: (id) => transformers.zeroShotImageClassifier(id),
    isModelCached: (id) => isModelCached(id),
    labelPresets: { photo: { labels: LABEL_PRESETS.photo.labels }, product: { labels: LABEL_PRESETS.product.labels } },
    getModelDimensions: (id) => getModel(id).dimensions,
    defaultTopK: DEFAULT_TOP_K,
    minSimilarityFallback: MIN_SIMILARITY_FALLBACK,
  });

  const model = getModel(lib.activeModelId);

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

  /* ── search state ── */
  const [mode, setMode] = useState<SearchMode>('text');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<RankedHit[] | null>(null);
  const [refImage, setRefImage] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  const searchDisabled = !lib.modelReady || lib.switching || lib.photos.length === 0;
  const ingestDisabled = !lib.modelReady || lib.busy || lib.switching;
  const hasPhotos = lib.photos.length > 0;

  const clearSearch = () => {
    setHits(null);
    setQuery('');
    setRefImage(null);
  };

  const runTextSearch = async () => {
    const q = query.trim();
    if (!q || searchDisabled) return;
    setSearching(true);
    try {
      setHits(await lib.searchByText(q));
    } finally {
      setSearching(false);
    }
  };

  const runImageSearch = async (file: File) => {
    if (searchDisabled) return;
    const dataUrl = await readFileAsDataUrl(file);
    setRefImage(dataUrl);
    setSearching(true);
    try {
      setHits(await lib.searchByImage(dataUrl));
    } finally {
      setSearching(false);
    }
  };

  // Resolve ranked hits back to library photos → result cards.
  const cards: ImageResultCard[] = [];
  for (const hit of hits ?? []) {
    const photo = lib.getPhoto(hit.id);
    if (!photo) continue;
    cards.push({
      id: photo.id,
      src: photo.src,
      label: photo.filename,
      category: photo.category || undefined,
      score: hit.score,
    });
  }
  const scored = cards.map((c) => ({ label: c.label ?? c.id, score: c.score ?? 0 }));
  const topFilename = cards[0]?.label ?? '';

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
                not loaded. It powers both search embeddings and categorization. Nothing downloads
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

      {/* ══════════════════════════ INGEST ══════════════════════════ */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-foreground">1 · Build a library</h2>

        <div role="group" aria-label="Photo library upload">
          <MediaDropzone
            accept={ACCEPTED}
            multiple
            disabled={ingestDisabled}
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

        {/* rejection error (does not abort valid files) */}
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

        {/* ingest progress + cancel */}
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

        {/* library header: count + clear-all */}
        {hasPhotos && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium tabular-nums">
              {lib.photos.length} photo{lib.photos.length === 1 ? '' : 's'} indexed
            </span>
            <button
              type="button"
              onClick={lib.clearAll}
              disabled={lib.busy || lib.switching}
              className="ml-auto inline-flex h-7 items-center gap-1 rounded-md border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-destructive hover:text-destructive disabled:opacity-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <Trash2 className="size-3.5" />
              Clear all
            </button>
          </div>
        )}

        {/* the library grid */}
        {hasPhotos ? (
          <div>
            <ImageResultGallery
              cards={lib.photos.map(toLibraryCard)}
              layout="grid"
              onDelete={(id) => lib.deletePhoto(id)}
              scoreThresholds={{ high: 0.35, medium: 0.2 }}
            />
          </div>
        ) : lib.modelReady ? (
          <p
            className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground"
          >
            No photos yet. Drop some images above to build a searchable library.
          </p>
        ) : null}

        {/* accessibility-hidden per-photo driver mirror (E2E contract) */}
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
      </section>

      {/* ══════════════════════════ SEARCH ══════════════════════════ */}
      <section className="flex flex-col gap-4 border-t border-border pt-4">
        <h2 className="text-sm font-semibold text-foreground">
          2 · Search the shared vector space
        </h2>

        {/* mode + threshold */}
        <div className="flex flex-wrap items-center gap-3">
          <div data-mode={mode}>
            <SegmentedModePicker<SearchMode>
              items={[
                { id: 'text', label: 'Text' },
                { id: 'image', label: 'Image' },
              ]}
              selectedId={mode}
              onSelect={(m) => {
                setMode(m);
                clearSearch();
              }}
              aria-label="Search mode"
            />
          </div>
          <span
            data-threshold={lib.minSimilarity}
            className="ml-auto text-xs text-muted-foreground"
          >
            Minimum similarity: {formatScore(lib.minSimilarity)}
          </span>
        </div>

        {/* top-K slider */}
        <div data-value={lib.topK} className="max-w-xs">
          <ParameterSlider
            label="Results (top-K)"
            value={lib.topK}
            onChange={lib.setTopK}
            min={1}
            max={50}
            step={1}
          />
        </div>

        {/* text mode */}
        {mode === 'text' && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                aria-label="Search query"
                value={query}
                disabled={searchDisabled}
                placeholder="Describe a photo, e.g. “a photo of a dog”"
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void runTextSearch();
                }}
                className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
              />
            </div>
            <button
              type="button"
              onClick={() => void runTextSearch()}
              disabled={searchDisabled || !query.trim() || searching}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
              Search
            </button>
            {hits && (
              <button
                type="button"
                onClick={clearSearch}
                className="inline-flex h-9 items-center gap-1 rounded-md border border-border px-2.5 text-xs font-medium text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <X className="size-3.5" />
                Clear
              </button>
            )}
          </div>
        )}

        {/* image mode */}
        {mode === 'image' && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div
              className="w-full sm:max-w-xs"
              role="group"
              aria-label="Reference image upload"
            >
              <MediaDropzone
                accept={ACCEPTED}
                multiple={false}
                disabled={searchDisabled}
                processing={searching}
                processingLabel="Searching…"
                title="Drop a reference image"
                subtitle="Find visually similar photos"
                onFiles={(files) => void runImageSearch(files[0])}
              />
            </div>
            {refImage && (
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={refImage} alt="Reference" className="size-20 rounded-md object-cover" />
                <button
                  type="button"
                  onClick={clearSearch}
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs font-medium text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <X className="size-3.5" />
                  Clear
                </button>
              </div>
            )}
          </div>
        )}

        {/* results */}
        {hits !== null &&
          (cards.length > 0 ? (
            <div className="flex flex-col gap-4">
              <div
                data-count={cards.length}
                data-top={topFilename}
                role="region"
                aria-label="Search results"
              >
                <ImageResultGallery
                  cards={cards}
                  layout="grid"
                  scoreThresholds={{ high: 0.35, medium: 0.2 }}
                />
              </div>
              <ScoredResultBarList results={scored} sort={false} limit={10} />
              {/* driver mirror: ranked hits (E2E reads rank/id/score/filename/tone) */}
              <ol aria-label="Search results ranking" className="sr-only">
                {cards.map((c, i) => (
                  <li
                    key={c.id}
                    data-rank={i}
                    data-id={c.id}
                    data-filename={c.label}
                    data-score={(c.score ?? 0).toFixed(4)}
                    data-tone={scoreTone(c.score ?? 0)}
                  >
                    {c.label}: {formatScore(c.score ?? 0)}
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <p
              className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground"
            >
              No photos at or above the {formatScore(lib.minSimilarity)} similarity threshold.
            </p>
          ))}

        {searchDisabled && lib.photos.length === 0 && (
          <p className="text-sm text-muted-foreground">Ingest photos above first, then search them.</p>
        )}
      </section>
    </div>
  );
}
