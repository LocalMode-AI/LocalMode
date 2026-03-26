/**
 * Semantic Cache
 *
 * Embedding-based similarity cache for LLM responses.
 * Uses an internal VectorDB with HNSW index for fast similarity search.
 *
 * @packageDocumentation
 */

import type {
  SemanticCacheConfig,
  SemanticCache,
} from './types.js';
import type {
  LanguageModelMiddleware,
  DoGenerateResult,
  StreamChunk,
  LanguageModel,
} from '../generation/types.js';
import { createVectorDB } from '../db.js';
import type { VectorDB } from '../types.js';
import { embed } from '../embeddings/embed.js';
import { SemanticCacheError } from '../errors/index.js';
import { globalEventBus } from '../events/index.js';

/** Internal metadata stored alongside each cache entry in the VectorDB */
interface CacheEntryMetadata {
  /** The normalized prompt text */
  prompt: string;
  /** The raw (un-normalized) prompt text */
  rawPrompt: string;
  /** The cached response text */
  response: string;
  /** The model ID that generated this response */
  modelId: string;
  /** Timestamp when the entry was created */
  createdAt: number;
  /** Timestamp of the most recent access (for LRU) */
  accessedAt: number;
}

/**
 * Normalize a prompt for consistent caching.
 *
 * Trims leading/trailing whitespace, collapses consecutive
 * internal whitespace to single spaces, and converts to lowercase.
 *
 * @param prompt - The raw prompt text
 * @returns Normalized prompt text
 */
function normalizePrompt(prompt: string): string {
  return prompt.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Create a semantic cache for LLM responses.
 *
 * The cache embeds prompts using the provided embedding model, then uses
 * cosine similarity via HNSW index to find previously cached responses
 * for semantically similar prompts.
 *
 * @param config - Cache configuration
 * @returns A SemanticCache instance
 *
 * @example Basic usage
 * ```ts
 * import { createSemanticCache } from '@localmode/core';
 * import { transformers } from '@localmode/transformers';
 *
 * const cache = await createSemanticCache({
 *   embeddingModel: transformers.embedding('Xenova/bge-small-en-v1.5'),
 * });
 *
 * // Store a response
 * await cache.store({
 *   prompt: 'What is machine learning?',
 *   response: 'Machine learning is a subset of AI...',
 *   modelId: 'llama-3.2',
 * });
 *
 * // Lookup returns cached response for similar prompts
 * const result = await cache.lookup({
 *   prompt: 'Explain machine learning',
 *   modelId: 'llama-3.2',
 * });
 * console.log(result.hit); // true
 * console.log(result.response); // 'Machine learning is a subset of AI...'
 * ```
 *
 * @example With custom configuration
 * ```ts
 * const cache = await createSemanticCache({
 *   embeddingModel: transformers.embedding('Xenova/bge-small-en-v1.5'),
 *   threshold: 0.95,        // Stricter matching
 *   maxEntries: 50,          // Fewer cached entries
 *   ttlMs: 300000,           // 5 minute TTL
 *   storage: 'indexeddb',    // Persistent storage
 *   normalize: true,         // Normalize prompts (default)
 * });
 * ```
 *
 * @throws {SemanticCacheError} If cache creation fails
 *
 * @see {@link semanticCacheMiddleware} - Use with LanguageModelMiddleware
 */
export async function createSemanticCache(
  config: SemanticCacheConfig
): Promise<SemanticCache> {
  const {
    embeddingModel,
    threshold = 0.92,
    maxEntries = 100,
    ttlMs = 3600000,
    storage = 'memory',
    normalize = true,
  } = config;

  // Determine storage type for VectorDB
  let dbStorage: 'memory' | 'indexeddb' = 'memory';
  if (storage === 'indexeddb') {
    dbStorage = 'indexeddb';
  } else if (storage !== 'memory' && typeof storage === 'object') {
    // Custom storage — VectorDB doesn't directly accept a Storage object in config,
    // so we use memory and note: for custom storage, future enhancement needed.
    // For now, in-memory is used with custom storage object support.
    dbStorage = 'memory';
  }

  // Create internal VectorDB for storing prompt embeddings
  const db: VectorDB = await createVectorDB({
    name: `__semantic_cache_${Date.now()}`,
    dimensions: embeddingModel.dimensions,
    storage: dbStorage,
  });

  // Exact match map: normalized prompt -> entry ID
  const exactMatchMap = new Map<string, string>();

  // Entry metadata map: entry ID -> metadata (kept in memory for fast access)
  const entryMetadataMap = new Map<string, CacheEntryMetadata>();

  // Hit/miss counters
  let hits = 0;
  let misses = 0;
  let destroyed = false;

  /**
   * Check that the cache has not been destroyed.
   */
  function ensureNotDestroyed(): void {
    if (destroyed) {
      throw new SemanticCacheError(
        'Semantic cache has been destroyed',
        'CACHE_DESTROYED',
        {
          hint: 'Create a new cache instance with createSemanticCache() after destroying the previous one.',
        }
      );
    }
  }

  /**
   * Get the normalized prompt if normalization is enabled.
   */
  function getPromptKey(prompt: string): string {
    return normalize ? normalizePrompt(prompt) : prompt;
  }

  /**
   * Evict the least-recently-accessed entry.
   */
  async function evictLRU(): Promise<void> {
    let oldestId: string | null = null;
    let oldestAccessTime = Infinity;

    for (const [id, metadata] of entryMetadataMap) {
      if (metadata.accessedAt < oldestAccessTime) {
        oldestAccessTime = metadata.accessedAt;
        oldestId = id;
      }
    }

    if (oldestId) {
      const metadata = entryMetadataMap.get(oldestId);
      await db.delete(oldestId);
      entryMetadataMap.delete(oldestId);

      // Remove from exact match map
      if (metadata) {
        const key = getPromptKey(metadata.rawPrompt);
        if (exactMatchMap.get(key) === oldestId) {
          exactMatchMap.delete(key);
        }
      }

      globalEventBus.emit('cacheEvict' as never, {
        entryId: oldestId,
        reason: 'lru',
      } as never);
    }
  }

  /**
   * Remove an expired entry.
   */
  async function removeExpired(entryId: string): Promise<void> {
    const metadata = entryMetadataMap.get(entryId);
    await db.delete(entryId);
    entryMetadataMap.delete(entryId);

    if (metadata) {
      const key = getPromptKey(metadata.rawPrompt);
      if (exactMatchMap.get(key) === entryId) {
        exactMatchMap.delete(key);
      }
    }

    globalEventBus.emit('cacheEvict' as never, {
      entryId,
      reason: 'ttl',
    } as never);
  }

  const cache: SemanticCache = {
    async lookup(options) {
      ensureNotDestroyed();

      const { prompt, modelId, abortSignal } = options;
      const startTime = performance.now();

      abortSignal?.throwIfAborted();

      try {
        const promptKey = getPromptKey(prompt);

        // Fast path: exact string match
        const exactEntryId = exactMatchMap.get(promptKey);
        if (exactEntryId) {
          const metadata = entryMetadataMap.get(exactEntryId);
          if (metadata && metadata.modelId === modelId) {
            // Check TTL
            if (Date.now() - metadata.createdAt > ttlMs) {
              await removeExpired(exactEntryId);
              misses++;
              globalEventBus.emit('cacheMiss' as never, { prompt: promptKey, modelId } as never);
              return { hit: false, durationMs: performance.now() - startTime };
            }

            // Update access time for LRU
            metadata.accessedAt = Date.now();
            hits++;
            globalEventBus.emit('cacheHit' as never, {
              prompt: promptKey,
              score: 1.0,
              modelId,
              entryId: exactEntryId,
            } as never);
            return {
              hit: true,
              response: metadata.response,
              score: 1.0,
              entryId: exactEntryId,
              durationMs: performance.now() - startTime,
            };
          }
        }

        // If the cache is empty, skip the embedding step
        if (entryMetadataMap.size === 0) {
          misses++;
          globalEventBus.emit('cacheMiss' as never, { prompt: promptKey, modelId } as never);
          return { hit: false, durationMs: performance.now() - startTime };
        }

        abortSignal?.throwIfAborted();

        // Embed the prompt
        const { embedding } = await embed({
          model: embeddingModel,
          value: promptKey,
          abortSignal,
        });

        abortSignal?.throwIfAborted();

        // Search VectorDB with modelId filter
        const results = await db.search(embedding, {
          k: 1,
          filter: { modelId },
        });

        if (results.length === 0) {
          misses++;
          globalEventBus.emit('cacheMiss' as never, { prompt: promptKey, modelId } as never);
          return { hit: false, durationMs: performance.now() - startTime };
        }

        const topResult = results[0];

        // Check threshold
        if (topResult.score < threshold) {
          misses++;
          globalEventBus.emit('cacheMiss' as never, { prompt: promptKey, modelId } as never);
          return { hit: false, durationMs: performance.now() - startTime };
        }

        // Check TTL
        const metadata = entryMetadataMap.get(topResult.id);
        if (!metadata) {
          misses++;
          globalEventBus.emit('cacheMiss' as never, { prompt: promptKey, modelId } as never);
          return { hit: false, durationMs: performance.now() - startTime };
        }

        if (Date.now() - metadata.createdAt > ttlMs) {
          await removeExpired(topResult.id);
          misses++;
          globalEventBus.emit('cacheMiss' as never, { prompt: promptKey, modelId } as never);
          return { hit: false, durationMs: performance.now() - startTime };
        }

        // Cache hit!
        metadata.accessedAt = Date.now();
        hits++;
        globalEventBus.emit('cacheHit' as never, {
          prompt: promptKey,
          score: topResult.score,
          modelId,
          entryId: topResult.id,
        } as never);

        return {
          hit: true,
          response: metadata.response,
          score: topResult.score,
          entryId: topResult.id,
          durationMs: performance.now() - startTime,
        };
      } catch (error) {
        // Re-throw abort errors as-is
        if (abortSignal?.aborted) {
          throw error;
        }

        throw new SemanticCacheError(
          'Cache lookup failed',
          'CACHE_LOOKUP_FAILED',
          {
            hint: 'Check that the embedding model is loaded and functioning correctly.',
            cause: error instanceof Error ? error : new Error(String(error)),
          }
        );
      }
    },

    async store(options) {
      ensureNotDestroyed();

      const { prompt, response, modelId, abortSignal } = options;

      abortSignal?.throwIfAborted();

      try {
        const promptKey = getPromptKey(prompt);

        // Evict LRU if at capacity
        if (entryMetadataMap.size >= maxEntries) {
          await evictLRU();
        }

        abortSignal?.throwIfAborted();

        // Embed the prompt
        const { embedding } = await embed({
          model: embeddingModel,
          value: promptKey,
          abortSignal,
        });

        abortSignal?.throwIfAborted();

        // Generate entry ID
        const entryId = `cache_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        const now = Date.now();
        const metadata: CacheEntryMetadata = {
          prompt: promptKey,
          rawPrompt: prompt,
          response,
          modelId,
          createdAt: now,
          accessedAt: now,
        };

        // Store in VectorDB
        await db.add({
          id: entryId,
          vector: embedding,
          metadata: { modelId, prompt: promptKey } as Record<string, unknown>,
        });

        // Store metadata in memory
        entryMetadataMap.set(entryId, metadata);

        // Update exact match map
        exactMatchMap.set(promptKey, entryId);

        globalEventBus.emit('cacheStore' as never, {
          prompt: promptKey,
          modelId,
          entryId,
        } as never);

        return { entryId };
      } catch (error) {
        // Re-throw abort errors as-is
        if (abortSignal?.aborted) {
          throw error;
        }

        throw new SemanticCacheError(
          'Cache store failed',
          'CACHE_STORE_FAILED',
          {
            hint: 'Check that the embedding model is loaded and there is sufficient memory.',
            cause: error instanceof Error ? error : new Error(String(error)),
          }
        );
      }
    },

    async clear(filter?) {
      ensureNotDestroyed();

      const modelIdFilter = filter?.modelId;
      let entriesRemoved = 0;

      if (modelIdFilter) {
        // Remove only entries matching the modelId
        const idsToRemove: string[] = [];
        for (const [id, metadata] of entryMetadataMap) {
          if (metadata.modelId === modelIdFilter) {
            idsToRemove.push(id);
          }
        }

        for (const id of idsToRemove) {
          const metadata = entryMetadataMap.get(id);
          await db.delete(id);
          entryMetadataMap.delete(id);

          if (metadata) {
            const key = getPromptKey(metadata.rawPrompt);
            if (exactMatchMap.get(key) === id) {
              exactMatchMap.delete(key);
            }
          }

          entriesRemoved++;
        }
      } else {
        // Clear all entries
        entriesRemoved = entryMetadataMap.size;
        await db.clear();
        entryMetadataMap.clear();
        exactMatchMap.clear();
      }

      globalEventBus.emit('cacheClear' as never, { entriesRemoved } as never);

      return { entriesRemoved };
    },

    stats() {
      ensureNotDestroyed();

      const entries = entryMetadataMap.size;
      const total = hits + misses;
      const hitRate = total > 0 ? hits / total : 0;

      let oldestEntryMs: number | null = null;
      let newestEntryMs: number | null = null;

      for (const metadata of entryMetadataMap.values()) {
        if (oldestEntryMs === null || metadata.createdAt < oldestEntryMs) {
          oldestEntryMs = metadata.createdAt;
        }
        if (newestEntryMs === null || metadata.createdAt > newestEntryMs) {
          newestEntryMs = metadata.createdAt;
        }
      }

      return {
        entries,
        hits,
        misses,
        hitRate,
        oldestEntryMs,
        newestEntryMs,
      };
    },

    async destroy() {
      if (destroyed) return;

      destroyed = true;
      await db.close();
      entryMetadataMap.clear();
      exactMatchMap.clear();
    },
  };

  return cache;
}

/**
 * Create a LanguageModelMiddleware that uses a semantic cache.
 *
 * The middleware intercepts `doGenerate` and `doStream` calls:
 * - On cache hit: returns the cached response without calling the model
 * - On cache miss: calls the model normally and stores the result
 *
 * @param cache - The semantic cache instance to use
 * @returns A LanguageModelMiddleware
 *
 * @example
 * ```ts
 * import { createSemanticCache, semanticCacheMiddleware, wrapLanguageModel } from '@localmode/core';
 * import { transformers } from '@localmode/transformers';
 * import { webllm } from '@localmode/webllm';
 *
 * const cache = await createSemanticCache({
 *   embeddingModel: transformers.embedding('Xenova/bge-small-en-v1.5'),
 * });
 *
 * const cachedModel = wrapLanguageModel({
 *   model: webllm.languageModel('Llama-3.2-1B-Instruct-q4f16'),
 *   middleware: semanticCacheMiddleware(cache),
 * });
 *
 * // First call: model generates, result is cached
 * const result1 = await generateText({ model: cachedModel, prompt: 'What is AI?' });
 *
 * // Second call with similar prompt: returns cached response instantly
 * const result2 = await generateText({ model: cachedModel, prompt: 'Explain AI' });
 * ```
 *
 * @see {@link createSemanticCache} - Create a cache instance
 * @see {@link wrapLanguageModel} - Apply middleware to a model
 */
export function semanticCacheMiddleware(cache: SemanticCache): LanguageModelMiddleware {
  return {
    wrapGenerate: async (options: {
      doGenerate: () => Promise<DoGenerateResult>;
      prompt: string;
      model: LanguageModel;
    }): Promise<DoGenerateResult> => {
      const { doGenerate, prompt, model } = options;

      // Lookup in cache
      const lookupResult = await cache.lookup({
        prompt,
        modelId: model.modelId,
      });

      if (lookupResult.hit && lookupResult.response !== undefined) {
        // Cache hit — return cached response without calling the model
        return {
          text: lookupResult.response,
          finishReason: 'stop',
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            durationMs: lookupResult.durationMs,
          },
        };
      }

      // Cache miss — call the model
      const result = await doGenerate();

      // Store the result in cache (fire-and-forget, don't block the response)
      cache.store({
        prompt,
        response: result.text,
        modelId: model.modelId,
      }).catch(() => {
        // Silently ignore cache store errors — caching is best-effort
      });

      return result;
    },

    wrapStream: (options: {
      doStream: () => AsyncIterable<StreamChunk>;
      prompt: string;
      model: LanguageModel;
    }): AsyncIterable<StreamChunk> => {
      const { doStream, prompt, model } = options;

      async function* cachedStream(): AsyncIterable<StreamChunk> {
        // Lookup in cache
        const lookupResult = await cache.lookup({
          prompt,
          modelId: model.modelId,
        });

        if (lookupResult.hit && lookupResult.response !== undefined) {
          // Cache hit — yield full text as single chunk
          yield {
            text: lookupResult.response,
            done: true,
            finishReason: 'stop',
            usage: {
              inputTokens: 0,
              outputTokens: 0,
              totalTokens: 0,
              durationMs: lookupResult.durationMs,
            },
          };
          return;
        }

        // Cache miss — stream from model and buffer for caching
        let accumulatedText = '';

        for await (const chunk of doStream()) {
          accumulatedText += chunk.text;
          yield chunk;

          if (chunk.done) {
            break;
          }
        }

        // Store the complete response in cache (fire-and-forget)
        if (accumulatedText.length > 0) {
          cache.store({
            prompt,
            response: accumulatedText,
            modelId: model.modelId,
          }).catch(() => {
            // Silently ignore cache store errors
          });
        }
      }

      return cachedStream();
    },
  };
}
