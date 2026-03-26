/**
 * @file use-product-search.ts
 * @description Hook for managing product search interactions.
 *
 * - Upload pipeline delegates to `useBatchOperation` from `@localmode/react`.
 * - Text search delegates to `useSemanticSearch` from `@localmode/react`.
 * - Image search uses the service layer directly.
 * - Pure data helpers are delegated to _lib/utils.ts.
 */
'use client';

import { useRef, useState, useEffect } from 'react';
import { useSemanticSearch, useBatchOperation, readFileAsDataUrl } from '@localmode/react';
import type { SemanticSearchDB, VectorDB } from '@localmode/core';
import {
  indexProduct as indexProductService,
  classifyProduct,
  getTextEmbeddingModel,
  getVectorDB,
  getProduct,
  searchByImage as searchByImageService,
  removeProduct as removeProductService,
  clearAll as clearAllService,
  getDeviceBatchInfo,
  getSearchThreshold,
} from '../_services/search.service';
import { getFilteredProducts, getCategoryCounts } from '../_lib/utils';
import { ACCEPTED_IMAGE_TYPES, DEFAULT_TOP_K } from '../_lib/constants';
import type { Product, SearchResult, AppError, BatchInfo } from '../_lib/types';

/**
 * Lazy proxy that satisfies SemanticSearchDB.
 * Delegates to the real VectorDB once it is initialised.
 */
function createLazyDBProxy(dbRef: { current: VectorDB | null }): SemanticSearchDB {
  return {
    async search(vector, options) {
      if (!dbRef.current) {
        throw new Error('VectorDB is not initialised yet');
      }
      return dbRef.current.search(vector, { k: options?.k });
    },
  };
}

/** Hook for product search operations */
export function useProductSearch() {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  // -- Adaptive batching and threshold ------------------------------------------
  const [batchInfo] = useState<BatchInfo>(() => {
    try {
      const result = getDeviceBatchInfo();
      return {
        batchSize: result.batchSize,
        deviceProfile: result.deviceProfile,
        reasoning: result.reasoning,
      };
    } catch {
      return {
        batchSize: 64,
        deviceProfile: { cores: 4, memoryGB: 8, hasGPU: false, source: 'fallback' as const },
        reasoning: 'Using default batch size (device detection unavailable)',
      };
    }
  });

  const [threshold] = useState<number>(() => getSearchThreshold());

  const imageSearchControllerRef = useRef<AbortController | null>(null);
  const setProductsRef = useRef(setProducts);
  setProductsRef.current = setProducts;

  // -- Initialise VectorDB proxy for useSemanticSearch -------------------------
  const dbRef = useRef<VectorDB | null>(null);
  const [proxyDB] = useState(() => createLazyDBProxy(dbRef));

  useEffect(() => {
    let cancelled = false;
    getVectorDB().then((db) => {
      if (!cancelled) dbRef.current = db;
    });
    return () => { cancelled = true; };
  }, []);

  /** Clear error state */
  const clearError = () => setError(null);

  // -- Delegate upload pipeline to @localmode/react ----------------------------
  const uploadBatch = useBatchOperation<File, Product>({
    fn: async (file, signal) => {
      if (!ACCEPTED_IMAGE_TYPES.includes(file.type as (typeof ACCEPTED_IMAGE_TYPES)[number])) {
        throw new Error(`Unsupported file type: ${file.type}`);
      }

      const dataUrl = await readFileAsDataUrl(file);
      signal.throwIfAborted();

      const { label, score } = await classifyProduct(dataUrl, signal);

      const product: Product = {
        id: crypto.randomUUID(),
        dataUrl,
        fileName: file.name,
        category: label,
        categoryScore: score,
        similarCount: 0,
      };

      await indexProductService(product, dataUrl, signal);
      setProductsRef.current((prev) => [...prev, product]);

      return product;
    },
    concurrency: 1,
  });

  // Surface per-item failures as an error when the batch finishes
  useEffect(() => {
    if (uploadBatch.isRunning || !uploadBatch.progress) return;

    const nonAbortFailures = uploadBatch.results
      .filter((r) => r.error !== null)
      .filter((r) => r.error?.message !== 'Aborted');

    if (nonAbortFailures.length > 0) {
      setError({ message: 'Failed to process some images. Please try again.', code: 'UPLOAD_FAILED', recoverable: true });
    }
  }, [uploadBatch.isRunning, uploadBatch.results, uploadBatch.progress]);

  // -- Delegate text search to @localmode/react --------------------------------
  const textModel = getTextEmbeddingModel();

  const {
    results: reactResults,
    isSearching: reactIsSearching,
    error: reactError,
    search: reactSearch,
    reset: reactReset,
  } = useSemanticSearch({ model: textModel, db: proxyDB, topK: DEFAULT_TOP_K });

  // Sync react hook search state
  useEffect(() => { setIsSearching(reactIsSearching); }, [reactIsSearching]);

  useEffect(() => {
    if (reactError) {
      setError({ message: 'Search failed. Please try again.', code: 'SEARCH_FAILED', recoverable: true });
    }
  }, [reactError]);

  useEffect(() => {
    const mapped = reactResults
      .map((r) => {
        const product = getProduct(r.id);
        if (!product) return null;
        return { product, score: r.score };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .filter((r) => r.score >= threshold);
    setSearchResults(mapped);
  }, [reactResults, threshold]);

  /** Cancel any in-progress operation */
  const cancel = () => {
    uploadBatch.cancel();
    if (imageSearchControllerRef.current) {
      imageSearchControllerRef.current.abort();
      imageSearchControllerRef.current = null;
    }
  };

  /** Upload and index multiple product images */
  const uploadProducts = async (files: File[]) => {
    clearError();
    await uploadBatch.execute(files);
  };

  /** Search products by text query */
  const searchProducts = async (query: string) => {
    if (!query.trim()) {
      reactReset();
      return;
    }
    clearError();
    await reactSearch(query);
  };

  /** Search products by image similarity */
  const searchByImage = async (file: File) => {
    if (imageSearchControllerRef.current) imageSearchControllerRef.current.abort();
    const controller = new AbortController();
    imageSearchControllerRef.current = controller;

    clearError();
    setIsSearching(true);

    try {
      const dataUrl = await readFileAsDataUrl(file);
      const results = await searchByImageService(dataUrl, undefined, controller.signal);
      setSearchResults(results.filter((r) => r.score >= threshold));
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      console.error('Image search failed:', err);
      setError({ message: 'Image search failed. Please try again.', code: 'IMAGE_SEARCH_FAILED', recoverable: true });
    } finally {
      setIsSearching(false);
      if (imageSearchControllerRef.current === controller) imageSearchControllerRef.current = null;
    }
  };

  /** Delete a product by ID */
  const deleteProduct = async (id: string) => {
    clearError();
    try {
      await removeProductService(id);
      setProducts((prev) => prev.filter((p) => p.id !== id));
      setSearchResults((prev) => prev.filter((r) => r.product.id !== id));
    } catch (err) {
      console.error('Failed to delete product:', err);
      setError({ message: 'Failed to delete product. Please try again.', code: 'DELETE_FAILED', recoverable: true });
    }
  };

  /** Clear all products and search results */
  const clearAllProducts = async () => {
    cancel();
    uploadBatch.reset();
    reactReset();
    clearError();

    try {
      await clearAllService();
      setProducts([]);
      setSearchQuery('');
      setSelectedCategory(null);
      setSearchResults([]);
      setError(null);
    } catch (err) {
      console.error('Failed to clear products:', err);
      setError({ message: 'Failed to clear products. Please try again.', code: 'CLEAR_FAILED', recoverable: true });
    }
  };

  return {
    // State
    products,
    searchQuery,
    selectedCategory,
    viewMode,
    searchResults,
    isProcessing: uploadBatch.isRunning,
    isSearching,
    error,
    batchInfo,
    threshold,
    // Actions
    uploadProducts,
    searchProducts,
    searchByImage,
    deleteProduct,
    clearAllProducts,
    cancel,
    setSearchQuery,
    setSelectedCategory,
    setViewMode,
    setSearchResults,
    clearError,
    // Derived state
    getFilteredProducts: () => getFilteredProducts(products, selectedCategory),
    getCategoryCounts: () => getCategoryCounts(products),
  };
}
