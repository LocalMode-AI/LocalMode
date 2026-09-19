import { describe, expect, it } from 'vitest';
import {
  checkPlausibility,
  summarizeCell,
  summarizeRun,
  validateRunShape,
  validateSubmission,
} from '../src/validate.js';
import type { BenchRunResult, LLMIteration } from '../src/types.js';
import { makeIteration, makeRun } from './helpers.js';

describe('validateRunShape()', () => {
  it('accepts the fixture run', () => {
    expect(validateRunShape(makeRun())).toEqual([]);
  });

  it('rejects wrong protocol, missing cells, and non-objects', () => {
    expect(validateRunShape(null)).toEqual(['result must be an object']);
    expect(validateRunShape({ ...makeRun(), protocol: 'other/9' })).toContainEqual(
      expect.stringContaining('protocol'),
    );
    expect(validateRunShape({ ...makeRun(), cells: [] })).toContainEqual(
      expect.stringContaining('cells must not be empty'),
    );
  });

  it('rejects oversized generated text', () => {
    const run = makeRun();
    (run.cells[0].iterations[0] as LLMIteration).text = 'x'.repeat(20_001);
    expect(validateRunShape(run)).toContainEqual(expect.stringContaining('exceeds 20000'));
  });
});

describe('summarizeCell() — the metric definitions', () => {
  it('computes TTFT and decode rate exactly from the trace', () => {
    const run = makeRun();
    const summary = summarizeCell(run.cells[0], 0.05, 128);
    // Fixture: TTFT = 1100 - 1000 = 100ms in every iteration.
    expect(summary.ttftMs?.median).toBe(100);
    expect(summary.ttftMs?.n).toBe(3);
    // Decode: 45 chars over 450ms = 100 chars/s.
    expect(summary.decodeCharsPerSec?.median).toBeCloseTo(100, 10);
    // Chunk rate: 9 chunks / 450ms = 20 chunks/s.
    expect(summary.decodeChunksPerSec?.median).toBeCloseTo(20, 10);
    // Prefill approx: 128 tokens / 100ms = 1280 tok/s.
    expect(summary.prefillTokPerSecApprox?.median).toBeCloseTo(1280, 10);
    expect(summary.loadMs).toBe(800);
    expect(summary.loadCached).toBe(false);
    // Identical iterations → zero variance.
    expect(summary.highVariance).toBe(false);
  });

  it('flags high variance when CV exceeds the threshold', () => {
    const run = makeRun();
    const it2 = makeIteration(1000);
    // Second iteration: TTFT 400ms instead of 100ms.
    it2.chunks = it2.chunks.map((c) => ({ ...c, t: c.t + 300 }));
    run.cells[0].iterations = [makeIteration(0), it2];
    const summary = summarizeCell(run.cells[0]);
    expect(summary.highVariance).toBe(true);
  });
});

describe('checkPlausibility()', () => {
  it('passes the clean fixture', () => {
    expect(checkPlausibility(makeRun()).filter((f) => f.severity === 'reject')).toEqual([]);
  });

  it('rejects a missing fingerprint', () => {
    const run = makeRun({ fingerprint: null });
    expect(checkPlausibility(run)).toContainEqual(
      expect.objectContaining({ code: 'fingerprint-missing', severity: 'reject' }),
    );
  });

  it('rejects non-monotonic chunk timestamps', () => {
    const run = makeRun();
    const iter = run.cells[0].iterations[0] as LLMIteration;
    iter.chunks[3] = { ...iter.chunks[3], t: iter.chunks[1].t - 10 };
    expect(checkPlausibility(run)).toContainEqual(
      expect.objectContaining({ code: 'trace-not-monotonic', severity: 'reject' }),
    );
  });

  it('rejects text/chunk length mismatches', () => {
    const run = makeRun();
    (run.cells[0].iterations[0] as LLMIteration).text = 'short';
    expect(checkPlausibility(run)).toContainEqual(
      expect.objectContaining({ code: 'text-chunk-mismatch', severity: 'reject' }),
    );
  });

  it('rejects decode rates beyond the model-size envelope', () => {
    const run = makeRun();
    // A genuinely incremental stream (span 90/210ms) claiming 500-char chunks
    // every 10ms → 50,000 chars/s, far past any envelope. (A burst-compressed
    // forgery no longer reaches this rule: it derives no decode rate at all.)
    for (const iter of run.cells[0].iterations as LLMIteration[]) {
      iter.chunks = Array.from({ length: 10 }, (_, i) => ({ c: 500, t: iter.startT + 100 + i * 10 }));
      iter.endT = iter.startT + 210;
      iter.text = 'x'.repeat(5000);
    }
    expect(checkPlausibility(run)).toContainEqual(
      expect.objectContaining({ code: 'decode-rate-envelope', severity: 'reject' }),
    );
  });

  it('rejects an ok cell whose timed generations are degenerate (client bypassed the gate)', () => {
    const run = makeRun();
    for (const iter of run.cells[0].iterations as LLMIteration[]) {
      // Three characters of output, claimed as a healthy timed iteration.
      iter.chunks = [{ t: iter.startT + 30, c: 3 }];
      iter.text = 'ok.';
      iter.endT = iter.startT + 31;
    }
    expect(checkPlausibility(run)).toContainEqual(
      expect.objectContaining({ code: 'degenerate-generation', severity: 'reject' }),
    );
  });

  it('rejects cross-field environment contradictions', () => {
    const run = makeRun();
    run.environment.os.platform = 'Windows';
    // gpu.vendor stays 'apple' in the fixture.
    expect(checkPlausibility(run)).toContainEqual(
      expect.objectContaining({ code: 'env-cross-field', severity: 'reject' }),
    );
  });

  it('rejects GPU-lane results from software/virtual renderers', () => {
    const run = makeRun();
    run.environment.gpu = { available: true, vendor: 'google', architecture: 'swiftshader' };
    run.environment.webglRenderer = 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM)))';
    run.cells[0].resolvedBackend = 'webgpu';
    expect(checkPlausibility(run)).toContainEqual(
      expect.objectContaining({ code: 'software-renderer', severity: 'reject' }),
    );
  });

  it('only warns on software renderers when the run is WASM/CPU-only', () => {
    const run = makeRun();
    run.environment.gpu = { available: false };
    run.environment.webglRenderer = 'llvmpipe (LLVM 15.0.7, 256 bits)';
    // Fixture cell backend is 'wasm' — software rendering cannot skew it.
    const flags = checkPlausibility(run);
    expect(flags).toContainEqual(
      expect.objectContaining({ code: 'software-renderer', severity: 'warn' }),
    );
    expect(flags.filter((f) => f.severity === 'reject')).toEqual([]);
  });

  it('does not flag real hardware adapters', () => {
    // The clean fixture (apple/metal-3 + 'Apple M3' WebGL string) must stay unflagged.
    expect(checkPlausibility(makeRun()).map((f) => f.code)).not.toContain('software-renderer');
  });
});

describe('validateSubmission()', () => {
  it('accepts a clean run and returns recomputed summaries', () => {
    const report = validateSubmission(makeRun());
    expect(report.ok).toBe(true);
    expect(report.summaries).toHaveLength(1);
    expect(report.summaries[0].ttftMs?.median).toBe(100);
  });

  it('rejects client summaries that disagree with the recomputed trace', () => {
    const run = makeRun();
    run.clientSummaries = summarizeRun(run);
    // Claim a 2x better TTFT than the trace supports.
    run.clientSummaries[0].ttftMs = { ...run.clientSummaries[0].ttftMs!, median: 50 };
    const report = validateSubmission(run);
    expect(report.ok).toBe(false);
    expect(report.flags).toContainEqual(
      expect.objectContaining({ code: 'client-summary-disagrees', severity: 'reject' }),
    );
  });

  it('fails shape-invalid submissions without running plausibility', () => {
    const report = validateSubmission({ nope: true } as unknown as BenchRunResult);
    expect(report.ok).toBe(false);
    expect(report.shapeErrors.length).toBeGreaterThan(0);
    expect(report.flags).toEqual([]);
  });
});
