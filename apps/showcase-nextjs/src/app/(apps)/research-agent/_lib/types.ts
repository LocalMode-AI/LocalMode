/**
 * @file types.ts
 * @description Type definitions for the research agent application
 */

/** Application error type */
export interface AppError {
  /** Human-readable error message */
  message: string;
  /** Optional error code */
  code?: string;
  /** Whether the error is recoverable */
  recoverable?: boolean;
}

/** Knowledge base article for the search tool */
export interface KnowledgeArticle {
  /** Unique article identifier */
  id: string;
  /** Article title */
  title: string;
  /** Article content */
  content: string;
  /** Topic category */
  category: string;
}

/** Research note accumulated by the notes tool */
export interface ResearchNote {
  /** Note content */
  text: string;
  /** Source tool that produced the note */
  source: string;
  /** Timestamp of creation */
  timestamp: number;
}
