/**
 * @file search.service.ts
 * @description Service for product search operations using CLIP image features and VectorDB
 *
 * This service manages three singleton model instances (ImageFeatureModel,
 * ZeroShotImageClassificationModel, EmbeddingModel), a VectorDB, and
 * in-memory metadata/vector stores. The stateful singleton pattern is
 * required because CLIP models share weights across image features, text
 * embedding, and zero-shot classification, and the VectorDB + metadata
 * stores must persist across hook re-renders.
 *
 * Text search has been migrated to `useSemanticSearch` from `@localmode/react`
 * in the hook layer (see use-product-search.ts). The service still exposes
 * `getTextEmbeddingModel()` and `getVectorDB()` so the hook can pass them to
 * the React hook. All other operations (upload pipeline, image search,
 * delete, clear) remain here because they involve batch processing, cross-modal
 * CLIP feature extraction, or VectorDB mutations that do not map to a single
 * React hook call.
 */
import { extractImageFeatures, classifyImageZeroShot, createVectorDB, embed, computeOptimalBatchSize, getDefaultThreshold } from '@localmode/core';
import type { VectorDB, SearchResult as VectorSearchResult, EmbeddingModel, BatchSizeResult } from '@localmode/core';
import type { ImageFeatureModel, ZeroShotImageClassificationModel } from '@localmode/core';
import { transformers } from '@localmode/transformers';
import { MODEL_ID, DB_NAME, EMBEDDING_DIMENSIONS, DEFAULT_TOP_K, CATEGORIES, CLIP_SIMILARITY_THRESHOLD } from '../_lib/constants';
import type { Product, SearchResult } from '../_lib/types';

/** Singleton CLIP image feature model instance */
let imageFeatureModel: ImageFeatureModel | null = null;

/** Singleton CLIP zero-shot classification model instance */
let zeroShotModel: ZeroShotImageClassificationModel | null = null;

/** Singleton text embedding model (CLIP text encoder) */
let textEmbeddingModel: EmbeddingModel | null = null;

/** Singleton VectorDB instance */
let vectorDB: VectorDB | null = null;

/** In-memory product store for metadata retrieval */
const productStore = new Map<string, Product>();

/** In-memory vector store for similarity lookups */
const vectorStore = new Map<string, Float32Array>();

/**
 * Get or create the image feature model singleton
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
 * Get or create the text embedding model singleton (CLIP text encoder).
 * Exported for use by `useSemanticSearch` in the hook layer.
 */
export function getTextEmbeddingModel() {
  if (!textEmbeddingModel) {
    textEmbeddingModel = transformers.embedding(MODEL_ID);
  }
  return textEmbeddingModel;
}

/**
 * Get or create the VectorDB singleton.
 * Exported for use by `useSemanticSearch` in the hook layer.
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
 * Index a product in the vector database by extracting CLIP image features
 * @param product - The product to index
 * @param imageData - Base64 data URL of the product image
 * @param signal - Optional AbortSignal for cancellation
 */
export async function indexProduct(product: Product, imageData: string, signal?: AbortSignal) {
  signal?.throwIfAborted();

  const model = getImageFeatureModel();
  const db = await getVectorDB();

  // Extract CLIP image features
  const { features } = await extractImageFeatures({
    model,
    image: imageData,
    abortSignal: signal,
  });

  // Add to VectorDB with metadata
  await db.add({
    id: product.id,
    vector: features,
    metadata: {
      fileName: product.fileName,
      category: product.category,
      categoryScore: product.categoryScore,
    },
  });

  // Store product and vector in memory for retrieval
  productStore.set(product.id, product);
  vectorStore.set(product.id, features);
}

/**
 * Classify a product image into a category using zero-shot classification
 * @param imageData - Base64 data URL of the product image
 * @param signal - Optional AbortSignal for cancellation
 * @returns The top category label and its confidence score
 */
export async function classifyProduct(
  imageData: string,
  signal?: AbortSignal
): Promise<{ label: string; score: number }> {
  signal?.throwIfAborted();

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
 * Search for visually similar products using an image query
 * @param imageData - Base64 data URL of the query image
 * @param topK - Number of results to return
 * @param signal - Optional AbortSignal for cancellation
 */
export async function searchByImage(
  imageData: string,
  topK: number = DEFAULT_TOP_K,
  signal?: AbortSignal
): Promise<SearchResult[]> {
  signal?.throwIfAborted();

  const model = getImageFeatureModel();
  const db = await getVectorDB();

  // Extract features from the query image
  const { features } = await extractImageFeatures({
    model,
    image: imageData,
    abortSignal: signal,
  });

  // Search VectorDB for similar products
  const results: VectorSearchResult[] = await db.search(features, { k: topK });

  // Map results to SearchResult with product data
  return results
    .map((result) => {
      const product = productStore.get(result.id);
      if (!product) return null;
      return {
        product,
        score: result.score,
      };
    })
    .filter((r): r is SearchResult => r !== null);
}

/**
 * Search for products using a text query via CLIP text-image alignment.
 *
 * Note: The hook layer now delegates text search to `useSemanticSearch` from
 * `@localmode/react` (which calls `getTextEmbeddingModel()` + VectorDB proxy
 * directly). This function is retained for non-hook callers or testing.
 *
 * @param query - Text search query
 * @param topK - Number of results to return
 * @param signal - Optional AbortSignal for cancellation
 */
export async function searchByText(
  query: string,
  topK: number = DEFAULT_TOP_K,
  signal?: AbortSignal
): Promise<SearchResult[]> {
  signal?.throwIfAborted();

  const model = getTextEmbeddingModel();
  const db = await getVectorDB();

  // Embed the text query using CLIP text encoder (same embedding space as image features)
  const { embedding } = await embed({
    model,
    value: query,
    abortSignal: signal,
  });

  // Search VectorDB
  const results: VectorSearchResult[] = await db.search(embedding, { k: topK });

  // Map results to SearchResult with product data
  return results
    .map((result) => {
      const product = productStore.get(result.id);
      if (!product) return null;
      return {
        product,
        score: result.score,
      };
    })
    .filter((r): r is SearchResult => r !== null);
}

/**
 * Remove a product from the vector database
 * @param id - Product ID to remove
 */
export async function removeProduct(id: string) {
  const db = await getVectorDB();
  await db.delete(id);
  productStore.delete(id);
  vectorStore.delete(id);
}

/**
 * Clear all products from the vector database
 */
export async function clearAll() {
  const db = await getVectorDB();
  await db.clear();
  productStore.clear();
  vectorStore.clear();
}

/**
 * Get the count of visually similar products for a given product
 * @param id - Product ID to find similar items for
 * @returns Number of similar items (score > 0.7)
 */
export async function getSimilarCount(id: string): Promise<number> {
  const db = await getVectorDB();
  const vector = vectorStore.get(id);
  if (!vector) return 0;

  // Search for similar products using the stored vector
  const results: VectorSearchResult[] = await db.search(vector, { k: 20 });

  // Count results with high similarity (score > 0.7), excluding self
  return results.filter((r) => r.id !== id && r.score > 0.7).length;
}

/**
 * Get a product by ID from the in-memory store
 * @param id - Product ID
 */
export function getProduct(id: string) {
  return productStore.get(id);
}

/**
 * Get total number of indexed products
 */
export function getProductCount() {
  return productStore.size;
}

/**
 * Compute device-adaptive batch info for the CLIP ingestion pipeline.
 *
 * Calls `computeOptimalBatchSize()` from `@localmode/core` with the CLIP
 * model's dimensions and an `ingestion` task type. The result includes the
 * computed batch size, device profile, and human-readable reasoning.
 *
 * @returns BatchSizeResult with batchSize, reasoning, and deviceProfile
 */
export function getDeviceBatchInfo(): BatchSizeResult {
  return computeOptimalBatchSize({
    taskType: 'ingestion',
    modelDimensions: EMBEDDING_DIMENSIONS,
  });
}

/**
 * Get the similarity threshold for search result filtering.
 *
 * Looks up the model in `@localmode/core`'s threshold presets first. If
 * the model is not found (SigLIP is not in the preset map), falls back
 * to `CLIP_SIMILARITY_THRESHOLD` (0.2), which is tuned for cross-modal
 * CLIP/SigLIP similarity scores.
 *
 * @returns A similarity threshold between 0 and 1
 */
export function getSearchThreshold(): number {
  return getDefaultThreshold(MODEL_ID) ?? CLIP_SIMILARITY_THRESHOLD;
}
