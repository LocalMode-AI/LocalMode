/**
 * @file use-provider-fallback.test.ts
 * @description Tests for the per-capability provider-fallback hook. The REAL
 * detection boundary is exercised: the standalone detectors and the hook's
 * resolvers read the actual `self.ai` / `self.LanguageModel` browser globals
 * (jsdom), which the tests stub to model each browser (present-and-available,
 * present-but-downloadable, absent). Provider CONSTRUCTION — the layer below the
 * hook — is the only thing supplied by injected fake loaders (deterministic
 * models with known modelIds); no resolver, detector, or cache is mocked. The
 * actual model download is out of scope (documented gap; the writing-tools E2E
 * covers real inference on both provider paths).
 */

import { afterEach, describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  useProviderFallback,
  detectSummarizerProvider,
  detectTranslatorProvider,
  detectPromptProvider,
  providerTier,
  providerName,
  type LoadChromeAI,
  type LoadTransformers,
} from '../src/hooks/use-provider-fallback.js';

/* ─────────────────────────── global stubs (real boundary) ────────────────── */

const globalSelf = self as unknown as {
  ai?: unknown;
  LanguageModel?: unknown;
};

/** Reset the Chrome AI browser surfaces after every test. */
afterEach(() => {
  delete globalSelf.ai;
  delete globalSelf.LanguageModel;
  vi.restoreAllMocks();
});

/** Model the browser: which `self.ai.*` capabilities exist + Prompt availability. */
function setBrowser(config: {
  summarizer?: boolean;
  translator?: boolean;
  /** undefined = no Prompt API; a string = present with that availability() */
  promptAvailability?: 'available' | 'downloadable' | 'unavailable';
  /** legacy self.ai.languageModel present (no availability()) */
  legacyPrompt?: boolean;
}) {
  const ai: Record<string, unknown> = {};
  if (config.summarizer) ai.summarizer = {};
  if (config.translator) ai.translator = {};
  if (config.legacyPrompt) ai.languageModel = {};
  globalSelf.ai = ai;
  if (config.promptAvailability !== undefined) {
    globalSelf.LanguageModel = {
      availability: vi.fn(async () => config.promptAvailability as string),
    };
  }
}

/* ───────────────────────────── injected fake loaders ─────────────────────── */

/** Fake `@localmode/chrome-ai` module — deterministic models, spied factories. */
function fakeChromeAI() {
  const summarizer = vi.fn(() => ({ modelId: 'chrome-ai:gemini-nano-summarizer', provider: 'chrome-ai' }));
  const translator = vi.fn(() => ({ modelId: 'chrome-ai:gemini-nano-translator', provider: 'chrome-ai' }));
  const languageModel = vi.fn(() => ({ modelId: 'chrome-ai:gemini-nano', provider: 'chrome-ai' }));
  const load = vi.fn(async () => ({
     
    chromeAI: { summarizer, translator, languageModel } as any,
  }));
  return { load: load as unknown as LoadChromeAI, summarizer, translator, languageModel, loadSpy: load };
}

/** Fake `@localmode/transformers` module — deterministic models, spied factories. */
function fakeTransformers() {
  const summarizer = vi.fn((id: string) => ({ modelId: `transformers:${id}`, provider: 'transformers' }));
  const translator = vi.fn((id: string) => ({ modelId: `transformers:${id}`, provider: 'transformers' }));
  const fillMask = vi.fn((id: string) => ({ modelId: `transformers:${id}`, provider: 'transformers' }));
  const languageModel = vi.fn((id: string) => ({ modelId: `transformers:${id}`, provider: 'transformers' }));
  const load = vi.fn(async () => ({
     
    transformers: { summarizer, translator, fillMask, languageModel } as any,
  }));
  return {
    load: load as unknown as LoadTransformers,
    summarizer,
    translator,
    fillMask,
    languageModel,
    loadSpy: load,
  };
}

/* ──────────────────────────── standalone detectors ───────────────────────── */

describe('detection functions (real self.* boundary)', () => {
  it('one capability served, another falls back', async () => {
    setBrowser({ summarizer: true, translator: false });
    expect(await detectSummarizerProvider()).toBe('chrome-ai');
    expect(await detectTranslatorProvider()).toBe('transformers');
  });

  it('present-but-downloadable Prompt API falls back to transformers', async () => {
    setBrowser({ promptAvailability: 'downloadable' });
    expect(await detectPromptProvider()).toBe('transformers');
  });

  it('present-and-available Prompt API resolves chrome-ai', async () => {
    setBrowser({ promptAvailability: 'available' });
    expect(await detectPromptProvider()).toBe('chrome-ai');
  });

  it('absent Prompt API falls back to transformers', async () => {
    setBrowser({}); // no LanguageModel, ai has no languageModel
    expect(await detectPromptProvider()).toBe('transformers');
  });

  it('legacy self.ai.languageModel (no availability()) trusts presence', async () => {
    setBrowser({ legacyPrompt: true });
    expect(await detectPromptProvider()).toBe('chrome-ai');
  });

  it('availability() throwing falls back to transformers', async () => {
    globalSelf.LanguageModel = {
      availability: vi.fn(async () => {
        throw new Error('probe failed');
      }),
    };
    expect(await detectPromptProvider()).toBe('transformers');
  });

  it('tier + name helpers map both providers', () => {
    expect(providerTier('chrome-ai')).toBe('built-in');
    expect(providerTier('transformers')).toBe('download');
    expect(providerName('chrome-ai')).toBe('Chrome AI');
    expect(providerName('transformers')).toBe('Transformers.js');
  });
});

/* ───────────────────────────────── the hook ──────────────────────────────── */

describe('useProviderFallback', () => {
  it('resolves chrome-ai when available and reports truthful provenance', async () => {
    setBrowser({ summarizer: true, promptAvailability: 'available' });
    const chrome = fakeChromeAI();
    const tf = fakeTransformers();
    const { result } = renderHook(() =>
      useProviderFallback({ loadChromeAI: chrome.load, loadTransformers: tf.load }),
    );

    let resolved!: Awaited<ReturnType<typeof result.current.resolveSummarizer>>;
    await act(async () => {
      resolved = await result.current.resolveSummarizer({
        chromeStyle: 'key-points',
        length: 'medium',
        fallbackModelId: 'Xenova/distilbart-cnn-6-6',
      });
    });

    expect(resolved.provider).toBe('chrome-ai');
    expect(resolved.tier).toBe('built-in');
    expect(resolved.modelId).toBe('chrome-ai:gemini-nano-summarizer');
    expect(chrome.summarizer).toHaveBeenCalledWith({ type: 'key-points', length: 'medium' });
    expect(tf.loadSpy).not.toHaveBeenCalled();

    // resolution provenance MATCHES the served model, not the detection probe.
    expect(result.current.resolution).toEqual({
      capability: 'summarize',
      provider: 'chrome-ai',
      modelId: resolved.modelId,
      tier: 'built-in',
    });
    expect(result.current.isResolving).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('falls back to transformers for a capability the browser does not serve', async () => {
    // Summarizer served by Chrome, Translator NOT — same session, different providers.
    setBrowser({ summarizer: true, translator: false });
    const chrome = fakeChromeAI();
    const tf = fakeTransformers();
    const { result } = renderHook(() =>
      useProviderFallback({ loadChromeAI: chrome.load, loadTransformers: tf.load }),
    );

    let sum!: Awaited<ReturnType<typeof result.current.resolveSummarizer>>;
    let tr!: Awaited<ReturnType<typeof result.current.resolveTranslator>>;
    await act(async () => {
      sum = await result.current.resolveSummarizer({
        chromeStyle: 'tl;dr',
        length: 'short',
        fallbackModelId: 'Xenova/distilbart-cnn-6-6',
      });
      tr = await result.current.resolveTranslator({
        source: 'en',
        target: 'es',
        fallbackModelId: 'Xenova/opus-mt-en-es',
      });
    });

    expect(sum.provider).toBe('chrome-ai');
    expect(tr.provider).toBe('transformers');
    expect(tr.tier).toBe('download');
    expect(tr.modelId).toBe('transformers:Xenova/opus-mt-en-es');
    expect(tf.translator).toHaveBeenCalledWith('Xenova/opus-mt-en-es');
    // The LAST resolution wins (translate).
    expect(result.current.resolution?.capability).toBe('translate');
    expect(result.current.resolution?.provider).toBe('transformers');
    expect(result.current.resolution?.modelId).toBe(tr.modelId);
  });

  it('session-caches a resolution: repeat identical params re-use the instance without re-constructing', async () => {
    setBrowser({ summarizer: true });
    const chrome = fakeChromeAI();
    const tf = fakeTransformers();
    const { result } = renderHook(() =>
      useProviderFallback({ loadChromeAI: chrome.load, loadTransformers: tf.load }),
    );

    const params = {
      chromeStyle: 'headline' as const,
      length: 'long' as const,
      fallbackModelId: 'Xenova/distilbart-cnn-6-6',
    };
    let first!: Awaited<ReturnType<typeof result.current.resolveSummarizer>>;
    let second!: Awaited<ReturnType<typeof result.current.resolveSummarizer>>;
    await act(async () => {
      first = await result.current.resolveSummarizer(params);
      second = await result.current.resolveSummarizer(params);
    });

    // Same ResolvedModel reference — the model was constructed exactly once and
    // the provider module was loaded exactly once (no re-detect / re-construct).
    expect(second).toBe(first);
    expect(chrome.summarizer).toHaveBeenCalledTimes(1);
    expect(chrome.loadSpy).toHaveBeenCalledTimes(1);
  });

  it('resolveFillMask always resolves transformers/download (no Chrome equivalent)', async () => {
    // Even with Chrome fully available, fill-mask has no Chrome fallback source.
    setBrowser({ summarizer: true, translator: true, promptAvailability: 'available' });
    const chrome = fakeChromeAI();
    const tf = fakeTransformers();
    const { result } = renderHook(() =>
      useProviderFallback({ loadChromeAI: chrome.load, loadTransformers: tf.load }),
    );

    let resolved!: Awaited<ReturnType<typeof result.current.resolveFillMask>>;
    await act(async () => {
      resolved = await result.current.resolveFillMask('answerdotai/ModernBERT-base');
    });

    expect(resolved.provider).toBe('transformers');
    expect(resolved.tier).toBe('download');
    expect(resolved.modelId).toBe('transformers:answerdotai/ModernBERT-base');
    expect(tf.fillMask).toHaveBeenCalledWith('answerdotai/ModernBERT-base');
    expect(chrome.loadSpy).not.toHaveBeenCalled(); // chrome path never taken
    expect(result.current.resolution?.capability).toBe('fill-mask');
  });

  it('resolveEditEngine constructs the transformers instruct model with the requested device on fallback', async () => {
    setBrowser({}); // no Prompt API → transformers fallback
    const chrome = fakeChromeAI();
    const tf = fakeTransformers();
    const { result } = renderHook(() =>
      useProviderFallback({ loadChromeAI: chrome.load, loadTransformers: tf.load }),
    );

    let resolved!: Awaited<ReturnType<typeof result.current.resolveEditEngine>>;
    await act(async () => {
      resolved = await result.current.resolveEditEngine({
        fallbackModelId: 'onnx-community/Qwen2.5-0.5B-Instruct',
        device: 'wasm',
      });
    });

    expect(resolved.provider).toBe('transformers');
    expect(tf.languageModel).toHaveBeenCalledWith('onnx-community/Qwen2.5-0.5B-Instruct', {
      device: 'wasm',
    });
  });

  it('surfaces a resolution error via `error` and rejects', async () => {
    setBrowser({}); // transformers path
    const failing: LoadTransformers = vi.fn(async () => {
      throw new Error('provider package not installed');
    });
    const { result } = renderHook(() =>
      useProviderFallback({ loadChromeAI: fakeChromeAI().load, loadTransformers: failing }),
    );

    await act(async () => {
      await expect(result.current.resolveFillMask('x')).rejects.toThrow(
        'provider package not installed',
      );
    });
    expect(result.current.error?.message).toBe('provider package not installed');
    expect(result.current.isResolving).toBe(false);
  });
});

/* ──────────────────── no hard provider dependency (invariant) ─────────────── */

describe('no hard provider dependency', () => {
  it('packages/react/package.json declares no chrome-ai / transformers runtime dependency', () => {
    // Resolve the react package.json regardless of the invocation cwd (repo root
    // vs the package dir), matching by package name to be certain.
    const candidates = [
      resolve(process.cwd(), 'package.json'),
      resolve(process.cwd(), 'packages/react/package.json'),
    ];
    const pkgPath = candidates.find(
      (p) => existsSync(p) && JSON.parse(readFileSync(p, 'utf8')).name === '@localmode/react',
    );
    expect(pkgPath, 'react package.json not found from cwd').toBeTruthy();
    const pkg = JSON.parse(readFileSync(pkgPath!, 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = pkg.dependencies ?? {};
    expect(deps['@localmode/chrome-ai']).toBeUndefined();
    expect(deps['@localmode/transformers']).toBeUndefined();
    expect(deps['@localmode/langchain']).toBeUndefined();
    // Also not smuggled in as a devDependency for these three.
    const devDeps = pkg.devDependencies ?? {};
    expect(devDeps['@localmode/chrome-ai']).toBeUndefined();
    expect(devDeps['@localmode/transformers']).toBeUndefined();
    expect(devDeps['@localmode/langchain']).toBeUndefined();
  });
});
