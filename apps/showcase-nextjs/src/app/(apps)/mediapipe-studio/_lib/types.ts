/**
 * @file types.ts
 * @description Type definitions for the MediaPipe Studio application
 */

/** Application-level error shape */
export interface AppError {
  /** Human-readable error message */
  message: string;
  /** Whether the error is recoverable via retry */
  recoverable?: boolean;
}

/** Identifier for each studio tab */
export type TabId =
  | 'hands'
  | 'pose'
  | 'face'
  | 'gestures'
  | 'audio'
  | 'language'
  | 'text';

/** Domain grouping for tabs */
export type TabDomain = 'Vision' | 'Audio' | 'Text';

/** Display metadata for a tab */
export interface TabInfo {
  /** Tab identifier */
  id: TabId;
  /** Display label */
  label: string;
  /** Domain group */
  domain: TabDomain;
}

/** A single audio classification prediction for display */
export interface AudioPrediction {
  /** Category label */
  label: string;
  /** Confidence score (0-1) */
  score: number;
}

/** A detected language candidate for display */
export interface LanguageResult {
  /** ISO 639-1 language code */
  code: string;
  /** Human-readable language name */
  name: string;
  /** Detection confidence (0-1) */
  confidence: number;
}
