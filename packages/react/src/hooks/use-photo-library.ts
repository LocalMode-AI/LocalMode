'use client';

/**
 * @file use-photo-library.ts
 * @description A shared in-memory photo library over ONE CLIP-family model that
 * powers both multimodal embeddings (text + image, one vector space → search +
 * duplicates) and zero-shot categorization. It owns the photo entries + their
 * embeddings, the model-load lifecycle (`useModelLoad`), the active editable
 * label set, the adaptive batch profile (`useAdaptiveBatchSize`), and every
 * mutation — ingest (progressive, adaptively-batched, cancellable), per-batch
 * zero-shot categorization with an `other`/0 fallback, text/image search over
 * the shared vector space, per-photo + bulk delete, clear-all, a confirmed
 * model-switch re-index, and label re-categorization.
 *
 * Provider-agnostic by injection: the embedding model, the zero-shot
 * classifier, and the (optional) cache probe are supplied as factories, so
 * `@localmode/react` gains no `@localmode/transformers` dependency. The core
 * embedding / search / ranking functions run through their real call paths.
 * Zero model bytes move until an explicit action calls `loadModel()` / ingest /
 * search.
 */

import { useEffect, useRef, useState } from 'react';
import {
  embed,
  embedImage,
  streamEmbedManyImages,
  classifyImageZeroShot,
  cosineSimilarity,
  getDefaultThreshold,
  type MultimodalEmbeddingModel,
  type ZeroShotImageClassificationModel,
} from '@localmode/core';

import { useModelLoad, type AnyLoadProgress } from '../utilities/use-model-load.js';
import { useAdaptiveBatchSize } from './use-adaptive-batch-size.js';
import { readFileAsDataUrl } from '../helpers/read-file.js';

/* ─────────────────────────────── entries ─────────────────────────────── */

/**
 * One photo in the shared library. Carries its own embedding so every consumer
 * reads one shared in-memory index; `embedding` is `null` while it is still
 * being embedded.
 */
export interface PhotoEntry {
  /** Stable id (crypto.randomUUID). */
  id: string;
  /** Preview + embedding source (data URL). */
  src: string;
  /** Original filename. */
  filename: string;
  /** Embedding in the active model's vector space, or null until embedded. */
  embedding: Float32Array | null;
  /** Top zero-shot category label. */
  category: string;
  /** Confidence of `category` in [0, 1]. */
  confidence: number;
  /** Number of other library photos above the similar-count threshold. */
  similarCount: number;
  /** True while embedding/categorizing (drives per-card overlays). */
  processing: boolean;
}

/** A ranked search hit. */
export interface RankedHit {
  /** The matched photo id. */
  id: string;
  /** Cosine similarity in [0, 1]. */
  score: number;
}

/** A detected duplicate group (2+ members, average pairwise similarity). */
export interface DuplicateGroup {
  /** Member photos (first is the keep-first "keeper"). */
  photos: PhotoEntry[];
  /** Average of all pairwise similarities touching any member. */
  similarity: number;
}

/** Progress of an embedding pass (ingest or re-index). */
export interface ProcessProgress {
  /** Photos finished so far. */
  completed: number;
  /** Total photos in this pass. */
  total: number;
}

/** A file rejected by the dropzone, surfaced as a dismissible error. */
export interface IngestRejection {
  filename: string;
  reason: string;
}

/** The active preset id, or `'custom'` once the user edits the labels. */
export type ActivePreset = string;

/* ─────────────────────────── pure library algorithms ─────────────────────── */
// Deterministic, model-free, and unit-testable. All ranking / grouping runs
// over the entries' cached embeddings via core's `cosineSimilarity`.

/** Photos scoring above this against another photo count toward its similar-count. */
export const DEFAULT_SIMILAR_COUNT_THRESHOLD = 0.7;

/**
 * Rank the library against a query embedding by cosine similarity, filtering by
 * a minimum-similarity floor and capping at top-K. Only embedded photos
 * participate. Powers both text→image and image→image search (the query vector
 * lives in the same shared vector space).
 */
export function rankByEmbedding(
  query: Float32Array,
  entries: PhotoEntry[],
  topK: number,
  minSimilarity: number,
): RankedHit[] {
  const scored: RankedHit[] = [];
  for (const entry of entries) {
    if (!entry.embedding) continue;
    const score = cosineSimilarity(query, entry.embedding);
    if (score >= minSimilarity) scored.push({ id: entry.id, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

/**
 * Compute each photo's similar-count: the number of OTHER embedded photos whose
 * cosine similarity exceeds the threshold. Returns a map id → count. O(n²) over
 * the (small, session-only) library.
 */
export function computeSimilarCounts(
  entries: PhotoEntry[],
  threshold: number = DEFAULT_SIMILAR_COUNT_THRESHOLD,
): Map<string, number> {
  const counts = new Map<string, number>();
  const embedded = entries.filter((p) => p.embedding !== null);
  for (const a of embedded) {
    let count = 0;
    for (const b of embedded) {
      if (a.id === b.id) continue;
      if (cosineSimilarity(a.embedding!, b.embedding!) > threshold) count++;
    }
    counts.set(a.id, count);
  }
  return counts;
}

/**
 * Group visually-similar/duplicate photos via union-find (path compression +
 * union by rank) over pairwise cosine similarity. Only photos with embeddings
 * participate; groups keep 2+ members, carry the average of every pairwise
 * similarity touching a member, and are sorted by similarity descending. Cheap
 * to re-run on a threshold change (no re-embedding).
 */
export function groupDuplicates(entries: PhotoEntry[], threshold: number): DuplicateGroup[] {
  const embedded = entries.filter((p) => p.embedding !== null);
  if (embedded.length < 2) return [];

  const parent = new Map<string, string>();
  const rank = new Map<string, number>();
  const pairSimilarities = new Map<string, number[]>();

  for (const photo of embedded) {
    parent.set(photo.id, photo.id);
    rank.set(photo.id, 0);
    pairSimilarities.set(photo.id, []);
  }

  function find(id: string): string {
    const p = parent.get(id)!;
    if (p !== id) {
      const root = find(p);
      parent.set(id, root);
      return root;
    }
    return id;
  }

  function union(a: string, b: string): void {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA === rootB) return;
    const rankA = rank.get(rootA)!;
    const rankB = rank.get(rootB)!;
    if (rankA < rankB) {
      parent.set(rootA, rootB);
    } else if (rankA > rankB) {
      parent.set(rootB, rootA);
    } else {
      parent.set(rootB, rootA);
      rank.set(rootA, rankA + 1);
    }
  }

  for (let i = 0; i < embedded.length; i++) {
    for (let j = i + 1; j < embedded.length; j++) {
      const similarity = cosineSimilarity(embedded[i].embedding!, embedded[j].embedding!);
      if (similarity >= threshold) {
        union(embedded[i].id, embedded[j].id);
        pairSimilarities.get(embedded[i].id)!.push(similarity);
        pairSimilarities.get(embedded[j].id)!.push(similarity);
      }
    }
  }

  const groups = new Map<string, PhotoEntry[]>();
  for (const photo of embedded) {
    const root = find(photo.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(photo);
  }

  const result: DuplicateGroup[] = [];
  for (const [, members] of groups) {
    if (members.length < 2) continue;
    const allSims: number[] = [];
    for (const member of members) allSims.push(...pairSimilarities.get(member.id)!);
    const avgSimilarity =
      allSims.length > 0 ? allSims.reduce((sum, s) => sum + s, 0) / allSims.length : 0;
    result.push({ photos: members, similarity: avgSimilarity });
  }

  result.sort((a, b) => b.similarity - a.similarity);
  return result;
}

/** Unique photo ids across all duplicate groups. */
export function duplicateIds(groups: DuplicateGroup[]): Set<string> {
  const ids = new Set<string>();
  for (const group of groups) for (const photo of group.photos) ids.add(photo.id);
  return ids;
}

/** Keep-first selection: every group member EXCEPT the first (index 0). */
export function selectAllDuplicateIds(groups: DuplicateGroup[]): Set<string> {
  const ids = new Set<string>();
  for (const group of groups) {
    for (let i = 1; i < group.photos.length; i++) ids.add(group.photos[i].id);
  }
  return ids;
}

/* ─────────────────────────────── hook options ────────────────────────────── */

/** Options for {@link usePhotoLibrary}. */
export interface UsePhotoLibraryOptions {
  /** Initial active model id (a CLIP-family multimodal model). */
  modelId: string;
  /**
   * Construct the multimodal embedding model for a given model id, wiring the
   * hook-bound load-progress callback (e.g.
   * `(id, onProgress) => transformers.multimodalEmbedding(id, { onProgress })`).
   */
  createEmbeddingModel: (
    id: string,
    onProgress: (progress: AnyLoadProgress) => void,
  ) => MultimodalEmbeddingModel;
  /**
   * Construct the zero-shot image classifier for a given model id (shares the
   * downloaded weights with the embedding model in the browser cache).
   */
  createZeroShotClassifier: (id: string) => ZeroShotImageClassificationModel;
  /** Optional cache probe for the active model (e.g. `(id) => isModelCached(id)`). */
  isModelCached?: (id: string) => Promise<boolean>;
  /** Selectable label sets (e.g. `{ photo: { labels: [...] }, product: { labels: [...] } }`). */
  labelPresets: Record<string, { labels: string[] }>;
  /** Preset id to start from (default: the first key of `labelPresets`). */
  initialPresetId?: string;
  /** Embedding dimensionality of a model id, for the adaptive batch profile. */
  getModelDimensions?: (id: string) => number | undefined;
  /** Default top-K for search (default: 20). */
  defaultTopK?: number;
  /** Min-similarity floor used when the model has no core threshold preset (default: 0.2). */
  minSimilarityFallback?: number;
  /** Category assigned when categorization fails/omits (default: `'other'`). */
  fallbackLabel?: string;
  /** Confidence assigned with the fallback label (default: 0). */
  fallbackConfidence?: number;
}

/** Everything a consumer reads/calls. */
export interface PhotoLibrary {
  // ── model lifecycle ──
  activeModelId: string;
  modelStatus: ReturnType<typeof useModelLoad>['status'];
  modelProgress: number;
  modelProgressValue: ReturnType<typeof useModelLoad>['progressValue'];
  modelCached: boolean | undefined;
  modelReady: boolean;
  loadModel: () => Promise<void>;
  /** Request a model switch. Empty library → immediate; non-empty → confirm. */
  requestModel: (id: string) => void;
  pendingModelId: string | null;
  confirmModelSwitch: () => void;
  cancelModelSwitch: () => void;

  // ── library ──
  photos: PhotoEntry[];
  ingest: (files: File[]) => Promise<void>;
  ingestProgress: ProcessProgress | null;
  cancelIngest: () => void;
  rejection: IngestRejection | null;
  setRejection: (r: IngestRejection | null) => void;
  deletePhoto: (id: string) => void;
  deletePhotos: (ids: Set<string>) => void;
  clearAll: () => void;
  getPhoto: (id: string) => PhotoEntry | undefined;

  // ── search ──
  topK: number;
  setTopK: (n: number) => void;
  minSimilarity: number;
  searchByText: (query: string) => Promise<RankedHit[]>;
  searchByImage: (dataUrl: string) => Promise<RankedHit[]>;

  // ── labels / categorization ──
  labels: string[];
  activePreset: ActivePreset;
  addLabel: (label: string) => void;
  removeLabel: (index: number) => void;
  applyPreset: (id: string) => void;
  recategorize: () => Promise<void>;
  recategorizeProgress: ProcessProgress | null;
  cancelRecategorize: () => void;

  // ── model-switch re-index ──
  switching: boolean;
  reindexProgress: ProcessProgress | null;

  // ── adaptive batch profile ──
  batchInfo: ReturnType<typeof useAdaptiveBatchSize>;

  // ── shared status ──
  busy: boolean;
  error: string | null;
  clearError: () => void;
}

const toMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Shared in-memory photo library hook. ONE loaded CLIP-family model powers both
 * multimodal embeddings and zero-shot categorization. Provider-agnostic by
 * injection — pass `createEmbeddingModel` / `createZeroShotClassifier` (and
 * optionally `isModelCached`) plus the `labelPresets`.
 *
 * @param options - Injected model factories, label presets, and search defaults
 * @returns The full {@link PhotoLibrary} surface (state + mutations)
 *
 * @example
 * ```tsx
 * import { usePhotoLibrary } from '@localmode/react';
 * import { transformers, isModelCached } from '@localmode/transformers';
 *
 * const lib = usePhotoLibrary({
 *   modelId: 'Xenova/clip-vit-base-patch32',
 *   createEmbeddingModel: (id, onProgress) => transformers.multimodalEmbedding(id, { onProgress }),
 *   createZeroShotClassifier: (id) => transformers.zeroShotImageClassifier(id),
 *   isModelCached: (id) => isModelCached(id),
 *   labelPresets: { photo: { labels: ['nature', 'people', 'other'] } },
 *   getModelDimensions: () => 512,
 * });
 * ```
 *
 * @see rankByEmbedding / groupDuplicates for the pure ranking/grouping algorithms
 */
export function usePhotoLibrary(options: UsePhotoLibraryOptions): PhotoLibrary {
  const {
    createEmbeddingModel,
    createZeroShotClassifier,
    isModelCached,
    labelPresets,
    getModelDimensions,
    defaultTopK = 20,
    minSimilarityFallback = 0.2,
    fallbackLabel = 'other',
    fallbackConfidence = 0,
  } = options;

  const initialPresetId =
    options.initialPresetId ?? Object.keys(labelPresets)[0] ?? 'custom';
  const initialLabels = labelPresets[initialPresetId]?.labels ?? [];

  const [activeModelId, setActiveModelId] = useState(options.modelId);
  const [pendingModelId, setPendingModelId] = useState<string | null>(null);

  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [labels, setLabels] = useState<string[]>(initialLabels);
  const [activePreset, setActivePreset] = useState<ActivePreset>(initialPresetId);
  const [topK, setTopK] = useState(defaultTopK);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejection, setRejection] = useState<IngestRejection | null>(null);

  const [ingestProgress, setIngestProgress] = useState<ProcessProgress | null>(null);
  const [reindexProgress, setReindexProgress] = useState<ProcessProgress | null>(null);
  const [recategorizeProgress, setRecategorizeProgress] = useState<ProcessProgress | null>(null);
  const [switching, setSwitching] = useState(false);

  // Min-similarity floor: CLIP/SigLIP are typically not in the core
  // threshold-preset map, so the injected fallback (0.2) is what applies.
  const minSimilarity = getDefaultThreshold(activeModelId) ?? minSimilarityFallback;

  const batchInfo = useAdaptiveBatchSize({
    taskType: 'ingestion',
    modelDimensions: getModelDimensions?.(activeModelId),
  });

  // Latest injected factories, mirrored for use inside long-lived closures.
  const createEmbeddingModelRef = useRef(createEmbeddingModel);
  createEmbeddingModelRef.current = createEmbeddingModel;
  const createZeroShotRef = useRef(createZeroShotClassifier);
  createZeroShotRef.current = createZeroShotClassifier;

  // ── model lifecycle (explicit-action gated; zero bytes on page load) ──
  // Storage-identifier stability: the load key stays `photo-search:${modelId}`
  // verbatim so a later switch to persistent storage cannot orphan data.
  const embedModelRef = useRef<MultimodalEmbeddingModel | null>(null);
  const modelLoad = useModelLoad<MultimodalEmbeddingModel>({
    key: `photo-search:${activeModelId}`,
    create: (onProgress) => {
      const model = createEmbeddingModelRef.current(activeModelId, onProgress);
      embedModelRef.current = model;
      return model;
    },
    isCached: isModelCached ? () => isModelCached(activeModelId) : undefined,
  });

  // Route load through a ref so long-lived async handlers always call the
  // current (re-keyed) load after a model switch.
  const loadRef = useRef(modelLoad.load);
  loadRef.current = modelLoad.load;

  // Zero-shot classifier instance, recreated per active model id (shares the
  // downloaded weights with the embedding model in the browser cache).
  const zeroShotRef = useRef<{ id: string; model: ZeroShotImageClassificationModel } | null>(null);
  const getZeroShot = (): ZeroShotImageClassificationModel => {
    if (zeroShotRef.current?.id !== activeModelId) {
      zeroShotRef.current = { id: activeModelId, model: createZeroShotRef.current(activeModelId) };
    }
    return zeroShotRef.current.model;
  };

  // Refs mirroring the latest state for use inside long-lived async closures.
  const photosRef = useRef(photos);
  photosRef.current = photos;
  const labelsRef = useRef(labels);
  labelsRef.current = labels;

  // Abort controllers for the cancellable operations.
  const ingestAbortRef = useRef<AbortController | null>(null);
  const reindexAbortRef = useRef<AbortController | null>(null);
  const recategorizeAbortRef = useRef<AbortController | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);

  // Set when a confirmed model switch needs the effect below to re-index.
  const reindexRequestedRef = useRef(false);

  /** Recompute every photo's similar-count from the current library. */
  const recomputeSimilarCounts = () => {
    setPhotos((prev) => {
      const counts = computeSimilarCounts(prev);
      return prev.map((p) => ({ ...p, similarCount: counts.get(p.id) ?? 0 }));
    });
  };

  /**
   * Embed + categorize a set of entries progressively, adaptively batched.
   * Shared by ingest and re-index. Commits each photo as its embedding lands;
   * categorization failure for one photo falls back to `other`/0 without
   * aborting the rest. Cancellation stops between batches, keeping already-
   * embedded photos usable.
   */
  const processEntries = async (
    entries: PhotoEntry[],
    controller: AbortController,
    setProgress: (p: ProcessProgress | null) => void,
  ) => {
    await loadRef.current();
    const model = embedModelRef.current;
    if (!model) throw new Error('Model not loaded');
    const zeroShot = getZeroShot();
    const images = entries.map((e) => e.src);
    setProgress({ completed: 0, total: entries.length });

    let done = 0;
    for await (const { embedding, index } of streamEmbedManyImages({
      model,
      images,
      batchSize: batchInfo.batchSize,
      abortSignal: controller.signal,
    })) {
      const entry = entries[index];
      let category = fallbackLabel;
      let confidence = fallbackConfidence;
      try {
        const { labels: outLabels, scores } = await classifyImageZeroShot({
          model: zeroShot,
          image: entry.src,
          candidateLabels: labelsRef.current,
          abortSignal: controller.signal,
        });
        category = outLabels[0] ?? fallbackLabel;
        confidence = scores[0] ?? fallbackConfidence;
      } catch (err) {
        if (controller.signal.aborted) throw err;
        // else: keep the fallback label — the photo is still embedded/usable.
      }
      setPhotos((prev) =>
        prev.map((p) =>
          p.id === entry.id ? { ...p, embedding, category, confidence, processing: false } : p,
        ),
      );
      done += 1;
      setProgress({ completed: done, total: entries.length });
    }
    recomputeSimilarCounts();
  };

  // ── ingest ──
  const ingest = async (files: File[]) => {
    if (files.length === 0) return;
    const entries: PhotoEntry[] = [];
    for (const file of files) {
      entries.push({
        id: crypto.randomUUID(),
        src: await readFileAsDataUrl(file),
        filename: file.name,
        embedding: null,
        category: '',
        confidence: 0,
        similarCount: 0,
        processing: true,
      });
    }
    // Thumbnails appear immediately with per-item processing overlays.
    setPhotos((prev) => [...prev, ...entries]);

    const controller = new AbortController();
    ingestAbortRef.current = controller;
    setBusy(true);
    setError(null);
    try {
      await processEntries(entries, controller, setIngestProgress);
    } catch (err) {
      if (!controller.signal.aborted) setError(toMessage(err));
    } finally {
      setBusy(false);
      setIngestProgress(null);
      ingestAbortRef.current = null;
    }
  };

  const cancelIngest = () => ingestAbortRef.current?.abort();

  // ── model switch + re-index ──
  const requestModel = (id: string) => {
    if (id === activeModelId || busy || switching) return;
    const hasEmbedded = photos.some((p) => p.embedding !== null);
    if (!hasEmbedded) {
      // Nothing to re-index: switch immediately (the new model loads on the
      // next explicit action).
      setActiveModelId(id);
      return;
    }
    setPendingModelId(id);
  };

  const confirmModelSwitch = () => {
    if (!pendingModelId) return;
    const target = pendingModelId;
    setPendingModelId(null);
    reindexRequestedRef.current = true;
    // Old-space embeddings are invalid until re-embedded: mark everything
    // processing so search/duplicates stay disabled during the re-index.
    setPhotos((prev) => prev.map((p) => ({ ...p, processing: true })));
    setActiveModelId(target);
  };

  const cancelModelSwitch = () => setPendingModelId(null);

  // Runs after a confirmed switch (activeModelId changed + flag set): re-embed
  // and re-categorize the whole library through the NEW model with progress.
  useEffect(() => {
    if (!reindexRequestedRef.current) return;
    reindexRequestedRef.current = false;

    const controller = new AbortController();
    reindexAbortRef.current = controller;
    setSwitching(true);
    setBusy(true);
    setError(null);
    void (async () => {
      try {
        await processEntries(photosRef.current, controller, setReindexProgress);
      } catch (err) {
        if (!controller.signal.aborted) setError(toMessage(err));
      } finally {
        setSwitching(false);
        setBusy(false);
        setReindexProgress(null);
        reindexAbortRef.current = null;
      }
    })();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeModelId]);

  // ── delete / clear ──
  const removeByPredicate = (keep: (p: PhotoEntry) => boolean) => {
    setPhotos((prev) => {
      const next = prev.filter(keep);
      const counts = computeSimilarCounts(next);
      return next.map((p) => ({ ...p, similarCount: counts.get(p.id) ?? 0 }));
    });
  };
  const deletePhoto = (id: string) => removeByPredicate((p) => p.id !== id);
  const deletePhotos = (ids: Set<string>) => removeByPredicate((p) => !ids.has(p.id));

  const clearAll = () => {
    ingestAbortRef.current?.abort();
    reindexAbortRef.current?.abort();
    recategorizeAbortRef.current?.abort();
    searchAbortRef.current?.abort();
    setPhotos([]);
    setError(null);
    setRejection(null);
    setIngestProgress(null);
    setReindexProgress(null);
    setRecategorizeProgress(null);
    setSwitching(false);
    setBusy(false);
  };

  const getPhoto = (id: string) => photosRef.current.find((p) => p.id === id);

  // ── search ──
  const searchByText = async (query: string): Promise<RankedHit[]> => {
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    await loadRef.current();
    const model = embedModelRef.current;
    if (!model) throw new Error('Model not loaded');
    const { embedding } = await embed({ model, value: query, abortSignal: controller.signal });
    return rankByEmbedding(embedding, photosRef.current, topK, minSimilarity);
  };

  const searchByImage = async (dataUrl: string): Promise<RankedHit[]> => {
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    await loadRef.current();
    const model = embedModelRef.current;
    if (!model) throw new Error('Model not loaded');
    const { embedding } = await embedImage({ model, image: dataUrl, abortSignal: controller.signal });
    return rankByEmbedding(embedding, photosRef.current, topK, minSimilarity);
  };

  // ── labels / categorization ──
  const addLabel = (label: string) => {
    setLabels((prev) => (prev.includes(label) ? prev : [...prev, label]));
    setActivePreset('custom');
  };
  const removeLabel = (index: number) => {
    setLabels((prev) => prev.filter((_, i) => i !== index));
    setActivePreset('custom');
  };
  const applyPreset = (id: string) => {
    const preset = labelPresets[id];
    if (!preset) return;
    setLabels(preset.labels);
    setActivePreset(id);
  };

  const recategorize = async () => {
    const target = photosRef.current.filter((p) => p.embedding !== null);
    if (target.length === 0) return;
    const controller = new AbortController();
    recategorizeAbortRef.current = controller;
    setBusy(true);
    setError(null);
    setRecategorizeProgress({ completed: 0, total: target.length });
    try {
      const zeroShot = getZeroShot();
      let done = 0;
      for (const entry of target) {
        if (controller.signal.aborted) break;
        let category = fallbackLabel;
        let confidence = fallbackConfidence;
        try {
          const { labels: outLabels, scores } = await classifyImageZeroShot({
            model: zeroShot,
            image: entry.src,
            candidateLabels: labelsRef.current,
            abortSignal: controller.signal,
          });
          category = outLabels[0] ?? fallbackLabel;
          confidence = scores[0] ?? fallbackConfidence;
        } catch (err) {
          if (controller.signal.aborted) break;
        }
        setPhotos((prev) => prev.map((p) => (p.id === entry.id ? { ...p, category, confidence } : p)));
        done += 1;
        setRecategorizeProgress({ completed: done, total: target.length });
      }
    } catch (err) {
      if (!controller.signal.aborted) setError(toMessage(err));
    } finally {
      setBusy(false);
      setRecategorizeProgress(null);
      recategorizeAbortRef.current = null;
    }
  };

  const cancelRecategorize = () => recategorizeAbortRef.current?.abort();

  return {
    activeModelId,
    modelStatus: modelLoad.status,
    modelProgress: modelLoad.progress,
    modelProgressValue: modelLoad.progressValue,
    modelCached: modelLoad.cached,
    modelReady: modelLoad.status === 'ready',
    loadModel: () => loadRef.current(),
    requestModel,
    pendingModelId,
    confirmModelSwitch,
    cancelModelSwitch,

    photos,
    ingest,
    ingestProgress,
    cancelIngest,
    rejection,
    setRejection,
    deletePhoto,
    deletePhotos,
    clearAll,
    getPhoto,

    topK,
    setTopK,
    minSimilarity,
    searchByText,
    searchByImage,

    labels,
    activePreset,
    addLabel,
    removeLabel,
    applyPreset,
    recategorize,
    recategorizeProgress,
    cancelRecategorize,

    switching,
    reindexProgress,

    batchInfo,

    busy,
    error: error ?? modelLoad.error?.message ?? null,
    clearError: () => setError(null),
  };
}
