/**
 * @file use-semantic-search.ts
 * @description Hook combining embedding and vector DB search
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import type { SemanticSearchResultItem } from '@localmode/core';
import type { UseSemanticSearchOptions, UseSemanticSearchReturn } from '../core/types.js';

const IS_SERVER = typeof window === 'undefined';

/**
 * Hook for semantic search — embeds a query and searches a vector DB.
 *
 * @param options - Model, database, and search configuration
 * @returns Search state with results and search() function
 *
 * @example
 * ```tsx
 * const { results, isSearching, search } = useSemanticSearch({
 *   model: transformers.embedding('Xenova/all-MiniLM-L6-v2'),
 *   db: vectorDB,
 *   topK: 10,
 * });
 * await search('find documents about privacy');
 * ```
 */
export function useSemanticSearch(options: UseSemanticSearchOptions): UseSemanticSearchReturn {
  const { model, db, topK = 10 } = options;

  const [results, setResults] = useState<UseSemanticSearchReturn['results']>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  const search = useCallback(async (query: string): Promise<void> => {
    if (IS_SERVER || !query.trim()) {
      setResults([]);
      return;
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setError(null);
    setIsSearching(true);

    try {
      const { semanticSearch } = await import('@localmode/core');
      const searchResult = await semanticSearch({
        model,
        db,
        query,
        k: topK,
        abortSignal: controller.signal,
      });

      if (mountedRef.current && !controller.signal.aborted) {
        setResults(
          searchResult.results.map((item: SemanticSearchResultItem) => ({
            id: item.id,
            content: item.text ?? '',
            metadata: item.metadata ?? {},
            score: item.score,
          }))
        );
        setIsSearching(false);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      if (err instanceof Error && err.name === 'AbortError') {
        setIsSearching(false);
        return;
      }
      setError(err instanceof Error ? err : new Error(String(err)));
      setIsSearching(false);
    }
  }, [model, db, topK]);

  const reset = useCallback(() => {
    abortControllerRef.current?.abort();
    setResults([]);
    setError(null);
    setIsSearching(false);
  }, []);

  if (IS_SERVER) {
    return { results: [], isSearching: false, error: null, search: async () => {}, reset: () => {} };
  }

  return { results, isSearching, error, search, reset };
}
