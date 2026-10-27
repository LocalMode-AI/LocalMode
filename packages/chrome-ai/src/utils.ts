/**
 * Chrome AI Feature Detection Utilities
 *
 * @packageDocumentation
 */

import type {
  AILanguageDetectorFactory,
  AISummarizerFactory,
  AITranslatorFactory,
  ChromeAIAvailability,
  ChromeBrandVersion,
  ChromeBuildInfo,
} from './types.js';

/**
 * Default deadline for a Chrome `availability()` probe.
 *
 * Chrome normally answers in ~1ms, but `Translator.availability()` has been observed
 * never to settle on some builds (headless Chromium, profiles without the translation
 * service). Awaiting it unguarded wedges the caller, so probes are raced against this.
 */
export const CHROME_AVAILABILITY_TIMEOUT_MS = 3000;

/**
 * Await `availability()` with a deadline. Resolves to `'timeout'` if the browser
 * never answers, so a caller can decide rather than hang.
 * @internal
 */
export async function availabilityWithDeadline(
  probe: () => Promise<string>,
  timeoutMs: number = CHROME_AVAILABILITY_TIMEOUT_MS,
): Promise<ChromeAIAvailability | 'timeout'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      probe(),
      new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), timeoutMs);
      }),
    ]);
    if (result === 'timeout') return 'timeout';
    if (result === 'readily') return 'available';
    if (result === 'after-download') return 'downloadable';
    if (result === 'no') return 'unavailable';
    return result as ChromeAIAvailability;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Legacy `self.ai.*` namespace, used by Chrome 127–137 origin-trial builds. Current
 * Chrome exposes each API as its own top-level global (`self.Summarizer`, etc.) and
 * does NOT define `self.ai` at all, so every detector below must check the modern
 * surface first and treat the legacy namespace as a fallback.
 */
interface LegacyAINamespace {
  summarizer?: unknown;
  translator?: unknown;
  languageModel?: unknown;
  languageDetector?: unknown;
}

function legacyAI(): LegacyAINamespace | undefined {
  if (typeof self === 'undefined') return undefined;
  return (self as unknown as { ai?: LegacyAINamespace }).ai;
}

/**
 * Check if any Chrome Built-in AI API is supported.
 *
 * Returns true when at least one of the Summarizer, Translator, Language Detector, or
 * Prompt APIs is
 * present, on either the modern top-level globals or the legacy `self.ai` namespace.
 *
 * @returns true if Chrome AI APIs are available
 */
export function isChromeAISupported(): boolean {
  return (
    isSummarizerAPISupported() ||
    isTranslatorAPISupported() ||
    isLanguageDetectorSupported() ||
    isPromptAPISupported()
  );
}

/**
 * Check if Chrome AI Summarizer API is supported.
 *
 * Reads the modern `self.Summarizer` global (Chrome 138+), falling back to the legacy
 * `self.ai.summarizer` surface.
 *
 * @returns true if the Summarizer API is available
 */
export function isSummarizerAPISupported(): boolean {
  if (typeof self === 'undefined') return false;
  if ('Summarizer' in self) return true;
  return Boolean(legacyAI()?.summarizer);
}

/**
 * Check if Chrome AI Translator API is supported.
 *
 * Reads the modern `self.Translator` global (Chrome 138+), falling back to the legacy
 * `self.ai.translator` surface.
 *
 * @returns true if the Translator API is available
 */
export function isTranslatorAPISupported(): boolean {
  if (typeof self === 'undefined') return false;
  if ('Translator' in self) return true;
  return Boolean(legacyAI()?.translator);
}

/**
 * Check if Chrome AI Language Detector API (`self.LanguageDetector`) is supported.
 *
 * Reads the modern `self.LanguageDetector` global (Chrome 138+ on desktop), falling back
 * to the legacy `self.ai.languageDetector` surface. Synchronous and never throws: in
 * non-Chromium browsers, Web Workers (the API is window-only) and Node-like
 * environments it returns `false`.
 *
 * @returns true if the Language Detector API is present
 *
 * @example
 * ```ts
 * import { isLanguageDetectorSupported } from '@localmode/chrome-ai';
 *
 * if (isLanguageDetectorSupported()) {
 *   // Safe to call chromeAI.languageDetector()
 * }
 * ```
 *
 * @see https://developer.chrome.com/docs/ai/language-detection
 */
export function isLanguageDetectorSupported(): boolean {
  if (typeof self === 'undefined') return false;
  if ('LanguageDetector' in self) return true;
  return Boolean(legacyAI()?.languageDetector);
}

/**
 * Check if Chrome AI Prompt API (`window.LanguageModel`) is supported.
 *
 * The Prompt API shipped for web pages in Chrome 148 stable, at the top-level
 * `window.LanguageModel`. (It has been stable for Chrome Extensions since Chrome 138 —
 * that earlier milestone does NOT apply to web pages.) Chrome 127–137 origin-trial builds
 * exposed it as `self.ai.languageModel`. This detector accepts either surface so apps
 * written against current Chrome stable continue to work during future namespace migrations.
 *
 * Note: `temperature` and `topK` remain gated behind the "Prompt API sampling parameters"
 * origin trial on web pages; the core API itself is stable.
 *
 * In non-Chromium browsers (Firefox, Safari, etc.) and in Node-like environments where
 * `self` is undefined, this returns `false` without throwing.
 *
 * @returns true if either `window.LanguageModel` or the legacy `self.ai.languageModel`
 *   surface is present; `false` otherwise.
 *
 * @example
 * ```ts
 * import { isPromptAPISupported } from '@localmode/chrome-ai';
 *
 * if (isPromptAPISupported()) {
 *   // Safe to call chromeAI.languageModel()
 * }
 * ```
 */
export function isPromptAPISupported(): boolean {
  if (typeof self === 'undefined') return false;
  if ('LanguageModel' in self) return true;
  return Boolean(legacyAI()?.languageModel);
}

/**
 * Resolve the Summarizer factory from the modern global or the legacy namespace.
 * @internal
 */
export function getSummarizerFactory(): AISummarizerFactory | null {
  if (typeof self === 'undefined') return null;
  const top = (self as unknown as { Summarizer?: AISummarizerFactory }).Summarizer;
  if (top) return top;
  return (legacyAI()?.summarizer as AISummarizerFactory | undefined) ?? null;
}

/**
 * Resolve the Translator factory from the modern global or the legacy namespace.
 * @internal
 */
export function getTranslatorFactory(): AITranslatorFactory | null {
  if (typeof self === 'undefined') return null;
  const top = (self as unknown as { Translator?: AITranslatorFactory }).Translator;
  if (top) return top;
  return (legacyAI()?.translator as AITranslatorFactory | undefined) ?? null;
}

/**
 * Resolve the Language Detector factory from the modern global or the legacy namespace.
 * @internal
 */
export function getLanguageDetectorFactory(): AILanguageDetectorFactory | null {
  if (typeof self === 'undefined') return null;
  const top = (self as unknown as { LanguageDetector?: AILanguageDetectorFactory }).LanguageDetector;
  if (top) return top;
  return (legacyAI()?.languageDetector as AILanguageDetectorFactory | undefined) ?? null;
}

/**
 * Estimate token count from text.
 *
 * Uses a rough heuristic of ~0.75 words per token.
 *
 * @param text - Text to estimate tokens for
 * @returns Estimated token count
 */
export function estimateTokens(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.ceil(words / 0.75);
}

/**
 * Read what the page can see about the running Chrome build.
 *
 * Returns `navigator.userAgent`, the low-entropy `navigator.userAgentData.brands` and
 * `platform`, and the `fullVersionList`, `platformVersion` and `architecture` hints from
 * `getHighEntropyValues()`. Fields the browser does not expose are `null` (Firefox and
 * Safari have no `userAgentData`). Never throws.
 *
 * Chrome does not expose the version of its on-device models to web pages; read that
 * from `chrome://components` or `chrome://on-device-internals` outside the page.
 *
 * @returns The Chrome build info
 *
 * @example
 * ```ts
 * import { getChromeBuildInfo } from '@localmode/chrome-ai';
 *
 * const { fullVersionList } = await getChromeBuildInfo();
 * // [{ brand: 'Google Chrome', version: '156.0.8078.48' }, ...]
 * ```
 */
export async function getChromeBuildInfo(): Promise<ChromeBuildInfo> {
  const info: ChromeBuildInfo = {
    userAgent: null,
    brands: null,
    fullVersionList: null,
    platform: null,
    platformVersion: null,
    architecture: null,
  };
  if (typeof navigator === 'undefined') return info;
  info.userAgent = typeof navigator.userAgent === 'string' ? navigator.userAgent : null;

  const uaData = (navigator as unknown as {
    userAgentData?: {
      brands?: ChromeBrandVersion[];
      platform?: string;
      getHighEntropyValues?: (hints: string[]) => Promise<Record<string, unknown>>;
    };
  }).userAgentData;
  if (!uaData) return info;

  info.brands = Array.isArray(uaData.brands) ? uaData.brands.map((b) => ({ ...b })) : null;
  info.platform = typeof uaData.platform === 'string' ? uaData.platform : null;

  if (typeof uaData.getHighEntropyValues === 'function') {
    try {
      const high = await uaData.getHighEntropyValues([
        'fullVersionList',
        'platformVersion',
        'architecture',
      ]);
      const list = high.fullVersionList;
      if (Array.isArray(list)) {
        info.fullVersionList = (list as ChromeBrandVersion[]).map((b) => ({ ...b }));
      }
      if (typeof high.platformVersion === 'string') info.platformVersion = high.platformVersion;
      if (typeof high.architecture === 'string') info.architecture = high.architecture;
    } catch {
      // High-entropy hints can be refused; the low-entropy fields stay.
    }
  }
  return info;
}

/**
 * Read a `ReadableStream<string>` chunk by chunk, stamping each with `performance.now()`
 * as it arrives. Empty chunks are skipped. The reader is cancelled and released when
 * the consumer stops early or the stream errors.
 * @internal
 */
export async function* readTimedTextStream(
  stream: ReadableStream<string>,
): AsyncGenerator<{ text: string; timestamp: number }> {
  const reader = stream.getReader();
  let finished = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      const timestamp = performance.now();
      if (done) {
        finished = true;
        return;
      }
      if (typeof value === 'string' && value.length > 0) {
        yield { text: value, timestamp };
      }
    }
  } finally {
    if (!finished) {
      try {
        await reader.cancel();
      } catch {
        // An errored stream rejects cancel(); the original error is already propagating.
      }
    }
    reader.releaseLock();
  }
}

/**
 * Normalize a thrown value to an `Error`-shaped cause, keeping DOMExceptions (which are
 * not `instanceof Error` in every realm) as they are.
 * @internal
 */
export function toErrorCause(err: unknown): Error {
  if (err instanceof Error) return err;
  if (err && typeof err === 'object' && typeof (err as { name?: unknown }).name === 'string') {
    return err as Error;
  }
  return new Error(String(err));
}
