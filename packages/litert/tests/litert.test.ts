/**
 * @localmode/litert Tests — Provider & Model
 *
 * Unit tests for the LiteRT-LM provider package. `@litert-lm/core` is mocked
 * (real inference needs a browser + WASM + WebGPU) and `fetch` is mocked (the
 * network is the layer below this unit). End-to-end model loading is covered
 * separately by a real-browser test, not here.
 *
 * @packageDocumentation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ═══════════════════════════════════════════════════════════════
// MOCKS
// ═══════════════════════════════════════════════════════════════

/** Shared mock state — tests modify this to customize behavior. */
const mockState = {
  sendMessage: vi.fn(),
  sendMessageStreaming: vi.fn(),
  cancel: vi.fn(),
  conversationDelete: vi.fn().mockResolvedValue(undefined),
  engineDelete: vi.fn().mockResolvedValue(undefined),
  createConversation: vi.fn(),
  engineCreate: vi.fn(),
};

/** The mocked Backend enum — values match @litert-lm/core@0.12.1. */
const Backend = {
  UNSPECIFIED: 0,
  CPU_ARTISAN: 1,
  GPU_ARTISAN: 2,
  CPU: 3,
  GPU: 4,
  GOOGLE_TENSOR_ARTISAN: 5,
  NPU: 6,
};

vi.mock('@litert-lm/core', () => {
  const conversationFactory = () => ({
    sendMessage: (...args: unknown[]) => mockState.sendMessage(...args),
    sendMessageStreaming: (...args: unknown[]) => mockState.sendMessageStreaming(...args),
    cancel: () => mockState.cancel(),
    delete: () => mockState.conversationDelete(),
    getHistory: () => [],
  });

  const engineFactory = () => ({
    createConversation: (...args: unknown[]) => {
      mockState.createConversation(...args);
      return Promise.resolve(conversationFactory());
    },
    createSession: vi.fn(),
    delete: () => mockState.engineDelete(),
    settings: {},
  });

  return {
    Engine: {
      create: (...args: unknown[]) => {
        const result = mockState.engineCreate(...args);
        // A test may make engineCreate throw to exercise the CPU fallback.
        if (result instanceof Error) return Promise.reject(result);
        return Promise.resolve(engineFactory());
      },
    },
    Backend,
  };
});

// ═══════════════════════════════════════════════════════════════
// IMPORTS (after mocks)
// ═══════════════════════════════════════════════════════════════

import { LiteRTLanguageModel, createLanguageModel } from '../src/model.js';
import { createLitert, litert } from '../src/provider.js';
import { resolveModelUrl, resetWebGPUUsableCache } from '../src/utils.js';
import { LITERT_MODELS, MODEL_SIZE_THRESHOLDS, getModelCategory } from '../src/models.js';

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

/** A small fake `.litertlm` response so fetchModelStream never hits the network. */
function fakeModelResponse(): Response {
  return new Response(new Uint8Array([1, 2, 3, 4]), {
    status: 200,
    headers: { 'Content-Length': '4' },
  });
}

describe('@localmode/litert', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // engineCreate succeeds by default (returns undefined -> engine resolves).
    mockState.engineCreate.mockReturnValue(undefined);

    mockState.sendMessage.mockResolvedValue({
      role: 'assistant',
      content: 'Hello, world!',
    });

    // LiteRT-LM streams DELTA chunks — each chunk's content is only the newly
    // generated piece, not the cumulative response.
    mockState.sendMessageStreaming.mockImplementation(
      () =>
        new ReadableStream({
          start(controller) {
            controller.enqueue({ role: 'assistant', content: 'Hello' });
            controller.enqueue({ role: 'assistant', content: ', world!' });
            controller.close();
          },
        }),
    );

    // Mock the network: fetchModelStream() must never download a real model.
    globalThis.fetch = vi.fn(async () => fakeModelResponse()) as typeof fetch;

    // WebGPU is "available" by default so requiresWebGPU (Gemma 4) models load.
    // Individual tests override navigator to simulate a no-WebGPU browser.
    (globalThis as { navigator?: unknown }).navigator = {
      gpu: {
        requestAdapter: async () => ({ requestDevice: async () => ({ destroy() {} }) }),
      },
    };
    resetWebGPUUsableCache();
  });

  // ─────────────────────────────────────────────────────────────
  // Model catalog
  // ─────────────────────────────────────────────────────────────

  describe('LITERT_MODELS catalog', () => {
    it('ships the two officially-supported Gemma 4 models plus Qwen3 0.6B', () => {
      expect(Object.keys(LITERT_MODELS)).toEqual(['gemma-4-E2B', 'gemma-4-E4B', 'qwen3-0.6B']);
    });

    it('Gemma 4 entries use the web-optimized -web.litertlm builds', () => {
      expect(LITERT_MODELS['gemma-4-E2B'].url).toContain('gemma-4-E2B-it-web.litertlm');
      expect(LITERT_MODELS['gemma-4-E4B'].url).toContain('gemma-4-E4B-it-web.litertlm');
    });

    it('every entry has the required fields', () => {
      for (const [id, entry] of Object.entries(LITERT_MODELS)) {
        expect(entry.name, `${id} name`).toBeTruthy();
        expect(entry.contextLength, `${id} contextLength`).toBeGreaterThan(0);
        expect(entry.sizeBytes, `${id} sizeBytes`).toBeGreaterThan(0);
        expect(entry.size, `${id} size`).toMatch(/^\d+(\.\d+)?(MB|GB)$/);
        expect(entry.description, `${id} description`).toBeTruthy();
        expect(entry.url, `${id} url`).toMatch(/^https:\/\/huggingface\.co\//);
        expect(entry.url, `${id} url ends with .litertlm`).toMatch(/\.litertlm$/);
        expect(entry.parameterCount, `${id} parameterCount`).toBeGreaterThan(0);
      }
    });
  });

  describe('MODEL_SIZE_THRESHOLDS / getModelCategory', () => {
    it('has the documented thresholds', () => {
      expect(MODEL_SIZE_THRESHOLDS.tiny).toBe(500 * 1024 * 1024);
      expect(MODEL_SIZE_THRESHOLDS.small).toBe(1024 * 1024 * 1024);
      expect(MODEL_SIZE_THRESHOLDS.medium).toBe(2 * 1024 * 1024 * 1024);
    });

    it('categorizes sizes correctly', () => {
      expect(getModelCategory(100 * 1024 * 1024)).toBe('tiny');
      expect(getModelCategory(600 * 1024 * 1024)).toBe('small');
      expect(getModelCategory(1.5 * 1024 * 1024 * 1024)).toBe('medium');
      expect(getModelCategory(3 * 1024 * 1024 * 1024)).toBe('large');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // URL resolution
  // ─────────────────────────────────────────────────────────────

  describe('resolveModelUrl', () => {
    it('returns the modelUrl override when provided', () => {
      expect(resolveModelUrl('gemma-4-E2B', 'https://custom.com/model.litertlm')).toBe(
        'https://custom.com/model.litertlm',
      );
    });

    it('returns a full URL as-is', () => {
      const url = 'https://example.com/model.litertlm';
      expect(resolveModelUrl(url)).toBe(url);
    });

    it('builds an HF URL from repo:file shorthand', () => {
      const url = resolveModelUrl('litert-community/gemma-4-E2B-it-litert-lm:gemma-4-E2B-it-web.litertlm');
      expect(url).toBe(
        'https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.litertlm',
      );
    });

    it('resolves a catalog shorthand to the catalog URL', () => {
      expect(resolveModelUrl('gemma-4-E2B')).toBe(LITERT_MODELS['gemma-4-E2B'].url);
      expect(resolveModelUrl('qwen3-0.6B')).toBe(LITERT_MODELS['qwen3-0.6B'].url);
    });

    it('falls back to an HF repo path for unknown IDs', () => {
      const url = resolveModelUrl('some-org/unknown-model');
      expect(url).toMatch(/^https:\/\/huggingface\.co\/some-org\/unknown-model/);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Model construction
  // ─────────────────────────────────────────────────────────────

  describe('LiteRTLanguageModel constructor', () => {
    it('sets modelId with the litert: prefix and provider', () => {
      const model = new LiteRTLanguageModel('gemma-4-E2B');
      expect(model.modelId).toBe('litert:gemma-4-E2B');
      expect(model.provider).toBe('litert');
    });

    it('uses the catalog contextLength', () => {
      expect(new LiteRTLanguageModel('gemma-4-E2B').contextLength).toBe(8192);
      expect(new LiteRTLanguageModel('qwen3-0.6B').contextLength).toBe(4096);
    });

    it('uses the settings contextLength override', () => {
      expect(new LiteRTLanguageModel('gemma-4-E2B', { contextLength: 2048 }).contextLength).toBe(2048);
    });

    it('falls back to 4096 for unknown models', () => {
      expect(new LiteRTLanguageModel('some-unknown-model').contextLength).toBe(4096);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Provider factory
  // ─────────────────────────────────────────────────────────────

  describe('createLitert provider', () => {
    it('returns a provider with a languageModel() method', () => {
      expect(typeof createLitert().languageModel).toBe('function');
    });

    it('cascades provider-level settings to models (not wiped by model settings)', async () => {
      const onProgress = vi.fn();
      // Provider sets onProgress; the model is created with a model-settings
      // object that omits onProgress. The provider-level value must survive.
      const provider = createLitert({ onProgress });
      const model = provider.languageModel('gemma-4-E2B', { temperature: 0.5 });
      await model.doGenerate({ prompt: 'Hi' });
      expect(onProgress).toHaveBeenCalled();
    });

    it('model-level backend overrides the provider backend', async () => {
      // qwen3-0.6B runs on CPU (gemma-4 is WebGPU-only), so it can prove the
      // model-level CPU setting overrides the provider-level GPU setting.
      const provider = createLitert({ backend: 'GPU' });
      const model = provider.languageModel('qwen3-0.6B', { backend: 'CPU' });
      await model.doGenerate({ prompt: 'Hi' });
      expect(mockState.engineCreate).toHaveBeenCalledWith({ model: expect.anything(), backend: Backend.CPU });
    });

    it('exports a default singleton', () => {
      expect(typeof litert.languageModel).toBe('function');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Backend selection
  // ─────────────────────────────────────────────────────────────

  describe('backend selection', () => {
    it('passes no backend by default (lets LiteRT-LM pick)', async () => {
      const model = new LiteRTLanguageModel('gemma-4-E2B');
      await model.doGenerate({ prompt: 'Hi' });
      expect(mockState.engineCreate).toHaveBeenCalledWith({ model: expect.anything() });
    });

    it('maps the explicit GPU setting to Backend.GPU (not the experimental GPU_ARTISAN)', async () => {
      const model = new LiteRTLanguageModel('gemma-4-E2B', { backend: 'GPU' });
      await model.doGenerate({ prompt: 'Hi' });
      expect(mockState.engineCreate).toHaveBeenCalledWith({ model: expect.anything(), backend: Backend.GPU });
      expect(Backend.GPU).not.toBe(Backend.GPU_ARTISAN);
    });

    it('maps the explicit CPU setting to Backend.CPU', async () => {
      // qwen3-0.6B is not WebGPU-only, so the CPU backend is allowed.
      const model = new LiteRTLanguageModel('qwen3-0.6B', { backend: 'CPU' });
      await model.doGenerate({ prompt: 'Hi' });
      expect(mockState.engineCreate).toHaveBeenCalledWith({ model: expect.anything(), backend: Backend.CPU });
    });

    it('falls back to the CPU backend when GPU streaming load is unsupported', async () => {
      // First Engine.create throws the upstream "not supported yet" error;
      // the second (CPU) call succeeds. Uses qwen3-0.6B — a non-WebGPU-only
      // model, so the CPU fallback is permitted.
      mockState.engineCreate
        .mockReturnValueOnce(new Error('Streaming HF_Tokenizer_Zlib is not supported yet'))
        .mockReturnValue(undefined);
      const model = new LiteRTLanguageModel('qwen3-0.6B');
      const result = await model.doGenerate({ prompt: 'Hi' });
      expect(result.text).toBe('Hello, world!');
      expect(mockState.engineCreate).toHaveBeenCalledTimes(2);
      expect(mockState.engineCreate).toHaveBeenLastCalledWith({ model: expect.anything(), backend: Backend.CPU });
    });
  });

  // ─────────────────────────────────────────────────────────────
  // WebGPU-only models (Gemma 4)
  // ─────────────────────────────────────────────────────────────

  describe('WebGPU-only models', () => {
    it('Gemma 4 entries are flagged requiresWebGPU; Qwen3 0.6B is not', () => {
      expect(LITERT_MODELS['gemma-4-E2B'].requiresWebGPU).toBe(true);
      expect(LITERT_MODELS['gemma-4-E4B'].requiresWebGPU).toBe(true);
      expect(LITERT_MODELS['qwen3-0.6B'].requiresWebGPU).toBeFalsy();
    });

    it('rejects a Gemma 4 model with an explicit CPU backend (clear error, no download)', async () => {
      const model = new LiteRTLanguageModel('gemma-4-E2B', { backend: 'CPU' });
      const err = await model.doGenerate({ prompt: 'Hi' }).then(() => null, (e) => e);
      expect(err).toBeTruthy();
      expect(`${err?.message ?? ''} ${(err?.cause as Error)?.message ?? ''}`).toMatch(/WebGPU/i);
      // Failed fast — no model download, no Engine.create attempt.
      expect(globalThis.fetch).not.toHaveBeenCalled();
      expect(mockState.engineCreate).not.toHaveBeenCalled();
    });

    it('rejects a Gemma 4 model when WebGPU is unavailable in the browser', async () => {
      (globalThis as { navigator?: unknown }).navigator = {}; // no navigator.gpu
      resetWebGPUUsableCache();
      const model = new LiteRTLanguageModel('gemma-4-E2B');
      const err = await model.doGenerate({ prompt: 'Hi' }).then(() => null, (e) => e);
      expect(err).toBeTruthy();
      expect(`${err?.message ?? ''} ${(err?.cause as Error)?.message ?? ''}`).toMatch(/WebGPU/i);
      expect(mockState.engineCreate).not.toHaveBeenCalled();
    });

    it('does NOT retry on CPU when a WebGPU-only model fails GPU streaming load', async () => {
      mockState.engineCreate.mockReturnValue(new Error('Streaming HF_Tokenizer_Zlib is not supported yet'));
      const model = new LiteRTLanguageModel('gemma-4-E2B');
      await expect(model.doGenerate({ prompt: 'Hi' })).rejects.toThrow();
      // One attempt only — no pointless CPU retry for a GPU-only model.
      expect(mockState.engineCreate).toHaveBeenCalledTimes(1);
    });

    it('still loads qwen3-0.6B when WebGPU is unavailable (CPU-capable model)', async () => {
      (globalThis as { navigator?: unknown }).navigator = {}; // no navigator.gpu
      resetWebGPUUsableCache();
      const model = new LiteRTLanguageModel('qwen3-0.6B');
      const result = await model.doGenerate({ prompt: 'Hi' });
      expect(result.text).toBe('Hello, world!');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // doGenerate
  // ─────────────────────────────────────────────────────────────

  describe('doGenerate', () => {
    it('returns text, finishReason, and usage', async () => {
      const model = new LiteRTLanguageModel('gemma-4-E2B');
      const result = await model.doGenerate({ prompt: 'Hello' });
      expect(result.text).toBe('Hello, world!');
      expect(result.finishReason).toBe('stop');
      expect(result.usage.inputTokens).toBeGreaterThan(0);
      expect(result.usage.outputTokens).toBeGreaterThan(0);
      expect(result.usage.totalTokens).toBe(result.usage.inputTokens + result.usage.outputTokens);
      expect(result.usage.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('puts the system prompt and prior turns into the preface', async () => {
      const model = new LiteRTLanguageModel('gemma-4-E2B');
      await model.doGenerate({
        prompt: 'now',
        systemPrompt: 'You are helpful',
        messages: [
          { role: 'user', content: 'earlier question' },
          { role: 'assistant', content: 'earlier answer' },
          { role: 'user', content: 'now' },
        ],
      });
      const config = mockState.createConversation.mock.calls[0][0] as {
        preface?: { messages: Array<{ role: string; content: string }> };
      };
      expect(config.preface).toBeDefined();
      // system + the two prior turns; the final 'now' turn is sent separately.
      expect(config.preface!.messages.map((m) => m.content)).toEqual([
        'You are helpful',
        'earlier question',
        'earlier answer',
      ]);
    });

    it('sends the final turn (not the preface) via sendMessage', async () => {
      const model = new LiteRTLanguageModel('gemma-4-E2B');
      await model.doGenerate({
        prompt: 'fallback',
        messages: [
          { role: 'user', content: 'earlier' },
          { role: 'user', content: 'the actual question' },
        ],
      });
      expect(mockState.sendMessage).toHaveBeenCalledWith('the actual question');
    });

    it('maps temperature and topP to sampler params, maxTokens to maxOutputTokens', async () => {
      const model = new LiteRTLanguageModel('gemma-4-E2B');
      await model.doGenerate({ prompt: 'Hi', temperature: 0.3, topP: 0.8, maxTokens: 200 });
      const config = mockState.createConversation.mock.calls[0][0] as {
        sessionConfig?: { samplerParams?: { temperature: number; p: number }; maxOutputTokens?: number };
      };
      expect(config.sessionConfig?.samplerParams?.temperature).toBe(0.3);
      expect(config.sessionConfig?.samplerParams?.p).toBe(0.8);
      expect(config.sessionConfig?.maxOutputTokens).toBe(200);
    });

    it('extracts text from ContentPart[] message content', async () => {
      const model = new LiteRTLanguageModel('gemma-4-E2B');
      await model.doGenerate({
        prompt: 'fallback',
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'structured question' }] },
        ],
      });
      expect(mockState.sendMessage).toHaveBeenCalledWith('structured question');
    });

    it('rejects when the AbortSignal is already aborted', async () => {
      const model = new LiteRTLanguageModel('gemma-4-E2B');
      const controller = new AbortController();
      controller.abort();
      await expect(
        model.doGenerate({ prompt: 'Hi', abortSignal: controller.signal }),
      ).rejects.toThrow();
    });

    it('deletes the conversation after use', async () => {
      const model = new LiteRTLanguageModel('gemma-4-E2B');
      await model.doGenerate({ prompt: 'Hi' });
      expect(mockState.conversationDelete).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // doStream
  // ─────────────────────────────────────────────────────────────

  describe('doStream', () => {
    it('yields stream chunks and a final chunk with usage', async () => {
      const model = new LiteRTLanguageModel('gemma-4-E2B');
      const chunks: { text: string; done: boolean; usage?: unknown }[] = [];
      for await (const chunk of model.doStream({ prompt: 'Hi' })) {
        chunks.push(chunk);
      }
      expect(chunks.length).toBeGreaterThan(0);
      const final = chunks[chunks.length - 1];
      expect(final.done).toBe(true);
      expect(final.usage).toBeDefined();
    });

    it('yields each delta chunk as-is (LiteRT-LM streams non-cumulative)', async () => {
      const model = new LiteRTLanguageModel('gemma-4-E2B');
      const deltas: string[] = [];
      for await (const chunk of model.doStream({ prompt: 'Hi' })) {
        if (!chunk.done) deltas.push(chunk.text);
      }
      expect(deltas).toEqual(['Hello', ', world!']);
      expect(deltas.join('')).toBe('Hello, world!');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // unload
  // ─────────────────────────────────────────────────────────────

  describe('unload', () => {
    it('does nothing if the engine was never loaded', async () => {
      const model = new LiteRTLanguageModel('gemma-4-E2B');
      await expect(model.unload()).resolves.toBeUndefined();
      expect(mockState.engineDelete).not.toHaveBeenCalled();
    });

    it('calls engine.delete() if the engine was loaded', async () => {
      const model = new LiteRTLanguageModel('gemma-4-E2B');
      await model.doGenerate({ prompt: 'Hi' });
      await model.unload();
      expect(mockState.engineDelete).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // createLanguageModel factory
  // ─────────────────────────────────────────────────────────────

  describe('createLanguageModel', () => {
    it('returns a LiteRTLanguageModel instance', () => {
      expect(createLanguageModel('gemma-4-E2B')).toBeInstanceOf(LiteRTLanguageModel);
    });
  });
});
