/**
 * @file translator.test.ts
 * @description Tests for ChromeAITranslator implementation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChromeAITranslator } from '../src/implementations/translator.js';

const mockTranslate = vi.fn().mockResolvedValue('Hola mundo');

const createMockSession = () => ({
  translate: mockTranslate,
  destroy: vi.fn(),
});

beforeEach(() => {
  vi.clearAllMocks();

  vi.stubGlobal('self', {
    ai: {
      translator: {
        create: vi.fn().mockResolvedValue(createMockSession()),
        capabilities: vi.fn().mockResolvedValue({ available: 'readily' }),
      },
    },
  });
});

describe('ChromeAITranslator', () => {
  it('has correct modelId and provider', () => {
    const model = new ChromeAITranslator();
    expect(model.modelId).toBe('chrome-ai:gemini-nano-translator');
    expect(model.provider).toBe('chrome-ai');
  });

  it('returns { translations, usage } from doTranslate()', async () => {
    const model = new ChromeAITranslator();
    const result = await model.doTranslate({
      texts: ['Hello world'],
      sourceLanguage: 'en',
      targetLanguage: 'es',
    });

    expect(result.translations).toHaveLength(1);
    expect(result.translations[0]).toBe('Hola mundo');
    expect(result.usage.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.usage.inputTokens).toBeGreaterThan(0);
    expect(result.detectedLanguage).toBe('en');
  });

  it('translates multiple texts', async () => {
    const model = new ChromeAITranslator();
    const result = await model.doTranslate({
      texts: ['Hello', 'Goodbye'],
      sourceLanguage: 'en',
      targetLanguage: 'es',
    });

    expect(result.translations).toHaveLength(2);
    expect(mockTranslate).toHaveBeenCalledTimes(2);
  });

  it('throws on aborted signal', async () => {
    const model = new ChromeAITranslator();
    const controller = new AbortController();
    controller.abort();

    await expect(
      model.doTranslate({
        texts: ['test'],
        sourceLanguage: 'en',
        targetLanguage: 'es',
        abortSignal: controller.signal,
      })
    ).rejects.toThrow();
  });

  it('caches sessions per language pair', async () => {
    const model = new ChromeAITranslator();

    await model.doTranslate({ texts: ['Hello'], sourceLanguage: 'en', targetLanguage: 'es' });
    await model.doTranslate({ texts: ['Hi'], sourceLanguage: 'en', targetLanguage: 'es' });

    const createCall = (self as any).ai.translator.create;
    expect(createCall).toHaveBeenCalledTimes(1);
  });

  it('creates separate sessions for different language pairs', async () => {
    const model = new ChromeAITranslator();

    await model.doTranslate({ texts: ['Hello'], sourceLanguage: 'en', targetLanguage: 'es' });
    await model.doTranslate({ texts: ['Hello'], sourceLanguage: 'en', targetLanguage: 'de' });

    const createCall = (self as any).ai.translator.create;
    expect(createCall).toHaveBeenCalledTimes(2);
  });

  it('uses default settings when no language specified', async () => {
    const model = new ChromeAITranslator({ sourceLanguage: 'fr', targetLanguage: 'en' });
    await model.doTranslate({ texts: ['Bonjour'] });

    const createCall = (self as any).ai.translator.create;
    expect(createCall).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceLanguage: 'fr',
        targetLanguage: 'en',
      })
    );
  });

  it('destroy() releases all sessions', () => {
    const model = new ChromeAITranslator();
    const session1 = createMockSession();
    const session2 = createMockSession();
    (model as any).sessions.set('en-es', session1);
    (model as any).sessions.set('en-de', session2);

    model.destroy();

    expect(session1.destroy).toHaveBeenCalledTimes(1);
    expect(session2.destroy).toHaveBeenCalledTimes(1);
    expect((model as any).sessions.size).toBe(0);
  });
});
