'use client';

/**
 * @file use-provider-fallback.ts
 * @description Per-capability Chrome Built-in AI ⇄ Transformers.js provider
 * resolution. Detection is independent per capability (Summarizer API,
 * Translator API, Prompt API) and reads the browser globals directly, so one
 * capability can be Chrome-AI-served while another falls back in the same
 * session. Resolution is lazy and session-cached (per capability, per Chrome
 * summary style + length, per language pair, per fallback modelId + device);
 * every provider package is loaded via dynamic `import()` inside the resolution
 * path so nothing about a provider ships until a capability first resolves.
 *
 * `@localmode/react` gains NO hard dependency on `@localmode/chrome-ai` or
 * `@localmode/transformers`: the default loaders dynamic-import them at runtime
 * (the consumer supplies them), and the loaders are injectable for testing or
 * custom provider builds.
 *
 * Badge truthfulness: each resolution returns the resolved model instance
 * together with its provider identity, modelId, and tier, and updates the
 * hook's `resolution` provenance, so a badge derives from what ACTUALLY serves
 * requests — never from the detection probe alone.
 */

import { useCallback, useRef, useState } from 'react';
import type {
  FillMaskModel,
  LanguageModel,
  SummarizationModel,
  TranslationModel,
} from '@localmode/core';

/* ─────────────────────────────── public types ────────────────────────────── */

/** The provider that actually serves a capability's requests. */
export type ProviderId = 'chrome-ai' | 'transformers';

/** Badge tier derived from the resolved provider. */
export type ProviderTier = 'built-in' | 'download';

/** The four capabilities the hook resolves. */
export type ProviderCapability = 'summarize' | 'translate' | 'edit' | 'fill-mask';

/** Chrome Summarizer API summary style (mirrors the browser Summarizer `type`). */
export type ChromeSummaryStyle = 'tl;dr' | 'key-points' | 'teaser' | 'headline';

/** Chrome Summarizer API output length. */
export type ChromeSummaryLength = 'short' | 'medium' | 'long';

/**
 * A resolved model instance plus the provenance a badge/witness derives from.
 * `tier` is derived from `provider` so a badge can render directly off this.
 */
export interface ResolvedModel<M> {
  /** The concrete model instance (Chrome AI or Transformers.js). */
  model: M;
  /** The provider that will serve requests through `model`. */
  provider: ProviderId;
  /** `model.modelId` (e.g. `chrome-ai:gemini-nano-summarizer`, `transformers:Xenova/...`). */
  modelId: string;
  /** `'built-in'` for Chrome AI, `'download'` for Transformers.js. */
  tier: ProviderTier;
}

/** Last-resolved provenance — the truthful badge source. */
export interface ProviderResolution {
  capability: ProviderCapability;
  provider: ProviderId;
  modelId: string;
  tier: ProviderTier;
}

/** Params for {@link UseProviderFallbackReturn.resolveSummarizer}. */
export interface ResolveSummarizerParams {
  /** Chrome summary style (used when Chrome AI serves). */
  chromeStyle: ChromeSummaryStyle;
  /** Chrome summary length (used when Chrome AI serves). */
  length: ChromeSummaryLength;
  /** Transformers.js fallback model id (used when Chrome AI is unavailable). */
  fallbackModelId: string;
}

/** Params for {@link UseProviderFallbackReturn.resolveTranslator}. */
export interface ResolveTranslatorParams {
  /** Source (BCP-47-ish) language code. */
  source: string;
  /** Target language code. */
  target: string;
  /** Transformers.js fallback model id for this directed pair. */
  fallbackModelId: string;
}

/** Params for {@link UseProviderFallbackReturn.resolveEditEngine}. */
export interface ResolveEditEngineParams {
  /** Transformers.js fallback instruct model id. */
  fallbackModelId: string;
  /** Compute device for the Transformers.js fallback. */
  device: 'webgpu' | 'wasm';
}

/* ─────────────────────────── provider module shapes ──────────────────────── */
// Structural shapes of the (dynamically-imported) provider packages — only the
// factories this hook calls. Defined locally so `@localmode/react` type-checks
// and ships without a build- or runtime-time dependency on the providers.

interface ChromeAIProviderLike {
  summarizer(settings?: { type?: ChromeSummaryStyle; length?: ChromeSummaryLength }): SummarizationModel;
  translator(settings?: { sourceLanguage: string; targetLanguage: string }): TranslationModel;
  languageModel(settings?: Record<string, unknown>): LanguageModel;
}

/** Shape of the `@localmode/chrome-ai` module used here. */
export interface ChromeAIModuleLike {
  chromeAI: ChromeAIProviderLike;
}

interface TransformersProviderLike {
  summarizer(modelId: string): SummarizationModel;
  translator(modelId: string): TranslationModel;
  fillMask(modelId: string): FillMaskModel;
  languageModel(modelId: string, options?: { device?: 'webgpu' | 'wasm' }): LanguageModel;
}

/** Shape of the `@localmode/transformers` module used here. */
export interface TransformersModuleLike {
  transformers: TransformersProviderLike;
}

/** Loads the `@localmode/chrome-ai` module (defaults to a dynamic import). */
export type LoadChromeAI = () => Promise<ChromeAIModuleLike>;

/** Loads the `@localmode/transformers` module (defaults to a dynamic import). */
export type LoadTransformers = () => Promise<TransformersModuleLike>;

/** Options for {@link useProviderFallback}. */
export interface UseProviderFallbackOptions {
  /**
   * Override the `@localmode/chrome-ai` loader. Defaults to a dynamic
   * `import('@localmode/chrome-ai')`. Provide a fake for testing or a custom
   * provider build.
   */
  loadChromeAI?: LoadChromeAI;
  /**
   * Override the `@localmode/transformers` loader. Defaults to a dynamic
   * `import('@localmode/transformers')`.
   */
  loadTransformers?: LoadTransformers;
}

/** Return surface of {@link useProviderFallback}. */
export interface UseProviderFallbackReturn {
  /** Resolve the summarization model (Chrome Summarizer API ⇄ DistilBART fallback). */
  resolveSummarizer: (params: ResolveSummarizerParams) => Promise<ResolvedModel<SummarizationModel>>;
  /** Resolve the translation model (Chrome Translator API ⇄ Opus-MT fallback). */
  resolveTranslator: (params: ResolveTranslatorParams) => Promise<ResolvedModel<TranslationModel>>;
  /** Resolve the AI-edit engine (Chrome Prompt API ⇄ Transformers.js instruct fallback). */
  resolveEditEngine: (params: ResolveEditEngineParams) => Promise<ResolvedModel<LanguageModel>>;
  /** Resolve the fill-mask model (Transformers.js only — no Chrome equivalent). */
  resolveFillMask: (modelId: string) => Promise<ResolvedModel<FillMaskModel>>;
  /** Last resolved provider/model — the truthful badge source, or null. */
  resolution: ProviderResolution | null;
  /** True while any resolver is in flight. */
  isResolving: boolean;
  /** Last resolution error, or null. */
  error: Error | null;
}

/* ─────────────────────────── capability detection ────────────────────────── */
// Synchronous global probes (kept `async` for a uniform capability API and
// because Prompt detection awaits `availability()`). These read the SAME
// browser surfaces the `@localmode/chrome-ai` detectors read, so the hook needs
// no provider import to detect.

interface SelfWithAI {
  ai?: { summarizer?: unknown; translator?: unknown; languageModel?: unknown };
  LanguageModel?: { availability?: () => Promise<string> };
}

/** Is the Chrome Summarizer API available in this browser? */
export async function detectSummarizerProvider(): Promise<ProviderId> {
  if (typeof self === 'undefined') return 'transformers';
  const ai = (self as unknown as SelfWithAI).ai;
  return ai && 'summarizer' in ai ? 'chrome-ai' : 'transformers';
}

/** Is the Chrome Translator API available in this browser? */
export async function detectTranslatorProvider(): Promise<ProviderId> {
  if (typeof self === 'undefined') return 'transformers';
  const ai = (self as unknown as SelfWithAI).ai;
  return ai && 'translator' in ai ? 'chrome-ai' : 'transformers';
}

/**
 * Is the Chrome Prompt API (Gemini Nano) *usable* in this browser? Presence is
 * not enough: a present API can still be merely `'downloadable'`, and
 * committing to it would either fail or silently trigger a large Gemini Nano
 * download the user never requested. So this additionally gates on
 * `LanguageModel.availability()`: Chrome AI is used only when the on-device
 * model is actually `'available'`; every other state falls back to the smaller
 * Transformers.js instruct model behind the block's explicit download gate.
 * The legacy `self.ai.languageModel` surface (no `availability()`) trusts
 * presence.
 */
export async function detectPromptProvider(): Promise<ProviderId> {
  if (typeof self === 'undefined') return 'transformers';
  const globalSelf = self as unknown as SelfWithAI;
  const present =
    'LanguageModel' in (self as object) ||
    Boolean(globalSelf.ai && 'languageModel' in globalSelf.ai);
  if (!present) return 'transformers';
  const lm = globalSelf.LanguageModel;
  if (lm && typeof lm.availability === 'function') {
    try {
      return (await lm.availability()) === 'available' ? 'chrome-ai' : 'transformers';
    } catch {
      return 'transformers';
    }
  }
  // Legacy `self.ai.languageModel` path (no availability()): trust presence.
  return 'chrome-ai';
}

/* ──────────────────────────── tier / name helpers ────────────────────────── */

/** Map a {@link ProviderId} to its badge tier. */
export function providerTier(provider: ProviderId): ProviderTier {
  return provider === 'chrome-ai' ? 'built-in' : 'download';
}

/** Human-readable provider name for a badge. */
export function providerName(provider: ProviderId): string {
  return provider === 'chrome-ai' ? 'Chrome AI' : 'Transformers.js';
}

/* ─────────────────────────── default provider loaders ─────────────────────── */
// Loading through a function boundary keeps the bundler from statically
// resolving (and thus requiring) the optional provider packages: the specifier
// arrives as a runtime value, so the `import()` stays external and only
// executes when a capability first resolves. The magic comments keep Vite and
// webpack consumers from analyzing it too.
function importOptional<T>(pkg: string): Promise<T> {
  // Bundler-opaque dynamic import: a Function-constructed importer leaves no
  // statically-analyzable \`import()\` node, so consumers' bundlers (webpack,
  // Turbopack, Vite) never attempt to resolve the optional provider packages.
  // Strict-CSP consumers (no unsafe-eval) should inject \`loadChromeAI\`/
  // \`loadTransformers\` overrides that use literal imports instead.
  const importer = new Function('s', 'return import(s)') as (s: string) => Promise<T>;
  return importer(pkg);
}

const defaultLoadChromeAI: LoadChromeAI = () =>
  importOptional<ChromeAIModuleLike>('@localmode/chrome-ai');

const defaultLoadTransformers: LoadTransformers = () =>
  importOptional<TransformersModuleLike>('@localmode/transformers');

/* ──────────────────────────────── resolvers ──────────────────────────────── */

function makeResolved<M extends { modelId: string }>(
  model: M,
  provider: ProviderId,
): ResolvedModel<M> {
  return { model, provider, modelId: model.modelId, tier: providerTier(provider) };
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

/**
 * Per-capability Chrome Built-in AI ⇄ Transformers.js provider resolution with
 * session caching and truthful provenance.
 *
 * The four capabilities take different params and the split write / translate /
 * summarize / complete surfaces each use exactly one, so the hook exposes
 * capability-scoped resolvers (rather than one monolithic `resolve(request)`)
 * to keep each consumer's bundle minimal. Each resolver:
 *
 * 1. Returns a session-cached {@link ResolvedModel} immediately on a repeat
 *    call with identical params (no re-detection, no re-construction).
 * 2. Otherwise detects the provider from the browser globals, constructs the
 *    model via a dynamically-imported provider package, caches it, and updates
 *    `resolution` so a badge reflects what ACTUALLY serves requests.
 *
 * `resolveFillMask` has no Chrome equivalent and always resolves
 * `transformers` / `download`.
 *
 * @param options - Optional provider-loader overrides (default: dynamic import)
 * @returns The four capability resolvers plus `resolution` / `isResolving` / `error`
 *
 * @example
 * ```tsx
 * import { useProviderFallback, providerName } from '@localmode/react';
 *
 * function SummarizeTab() {
 *   const { resolveSummarizer, resolution, isResolving } = useProviderFallback();
 *
 *   async function run(text: string) {
 *     const { model } = await resolveSummarizer({
 *       chromeStyle: 'key-points',
 *       length: 'medium',
 *       fallbackModelId: 'Xenova/distilbart-cnn-6-6',
 *     });
 *     return summarize({ model, text });
 *   }
 *
 *   return resolution ? <Badge provider={providerName(resolution.provider)} tier={resolution.tier} /> : null;
 * }
 * ```
 *
 * @throws Never throws during render; each resolver rejects with the underlying
 * error (also exposed via `error`).
 * @see detectSummarizerProvider / detectTranslatorProvider / detectPromptProvider
 */
export function useProviderFallback(
  options: UseProviderFallbackOptions = {},
): UseProviderFallbackReturn {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [resolution, setResolution] = useState<ProviderResolution | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Session caches (per hook instance). Keyed by the full param signature so a
  // repeat call short-circuits BEFORE re-detecting or re-constructing.
  const summarizerCache = useRef(new Map<string, ResolvedModel<SummarizationModel>>());
  const translatorCache = useRef(new Map<string, ResolvedModel<TranslationModel>>());
  const editEngineCache = useRef(new Map<string, ResolvedModel<LanguageModel>>());
  const fillMaskCache = useRef(new Map<string, ResolvedModel<FillMaskModel>>());

  const loadChromeAI = () => (optionsRef.current.loadChromeAI ?? defaultLoadChromeAI)();
  const loadTransformers = () =>
    (optionsRef.current.loadTransformers ?? defaultLoadTransformers)();

  /** Shared bookkeeping: flip `isResolving`, publish `resolution`, surface errors. */
  const withResolution = useCallback(
    async <M>(
      capability: ProviderCapability,
      run: () => Promise<ResolvedModel<M>>,
    ): Promise<ResolvedModel<M>> => {
      setIsResolving(true);
      setError(null);
      try {
        const resolved = await run();
        setResolution({
          capability,
          provider: resolved.provider,
          modelId: resolved.modelId,
          tier: resolved.tier,
        });
        return resolved;
      } catch (err) {
        const e = toError(err);
        setError(e);
        throw e;
      } finally {
        setIsResolving(false);
      }
    },
    [],
  );

  const resolveSummarizer = useCallback(
    (params: ResolveSummarizerParams) =>
      withResolution('summarize', async () => {
        const key = `${params.chromeStyle}|${params.length}|${params.fallbackModelId}`;
        const cached = summarizerCache.current.get(key);
        if (cached) return cached;

        const provider = await detectSummarizerProvider();
        let resolved: ResolvedModel<SummarizationModel>;
        if (provider === 'chrome-ai') {
          const { chromeAI } = await loadChromeAI();
          resolved = makeResolved(
            chromeAI.summarizer({ type: params.chromeStyle, length: params.length }),
            provider,
          );
        } else {
          const { transformers } = await loadTransformers();
          resolved = makeResolved(transformers.summarizer(params.fallbackModelId), provider);
        }
        summarizerCache.current.set(key, resolved);
        return resolved;
      }),
    [withResolution],
  );

  const resolveTranslator = useCallback(
    (params: ResolveTranslatorParams) =>
      withResolution('translate', async () => {
        const key = `${params.source}|${params.target}|${params.fallbackModelId}`;
        const cached = translatorCache.current.get(key);
        if (cached) return cached;

        const provider = await detectTranslatorProvider();
        let resolved: ResolvedModel<TranslationModel>;
        if (provider === 'chrome-ai') {
          const { chromeAI } = await loadChromeAI();
          resolved = makeResolved(
            chromeAI.translator({ sourceLanguage: params.source, targetLanguage: params.target }),
            provider,
          );
        } else {
          const { transformers } = await loadTransformers();
          resolved = makeResolved(transformers.translator(params.fallbackModelId), provider);
        }
        translatorCache.current.set(key, resolved);
        return resolved;
      }),
    [withResolution],
  );

  const resolveEditEngine = useCallback(
    (params: ResolveEditEngineParams) =>
      withResolution('edit', async () => {
        const key = `${params.fallbackModelId}|${params.device}`;
        const cached = editEngineCache.current.get(key);
        if (cached) return cached;

        const provider = await detectPromptProvider();
        let resolved: ResolvedModel<LanguageModel>;
        if (provider === 'chrome-ai') {
          const { chromeAI } = await loadChromeAI();
          resolved = makeResolved(chromeAI.languageModel(), provider);
        } else {
          const { transformers } = await loadTransformers();
          resolved = makeResolved(
            transformers.languageModel(params.fallbackModelId, { device: params.device }),
            provider,
          );
        }
        editEngineCache.current.set(key, resolved);
        return resolved;
      }),
    [withResolution],
  );

  const resolveFillMask = useCallback(
    (modelId: string) =>
      withResolution('fill-mask', async () => {
        const cached = fillMaskCache.current.get(modelId);
        if (cached) return cached;

        // Fill-mask has no Chrome AI equivalent — Transformers.js only.
        const { transformers } = await loadTransformers();
        const resolved = makeResolved(transformers.fillMask(modelId), 'transformers');
        fillMaskCache.current.set(modelId, resolved);
        return resolved;
      }),
    [withResolution],
  );

  return {
    resolveSummarizer,
    resolveTranslator,
    resolveEditEngine,
    resolveFillMask,
    resolution,
    isResolving,
    error,
  };
}
