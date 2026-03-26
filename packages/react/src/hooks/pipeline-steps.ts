/**
 * @file pipeline-steps.ts
 * @description Pre-built step factories for common pipeline patterns
 */

import type {
  EmbeddingModel,
  VectorDB,
  Document,
  ClassificationModel,
  RerankerModel,
  SummarizationModel,
  LanguageModel,
  SemanticChunkOptions,
} from '@localmode/core';
import type { PipelineStep } from '../core/types.js';

/**
 * Create a pipeline step that embeds text using an embedding model.
 *
 * @param model - The embedding model to use
 * @returns A pipeline step that accepts a string and returns an EmbedResult
 */
export function embedStep(model: EmbeddingModel): PipelineStep {
  return {
    name: 'embed',
    execute: async (value: unknown, signal: AbortSignal) => {
      const { embed } = await import('@localmode/core');
      return embed({ model, value: value as string, abortSignal: signal });
    },
  };
}

/**
 * Create a pipeline step that embeds multiple text values.
 *
 * @param model - The embedding model to use
 * @returns A pipeline step that accepts string[] and returns EmbedManyResult
 */
export function embedManyStep(model: EmbeddingModel): PipelineStep {
  return {
    name: 'embedMany',
    execute: async (values: unknown, signal: AbortSignal) => {
      const { embedMany } = await import('@localmode/core');
      return embedMany({ model, values: values as string[], abortSignal: signal });
    },
  };
}

/**
 * Create a pipeline step that searches a vector database.
 *
 * @param db - The vector database to search
 * @param topK - Number of results to return
 * @returns A pipeline step that accepts an embed result and returns search results
 */
export function searchStep(db: VectorDB, topK = 10): PipelineStep {
  return {
    name: 'search',
    execute: async (embedResult: unknown, signal: AbortSignal) => {
      signal.throwIfAborted?.();
      const vector = embedResult instanceof Float32Array
        ? embedResult
        : (embedResult as { embedding: Float32Array }).embedding;
      return db.search(vector, { k: topK });
    },
  };
}

/**
 * Create a pipeline step that chunks text.
 *
 * @param options - Chunking configuration
 * @returns A pipeline step that accepts text and returns chunks
 */
export function chunkStep(options: {
  size?: number;
  overlap?: number;
}): PipelineStep {
  return {
    name: 'chunk',
    execute: async (text: unknown, signal: AbortSignal) => {
      signal.throwIfAborted?.();
      const { chunk } = await import('@localmode/core');
      return chunk(text as string, {
        strategy: 'recursive',
        size: options.size ?? 512,
        overlap: options.overlap ?? 50,
      });
    },
  };
}

/**
 * Create a pipeline step that stores documents in a vector database.
 *
 * @param db - The vector database to store in
 * @returns A pipeline step that accepts Document[] and stores them
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
 * @returns A pipeline step that accepts text and returns ClassifyResult
 */
export function classifyStep(model: ClassificationModel): PipelineStep {
  return {
    name: 'classify',
    execute: async (text: unknown, signal: AbortSignal) => {
      const { classify } = await import('@localmode/core');
      return classify({ model, text: text as string, abortSignal: signal });
    },
  };
}

/**
 * Create a pipeline step that reranks documents.
 *
 * @param model - The reranker model to use
 * @param options - Reranking options
 * @returns A pipeline step that accepts { query, documents } and returns RerankResult
 */
export function rerankStep(
  model: RerankerModel,
  options?: { topK?: number }
): PipelineStep {
  return {
    name: 'rerank',
    execute: async (input: unknown, signal: AbortSignal) => {
      const { rerank } = await import('@localmode/core');
      const { query, documents } = input as { query: string; documents: string[] };
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
 * Create a pipeline step that summarizes text.
 *
 * @param model - The summarization model to use
 * @param options - Summarization options
 * @returns A pipeline step that accepts text and returns SummarizeResult
 */
export function summarizeStep(
  model: SummarizationModel,
  options?: { maxLength?: number; minLength?: number }
): PipelineStep {
  return {
    name: 'summarize',
    execute: async (text: unknown, signal: AbortSignal) => {
      const { summarize } = await import('@localmode/core');
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
 * @param options - Generation options
 * @returns A pipeline step that accepts a prompt string and returns GenerateTextResult
 */
export function generateStep(
  model: LanguageModel,
  options?: { maxTokens?: number; temperature?: number; systemPrompt?: string }
): PipelineStep {
  return {
    name: 'generate',
    execute: async (prompt: unknown, signal: AbortSignal) => {
      const { generateText } = await import('@localmode/core');
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
 * @param options - Semantic chunking configuration
 * @returns A pipeline step that accepts text and returns Chunk[]
 */
export function semanticChunkStep(
  model: EmbeddingModel,
  options?: Partial<Omit<SemanticChunkOptions, 'text' | 'model'>>
): PipelineStep {
  return {
    name: 'semanticChunk',
    execute: async (text: unknown, signal: AbortSignal) => {
      const { semanticChunk } = await import('@localmode/core');
      return semanticChunk({
        text: text as string,
        model,
        ...options,
        abortSignal: signal,
      });
    },
  };
}
