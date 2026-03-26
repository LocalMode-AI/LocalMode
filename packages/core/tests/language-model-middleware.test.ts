/**
 * Language Model Middleware Tests
 *
 * Tests for wrapLanguageModel() and composeLanguageModelMiddleware().
 *
 * @packageDocumentation
 */

import { describe, it, expect } from 'vitest';
import {
  wrapLanguageModel,
  composeLanguageModelMiddleware,
} from '../src/generation/middleware.js';
import type { LanguageModelMiddleware } from '../src/generation/types.js';
import { createMockLanguageModel } from '../src/testing/index.js';

describe('wrapLanguageModel()', () => {
  it('should preserve readonly properties', () => {
    const model = createMockLanguageModel();
    const middleware: LanguageModelMiddleware = {};

    const wrapped = wrapLanguageModel({ model, middleware });

    expect(wrapped.modelId).toBe(model.modelId);
    expect(wrapped.provider).toBe(model.provider);
    expect(wrapped.contextLength).toBe(model.contextLength);
  });

  it('should pass through when middleware is empty', async () => {
    const model = createMockLanguageModel({ mockResponse: 'Hello world' });
    const middleware: LanguageModelMiddleware = {};

    const wrapped = wrapLanguageModel({ model, middleware });

    const result = await wrapped.doGenerate({ prompt: 'test' });
    expect(result.text).toBe('Hello world');
  });

  it('should apply transformParams to doGenerate', async () => {
    const model = createMockLanguageModel({ mockResponse: 'Generated' });
    let receivedPrompt = '';

    // Create a model that captures the prompt it receives
    const capturingModel = {
      ...model,
      async doGenerate(options: { prompt: string; abortSignal?: AbortSignal }) {
        receivedPrompt = options.prompt;
        return model.doGenerate(options);
      },
    };

    const middleware: LanguageModelMiddleware = {
      transformParams: ({ prompt, systemPrompt, messages }) => ({
        prompt: `TRANSFORMED: ${prompt}`,
        systemPrompt,
        messages,
      }),
    };

    const wrapped = wrapLanguageModel({
      model: capturingModel,
      middleware,
    });

    await wrapped.doGenerate({ prompt: 'original' });
    expect(receivedPrompt).toBe('TRANSFORMED: original');
  });

  it('should apply wrapGenerate to intercept generation', async () => {
    const model = createMockLanguageModel({ mockResponse: 'Model response' });
    let modelCalled = false;

    const middleware: LanguageModelMiddleware = {
      wrapGenerate: async ({ doGenerate, prompt }) => {
        if (prompt === 'cached') {
          return {
            text: 'From cache',
            finishReason: 'stop',
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, durationMs: 0 },
          };
        }
        modelCalled = true;
        return doGenerate();
      },
    };

    const wrapped = wrapLanguageModel({ model, middleware });

    // Cache hit - model should not be called
    const cachedResult = await wrapped.doGenerate({ prompt: 'cached' });
    expect(cachedResult.text).toBe('From cache');
    expect(modelCalled).toBe(false);

    // Cache miss - model should be called
    const missResult = await wrapped.doGenerate({ prompt: 'not cached' });
    expect(missResult.text).toBe('Model response');
    expect(modelCalled).toBe(true);
  });

  it('should apply wrapStream to intercept streaming', async () => {
    const model = createMockLanguageModel({ mockResponse: 'Streamed text' });

    const middleware: LanguageModelMiddleware = {
      wrapStream: ({ doStream, prompt }) => {
        if (prompt === 'cached') {
          return (async function* () {
            yield { text: 'Cached stream', done: true, finishReason: 'stop' as const };
          })();
        }
        return doStream();
      },
    };

    const wrapped = wrapLanguageModel({ model, middleware });

    // Cache hit
    const cachedChunks: string[] = [];
    for await (const chunk of wrapped.doStream!({ prompt: 'cached' })) {
      cachedChunks.push(chunk.text);
    }
    expect(cachedChunks.join('')).toBe('Cached stream');

    // Cache miss
    const streamChunks: string[] = [];
    for await (const chunk of wrapped.doStream!({ prompt: 'other' })) {
      streamChunks.push(chunk.text);
    }
    expect(streamChunks.join('')).toBe('Streamed text');
  });

  it('should propagate AbortSignal', async () => {
    const model = createMockLanguageModel({ delay: 100 });
    const middleware: LanguageModelMiddleware = {};

    const wrapped = wrapLanguageModel({ model, middleware });

    const controller = new AbortController();
    controller.abort();

    await expect(
      wrapped.doGenerate({ prompt: 'test', abortSignal: controller.signal })
    ).rejects.toThrow();
  });

  it('should not add doStream when model lacks it and no wrapStream', () => {
    const model = createMockLanguageModel();
    // Remove doStream from model
    const modelWithoutStream = {
      modelId: model.modelId,
      provider: model.provider,
      contextLength: model.contextLength,
      doGenerate: model.doGenerate.bind(model),
      // No doStream
    };

    const middleware: LanguageModelMiddleware = {};

    const wrapped = wrapLanguageModel({ model: modelWithoutStream, middleware });

    expect(wrapped.doStream).toBeUndefined();
  });

  it('should add doStream when middleware provides wrapStream even if model lacks it', () => {
    const model = createMockLanguageModel();
    const modelWithoutStream = {
      modelId: model.modelId,
      provider: model.provider,
      contextLength: model.contextLength,
      doGenerate: model.doGenerate.bind(model),
      // No doStream
    };

    const middleware: LanguageModelMiddleware = {
      wrapStream: () => {
        return (async function* () {
          yield { text: 'middleware-provided', done: true };
        })();
      },
    };

    const wrapped = wrapLanguageModel({ model: modelWithoutStream, middleware });

    expect(wrapped.doStream).toBeDefined();
  });
});

describe('composeLanguageModelMiddleware()', () => {
  it('should return empty object for empty array', () => {
    const composed = composeLanguageModelMiddleware([]);

    expect(composed).toEqual({});
  });

  it('should return the same middleware for single item', () => {
    const single: LanguageModelMiddleware = {
      transformParams: (params) => params,
    };

    const composed = composeLanguageModelMiddleware([single]);

    expect(composed).toBe(single);
  });

  it('should chain transformParams in order', async () => {
    const mw1: LanguageModelMiddleware = {
      transformParams: ({ prompt, ...rest }) => ({
        ...rest,
        prompt: `[mw1]${prompt}`,
      }),
    };

    const mw2: LanguageModelMiddleware = {
      transformParams: ({ prompt, ...rest }) => ({
        ...rest,
        prompt: `[mw2]${prompt}`,
      }),
    };

    const composed = composeLanguageModelMiddleware([mw1, mw2]);

    const result = await composed.transformParams!({
      prompt: 'hello',
    });

    // mw1 first, then mw2
    expect(result.prompt).toBe('[mw2][mw1]hello');
  });

  it('should chain wrapGenerate with first middleware outermost', async () => {
    const order: string[] = [];

    const mw1: LanguageModelMiddleware = {
      wrapGenerate: async ({ doGenerate }) => {
        order.push('mw1-before');
        const result = await doGenerate();
        order.push('mw1-after');
        return result;
      },
    };

    const mw2: LanguageModelMiddleware = {
      wrapGenerate: async ({ doGenerate }) => {
        order.push('mw2-before');
        const result = await doGenerate();
        order.push('mw2-after');
        return result;
      },
    };

    const model = createMockLanguageModel();
    const composed = composeLanguageModelMiddleware([mw1, mw2]);

    const wrapped = wrapLanguageModel({ model, middleware: composed });
    await wrapped.doGenerate({ prompt: 'test' });

    // First middleware (mw1) wraps outermost
    expect(order).toEqual(['mw1-before', 'mw2-before', 'mw2-after', 'mw1-after']);
  });

  it('should chain wrapStream with first middleware outermost', async () => {
    const order: string[] = [];

    const mw1: LanguageModelMiddleware = {
      wrapStream: ({ doStream }) => {
        return (async function* () {
          order.push('mw1-before');
          for await (const chunk of doStream()) {
            yield chunk;
          }
          order.push('mw1-after');
        })();
      },
    };

    const mw2: LanguageModelMiddleware = {
      wrapStream: ({ doStream }) => {
        return (async function* () {
          order.push('mw2-before');
          for await (const chunk of doStream()) {
            yield chunk;
          }
          order.push('mw2-after');
        })();
      },
    };

    const model = createMockLanguageModel();
    const composed = composeLanguageModelMiddleware([mw1, mw2]);

    const wrapped = wrapLanguageModel({ model, middleware: composed });
    for await (const _chunk of wrapped.doStream!({ prompt: 'test' })) {
      // consume
    }

    expect(order).toEqual(['mw1-before', 'mw2-before', 'mw2-after', 'mw1-after']);
  });
});
