/**
 * @file types.ts
 * @description Type definitions for the product search application
 */

/** A product stored in the catalog with image features */
export interface Product {
  /** Unique product identifier */
  id: string;
  /** Base64 data URL of the product image */
  dataUrl: string;
  /** Original file name of the uploaded image */
  fileName: string;
  /** Auto-detected category via zero-shot classification */
  category: string;
  /** Confidence score for the category assignment (0-1) */
  categoryScore: number;
  /** Number of visually similar items in the catalog */
  similarCount: number;
}

/** A search result with visual similarity score */
export interface SearchResult {
  /** The matched product */
  product: Product;
  /** Similarity score (0-1, higher is more similar) */
  score: number;
}

/** Device-adaptive batch info from computeOptimalBatchSize() */
export interface BatchInfo {
  /** Computed optimal batch size for the current device */
  batchSize: number;
  /** Device capabilities snapshot used in the computation */
  deviceProfile: {
    /** Logical CPU cores */
    cores: number;
    /** Device memory in GB */
    memoryGB: number;
    /** Whether a GPU is available */
    hasGPU: boolean;
    /** Detection source: 'detected', 'override', or 'fallback' */
    source: string;
  };
  /** Human-readable explanation of the batch size computation */
  reasoning: string;
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
