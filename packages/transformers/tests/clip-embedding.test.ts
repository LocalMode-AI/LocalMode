/**
 * Transformers CLIP Embedding Model Tests
 *
 * Unit tests for the TransformersCLIPEmbeddingModel implementation.
 * These tests verify the class structure, factory function, and
 * interface compliance without requiring actual model downloads.
 *
 * @packageDocumentation
 */

import { describe, it, expect, vi } from 'vitest';
import {
  TransformersCLIPEmbeddingModel,
  createTransformers,
  MULTIMODAL_EMBEDDING_MODELS,
} from '../src/index.js';
import { createCLIPEmbeddingModel } from '../src/implementations/clip-embedding.js';
import type { MultimodalEmbeddingModel } from '@localmode/core';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('TransformersCLIPEmbeddingModel', () => {
  describe('constructor', () => {
    it('sets modelId with transformers: prefix', () => {
      const model = new TransformersCLIPEmbeddingModel('Xenova/clip-vit-base-patch32');

      expect(model.modelId).toBe('transformers:Xenova/clip-vit-base-patch32');
    });

    it('sets provider to transformers', () => {
      const model = new TransformersCLIPEmbeddingModel('Xenova/clip-vit-base-patch32');

      expect(model.provider).toBe('transformers');
    });

    it('defaults dimensions to 512 for base CLIP models', () => {
      const model = new TransformersCLIPEmbeddingModel('Xenova/clip-vit-base-patch32');

      expect(model.dimensions).toBe(512);
    });

    it('infers 768 dimensions for large CLIP models', () => {
      const model = new TransformersCLIPEmbeddingModel('Xenova/clip-vit-large-patch14');

      expect(model.dimensions).toBe(768);
    });

    it('infers 768 dimensions for models with patch14 in name', () => {
      const model = new TransformersCLIPEmbeddingModel('some-org/clip-patch14-model');

      expect(model.dimensions).toBe(768);
    });

    it('uses custom dimensions from settings', () => {
      const model = new TransformersCLIPEmbeddingModel('Xenova/clip-vit-base-patch32', {
        dimensions: 256,
      });

      expect(model.dimensions).toBe(256);
    });

    it('sets supportedModalities to text and image', () => {
      const model = new TransformersCLIPEmbeddingModel('Xenova/clip-vit-base-patch32');

      expect(model.supportedModalities).toEqual(['text', 'image']);
    });

    it('sets maxEmbeddingsPerCall to 32', () => {
      const model = new TransformersCLIPEmbeddingModel('Xenova/clip-vit-base-patch32');

      expect(model.maxEmbeddingsPerCall).toBe(32);
    });

    it('sets supportsParallelCalls to false', () => {
      const model = new TransformersCLIPEmbeddingModel('Xenova/clip-vit-base-patch32');

      expect(model.supportsParallelCalls).toBe(false);
    });
  });

  describe('doEmbed()', () => {
    it('checks AbortSignal before loading model (already-aborted signal throws)', async () => {
      const model = new TransformersCLIPEmbeddingModel('Xenova/clip-vit-base-patch32');
      const controller = new AbortController();
      controller.abort();

      await expect(
        model.doEmbed({ values: ['test'], abortSignal: controller.signal })
      ).rejects.toThrow();
    });
  });

  describe('doEmbedImage()', () => {
    it('checks AbortSignal before loading model (already-aborted signal throws)', async () => {
      const model = new TransformersCLIPEmbeddingModel('Xenova/clip-vit-base-patch32');
      const controller = new AbortController();
      controller.abort();

      await expect(
        model.doEmbedImage({
          images: [new ArrayBuffer(8)],
          abortSignal: controller.signal,
        })
      ).rejects.toThrow();
    });
  });
});

describe('createCLIPEmbeddingModel()', () => {
  it('returns a TransformersCLIPEmbeddingModel instance', () => {
    const model = createCLIPEmbeddingModel('Xenova/clip-vit-base-patch32');

    expect(model).toBeInstanceOf(TransformersCLIPEmbeddingModel);
  });

  it('sets correct modelId prefix', () => {
    const model = createCLIPEmbeddingModel('Xenova/clip-vit-base-patch32');

    expect(model.modelId).toBe('transformers:Xenova/clip-vit-base-patch32');
  });

  it('passes settings through', () => {
    const model = createCLIPEmbeddingModel('Xenova/clip-vit-base-patch32', {
      dimensions: 1024,
      device: 'wasm',
      quantized: false,
    });

    expect(model.dimensions).toBe(1024);
    expect(model.provider).toBe('transformers');
  });

  it('satisfies the MultimodalEmbeddingModel interface', () => {
    const model: MultimodalEmbeddingModel = createCLIPEmbeddingModel(
      'Xenova/clip-vit-base-patch32'
    );

    expect(model.modelId).toBeDefined();
    expect(model.provider).toBeDefined();
    expect(model.dimensions).toBeGreaterThan(0);
    expect(model.supportedModalities).toContain('text');
    expect(model.supportedModalities).toContain('image');
    expect(typeof model.doEmbed).toBe('function');
    expect(typeof model.doEmbedImage).toBe('function');
  });
});

describe('TransformersProvider.multimodalEmbedding()', () => {
  it('returns a MultimodalEmbeddingModel with provider === "transformers"', () => {
    const provider = createTransformers();
    const model = provider.multimodalEmbedding('Xenova/clip-vit-base-patch32');

    expect(model.provider).toBe('transformers');
  });

  it('returns a model with correct modelId', () => {
    const provider = createTransformers();
    const model = provider.multimodalEmbedding('Xenova/clip-vit-base-patch32');

    expect(model.modelId).toBe('transformers:Xenova/clip-vit-base-patch32');
  });

  it('passes settings from provider and model-level', () => {
    const provider = createTransformers({ device: 'wasm' });
    const model = provider.multimodalEmbedding('Xenova/clip-vit-base-patch32', {
      quantized: false,
    });

    expect(model.dimensions).toBe(512);
    expect(model.provider).toBe('transformers');
  });

  it('model-level settings override provider settings', () => {
    const provider = createTransformers({ device: 'wasm' });
    const model = provider.multimodalEmbedding('Xenova/clip-vit-base-patch32', {
      device: 'webgpu',
    });

    // Model was created — verifies no type error when overriding
    expect(model.provider).toBe('transformers');
  });
});

describe('MULTIMODAL_EMBEDDING_MODELS catalog', () => {
  it('contains CLIP ViT-Base/32 model', () => {
    expect(MULTIMODAL_EMBEDDING_MODELS.CLIP_VIT_BASE_PATCH32).toBe(
      'Xenova/clip-vit-base-patch32'
    );
  });

  it('contains CLIP ViT-Base/16 model', () => {
    expect(MULTIMODAL_EMBEDDING_MODELS.CLIP_VIT_BASE_PATCH16).toBe(
      'Xenova/clip-vit-base-patch16'
    );
  });

  it('contains at least 2 models', () => {
    expect(Object.keys(MULTIMODAL_EMBEDDING_MODELS).length).toBeGreaterThanOrEqual(2);
  });
});

describe('v3 isolation', () => {
  it('clip-embedding.ts uses dynamic import from @huggingface/transformers (v3)', () => {
    const filePath = path.resolve(
      __dirname,
      '../src/implementations/clip-embedding.ts'
    );
    const content = fs.readFileSync(filePath, 'utf-8');

    // Uses dynamic import() for v3 transformers
    expect(content).toContain("@huggingface/transformers");
  });

  it('clip-embedding.ts does NOT import from @huggingface/transformers-v4', () => {
    const filePath = path.resolve(
      __dirname,
      '../src/implementations/clip-embedding.ts'
    );
    const content = fs.readFileSync(filePath, 'utf-8');

    expect(content).not.toContain('@huggingface/transformers-v4');
  });
});
