/**
 * @localmode/wllama Tests — Catalog, Types, and Utilities
 *
 * Tests for model catalog entries, type exports, and utility functions
 * that don't require CDN imports or WASM execution.
 *
 * @packageDocumentation
 */

import { describe, it, expect } from 'vitest';
import {
  WLLAMA_MODELS,
  getModelCategory,
  MODEL_SIZE_THRESHOLDS,
} from '../src/models.js';
import type {
  WllamaModelSettings,
  WllamaEmbeddingSettings,
  WllamaRerankerSettings,
  WllamaResponseFormat,
  WllamaProvider,
} from '../src/types.js';
import { resolveModelUrl, isCrossOriginIsolated } from '../src/utils.js';

// ═══════════════════════════════════════════════════════════════
// MODEL CATALOG
// ═══════════════════════════════════════════════════════════════

describe('Model Catalog', () => {
  it('should have at least 30 curated models', () => {
    const count = Object.keys(WLLAMA_MODELS).length;
    expect(count).toBeGreaterThanOrEqual(30);
  });

  it('should include Qwen3 models', () => {
    expect(WLLAMA_MODELS).toHaveProperty('Qwen3-0.6B-Q4_K_M');
    expect(WLLAMA_MODELS).toHaveProperty('Qwen3-1.7B-Q4_K_M');
    expect(WLLAMA_MODELS).toHaveProperty('Qwen3-4B-Q4_K_M');
  });

  it('should include DeepSeek R1 distill models', () => {
    expect(WLLAMA_MODELS).toHaveProperty('DeepSeek-R1-Distill-Qwen-1.5B-Q4_K_M');
    expect(WLLAMA_MODELS).toHaveProperty('DeepSeek-R1-Distill-Qwen-7B-Q4_K_M');
  });

  it('should include reranker models with isRerankerModel flag', () => {
    const jina = WLLAMA_MODELS['jina-reranker-v2-base-multilingual-Q4_K_M'];
    expect(jina).toBeDefined();
    expect(jina.isRerankerModel).toBe(true);

    const bge = WLLAMA_MODELS['bge-reranker-v2-m3-Q4_K_M'];
    expect(bge).toBeDefined();
    expect(bge.isRerankerModel).toBe(true);
  });

  it('should include Gemma 4 models with vision and mmprojUrl', () => {
    const e2b = WLLAMA_MODELS['Gemma-4-E2B-IT-Q4_K_M'];
    expect(e2b).toBeDefined();
    expect(e2b.vision).toBe(true);
    expect(e2b.mmprojUrl).toBeTruthy();
    expect(e2b.supportsToolCalling).toBe(true);

    const e4b = WLLAMA_MODELS['Gemma-4-E4B-IT-Q4_K_M'];
    expect(e4b).toBeDefined();
    expect(e4b.vision).toBe(true);
    expect(e4b.mmprojUrl).toBeTruthy();
  });

  it('should include embedding models with dimensions', () => {
    const nomic = WLLAMA_MODELS['nomic-embed-text-v1.5-Q4_K_M'];
    expect(nomic.isEmbeddingModel).toBe(true);
    expect(nomic.dimensions).toBe(768);
  });

  it('should have valid URLs for all models', () => {
    for (const [id, entry] of Object.entries(WLLAMA_MODELS)) {
      expect(entry.url, `${id} should have a valid URL`).toMatch(/^https:\/\//);
      expect(entry.url, `${id} URL should end with .gguf`).toMatch(/\.gguf$/);
    }
  });

  it('should have required fields for all models', () => {
    for (const [id, entry] of Object.entries(WLLAMA_MODELS)) {
      expect(entry.name, `${id} missing name`).toBeTruthy();
      expect(entry.contextLength, `${id} missing contextLength`).toBeGreaterThan(0);
      expect(entry.sizeBytes, `${id} missing sizeBytes`).toBeGreaterThan(0);
      expect(entry.architecture, `${id} missing architecture`).toBeTruthy();
      expect(entry.quantization, `${id} missing quantization`).toBeTruthy();
      expect(entry.parameterCount, `${id} missing parameterCount`).toBeGreaterThan(0);
    }
  });

  it('should categorize models correctly by size', () => {
    expect(getModelCategory(100 * 1024 * 1024)).toBe('tiny');
    expect(getModelCategory(700 * 1024 * 1024)).toBe('small');
    expect(getModelCategory(1.5 * 1024 * 1024 * 1024)).toBe('medium');
    expect(getModelCategory(3 * 1024 * 1024 * 1024)).toBe('large');
  });
});

// ═══════════════════════════════════════════════════════════════
// TYPE EXPORTS
// ═══════════════════════════════════════════════════════════════

describe('Type Exports', () => {
  it('WllamaModelSettings should accept reasoning options', () => {
    const settings: WllamaModelSettings = {
      reasoning: true,
      reasoningFormat: 'deepseek',
      reasoningBudgetTokens: 1024,
    };
    expect(settings.reasoning).toBe(true);
  });

  it('WllamaModelSettings should accept performance config', () => {
    const settings: WllamaModelSettings = {
      cacheTypeK: 'q4_0',
      cacheTypeV: 'q8_0',
      flashAttention: true,
      specDraftModel: 'https://example.com/draft.gguf',
    };
    expect(settings.cacheTypeK).toBe('q4_0');
  });

  it('WllamaModelSettings should accept LoRA config', () => {
    const settings: WllamaModelSettings = {
      loraAdapters: [{ path: 'https://example.com/lora.gguf', scale: 0.5 }],
      loraInitWithoutApply: true,
    };
    expect(settings.loraAdapters).toHaveLength(1);
  });

  it('WllamaRerankerSettings should be a valid type', () => {
    const settings: WllamaRerankerSettings = {
      contextLength: 1024,
      numThreads: 4,
    };
    expect(settings.contextLength).toBe(1024);
  });

  it('WllamaResponseFormat should support all three modes', () => {
    const text: WllamaResponseFormat = { type: 'text' };
    const json: WllamaResponseFormat = { type: 'json_object' };
    const schema: WllamaResponseFormat = {
      type: 'json_schema',
      json_schema: { name: 'test', schema: { type: 'object' } },
    };
    expect(text.type).toBe('text');
    expect(json.type).toBe('json_object');
    expect(schema.type).toBe('json_schema');
  });

  it('WllamaProvider should include reranker method', () => {
    const hasReranker = (p: WllamaProvider) => typeof p.reranker === 'function';
    expect(hasReranker).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════

describe('Utility Functions', () => {
  it('resolveModelUrl should resolve catalog keys', () => {
    const url = resolveModelUrl('SmolLM2-135M-Instruct-Q4_K_M');
    expect(url).toMatch(/huggingface\.co/);
    expect(url).toMatch(/\.gguf$/);
  });

  it('resolveModelUrl should pass through full URLs', () => {
    const url = resolveModelUrl('https://example.com/model.gguf');
    expect(url).toBe('https://example.com/model.gguf');
  });

  it('resolveModelUrl should resolve shorthand format', () => {
    const url = resolveModelUrl('repo/name:file.gguf');
    expect(url).toBe('https://huggingface.co/repo/name/resolve/main/file.gguf');
  });

  it('resolveModelUrl should use modelUrl override', () => {
    const url = resolveModelUrl('anything', 'https://custom.url/model.gguf');
    expect(url).toBe('https://custom.url/model.gguf');
  });

  it('isCrossOriginIsolated should return a boolean', () => {
    const result = isCrossOriginIsolated();
    expect(typeof result).toBe('boolean');
  });
});
