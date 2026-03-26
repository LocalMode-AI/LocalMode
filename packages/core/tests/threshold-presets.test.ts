/**
 * @fileoverview Tests for threshold presets and getDefaultThreshold()
 */

import { describe, it, expect } from 'vitest';
import {
  getDefaultThreshold,
  MODEL_THRESHOLD_PRESETS,
} from '../src/index.js';

describe('MODEL_THRESHOLD_PRESETS', () => {
  it('contains all required models', () => {
    const requiredModels = [
      'Xenova/bge-small-en-v1.5',
      'Xenova/bge-base-en-v1.5',
      'Xenova/all-MiniLM-L6-v2',
      'Xenova/all-MiniLM-L12-v2',
      'nomic-ai/nomic-embed-text-v1.5',
      'Xenova/gte-small',
      'Xenova/gte-base',
      'Xenova/e5-small-v2',
      'Xenova/paraphrase-MiniLM-L6-v2',
    ];

    for (const modelId of requiredModels) {
      expect(MODEL_THRESHOLD_PRESETS).toHaveProperty(modelId);
    }
  });

  it('all preset values are numbers in (0, 1)', () => {
    for (const [modelId, threshold] of Object.entries(MODEL_THRESHOLD_PRESETS)) {
      expect(typeof threshold).toBe('number');
      expect(threshold).toBeGreaterThan(0);
      expect(threshold).toBeLessThan(1);
    }
  });

  it('is a plain object (Record<string, number>)', () => {
    expect(typeof MODEL_THRESHOLD_PRESETS).toBe('object');
    expect(MODEL_THRESHOLD_PRESETS).not.toBeNull();
  });
});

describe('getDefaultThreshold()', () => {
  it('returns a number for a known model ID', () => {
    const result = getDefaultThreshold('Xenova/bge-small-en-v1.5');

    expect(typeof result).toBe('number');
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(1);
  });

  it('returns the correct preset value', () => {
    const result = getDefaultThreshold('Xenova/bge-small-en-v1.5');

    expect(result).toBe(MODEL_THRESHOLD_PRESETS['Xenova/bge-small-en-v1.5']);
  });

  it('returns undefined for an unknown model ID', () => {
    const result = getDefaultThreshold('unknown/model');

    expect(result).toBeUndefined();
  });

  it('returns undefined for an empty string', () => {
    const result = getDefaultThreshold('');

    expect(result).toBeUndefined();
  });

  it('is case-sensitive', () => {
    const result = getDefaultThreshold('xenova/bge-small-en-v1.5');

    expect(result).toBeUndefined();
  });

  it('returns values for all preset models', () => {
    for (const modelId of Object.keys(MODEL_THRESHOLD_PRESETS)) {
      const result = getDefaultThreshold(modelId);
      expect(result).toBe(MODEL_THRESHOLD_PRESETS[modelId]);
    }
  });
});
