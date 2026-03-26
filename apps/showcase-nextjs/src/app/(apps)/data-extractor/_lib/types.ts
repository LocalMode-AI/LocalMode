/**
 * @file types.ts
 * @description Type definitions for the data extractor application
 */

import type { ObjectSchema } from '@localmode/core';

/** Available extraction template names */
export type TemplateName = 'contact' | 'event' | 'review' | 'recipe' | 'job';

/** Extraction template with schema and sample data */
export interface ExtractionTemplate {
  /** Display name */
  name: string;
  /** Icon name from lucide-react */
  icon: string;
  /** Schema for structured output */
  schema: ObjectSchema<unknown>;
  /** Sample text for demonstration */
  sampleText: string;
  /** Human-readable schema description */
  schemaDisplay: string;
}

/** Available model option */
export interface ModelOption {
  /** Model ID for WebLLM */
  id: string;
  /** Display name */
  name: string;
  /** Model size string */
  size: string;
}

/** Application error for UI display */
export interface AppError {
  /** Error message for display */
  message: string;
  /** Error code */
  code?: string;
  /** Whether the error is recoverable */
  recoverable?: boolean;
}
