/**
 * Pre-built step factories for common pipeline operations.
 *
 * Each factory returns a PipelineStep with typed input/output.
 *
 * @packageDocumentation
 */

import type { PipelineStep } from './types.js';
import type { EmbeddingModel } from '../embeddings/types.js';
import type { ClassificationModel } from '../classification/types.js';
import type { RerankerModel } from '../classification/types.js';
import type { SummarizationModel } from '../summarization/types.js';
import type { LanguageModel } from '../generation/types.js';
import type { VectorDB, SearchOptions, Document } from '../types.js';
import type { SemanticChunkOptions } from '../rag/types.js';

/**
 * Create a pipeline step that embeds a single text value.
 *
 * @param model - The embedding model to use
 * @returns A pipeline step: string → EmbedResult
 */
export function embedStep(model: EmbeddingModel): PipelineStep {
  return {
    name: 'embed',
    execute: async (value: unknown, signal: AbortSignal) => {
      const { embed } = await import('../embeddings/embed.js');
      return embed({ model, value: value as string, abortSignal: signal });
    },
  };
}

/**
 * Create a pipeline step that embeds multiple text values.
 *
 * @param model - The embedding model to use
 * @returns A pipeline step: string[] → EmbedManyResult
 */
export function embedManyStep(model: EmbeddingModel): PipelineStep {
  return {
    name: 'embedMany',
    execute: async (values: unknown, signal: AbortSignal) => {
      const { embedMany } = await import('../embeddings/embed.js');
      return embedMany({ model, values: values as string[], abortSignal: signal });
    },
  };
}

/**
 * Create a pipeline step that chunks text.
 *
 * @param options - Chunking configuration
 * @returns A pipeline step: string → Chunk[]
 */
export function chunkStep(options: {
  strategy?: 'recursive' | 'markdown' | 'code';
  size?: number;
  overlap?: number;
}): PipelineStep {
  return {
    name: 'chunk',
    execute: async (text: unknown, signal: AbortSignal) => {
      signal.throwIfAborted?.();
      const { chunk } = await import('../rag/chunkers/index.js');
      return chunk(text as string, {
        strategy: options.strategy ?? 'recursive',
        size: options.size ?? 512,
        overlap: options.overlap ?? 50,
      });
    },
  };
}

/**
 * Create a pipeline step that searches a vector database.
 *
 * @param db - The vector database to search
 * @param options - Search configuration
 * @returns A pipeline step: Float32Array → SearchResult[]
 */
export function searchStep(
  db: VectorDB,
  options?: Partial<SearchOptions>
): PipelineStep {
  return {
    name: 'search',
    execute: async (input: unknown, signal: AbortSignal) => {
      signal.throwIfAborted?.();
      // Accept either a raw Float32Array or an EmbedResult with .embedding
      const vector = input instanceof Float32Array
        ? input
        : (input as { embedding: Float32Array }).embedding;
      return db.search(vector, { k: options?.k ?? 10, ...options });
    },
  };
}

/**
 * Create a pipeline step that reranks search results.
 *
 * @param model - The reranker model to use
 * @param options - Reranking configuration
 * @returns A pipeline step: { query, results } → RankedDocument[]
 */
export function rerankStep(
  model: RerankerModel,
  options?: { topK?: number }
): PipelineStep {
  return {
    name: 'rerank',
    execute: async (input: unknown, signal: AbortSignal) => {
      const { rerank } = await import('../classification/rerank.js');
      const { query, documents } = input as {
        query: string;
        documents: string[];
      };
      return rerank({
        model,
        query,
        documents,
        topK: options?.topK,
        abortSignal: signal,
      });
    },
  };
}

/**
 * Create a pipeline step that stores documents in a vector database.
 *
 * @param db - The vector database to store in
 * @returns A pipeline step: Document[] → void
 */
export function storeStep(db: VectorDB): PipelineStep {
  return {
    name: 'store',
    execute: async (docs: unknown, signal: AbortSignal) => {
      signal.throwIfAborted?.();
      await db.addMany(docs as Document[]);
      return docs;
    },
  };
}

/**
 * Create a pipeline step that classifies text.
 *
 * @param model - The classification model to use
 * @returns A pipeline step: string → ClassifyResult
 */
export function classifyStep(model: ClassificationModel): PipelineStep {
  return {
    name: 'classify',
    execute: async (text: unknown, signal: AbortSignal) => {
      const { classify } = await import('../classification/classify.js');
      return classify({ model, text: text as string, abortSignal: signal });
    },
  };
}

/**
 * Create a pipeline step that summarizes text.
 *
 * @param model - The summarization model to use
 * @param options - Summarization configuration
 * @returns A pipeline step: string → SummarizeResult
 */
export function summarizeStep(
  model: SummarizationModel,
  options?: { maxLength?: number; minLength?: number }
): PipelineStep {
  return {
    name: 'summarize',
    execute: async (text: unknown, signal: AbortSignal) => {
      const { summarize } = await import('../summarization/summarize.js');
      return summarize({
        model,
        text: text as string,
        maxLength: options?.maxLength,
        minLength: options?.minLength,
        abortSignal: signal,
      });
    },
  };
}

/**
 * Create a pipeline step that generates text using a language model.
 *
 * @param model - The language model to use
 * @param options - Generation configuration
 * @returns A pipeline step: string → GenerateTextResult
 */
export function generateStep(
  model: LanguageModel,
  options?: { maxTokens?: number; temperature?: number; systemPrompt?: string }
): PipelineStep {
  return {
    name: 'generate',
    execute: async (prompt: unknown, signal: AbortSignal) => {
      const { generateText } = await import('../generation/generate-text.js');
      return generateText({
        model,
        prompt: prompt as string,
        maxTokens: options?.maxTokens,
        temperature: options?.temperature,
        systemPrompt: options?.systemPrompt,
        abortSignal: signal,
      });
    },
  };
}

/**
 * Create a pipeline step that splits text using semantic (embedding-aware) chunking.
 *
 * @param model - The embedding model for computing segment similarities
 * @param options - Semantic chunking configuration (threshold, size, minSize, etc.)
 * @returns A pipeline step: string → Chunk[]
 */
export function semanticChunkStep(
  model: EmbeddingModel,
  options?: Partial<Omit<SemanticChunkOptions, 'text' | 'model'>>
): PipelineStep {
  return {
    name: 'semanticChunk',
    execute: async (text: unknown, signal: AbortSignal) => {
      const { semanticChunk } = await import('../rag/chunkers/semantic.js');
      return semanticChunk({
        text: text as string,
        model,
        ...options,
        abortSignal: signal,
      });
    },
  };
}
