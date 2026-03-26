/**
 * @file types.ts
 * @description Type definitions for the duplicate-finder application
 */

/** A photo entry with its embedding for similarity comparison */
export interface PhotoEntry {
  /** Unique identifier */
  id: string;
  /** Image as a data URL string */
  dataUrl: string;
  /** Original file name */
  fileName: string;
  /** Feature embedding vector (null until processed) */
  embedding: Float32Array | null;
  /** Whether this photo is currently being processed */
  isProcessing: boolean;
}

/** A group of visually similar/duplicate photos */
export interface DuplicateGroup {
  /** Photos in this duplicate group */
  photos: PhotoEntry[];
  /** Similarity score between photos in the group (0-1) */
  similarity: number;
}

/** Progress tracking for the scan operation */
export interface ScanProgress {
  /** Current item being processed */
  current: number;
  /** Total items to process */
  total: number;
  /** Current processing phase */
  phase: 'embedding' | 'comparing';
}

/** Application error for UI display */
export interface AppError {
  /** Error message for display */
  message: string;
  /** Error code for programmatic handling */
  code?: string;
  /** Whether the error is recoverable */
  recoverable?: boolean;
}
