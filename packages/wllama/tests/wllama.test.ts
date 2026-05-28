/**
 * @localmode/wllama Tests — Provider & Model
 *
 * Unit tests for the wllama provider package.
 * All tests mock @wllama/wllama v3 since actual model inference requires browser + WASM.
 *
 * @packageDocumentation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { LanguageModel } from '@localmode/core';
import { ModelLoadError, GenerationError } from '@localmode/core';

// ═══════════════════════════════════════════════════════════════
// MOCKS — v3 OAI-compatible API shape
// ═══════════════════════════════════════════════════════════════

const mockState = {
  loadModelFromUrl: vi.fn().mockResolvedValue(undefined),
  createChatCompletion: vi.fn().mockResolvedValue({
    id: 'chatcmpl-1',
    object: 'chat.completion',
    created: Date.now(),
    model: 'test-model',
    choices: [{
      index: 0,
      message: { role: 'assistant', content: 'Hello, world!' },
      finish_reason: 'stop',
      logprobs: null,
    }],
    usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
  }),
  createCompletion: vi.fn().mockResolvedValue({
    id: 'cmpl-1',
    object: 'text_completion',
    created: Date.now(),
    model: 'test-model',
    choices: [{
      text: 'Hello, world!',
      index: 0,
      finish_reason: 'stop',
      logprobs: null,
    }],
    usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
  }),
  exit: vi.fn().mockResolvedValue(undefined),
};

vi.mock('@wllama/wllama', () => ({
  Wllama: function Wllama() {
    return {
      loadModelFromUrl: (...args: unknown[]) => mockState.loadModelFromUrl(...args),
      createChatCompletion: (...args: unknown[]) => mockState.createChatCompletion(...args),
      createCompletion: (...args: unknown[]) => mockState.createCompletion(...args),
      createEmbedding: vi.fn().mockResolvedValue({
        object: 'list',
        data: [{ object: 'embedding', index: 0, embedding: [0.1, 0.2, 0.3, 0.4] }],
        model: 'test-model',
        usage: { prompt_tokens: 3, total_tokens: 3 },
      }),
      exit: (...args: unknown[]) => mockState.exit(...args),
      cacheManager: { open: vi.fn().mockResolvedValue(null), list: vi.fn().mockResolvedValue([]) },
    };
  },
}));

vi.mock('@huggingface/gguf', () => ({
  gguf: vi.fn().mockResolvedValue({
    metadata: {
      'general.architecture': 'llama',
      'llama.context_length': 8192,
      'llama.embedding_length': 2048,
      'llama.vocab_size': 32000,
      'llama.attention.head_count': 32,
      'llama.block_count': 22,
      'general.name': 'Test Model',
      'general.file_type': 15,
      version: 3,
      tensor_count: BigInt(100),
      kv_count: BigInt(20),
    },
    tensorInfos: [
      { name: 'token_embd.weight', n_dims: 2, shape: [BigInt(32000), BigInt(2048)], dtype: 15, offset: BigInt(0) },
    ],
    tensorDataOffset: BigInt(4096),
    parameterCount: 1_236_000_000,
  }),
}));

// ═══════════════════════════════════════════════════════════════
// IMPORTS (after mocks)
// ═══════════════════════════════════════════════════════════════

import { WllamaLanguageModel, createLanguageModel } from '../src/model.js';
import { WllamaEmbeddingModel } from '../src/embedding.js';
import { createWllama } from '../src/provider.js';
import { isCrossOriginIsolated, resolveModelUrl } from '../src/utils.js';
import { WLLAMA_MODELS } from '../src/models.js';

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

describe('@localmode/wllama', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.loadModelFromUrl.mockResolvedValue(undefined);
    mockState.createChatCompletion.mockResolvedValue({
      id: 'chatcmpl-1',
      object: 'chat.completion',
      created: Date.now(),
      model: 'test-model',
      choices: [{
        index: 0,
        message: { role: 'assistant', content: 'Hello, world!' },
        finish_reason: 'stop',
        logprobs: null,
      }],
      usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
    });
    mockState.createCompletion.mockResolvedValue({
      id: 'cmpl-1',
      object: 'text_completion',
      created: Date.now(),
      model: 'test-model',
      choices: [{
        text: 'Hello, world!',
        index: 0,
        finish_reason: 'stop',
        logprobs: null,
      }],
      usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
    });
    mockState.exit.mockResolvedValue(undefined);
  });

  // ─────────────────────────────────────────────────────────────
  // Construction
  // ─────────────────────────────────────────────────────────────
  describe('WllamaLanguageModel construction', () => {
    it('should have modelId formatted as wllama:{baseModelId}', () => {
      const model = new WllamaLanguageModel('bartowski/Llama-3.2-1B-Instruct-GGUF:Q4_K_M');
      expect(model.modelId).toBe('wllama:bartowski/Llama-3.2-1B-Instruct-GGUF:Q4_K_M');
    });

    it('should have provider set to "wllama"', () => {
      const model = new WllamaLanguageModel('test-model');
      expect(model.provider).toBe('wllama');
    });

    it('should default contextLength to 4096', () => {
      const model = new WllamaLanguageModel('test-model');
      expect(model.contextLength).toBe(4096);
    });

    it('should use custom contextLength from settings', () => {
      const model = new WllamaLanguageModel('test-model', { contextLength: 8192 });
      expect(model.contextLength).toBe(8192);
    });

    it('should be assignable to LanguageModel', () => {
      const model: LanguageModel = new WllamaLanguageModel('test-model');
      expect(model.modelId).toContain('wllama');
      expect(model.provider).toBe('wllama');
      expect(model.contextLength).toBeGreaterThan(0);
      expect(typeof model.doGenerate).toBe('function');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // doGenerate() — with messages (always uses createCompletion with manual prompt)
  // ─────────────────────────────────────────────────────────────
  describe('doGenerate() with messages', () => {
    it('should return { text, finishReason, usage } from OAI response', async () => {
      const model = new WllamaLanguageModel('test-model', { modelUrl: 'https://example.com/test.gguf' });
      const result = await model.doGenerate({
        prompt: 'Hello',
        messages: [{ role: 'user', content: 'Hi there' }],
      });

      expect(result.text).toBe('Hello, world!');
      expect(result.finishReason).toBe('stop');
      expect(result.usage.inputTokens).toBe(5);
      expect(result.usage.outputTokens).toBe(3);
      expect(result.usage.totalTokens).toBe(8);
      expect(result.usage.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should call createChatCompletion with messages', async () => {
      const model = new WllamaLanguageModel('test-model', { modelUrl: 'https://example.com/test.gguf' });
      await model.doGenerate({
        prompt: 'What is AI?',
        messages: [{ role: 'user', content: 'Explain AI' }],
      });

      expect(mockState.createChatCompletion).toHaveBeenCalledTimes(1);
      const callArgs = mockState.createChatCompletion.mock.calls[0][0] as Record<string, unknown>;
      const msgs = callArgs.messages as Array<{ role: string; content: string }>;
      expect(msgs.some(m => m.content === 'Explain AI')).toBe(true);
      expect(msgs.some(m => m.content === 'What is AI?')).toBe(true);
    });

    it('should include system prompt as system message', async () => {
      const model = new WllamaLanguageModel('test-model', { modelUrl: 'https://example.com/test.gguf' });
      await model.doGenerate({
        prompt: 'Hello',
        systemPrompt: 'You are helpful.',
      });

      expect(mockState.createChatCompletion).toHaveBeenCalledTimes(1);
      const callArgs = mockState.createChatCompletion.mock.calls[0][0] as Record<string, unknown>;
      const msgs = callArgs.messages as Array<{ role: string; content: string }>;
      expect(msgs[0]).toEqual({ role: 'system', content: 'You are helpful.' });
    });

    it('should include sampling params in chat request', async () => {
      const model = new WllamaLanguageModel('test-model', { modelUrl: 'https://example.com/test.gguf' });
      await model.doGenerate({
        prompt: 'Hello',
        systemPrompt: 'Be concise',
        temperature: 0.5,
        topP: 0.9,
        providerOptions: { wllama: { top_k: 40 } },
      });

      const callArgs = mockState.createChatCompletion.mock.calls[0][0] as Record<string, unknown>;
      expect(callArgs.temp).toBe(0.5);
      expect(callArgs.top_p).toBe(0.9);
      expect(callArgs.top_k).toBe(40);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // doGenerate() — raw completion path (prompt only)
  // ─────────────────────────────────────────────────────────────
  describe('doGenerate() with prompt only (createCompletion)', () => {
    it('should call createCompletion for prompt-only input', async () => {
      const model = new WllamaLanguageModel('test-model', { modelUrl: 'https://example.com/test.gguf' });
      await model.doGenerate({ prompt: 'Once upon a time' });

      expect(mockState.createCompletion).toHaveBeenCalledTimes(1);
      expect(mockState.createChatCompletion).not.toHaveBeenCalled();
    });

    it('should pass prompt string to createCompletion', async () => {
      const model = new WllamaLanguageModel('test-model', { modelUrl: 'https://example.com/test.gguf' });
      await model.doGenerate({ prompt: 'Once upon a time' });

      const callArgs = mockState.createCompletion.mock.calls[0][0] as Record<string, unknown>;
      expect(callArgs.prompt).toContain('Once upon a time');
    });

    it('should return text from choices[0].text', async () => {
      const model = new WllamaLanguageModel('test-model', { modelUrl: 'https://example.com/test.gguf' });
      const result = await model.doGenerate({ prompt: 'Once' });

      expect(result.text).toBe('Hello, world!');
      expect(result.usage.inputTokens).toBe(5);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // doGenerate() — finish reason mapping
  // ─────────────────────────────────────────────────────────────
  describe('Finish reason mapping', () => {
    it('should map "stop" to "stop"', async () => {
      const model = new WllamaLanguageModel('test-model', { modelUrl: 'https://example.com/test.gguf' });
      const result = await model.doGenerate({ prompt: 'Hi', systemPrompt: 'test' });
      expect(result.finishReason).toBe('stop');
    });

    it('should map "length" to "length"', async () => {
      mockState.createChatCompletion.mockResolvedValue({
        id: 'chatcmpl-2',
        object: 'chat.completion',
        created: Date.now(),
        model: 'test-model',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Long...' },
          finish_reason: 'length',
          logprobs: null,
        }],
        usage: { prompt_tokens: 5, completion_tokens: 100, total_tokens: 105 },
      });

      const model = new WllamaLanguageModel('test-model', { modelUrl: 'https://example.com/test.gguf' });
      const result = await model.doGenerate({ prompt: 'Hi', systemPrompt: 'test' });
      expect(result.finishReason).toBe('length');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // doGenerate() with AbortSignal
  // ─────────────────────────────────────────────────────────────
  describe('doGenerate() with AbortSignal', () => {
    it('should throw immediately with already-aborted signal', async () => {
      const model = new WllamaLanguageModel('test-model', { modelUrl: 'https://example.com/test.gguf' });
      const controller = new AbortController();
      controller.abort();

      await expect(
        model.doGenerate({ prompt: 'Hello', abortSignal: controller.signal })
      ).rejects.toThrow();

      expect(mockState.createChatCompletion).not.toHaveBeenCalled();
      expect(mockState.createCompletion).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // doStream() — v3 streaming with onData callback
  // ─────────────────────────────────────────────────────────────
  describe('doStream()', () => {
    it('should yield StreamChunk objects with text deltas', async () => {
      mockState.createChatCompletion.mockResolvedValue({
        id: 'chatcmpl-stream',
        object: 'chat.completion',
        created: Date.now(),
        model: 'test-model',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Hello world!' },
          finish_reason: 'stop',
          logprobs: null,
        }],
        usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
      });

      const model = new WllamaLanguageModel('test-model', { modelUrl: 'https://example.com/test.gguf' });
      const chunks: Array<{ text: string; done: boolean }> = [];

      for await (const chunk of model.doStream({ prompt: 'Hello', systemPrompt: 'test' })) {
        chunks.push({ text: chunk.text, done: chunk.done });
      }

      expect(chunks.length).toBeGreaterThanOrEqual(2);

      const nonFinalChunks = chunks.filter(c => !c.done);
      expect(nonFinalChunks.length).toBeGreaterThan(0);
      for (const chunk of nonFinalChunks) {
        expect(chunk.text.length).toBeGreaterThan(0);
      }
    });

    it('should include finishReason and usage in final chunk', async () => {

      const model = new WllamaLanguageModel('test-model', { modelUrl: 'https://example.com/test.gguf' });
      let finalChunk;

      for await (const chunk of model.doStream({ prompt: 'Hello', systemPrompt: 'test' })) {
        if (chunk.done) finalChunk = chunk;
      }

      expect(finalChunk).toBeDefined();
      expect(finalChunk!.finishReason).toBe('stop');
      expect(finalChunk!.usage).toBeDefined();
      expect(finalChunk!.usage!.inputTokens).toBe(5);
      expect(finalChunk!.usage!.outputTokens).toBe(3);
      expect(finalChunk!.usage!.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // doStream() with AbortSignal
  // ─────────────────────────────────────────────────────────────
  describe('doStream() with AbortSignal', () => {
    it('should throw with already-aborted signal', async () => {
      const model = new WllamaLanguageModel('test-model', { modelUrl: 'https://example.com/test.gguf' });
      const controller = new AbortController();
      controller.abort();

      const streamFn = async () => {
        for await (const _chunk of model.doStream({ prompt: 'Hello', abortSignal: controller.signal })) {
          // Should not reach here
        }
      };

      await expect(streamFn()).rejects.toThrow();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Model load deduplication
  // ─────────────────────────────────────────────────────────────
  describe('Model load deduplication', () => {
    it('should load model only once for concurrent calls', async () => {
      const model = new WllamaLanguageModel('test-model', { modelUrl: 'https://example.com/test.gguf' });

      const [result1, result2] = await Promise.all([
        model.doGenerate({ prompt: 'Hello' }),
        model.doGenerate({ prompt: 'World' }),
      ]);

      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
      expect(mockState.loadModelFromUrl).toHaveBeenCalledTimes(1);
    });

    it('should reuse loaded model on subsequent calls', async () => {
      const model = new WllamaLanguageModel('test-model', { modelUrl: 'https://example.com/test.gguf' });

      await model.doGenerate({ prompt: 'First' });
      await model.doGenerate({ prompt: 'Second' });

      expect(mockState.loadModelFromUrl).toHaveBeenCalledTimes(1);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // unload()
  // ─────────────────────────────────────────────────────────────
  describe('unload()', () => {
    it('should call exit() on wllama instance', async () => {
      const model = new WllamaLanguageModel('test-model', { modelUrl: 'https://example.com/test.gguf' });
      await model.doGenerate({ prompt: 'Hello' });
      await model.unload();
      expect(mockState.exit).toHaveBeenCalled();
    });

    it('should be a no-op when model is not loaded', async () => {
      const model = new WllamaLanguageModel('test-model');
      await model.unload();
    });

    it('should trigger fresh load on next doGenerate() after unload', async () => {
      const model = new WllamaLanguageModel('test-model', { modelUrl: 'https://example.com/test.gguf' });
      await model.doGenerate({ prompt: 'First' });
      expect(mockState.loadModelFromUrl).toHaveBeenCalledTimes(1);

      await model.unload();

      await model.doGenerate({ prompt: 'Second' });
      expect(mockState.loadModelFromUrl).toHaveBeenCalledTimes(2);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Error wrapping
  // ─────────────────────────────────────────────────────────────
  describe('Error wrapping', () => {
    it('should wrap model load errors as ModelLoadError', async () => {
      mockState.loadModelFromUrl.mockRejectedValue(new Error('Network error: 404'));

      const model = new WllamaLanguageModel('bad-model', { modelUrl: 'https://example.com/nonexistent.gguf' });
      await expect(model.doGenerate({ prompt: 'Hello' })).rejects.toThrow(ModelLoadError);
    });

    it('should wrap generation errors as GenerationError', async () => {
      mockState.createCompletion.mockRejectedValue(new Error('WASM OOM'));

      const model = new WllamaLanguageModel('test-model', { modelUrl: 'https://example.com/test.gguf' });
      await expect(model.doGenerate({ prompt: 'Hello' })).rejects.toThrow(GenerationError);
    });

    it('should include cause in GenerationError', async () => {
      const originalError = new Error('WASM OOM');
      mockState.createCompletion.mockRejectedValue(originalError);

      const model = new WllamaLanguageModel('test-model', { modelUrl: 'https://example.com/test.gguf' });

      try {
        await model.doGenerate({ prompt: 'Hello' });
        expect.unreachable('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(GenerationError);
        expect((error as GenerationError).cause).toBe(originalError);
      }
    });

    it('should wrap chat completion errors as GenerationError when both paths fail', async () => {
      mockState.createChatCompletion.mockRejectedValue(new Error('Template error'));
      mockState.createCompletion.mockRejectedValue(new Error('Fallback also failed'));

      const model = new WllamaLanguageModel('test-model', { modelUrl: 'https://example.com/test.gguf' });
      await expect(
        model.doGenerate({ prompt: 'Hello', systemPrompt: 'test' })
      ).rejects.toThrow(GenerationError);
    });

    it('should use createChatCompletion when messages or systemPrompt present', async () => {
      const model = new WllamaLanguageModel('test-model', { modelUrl: 'https://example.com/test.gguf' });
      const result = await model.doGenerate({ prompt: 'Hello', systemPrompt: 'test' });
      expect(result.text).toBe('Hello, world!');
      expect(mockState.createChatCompletion).toHaveBeenCalledTimes(1);
    });

    it('should wrap chat completion errors as GenerationError', async () => {
      mockState.createChatCompletion.mockRejectedValue(new Error('Template error'));

      const model = new WllamaLanguageModel('test-model', { modelUrl: 'https://example.com/test.gguf' });
      await expect(
        model.doGenerate({ prompt: 'Hello', systemPrompt: 'test' })
      ).rejects.toThrow(GenerationError);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // createWllama() factory
  // ─────────────────────────────────────────────────────────────
  describe('createWllama() factory', () => {
    it('should return a provider with languageModel method', () => {
      const provider = createWllama();
      expect(provider).toHaveProperty('languageModel');
      expect(typeof provider.languageModel).toBe('function');
    });

    it('should create models with merged settings', () => {
      const onProgress = vi.fn();
      const provider = createWllama({ onProgress, numThreads: 4 });
      const model = provider.languageModel('test-model');
      expect(model).toBeInstanceOf(WllamaLanguageModel);
      expect(model.modelId).toBe('wllama:test-model');
    });

    it('should allow model settings to override provider settings', () => {
      const providerCb = vi.fn();
      const modelCb = vi.fn();
      const provider = createWllama({ onProgress: providerCb });
      const model = provider.languageModel('test-model', { onProgress: modelCb }) as WllamaLanguageModel;
      expect(model).toBeInstanceOf(WllamaLanguageModel);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // isCrossOriginIsolated()
  // ─────────────────────────────────────────────────────────────
  describe('isCrossOriginIsolated()', () => {
    const original = globalThis.crossOriginIsolated;

    afterEach(() => {
      Object.defineProperty(globalThis, 'crossOriginIsolated', {
        value: original, writable: true, configurable: true,
      });
    });

    it('should return true when crossOriginIsolated is true', () => {
      Object.defineProperty(globalThis, 'crossOriginIsolated', { value: true, writable: true, configurable: true });
      expect(isCrossOriginIsolated()).toBe(true);
    });

    it('should return false when crossOriginIsolated is false', () => {
      Object.defineProperty(globalThis, 'crossOriginIsolated', { value: false, writable: true, configurable: true });
      expect(isCrossOriginIsolated()).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Utilities
  // ─────────────────────────────────────────────────────────────
  describe('resolveModelUrl()', () => {
    it('should return URL as-is when full URL provided', () => {
      const url = 'https://huggingface.co/repo/model/resolve/main/model.gguf';
      expect(resolveModelUrl(url)).toBe(url);
    });

    it('should resolve shorthand format repo/name:filename.gguf', () => {
      const result = resolveModelUrl('bartowski/Llama-3.2-1B-Instruct-GGUF:Llama-3.2-1B-Instruct-Q4_K_M.gguf');
      expect(result).toBe('https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf');
    });

    it('should use explicit modelUrl override', () => {
      const url = 'https://cdn.example.com/custom.gguf';
      expect(resolveModelUrl('anything', url)).toBe(url);
    });
  });

  describe('WLLAMA_MODELS catalog', () => {
    it('should contain models across size categories', () => {
      const models = Object.values(WLLAMA_MODELS);
      const tiny = models.filter(m => m.sizeBytes < 500 * 1024 * 1024);
      const small = models.filter(m => m.sizeBytes >= 500 * 1024 * 1024 && m.sizeBytes < 1024 * 1024 * 1024);
      const medium = models.filter(m => m.sizeBytes >= 1024 * 1024 * 1024 && m.sizeBytes < 2 * 1024 * 1024 * 1024);
      const large = models.filter(m => m.sizeBytes >= 2 * 1024 * 1024 * 1024);

      expect(tiny.length).toBeGreaterThan(0);
      expect(small.length).toBeGreaterThan(0);
      expect(medium.length).toBeGreaterThan(0);
      expect(large.length).toBeGreaterThan(0);
    });

    it('should have required metadata on each entry', () => {
      for (const entry of Object.values(WLLAMA_MODELS)) {
        expect(entry.name).toBeTruthy();
        expect(entry.contextLength).toBeGreaterThan(0);
        expect(entry.sizeBytes).toBeGreaterThan(0);
        expect(entry.size).toBeTruthy();
        expect(entry.description).toBeTruthy();
        expect(entry.url).toMatch(/^https:\/\//);
        expect(entry.architecture).toBeTruthy();
        expect(entry.quantization).toBeTruthy();
        expect(entry.parameterCount).toBeGreaterThan(0);
      }
    });
  });

  describe('createLanguageModel()', () => {
    it('should create a WllamaLanguageModel instance', () => {
      const model = createLanguageModel('test-model', { temperature: 0.5 });
      expect(model).toBeInstanceOf(WllamaLanguageModel);
      expect(model.modelId).toBe('wllama:test-model');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Vision support (supportsVision)
  // ─────────────────────────────────────────────────────────────
  describe('Vision support', () => {
    it('should set supportsVision=true when mmprojUrl is provided', () => {
      const model = new WllamaLanguageModel('test-model', {
        mmprojUrl: 'https://example.com/mmproj.gguf',
      });
      expect(model.supportsVision).toBe(true);
    });

    it('should set supportsVision=false when no mmprojUrl', () => {
      const model = new WllamaLanguageModel('test-model');
      expect(model.supportsVision).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // WebGPU settings
  // ─────────────────────────────────────────────────────────────
  describe('WebGPU settings', () => {
    it('should set gpuAccelerated=false by default', () => {
      const model = new WllamaLanguageModel('test-model');
      expect(model.gpuAccelerated).toBe(false);
    });

    it('should set gpuAccelerated=true when nGpuLayers is set', () => {
      const model = new WllamaLanguageModel('test-model', { nGpuLayers: 16 });
      expect(model.gpuAccelerated).toBe(true);
    });

    it('should set gpuAccelerated=false when nGpuLayers is 0', () => {
      const model = new WllamaLanguageModel('test-model', { nGpuLayers: 0 });
      expect(model.gpuAccelerated).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Tool calling (providerOptions accepted, forwarded via prompt)
  // ─────────────────────────────────────────────────────────────
  describe('Tool calling', () => {
    it('should accept tool providerOptions without error', async () => {
      const tools = [{
        type: 'function' as const,
        function: { name: 'get_weather', description: 'Get weather', parameters: { type: 'object' as const, properties: { city: { type: 'string' } } } },
      }];

      const model = new WllamaLanguageModel('test-model', { modelUrl: 'https://example.com/test.gguf' });
      const result = await model.doGenerate({
        prompt: 'What is the weather?',
        systemPrompt: 'Use tools',
        providerOptions: { wllama: { tools, tool_choice: 'auto' } },
      });

      expect(result.text).toBeDefined();
      expect(mockState.createChatCompletion).toHaveBeenCalledTimes(1);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Catalog — new fields
  // ─────────────────────────────────────────────────────────────
  describe('WLLAMA_MODELS catalog — v3 fields', () => {
    it('should have tool-calling models marked', () => {
      const toolModels = Object.values(WLLAMA_MODELS).filter(
        m => 'supportsToolCalling' in m && m.supportsToolCalling
      );
      expect(toolModels.length).toBeGreaterThan(0);
    });

    it('should have embedding models with dimensions', () => {
      const embeddingModels = Object.values(WLLAMA_MODELS).filter(
        m => 'isEmbeddingModel' in m && m.isEmbeddingModel
      );
      expect(embeddingModels.length).toBeGreaterThan(0);
      for (const m of embeddingModels) {
        expect('dimensions' in m && m.dimensions).toBeGreaterThan(0);
      }
    });

    it('should have vision models with mmprojUrl', () => {
      const visionModels = Object.values(WLLAMA_MODELS).filter(m => m.vision);
      expect(visionModels.length).toBeGreaterThan(0);
      for (const m of visionModels) {
        expect('mmprojUrl' in m && m.mmprojUrl).toBeTruthy();
      }
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Embedding model
  // ─────────────────────────────────────────────────────────────
  describe('WllamaEmbeddingModel', () => {
    it('should be created via provider.embedding()', () => {
      const provider = createWllama();
      expect(provider).toHaveProperty('embedding');
      const model = provider.embedding('test-embed');
      expect(model.modelId).toBe('wllama:test-embed');
      expect(model.provider).toBe('wllama');
    });
  });
});
