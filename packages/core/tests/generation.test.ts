/**
 * Generation Domain Tests
 *
 * Tests for generateText() and streamText() functions.
 *
 * @packageDocumentation
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  generateText,
  streamText,
  setGlobalLanguageModelProvider,
} from '../src/generation/index.js';
import { createMockLanguageModel } from '../src/testing/index.js';

describe('generateText()', () => {
  afterEach(() => {
    // Clear global provider after each test
    setGlobalLanguageModelProvider(() => {
      throw new Error('No global provider');
    });
  });

  it('should generate text with model instance', async () => {
    const model = createMockLanguageModel({
      mockResponse: 'Generated text response.',
    });

    const result = await generateText({
      model,
      prompt: 'Write a story.',
    });

    expect(result.text).toBe('Generated text response.');
    expect(result.usage.inputTokens).toBeGreaterThan(0);
    expect(result.usage.outputTokens).toBeGreaterThan(0);
  });

  it('should include system prompt', async () => {
    const model = createMockLanguageModel();

    const result = await generateText({
      model,
      prompt: 'Hello',
      systemPrompt: 'You are a helpful assistant.',
    });

    expect(result.text).toBeDefined();
  });

  it('should respect maxTokens', async () => {
    const model = createMockLanguageModel();

    const result = await generateText({
      model,
      prompt: 'Hello',
      maxTokens: 100,
    });

    expect(result.text).toBeDefined();
  });

  it('should support temperature setting', async () => {
    const model = createMockLanguageModel();

    const result = await generateText({
      model,
      prompt: 'Hello',
      temperature: 0.7,
    });

    expect(result.text).toBeDefined();
  });

  it('should handle generation with temperature', async () => {
    const model = createMockLanguageModel();

    const result = await generateText({
      model,
      prompt: 'Test',
      temperature: 0.5,
    });

    expect(result.text).toBeDefined();
    expect(result.finishReason).toBe('stop');
  });

  it('should support abort signal', async () => {
    const model = createMockLanguageModel({ delay: 100 });
    const controller = new AbortController();

    const promise = generateText({
      model,
      prompt: 'Test',
      abortSignal: controller.signal,
    });

    controller.abort();

    await expect(promise).rejects.toThrow();
  });

  it('should use global provider with string model ID', async () => {
    const mockProvider = () =>
      createMockLanguageModel({ mockResponse: 'From global provider.' });

    setGlobalLanguageModelProvider(mockProvider);

    const result = await generateText({
      model: 'test-model' as any,
      prompt: 'Hello',
    });

    expect(result.text).toBe('From global provider.');
  });
});

describe('streamText()', () => {
  it('should stream generated text', async () => {
    const model = createMockLanguageModel({
      mockResponse: 'This is a mock response for testing.',
    });

    const result = await streamText({
      model,
      prompt: 'Write something.',
    });

    const chunks: string[] = [];
    for await (const chunk of result.stream) {
      chunks.push(chunk.text);
    }

    expect(chunks.length).toBeGreaterThan(0);
  });

  it('should provide usage after streaming', async () => {
    const model = createMockLanguageModel();

    const result = await streamText({
      model,
      prompt: 'Test',
    });

    // Consume the stream
    for await (const _ of result.stream) {
      // Just consume
    }

    const usage = await result.usage;
    expect(usage.inputTokens).toBeGreaterThan(0);
    expect(usage.outputTokens).toBeGreaterThan(0);
  });

  it('should allow collecting full text', async () => {
    const model = createMockLanguageModel({
      mockResponse: 'Complete response text.',
    });

    const result = await streamText({
      model,
      prompt: 'Test',
    });

    // Must consume the stream first for text promise to resolve
    for await (const _ of result.stream) {
      // Consume stream
    }

    const fullText = await result.text;

    expect(fullText).toContain('Complete response');
  });
});

