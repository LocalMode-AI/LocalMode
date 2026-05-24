/**
 * Language Detection Tests
 *
 * Tests for detectLanguage() and the SUPPORTED_LANGUAGES constant.
 */

import { describe, it, expect } from 'vitest';
import { detectLanguage, SUPPORTED_LANGUAGES, getLanguageName } from '../src/index.js';
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
});
