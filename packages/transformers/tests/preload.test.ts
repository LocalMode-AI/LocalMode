/**
 * preloadModel() contract: it warms the model-file cache and must NOT leave a
 * resident ONNX session behind. Surfaced by the LocalMode Bench thorough suite,
 * where each transformers lane's preload built a full pipeline that was never
 * disposed, so every model leaked a session for the page lifetime and later
 * lanes died in ORT session creation with std::bad_alloc. It must also honor
 * the caller's device: the WASM lane previously preloaded through WebGPU.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls: Array<{ task?: string; modelId: string; options: Record<string, unknown> }> = [];
const disposeSpies: Array<ReturnType<typeof vi.fn>> = [];

function disposable() {
  const dispose = vi.fn(async () => {});
  disposeSpies.push(dispose);
  return { dispose };
}

vi.mock('@huggingface/transformers', () => ({
  pipeline: vi.fn(async (task: string, modelId: string, options: Record<string, unknown>) => {
    calls.push({ task, modelId, options });
    return disposable();
  }),
  AutoTokenizer: {
    from_pretrained: vi.fn(async (modelId: string, options: Record<string, unknown>) => {
      calls.push({ task: 'tokenizer', modelId, options });
      return {};
    }),
  },
  AutoModelForCausalLM: {
    from_pretrained: vi.fn(async (modelId: string, options: Record<string, unknown>) => {
      calls.push({ task: 'causal-lm', modelId, options });
      return disposable();
    }),
  },
  env: { backends: { onnx: { logLevel: 'error' } } },
}));

import { preloadModel } from '../src/utils.js';

describe('preloadModel()', () => {
  beforeEach(() => {
    calls.length = 0;
    disposeSpies.length = 0;
  });

  it('disposes the pipeline it built for an LLM so no session stays resident', async () => {
    await preloadModel('onnx-community/Qwen3-0.6B-ONNX', { device: 'webgpu' });
    const pipe = calls.find((c) => c.task === 'text-generation');
    expect(pipe).toBeDefined();
    expect(disposeSpies).toHaveLength(1);
    expect(disposeSpies[0]).toHaveBeenCalledTimes(1);
  });

  it('honors the requested device instead of hard-coding webgpu', async () => {
    await preloadModel('onnx-community/Qwen3-0.6B-ONNX', { device: 'wasm' });
    const pipe = calls.find((c) => c.task === 'text-generation');
    expect(pipe?.options.device).toBe('wasm');
    expect(pipe?.options.dtype).toBe('q4');
  });

  it('falls back to wasm when no WebGPU adapter is exposed and no device is given', async () => {
    await preloadModel('onnx-community/Qwen3-0.6B-ONNX');
    const pipe = calls.find((c) => c.task === 'text-generation');
    // Node test environment: navigator.gpu is absent.
    expect(pipe?.options.device).toBe('wasm');
  });

  it('disposes the causal-LM model on the Qwen3.5 branch and passes the device through', async () => {
    await preloadModel('onnx-community/Qwen3.5-0.8B-ONNX', { device: 'wasm' });
    const lm = calls.find((c) => c.task === 'causal-lm');
    expect(lm?.options.device).toBe('wasm');
    expect(disposeSpies).toHaveLength(1);
    expect(disposeSpies[0]).toHaveBeenCalledTimes(1);
  });

  it('disposes the pipeline for a non-LLM (embedding) model too', async () => {
    await preloadModel('Xenova/bge-small-en-v1.5');
    const pipe = calls.find((c) => c.task === 'feature-extraction');
    expect(pipe).toBeDefined();
    expect(disposeSpies).toHaveLength(1);
    expect(disposeSpies[0]).toHaveBeenCalledTimes(1);
  });

  it('forwards an explicit device on the non-LLM path, and leaves the default alone when omitted', async () => {
    await preloadModel('Xenova/bge-small-en-v1.5', { device: 'wasm' });
    expect(calls.find((c) => c.task === 'feature-extraction')?.options.device).toBe('wasm');
    calls.length = 0;
    // Non-LLM preloads keep Transformers.js's own device default unless asked:
    // callers that never passed a device must not start building WebGPU sessions.
    await preloadModel('Xenova/bge-small-en-v1.5');
    expect('device' in (calls.find((c) => c.task === 'feature-extraction')?.options ?? {})).toBe(false);
  });
});
