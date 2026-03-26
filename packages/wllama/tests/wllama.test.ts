/**
 * @localmode/wllama Tests — Provider & Model
 *
 * Unit tests for the wllama provider package.
 * All tests mock @wllama/wllama since actual model inference requires browser + WASM.
 *
 * @packageDocumentation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { LanguageModel } from '@localmode/core';
import { ModelLoadError, GenerationError } from '@localmode/core';

// ═══════════════════════════════════════════════════════════════
// MOCKS
// ═══════════════════════════════════════════════════════════════

// Shared mock state — tests modify this to customize behavior
const mockState = {
  loadModelFromUrl: vi.fn().mockResolvedValue(undefined),
  createCompletion: vi.fn().mockResolvedValue('Hello, world!'),
  tokenize: vi.fn().mockResolvedValue([1, 2, 3, 4, 5]),
  lookupToken: vi.fn().mockResolvedValue(-1),
  samplingInit: vi.fn().mockResolvedValue(undefined),
  exit: vi.fn().mockResolvedValue(undefined),
};

// Mock @wllama/wllama — Wllama constructor returns an object with our mock state
vi.mock('@wllama/wllama', () => ({
  Wllama: function Wllama() {
    return {
      loadModelFromUrl: (...args: unknown[]) => mockState.loadModelFromUrl(...args),
      createCompletion: (...args: unknown[]) => mockState.createCompletion(...args),
      tokenize: (...args: unknown[]) => mockState.tokenize(...args),
      lookupToken: (...args: unknown[]) => mockState.lookupToken(...args),
      samplingInit: (...args: unknown[]) => mockState.samplingInit(...args),
      exit: (...args: unknown[]) => mockState.exit(...args),
      cacheManager: { open: vi.fn().mockResolvedValue(null), list: vi.fn().mockResolvedValue([]) },
    };
  },
}));

// Mock @huggingface/gguf
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
    mockState.createCompletion.mockResolvedValue('Hello, world!');
    mockState.tokenize.mockResolvedValue([1, 2, 3, 4, 5]);
    mockState.lookupToken.mockResolvedValue(-1);
    mockState.samplingInit.mockResolvedValue(undefined);
    mockState.exit.mockResolvedValue(undefined);
  });

  // ─────────────────────────────────────────────────────────────
  // 8.1: WllamaLanguageModel construction
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
  // 8.2: doGenerate()
  // ─────────────────────────────────────────────────────────────
  describe('doGenerate()', () => {
    it('should return { text, finishReason, usage } structure', async () => {
      const model = new WllamaLanguageModel('test-model', { modelUrl: 'https://example.com/test.gguf' });
      const result = await model.doGenerate({ prompt: 'Hello' });

      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('finishReason');
      expect(result).toHaveProperty('usage');
      expect(result.text).toBe('Hello, world!');
      expect(typeof result.finishReason).toBe('string');
      expect(result.usage).toHaveProperty('inputTokens');
      expect(result.usage).toHaveProperty('outputTokens');
      expect(result.usage).toHaveProperty('totalTokens');
      expect(result.usage).toHaveProperty('durationMs');
    });

    it('should pass temperature and topP to sampling config', async () => {
      const model = new WllamaLanguageModel('test-model', { modelUrl: 'https://example.com/test.gguf' });
      await model.doGenerate({ prompt: 'Hello', temperature: 0.5, topP: 0.9 });

      expect(mockState.createCompletion).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          sampling: expect.objectContaining({
            temp: 0.5,
            top_p: 0.9,
          }),
        })
      );
    });

    it('should construct prompt from systemPrompt + prompt', async () => {
      const model = new WllamaLanguageModel('test-model', { modelUrl: 'https://example.com/test.gguf' });
      await model.doGenerate({ prompt: 'Hi', systemPrompt: 'You are helpful.' });

      const callArgs = mockState.createCompletion.mock.calls[0];
      const fullPrompt = callArgs[0] as string;
      expect(fullPrompt).toContain('You are helpful.');
      expect(fullPrompt).toContain('Hi');
    });

    it('should pass maxTokens as nPredict', async () => {
      const model = new WllamaLanguageModel('test-model', { modelUrl: 'https://example.com/test.gguf' });
      await model.doGenerate({ prompt: 'Hello', maxTokens: 100 });

      expect(mockState.createCompletion).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          nPredict: 100,
        })
      );
    });

    it('should pass wllama-specific providerOptions to sampling', async () => {
      const model = new WllamaLanguageModel('test-model', { modelUrl: 'https://example.com/test.gguf' });
      await model.doGenerate({
        prompt: 'Hello',
        providerOptions: {
          wllama: { top_k: 40, repeat_penalty: 1.1 },
        },
      });

      expect(mockState.createCompletion).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          sampling: expect.objectContaining({
            top_k: 40,
            penalty_repeat: 1.1,
          }),
        })
      );
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 8.3: doGenerate() with AbortSignal
  // ─────────────────────────────────────────────────────────────
  describe('doGenerate() with AbortSignal', () => {
    it('should throw immediately with already-aborted signal', async () => {
      const model = new WllamaLanguageModel('test-model', { modelUrl: 'https://example.com/test.gguf' });
      const controller = new AbortController();
      controller.abort();

      await expect(
        model.doGenerate({ prompt: 'Hello', abortSignal: controller.signal })
      ).rejects.toThrow();

      // wllama createCompletion should NOT have been called
      expect(mockState.createCompletion).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 8.4: doStream()
  // ─────────────────────────────────────────────────────────────
  describe('doStream()', () => {
    it('should yield StreamChunk objects with text and done', async () => {
      mockState.createCompletion.mockImplementation(
        async (_prompt: string, opts: Record<string, unknown>) => {
          const onNewToken = opts.onNewToken as (token: number, piece: Uint8Array, text: string) => void;
          onNewToken?.(1, new Uint8Array(), 'Hello');
          onNewToken?.(2, new Uint8Array(), 'Hello world');
          onNewToken?.(3, new Uint8Array(), 'Hello world!');
          return 'Hello world!';
        }
      );

      const model = new WllamaLanguageModel('test-model', { modelUrl: 'https://example.com/test.gguf' });
      const chunks: Array<{ text: string; done: boolean }> = [];

      for await (const chunk of model.doStream({ prompt: 'Hello' })) {
        chunks.push({ text: chunk.text, done: chunk.done });
      }

      expect(chunks.length).toBeGreaterThan(1);

      const lastChunk = chunks[chunks.length - 1];
      expect(lastChunk.done).toBe(true);

      const nonFinalChunks = chunks.filter(c => !c.done);
      expect(nonFinalChunks.length).toBeGreaterThan(0);
      for (const chunk of nonFinalChunks) {
        expect(chunk.done).toBe(false);
        expect(chunk.text.length).toBeGreaterThan(0);
      }
    });

    it('should include finishReason and usage in final chunk', async () => {
      mockState.createCompletion.mockImplementation(
        async (_prompt: string, opts: Record<string, unknown>) => {
          const onNewToken = opts.onNewToken as (token: number, piece: Uint8Array, text: string) => void;
          onNewToken?.(1, new Uint8Array(), 'Hello');
          return 'Hello';
        }
      );

      const model = new WllamaLanguageModel('test-model', { modelUrl: 'https://example.com/test.gguf' });
      let finalChunk;

      for await (const chunk of model.doStream({ prompt: 'Hello' })) {
        if (chunk.done) {
          finalChunk = chunk;
        }
      }

      expect(finalChunk).toBeDefined();
      expect(finalChunk!.finishReason).toBeDefined();
      expect(finalChunk!.usage).toBeDefined();
      expect(finalChunk!.usage!.inputTokens).toBeGreaterThanOrEqual(0);
      expect(finalChunk!.usage!.outputTokens).toBeGreaterThanOrEqual(0);
      expect(finalChunk!.usage!.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 8.5: doStream() with AbortSignal
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
  // 8.6: Model load deduplication
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
  // 8.7: unload()
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
      await model.unload(); // Should not throw
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
  // 8.8: Finish reason mapping
  // ─────────────────────────────────────────────────────────────
  describe('Finish reason mapping', () => {
    it('should return "stop" when tokens < maxTokens', async () => {
      mockState.createCompletion.mockImplementation(
        async (_prompt: string, opts: Record<string, unknown>) => {
          const onNewToken = opts.onNewToken as (() => void) | undefined;
          for (let i = 0; i < 3; i++) { onNewToken?.(); }
          return 'Short response';
        }
      );

      const model = new WllamaLanguageModel('test-model', { modelUrl: 'https://example.com/test.gguf' });
      const result = await model.doGenerate({ prompt: 'Hello', maxTokens: 100 });
      expect(result.finishReason).toBe('stop');
    });

    it('should return "length" when outputTokens >= maxTokens', async () => {
      mockState.createCompletion.mockImplementation(
        async (_prompt: string, opts: Record<string, unknown>) => {
          const onNewToken = opts.onNewToken as (() => void) | undefined;
          const nPredict = (opts.nPredict as number) ?? 10;
          for (let i = 0; i < nPredict; i++) { onNewToken?.(); }
          return 'Long response';
        }
      );

      const model = new WllamaLanguageModel('test-model', { modelUrl: 'https://example.com/test.gguf' });
      const result = await model.doGenerate({ prompt: 'Hello', maxTokens: 10 });
      expect(result.finishReason).toBe('length');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 8.9: createWllama() factory
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
  // 8.10: isCrossOriginIsolated()
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
  // 8.11: Error wrapping
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
});
