/**
 * @file models.test.ts
 * @description Tests for the WEBLLM_MODELS catalog — Qwen3.5 entries,
 * vision flag invariants, and context-length expectations.
 */

import { describe, it, expect } from 'vitest';
import { WEBLLM_MODELS } from '../src/models.js';

describe('WEBLLM_MODELS — Qwen3.5 entries', () => {
  it('Qwen3.5-4B (when present) has contextLength >= 32768', () => {
    const entry = WEBLLM_MODELS['Qwen3.5-4B-q4f16_1-MLC'];
    if (!entry) return;
    expect(entry.contextLength).toBeGreaterThanOrEqual(32768);
    expect(entry.sizeBytes).toBeGreaterThan(0);
  });

  it('Qwen3.5-9B (when present) has contextLength >= 32768', () => {
    const entry = WEBLLM_MODELS['Qwen3.5-9B-q4f16_1-MLC'];
    if (!entry) return;
    expect(entry.contextLength).toBeGreaterThanOrEqual(32768);
    expect(entry.sizeBytes).toBeGreaterThan(0);
  });
});

describe('WEBLLM_MODELS — invariants', () => {
  it('every vision: true entry mentions vision/multimodal in description', () => {
    const visionEntries = Object.entries(WEBLLM_MODELS).filter(
      ([, entry]) => (entry as { vision?: boolean }).vision === true
    );
    expect(visionEntries.length).toBeGreaterThan(0);
    for (const [key, entry] of visionEntries) {
      const desc = (entry as { description: string }).description.toLowerCase();
      expect(
        desc.includes('vision') || desc.includes('multimodal'),
        `Expected ${key} description to mention vision/multimodal: "${entry.description}"`
      ).toBe(true);
    }
  });
});
