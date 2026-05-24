/**
 * @file types.ts
 * @description Type definitions for the voice-studio application
 */

/** Application error for UI display */
export interface AppError {
  message: string;
  code?: string;
  recoverable?: boolean;
}

/** Tab options in the main UI */
export type StudioTab = 'browse' | 'synthesize' | 'compare';
