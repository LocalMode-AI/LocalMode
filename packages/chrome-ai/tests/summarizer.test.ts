/**
 * @file summarizer.test.ts
 * @description Tests for ChromeAISummarizer implementation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChromeAISummarizer } from '../src/implementations/summarizer.js';

const mockSummarize = vi.fn().mockResolvedValue('This is a summary.');
const mockDestroy = vi.fn();

const mockSummarizer = {
  summarize: mockSummarize,
  summarizeStreaming: vi.fn(),
  destroy: mockDestroy,
};

beforeEach(() => {
  vi.clearAllMocks();

  vi.stubGlobal('self', {
    ai: {
      summarizer: {
        create: vi.fn().mockResolvedValue(mockSummarizer),
        capabilities: vi.fn().mockResolvedValue({ available: 'readily' }),
      },
    },
  });
});

describe('ChromeAISummarizer', () => {
  it('has correct modelId and provider', () => {
    const model = new ChromeAISummarizer();
    expect(model.modelId).toBe('chrome-ai:gemini-nano-summarizer');
    expect(model.provider).toBe('chrome-ai');
  });

  it('returns { summaries, usage } from doSummarize()', async () => {
    const model = new ChromeAISummarizer();
    const result = await model.doSummarize({ texts: ['Long text here'] });

    expect(result.summaries).toHaveLength(1);
    expect(result.summaries[0]).toBe('This is a summary.');
    expect(result.usage.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.usage.inputTokens).toBeGreaterThan(0);
    expect(result.usage.outputTokens).toBeGreaterThan(0);
  });

  it('summarizes multiple texts', async () => {
    const model = new ChromeAISummarizer();
    const result = await model.doSummarize({
      texts: ['Text one about something.', 'Text two about another thing.'],
    });

    expect(result.summaries).toHaveLength(2);
    expect(mockSummarize).toHaveBeenCalledTimes(2);
  });

  it('throws on aborted signal', async () => {
    const model = new ChromeAISummarizer();
    const controller = new AbortController();
    controller.abort();

    await expect(
      model.doSummarize({ texts: ['test'], abortSignal: controller.signal })
    ).rejects.toThrow();
  });

  it('passes provider options to session creation', async () => {
    const model = new ChromeAISummarizer({ type: 'key-points', format: 'markdown' });
    await model.doSummarize({ texts: ['test'] });

    const createCall = (self as any).ai.summarizer.create;
    expect(createCall).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'key-points',
        format: 'markdown',
      })
    );
  });

  it('caches session across calls', async () => {
    const model = new ChromeAISummarizer();
    await model.doSummarize({ texts: ['first call'] });
    await model.doSummarize({ texts: ['second call'] });

    const createCall = (self as any).ai.summarizer.create;
    expect(createCall).toHaveBeenCalledTimes(1);
  });

  it('destroy() releases the session', () => {
    const model = new ChromeAISummarizer();
    // Force session creation by setting it directly
    (model as any).session = mockSummarizer;
    model.destroy();

    expect(mockDestroy).toHaveBeenCalledTimes(1);
    expect((model as any).session).toBeNull();
  });
});
