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
  type?: 'key-points' | 'tldr' | 'teaser' | 'headline';
  /** Output format */
  format?: 'markdown' | 'plain-text';
  /** Summary length */
  length?: 'short' | 'medium' | 'long';
  /** Shared context for the summarizer */
  sharedContext?: string;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
  /** Download-progress monitor, called with an EventTarget emitting `downloadprogress` */
  monitor?: (m: EventTarget) => void;
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

/** Chrome AI Summarizer factory (`self.Summarizer`, or legacy `self.ai.summarizer`) */
export interface AISummarizerFactory {
  /** Create a summarizer session */
  create(options?: AISummarizerCreateOptions): Promise<AISummarizer>;
  /**
   * Current on-device model state. Present on the modern `self.Summarizer` global;
   * absent on the legacy `self.ai.summarizer` surface.
   */
  availability?(options?: AISummarizerCreateOptions): Promise<ChromeAIAvailability>;
  /** Check capabilities (legacy surface) */
  capabilities?(): Promise<AISummarizerCapabilities>;
}

/** Options for creating a Chrome AI translator session */
export interface AITranslatorCreateOptions {
  /** Source language (BCP 47 tag) */
  sourceLanguage: string;
  /** Target language (BCP 47 tag) */
  targetLanguage: string;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
  /** Download-progress monitor, called with an EventTarget emitting `downloadprogress` */
  monitor?: (m: EventTarget) => void;
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

/** Chrome AI Translator factory (`self.Translator`, or legacy `self.ai.translator`) */
export interface AITranslatorFactory {
  /** Create a translator session */
  create(options: AITranslatorCreateOptions): Promise<AITranslator>;
  /**
   * Current on-device state for a language pair. Present on the modern `self.Translator`
   * global; absent on the legacy `self.ai.translator` surface.
   */
  availability?(options: {
    sourceLanguage: string;
    targetLanguage: string;
  }): Promise<ChromeAIAvailability>;
  /** Check capabilities (legacy surface) */
  capabilities?(): Promise<AITranslatorCapabilities>;
}

/**
 * Availability status reported by every Chrome Built-in AI factory's `availability()`.
 *
 * - `available` — the on-device model is present; inference can start immediately.
 * - `downloadable` — the API exists but Chrome has not fetched the model yet. A
 *   `create()` call from a user activation will start the download.
 * - `downloading` — a fetch is already in flight.
 * - `unavailable` — this device or build cannot run the model at all.
 */
export type ChromeAIAvailability =
  | 'available'
  | 'downloadable'
  | 'downloading'
  | 'unavailable';

/** Availability status reported by Chrome's Prompt API `LanguageModel.availability()` */
export type AILanguageModelAvailability = ChromeAIAvailability;

/** Options accepted by Chrome's `LanguageModel.create()` factory */
export interface AILanguageModelCreateOptions {
  /** Initial conversation prompts (system + history) */
  initialPrompts?: { role: 'system' | 'user' | 'assistant'; content: string }[];
  /** Sampling temperature (0–1) */
  temperature?: number;
  /** Top-K sampling cutoff */
  topK?: number;
  /** Optional callback receiving an EventTarget that fires `downloadprogress` events */
  monitor?: (m: EventTarget) => void;
  /** AbortSignal for cancellation of session creation */
  signal?: AbortSignal;
}

/** Options for per-call `prompt()` / `promptStreaming()` invocations */
export interface AILanguageModelPromptOptions {
  /** AbortSignal for cancellation of the in-flight prompt */
  signal?: AbortSignal;
}

/** Chrome AI Prompt API session (Gemini Nano) */
export interface AILanguageModel {
  /** Generate a single completion */
  prompt(input: string, options?: AILanguageModelPromptOptions): Promise<string>;
  /** Stream a completion as a `ReadableStream<string>` of deltas */
  promptStreaming(input: string, options?: AILanguageModelPromptOptions): ReadableStream<string>;
  /** Destroy the session and free resources */
  destroy(): void;
  /** Tokens consumed by the session so far (where exposed) */
  readonly inputUsage?: number;
  /** Maximum input budget the session was created with (where exposed) */
  readonly inputQuota?: number;
  /** Clone the session for branching conversations (where exposed) */
  clone?(): Promise<AILanguageModel>;
}

/** Chrome AI Prompt API factory (`window.LanguageModel`) */
export interface AILanguageModelFactory {
  /** Create a Prompt API session (Gemini Nano) */
  create(options?: AILanguageModelCreateOptions): Promise<AILanguageModel>;
  /** Check whether the on-device model is available */
  availability(options?: AILanguageModelCreateOptions): Promise<AILanguageModelAvailability>;
}

/** Chrome AI namespace on the global scope */
export interface ChromeAINamespace {
  summarizer?: AISummarizerFactory;
  translator?: AITranslatorFactory;
  languageModel?: AILanguageModelFactory;
}

// Extend the global scope
declare global {
  interface WindowOrWorkerGlobalScope {
    ai?: ChromeAINamespace;
  }
  interface Window {
    /** Chrome 148+ Prompt API for web pages (top-level surface) */
    LanguageModel?: AILanguageModelFactory;
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
  /** Summary type (default: 'tldr') */
  type?: 'key-points' | 'tldr' | 'teaser' | 'headline';
  /** Output format (default: 'plain-text') */
  format?: 'markdown' | 'plain-text';
  /** Summary length (default: 'medium') */
  length?: 'short' | 'medium' | 'long';
  /** Shared context for all summarizations */
  sharedContext?: string;
  /**
   * Opt in to letting Chrome download the on-device model when `availability()`
   * reports `downloadable`. Without this the model throws rather than starting a
   * large download the user never asked for. Chrome requires a user activation.
   */
  allowDownload?: boolean;
  /** Callback for model download progress (forwarded via `monitor`) */
  onProgress?: (progress: { loaded: number; total: number }) => void;
}

/** Settings for creating a Chrome AI translator */
export interface ChromeAITranslatorSettings {
  /** Default source language (BCP 47 tag) */
  sourceLanguage?: string;
  /** Default target language (BCP 47 tag) */
  targetLanguage?: string;
  /**
   * Opt in to letting Chrome download the language pack when `availability()`
   * reports `downloadable`. Chrome requires a user activation.
   */
  allowDownload?: boolean;
  /** Callback for language-pack download progress (forwarded via `monitor`) */
  onProgress?: (progress: { loaded: number; total: number }) => void;
}

/** Settings for creating a Chrome AI language model (Prompt API / Gemini Nano) */
export interface ChromeAILanguageModelSettings {
  /** System prompt prepended to every session as `initialPrompts[0]` */
  systemPrompt?: string;
  /** Sampling temperature (0–1) forwarded to `LanguageModel.create()` */
  temperature?: number;
  /** Top-K sampling cutoff forwarded to `LanguageModel.create()` */
  topK?: number;
  /** Soft documentation value for `model.contextLength` (default 6144) */
  contextLength?: number;
  /** Callback for Gemini Nano download progress (forwarded via `monitor`) */
  onProgress?: (progress: { loaded: number; total: number }) => void;
  /**
   * Opt in to letting Chrome download Gemini Nano when `availability()` reports
   * `downloadable`. Also settable per call via
   * `providerOptions: { chromeAI: { allowDownload: true } }`.
   */
  allowDownload?: boolean;
}

/** Chrome AI provider interface */
export interface ChromeAIProvider {
  /** Create a summarization model using Chrome's built-in Summarizer API */
  summarizer(settings?: ChromeAISummarizerSettings): import('@localmode/core').SummarizationModel;
  /** Create a translation model using Chrome's built-in Translator API */
  translator(settings?: ChromeAITranslatorSettings): import('@localmode/core').TranslationModel;
  /** Create a language model using Chrome's built-in Prompt API (Gemini Nano) */
  languageModel(settings?: ChromeAILanguageModelSettings): import('@localmode/core').LanguageModel;
}
