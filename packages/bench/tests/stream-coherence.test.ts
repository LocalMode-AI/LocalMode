/**
 * Protocol v2 stream-coherence semantics: TTFT and decode rate are derived
 * ONLY from genuinely incremental streams. A trace whose chunks arrive in a
 * terminal burst (LiteRT-LM's web surface) or as a single chunk (doGenerate
 * fallback) yields overall throughput instead — never a fabricated decode
 * rate. The burst fixture is a verbatim real capture that produced a
 * 693,902 chars/s "decode rate" under v1 and quarantined the run.
 */

import { describe, expect, it } from 'vitest';
import { summarizeCell, checkPlausibility } from '../src/validate.js';
import { orderCells } from '../src/protocol.js';
import type { BenchCellResult, LLMIteration } from '../src/types.js';
import type { PlannedCell } from '../src/runner.js';
import { LITERT_BURST_ITERATION } from './fixtures/litert-burst-iteration.js';
import { MODEL_REF, makeIteration, makeRun } from './helpers.js';

function llmCell(iterations: LLMIteration[], overrides?: Partial<BenchCellResult>): BenchCellResult {
  return {
    cellId: 'litert/qwen3-0.6b/chat-pp128-tg128',
    runtimeId: 'litert',
    model: { ...MODEL_REF, runtimeId: 'litert', sizeBytes: 614_236_160 },
    workloadId: 'chat-pp128-tg128',
    workloadKind: 'llm-generate',
    resolvedBackend: 'gpu',
    load: null,
    iterations,
    status: 'ok',
    ...overrides,
  };
}

describe('summarizeCell() — stream coherence (protocol v2)', () => {
  it('derives NO ttft/decode from the real LiteRT terminal-burst trace', () => {
    const summary = summarizeCell(llmCell([LITERT_BURST_ITERATION]));
    expect(summary.streamIncremental).toBe(false);
    expect(summary.ttftMs).toBeUndefined();
    expect(summary.decodeCharsPerSec).toBeUndefined();
    expect(summary.decodeChunksPerSec).toBeUndefined();
    expect(summary.prefillTokPerSecApprox).toBeUndefined();
  });

  it('derives overall throughput and total duration from the burst trace', () => {
    const summary = summarizeCell(llmCell([LITERT_BURST_ITERATION]));
    // 613 chars over ~30,107.84ms ≈ 20.36 chars/s end to end.
    expect(summary.totalMs?.median).toBeCloseTo(30_107.84, 0);
    expect(summary.overallCharsPerSec?.median).toBeCloseTo(20.36, 1);
  });

  it('keeps ttft/decode for a genuinely incremental trace (and adds overall)', () => {
    const summary = summarizeCell(llmCell([makeIteration(0)]));
    expect(summary.streamIncremental).toBe(true);
    expect(summary.ttftMs?.median).toBe(100);
    expect(summary.decodeCharsPerSec?.median).toBeCloseTo(100, 5);
    // 50 chars over 560ms ≈ 89.29 chars/s end to end.
    expect(summary.overallCharsPerSec?.median).toBeCloseTo(89.29, 1);
    expect(summary.totalMs?.median).toBe(560);
  });

  it('treats a single-chunk trace (doGenerate fallback) as non-incremental', () => {
    const single: LLMIteration = {
      startT: 1000,
      chunks: [{ t: 3000, c: 50 }],
      endT: 3001,
      text: 'x'.repeat(50),
      gates: [],
    };
    const summary = summarizeCell(llmCell([single]));
    expect(summary.streamIncremental).toBe(false);
    expect(summary.ttftMs).toBeUndefined();
    expect(summary.decodeCharsPerSec).toBeUndefined();
    expect(summary.overallCharsPerSec?.median).toBeCloseTo((50 / 2001) * 1000, 2);
  });

  it('drops ttft/decode for the whole cell when ANY iteration is non-incremental', () => {
    const summary = summarizeCell(llmCell([makeIteration(0), LITERT_BURST_ITERATION]));
    expect(summary.streamIncremental).toBe(false);
    expect(summary.ttftMs).toBeUndefined();
    expect(summary.decodeCharsPerSec).toBeUndefined();
    expect(summary.overallCharsPerSec?.n).toBe(2);
  });
});

describe('summarizeCell() — quality parse rate', () => {
  it('surfaces the MMLU parse rate so a format failure is distinguishable from low fidelity', () => {
    const cell: BenchCellResult = {
      cellId: 'wllama/gemma-4-e2b/quality-mmlu-25',
      runtimeId: 'wllama',
      model: MODEL_REF,
      workloadId: 'quality-mmlu-25',
      workloadKind: 'quality-mmlu',
      resolvedBackend: 'wasm',
      load: null,
      iterations: [],
      // The real pilot #3 outcome: chain-of-thought output truncated by the
      // budget - 1/25 correct, only 2/25 parseable.
      quality: { taskId: 'tinymmlu-25', score: 0.04, n: 25, parseRate: 0.08 },
      status: 'ok',
    };
    const summary = summarizeCell(cell);
    expect(summary.qualityScore).toBe(0.04);
    expect(summary.qualityParseRate).toBe(0.08);
  });
});

describe('checkPlausibility() — v2 stream/overall rules', () => {
  it('does not fire decode-rate-envelope on the real burst trace (no decode derived)', () => {
    const run = makeRun();
    run.cells = [llmCell([LITERT_BURST_ITERATION])];
    delete run.clientSummaries;
    const flags = checkPlausibility(run);
    expect(flags.filter((f) => f.code === 'decode-rate-envelope')).toEqual([]);
  });

  it('fires overall-rate-envelope when end-to-end throughput is beyond silicon reality', () => {
    // 5,000 chars in 1ms with a single terminal chunk: 5,000,000 chars/s "overall".
    const forged: LLMIteration = {
      startT: 1000,
      chunks: [{ t: 1000.5, c: 5000 }],
      endT: 1001,
      text: 'x'.repeat(5000),
      gates: [],
    };
    const run = makeRun();
    run.cells = [llmCell([forged])];
    delete run.clientSummaries;
    const flags = checkPlausibility(run);
    expect(flags.some((f) => f.code === 'overall-rate-envelope' && f.severity === 'reject')).toBe(true);
  });
});

describe('orderCells() — protocol v3 execution order', () => {
  it('sorts cells into the fixed, deterministic runtime order (stable within a runtime)', () => {
    const cell = (runtimeId: string, benchModelId: string): PlannedCell => ({
      model: { ...MODEL_REF, runtimeId: runtimeId as PlannedCell['model']['runtimeId'], benchModelId },
      workload: { id: 'chat-pp128-tg128', kind: 'llm-generate', label: 'x', prompt: 'p', approxPromptTokens: 128, maxTokens: 128, temperature: 0 },
    });
    // Model-major input order, as a host would naturally build it.
    const input = [
      cell('webllm', 'qwen3-0.6b'),
      cell('wllama', 'qwen3-0.6b'),
      cell('litert', 'qwen3-0.6b'),
      cell('transformers-webgpu', 'qwen3-0.6b'),
      cell('transformers-wasm', 'qwen3-0.6b'),
      cell('webllm', 'llama-3.2-1b'),
      cell('wllama', 'llama-3.2-1b'),
      cell('transformers-webgpu', 'llama-3.2-1b'),
      cell('wllama-webgpu', 'qwen3-0.6b'),
    ];
    const ordered = orderCells(input);
    const runtimes = ordered.map((c) => c.model.runtimeId);
    // The Transformers.js WASM lane runs before its WebGPU lane: Transformers.js
    // chains every session creation on one uncaught promise, so a failed WebGPU
    // session would otherwise fail the CPU lane's sessions too. The llama.cpp
    // WebGPU lane precedes the CPU lane so the WASM heap is the last thing built.
    expect(runtimes).toEqual([
      'transformers-wasm',
      'transformers-webgpu',
      'transformers-webgpu',
      'webllm',
      'webllm',
      'litert',
      'wllama-webgpu',
      'wllama',
      'wllama',
    ]);
    // Stable within a runtime: original model order preserved.
    const twg = ordered.filter((c) => c.model.runtimeId === 'transformers-webgpu');
    expect(twg.map((c) => c.model.benchModelId)).toEqual(['qwen3-0.6b', 'llama-3.2-1b']);
  });
});
