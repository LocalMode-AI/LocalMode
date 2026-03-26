/**
 * @file types.ts
 * @description Type definitions for the cross-modal search application
 */

/** A photo stored in the index with its data URL and metadata */
export interface Photo {
  /** Unique photo identifier */
  id: string;
  /** Image data as a data URL string */
  dataUrl: string;
  /** Original file name */
  fileName: string;
  /** Whether the photo is currently being embedded */
  isProcessing: boolean;
}

/** A search result with similarity score */
export interface SearchResult {
  /** The matched photo */
  photo: Photo;
  /** Similarity score (0-1, higher is more similar) */
  score: number;
}

/** Search mode for the query input */
export type SearchMode = 'text' | 'image';

/** Application error for UI display */
export interface AppError {
  /** Error message for display */
  message: string;
  /** Error code for programmatic handling */
  code?: string;
  /** Whether the error is recoverable */
  recoverable?: boolean;
}
