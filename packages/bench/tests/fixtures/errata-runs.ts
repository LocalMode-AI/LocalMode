/**
 * Errata fixtures: protocol-v5 runs from one device subclass, each with an
 * MMLU quality cell, shaped like the archived LiteRT Qwen3 cells (the
 * erratum case records score 0 at parse rate 0).
 */

import type { BenchCellResult, BenchRunResult } from '../../src/types.js';
import { makeAnalysisRun } from './analysis-runs.js';

export const MMLU_CELL_ID = 'litert/qwen3-0.6b/quality-mmlu-25';

/** An MMLU cell recorded `ok` with the given score and parse rate. */
export function mmluCell(score: number, parseRate: number): BenchCellResult {
  return {
    cellId: MMLU_CELL_ID,
    runtimeId: 'litert',
    runtimeVersion: '0.12.1',
    model: {
      benchModelId: 'qwen3-0.6b',
      runtimeId: 'litert',
      providerModelId: 'qwen3-0.6B',
      displayName: 'Qwen3 0.6B (LiteRT)',
      task: 'llm',
      sizeBytes: 614_236_160,
    },
    workloadId: 'quality-mmlu-25',
    workloadKind: 'quality-mmlu',
    resolvedBackend: 'gpu',
    load: null,
    iterations: [],
    quality: { taskId: 'tinymmlu-25', score, n: 25, parseRate },
    status: 'ok',
  };
}

/** A copy of the analysis run with a new id and an extra MMLU cell. */
export function runWithMmlu(runId: string, score: number, parseRate: number): BenchRunResult {
  const run = makeAnalysisRun();
  return { ...run, runId, cells: [...run.cells, mmluCell(score, parseRate)] };
}

/**
 * Three runs whose MMLU row has median 0.4 at n = 3 (scores 0.4, 0.48, 0);
 * the third is the erratum case.
 */
export function errataRuns(): BenchRunResult[] {
  return [
    runWithMmlu('errata-run-good-1', 0.4, 1),
    runWithMmlu('errata-run-good-2', 0.48, 0.96),
    runWithMmlu('errata-run-replaced', 0, 0),
  ];
}
