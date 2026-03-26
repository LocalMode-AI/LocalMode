/**
 * LRU Tracker
 *
 * Stateless LRU eviction logic for the model cache. Reads metadata from the
 * {@link ChunkedModelStore} to decide which models to evict when the cache
 * exceeds its size budget.
 *
 * @packageDocumentation
 */

import type { ModelMetadataRecord } from './types.js';
import { ChunkedModelStore } from './chunked-store.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of {@link shouldEvict}: tells the caller whether eviction is needed
 * and how many bytes must be freed.
 */
export interface EvictionCheck {
  /** Whether eviction is required to fit the new model. */
  shouldEvict: boolean;

  /** Number of bytes that need to be freed (0 when eviction is not needed). */
  bytesNeeded: number;
}

/**
 * A candidate model eligible for eviction, with its metadata.
 */
export interface EvictionCandidate {
  /** Model identifier. */
  modelId: string;

  /** Size of the model in the cache. */
  sizeBytes: number;

  /** When the model was last accessed. */
  lastAccessed: Date;
}

// ============================================================================
// LRU Tracker
// ============================================================================

/**
 * Stateless LRU eviction helper.
 *
 * All state is derived from metadata already stored in IndexedDB — this class
 * holds no mutable state of its own.
 */
export class LRUTracker {
  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Determine whether eviction is necessary to fit a new model within the
   * maximum cache size.
   *
   * @param currentTotalBytes - Current total size of all cached models
   * @param newModelBytes - Size of the model about to be cached
   * @param maxCacheSize - Maximum allowed cache size in bytes
   * @returns Whether eviction is needed and how many bytes must be freed
   */
  shouldEvict(
    currentTotalBytes: number,
    newModelBytes: number,
    maxCacheSize: number,
  ): EvictionCheck {
    const projectedTotal = currentTotalBytes + newModelBytes;

    if (projectedTotal <= maxCacheSize) {
      return { shouldEvict: false, bytesNeeded: 0 };
    }

    return {
      shouldEvict: true,
      bytesNeeded: projectedTotal - maxCacheSize,
    };
  }

  /**
   * Select models to evict in LRU order (least-recently-accessed first),
   * accumulating enough bytes to satisfy `neededBytes`.
   *
   * Models whose IDs appear in `activeModelIds` are excluded (they are
   * currently being downloaded or in use).
   *
   * @param neededBytes - Minimum number of bytes to free
   * @param allMetadata - All metadata records from the store
   * @param activeModelIds - Set of model IDs to exclude from eviction
   * @returns Ordered list of eviction candidates
   */
  getEvictionCandidates(
    neededBytes: number,
    allMetadata: ModelMetadataRecord[],
    activeModelIds: Set<string>,
  ): EvictionCandidate[] {
    // Sort by lastAccessed ascending (oldest first)
    const sorted = [...allMetadata]
      .filter((m) => !activeModelIds.has(m.modelId))
      .sort((a, b) => a.lastAccessed.getTime() - b.lastAccessed.getTime());

    const candidates: EvictionCandidate[] = [];
    let accumulated = 0;

    for (const meta of sorted) {
      if (accumulated >= neededBytes) break;

      candidates.push({
        modelId: meta.modelId,
        sizeBytes: meta.totalBytes,
        lastAccessed: meta.lastAccessed,
      });

      accumulated += meta.totalBytes;
    }

    return candidates;
  }

  /**
   * Perform eviction by deleting the given candidates from the store.
   *
   * @param candidates - Models to delete, as returned by {@link getEvictionCandidates}
   * @param store - The chunked store to delete from
   * @returns Total number of bytes freed
   */
  async performEviction(
    candidates: EvictionCandidate[],
    store: ChunkedModelStore,
  ): Promise<number> {
    let bytesFreed = 0;

    for (const candidate of candidates) {
      await store.deleteModel(candidate.modelId);
      bytesFreed += candidate.sizeBytes;
    }

    return bytesFreed;
  }
}
