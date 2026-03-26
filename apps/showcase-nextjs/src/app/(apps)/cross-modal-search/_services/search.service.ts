/**
 * @file search.service.ts
 * @description Service for cross-modal search operations using @localmode/core and @localmode/transformers.
 *
 * Uses a single MultimodalEmbeddingModel (CLIP) that handles both text embedding
 * (via embed()) and image embedding (via embedImage()) in the same 512-d vector space.
 * Photos are indexed in an in-memory VectorDB for session-only search.
 */
import { embed, embedImage, createVectorDB } from '@localmode/core';
import type { VectorDB, MultimodalEmbeddingModel, SearchResult as VectorSearchResult } from '@localmode/core';
import { transformers } from '@localmode/transformers';
import { MODEL_ID, DB_NAME, EMBEDDING_DIMENSIONS, DEFAULT_TOP_K } from '../_lib/constants';
import type { Photo, SearchResult } from '../_lib/types';

/** Singleton multimodal embedding model instance (CLIP) */
let clipModel: MultimodalEmbeddingModel | null = null;

/** Singleton VectorDB instance */
let vectorDB: VectorDB | null = null;

/** In-memory photo metadata store */
const photoStore = new Map<string, Photo>();

/**
 * Get or create the CLIP multimodal embedding model singleton
 */
export function getModel() {
  if (!clipModel) {
    clipModel = transformers.multimodalEmbedding(MODEL_ID);
  }
  return clipModel;
}

/**
 * Get or create the VectorDB singleton
 */
export async function getVectorDB() {
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
 * Retrieve a stored photo by ID
 * @param id - Photo ID
 */
export function getPhotoById(id: string): Photo | undefined {
  return photoStore.get(id);
}

/**
 * Embed and index a single photo in the vector database
 * @param photo - The photo to index
 * @param signal - Optional AbortSignal for cancellation
 */
export async function indexPhoto(photo: Photo, signal?: AbortSignal) {
  const model = getModel();
  const db = await getVectorDB();

  // Embed the image using CLIP
  const { embedding } = await embedImage({
    model,
    image: photo.dataUrl,
    abortSignal: signal,
  });

  // Add to VectorDB with metadata
  await db.add({
    id: photo.id,
    vector: embedding,
    metadata: {
      fileName: photo.fileName,
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
  const model = getModel();
  const db = await getVectorDB();

  // Embed text query using CLIP text encoder
  const { embedding } = await embed({
    model,
    value: query,
    abortSignal: signal,
  });

  // Search VectorDB for similar image embeddings
  const results: VectorSearchResult[] = await db.search(embedding, { k: topK });

  return mapResults(results);
}

/**
 * Search photos by reference image using CLIP image embeddings
 * @param imageDataUrl - Reference image as data URL
 * @param topK - Number of results to return
 * @param signal - Optional AbortSignal for cancellation
 * @returns Array of search results with scores
 */
export async function searchByImage(
  imageDataUrl: string,
  topK: number = DEFAULT_TOP_K,
  signal?: AbortSignal
): Promise<SearchResult[]> {
  const model = getModel();
  const db = await getVectorDB();

  // Embed reference image using CLIP image encoder
  const { embedding } = await embedImage({
    model,
    image: imageDataUrl,
    abortSignal: signal,
  });

  // Search VectorDB for similar image embeddings
  const results: VectorSearchResult[] = await db.search(embedding, { k: topK });

  return mapResults(results);
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

/**
 * Map VectorDB search results to app SearchResult shape
 * @param results - Raw VectorDB search results
 */
function mapResults(results: VectorSearchResult[]): SearchResult[] {
  return results
    .map((result) => {
      const photo = photoStore.get(result.id);
      if (!photo) return null;
      return { photo, score: result.score };
    })
    .filter((r): r is SearchResult => r !== null);
}
