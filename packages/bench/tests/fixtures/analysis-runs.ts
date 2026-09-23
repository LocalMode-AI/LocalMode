/**
 * Analysis-export fixtures: two complete protocol-v5 runs whose CSV values
 * are hand-computable. The first run carries one cell of every shape the
 * archive holds: a llama.cpp LLM cell with its runtime configuration and a
 * coherent trace, a Transformers.js embedding cell, a quality cell that
 * errored with a memory sample at the error, a skipped cell, and a LiteRT
 * cell whose real terminal-burst trace fails the stream-coherence gate.
 */

import type { BenchCellResult, BenchRunResult, LLMIteration } from '../../src/types.js';
import { BENCH_PROTOCOL_VERSION, BENCH_SCHEMA_VERSION } from '../../src/types.js';
import { makeEnvironment } from '../helpers.js';
import { LITERT_BURST_ITERATION } from './litert-burst-iteration.js';

/**
 * A coherent llama.cpp iteration: first visible chunk (4 chars) at
 * startT + 100, nine 5-char chunks every 50 ms, then an empty terminal chunk
 * 10 ms after the last visible one. 11 chunks; decode window 460 ms;
 * 10 chunks after the first over 460 ms = 21.7391... chunks/s.
 */
function llamaIteration(startT: number, finishReason: string, outputTokens: number): LLMIteration {
  const chunks = [{ t: startT + 100, c: 4 }];
  for (let i = 1; i <= 9; i++) chunks.push({ t: startT + 100 + i * 50, c: 5 });
  chunks.push({ t: startT + 560, c: 0 });
  return {
    startT,
    chunks,
    endT: startT + 570,
    text: 'y'.repeat(49),
    providerUsage: {
      inputTokens: 128,
      outputTokens,
      totalTokens: 0,
      durationMs: 570,
      fidelity: 'estimated',
    },
    finishReason,
    gates: [],
  };
}

export const LLAMA_CELL: BenchCellResult = {
  cellId: 'wllama/qwen3-0.6b/chat-pp128-tg128',
  runtimeId: 'wllama',
  runtimeVersion: '3.5.1',
  model: {
    benchModelId: 'qwen3-0.6b',
    runtimeId: 'wllama',
    providerModelId: 'unsloth/Qwen3-0.6B-GGUF:Qwen3-0.6B-Q4_K_M.gguf',
    displayName: 'Qwen3 0.6B (GGUF, CPU)',
    task: 'llm',
    quantization: 'Q4_K_M',
    sizeBytes: 462_000_000,
  },
  workloadId: 'chat-pp128-tg128',
  workloadKind: 'llm-generate',
  resolvedBackend: 'wasm',
  runtimeConfig: {
    n_threads: 5,
    multithread: true,
    n_threads_used: 5,
    n_ctx: 2048,
    n_gpu_layers: 0,
    webgpu_adapter: true,
    offloadedLayers: '0/29',
    cache_prompt: false,
    mmproj: false,
  },
  load: {
    cached: false,
    startT: 100,
    endT: 2600.5,
    progress: [
      { t: 150, pct: 0 },
      { t: 1200, pct: 50 },
      { t: 2550.25, pct: 100 },
    ],
    declaredBytes: 462_000_000,
  },
  warmupMs: 333.333,
  iterations: [llamaIteration(10_000, 'length', 10), llamaIteration(11_000, 'stop', 9)],
  memory: { api: 'uaSpecific', baseline: 10_000_000, postLoad: 600_000_000, postRun: 610_000_000 },
  status: 'ok',
};

export const EMBED_CELL: BenchCellResult = {
  cellId: 'transformers-wasm/bge-small-en/embed-batch32',
  runtimeId: 'transformers-wasm',
  runtimeVersion: '4.2.0',
  model: {
    benchModelId: 'bge-small-en',
    runtimeId: 'transformers-wasm',
    providerModelId: 'Xenova/bge-small-en-v1.5',
    displayName: 'BGE Small EN (ONNX, WASM)',
    task: 'embedding',
  },
  workloadId: 'embed-batch32',
  workloadKind: 'embed-batch',
  resolvedBackend: 'wasm',
  runtimeConfig: { device: 'wasm', dtype: 'fp32', worker: true },
  load: { cached: true, startT: 0, endT: 150 },
  warmupMs: 42.5,
  iterations: [
    { startT: 20_000, endT: 21_000, count: 32, dimensions: 384, gates: [] },
    { startT: 22_000, endT: 23_000, count: 32, dimensions: 384, gates: [] },
  ],
  memory: { api: 'legacyHeap', baseline: 50_000_000, postLoad: 80_000_000, postRun: 81_000_000 },
  status: 'ok',
};

/** Values copied from a real v5 CPU-lane Gemma quality cell that errored. */
export const ERROR_CELL: BenchCellResult = {
  cellId: 'wllama/gemma-4-e2b/quality-mmlu-25',
  runtimeId: 'wllama',
  runtimeVersion: '3.5.1',
  model: {
    benchModelId: 'gemma-4-e2b',
    runtimeId: 'wllama',
    providerModelId: 'unsloth/gemma-4-E2B-it-GGUF:gemma-4-E2B-it-Q4_K_M.gguf',
    displayName: 'Gemma 4 E2B (GGUF, CPU)',
    task: 'llm',
  },
  workloadId: 'quality-mmlu-25',
  workloadKind: 'quality-mmlu',
  resolvedBackend: 'wasm',
  runtimeConfig: {
    n_threads: 5,
    multithread: true,
    n_threads_used: 5,
    n_ctx: 2048,
    n_gpu_layers: 0,
    webgpu_adapter: true,
    offloadedLayers: '0/36',
    cache_prompt: false,
    mmproj: false,
  },
  load: null,
  iterations: [],
  memory: { api: 'uaSpecific', baseline: 10_983_134, postLoad: 3_943_637_029, atError: 3_943_800_639 },
  status: 'error',
  error: { name: 'Error', message: 'quality lane failed', cause: 'std::bad_alloc', causeName: 'RuntimeError' },
};

export const SKIPPED_CELL: BenchCellResult = {
  cellId: 'chrome-ai/gemini-nano/chat-pp128-tg128',
  runtimeId: 'chrome-ai',
  model: {
    benchModelId: 'gemini-nano',
    runtimeId: 'chrome-ai',
    providerModelId: 'chrome-ai:gemini-nano',
    displayName: 'Gemini Nano (Chrome Built-in AI)',
    task: 'llm',
  },
  workloadId: 'chat-pp128-tg128',
  workloadKind: 'llm-generate',
  resolvedBackend: 'unknown',
  load: null,
  iterations: [],
  status: 'skipped',
  invalidReasons: ['runtime unavailable: Prompt API not supported'],
};

/** A scored STS-B quality cell (no timed iterations), with one retried attempt. */
export const QUALITY_CELL: BenchCellResult = {
  cellId: 'transformers-wasm/bge-small-en/quality-sts-100',
  runtimeId: 'transformers-wasm',
  runtimeVersion: '4.2.0',
  model: EMBED_CELL.model,
  workloadId: 'quality-sts-100',
  workloadKind: 'quality-sts',
  resolvedBackend: 'wasm',
  load: null,
  iterations: [],
  quality: { taskId: 'stsb-100', score: 0.8123, n: 100 },
  attempts: [{ error: { name: 'TimeoutError', message: 'no progress' }, at: 5000 }],
  status: 'ok',
};

/** The real LiteRT terminal-burst trace: every chunk lands in the last ~0.8 ms. */
export const BURST_CELL: BenchCellResult = {
  cellId: 'litert/qwen3-0.6b/chat-pp128-tg128',
  runtimeId: 'litert',
  runtimeVersion: '0.12.1',
  model: {
    benchModelId: 'qwen3-0.6b',
    runtimeId: 'litert',
    providerModelId: 'qwen3-0.6b',
    displayName: 'Qwen3 0.6B (LiteRT-LM)',
    task: 'llm',
    sizeBytes: 614_000_000,
  },
  workloadId: 'chat-pp128-tg128',
  workloadKind: 'llm-generate',
  resolvedBackend: 'webgpu',
  load: { cached: true, startT: 3000, endT: 4000, progress: [] },
  iterations: [
    { ...LITERT_BURST_ITERATION, finishReason: 'stop', gates: ['started-hidden', 'hidden-during-run'] },
  ],
  status: 'invalid',
  invalidReasons: ['timed iteration overlapped a hidden tab', 'second reason'],
};

/** Run 1: every cell shape, a clean fingerprint, no validation flags. */
export function makeAnalysisRun(): BenchRunResult {
  return {
    protocol: BENCH_PROTOCOL_VERSION,
    schemaVersion: BENCH_SCHEMA_VERSION,
    runId: 'analysis-run-0001',
    createdAt: '2026-09-22T10:00:00.000Z',
    harness: {
      name: '@localmode/bench',
      version: '0.8.2',
      appVersion: '2.15.2',
      commit: 'abc1234',
      runtimeVersions: { '@wllama/wllama': '3.5.1', '@huggingface/transformers': '4.2.0' },
    },
    suite: 'thorough',
    environment: makeEnvironment({
      browser: { name: 'Google Chrome', version: '145.0.7632.159', source: 'ua-ch', engine: 'Blink' },
      os: { platform: 'macOS', version: '15.5', architecture: 'arm' },
      hardware: { cores: 10, coresClamped: false, deviceMemoryGB: 8, deviceMemoryCapped: true },
      gpu: {
        available: true,
        vendor: 'apple',
        architecture: 'metal-3',
        device: '',
        description: '',
        isFallbackAdapter: false,
      },
      gpuModel: 'Apple M1 Pro',
      screen: { width: 1512, height: 982, dpr: 2 },
      device: { type: 'desktop', mobile: false, maxTouchPoints: 0 },
    }),
    fingerprint: { mflops: 1234.5678, n: 160, iterations: 120, durationMs: 650, checksum: 1.5 },
    cells: [LLAMA_CELL, EMBED_CELL, QUALITY_CELL, ERROR_CELL, SKIPPED_CELL, BURST_CELL],
    events: [
      { t: 0, type: 'suite-start' },
      { t: 500, type: 'cooldown-start' },
      { t: 90_000.5, type: 'suite-end' },
    ],
  };
}

/**
 * Run 2: a different runtime-version set, no fingerprint (a reject flag), no
 * WebGPU, no suite-end event, a Safari-style clamped core count.
 */
export function makeSecondAnalysisRun(): BenchRunResult {
  return {
    protocol: 'localmode-bench/4' as BenchRunResult['protocol'],
    schemaVersion: 2 as BenchRunResult['schemaVersion'],
    runId: 'analysis-run-0002',
    createdAt: '2026-09-21T08:30:00.000Z',
    harness: {
      name: '@localmode/bench',
      version: '0.7.0',
      runtimeVersions: { '@litert-lm/core': '0.12.1', '@wllama/wllama': '3.4.0' },
    },
    suite: 'quick',
    environment: makeEnvironment({
      browser: { name: 'Safari', version: '26.5.2', source: 'ua-parse', engine: 'WebKit' },
      hardware: { cores: 8, coresClamped: true, deviceMemoryGB: null, deviceMemoryCapped: false },
      gpu: { available: false },
      screen: null,
    }),
    fingerprint: null,
    cells: [EMBED_CELL],
    events: [{ t: 0, type: 'suite-start' }],
  };
}
