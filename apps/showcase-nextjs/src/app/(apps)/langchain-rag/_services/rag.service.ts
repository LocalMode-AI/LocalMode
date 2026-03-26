/**
 * @file rag.service.ts
 * @description Service for RAG pipeline operations using @localmode packages.
 *
 * Creates embedding model, language model, and VectorDB singletons.
 * Provides document ingestion and question-answering functions that
 * manually implement the RAG pipeline: embed -> search -> generate.
 */
import { embed, embedMany, createVectorDB, generateText, getCompressionStats } from '@localmode/core';
import type { VectorDB, EmbeddingModel, LanguageModel } from '@localmode/core';
import { transformers } from '@localmode/transformers';
import { webllm } from '@localmode/webllm';
import {
  EMBEDDING_MODEL_ID,
  LLM_MODEL_ID,
  DB_NAME,
  EMBEDDING_DIMENSIONS,
  DEFAULT_TOP_K,
  DEFAULT_SYSTEM_PROMPT,
} from '../_lib/constants';
import type { Source } from '../_lib/types';

/** Singleton embedding model instance */
let embeddingModel: EmbeddingModel | null = null;

/** Singleton language model instance */
let languageModel: LanguageModel | null = null;

/** Singleton VectorDB instance */
let vectorDB: VectorDB | null = null;

/** In-memory chunk store for text retrieval by ID */
const chunkStore = new Map<string, string>();

/**
 * Get or create the embedding model singleton
 */
export function getEmbeddingModel() {
  if (!embeddingModel) {
    embeddingModel = transformers.embedding(EMBEDDING_MODEL_ID);
  }
  return embeddingModel;
}

/**
 * Get or create the language model singleton
 */
export function getLLMModel() {
  if (!languageModel) {
    languageModel = webllm.languageModel(LLM_MODEL_ID);
  }
  return languageModel;
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
      compression: { type: 'sq8' },
    });
  }
  return vectorDB;
}

/**
 * Ingest text chunks into the vector database.
 * Embeds each chunk and stores it for later retrieval.
 *
 * @param chunks - Array of text chunks to ingest
 * @param signal - Optional AbortSignal for cancellation
 * @returns Number of chunks successfully ingested
 */
export async function ingestDocuments(chunks: string[], signal?: AbortSignal) {
  signal?.throwIfAborted();

  const model = getEmbeddingModel();
  const db = await getVectorDB();

  // Embed all chunks
  const { embeddings } = await embedMany({
    model,
    values: chunks,
    abortSignal: signal,
  });

  // Store each chunk with its embedding
  for (let i = 0; i < chunks.length; i++) {
    signal?.throwIfAborted();

    const id = crypto.randomUUID();
    chunkStore.set(id, chunks[i]);

    await db.add({
      id,
      vector: embeddings[i],
      metadata: { text: chunks[i] },
    });
  }

  return chunks.length;
}

/**
 * Ask a question using the RAG pipeline:
 * 1. Embed the question
 * 2. Search the vector DB for relevant chunks
 * 3. Build a prompt with retrieved context
 * 4. Generate an answer using the LLM
 *
 * @param question - The user's question
 * @param signal - Optional AbortSignal for cancellation
 * @returns The generated answer and source passages
 */
export async function askQuestion(question: string, signal?: AbortSignal) {
  signal?.throwIfAborted();

  const embModel = getEmbeddingModel();
  const llm = getLLMModel();
  const db = await getVectorDB();

  // 1. Embed the question
  const { embedding } = await embed({
    model: embModel,
    value: question,
    abortSignal: signal,
  });

  // 2. Search for relevant chunks
  const searchResults = await db.search(embedding, { k: DEFAULT_TOP_K });

  // 3. Map results to sources
  const sources: Source[] = searchResults.map((r) => ({
    text: chunkStore.get(r.id) ?? (r.metadata?.text as string) ?? '',
    score: r.score,
  }));

  // 4. Build context from retrieved passages
  const context = sources
    .map((s, i) => `[Source ${i + 1}] ${s.text}`)
    .join('\n\n');

  // 5. Generate answer with LLM
  const prompt = `${DEFAULT_SYSTEM_PROMPT}\n\nContext:\n${context}\n\nQuestion: ${question}\n\nAnswer:`;

  const result = await generateText({
    model: llm,
    prompt,
    maxTokens: 512,
    abortSignal: signal,
  });

  return {
    answer: result.text,
    sources,
  };
}

/**
 * Get the total number of ingested chunks
 */
export function getChunkCount() {
  return chunkStore.size;
}

/**
 * Clear all ingested documents from the vector DB and chunk store
 */
export async function clearDocuments() {
  const db = await getVectorDB();
  await db.clear();
  chunkStore.clear();
}

/**
 * Get compression statistics for the VectorDB.
 * Returns storage usage info including original vs compressed size and ratio.
 */
export async function getStorageStats() {
  const db = await getVectorDB();
  return getCompressionStats(db);
}
