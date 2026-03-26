/**
 * @file types.ts
 * @description Type definitions for the GGUF Explorer application
 */

import type { GGUFMetadata } from '@localmode/wllama';
import type { GGUFBrowserCompat } from '@localmode/wllama';
import type { WllamaModelEntry } from '@localmode/wllama';

/** Active tab in the explorer */
export type ExplorerTab = 'browse' | 'inspect' | 'chat';

/** How the model was selected */
export type ModelSource = 'curated' | 'custom';

/** Selected model information */
export interface ModelSelection {
  /** URL or shorthand for the GGUF model */
  url: string;
  /** How the model was selected */
  source: ModelSource;
  /** Curated model entry if selected from catalog */
  entry?: WllamaModelEntry;
}

/** Combined inspection result from metadata + compat */
export interface InspectionResult {
  /** Parsed GGUF metadata */
  metadata: GGUFMetadata;
  /** Browser compatibility assessment */
  compat: GGUFBrowserCompat;
}

/** Model download progress */
export interface DownloadProgress {
  /** Current status */
  status: 'idle' | 'downloading' | 'loading' | 'ready' | 'error';
  /** Progress percentage (0-100) */
  progress: number;
  /** Bytes loaded so far */
  loaded: number;
  /** Total bytes */
  total: number;
  /** Status text */
  text?: string;
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

/** Chat message */
export interface ChatMessage {
  /** Unique identifier */
  id: string;
  /** Sender role */
  role: 'user' | 'assistant' | 'system';
  /** Message content */
  content: string;
  /** Timestamp */
  timestamp: Date;
}
