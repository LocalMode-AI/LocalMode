/**
 * Regression tests for preloadModel(). Root cause (found by the WebAI Bench
 * real-browser run, 2026-07-16): preloading via a full `loadModelFromUrl()`
 * runs llama.cpp's causal-LLM init warmup, which ABORTS the WASM
 * (`llama_context::output_reserve` via `llama_context::encode`) on
 * encoder-only GGUFs — embedding and reranker models could never be
 * preloaded. The fix routes preload through wllama's ModelManager
 * (download-to-cache only, no inference context). These tests pin that:
 * preload must download through ModelManager and must NEVER construct a
 * Wllama inference instance.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { preloadModel } from '../src/utils.js';
import { WLLAMA_MODELS } from '../src/models.js';

const mockState = {
  getModelOrDownload: vi.fn(),
  wllamaConstructed: 0,
};

vi.mock('../src/wllama-loader.js', () => ({
  WLLAMA_CDN_ESM: 'https://cdn.jsdelivr.net/npm/@wllama/wllama@3.5.1/esm/index.js',
  WLLAMA_CDN_WASM: 'https://cdn.jsdelivr.net/npm/@wllama/wllama@3.5.1/src/wasm/wllama.wasm',
  importWllama: async () => ({
    Wllama: function MockWllama() {
      mockState.wllamaConstructed++;
      return {
        loadModelFromUrl: vi.fn(),
        exit: vi.fn(),
      };
    },
    ModelManager: function MockModelManager() {
      return {
        getModelOrDownload: (...args: unknown[]) => mockState.getModelOrDownload(...args),
      };
    },
  }),
}));

describe('preloadModel()', () => {
  beforeEach(() => {
    mockState.getModelOrDownload = vi.fn().mockResolvedValue({ size: 123 });
    mockState.wllamaConstructed = 0;
  });

  it('downloads an EMBEDDING model via ModelManager without any inference context', async () => {
    // bge-small is encoder-only — the exact class of model the old
    // loadModelFromUrl()-based preload crashed the WASM on.
    await preloadModel('bge-small-en-v1.5-Q8_0');
    expect(mockState.getModelOrDownload).toHaveBeenCalledTimes(1);
    expect(mockState.getModelOrDownload).toHaveBeenCalledWith(
      WLLAMA_MODELS['bge-small-en-v1.5-Q8_0'].url,
      expect.objectContaining({ progressCallback: expect.any(Function) }),
    );
    expect(mockState.wllamaConstructed, 'preload must never construct a Wllama context').toBe(0);
  });

  it('downloads an LLM the same way and forwards normalized progress', async () => {
    const events: Array<{ status: string; progress?: number }> = [];
    mockState.getModelOrDownload = vi
      .fn()
      .mockImplementation(async (_url: string, opts: { progressCallback: (o: { loaded: number; total: number }) => void }) => {
        opts.progressCallback({ loaded: 35, total: 70 });
        opts.progressCallback({ loaded: 70, total: 70 });
        return { size: 70 };
      });
    await preloadModel('SmolLM2-135M-Instruct-Q4_K_M', { onProgress: (p) => events.push(p) });
    expect(events).toEqual([
      expect.objectContaining({ status: 'download', progress: 50, loaded: 35, total: 70 }),
      expect.objectContaining({ status: 'done', progress: 100, loaded: 70, total: 70 }),
    ]);
    expect(mockState.wllamaConstructed).toBe(0);
  });

  it('resolves custom URLs and shorthand ids through resolveModelUrl', async () => {
    await preloadModel('ignored', { modelUrl: 'https://example.com/custom.gguf' });
    expect(mockState.getModelOrDownload).toHaveBeenCalledWith(
      'https://example.com/custom.gguf',
      expect.anything(),
    );
  });
});
