/**
 * @fileoverview Tests for the model registry catalog, registerModel(), and getModelRegistry()
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_MODEL_REGISTRY,
  registerModel,
  getModelRegistry,
} from '../src/index.js';
import { _resetCustomEntries } from '../src/capabilities/model-registry.js';
import type { ModelRegistryEntry } from '../src/index.js';

// Reset custom entries between tests to avoid leaking state
beforeEach(() => {
  _resetCustomEntries();
});

// ============================================================================
// DEFAULT_MODEL_REGISTRY
// ============================================================================

describe('DEFAULT_MODEL_REGISTRY', () => {
  it('is a non-empty readonly array', () => {
    expect(Array.isArray(DEFAULT_MODEL_REGISTRY)).toBe(true);
    expect(DEFAULT_MODEL_REGISTRY.length).toBeGreaterThan(0);
  });

  it('contains entries for the transformers provider', () => {
    const transformersEntries = DEFAULT_MODEL_REGISTRY.filter(
      (e) => e.provider === 'transformers',
    );
    expect(transformersEntries.length).toBeGreaterThanOrEqual(3);
  });

  it('contains entries for the webllm provider', () => {
    const webllmEntries = DEFAULT_MODEL_REGISTRY.filter((e) => e.provider === 'webllm');
    expect(webllmEntries.length).toBeGreaterThanOrEqual(3);
  });

  it('contains entries for the wllama provider', () => {
    const wllamaEntries = DEFAULT_MODEL_REGISTRY.filter((e) => e.provider === 'wllama');
    expect(wllamaEntries.length).toBeGreaterThanOrEqual(2);
  });

  it('contains entries for the chrome-ai provider', () => {
    const chromeEntries = DEFAULT_MODEL_REGISTRY.filter((e) => e.provider === 'chrome-ai');
    expect(chromeEntries.length).toBeGreaterThanOrEqual(1);
  });

  it('contains all four providers', () => {
    const providers = new Set(DEFAULT_MODEL_REGISTRY.map((e) => e.provider));
    expect(providers.has('transformers')).toBe(true);
    expect(providers.has('webllm')).toBe(true);
    expect(providers.has('wllama')).toBe(true);
    expect(providers.has('chrome-ai')).toBe(true);
  });

  it('contains entries for embedding task', () => {
    const embeddingEntries = DEFAULT_MODEL_REGISTRY.filter((e) => e.task === 'embedding');
    expect(embeddingEntries.length).toBeGreaterThanOrEqual(3);
  });

  it('contains entries for classification task', () => {
    const classEntries = DEFAULT_MODEL_REGISTRY.filter((e) => e.task === 'classification');
    expect(classEntries.length).toBeGreaterThanOrEqual(2);
  });

  it('contains entries for generation task', () => {
    const genEntries = DEFAULT_MODEL_REGISTRY.filter((e) => e.task === 'generation');
    expect(genEntries.length).toBeGreaterThanOrEqual(5);
  });

  it('contains entries for speech-to-text task', () => {
    const sttEntries = DEFAULT_MODEL_REGISTRY.filter((e) => e.task === 'speech-to-text');
    expect(sttEntries.length).toBeGreaterThanOrEqual(1);
  });

  it('contains entries for summarization task', () => {
    const sumEntries = DEFAULT_MODEL_REGISTRY.filter((e) => e.task === 'summarization');
    expect(sumEntries.length).toBeGreaterThanOrEqual(1);
  });

  it('all entries have valid sizeMB (non-negative number)', () => {
    for (const entry of DEFAULT_MODEL_REGISTRY) {
      expect(entry.sizeMB).toBeGreaterThanOrEqual(0);
      expect(typeof entry.sizeMB).toBe('number');
    }
  });

  it('all entries have valid recommendedDevice', () => {
    const validDevices = new Set(['webgpu', 'wasm', 'cpu']);
    for (const entry of DEFAULT_MODEL_REGISTRY) {
      expect(validDevices.has(entry.recommendedDevice)).toBe(true);
    }
  });

  it('all entries have valid task category', () => {
    for (const entry of DEFAULT_MODEL_REGISTRY) {
      expect(typeof entry.task).toBe('string');
      expect(entry.task.length).toBeGreaterThan(0);
    }
  });

  it('all entries have valid speedTier', () => {
    const validTiers = new Set(['fast', 'medium', 'slow']);
    for (const entry of DEFAULT_MODEL_REGISTRY) {
      expect(validTiers.has(entry.speedTier)).toBe(true);
    }
  });

  it('all entries have valid qualityTier', () => {
    const validTiers = new Set(['low', 'medium', 'high']);
    for (const entry of DEFAULT_MODEL_REGISTRY) {
      expect(validTiers.has(entry.qualityTier)).toBe(true);
    }
  });

  it('embedding entries have dimensions set', () => {
    const embeddingEntries = DEFAULT_MODEL_REGISTRY.filter(
      (e) => e.task === 'embedding' || e.task === 'multimodal-embedding',
    );
    for (const entry of embeddingEntries) {
      expect(entry.dimensions).toBeDefined();
      expect(entry.dimensions).toBeGreaterThan(0);
    }
  });

  it('all entries have non-empty modelId and name', () => {
    for (const entry of DEFAULT_MODEL_REGISTRY) {
      expect(entry.modelId.length).toBeGreaterThan(0);
      expect(entry.name.length).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// registerModel()
// ============================================================================

describe('registerModel()', () => {
  const customEntry: ModelRegistryEntry = {
    modelId: 'custom/my-embedder',
    provider: 'custom',
    task: 'embedding',
    name: 'My Custom Embedder',
    sizeMB: 50,
    dimensions: 384,
    recommendedDevice: 'wasm',
    speedTier: 'fast',
    qualityTier: 'medium',
  };

  it('adds a custom entry to the registry', () => {
    registerModel(customEntry);

    const registry = getModelRegistry();
    const found = registry.find((e) => e.modelId === 'custom/my-embedder');
    expect(found).toBeDefined();
    expect(found!.name).toBe('My Custom Embedder');
    expect(found!.dimensions).toBe(384);
  });

  it('replaces duplicate modelId with latest registration', () => {
    registerModel(customEntry);
    registerModel({
      ...customEntry,
      name: 'Updated Embedder',
      sizeMB: 75,
    });

    const registry = getModelRegistry();
    const matches = registry.filter((e) => e.modelId === 'custom/my-embedder');
    expect(matches.length).toBe(1);
    expect(matches[0].name).toBe('Updated Embedder');
    expect(matches[0].sizeMB).toBe(75);
  });

  it('custom entry overrides a default entry with the same modelId', () => {
    const defaultId = DEFAULT_MODEL_REGISTRY[0].modelId;
    registerModel({
      ...DEFAULT_MODEL_REGISTRY[0],
      name: 'Overridden Model',
    });

    const registry = getModelRegistry();
    const matches = registry.filter((e) => e.modelId === defaultId);
    expect(matches.length).toBe(1);
    expect(matches[0].name).toBe('Overridden Model');
  });
});

// ============================================================================
// getModelRegistry()
// ============================================================================

describe('getModelRegistry()', () => {
  it('returns default entries when no custom entries are registered', () => {
    const registry = getModelRegistry();
    expect(registry.length).toBe(DEFAULT_MODEL_REGISTRY.length);
  });

  it('returns default plus custom entries after registration', () => {
    registerModel({
      modelId: 'test/unique-model',
      provider: 'test',
      task: 'embedding',
      name: 'Test Model',
      sizeMB: 10,
      dimensions: 128,
      recommendedDevice: 'wasm',
      speedTier: 'fast',
      qualityTier: 'low',
    });

    const registry = getModelRegistry();
    expect(registry.length).toBe(DEFAULT_MODEL_REGISTRY.length + 1);
  });

  it('returns a new copy (not a reference to internal array)', () => {
    const a = getModelRegistry();
    const b = getModelRegistry();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});
