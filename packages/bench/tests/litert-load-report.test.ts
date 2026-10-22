/**
 * The LiteRT load record: `liteRtLoadReportError` (run by `validateRunShape`
 * on every cell) requires a LiteRT cell's `resolvedBackend` to agree with the
 * provider's load report (`requestedBackend`, `gpu_fallback`), and checks the
 * model-file fields `modelRevision` and `modelBytes`.
 */
import { describe, expect, it } from 'vitest';
import { liteRtLoadReportError, validateRunShape } from '../src/index.js';
import { makeRun } from './helpers.js';

const REV = 'a3c5d805ae362dff7f580bc25f2dfb9a5a7eaa76';
const cell = (resolvedBackend: string, runtimeConfig?: Record<string, unknown>, runtimeId = 'litert') => ({
  runtimeId,
  resolvedBackend,
  ...(runtimeConfig ? { runtimeConfig } : {}),
});

describe('liteRtLoadReportError()', () => {
  it('accepts records that agree, and every record shape archived runs carry', () => {
    const base = { modelRevision: REV, webgpu_adapter: true, modelBytes: 614_236_160 };
    expect(liteRtLoadReportError(cell('cpu', { ...base, requestedBackend: 'gpu', gpu_fallback: true }))).toBeUndefined();
    expect(liteRtLoadReportError(cell('gpu', { ...base, requestedBackend: 'gpu', gpu_fallback: false }))).toBeUndefined();
    expect(liteRtLoadReportError(cell('cpu', { ...base, webgpu_adapter: false, requestedBackend: 'cpu' }))).toBeUndefined();
    // A record read before the engine loaded: no load report yet.
    expect(liteRtLoadReportError(cell('unknown', { modelRevision: REV, webgpu_adapter: true }))).toBeUndefined();
    expect(liteRtLoadReportError(cell('unknown', { modelRevision: 'unpinned', webgpu_adapter: true }))).toBeUndefined();
    // Before 0.9.10 LiteRT cells carried no runtimeConfig and a probed `gpu`.
    expect(liteRtLoadReportError(cell('gpu'))).toBeUndefined();
    // Other runtimes are not checked.
    expect(liteRtLoadReportError(cell('gpu', { requestedBackend: 'gpu', gpu_fallback: true }, 'webllm'))).toBeUndefined();
  });

  it('rejects a backend the load report contradicts', () => {
    expect(liteRtLoadReportError(cell('gpu', { requestedBackend: 'gpu', gpu_fallback: true }))).toBe(
      'resolvedBackend is "gpu" but runtimeConfig.gpu_fallback is true (expected "cpu")',
    );
    expect(liteRtLoadReportError(cell('cpu', { requestedBackend: 'gpu', gpu_fallback: false }))).toBe(
      'resolvedBackend is "cpu" but runtimeConfig.gpu_fallback is false (expected "gpu")',
    );
    expect(liteRtLoadReportError(cell('gpu', { requestedBackend: 'cpu' }))).toBe(
      'resolvedBackend is "gpu" but runtimeConfig.requestedBackend is "cpu" (expected "cpu")',
    );
  });

  it('rejects malformed fields', () => {
    expect(liteRtLoadReportError(cell('gpu', { requestedBackend: 'gpu' }))).toBe(
      'runtimeConfig.gpu_fallback must be a boolean when requestedBackend is "gpu"',
    );
    expect(liteRtLoadReportError(cell('cpu', { requestedBackend: 'cpu', gpu_fallback: false }))).toBe(
      'runtimeConfig.gpu_fallback is set only with requestedBackend "gpu"',
    );
    expect(liteRtLoadReportError(cell('cpu', { gpu_fallback: true }))).toBe(
      'runtimeConfig.gpu_fallback is set only with requestedBackend "gpu"',
    );
    expect(liteRtLoadReportError(cell('gpu', { requestedBackend: 'webgpu', gpu_fallback: false }))).toBe(
      'runtimeConfig.requestedBackend must be "gpu" or "cpu", got "webgpu"',
    );
    expect(liteRtLoadReportError(cell('gpu', { modelRevision: 'main' }))).toBe(
      'runtimeConfig.modelRevision must be a 40-hex commit or "unpinned", got "main"',
    );
    expect(liteRtLoadReportError(cell('gpu', { modelBytes: 0 }))).toBe(
      'runtimeConfig.modelBytes must be a positive integer, got 0',
    );
    expect(liteRtLoadReportError(cell('gpu', { modelBytes: '614236160' }))).toBe(
      'runtimeConfig.modelBytes must be a positive integer, got "614236160"',
    );
  });

  it('validateRunShape reports a disagreeing LiteRT cell by index', () => {
    const run = makeRun();
    run.cells[0].runtimeId = 'litert';
    run.cells[0].resolvedBackend = 'gpu';
    run.cells[0].runtimeConfig = { modelRevision: REV, modelBytes: 614_236_160, requestedBackend: 'gpu', gpu_fallback: true };
    expect(validateRunShape(run)).toEqual([
      'cells[0]: resolvedBackend is "gpu" but runtimeConfig.gpu_fallback is true (expected "cpu")',
    ]);
    run.cells[0].resolvedBackend = 'cpu';
    expect(validateRunShape(run)).toEqual([]);
  });
});
