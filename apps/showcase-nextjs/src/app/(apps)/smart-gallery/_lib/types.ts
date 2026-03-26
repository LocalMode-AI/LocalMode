/**
 * @file types.ts
 * @description Type definitions for the smart gallery application
 */

/** A photo stored in the gallery with auto-categorization */
export interface GalleryPhoto {
  /** Unique photo identifier */
  id: string;
  /** Image data as a data URL string */
  dataUrl: string;
  /** Original file name */
  fileName: string;
  /** Auto-detected category label */
  category: string;
  /** Confidence score for the category (0-1) */
  categoryScore: number;
  /** Whether the photo is currently being processed (classification + indexing) */
  isProcessing: boolean;
}

/** A search result with similarity score */
export interface SearchResult {
  /** The matched photo */
  photo: GalleryPhoto;
  /** Similarity score (0-1, higher is more similar) */
  score: number;
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
