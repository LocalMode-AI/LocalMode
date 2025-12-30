/**
 * Question Answering Domain Tests
 *
 * Tests for answerQuestion() function.
 *
 * @packageDocumentation
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  answerQuestion,
  setGlobalQuestionAnsweringProvider,
} from '../src/question-answering/index.js';
import { createMockQuestionAnsweringModel } from '../src/testing/index.js';

describe('answerQuestion()', () => {
  afterEach(() => {
    setGlobalQuestionAnsweringProvider(() => {
      throw new Error('No global provider');
    });
  });

  it('should answer questions from context', async () => {
    const model = createMockQuestionAnsweringModel();

    const result = await answerQuestion({
      model,
      question: 'What is the capital of France?',
      context: 'Paris is the capital of France. It is a beautiful city.',
    });

    expect(result.answer).toBeDefined();
    expect(result.answer.length).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(0);
  });

  it('should include position information', async () => {
    const model = createMockQuestionAnsweringModel();

    const result = await answerQuestion({
      model,
      question: 'Test question?',
      context: 'This is the context with the answer.',
    });

    expect(result.start).toBeDefined();
    expect(result.end).toBeDefined();
    expect(result.start).toBeLessThanOrEqual(result.end);
  });

  it('should respect topK option', async () => {
    const model = createMockQuestionAnsweringModel();

    const result = await answerQuestion({
      model,
      question: 'Test question?',
      context: 'Context.',
      topK: 1,
    });

    // With topK=1, allAnswers should either be undefined or have at most 1 item
    expect(!result.allAnswers || result.allAnswers.length <= 1).toBe(true);
  });

  it('should handle different question types', async () => {
    const model = createMockQuestionAnsweringModel();

    const result = await answerQuestion({
      model,
      question: 'What is the answer?',
      context: 'The answer is 42.',
    });

    expect(result.answer).toBeDefined();
    expect(result.usage.inputTokens).toBeGreaterThan(0);
  });

  it('should support abort signal', async () => {
    const model = createMockQuestionAnsweringModel({ delay: 100 });
    const controller = new AbortController();

    const promise = answerQuestion({
      model,
      question: 'Test?',
      context: 'Context.',
      abortSignal: controller.signal,
    });

    controller.abort();

    await expect(promise).rejects.toThrow();
  });

  it('should use global provider with string model ID', async () => {
    setGlobalQuestionAnsweringProvider(() =>
      createMockQuestionAnsweringModel()
    );

    const result = await answerQuestion({
      model: 'test-model' as any,
      question: 'Test question?',
      context: 'The answer is here.',
    });

    expect(result.answer).toBeDefined();
    expect(result.answer.length).toBeGreaterThan(0);
  });
});

