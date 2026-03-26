/**
 * @file types.ts
 * @description Type definitions for the data migrator application
 */

/** Application error for UI display */
export interface AppError {
  /** Error message for display */
  message: string;
  /** Error code for programmatic handling */
  code?: string;
  /** Whether the error is recoverable */
  recoverable?: boolean;
}

/** Phase of the import operation */
export type ImportPhase = 'idle' | 'previewing' | 'importing' | 'complete' | 'error';

/** Preview record for table display */
export interface PreviewRecord {
  /** Record ID */
  id: string;
  /** Truncated text (if any) */
  textSnippet?: string;
  /** Vector dimensions (0 if no vector) */
  vectorDims: number;
  /** Metadata keys */
  metadataKeys: string[];
}
