/**
 * The partial-run record a crashed page leaves behind: the export carries the
 * lane and phase that were running, and the diagnostics text names them so a
 * phone user can paste them into a message instead of downloading a file.
 */
import { describe, expect, it } from 'vitest';
import type { BenchCellResult } from '@localmode/bench';
import { partialRunDiagnostics, toPartialRunExport, type PartialAttempt } from '../src/lib/bench/partial-run-store';

function cell(cellId: string, status: BenchCellResult['status'], error?: BenchCellResult['error']): BenchCellResult {
  return {
    cellId,
    runtimeId: cellId.split('/')[0] as BenchCellResult['runtimeId'],
    model: { benchModelId: 'bge-small-en', runtimeId: 'transformers-wasm', providerModelId: 'x', displayName: 'x', task: 'embedding' },
    workloadId: 'embed-single',
    workloadKind: 'embed-single',
    resolvedBackend: 'wasm',
    load: null,
    iterations: [],
    status,
    ...(error ? { error } : {}),
  } as BenchCellResult;
}

const attempt: PartialAttempt = {
  attemptId: 'a1',
  startedAt: '2026-09-20T18:00:00.000Z',
  updatedAt: '2026-09-20T18:03:00.000Z',
  suite: 'quick',
  harness: { name: '@localmode/bench', version: '0.6.0' },
  plannedCellIds: [
    'transformers-wasm/bge-small-en/embed-single',
    'transformers-wasm/bge-small-en/embed-batch32',
    'webllm/smollm2-135m/chat-pp128-tg128',
    'mediapipe/use-mediapipe/embed-single',
  ],
  environment: {
    browser: { name: 'Safari', version: '27.0' },
    os: { platform: 'iOS', version: '18.7' },
    device: { type: 'phone' },
    hardware: { cores: 4 },
    gpu: { available: true, vendor: 'apple' },
    gpuModel: 'Apple GPU',
    storage: { quotaBytes: 1_000_000_000 },
  } as unknown as PartialAttempt['environment'],
  cells: [
    cell('transformers-wasm/bge-small-en/embed-single', 'ok'),
    cell('transformers-wasm/bge-small-en/embed-batch32', 'error', { name: 'RangeError', message: 'Out of memory', cause: 'memory.grow' }),
  ],
  currentCellId: 'webllm/smollm2-135m/chat-pp128-tg128',
  currentPhase: 'load',
  pageOrigin: 'https://localmode.ai',
};

describe('partial run record', () => {
  it('exports the running lane and its phase beside the finished cells', () => {
    const out = toPartialRunExport(attempt);
    expect(out.partial).toBe(true);
    expect(out.currentCellId).toBe('webllm/smollm2-135m/chat-pp128-tg128');
    expect(out.currentPhase).toBe('load');
    expect(out.finishedCells).toBe(2);
    expect(out.unfinishedCellIds).toEqual(['webllm/smollm2-135m/chat-pp128-tg128', 'mediapipe/use-mediapipe/embed-single']);
  });

  it('writes diagnostics that name the crash point, the device, and every finished cell', () => {
    const text = partialRunDiagnostics(attempt);
    expect(text).toContain('quick suite · harness 0.6.0 · https://localmode.ai');
    expect(text).toContain('finished 2 of 4 cells (1 ok, 1 error)');
    expect(text).toContain('running when the page ended: webllm/smollm2-135m/chat-pp128-tg128 · phase load');
    expect(text).toContain('not run: webllm/smollm2-135m/chat-pp128-tg128, mediapipe/use-mediapipe/embed-single');
    expect(text).toContain('device: Safari 27.0 · iOS 18.7 · phone · 4 cores');
    expect(text).toContain('webgpu yes · quota 1 GB');
    expect(text).toContain('  transformers-wasm/bge-small-en/embed-batch32: error · RangeError: Out of memory (memory.grow)');
    expect(text.split('\n')).toHaveLength(9);
  });

  it('says so when the page ended between cells', () => {
    const text = partialRunDiagnostics({ ...attempt, currentCellId: undefined, currentPhase: undefined, environment: undefined });
    expect(text).toContain('running when the page ended: nothing (between cells)');
    expect(text).not.toContain('device:');
  });
});
