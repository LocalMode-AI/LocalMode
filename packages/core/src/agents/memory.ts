/**
 * Agent Memory
 *
 * VectorDB-backed conversation memory for agents.
 * Stores conversation turns as embeddings for semantic retrieval.
 *
 * @packageDocumentation
 */

import type {
  AgentMemory,
  AgentMemoryConfig,
  MemoryEntry,
  MemoryRetrieveOptions,
} from './types.js';
import { embed } from '../embeddings/embed.js';
import { createVectorDB } from '../db.js';

/**
 * Create a VectorDB-backed conversation memory for agents.
 *
 * Embeds conversation turns using the provided embedding model and
 * stores them in an in-memory VectorDB with HNSW index. Supports
 * semantic retrieval of relevant past interactions.
 *
 * @param config - Memory configuration
 * @returns Promise with an AgentMemory instance
 *
 * @example
 * ```ts
 * import { createAgentMemory } from '@localmode/core';
 * import { transformers } from '@localmode/transformers';
 *
 * const memory = await createAgentMemory({
 *   embeddingModel: transformers.embedding('Xenova/bge-small-en-v1.5'),
 *   maxEntries: 500,
 * });
 *
 * // Use with an agent
 * const agent = createAgent({ model, tools, memory });
 * ```
 *
 * @see {@link createAgent} for using memory with agents
 */
export async function createAgentMemory(config: AgentMemoryConfig): Promise<AgentMemory> {
  const {
    embeddingModel,
    name = 'agent-memory',
    dimensions = embeddingModel.dimensions ?? 384,
    maxEntries = 1000,
  } = config;

  // Create an in-memory VectorDB for memory storage
  const db = await createVectorDB({
    name,
    dimensions,
    storage: 'memory',
  });

  let closed = false;

  // Track entry IDs in insertion order for eviction
  const entryOrder: Array<{ id: string; timestamp: number }> = [];

  return {
    async add(entry: MemoryEntry): Promise<void> {
      if (closed) {
        throw new Error('AgentMemory is closed. Cannot add entries after close().');
      }

      // Embed the content
      const { embedding } = await embed({
        model: embeddingModel,
        value: entry.content,
      });

      // Evict oldest if at capacity
      if (entryOrder.length >= maxEntries) {
        // Sort by timestamp and remove the oldest
        entryOrder.sort((a, b) => a.timestamp - b.timestamp);
        const oldest = entryOrder.shift();
        if (oldest) {
          try {
            await db.delete(oldest.id);
          } catch {
            // Best-effort eviction
          }
        }
      }

      // Store the embedding with metadata
      await db.add({
        id: entry.id,
        vector: embedding,
        metadata: {
          role: entry.role,
          content: entry.content,
          timestamp: entry.timestamp,
          ...(entry.metadata ?? {}),
        },
      });

      entryOrder.push({ id: entry.id, timestamp: entry.timestamp });
    },

    async retrieve(query: string, options?: MemoryRetrieveOptions): Promise<MemoryEntry[]> {
      if (closed) {
        throw new Error('AgentMemory is closed. Cannot retrieve entries after close().');
      }

      const {
        maxResults = 5,
        minSimilarity = 0.7,
        filter,
      } = options ?? {};

      // Empty memory check
      if (entryOrder.length === 0) {
        return [];
      }

      // Embed the query
      const { embedding } = await embed({
        model: embeddingModel,
        value: query,
      });

      // Search the VectorDB
      const results = await db.search(embedding, {
        k: maxResults * 2, // Over-fetch to allow filtering
        threshold: minSimilarity,
      });

      // Filter and map results
      const entries: MemoryEntry[] = [];
      for (const result of results) {
        if (entries.length >= maxResults) break;

        const meta = result.metadata as Record<string, unknown> | undefined;
        if (!meta) continue;

        // Apply role filter
        if (filter?.role && meta.role !== filter.role) continue;

        entries.push({
          id: result.id,
          role: (meta.role as 'user' | 'agent' | 'tool') ?? 'user',
          content: (meta.content as string) ?? '',
          timestamp: (meta.timestamp as number) ?? 0,
          metadata: meta,
        });
      }

      return entries;
    },

    async clear(): Promise<void> {
      if (closed) {
        throw new Error('AgentMemory is closed. Cannot clear after close().');
      }

      await db.clear();
      entryOrder.length = 0;
    },

    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      await db.close();
    },
  };
}
