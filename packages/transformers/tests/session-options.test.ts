/**
 * ONNX Runtime session options and session access on the language model:
 * `sessionOptions` reaches Transformers.js as `session_options` on every
 * load path, and `getInferenceSessions()` returns the loaded model's
 * sessions (empty before it has loaded). Transformers.js is mocked at its
 * module boundary; the provider code under test runs unmodified.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: Array<{ fn: string; options: Record<string, unknown> }> = [];
const session = { endProfiling: vi.fn(), run: vi.fn() };

vi.mock('@huggingface/transformers', () => {
  const fakeModel = { sessions: { model: session }, dispose: vi.fn() };
  return {
    env: { backends: { onnx: { wasm: {} } }, useCustomCache: false },
    pipeline: vi.fn(async (_task: string, _id: string, options: Record<string, unknown>) => {
      calls.push({ fn: 'pipeline', options });
      const pipe = async () => [{ generated_text: [{ role: 'assistant', content: 'ok' }] }];
      return Object.assign(pipe, { model: fakeModel, tokenizer: {}, dispose: vi.fn() });
    }),
    AutoModelForCausalLM: {
      from_pretrained: vi.fn(async (_id: string, options: Record<string, unknown>) => {
        calls.push({ fn: 'AutoModelForCausalLM', options });
        return { ...fakeModel, sessions: { embed_tokens: session, decoder_model_merged: session } };
      }),
    },
    Gemma4ForConditionalGeneration: undefined,
    Qwen3_5ForConditionalGeneration: undefined,
    AutoModelForImageTextToText: undefined,
    AutoTokenizer: { from_pretrained: vi.fn(async () => ({})) },
    AutoProcessor: { from_pretrained: vi.fn(async () => ({})) },
  };
});

import { TransformersLanguageModel } from '../src/index.js';

describe('TransformersLanguageModel session options', () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it('passes sessionOptions as session_options to the text-generation pipeline and exposes its sessions', async () => {
    const model = new TransformersLanguageModel('onnx-community/Qwen3-0.6B-ONNX', {
      device: 'wasm',
      sessionOptions: { enableProfiling: true },
    });
    expect(model.getInferenceSessions()).toEqual({});
    await model.doGenerate({ prompt: 'hi', maxTokens: 4 });
    expect(calls).toHaveLength(1);
    expect(calls[0].fn).toBe('pipeline');
    expect(calls[0].options.session_options).toEqual({ enableProfiling: true });
    expect(model.getInferenceSessions()).toEqual({ model: session });
    await model.unload();
    expect(model.getInferenceSessions()).toEqual({});
  });

  it('preload() creates the sessions without running the model', async () => {
    const model = new TransformersLanguageModel('onnx-community/Qwen3-0.6B-ONNX', { device: 'wasm' });
    session.run.mockClear();
    await model.preload();
    expect(calls).toHaveLength(1);
    expect(model.getInferenceSessions()).toEqual({ model: session });
    expect(session.run).not.toHaveBeenCalled();
    // A second preload (or a generation) reuses the loaded model.
    await model.preload();
    expect(calls).toHaveLength(1);
  });

  it('sends no session_options when none are set', async () => {
    const model = new TransformersLanguageModel('onnx-community/Qwen3-0.6B-ONNX', { device: 'wasm' });
    await model.doGenerate({ prompt: 'hi', maxTokens: 4 });
    expect('session_options' in calls[0].options).toBe(false);
  });
});

describe('TransformersLanguageModel session options on the split-model path', () => {
  it('passes sessionOptions to AutoModelForCausalLM for a vision-language model and exposes every component session', async () => {
    calls.length = 0;
    const model = new TransformersLanguageModel('onnx-community/Qwen3.5-0.8B-ONNX', {
      device: 'wasm',
      sessionOptions: { enableProfiling: true },
    });
    await model.doGenerate({ prompt: 'hi', maxTokens: 4 }).catch(() => undefined);
    const load = calls.find((c) => c.fn === 'AutoModelForCausalLM');
    expect(load?.options.session_options).toEqual({ enableProfiling: true });
    expect(Object.keys(model.getInferenceSessions()).sort()).toEqual(['decoder_model_merged', 'embed_tokens']);
  });
});
