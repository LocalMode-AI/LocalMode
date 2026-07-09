/**
 * @file use-photo-library.test.ts
 * @description Tests for the shared photo-library hook against the REAL
 * `@localmode/core` embed / search / rank / stream call paths. Only the models
 * are injected — deterministic multimodal embedding + zero-shot classifier mocks
 * whose vectors are fully controlled by each fixture's bytes — so ingest,
 * search, dedup, categorize, and the model-switch re-index all run through their
 * production code paths (real `streamEmbedManyImages`, real `embed`/`embedImage`,
 * real `cosineSimilarity` ranking / union-find). Real File/FileReader/atob come
 * from jsdom; real transformers download is a documented gap covered by the
 * photo-search E2E.
 */

import { describe, it, expect } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type {
  MultimodalEmbeddingModel,
  ZeroShotImageClassificationModel,
} from '@localmode/core';
import {
  usePhotoLibrary,
  groupDuplicates,
  type UsePhotoLibraryOptions,
} from '../src/hooks/use-photo-library.js';

/* ──────────────────────────── deterministic fixtures ─────────────────────── */
// Each "image" is a File whose bytes encode the exact embedding vector we want,
// so the REAL embed/stream/rank paths run over vectors we control.

const DIM = 4;

/** A fixture image file whose decoded embedding is exactly `vec`. */
function conceptFile(name: string, vec: number[]): File {
  return new File([JSON.stringify({ vec })], name, { type: 'image/png' });
}

/** The data URL a `conceptFile` would produce (for image→image search inputs). */
function conceptDataUrl(vec: number[]): string {
  const json = JSON.stringify({ vec });
  return `data:image/png;base64,${btoa(json)}`;
}

/** Decode the vector a data URL fixture encodes. */
function decodeVec(dataUrl: string): Float32Array {
  const b64 = dataUrl.split(',')[1] ?? '';
  const { vec } = JSON.parse(atob(b64)) as { vec: number[] };
  return new Float32Array(vec);
}

/** Text query → vector. `vec:1,0,0,0` → [1,0,0,0]; anything else → a warmup vec. */
function textVec(value: string): Float32Array {
  if (value.startsWith('vec:')) {
    return new Float32Array(value.slice(4).split(',').map(Number));
  }
  return new Float32Array([0, 0, 0, 1]);
}

function argmax(v: Float32Array): number {
  let best = 0;
  for (let i = 1; i < v.length; i++) if (v[i] > v[best]) best = i;
  return best;
}

/**
 * Deterministic multimodal model. Model ids containing `B` REVERSE the decoded
 * image vector, so a model switch produces observably different embeddings —
 * proving the re-index actually re-embeds.
 */
function makeEmbeddingModel(id: string): MultimodalEmbeddingModel {
  const reverse = id.includes('B');
  const transform = (v: Float32Array) =>
    reverse ? new Float32Array([...v].reverse()) : v;
  return {
    modelId: id,
    provider: 'mock',
    dimensions: DIM,
    maxEmbeddingsPerCall: 100,
    supportsParallelCalls: true,
    supportedModalities: ['text', 'image'],
    async doEmbed({ values }: { values: string[] }) {
      return {
        embeddings: values.map((v) => transform(textVec(v))),
        usage: { tokens: values.length },
        response: { id: 'mock', modelId: id, timestamp: new Date() },
      };
    },
    async doEmbedImage({ images }: { images: Array<string | Blob | ImageData | ArrayBuffer> }) {
      return {
        embeddings: images.map((img) => transform(decodeVec(String(img)))),
        usage: { tokens: images.length },
        response: { id: 'mock', modelId: id, timestamp: new Date() },
      };
    },
  } as unknown as MultimodalEmbeddingModel;
}

/**
 * Deterministic zero-shot classifier: the decoded vector's argmax index selects
 * a label from the candidate set, so a label-set change deterministically
 * changes the category.
 */
function makeZeroShotModel(id: string): ZeroShotImageClassificationModel {
  return {
    modelId: id,
    provider: 'mock',
    async doClassifyZeroShot({
      images,
      candidateLabels,
    }: {
      images: Array<string | Blob | ImageData | ArrayBuffer>;
      candidateLabels: string[];
    }) {
      return {
        results: images.map((img) => {
          const idx = argmax(decodeVec(String(img))) % candidateLabels.length;
          const ordered = [
            candidateLabels[idx],
            ...candidateLabels.filter((_, i) => i !== idx),
          ];
          const scores = ordered.map((_, i) => (i === 0 ? 0.9 : 0.1 / ordered.length));
          return { labels: ordered, scores };
        }),
        usage: { tokens: images.length },
      };
    },
  } as unknown as ZeroShotImageClassificationModel;
}

// `useModelLoad`'s registry is module-level and keyed by `photo-search:${id}`;
// a UNIQUE model id per test keeps the shared-registry singleton from bleeding
// a prior test's loaded model into the next (mirrors use-model-load.test.ts).
let idCounter = 0;
function freshModelId(variant: 'A' | 'B' = 'A'): string {
  idCounter += 1;
  return `mock:clip-${variant}-${idCounter}`;
}

/** Base options wiring the deterministic injected models. */
function baseOptions(overrides: Partial<UsePhotoLibraryOptions> = {}): UsePhotoLibraryOptions {
  return {
    modelId: freshModelId('A'),
    createEmbeddingModel: (id) => makeEmbeddingModel(id),
    createZeroShotClassifier: (id) => makeZeroShotModel(id),
    labelPresets: {
      photo: { labels: ['red', 'green', 'blue', 'other'] },
      product: { labels: ['crimson', 'emerald', 'azure', 'misc'] },
    },
    getModelDimensions: () => DIM,
    minSimilarityFallback: 0.2,
    ...overrides,
  };
}

/* ───────────────────────────────── tests ─────────────────────────────────── */

describe('usePhotoLibrary', () => {
  it('ingest embeds and categorizes progressively; the index holds N embedded entries', async () => {
    const { result } = renderHook(() => usePhotoLibrary(baseOptions()));

    const files = [
      conceptFile('a.png', [1, 0, 0, 0]),
      conceptFile('b.png', [0, 1, 0, 0]),
      conceptFile('c.png', [0, 0, 1, 0]),
    ];

    await act(async () => {
      await result.current.ingest(files);
    });

    // Witness 1: the photos array holds N fully-embedded, categorized entries.
    expect(result.current.photos).toHaveLength(3);
    for (const p of result.current.photos) {
      expect(p.embedding).not.toBeNull();
      expect(p.embedding!.length).toBe(DIM);
      expect(p.processing).toBe(false);
    }
    // argmax([1,0,0,0])=0 → 'red'; [0,1,0,0]=1 → 'green'; [0,0,1,0]=2 → 'blue'.
    expect(result.current.photos.map((p) => p.category)).toEqual(['red', 'green', 'blue']);
    expect(result.current.busy).toBe(false);
    expect(result.current.error).toBeNull();

    // Witness 2: the shared index answers a real search (proves embeddings landed).
    let hits!: Awaited<ReturnType<typeof result.current.searchByText>>;
    await act(async () => {
      hits = await result.current.searchByText('vec:1,0,0,0');
    });
    expect(hits[0]?.id).toBe(result.current.photos[0].id);
  });

  it('searchByText and searchByImage share one vector space and apply the min-similarity threshold', async () => {
    const { result } = renderHook(() => usePhotoLibrary(baseOptions()));
    await act(async () => {
      await result.current.ingest([
        conceptFile('a.png', [1, 0, 0, 0]),
        conceptFile('b.png', [0, 1, 0, 0]), // orthogonal → cosine 0, below 0.2
      ]);
    });
    const [a, b] = result.current.photos;

    // text → image
    let textHits!: Awaited<ReturnType<typeof result.current.searchByText>>;
    await act(async () => {
      textHits = await result.current.searchByText('vec:1,0,0,0');
    });
    // Only `a` clears the 0.2 threshold; `b` is orthogonal and excluded.
    expect(textHits).toHaveLength(1);
    expect(textHits[0].id).toBe(a.id);
    expect(textHits[0].score).toBeCloseTo(1, 5);

    // image → image over the SAME space
    let imgHits!: Awaited<ReturnType<typeof result.current.searchByImage>>;
    await act(async () => {
      imgHits = await result.current.searchByImage(conceptDataUrl([0, 1, 0, 0]));
    });
    expect(imgHits).toHaveLength(1);
    expect(imgHits[0].id).toBe(b.id);
    expect(imgHits[0].score).toBeCloseTo(1, 5);
  });

  it('groups near-duplicate photos via real union-find over the hook-produced embeddings', async () => {
    const { result } = renderHook(() => usePhotoLibrary(baseOptions()));
    await act(async () => {
      await result.current.ingest([
        conceptFile('dup1.png', [1, 0, 0, 0]),
        conceptFile('dup2.png', [0.999, 0.001, 0, 0]), // ~1.0 cosine with dup1
        conceptFile('distinct.png', [0, 1, 0, 0]),
      ]);
    });

    const groups = groupDuplicates(result.current.photos, 0.9);
    expect(groups).toHaveLength(1);
    const ids = new Set(groups[0].photos.map((p) => p.id));
    expect(ids.has(result.current.photos[0].id)).toBe(true);
    expect(ids.has(result.current.photos[1].id)).toBe(true);
    expect(ids.has(result.current.photos[2].id)).toBe(false);
    expect(groups[0].similarity).toBeGreaterThanOrEqual(0.9);
  });

  it('recategorize re-labels the library through the current label set', async () => {
    const { result } = renderHook(() => usePhotoLibrary(baseOptions()));
    await act(async () => {
      await result.current.ingest([
        conceptFile('a.png', [1, 0, 0, 0]),
        conceptFile('b.png', [0, 1, 0, 0]),
      ]);
    });
    expect(result.current.photos.map((p) => p.category)).toEqual(['red', 'green']);

    // Switch to the product preset, then recategorize the SAME library.
    act(() => {
      result.current.applyPreset('product');
    });
    expect(result.current.activePreset).toBe('product');

    await act(async () => {
      await result.current.recategorize();
    });
    // argmax unchanged (0, 1) but mapped through the new labels.
    expect(result.current.photos.map((p) => p.category)).toEqual(['crimson', 'emerald']);
  });

  it('a confirmed model switch re-indexes: every photo is re-embedded through the new model', async () => {
    const { result } = renderHook(() => usePhotoLibrary(baseOptions()));
    await act(async () => {
      await result.current.ingest([conceptFile('a.png', [1, 0, 0, 0])]);
    });
    // Model A embeds [1,0,0,0] as-is.
    expect(Array.from(result.current.photos[0].embedding!)).toEqual([1, 0, 0, 0]);

    // Non-empty library → switch is confirm-gated.
    const bId = freshModelId('B');
    act(() => {
      result.current.requestModel(bId);
    });
    expect(result.current.pendingModelId).toBe(bId);

    act(() => {
      result.current.confirmModelSwitch();
    });

    await waitFor(() => expect(result.current.switching).toBe(false));
    await waitFor(() => expect(result.current.busy).toBe(false));

    expect(result.current.activeModelId).toBe(bId);
    // Model B REVERSES the vector — proves the photo was actually re-embedded.
    expect(Array.from(result.current.photos[0].embedding!)).toEqual([0, 0, 0, 1]);
    expect(result.current.photos[0].processing).toBe(false);
  });

  it('cancel stops ingest mid-run keeping already-embedded photos usable (no error surfaced)', async () => {
    // Deterministic mid-run cancel: the classifier aborts the in-flight ingest
    // as soon as it categorizes the first image, so subsequent classify calls
    // hit the aborted signal and streaming stops.
    let result!: ReturnType<typeof renderHook<ReturnType<typeof usePhotoLibrary>, unknown>>['result'];
    let cancelled = false;
    const options = baseOptions({
      createZeroShotClassifier: () =>
        ({
          modelId: 'mock:zs',
          provider: 'mock',
          async doClassifyZeroShot({ candidateLabels }: { candidateLabels: string[] }) {
            if (!cancelled) {
              cancelled = true;
              result.current.cancelIngest();
            }
            return {
              results: [{ labels: candidateLabels, scores: candidateLabels.map(() => 0.5) }],
              usage: { tokens: 1 },
            };
          },
        }) as unknown as ZeroShotImageClassificationModel,
    });
    result = renderHook(() => usePhotoLibrary(options)).result;

    await act(async () => {
      await result.current.ingest([
        conceptFile('a.png', [1, 0, 0, 0]),
        conceptFile('b.png', [0, 1, 0, 0]),
        conceptFile('c.png', [0, 0, 1, 0]),
      ]);
    });

    // No error is surfaced for the cancellation; the thumbnails remain and the
    // first photo stays embedded/usable.
    expect(result.current.error).toBeNull();
    expect(result.current.photos.length).toBeGreaterThan(0);
    expect(result.current.photos[0].embedding).not.toBeNull();
    expect(result.current.busy).toBe(false);
  });
});
