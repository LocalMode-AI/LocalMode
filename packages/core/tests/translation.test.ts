/**
 * Translation Domain Tests
 *
 * Tests for translate() function.
 *
 * @packageDocumentation
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  translate,
  setGlobalTranslationProvider,
} from '../src/translation/index.js';
import { createMockTranslationModel } from '../src/testing/index.js';

describe('translate()', () => {
  afterEach(() => {
    setGlobalTranslationProvider(() => {
      throw new Error('No global provider');
    });
  });

  it('should translate text', async () => {
    const model = createMockTranslationModel();

    const result = await translate({
      model,
      text: 'Hello world',
      targetLanguage: 'es',
    });

    expect(result.translation).toBeDefined();
    expect(result.translation.length).toBeGreaterThan(0);
    expect(result.usage.inputTokens).toBeGreaterThan(0);
  });

  it('should include source and target language in response', async () => {
    const model = createMockTranslationModel();

    const result = await translate({
      model,
      text: 'Hello',
      targetLanguage: 'de',
      sourceLanguage: 'en',
    });

    expect(result.response.modelId).toBe(model.modelId);
  });

  it('should handle translation with various lengths', async () => {
    const model = createMockTranslationModel();

    const result = await translate({
      model,
      text: 'A longer text that should be translated correctly.',
      targetLanguage: 'fr',
    });

    expect(result.translation).toBeDefined();
    expect(result.translation.length).toBeGreaterThan(0);
  });

  it('should support abort signal', async () => {
    const model = createMockTranslationModel({ delay: 100 });
    const controller = new AbortController();

    const promise = translate({
      model,
      text: 'Test',
      targetLanguage: 'de',
      abortSignal: controller.signal,
    });

    controller.abort();

    await expect(promise).rejects.toThrow();
  });

  it('should use global provider with string model ID', async () => {
    setGlobalTranslationProvider(() => createMockTranslationModel());

    const result = await translate({
      model: 'test-model' as any,
      text: 'Hello',
      targetLanguage: 'es',
    });

    expect(result.translation).toBeDefined();
  });
});

