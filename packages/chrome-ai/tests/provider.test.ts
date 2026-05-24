/**
 * @file provider.test.ts
 * @description Tests for Chrome AI provider factory
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createChromeAI, chromeAI } from '../src/provider.js';
import { ChromeAILanguageModel } from '../src/implementations/language-model.js';
import { ChromeAISummarizer } from '../src/implementations/summarizer.js';
import { ChromeAITranslator } from '../src/implementations/translator.js';

beforeEach(() => {
  vi.stubGlobal('self', {
    LanguageModel: {
      create: vi.fn().mockResolvedValue({
        prompt: vi.fn().mockResolvedValue('hello'),
        promptStreaming: vi.fn(),
        destroy: vi.fn(),
      }),
      availability: vi.fn().mockResolvedValue('available'),
    },
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
  it('returns provider with summarizer, translator, and languageModel methods', () => {
    const provider = createChromeAI();
    expect(provider.summarizer).toBeTypeOf('function');
    expect(provider.translator).toBeTypeOf('function');
    expect(provider.languageModel).toBeTypeOf('function');
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

  it('languageModel() returns a ChromeAILanguageModel implementing LanguageModel', () => {
    const provider = createChromeAI();
    const model = provider.languageModel();
    expect(model).toBeInstanceOf(ChromeAILanguageModel);
    expect(model.modelId).toBe('chrome-ai:gemini-nano');
    expect(model.provider).toBe('chrome-ai');
    expect(model.contextLength).toBeGreaterThan(0);
    expect(typeof model.doGenerate).toBe('function');
    expect(typeof model.doStream).toBe('function');
  });

  it('languageModel() accepts settings without throwing', () => {
    const provider = createChromeAI();
    expect(() => provider.languageModel({ systemPrompt: 'x', temperature: 0.4, topK: 10 })).not.toThrow();
  });
});

describe('chromeAI (default instance)', () => {
  it('is a pre-created provider instance', () => {
    expect(chromeAI.summarizer).toBeTypeOf('function');
    expect(chromeAI.translator).toBeTypeOf('function');
    expect(chromeAI.languageModel).toBeTypeOf('function');
  });

  it('creates working model instances', () => {
    const summarizer = chromeAI.summarizer();
    const translator = chromeAI.translator();
    const llm = chromeAI.languageModel();
    expect(summarizer.modelId).toBe('chrome-ai:gemini-nano-summarizer');
    expect(translator.modelId).toBe('chrome-ai:gemini-nano-translator');
    expect(llm.modelId).toBe('chrome-ai:gemini-nano');
  });
});
