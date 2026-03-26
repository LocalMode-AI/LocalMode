/**
 * @file gallery.service.ts
 * @description Service for smart gallery operations using @localmode/core and @localmode/transformers
 *
 * Manages singleton model instances and a shared VectorDB. The upload flow is
 * driven by useBatchOperation from @localmode/react, which handles concurrent
 * processing with a shared AbortSignal and per-item progress tracking.
 *
 * @see _hooks/use-gallery.ts for the batch processing orchestration
 */
import { extractImageFeatures, classifyImageZeroShot, embed, createVectorDB } from '@localmode/core';
import type { VectorDB, SearchResult as VectorSearchResult } from '@localmode/core';
import type { ImageFeatureModel, ZeroShotImageClassificationModel, EmbeddingModel } from '@localmode/core';
import { transformers } from '@localmode/transformers';
import {
  MODEL_ID,
  DB_NAME,
  EMBEDDING_DIMENSIONS,
  DEFAULT_TOP_K,
  CATEGORIES,
} from '../_lib/constants';
import type { GalleryPhoto, SearchResult } from '../_lib/types';

/** Singleton image feature model instance (CLIP image encoder) */
let imageFeatureModel: ImageFeatureModel | null = null;

/** Singleton zero-shot image classification model instance */
let zeroShotModel: ZeroShotImageClassificationModel | null = null;

/** Singleton text embedding model instance (CLIP text encoder) */
let textEmbeddingModel: EmbeddingModel | null = null;

/** Singleton VectorDB instance */
let vectorDB: VectorDB | null = null;

/** In-memory photo metadata store */
const photoStore = new Map<string, GalleryPhoto>();

/**
 * Get or create the image feature model singleton (CLIP image encoder)
 */
function getImageFeatureModel() {
  if (!imageFeatureModel) {
    imageFeatureModel = transformers.imageFeatures(MODEL_ID);
  }
  return imageFeatureModel;
}

/**
 * Get or create the zero-shot classification model singleton
 */
function getZeroShotModel() {
  if (!zeroShotModel) {
    zeroShotModel = transformers.zeroShotImageClassifier(MODEL_ID);
  }
  return zeroShotModel;
}

/**
 * Get or create the text embedding model singleton (CLIP text encoder)
 */
function getTextEmbeddingModel() {
  if (!textEmbeddingModel) {
    textEmbeddingModel = transformers.embedding(MODEL_ID);
  }
  return textEmbeddingModel;
}

/**
 * Get or create the VectorDB singleton
 */
async function getVectorDB() {
  if (!vectorDB) {
    vectorDB = await createVectorDB({
      name: DB_NAME,
      dimensions: EMBEDDING_DIMENSIONS,
      storage: 'memory',
    });
  }
  return vectorDB;
}

/**
 * Classify a photo into a category using zero-shot image classification
 * @param imageData - Image data as a data URL string
 * @param signal - Optional AbortSignal for cancellation
 * @returns The top predicted label and its confidence score
 */
export async function classifyPhoto(
  imageData: string,
  signal?: AbortSignal
): Promise<{ label: string; score: number }> {
  const model = getZeroShotModel();

  const { labels, scores } = await classifyImageZeroShot({
    model,
    image: imageData,
    candidateLabels: [...CATEGORIES],
    abortSignal: signal,
  });

  return {
    label: labels[0],
    score: scores[0],
  };
}

/**
 * Extract image features and index a photo in the vector database
 * @param photo - The gallery photo to index
 * @param signal - Optional AbortSignal for cancellation
 */
export async function indexPhoto(photo: GalleryPhoto, signal?: AbortSignal) {
  const model = getImageFeatureModel();
  const db = await getVectorDB();

  // Extract CLIP image features
  const { features } = await extractImageFeatures({
    model,
    image: photo.dataUrl,
    abortSignal: signal,
  });

  // Add to VectorDB
  await db.add({
    id: photo.id,
    vector: features,
    metadata: {
      fileName: photo.fileName,
      category: photo.category,
    },
  });

  // Store photo metadata
  photoStore.set(photo.id, photo);
}

/**
 * Search photos by text query using CLIP text embeddings
 * @param query - Text search query
 * @param topK - Number of results to return
 * @param signal - Optional AbortSignal for cancellation
 * @returns Array of search results with scores
 */
export async function searchByText(
  query: string,
  topK: number = DEFAULT_TOP_K,
  signal?: AbortSignal
): Promise<SearchResult[]> {
  const model = getTextEmbeddingModel();
  const db = await getVectorDB();

  // Embed the text query using CLIP text encoder
  const { embedding } = await embed({
    model,
    value: query,
    abortSignal: signal,
  });

  // Search VectorDB for similar image features
  const results: VectorSearchResult[] = await db.search(embedding, { k: topK });

  // Map results to SearchResult with photo metadata
  return results
    .map((result) => {
      const photo = photoStore.get(result.id);
      if (!photo) return null;
      return {
        photo,
        score: result.score,
      };
    })
    .filter((r): r is SearchResult => r !== null);
}

/**
 * Remove a photo from the vector database and metadata store
 * @param id - Photo ID to remove
 */
export async function removePhoto(id: string) {
  const db = await getVectorDB();
  await db.delete(id);
  photoStore.delete(id);
}

/**
 * Clear all photos from the vector database and metadata store
 */
export async function clearAll() {
  const db = await getVectorDB();
  await db.clear();
  photoStore.clear();
}
