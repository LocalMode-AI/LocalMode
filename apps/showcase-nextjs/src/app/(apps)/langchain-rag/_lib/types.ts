/**
 * @file types.ts
 * @description Type definitions for the LangChain RAG application
 */

/** A document ingested into the RAG knowledge base */
export interface RAGDocument {
  /** Unique document identifier */
  id: string;
  /** Document text content */
  text: string;
  /** Optional metadata associated with the document */
  metadata?: Record<string, string>;
}

/** A source passage retrieved for a given question */
export interface Source {
  /** Retrieved text passage */
  text: string;
  /** Similarity score (0-1, higher is more relevant) */
  score: number;
}

/** A single question-answer exchange in the RAG pipeline */
export interface QAEntry {
  /** Unique entry identifier */
  id: string;
  /** The question that was asked */
  question: string;
  /** The generated answer */
  answer: string;
  /** Source passages used to generate the answer */
  sources: Source[];
}

/** Application error for UI display */
export interface AppError {
  /** Human-readable error message */
  message: string;
  /** Optional error code */
  code?: string;
}

/** Compression statistics for UI display */
export interface CompressionInfo {
  /** Whether compression is active on the VectorDB */
  enabled: boolean;
  /** Number of compressed vectors stored */
  vectorCount: number;
  /** Human-readable original (uncompressed) size (e.g., "15.0 KB") */
  originalSize: string;
  /** Human-readable compressed size (e.g., "3.7 KB") */
  compressedSize: string;
  /** Compression ratio (e.g., 4.0 for SQ8) */
  ratio: number;
}
