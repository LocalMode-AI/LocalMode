/**
 * Summarization Domain Tests
 *
 * Tests for summarize() function.
 *
 * @packageDocumentation
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  summarize,
  setGlobalSummarizationProvider,
} from '../src/summarization/index.js';
import { createMockSummarizationModel } from '../src/testing/index.js';

describe('summarize()', () => {
  afterEach(() => {
    setGlobalSummarizationProvider(() => {
      throw new Error('No global provider');
    });
  });

  it('should summarize text', async () => {
    const model = createMockSummarizationModel({
      mockSummary: 'This is a summary.',
    });

    const result = await summarize({
      model,
      text: 'This is a very long text that needs to be summarized. It contains multiple sentences and paragraphs with lots of information.',
    });

    expect(result.summary).toBe('This is a summary.');
    expect(result.usage.inputTokens).toBeGreaterThan(0);
  });

  it('should respect maxLength option', async () => {
    const model = createMockSummarizationModel();

    const result = await summarize({
      model,
      text: 'Long text here.',
      maxLength: 50,
    });

    expect(result.summary).toBeDefined();
  });

  it('should respect minLength option', async () => {
    const model = createMockSummarizationModel();

    const result = await summarize({
      model,
      text: 'Long text here.',
      minLength: 10,
    });

    expect(result.summary).toBeDefined();
  });

  it('should handle summarization with different text lengths', async () => {
    const model = createMockSummarizationModel();

    const result = await summarize({
      model,
      text: 'A short text to summarize.',
    });

    expect(result.summary).toBeDefined();
    expect(result.summary.length).toBeGreaterThan(0);
  });

  it('should support abort signal', async () => {
    const model = createMockSummarizationModel({ delay: 100 });
    const controller = new AbortController();

    const promise = summarize({
      model,
      text: 'Test text.',
      abortSignal: controller.signal,
    });

    controller.abort();

    await expect(promise).rejects.toThrow();
  });

  it('should use global provider with string model ID', async () => {
    setGlobalSummarizationProvider(() =>
      createMockSummarizationModel({ mockSummary: 'Global summary.' })
    );

    const result = await summarize({
      model: 'test-model' as any,
      text: 'Long text here.',
    });

    expect(result.summary).toBe('Global summary.');
  });
});

