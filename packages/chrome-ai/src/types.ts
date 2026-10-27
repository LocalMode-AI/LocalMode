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
  /** BCP 47 tags of the languages the input will be in */
  expectedInputLanguages?: string[];
  /** BCP 47 tags of the languages `sharedContext` / per-call `context` will be in */
  expectedContextLanguages?: string[];
  /** BCP 47 tag of the language to write the summary in */
  outputLanguage?: string;
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
  /** Stream the summary as a `ReadableStream<string>` of text chunks */
  summarizeStreaming(text: string, options?: AISummarizeOptions): ReadableStream<string>;
  /** Report how much of `inputQuota` the given input would use (where exposed) */
  measureInputUsage?(input: string, options?: AISummarizeOptions): Promise<number>;
  /** Maximum input the session accepts (where exposed) */
  readonly inputQuota?: number;
  /** The `type` the session was created with (where exposed) */
  readonly type?: string;
  /** The `format` the session was created with (where exposed) */
  readonly format?: string;
  /** The `length` the session was created with (where exposed) */
  readonly length?: string;
  /** The `sharedContext` the session was created with (where exposed) */
  readonly sharedContext?: string;
  /** Expected input languages the session was created with (where exposed) */
  readonly expectedInputLanguages?: readonly string[] | null;
  /** Expected context languages the session was created with (where exposed) */
  readonly expectedContextLanguages?: readonly string[] | null;
  /** Output language the session was created with (where exposed) */
  readonly outputLanguage?: string | null;
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
  /** Stream the translation as a `ReadableStream<string>` of text chunks (where exposed) */
  translateStreaming?(text: string, options?: { signal?: AbortSignal }): ReadableStream<string>;
  /** Report how much of `inputQuota` the given input would use (where exposed) */
  measureInputUsage?(input: string, options?: { signal?: AbortSignal }): Promise<number>;
  /** Maximum input the session accepts (where exposed) */
  readonly inputQuota?: number;
  /** Source language the session was created with (where exposed) */
  readonly sourceLanguage?: string;
  /** Target language the session was created with (where exposed) */
  readonly targetLanguage?: string;
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

/** Options for creating a Chrome AI language detector session */
export interface AILanguageDetectorCreateOptions {
  /**
   * BCP 47 tags of the languages the input is expected to be in. Chrome may need
   * extra data for some languages and reports them through `availability()`.
   */
  expectedInputLanguages?: string[];
  /** AbortSignal for cancellation of session creation */
  signal?: AbortSignal;
  /** Download-progress monitor, called with an EventTarget emitting `downloadprogress` */
  monitor?: (m: EventTarget) => void;
}

/** One candidate returned by `LanguageDetector.detect()` */
export interface AILanguageDetectionResult {
  /** BCP 47 language tag (`'und'` marks the undetermined remainder) */
  detectedLanguage: string;
  /** Confidence between 0 and 1 */
  confidence: number;
}

/** Chrome AI Language Detector session */
export interface AILanguageDetector {
  /** Detect the language of `input`; candidates are sorted by confidence, highest first */
  detect(input: string, options?: { signal?: AbortSignal }): Promise<AILanguageDetectionResult[]>;
  /** Report how much of `inputQuota` the given input would use (where exposed) */
  measureInputUsage?(input: string, options?: { signal?: AbortSignal }): Promise<number>;
  /** Maximum input the session accepts (where exposed) */
  readonly inputQuota?: number;
  /** Languages the session was created to expect (where exposed) */
  readonly expectedInputLanguages?: readonly string[] | null;
  /** Destroy the session and free resources */
  destroy(): void;
}

/** Chrome AI Language Detector factory (`self.LanguageDetector`, or legacy `self.ai.languageDetector`) */
export interface AILanguageDetectorFactory {
  /** Create a language detector session */
  create(options?: AILanguageDetectorCreateOptions): Promise<AILanguageDetector>;
  /**
   * Current on-device model state. Present on the modern `self.LanguageDetector`
   * global; absent on the legacy `self.ai.languageDetector` surface.
   */
  availability?(options?: { expectedInputLanguages?: string[] }): Promise<ChromeAIAvailability>;
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
  languageDetector?: AILanguageDetectorFactory;
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
// Streaming, Input Quota and Model Info
// ============================================================================

/** Timing of one streamed request, all values from `performance.now()` */
export interface ChromeAIStreamTiming {
  /** Just before the streaming method was called (session already created) */
  requestedAt: number;
  /** When the first non-empty chunk arrived; `null` if Chrome sent none */
  firstChunkAt: number | null;
  /** When the stream closed */
  endedAt: number;
  /** Non-empty chunks received */
  chunkCount: number;
  /** Characters received across all chunks */
  chars: number;
}

/**
 * One item from `doStreamSummarize()` / `doStreamTranslate()`.
 *
 * Text chunks are `{ text, done: false, timestamp }`, exactly as Chrome delivered them.
 * The last item is `{ text: '', done: true, timestamp, timing, usage }`.
 */
export interface ChromeAIStreamChunk {
  /** Text Chrome delivered in this chunk (empty on the final item) */
  text: string;
  /** `true` only on the final item */
  done: boolean;
  /** `performance.now()` when the chunk was received (the end time on the final item) */
  timestamp: number;
  /** Request, first-chunk and end times (final item only) */
  timing?: ChromeAIStreamTiming;
  /** Estimated tokens and duration from request to end (final item only) */
  usage?: { inputTokens: number; outputTokens: number; durationMs: number };
}

/** Options for `ChromeAISummarizer.doStreamSummarize()` */
export interface ChromeAIStreamSummarizeOptions {
  /** Text to summarize */
  text: string;
  /** Per-call context, forwarded to `summarizeStreaming()` */
  context?: string;
  /** Mapped to Chrome's `length` as in `doSummarize()` (<=50 short, <=150 medium, else long) */
  maxLength?: number;
  /** AbortSignal; aborting errors the stream with an `AbortError` */
  abortSignal?: AbortSignal;
  /** `{ chromeAI: { type, format, length, sharedContext } }` override the settings */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/** Options for `ChromeAITranslator.doStreamTranslate()` */
export interface ChromeAIStreamTranslateOptions {
  /** Text to translate */
  text: string;
  /** Source language (BCP 47); defaults to the settings, then `'en'` */
  sourceLanguage?: string;
  /** Target language (BCP 47); defaults to the settings, then `'es'` */
  targetLanguage?: string;
  /** AbortSignal; aborting errors the stream with an `AbortError` */
  abortSignal?: AbortSignal;
}

/** One `{ brand, version }` entry from `navigator.userAgentData` */
export interface ChromeBrandVersion {
  brand: string;
  version: string;
}

/** What the page can read about the running Chrome build */
export interface ChromeBuildInfo {
  /** `navigator.userAgent` (reduced: minor version zeroed) */
  userAgent: string | null;
  /** `navigator.userAgentData.brands` (major versions) */
  brands: ChromeBrandVersion[] | null;
  /** `fullVersionList` high-entropy hint (full build numbers, e.g. `156.0.8078.48`) */
  fullVersionList: ChromeBrandVersion[] | null;
  /** `navigator.userAgentData.platform` */
  platform: string | null;
  /** `platformVersion` high-entropy hint */
  platformVersion: string | null;
  /** `architecture` high-entropy hint */
  architecture: string | null;
}

/** Availability recorded when the session was created */
export type ChromeAIAvailabilityAtCreate = ChromeAIAvailability | 'timeout' | 'not-checked';

/**
 * Model info for a Chrome task API session.
 *
 * Chrome exposes no model or manifest version to the page; `modelVersion` is always
 * `null`. The on-device model version is shown only on `chrome://components` and
 * `chrome://on-device-internals`, so record it from there.
 */
export interface ChromeAIModelInfo<TOptions> {
  /** Chrome API name */
  api: 'Summarizer' | 'Translator';
  /** LocalMode model id */
  modelId: string;
  /** What `availability()` returned before `create()`: `'timeout'` if it never answered, `'not-checked'` on the legacy surface */
  availabilityAtCreate: ChromeAIAvailabilityAtCreate;
  /** Options passed to `create()` */
  requestedOptions: TOptions;
  /** Options as the session reports them back (`null` where Chrome exposes none) */
  sessionOptions: { [K in keyof TOptions]: TOptions[K] | null };
  /** `session.inputQuota`, or `null` where not exposed */
  inputQuota: number | null;
  /** Always `null`: Chrome does not expose a model version to web pages */
  modelVersion: null;
  /** Chrome build from `navigator.userAgentData` */
  browser: ChromeBuildInfo;
}

/** Summarizer options recorded in `ChromeAIModelInfo` */
export interface ChromeAISummarizerInfoOptions {
  type: string;
  format: string;
  length: string;
  sharedContext: string | undefined;
  expectedInputLanguages: string[] | undefined;
  expectedContextLanguages: string[] | undefined;
  outputLanguage: string | undefined;
}

/** Translator options recorded in `ChromeAIModelInfo` */
export interface ChromeAITranslatorInfoOptions {
  sourceLanguage: string;
  targetLanguage: string;
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
   * BCP 47 tag of the language to write the summary in (Chrome 156 accepts `en`, `es`,
   * `ja`, `de`, `fr`). Chrome logs a console warning when it is not set. Default: unset.
   */
  outputLanguage?: string;
  /** BCP 47 tags of the languages the input will be in. Default: unset. */
  expectedInputLanguages?: string[];
  /** BCP 47 tags of the languages `sharedContext` will be in. Default: unset. */
  expectedContextLanguages?: string[];
  /**
   * Opt in to letting Chrome download the on-device model when `availability()`
   * reports `downloadable`. Without this the model throws rather than starting a
   * large download the user never asked for. Chrome requires a user activation.
   */
  allowDownload?: boolean;
  /**
   * Callback for model download progress (forwarded via `monitor`).
   *
   * Chrome reports progress as a fraction, not bytes: `loaded` runs from 0 to 1 and
   * `total` is 1.
   */
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
  /**
   * Callback for language-pack download progress (forwarded via `monitor`).
   *
   * Chrome reports progress as a fraction, not bytes: `loaded` runs from 0 to 1 and
   * `total` is 1.
   */
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
  /**
   * Callback for Gemini Nano download progress (forwarded via `monitor`).
   *
   * Chrome reports progress as a fraction, not bytes: `loaded` runs from 0 to 1 and
   * `total` is 1.
   */
  onProgress?: (progress: { loaded: number; total: number }) => void;
  /**
   * Opt in to letting Chrome download Gemini Nano when `availability()` reports
   * `downloadable`. Also settable per call via
   * `providerOptions: { chromeAI: { allowDownload: true } }`.
   */
  allowDownload?: boolean;
}

/** Settings for creating a Chrome AI language detector */
export interface ChromeAILanguageDetectorSettings {
  /** BCP 47 tags of the languages the input is expected to be in (forwarded to Chrome) */
  expectedInputLanguages?: string[];
  /**
   * Keep only the `topK` most confident languages. Default: every candidate Chrome
   * returns. Also settable per call via `providerOptions: { chromeAI: { topK } }`.
   */
  topK?: number;
  /**
   * Opt in to letting Chrome download the language detection model when
   * `availability()` reports `downloadable`. Also settable per call via
   * `providerOptions: { chromeAI: { allowDownload: true } }`. Chrome requires a
   * user activation.
   */
  allowDownload?: boolean;
  /**
   * Callback for model download progress (forwarded via `monitor`).
   *
   * Chrome reports progress as a fraction, not bytes: `loaded` runs from 0 to 1 and
   * `total` is 1.
   */
  onProgress?: (progress: { loaded: number; total: number }) => void;
}

/** Chrome AI provider interface */
export interface ChromeAIProvider {
  /**
   * Create a summarization model using Chrome's built-in Summarizer API. The returned
   * `SummarizationModel` also has `doStreamSummarize()`, `measureInputUsage()`,
   * `getInputQuota()` and `getModelInfo()`.
   */
  summarizer(settings?: ChromeAISummarizerSettings): import('./implementations/summarizer.js').ChromeAISummarizer;
  /**
   * Create a translation model using Chrome's built-in Translator API. The returned
   * `TranslationModel` also has `doStreamTranslate()`, `measureInputUsage()`,
   * `getInputQuota()` and `getModelInfo()`.
   */
  translator(settings?: ChromeAITranslatorSettings): import('./implementations/translator.js').ChromeAITranslator;
  /** Create a language model using Chrome's built-in Prompt API (Gemini Nano) */
  languageModel(settings?: ChromeAILanguageModelSettings): import('@localmode/core').LanguageModel;
  /** Create a language detection model using Chrome's built-in Language Detector API */
  languageDetector(
    settings?: ChromeAILanguageDetectorSettings
  ): import('@localmode/core').LanguageDetectionModel;
}
