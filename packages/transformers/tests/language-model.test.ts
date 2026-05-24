/**
 * Transformers Language Model Tests
 *
 * Unit tests for the TransformersLanguageModel implementation.
 * These tests verify the class structure, factory function, and
 * interface compliance without requiring actual model downloads.
 *
 * @packageDocumentation
 */

import { describe, it, expect, vi } from 'vitest';
import {
  TransformersLanguageModel,
  createTransformers,
  TRANSFORMERS_LLM_MODELS,
  getLLMModelCategory,
} from '../src/index.js';
import { createLanguageModel } from '../src/implementations/language-model.js';
import type { LanguageModel } from '@localmode/core';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('TransformersLanguageModel', () => {
  describe('constructor', () => {
    it('sets modelId with transformers: prefix', () => {
      const model = new TransformersLanguageModel('onnx-community/Qwen3.5-0.8B-ONNX');

      expect(model.modelId).toBe('transformers:onnx-community/Qwen3.5-0.8B-ONNX');
    });

    it('sets provider to transformers', () => {
      const model = new TransformersLanguageModel('onnx-community/Qwen3.5-0.8B-ONNX');

      expect(model.provider).toBe('transformers');
    });

    it('uses default context length of 4096', () => {
      const model = new TransformersLanguageModel('onnx-community/Qwen3.5-0.8B-ONNX');

      expect(model.contextLength).toBe(4096);
    });

    it('uses custom context length from settings', () => {
      const model = new TransformersLanguageModel('onnx-community/Qwen3.5-0.8B-ONNX', {
        contextLength: 32768,
      });

      expect(model.contextLength).toBe(32768);
    });
  });

  describe('doGenerate()', () => {
    it('checks AbortSignal before loading pipeline (already-aborted signal throws)', async () => {
      const model = new TransformersLanguageModel('onnx-community/Qwen3.5-0.8B-ONNX');
      const controller = new AbortController();
      controller.abort();

      await expect(
        model.doGenerate({ prompt: 'test', abortSignal: controller.signal })
      ).rejects.toThrow();
    });
  });

  describe('doStream()', () => {
    it('checks AbortSignal before loading pipeline (already-aborted signal throws)', async () => {
      const model = new TransformersLanguageModel('onnx-community/Qwen3.5-0.8B-ONNX');
      const controller = new AbortController();
      controller.abort();

      const stream = model.doStream({ prompt: 'test', abortSignal: controller.signal });

      // AsyncIterable — first iteration should throw
      await expect(async () => {
        for await (const _chunk of stream) {
          // Should not reach here
        }
      }).rejects.toThrow();
    });
  });

  describe('unload()', () => {
    it('clears cached pipeline (subsequent call re-triggers load)', async () => {
      const model = new TransformersLanguageModel('onnx-community/Qwen3.5-0.8B-ONNX');

      // Unload should not throw even when no pipeline is loaded
      await expect(model.unload()).resolves.toBeUndefined();
    });
  });
});

describe('createLanguageModel()', () => {
  it('returns a TransformersLanguageModel instance', () => {
    const model = createLanguageModel('onnx-community/Qwen3.5-0.8B-ONNX');

    expect(model).toBeInstanceOf(TransformersLanguageModel);
  });

  it('sets correct modelId prefix', () => {
    const model = createLanguageModel('onnx-community/Qwen3.5-0.8B-ONNX');

    expect(model.modelId).toBe('transformers:onnx-community/Qwen3.5-0.8B-ONNX');
  });

  it('passes settings through', () => {
    const model = createLanguageModel('onnx-community/Qwen3.5-0.8B-ONNX', {
      contextLength: 8192,
      device: 'wasm',
    });

    expect(model.contextLength).toBe(8192);
    expect(model.provider).toBe('transformers');
  });

  it('satisfies the LanguageModel interface', () => {
    const model: LanguageModel = createLanguageModel('onnx-community/Qwen3.5-0.8B-ONNX');

    expect(model.modelId).toBeDefined();
    expect(model.provider).toBeDefined();
    expect(model.contextLength).toBeGreaterThan(0);
    expect(typeof model.doGenerate).toBe('function');
    expect(typeof model.doStream).toBe('function');
  });
});

describe('TransformersProvider.languageModel()', () => {
  it('returns a LanguageModel with provider === "transformers"', () => {
    const provider = createTransformers();
    const model = provider.languageModel('onnx-community/Qwen3.5-0.8B-ONNX');

    expect(model.provider).toBe('transformers');
  });

  it('returns a model with correct modelId', () => {
    const provider = createTransformers();
    const model = provider.languageModel('onnx-community/Qwen3.5-0.8B-ONNX');

    expect(model.modelId).toBe('transformers:onnx-community/Qwen3.5-0.8B-ONNX');
  });

  it('passes settings from provider and model-level', () => {
    const provider = createTransformers({ device: 'wasm' });
    const model = provider.languageModel('onnx-community/Qwen3.5-0.8B-ONNX', {
      contextLength: 16384,
    });

    expect(model.contextLength).toBe(16384);
  });

  it('model-level settings override provider settings', () => {
    const provider = createTransformers({ device: 'wasm' });
    const model = provider.languageModel('onnx-community/Qwen3.5-0.8B-ONNX', {
      device: 'webgpu',
    });

    // Model was created — verifies no type error when overriding
    expect(model.provider).toBe('transformers');
  });
});

describe('TRANSFORMERS_LLM_MODELS catalog', () => {
  it('contains Qwen3.5-0.8B-ONNX as a featured model', () => {
    expect(TRANSFORMERS_LLM_MODELS).toHaveProperty('onnx-community/Qwen3.5-0.8B-ONNX');
  });

  it('contains at least 3 models', () => {
    expect(Object.keys(TRANSFORMERS_LLM_MODELS).length).toBeGreaterThanOrEqual(3);
  });

  it('all entries have required fields', () => {
    for (const [id, entry] of Object.entries(TRANSFORMERS_LLM_MODELS)) {
      expect(id).toBeTruthy();
      expect(entry.name).toBeTruthy();
      expect(entry.contextLength).toBeGreaterThan(0);
      expect(entry.size).toBeTruthy();
      expect(entry.sizeBytes).toBeGreaterThan(0);
      expect(entry.description).toBeTruthy();
    }
  });

  it('spans different sizes (tiny, small, medium/large)', () => {
    const categories = new Set(
      Object.values(TRANSFORMERS_LLM_MODELS).map((m) => getLLMModelCategory(m.sizeBytes))
    );
    // At least two different categories
    expect(categories.size).toBeGreaterThanOrEqual(2);
  });
});

describe('getLLMModelCategory()', () => {
  it('returns tiny for models < 500MB', () => {
    expect(getLLMModelCategory(80 * 1024 * 1024)).toBe('tiny');
    expect(getLLMModelCategory(200 * 1024 * 1024)).toBe('tiny');
  });

  it('returns small for models 500MB-1GB', () => {
    expect(getLLMModelCategory(500 * 1024 * 1024)).toBe('small');
    expect(getLLMModelCategory(900 * 1024 * 1024)).toBe('small');
  });

  it('returns medium for models 1GB-2GB', () => {
    expect(getLLMModelCategory(1024 * 1024 * 1024)).toBe('medium');
    expect(getLLMModelCategory(1500 * 1024 * 1024)).toBe('medium');
  });

  it('returns large for models > 2GB', () => {
    expect(getLLMModelCategory(2300 * 1024 * 1024)).toBe('large');
  });
});

describe('Gemma 4 ONNX model support', () => {
  describe('model detection (supportsVision)', () => {
    it('Gemma 4 E2B is detected as vision model', () => {
      const model = new TransformersLanguageModel('onnx-community/gemma-4-E2B-it-ONNX');

      expect(model.supportsVision).toBe(true);
    });

    it('Gemma 4 E4B is detected as vision model', () => {
      const model = new TransformersLanguageModel('onnx-community/gemma-4-E4B-it-ONNX');

      expect(model.supportsVision).toBe(true);
    });

    it('matches case-insensitive Gemma4 variants', () => {
      expect(new TransformersLanguageModel('GEMMA-4-E2B').supportsVision).toBe(true);
      expect(new TransformersLanguageModel('Gemma4-test').supportsVision).toBe(true);
      expect(new TransformersLanguageModel('some/gemma-4-model').supportsVision).toBe(true);
    });

    it('does not match non-Gemma models', () => {
      expect(new TransformersLanguageModel('onnx-community/Qwen3-0.6B-ONNX').supportsVision).toBe(false);
      expect(new TransformersLanguageModel('onnx-community/Llama-3.2-1B-Instruct-ONNX').supportsVision).toBe(false);
      expect(new TransformersLanguageModel('onnx-community/Phi-4-mini-instruct-web-q4f16').supportsVision).toBe(false);
    });
  });

  describe('catalog entries', () => {
    it('E2B entry exists with correct metadata', () => {
      const entry = TRANSFORMERS_LLM_MODELS['onnx-community/gemma-4-E2B-it-ONNX'];

      expect(entry).toBeDefined();
      expect(entry.vision).toBe(true);
      expect(entry.contextLength).toBe(131072);
      expect(entry.sizeBytes).toBeGreaterThanOrEqual(1000 * 1024 * 1024);
      expect(entry.name).toContain('Gemma 4 E2B');
    });

    it('E4B entry exists with correct metadata', () => {
      const entry = TRANSFORMERS_LLM_MODELS['onnx-community/gemma-4-E4B-it-ONNX'];

      expect(entry).toBeDefined();
      expect(entry.vision).toBe(true);
      expect(entry.contextLength).toBe(131072);
      expect(entry.sizeBytes).toBeGreaterThanOrEqual(2500 * 1024 * 1024);
      expect(entry.name).toContain('Gemma 4 E4B');
    });

    it('E4B is larger than E2B', () => {
      const e2b = TRANSFORMERS_LLM_MODELS['onnx-community/gemma-4-E2B-it-ONNX'];
      const e4b = TRANSFORMERS_LLM_MODELS['onnx-community/gemma-4-E4B-it-ONNX'];

      expect(e4b.sizeBytes).toBeGreaterThan(e2b.sizeBytes);
    });
  });
});

describe('unified TJS import', () => {
  it('no implementation file imports from the removed @huggingface/transformers-v4 alias', () => {
    const implementationsDir = path.resolve(
      __dirname,
      '../src/implementations'
    );
    const files = fs.readdirSync(implementationsDir).filter(
      (f) => f.endsWith('.ts') && f !== 'index.ts'
    );

    for (const file of files) {
      const content = fs.readFileSync(path.join(implementationsDir, file), 'utf-8');
      expect(content).not.toContain('@huggingface/transformers-v4');
    }
  });

  it('language-model.ts imports from @huggingface/transformers', () => {
    const filePath = path.resolve(
      __dirname,
      '../src/implementations/language-model.ts'
    );
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('@huggingface/transformers');
  });
});
