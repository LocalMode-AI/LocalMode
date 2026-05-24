/**
 * @file models.test.ts
 * @description Tests for the WLLAMA_MODELS catalog — VLM entries, vision flag,
 * and browser-memory-ceiling regression guards.
 */

import { describe, it, expect } from 'vitest';
import { WLLAMA_MODELS, type WllamaModelEntry } from '../src/models.js';

describe('WLLAMA_MODELS — Holo2 VLM entries', () => {
  it('has Holo2-4B-Q4_K_M with vision flag', () => {
    const entry = WLLAMA_MODELS['Holo2-4B-Q4_K_M'];
    expect(entry).toBeDefined();
    expect(entry.vision).toBe(true);
    expect(entry.quantization).toBe('Q4_K_M');
    expect(entry.url.length).toBeGreaterThan(0);
    expect(entry.url).toMatch(/\.gguf$/);
  });

  it('has Holo2-8B-Q4_K_M with vision flag (when present)', () => {
    const entry = WLLAMA_MODELS['Holo2-8B-Q4_K_M'];
    if (!entry) return; // gated — skipped if deferred
    expect(entry.vision).toBe(true);
    expect(entry.quantization).toBe('Q4_K_M');
    expect(entry.url.length).toBeGreaterThan(0);
    expect(entry.url).toMatch(/\.gguf$/);
  });
});

describe('WLLAMA_MODELS — invariants', () => {
  it('every vision: true entry mentions vision/grounding/VLM in description', () => {
    const visionEntries = Object.entries(WLLAMA_MODELS).filter(
      ([, entry]) => (entry as WllamaModelEntry).vision === true
    );
    expect(visionEntries.length).toBeGreaterThan(0);
    for (const [key, entry] of visionEntries) {
      const desc = (entry as WllamaModelEntry).description.toLowerCase();
      expect(
        desc.includes('vision') ||
          desc.includes('grounding') ||
          desc.includes('vlm') ||
          desc.includes('multimodal'),
        `Expected ${key} description to mention vision/grounding/VLM/multimodal: "${entry.description}"`
      ).toBe(true);
    }
  });

  it('no entry exceeds the 5.5GB browser memory ceiling', () => {
    const ceiling = 5.5 * 1024 * 1024 * 1024;
    for (const [key, entry] of Object.entries(WLLAMA_MODELS)) {
      expect(
        (entry as WllamaModelEntry).sizeBytes,
        `${key} sizeBytes ${entry.sizeBytes} exceeds 5.5GB ceiling`
      ).toBeLessThanOrEqual(ceiling);
    }
  });
});
