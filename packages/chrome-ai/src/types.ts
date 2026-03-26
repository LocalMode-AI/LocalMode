/**
 * Chrome AI Provider Types
 *
 * Type declarations for Chrome's built-in AI APIs and provider settings.
 *
 * @packageDocumentation
 */

// ============================================================================
// Chrome Built-in AI API Type Declarations
// ============================================================================

/** Options for creating a Chrome AI summarizer session */
export interface AISummarizerCreateOptions {
  /** Summary type */
  type?: 'key-points' | 'tl;dr' | 'teaser' | 'headline';
  /** Output format */
  format?: 'markdown' | 'plain-text';
  /** Summary length */
  length?: 'short' | 'medium' | 'long';
  /** Shared context for the summarizer */
  sharedContext?: string;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}

/** Options for summarize/summarizeStreaming calls */
export interface AISummarizeOptions {
  /** Additional context for this specific call */
  context?: string;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}

/** Chrome AI Summarizer session */
export interface AISummarizer {
  /** Summarize text */
  summarize(text: string, options?: AISummarizeOptions): Promise<string>;
  /** Stream summarization result */
  summarizeStreaming(text: string, options?: AISummarizeOptions): ReadableStream<string>;
  /** Destroy the session and free resources */
  destroy(): void;
}

/** Capabilities of the summarizer API */
export interface AISummarizerCapabilities {
  /** Whether the summarizer is available */
  available: 'readily' | 'after-download' | 'no';
}

/** Chrome AI Summarizer factory */
export interface AISummarizerFactory {
  /** Create a summarizer session */
  create(options?: AISummarizerCreateOptions): Promise<AISummarizer>;
  /** Check capabilities */
  capabilities(): Promise<AISummarizerCapabilities>;
}

/** Options for creating a Chrome AI translator session */
export interface AITranslatorCreateOptions {
  /** Source language (BCP 47 tag) */
  sourceLanguage: string;
  /** Target language (BCP 47 tag) */
  targetLanguage: string;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}

/** Chrome AI Translator session */
export interface AITranslator {
  /** Translate text */
  translate(text: string, options?: { signal?: AbortSignal }): Promise<string>;
  /** Destroy the session and free resources */
  destroy(): void;
}

/** Capabilities of the translator API */
export interface AITranslatorCapabilities {
  /** Whether the translator is available */
  available: 'readily' | 'after-download' | 'no';
  /** Check if a language pair is supported */
  languagePairAvailable(sourceLanguage: string, targetLanguage: string): 'readily' | 'after-download' | 'no';
}

/** Chrome AI Translator factory */
export interface AITranslatorFactory {
  /** Create a translator session */
  create(options: AITranslatorCreateOptions): Promise<AITranslator>;
  /** Check capabilities */
  capabilities(): Promise<AITranslatorCapabilities>;
}

/** Chrome AI namespace on the global scope */
export interface ChromeAINamespace {
  summarizer?: AISummarizerFactory;
  translator?: AITranslatorFactory;
  languageModel?: unknown;
}

// Extend the global scope
declare global {
  interface WindowOrWorkerGlobalScope {
    ai?: ChromeAINamespace;
  }
}

// ============================================================================
// Provider Settings
// ============================================================================

/** Settings for the Chrome AI provider */
export interface ChromeAIProviderSettings {
  // Reserved for future provider-level configuration
}

/** Settings for creating a Chrome AI summarizer */
export interface ChromeAISummarizerSettings {
  /** Summary type (default: 'tl;dr') */
  type?: 'key-points' | 'tl;dr' | 'teaser' | 'headline';
  /** Output format (default: 'plain-text') */
  format?: 'markdown' | 'plain-text';
  /** Summary length (default: 'medium') */
  length?: 'short' | 'medium' | 'long';
  /** Shared context for all summarizations */
  sharedContext?: string;
}

/** Settings for creating a Chrome AI translator */
export interface ChromeAITranslatorSettings {
  /** Default source language (BCP 47 tag) */
  sourceLanguage?: string;
  /** Default target language (BCP 47 tag) */
  targetLanguage?: string;
}

/** Chrome AI provider interface */
export interface ChromeAIProvider {
  /** Create a summarization model using Chrome's built-in Summarizer API */
  summarizer(settings?: ChromeAISummarizerSettings): import('@localmode/core').SummarizationModel;
  /** Create a translation model using Chrome's built-in Translator API */
  translator(settings?: ChromeAITranslatorSettings): import('@localmode/core').TranslationModel;
}
