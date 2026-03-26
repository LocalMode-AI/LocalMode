/**
 * @file provider.test.ts
 * @description Tests for Chrome AI provider factory
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createChromeAI, chromeAI } from '../src/provider.js';
import { ChromeAISummarizer } from '../src/implementations/summarizer.js';
import { ChromeAITranslator } from '../src/implementations/translator.js';

beforeEach(() => {
  vi.stubGlobal('self', {
    ai: {
      summarizer: {
        create: vi.fn().mockResolvedValue({
          summarize: vi.fn().mockResolvedValue('summary'),
          destroy: vi.fn(),
        }),
      },
      translator: {
        create: vi.fn().mockResolvedValue({
          translate: vi.fn().mockResolvedValue('translation'),
          destroy: vi.fn(),
        }),
      },
    },
  });
});

describe('createChromeAI()', () => {
  it('returns provider with summarizer and translator methods', () => {
    const provider = createChromeAI();
    expect(provider.summarizer).toBeTypeOf('function');
    expect(provider.translator).toBeTypeOf('function');
  });

  it('summarizer() returns a ChromeAISummarizer', () => {
    const provider = createChromeAI();
    const model = provider.summarizer();
    expect(model).toBeInstanceOf(ChromeAISummarizer);
    expect(model.modelId).toBe('chrome-ai:gemini-nano-summarizer');
    expect(model.provider).toBe('chrome-ai');
  });

  it('translator() returns a ChromeAITranslator', () => {
    const provider = createChromeAI();
    const model = provider.translator();
    expect(model).toBeInstanceOf(ChromeAITranslator);
    expect(model.modelId).toBe('chrome-ai:gemini-nano-translator');
    expect(model.provider).toBe('chrome-ai');
  });

  it('passes settings to summarizer', () => {
    const provider = createChromeAI();
    const model = provider.summarizer({ type: 'key-points', format: 'markdown' });
    expect((model as any).settings.type).toBe('key-points');
    expect((model as any).settings.format).toBe('markdown');
  });

  it('passes settings to translator', () => {
    const provider = createChromeAI();
    const model = provider.translator({ sourceLanguage: 'fr', targetLanguage: 'en' });
    expect((model as any).settings.sourceLanguage).toBe('fr');
    expect((model as any).settings.targetLanguage).toBe('en');
  });
});

describe('chromeAI (default instance)', () => {
  it('is a pre-created provider instance', () => {
    expect(chromeAI.summarizer).toBeTypeOf('function');
    expect(chromeAI.translator).toBeTypeOf('function');
  });

  it('creates working model instances', () => {
    const summarizer = chromeAI.summarizer();
    const translator = chromeAI.translator();
    expect(summarizer.modelId).toBe('chrome-ai:gemini-nano-summarizer');
    expect(translator.modelId).toBe('chrome-ai:gemini-nano-translator');
  });
});
