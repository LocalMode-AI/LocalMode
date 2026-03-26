/**
 * @file types.ts
 * @description Type definitions for the Smart Writer application
 */

/** Active AI provider */
export type ActiveProvider = 'chrome-ai' | 'transformers';

/** Summary type option */
export type SummaryType = 'tl;dr' | 'key-points' | 'teaser' | 'headline';

/** Active tab in the writer */
export type WriterTab = 'summarize' | 'translate';

/** Language pair for translation */
export interface LanguagePair {
  /** Source language code */
  source: string;
  /** Target language name */
  sourceName: string;
  /** Target language code */
  target: string;
  /** Target language name */
  targetName: string;
  /** Transformers.js model ID for fallback */
  modelId: string;
}

/** Provider status info */
export interface ProviderStatus {
  /** Active provider name */
  provider: ActiveProvider;
  /** Human-readable label */
  label: string;
  /** Whether provider requires model download */
  requiresDownload: boolean;
}
