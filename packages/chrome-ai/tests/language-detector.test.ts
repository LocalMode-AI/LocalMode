/**
 * @file language-detector.test.ts
 * @description Tests for ChromeAILanguageDetector against a fake of Chrome's `LanguageDetector` global
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { detectLanguage, TranslationError, ValidationError } from '@localmode/core';
import { ChromeAILanguageDetector } from '../src/implementations/language-detector.js';
import { createChromeAI } from '../src/provider.js';
import { isChromeAISupported, isLanguageDetectorSupported } from '../src/utils.js';
import type {
  AILanguageDetectionResult,
  AILanguageDetectorCreateOptions,
  ChromeAIAvailability,
} from '../src/types.js';

/**
 * Fake of Chrome's `LanguageDetector` global, following the documented contract
 * (https://developer.chrome.com/docs/ai/language-detection): `availability()` reports
 * the model state, `create()` needs a user activation while the model must download and
 * reports progress through `monitor` as `downloadprogress` events, `detect()` resolves to
 * `{ detectedLanguage, confidence }[]` sorted by confidence with a trailing `'und'`,
 * rejects input over `inputQuota` with a `QuotaExceededError`, honours `signal`, and a
 * destroyed session rejects with `InvalidStateError`.
 */
class FakeLanguageDetectorGlobal {
  state: ChromeAIAvailability | 'never';
  userActivation = false;
  createCalls: AILanguageDetectorCreateOptions[] = [];
  availabilityCalls: unknown[] = [];
  sessions: FakeDetectorSession[] = [];

  constructor(state: ChromeAIAvailability | 'never' = 'available') {
    this.state = state;
  }

  availability = (options?: { expectedInputLanguages?: string[] }): Promise<ChromeAIAvailability> => {
    this.availabilityCalls.push(options);
    if (this.state === 'never') return new Promise(() => {});
    return Promise.resolve(this.state);
  };

  create = async (options: AILanguageDetectorCreateOptions = {}): Promise<FakeDetectorSession> => {
    this.createCalls.push(options);
    options.signal?.throwIfAborted();
    if (this.state === 'unavailable') {
      throw new DOMException('The device is not eligible.', 'NotSupportedError');
    }
    if (this.state === 'downloadable' || this.state === 'downloading') {
      if (!this.userActivation) {
        throw new DOMException('Requires a user gesture.', 'NotAllowedError');
      }
      const monitor = new EventTarget();
      options.monitor?.(monitor);
      for (const loaded of [0, 0.5, 1]) {
        const evt = new Event('downloadprogress') as Event & { loaded: number; total: number };
        Object.assign(evt, { loaded, total: 1 });
        monitor.dispatchEvent(evt);
      }
      this.state = 'available';
    }
    const session = new FakeDetectorSession(options.expectedInputLanguages ?? null);
    this.sessions.push(session);
    return session;
  };
}

const DETECTIONS: Record<string, AILanguageDetectionResult[]> = {
  'Hallo und herzlich willkommen!': [
    { detectedLanguage: 'de', confidence: 0.9993835687637329 },
    { detectedLanguage: 'en', confidence: 0.00038279531872831285 },
    { detectedLanguage: 'nl', confidence: 0.00010798392031574622 },
    { detectedLanguage: 'und', confidence: 0.00005 },
  ],
  'Bonjour tout le monde, comment allez-vous ?': [
    { detectedLanguage: 'fr', confidence: 0.97 },
    { detectedLanguage: 'it', confidence: 0.02 },
    { detectedLanguage: 'es', confidence: 0.006 },
    { detectedLanguage: 'pt', confidence: 0.003 },
    { detectedLanguage: 'und', confidence: 0.001 },
  ],
};

class FakeDetectorSession {
  readonly inputQuota = 64;
  destroyed = false;
  detectCalls: string[] = [];

  constructor(readonly expectedInputLanguages: readonly string[] | null) {}

  detect = async (input: string, options?: { signal?: AbortSignal }): Promise<AILanguageDetectionResult[]> => {
    this.detectCalls.push(input);
    if (this.destroyed) throw new DOMException('The detector has been destroyed.', 'InvalidStateError');
    options?.signal?.throwIfAborted();
    if (input.length > this.inputQuota) {
      throw new DOMException('The input is too large.', 'QuotaExceededError');
    }
    return (DETECTIONS[input] ?? [{ detectedLanguage: 'und', confidence: 1 }]).map((r) => ({ ...r }));
  };

  measureInputUsage = async (input: string): Promise<number> => input.length;

  destroy = (): void => {
    this.destroyed = true;
  };
}

let fake: FakeLanguageDetectorGlobal;

function install(state: ChromeAIAvailability | 'never' = 'available'): FakeLanguageDetectorGlobal {
  fake = new FakeLanguageDetectorGlobal(state);
  vi.stubGlobal('self', { LanguageDetector: fake });
  return fake;
}

async function rejectionOf(promise: Promise<unknown>): Promise<TranslationError> {
  try {
    await promise;
  } catch (err) {
    return err as TranslationError;
  }
  throw new Error('expected the promise to reject');
}

beforeEach(() => {
  install('available');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('feature detection', () => {
  it('isLanguageDetectorSupported() is true with the modern global', () => {
    expect(isLanguageDetectorSupported()).toBe(true);
    expect(isChromeAISupported()).toBe(true);
  });

  it('isLanguageDetectorSupported() accepts the legacy self.ai.languageDetector surface', () => {
    vi.stubGlobal('self', { ai: { languageDetector: { create: vi.fn() } } });
    expect(isLanguageDetectorSupported()).toBe(true);
  });

  it('isLanguageDetectorSupported() is false without the API and never throws', () => {
    vi.stubGlobal('self', {});
    expect(isLanguageDetectorSupported()).toBe(false);
    expect(isChromeAISupported()).toBe(false);
    vi.stubGlobal('self', undefined);
    expect(isLanguageDetectorSupported()).toBe(false);
  });
});

describe('ChromeAILanguageDetector', () => {
  it('has the documented modelId and provider', () => {
    const model = createChromeAI().languageDetector();
    expect(model).toBeInstanceOf(ChromeAILanguageDetector);
    expect(model.modelId).toBe('chrome-ai:language-detector');
    expect(model.provider).toBe('chrome-ai');
  });

  it('construction is lazy and never throws on a browser without the API', () => {
    vi.stubGlobal('self', {});
    expect(() => createChromeAI().languageDetector({ allowDownload: true })).not.toThrow();
  });

  it('detectLanguage() maps Chrome results to core languages, drops "und", sorted by confidence', async () => {
    const result = await detectLanguage({
      model: createChromeAI().languageDetector(),
      text: 'Hallo und herzlich willkommen!',
    });

    expect(result.languages).toEqual([
      { languageCode: 'de', confidence: 0.9993835687637329 },
      { languageCode: 'en', confidence: 0.00038279531872831285 },
      { languageCode: 'nl', confidence: 0.00010798392031574622 },
    ]);
    expect(result.response.modelId).toBe('chrome-ai:language-detector');
    expect(result.usage.durationMs).toBeGreaterThanOrEqual(0);
    expect(fake.sessions).toHaveLength(1);
    expect(fake.sessions[0].detectCalls).toEqual(['Hallo und herzlich willkommen!']);
  });

  it('returns only the topK most confident languages (settings, overridden per call)', async () => {
    const model = new ChromeAILanguageDetector({ topK: 2 });
    const text = 'Bonjour tout le monde, comment allez-vous ?';

    const fromSettings = await model.doDetect({ text });
    expect(fromSettings.languages).toEqual([
      { languageCode: 'fr', confidence: 0.97 },
      { languageCode: 'it', confidence: 0.02 },
    ]);

    const perCall = await model.doDetect({ text, providerOptions: { chromeAI: { topK: 1 } } });
    expect(perCall.languages).toEqual([{ languageCode: 'fr', confidence: 0.97 }]);
  });

  it('rejects a non-positive or non-integer topK with a ValidationError before touching Chrome', async () => {
    const model = new ChromeAILanguageDetector({ topK: 0 });
    await expect(model.doDetect({ text: 'Hallo und herzlich willkommen!' })).rejects.toBeInstanceOf(
      ValidationError
    );
    await expect(
      new ChromeAILanguageDetector().doDetect({
        text: 'Hallo und herzlich willkommen!',
        providerOptions: { chromeAI: { topK: 1.5 } },
      })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(fake.createCalls).toHaveLength(0);
  });

  it('returns an empty list when Chrome can only answer "und"', async () => {
    const result = await new ChromeAILanguageDetector().doDetect({ text: 'zzz' });
    expect(result.languages).toEqual([]);
  });

  it('forwards expectedInputLanguages to availability() and create()', async () => {
    const model = new ChromeAILanguageDetector({ expectedInputLanguages: ['de', 'fr'] });
    await model.doDetect({ text: 'Hallo und herzlich willkommen!' });

    expect(fake.availabilityCalls).toEqual([{ expectedInputLanguages: ['de', 'fr'] }]);
    expect(fake.createCalls[0].expectedInputLanguages).toEqual(['de', 'fr']);
    expect(fake.sessions[0].expectedInputLanguages).toEqual(['de', 'fr']);
  });

  it('caches one session across calls and shares one in-flight create()', async () => {
    const model = new ChromeAILanguageDetector();
    await Promise.all([
      model.doDetect({ text: 'Hallo und herzlich willkommen!' }),
      model.doDetect({ text: 'Bonjour tout le monde, comment allez-vous ?' }),
    ]);
    await model.doDetect({ text: 'Hallo und herzlich willkommen!' });

    expect(fake.createCalls).toHaveLength(1);
    expect(fake.sessions[0].detectCalls).toHaveLength(3);
  });

  describe('availability gating', () => {
    it('throws chrome-ai-not-supported when self.LanguageDetector is missing', async () => {
      vi.stubGlobal('self', {});
      const err = await rejectionOf(
        detectLanguage({ model: new ChromeAILanguageDetector(), text: 'Hallo', maxRetries: 0 })
      );
      expect(err).toBeInstanceOf(TranslationError);
      expect(err.code).toBe('chrome-ai-not-supported');
      expect(err.hint).toContain('Chrome 138+');
    });

    it('throws chrome-ai-model-not-available when availability() is "unavailable"', async () => {
      install('unavailable');
      const err = await rejectionOf(
        new ChromeAILanguageDetector().doDetect({ text: 'Hallo und herzlich willkommen!' })
      );
      expect(err).toBeInstanceOf(TranslationError);
      expect(err.code).toBe('chrome-ai-model-not-available');
      expect(fake.createCalls).toHaveLength(0);
    });

    it.each(['downloadable', 'downloading'] as const)(
      'throws chrome-ai-download-required when "%s" and allowDownload is not set',
      async (state) => {
        install(state);
        const err = await rejectionOf(
          new ChromeAILanguageDetector().doDetect({ text: 'Hallo und herzlich willkommen!' })
        );
        expect(err).toBeInstanceOf(TranslationError);
        expect(err.code).toBe('chrome-ai-download-required');
        expect(err.message).toContain(`status: ${state}`);
        expect(err.hint).toContain('allowDownload: true');
        expect(err.hint).toContain('user activation');
        expect(fake.createCalls).toHaveLength(0);
      }
    );

    it('downloads with allowDownload (settings), reporting monitor progress, then detects', async () => {
      install('downloadable').userActivation = true;
      const progress: { loaded: number; total: number }[] = [];
      const model = new ChromeAILanguageDetector({
        allowDownload: true,
        onProgress: (p) => progress.push(p),
      });

      const result = await model.doDetect({ text: 'Hallo und herzlich willkommen!' });

      expect(progress).toEqual([
        { loaded: 0, total: 1 },
        { loaded: 0.5, total: 1 },
        { loaded: 1, total: 1 },
      ]);
      expect(result.languages[0]).toEqual({ languageCode: 'de', confidence: 0.9993835687637329 });
      expect(fake.state).toBe('available');
    });

    it('accepts allowDownload per call via providerOptions.chromeAI', async () => {
      install('downloadable').userActivation = true;
      const result = await detectLanguage({
        model: new ChromeAILanguageDetector(),
        text: 'Bonjour tout le monde, comment allez-vous ?',
        providerOptions: { chromeAI: { allowDownload: true } },
      });
      expect(result.languages[0].languageCode).toBe('fr');
    });

    it('maps a create() refused for lack of user activation to chrome-ai-permissions-denied', async () => {
      install('downloadable');
      const err = await rejectionOf(
        new ChromeAILanguageDetector({ allowDownload: true }).doDetect({ text: 'Hallo' })
      );
      expect(err).toBeInstanceOf(TranslationError);
      expect(err.code).toBe('chrome-ai-permissions-denied');
      expect((err.cause as DOMException).name).toBe('NotAllowedError');
    });

    it('a failed create() is not cached: the next call retries and succeeds', async () => {
      install('downloadable');
      const model = new ChromeAILanguageDetector({ allowDownload: true });
      await expect(model.doDetect({ text: 'Hallo' })).rejects.toBeInstanceOf(TranslationError);

      fake.userActivation = true;
      const result = await model.doDetect({ text: 'Hallo und herzlich willkommen!' });
      expect(result.languages[0].languageCode).toBe('de');
      expect(fake.createCalls).toHaveLength(2);
    });

    it('maps a throwing availability() to chrome-ai-not-supported', async () => {
      install('available').availability = () => Promise.reject(new TypeError('boom'));
      const err = await rejectionOf(new ChromeAILanguageDetector().doDetect({ text: 'Hallo' }));
      expect(err.code).toBe('chrome-ai-not-supported');
      expect((err.cause as Error).message).toBe('boom');
    });

    it('falls through to create() when availability() never settles (3 s deadline)', async () => {
      vi.useFakeTimers();
      install('never');
      const pending = new ChromeAILanguageDetector().doDetect({
        text: 'Hallo und herzlich willkommen!',
      });

      await vi.advanceTimersByTimeAsync(2999);
      expect(fake.createCalls).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(1);

      const result = await pending;
      expect(fake.createCalls).toHaveLength(1);
      expect(result.languages[0].languageCode).toBe('de');
    });

    it('works on the legacy surface without availability()', async () => {
      const legacy = new FakeLanguageDetectorGlobal('available');
      vi.stubGlobal('self', { ai: { languageDetector: { create: legacy.create } } });
      const result = await new ChromeAILanguageDetector().doDetect({
        text: 'Hallo und herzlich willkommen!',
      });
      expect(result.languages[0].languageCode).toBe('de');
    });
  });

  describe('retries through detectLanguage()', () => {
    it.each([
      ['downloadable', 'chrome-ai-download-required'],
      ['unavailable', 'chrome-ai-model-not-available'],
    ] as const)(
      'a "%s" model fails once with %s, without backoff waits',
      async (state, code) => {
        vi.useFakeTimers();
        install(state);
        const settled = detectLanguage({
          model: new ChromeAILanguageDetector(),
          text: 'Hallo und herzlich willkommen!',
        }).then(
          () => null,
          (err: unknown) => err as TranslationError
        );
        await vi.advanceTimersByTimeAsync(0);

        expect(fake.availabilityCalls).toHaveLength(1);
        expect(vi.getTimerCount()).toBe(0);
        const err = await settled;
        expect(err?.code).toBe(code);
        expect((err as unknown as { retryable: boolean }).retryable).toBe(false);
      }
    );

    it('a missing API fails once with chrome-ai-not-supported', async () => {
      vi.useFakeTimers();
      vi.stubGlobal('self', {});
      const settled = detectLanguage({ model: new ChromeAILanguageDetector(), text: 'Hallo' }).then(
        () => null,
        (err: unknown) => err as TranslationError
      );
      await vi.advanceTimersByTimeAsync(0);

      expect(vi.getTimerCount()).toBe(0);
      expect((await settled)?.code).toBe('chrome-ai-not-supported');
    });

    it('a create() refused for lack of user activation is not retried', async () => {
      vi.useFakeTimers();
      install('downloadable');
      const settled = detectLanguage({
        model: new ChromeAILanguageDetector({ allowDownload: true }),
        text: 'Hallo',
      }).then(
        () => null,
        (err: unknown) => err as TranslationError
      );
      await vi.advanceTimersByTimeAsync(0);

      expect(fake.createCalls).toHaveLength(1);
      expect(vi.getTimerCount()).toBe(0);
      expect((await settled)?.code).toBe('chrome-ai-permissions-denied');
    });

    it('an input over the quota is not retried', async () => {
      vi.useFakeTimers();
      const model = new ChromeAILanguageDetector();
      const settled = detectLanguage({ model, text: 'x'.repeat(65) }).then(
        () => null,
        (err: unknown) => err as TranslationError
      );
      await vi.advanceTimersByTimeAsync(0);

      expect(fake.sessions[0].detectCalls).toHaveLength(1);
      expect(vi.getTimerCount()).toBe(0);
      expect((await settled)?.code).toBe('chrome-ai-quota-exceeded');
    });

    it('an unexpected detect() failure stays retryable', async () => {
      vi.useFakeTimers();
      const model = new ChromeAILanguageDetector();
      await model.warmUp();
      const session = fake.sessions[0];
      let calls = 0;
      session.detect = async () => {
        calls++;
        if (calls === 1) throw new DOMException('Transient failure.', 'UnknownError');
        return [{ detectedLanguage: 'de', confidence: 0.99 }];
      };

      const pending = detectLanguage({ model, text: 'Hallo und herzlich willkommen!' });
      await vi.advanceTimersByTimeAsync(0);
      expect(calls).toBe(1);
      await vi.advanceTimersByTimeAsync(1000);

      const result = await pending;
      expect(calls).toBe(2);
      expect(result.languages).toEqual([{ languageCode: 'de', confidence: 0.99 }]);
    });
  });

  describe('detection errors and cancellation', () => {
    it('maps an input over inputQuota to chrome-ai-quota-exceeded', async () => {
      const err = await rejectionOf(new ChromeAILanguageDetector().doDetect({ text: 'x'.repeat(65) }));
      expect(err).toBeInstanceOf(TranslationError);
      expect(err.code).toBe('chrome-ai-quota-exceeded');
      expect((err.cause as DOMException).name).toBe('QuotaExceededError');
    });

    it('maps any other detect() failure to chrome-ai-detection-failed with the cause', async () => {
      const model = new ChromeAILanguageDetector();
      await model.warmUp();
      fake.sessions[0].destroyed = true;
      const err = await rejectionOf(model.doDetect({ text: 'Hallo' }));
      expect(err.code).toBe('chrome-ai-detection-failed');
      expect((err.cause as DOMException).name).toBe('InvalidStateError');
    });

    it('rejects before touching Chrome when the signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();
      await expect(
        new ChromeAILanguageDetector().doDetect({ text: 'Hallo', abortSignal: controller.signal })
      ).rejects.toMatchObject({ name: 'AbortError' });
      expect(fake.createCalls).toHaveLength(0);
    });

    it('passes the signal to detect() and surfaces its AbortError unchanged', async () => {
      const model = new ChromeAILanguageDetector();
      await model.warmUp();
      const controller = new AbortController();
      const session = fake.sessions[0];
      const original = session.detect;
      session.detect = async (input, options) => {
        controller.abort();
        return original(input, options);
      };
      await expect(
        model.doDetect({ text: 'Hallo und herzlich willkommen!', abortSignal: controller.signal })
      ).rejects.toMatchObject({ name: 'AbortError' });
    });
  });

  describe('lifecycle', () => {
    it('warmUp() creates the session; isReady() reflects it; destroy() releases it', async () => {
      const model = new ChromeAILanguageDetector();
      expect(model.isReady()).toBe(false);

      await model.warmUp();
      expect(model.isReady()).toBe(true);
      expect(fake.createCalls).toHaveLength(1);

      model.destroy();
      expect(fake.sessions[0].destroyed).toBe(true);
      expect(model.isReady()).toBe(false);
      model.destroy();

      const result = await model.doDetect({ text: 'Hallo und herzlich willkommen!' });
      expect(result.languages[0].languageCode).toBe('de');
      expect(fake.createCalls).toHaveLength(2);
      expect(fake.sessions[1].destroyed).toBe(false);
    });

    it('warmUp() honours the download gate', async () => {
      install('downloadable');
      const err = await rejectionOf(new ChromeAILanguageDetector().warmUp());
      expect(err.code).toBe('chrome-ai-download-required');
    });
  });
});
