/**
 * @file types.ts
 * @description Type definitions for the model advisor application
 */
import type { TaskCategory } from '@localmode/core';

/** Re-export TaskCategory for convenience */
export type { TaskCategory };

/** Application error for UI display */
export interface AppError {
  /** Error message for display */
  message: string;
  /** Error code for programmatic handling */
  code?: string;
  /** Whether the error is recoverable */
  recoverable?: boolean;
}

/** Grouped task categories by domain */
export interface TaskGroup {
  /** Human-readable group label */
  label: string;
  /** Task categories in this group */
  tasks: TaskCategory[];
}

/** Pair of model IDs selected for comparison (null when slot is empty) */
export type ComparisonPair = [string | null, string | null];

/** Form data for registering a custom model */
export interface CustomModelFormData {
  /** Model identifier */
  modelId: string;
  /** Human-readable name */
  name: string;
  /** Provider name */
  provider: string;
  /** ML task category */
  task: TaskCategory;
  /** Download size in MB */
  sizeMB: number;
  /** Minimum memory in MB (optional) */
  minMemoryMB?: number;
  /** Output dimensions for embedding models (optional) */
  dimensions?: number;
  /** Recommended inference device */
  recommendedDevice: 'webgpu' | 'wasm' | 'cpu';
  /** Speed tier estimate */
  speedTier: 'fast' | 'medium' | 'slow';
  /** Quality tier estimate */
  qualityTier: 'low' | 'medium' | 'high';
  /** Optional short description */
  description?: string;
}
