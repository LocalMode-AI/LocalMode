/**
 * @file use-rag.ts
 * @description Hook for managing RAG pipeline operations — document ingestion and question answering
 */
'use client';

import { useState, useRef } from 'react';
import {
  ingestDocuments,
  askQuestion as askQuestionService,
  clearDocuments,
  getChunkCount,
  getStorageStats,
} from '../_services/rag.service';
import { splitTextIntoChunks, formatBytes } from '../_lib/utils';
import { DEFAULT_CHUNK_SIZE, DEFAULT_OVERLAP } from '../_lib/constants';
import type { QAEntry, AppError, CompressionInfo } from '../_lib/types';

/** Hook for managing RAG pipeline state and operations */
export function useRAG() {
  const [documentCount, setDocumentCount] = useState(0);
  const [entries, setEntries] = useState<QAEntry[]>([]);
  const [isIngesting, setIsIngesting] = useState(false);
  const [isAnswering, setIsAnswering] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [compressionStats, setCompressionStats] = useState<CompressionInfo | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  /** Clear error state */
  const clearError = () => setError(null);

  /** Fetch and format compression stats from the VectorDB */
  const refreshCompressionStats = async () => {
    try {
      const stats = await getStorageStats();
      setCompressionStats({
        enabled: stats.enabled,
        vectorCount: stats.vectorCount,
        originalSize: formatBytes(stats.originalSizeBytes),
        compressedSize: formatBytes(stats.compressedSizeBytes),
        ratio: stats.ratio,
      });
    } catch {
      // Non-critical — don't surface stats errors to the user
    }
  };

  /**
   * Ingest a text document into the knowledge base.
   * Splits the text into chunks and indexes them in the vector DB.
   */
  const ingestText = async (text: string) => {
    if (!text.trim()) return;
    clearError();
    setIsIngesting(true);

    abortRef.current = new AbortController();

    try {
      const chunks = splitTextIntoChunks(text, DEFAULT_CHUNK_SIZE, DEFAULT_OVERLAP);
      if (chunks.length === 0) return;

      await ingestDocuments(chunks, abortRef.current.signal);
      setDocumentCount(getChunkCount());
      await refreshCompressionStats();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error('Ingestion failed:', err);
      setError({
        message: err instanceof Error ? err.message : 'Failed to ingest document. Please try again.',
        code: 'INGEST_FAILED',
      });
    } finally {
      setIsIngesting(false);
      abortRef.current = null;
    }
  };

  /**
   * Ask a question against the ingested knowledge base.
   * Uses the RAG pipeline: embed -> search -> generate.
   */
  const askQuestion = async (question: string) => {
    if (!question.trim()) return;
    clearError();
    setIsAnswering(true);

    abortRef.current = new AbortController();

    try {
      const result = await askQuestionService(question, abortRef.current.signal);

      // Strip Qwen3 <think>...</think> reasoning tags from the answer
      const cleanAnswer = result.answer.replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim();

      const entry: QAEntry = {
        id: crypto.randomUUID(),
        question,
        answer: cleanAnswer || result.answer,
        sources: result.sources,
      };

      setEntries((prev) => [entry, ...prev]);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error('Question answering failed:', err);
      setError({
        message: err instanceof Error ? err.message : 'Failed to answer question. Please try again.',
        code: 'QA_FAILED',
      });
    } finally {
      setIsAnswering(false);
      abortRef.current = null;
    }
  };

  /** Cancel the current operation */
  const cancel = () => {
    abortRef.current?.abort();
    abortRef.current = null;
  };

  /** Clear all data — entries, documents, and error state */
  const clearAll = async () => {
    clearError();
    try {
      await clearDocuments();
      setDocumentCount(0);
      setEntries([]);
      setCompressionStats(null);
    } catch (err) {
      console.error('Failed to clear data:', err);
      setError({ message: 'Failed to clear data.', code: 'CLEAR_FAILED' });
    }
  };

  return {
    documentCount,
    entries,
    isIngesting,
    isAnswering,
    error,
    compressionStats,
    ingestText,
    askQuestion,
    cancel,
    clearError,
    clearAll,
  };
}
