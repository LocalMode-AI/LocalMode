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
  probeChromeAvailability,
  downloadChromeModel,
  providerTier,
  providerName,
  type LoadChromeAI,
  type LoadTransformers,
} from '../src/hooks/use-provider-fallback.js';

/* ─────────────────────────── global stubs (real boundary) ────────────────── */

const globalSelf = self as unknown as {
  ai?: unknown;
  LanguageModel?: unknown;
  Summarizer?: unknown;
  Translator?: unknown;
};

/** Reset the Chrome AI browser surfaces after every test. */
afterEach(() => {
  delete globalSelf.ai;
  delete globalSelf.LanguageModel;
  delete globalSelf.Summarizer;
  delete globalSelf.Translator;
  vi.restoreAllMocks();
});

type Avail = 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'readily' | 'no';

/**
 * Model CURRENT Chrome: each API is its own top-level global with `availability()`
 * and `create()`, and `self.ai` does NOT exist. Chrome dropped the `self.ai.*`
 * namespace, so a detector that only reads it sees nothing here.
 */
function setModernBrowser(config: {
  summarizer?: Avail;
  translator?: Avail;
  prompt?: Avail;
  /** Fail `create()` — models a denied or failed download. */
  createRejects?: boolean;
  /** `downloadprogress` events `create()` should emit on its monitor. */
  progressEvents?: Array<{ loaded: number; total?: number }>;
}) {
  const destroy = vi.fn();
  const makeFactory = (state: Avail) => ({
    availability: vi.fn(async () => state),
    create: vi.fn(async (options?: Record<string, unknown>) => {
      if (config.createRejects) throw new Error('download denied');
      const monitor = options?.monitor as ((m: EventTarget) => void) | undefined;
      if (monitor) {
        const target = new EventTarget();
        monitor(target);
        for (const ev of config.progressEvents ?? []) {
          const e = new Event('downloadprogress') as Event & { loaded?: number; total?: number };
          e.loaded = ev.loaded;
          if (ev.total !== undefined) e.total = ev.total;
          target.dispatchEvent(e);
        }
      }
      return { destroy };
    }),
  });
  const factories: Record<string, ReturnType<typeof makeFactory>> = {};
  if (config.summarizer) factories.Summarizer = makeFactory(config.summarizer);
  if (config.translator) factories.Translator = makeFactory(config.translator);
  if (config.prompt) factories.LanguageModel = makeFactory(config.prompt);
  Object.assign(globalSelf, factories);
  return { ...factories, destroy };
}

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

  /* ── modern Chrome: top-level globals, no `self.ai` namespace ───────────── */
  // Regression: the detectors used to read ONLY `self.ai.summarizer` /
  // `self.ai.translator`. Chrome removed that namespace, so on every browser
  // where the Summarizer/Translator APIs actually exist, detection returned
  // 'transformers' and Chrome AI was unreachable. These fail against that code.

  it('modern Chrome (no self.ai): an available Summarizer resolves chrome-ai', async () => {
    setModernBrowser({ summarizer: 'available' });
    expect(globalSelf.ai).toBeUndefined();
    expect(await detectSummarizerProvider()).toBe('chrome-ai');
  });

  it('modern Chrome (no self.ai): an available Translator resolves chrome-ai', async () => {
    setModernBrowser({ translator: 'available' });
    expect(globalSelf.ai).toBeUndefined();
    expect(await detectTranslatorProvider({ source: 'en', target: 'es' })).toBe('chrome-ai');
  });

  it('a present-but-downloadable Summarizer falls back rather than throwing at create()', async () => {
    setModernBrowser({ summarizer: 'downloadable' });
    expect(await detectSummarizerProvider()).toBe('transformers');
  });

  it('Translator availability is probed per language pair', async () => {
    const { Translator } = setModernBrowser({ translator: 'available' });
    await detectTranslatorProvider({ source: 'en', target: 'de' });
    expect(Translator!.availability).toHaveBeenCalledWith({
      sourceLanguage: 'en',
      targetLanguage: 'de',
    });
  });

  it('probeChromeAvailability maps the legacy readily/no spellings', async () => {
    setModernBrowser({ summarizer: 'readily' });
    expect(await probeChromeAvailability('summarize')).toBe('available');
    delete globalSelf.Summarizer;
    setModernBrowser({ summarizer: 'no' });
    expect(await probeChromeAvailability('summarize')).toBe('unavailable');
  });

  // Regression: `Translator.availability()` never settles on some Chrome builds
  // (observed in headless Chromium). Awaiting it unguarded on the resolver's
  // critical path leaves the block stuck on "Preparing…" forever.
  it('a never-settling availability() probe resolves to `unavailable` instead of hanging', async () => {
    vi.useFakeTimers();
    globalSelf.Translator = {
      availability: vi.fn(() => new Promise<string>(() => {})), // never settles
      create: vi.fn(),
    };
    const probe = probeChromeAvailability('translate', { source: 'en', target: 'de' });
    await vi.advanceTimersByTimeAsync(3100);
    await expect(probe).resolves.toBe('unavailable');
    vi.useRealTimers();
  });

  it('a hung probe still lets detectTranslatorProvider fall back (never wedges the resolver)', async () => {
    vi.useFakeTimers();
    globalSelf.Translator = {
      availability: vi.fn(() => new Promise<string>(() => {})),
      create: vi.fn(),
    };
    const detect = detectTranslatorProvider({ source: 'en', target: 'de' });
    await vi.advanceTimersByTimeAsync(3100);
    await expect(detect).resolves.toBe('transformers');
    vi.useRealTimers();
  });

  it('a fast probe is NOT delayed by the deadline', async () => {
    setModernBrowser({ translator: 'available' });
    const t0 = Date.now();
    await expect(probeChromeAvailability('translate', { source: 'en', target: 'de' })).resolves.toBe(
      'available',
    );
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it('probeChromeAvailability reports unsupported when the API is absent', async () => {
    expect(await probeChromeAvailability('summarize')).toBe('unsupported');
  });

  /* ── downloadChromeModel: the user-gesture download path ─────────────────── */

  it("sends Chrome's 'tldr' enum value, never 'tl;dr' (which Chrome rejects)", async () => {
    // Chrome's SummarizerType enum is `tldr`. Passing `'tl;dr'` makes
    // Summarizer.availability() throw a TypeError.
    const { Summarizer } = setModernBrowser({ summarizer: 'available' });
    await probeChromeAvailability('summarize');
    expect(Summarizer!.availability).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'tldr' }),
    );
    const sent = Summarizer!.availability.mock.calls[0][0] as { type: string };
    expect(sent.type).not.toBe('tl;dr');
  });

  it('probeChromeAvailability rethrows a bad-option TypeError instead of reporting "unsupported"', async () => {
    // Reporting a caller bug as `unsupported` blames the user's browser and hides
    // the defect — the exact failure this guards against.
    globalSelf.Summarizer = {
      availability: vi.fn(async () => {
        throw new TypeError("The provided value 'tl;dr' is not a valid enum value of type SummarizerType.");
      }),
      create: vi.fn(),
    };
    await expect(probeChromeAvailability('summarize')).rejects.toThrow(/not a valid enum value/);
  });

  it('detectSummarizerProvider still falls back (never throws) when the probe throws', async () => {
    globalSelf.Summarizer = {
      availability: vi.fn(async () => {
        throw new TypeError('bad option');
      }),
      create: vi.fn(),
    };
    await expect(detectSummarizerProvider()).resolves.toBe('transformers');
  });

  it('downloadChromeModel creates a session, reports normalized progress, and destroys it', async () => {
    const { Summarizer, destroy } = setModernBrowser({
      summarizer: 'available',
      progressEvents: [
        { loaded: 25, total: 100 },
        { loaded: 100, total: 100 },
      ],
    });
    const seen: number[] = [];
    const state = await downloadChromeModel('summarize', {}, (p) => seen.push(p));

    expect(Summarizer!.create).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([0.25, 1]);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(state).toBe('available');
  });

  it('downloadChromeModel normalizes a bare 0-1 fraction (no total)', async () => {
    setModernBrowser({ prompt: 'available', progressEvents: [{ loaded: 0.5 }] });
    const seen: number[] = [];
    await downloadChromeModel('edit', {}, (p) => seen.push(p));
    expect(seen).toEqual([0.5]);
  });

  it('downloadChromeModel forwards the language pair to create()', async () => {
    const { Translator } = setModernBrowser({ translator: 'available' });
    await downloadChromeModel('translate', { source: 'en', target: 'fr' });
    expect(Translator!.create).toHaveBeenCalledWith(
      expect.objectContaining({ sourceLanguage: 'en', targetLanguage: 'fr' }),
    );
  });

  it('downloadChromeModel rejects when Chrome refuses the download', async () => {
    setModernBrowser({ summarizer: 'downloadable', createRejects: true });
    await expect(downloadChromeModel('summarize')).rejects.toThrow('download denied');
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
        chromeStyle: 'tldr',
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

  it('requestChromeDownload flips availability and makes the next resolve pick chrome-ai', async () => {
    // Start on a browser where the Summarizer exists but the model is not fetched.
    let state: string = 'downloadable';
    const destroy = vi.fn();
    globalSelf.Summarizer = {
      availability: vi.fn(async () => state),
      create: vi.fn(async (options?: Record<string, unknown>) => {
        const monitor = options?.monitor as ((m: EventTarget) => void) | undefined;
        if (monitor) {
          const target = new EventTarget();
          monitor(target);
          const e = new Event('downloadprogress') as Event & { loaded?: number; total?: number };
          e.loaded = 1;
          e.total = 1;
          target.dispatchEvent(e);
        }
        state = 'available'; // Chrome has now cached the model
        return { destroy };
      }),
    };

    const chrome = fakeChromeAI();
    const tf = fakeTransformers();
    const { result } = renderHook(() =>
      useProviderFallback({ loadChromeAI: chrome.load, loadTransformers: tf.load }),
    );

    // Before the download: the block must fall back, not throw at create().
    await act(async () => {
      const resolved = await result.current.resolveSummarizer({
        chromeStyle: 'tldr',
        length: 'medium',
        fallbackModelId: 'Xenova/distilbart-cnn-6-6',
      });
      expect(resolved.provider).toBe('transformers');
    });
    expect(chrome.summarizer).not.toHaveBeenCalled();

    // The user clicks the button.
    await act(async () => {
      const after = await result.current.requestChromeDownload('summarize', {
        chromeStyle: 'tldr',
        length: 'medium',
      });
      expect(after).toBe('available');
    });
    expect(result.current.chromeAvailability.summarize).toBe('available');
    expect(result.current.downloadingCapability).toBeNull();
    expect(result.current.chromeDownloadProgress).toBeNull();
    expect(destroy).toHaveBeenCalledTimes(1);

    // After the download: the cache was invalidated, so the SAME params now
    // re-detect and resolve chrome-ai.
    await act(async () => {
      const resolved = await result.current.resolveSummarizer({
        chromeStyle: 'tldr',
        length: 'medium',
        fallbackModelId: 'Xenova/distilbart-cnn-6-6',
      });
      expect(resolved.provider).toBe('chrome-ai');
      expect(resolved.tier).toBe('built-in');
    });
    expect(chrome.summarizer).toHaveBeenCalledTimes(1);
  });

  it('a failed requestChromeDownload surfaces `error` and leaves availability truthful', async () => {
    globalSelf.Summarizer = {
      availability: vi.fn(async () => 'downloadable'),
      create: vi.fn(async () => {
        throw new Error('user denied the download');
      }),
    };
    const chrome = fakeChromeAI();
    const tf = fakeTransformers();
    const { result } = renderHook(() =>
      useProviderFallback({ loadChromeAI: chrome.load, loadTransformers: tf.load }),
    );

    await act(async () => {
      const after = await result.current.requestChromeDownload('summarize');
      expect(after).toBe('downloadable'); // still not downloaded
    });
    expect(result.current.error?.message).toContain('user denied the download');
    expect(result.current.chromeAvailability.summarize).toBe('downloadable');
    expect(result.current.downloadingCapability).toBeNull();
  });

  it('refreshChromeAvailability surfaces a bad-option error rather than claiming "unsupported"', async () => {
    globalSelf.Summarizer = {
      availability: vi.fn(async () => {
        throw new TypeError("The provided value 'tl;dr' is not a valid enum value of type SummarizerType.");
      }),
      create: vi.fn(),
    };
    const chrome = fakeChromeAI();
    const tf = fakeTransformers();
    const { result } = renderHook(() =>
      useProviderFallback({ loadChromeAI: chrome.load, loadTransformers: tf.load }),
    );

    await act(async () => {
      const state = await result.current.refreshChromeAvailability('summarize');
      expect(state).toBe('unavailable');
    });
    // The browser DOES support the API — the caller passed a bad option.
    expect(result.current.chromeAvailability.summarize).not.toBe('unsupported');
    expect(result.current.error?.message).toMatch(/not a valid enum value/);
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
