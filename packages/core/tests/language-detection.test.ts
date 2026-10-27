/**
 * Language Detection Tests
 *
 * Tests for detectLanguage() and the SUPPORTED_LANGUAGES constant.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  detectLanguage,
  SUPPORTED_LANGUAGES,
  getLanguageName,
  isRetryableError,
  TranslationError,
  ValidationError,
} from '../src/index.js';
import type { LanguageDetectionModel } from '../src/index.js';
import { createMockLanguageDetectionModel } from '../src/testing/index.js';

describe('detectLanguage()', () => {
  it('returns languages with code, confidence, usage, response', async () => {
    const result = await detectLanguage({
      model: createMockLanguageDetectionModel({
        languages: [
          { languageCode: 'fr', confidence: 0.98 },
          { languageCode: 'en', confidence: 0.01 },
        ],
      }),
      text: 'Bonjour le monde',
    });

    expect(result.languages[0].languageCode).toBe('fr');
    expect(result.languages[0].confidence).toBe(0.98);
    expect(result.usage.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.response.modelId).toBe('mock:language-detector');
    expect(result.response.timestamp).toBeInstanceOf(Date);
  });

  it('sorts results by confidence descending', async () => {
    const result = await detectLanguage({
      model: createMockLanguageDetectionModel({
        languages: [
          { languageCode: 'en', confidence: 0.2 },
          { languageCode: 'de', confidence: 0.7 },
          { languageCode: 'fr', confidence: 0.1 },
        ],
      }),
      text: 'ambiguous',
    });
    expect(result.languages.map((l) => l.languageCode)).toEqual(['de', 'en', 'fr']);
  });

  it('limits results with maxResults', async () => {
    const result = await detectLanguage({
      model: createMockLanguageDetectionModel({
        languages: [
          { languageCode: 'en', confidence: 0.5 },
          { languageCode: 'de', confidence: 0.3 },
          { languageCode: 'fr', confidence: 0.2 },
        ],
      }),
      text: 'hello',
      maxResults: 2,
    });
    expect(result.languages).toHaveLength(2);
  });

  it('filters results below minConfidence', async () => {
    const result = await detectLanguage({
      model: createMockLanguageDetectionModel({
        languages: [
          { languageCode: 'en', confidence: 0.8 },
          { languageCode: 'de', confidence: 0.15 },
        ],
      }),
      text: 'hello',
      minConfidence: 0.5,
    });
    expect(result.languages).toHaveLength(1);
    expect(result.languages[0].languageCode).toBe('en');
  });

  it('rejects immediately with a pre-aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      detectLanguage({
        model: createMockLanguageDetectionModel(),
        text: 'hello',
        abortSignal: controller.signal,
      })
    ).rejects.toThrow();
  });
});

/** A model whose doDetect() throws `error` on every call, counting the attempts. */
function throwingModel(error: Error): LanguageDetectionModel & { attempts: number } {
  const model = {
    modelId: 'test:throwing-detector',
    provider: 'test',
    attempts: 0,
    async doDetect() {
      model.attempts++;
      throw error;
    },
  };
  return model;
}

/** A provider error shaped like the one a browser-backed detector throws before a download. */
function downloadRequiredError(): TranslationError {
  const err = new TranslationError(
    'The language detection model needs to be downloaded before use (status: downloadable).',
    { hint: 'Opt in to the download from a user activation.' }
  );
  Object.assign(err, { code: 'chrome-ai-download-required', retryable: false });
  return err;
}

describe('detectLanguage() retries', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('makes a single attempt and no backoff wait for an error marked retryable: false', async () => {
    vi.useFakeTimers();
    const error = downloadRequiredError();
    const model = throwingModel(error);

    const settled = detectLanguage({ model, text: 'Hallo und herzlich willkommen!' }).then(
      () => 'resolved',
      (err: unknown) => err
    );
    // Flush microtasks only; a retry would sit behind a 1 s timer.
    await vi.advanceTimersByTimeAsync(0);

    expect(model.attempts).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(await settled).toBe(error);
  });

  it('makes a single attempt for a ValidationError', async () => {
    vi.useFakeTimers();
    const error = new ValidationError('bad option');
    const model = throwingModel(error);

    const settled = detectLanguage({ model, text: 'hello' }).then(
      () => 'resolved',
      (err: unknown) => err
    );
    await vi.advanceTimersByTimeAsync(0);

    expect(model.attempts).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(await settled).toBe(error);
  });

  it('still retries an ordinary error with 1 s and 2 s backoff', async () => {
    vi.useFakeTimers();
    const error = new TranslationError('transient failure');
    const model = throwingModel(error);

    const settled = detectLanguage({ model, text: 'hello' }).then(
      () => 'resolved',
      (err: unknown) => err
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(model.attempts).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(model.attempts).toBe(2);
    await vi.advanceTimersByTimeAsync(2000);
    expect(model.attempts).toBe(3);

    expect(await settled).toBe(error);
  });
});

describe('isRetryableError()', () => {
  it('is false for retryable: false and for ValidationError, true otherwise', () => {
    expect(isRetryableError(downloadRequiredError())).toBe(false);
    expect(isRetryableError(new ValidationError('bad'))).toBe(false);
    expect(isRetryableError(new TranslationError('transient'))).toBe(true);
    expect(isRetryableError(Object.assign(new Error('x'), { retryable: true }))).toBe(true);
    expect(isRetryableError(new Error('plain'))).toBe(true);
    expect(isRetryableError('not an error')).toBe(true);
  });
});

describe('SUPPORTED_LANGUAGES', () => {
  it('maps ISO 639-1 codes to language names', () => {
    expect(SUPPORTED_LANGUAGES['fr']).toBe('French');
    expect(SUPPORTED_LANGUAGES['en']).toBe('English');
    expect(SUPPORTED_LANGUAGES['zh']).toBe('Chinese');
  });

  it('covers at least 100 languages', () => {
    expect(Object.keys(SUPPORTED_LANGUAGES).length).toBeGreaterThanOrEqual(100);
  });

  it('getLanguageName falls back to the code for unknown languages', () => {
    expect(getLanguageName('fr')).toBe('French');
    expect(getLanguageName('xx-unknown')).toBe('xx-unknown');
  });

  it('getLanguageName resolves script- and region-tagged BCP 47 codes to the base language', () => {
    expect(getLanguageName('zh-Hans')).toBe('Chinese');
    expect(getLanguageName('zh-Hant-TW')).toBe('Chinese');
    expect(getLanguageName('sr-Latn')).toBe('Serbian');
    expect(getLanguageName('pt-BR')).toBe('Portuguese');
    expect(getLanguageName('EN-gb')).toBe('English');
    expect(getLanguageName('xx-Latn')).toBe('xx-Latn');
    expect(getLanguageName('und')).toBe('und');
    expect(getLanguageName('constructor')).toBe('constructor');
  });
});
