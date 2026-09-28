/**
 * The /bench/run pre-run estimate counts every model file once. The two
 * llama.cpp lanes load the same GGUF, and the Transformers.js WASM and WebGPU
 * lanes load the same q4 ONNX files (both devices use `dtype: 'q4'` for a
 * text-only model), so a file shared by two lanes must not be summed twice.
 */

import { describe, expect, it } from 'vitest';
import type { BenchModelRef } from '@localmode/bench';
import { BENCH_MODELS, SUITE_MODELS, estimateDownloadBytes } from '../src/lib/bench/catalog';

const PROVIDER_OF_RUNTIME: Record<string, string> = {
  wllama: 'wllama',
  'wllama-webgpu': 'wllama',
  'transformers-wasm': 'transformers',
  'transformers-webgpu': 'transformers',
  webllm: 'webllm',
  litert: 'litert',
  mediapipe: 'mediapipe',
  'chrome-ai': 'chrome-ai',
};

/** Independent dedupe: one entry per (provider cache, model id, quantization). */
function uniqueArtifactSum(models: readonly BenchModelRef[]): number {
  const seen = new Map<string, number>();
  for (const m of models) {
    const provider = PROVIDER_OF_RUNTIME[m.runtimeId];
    expect(provider, `unknown runtime ${m.runtimeId}`).toBeDefined();
    const key = [provider, m.providerModelId, m.quantization ?? ''].join('|');
    const prior = seen.get(key);
    // Two lanes that share a file must declare the same size for it.
    if (prior !== undefined) expect(m.sizeBytes ?? 0).toBe(prior);
    seen.set(key, m.sizeBytes ?? 0);
  }
  return [...seen.values()].reduce((a, b) => a + b, 0);
}

function laneSum(models: readonly BenchModelRef[]): number {
  return models.reduce((a, m) => a + (m.sizeBytes ?? 0), 0);
}

function suiteLanes(suite: keyof typeof SUITE_MODELS): BenchModelRef[] {
  return BENCH_MODELS.filter((m) => SUITE_MODELS[suite].includes(m.benchModelId));
}

describe('estimateDownloadBytes()', () => {
  for (const suite of ['quick', 'standard', 'thorough'] as const) {
    it(`${suite}: counts each model file once`, () => {
      const lanes = suiteLanes(suite);
      const expected = uniqueArtifactSum(lanes);
      expect(estimateDownloadBytes(lanes)).toBe(expected);
      // Shared files exist in every suite, so a per-lane sum overcounts.
      expect(laneSum(lanes)).toBeGreaterThan(expected);
    });
  }

  it('quick: SmolLM2 GGUF once across both llama.cpp lanes (395 MB, not 495 MB)', () => {
    const lanes = suiteLanes('quick');
    // webllm SmolLM2 + one SmolLM2 GGUF + one bge GGUF.
    const expected = 271_206_869 + 105_454_432 + 36_806_944;
    expect(estimateDownloadBytes(lanes)).toBe(expected);
    expect(Math.round(estimateDownloadBytes(lanes) / (1024 * 1024))).toBe(394);
    expect(estimateDownloadBytes(lanes)).not.toBe(expected + 105_454_432);
  });

  it('standard: the Transformers.js Qwen3 q4 files count once across WASM and WebGPU', () => {
    const lanes = suiteLanes('standard');
    const tjsQwen = lanes.filter((m) => m.runtimeId.startsWith('transformers-') && m.benchModelId === 'qwen3-0.6b');
    expect(tjsQwen).toHaveLength(2);
    expect(estimateDownloadBytes(tjsQwen)).toBe(928_224_461);
  });

  it('a GGUF loaded by both llama.cpp lanes counts once even when the lane has no url', () => {
    const cpu = BENCH_MODELS.find((m) => m.runtimeId === 'wllama' && m.benchModelId === 'smollm2-135m')!;
    const gpu = BENCH_MODELS.find((m) => m.runtimeId === 'wllama-webgpu' && m.benchModelId === 'smollm2-135m')!;
    expect(cpu.url).toBeUndefined();
    expect(estimateDownloadBytes([cpu, gpu])).toBe(cpu.sizeBytes);
  });

  it('different models of one runtime still add up', () => {
    const qwen = BENCH_MODELS.find((m) => m.runtimeId === 'wllama' && m.benchModelId === 'qwen3-0.6b')!;
    const smol = BENCH_MODELS.find((m) => m.runtimeId === 'wllama' && m.benchModelId === 'smollm2-135m')!;
    expect(estimateDownloadBytes([qwen, smol])).toBe(qwen.sizeBytes! + smol.sizeBytes!);
  });
});
