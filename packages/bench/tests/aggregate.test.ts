import { describe, expect, it } from 'vitest';
import { aggregateRuns, deviceClassOf, rowsToCSV, runsToLongCSV } from '../src/aggregate.js';
import { makeRun } from './helpers.js';

describe('deviceClassOf()', () => {
  it('derives platform/gpu-vendor-architecture', () => {
    expect(deviceClassOf(makeRun())).toBe('macos/apple-metal-3');
  });

  it('marks WebGPU-less devices', () => {
    const run = makeRun();
    run.environment.gpu = { available: false };
    expect(deviceClassOf(run)).toBe('macos/no-webgpu');
  });
});

describe('aggregateRuns()', () => {
  it('groups by device class and takes the median of per-run medians', () => {
    const runs = [makeRun({ runId: 'r1' }), makeRun({ runId: 'r2' }), makeRun({ runId: 'r3' })];
    const rows = aggregateRuns(runs);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.submissions).toBe(3);
    expect(row.provisional).toBe(false);
    expect(row.ttftMs).toBe(100);
    expect(row.decodeCharsPerSec).toBeCloseTo(100, 1);
    expect(row.loadColdMs).toBe(800);
    expect(row.resolvedBackends).toEqual(['wasm']);
  });

  it('marks rows under min-N as provisional and skips non-ok cells', () => {
    const single = makeRun({ runId: 'solo' });
    const errored = makeRun({ runId: 'err' });
    errored.cells[0].status = 'error';
    const rows = aggregateRuns([single, errored]);
    expect(rows).toHaveLength(1);
    expect(rows[0].submissions).toBe(1);
    expect(rows[0].provisional).toBe(true);
  });
});

describe('CSV exports', () => {
  it('rowsToCSV emits a header plus one line per row with escaping', () => {
    const rows = aggregateRuns([makeRun()]);
    rows[0].modelName = 'Model, "quoted"';
    const csv = rowsToCSV(rows);
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('deviceClass,runtimeId');
    expect(lines[1]).toContain('"Model, ""quoted"""');
  });

  it('runsToLongCSV emits one line per iteration with exact metrics', () => {
    const csv = runsToLongCSV([makeRun()]);
    const lines = csv.trim().split('\n');
    // Header + 3 iterations.
    expect(lines).toHaveLength(4);
    const cols = lines[1].split(',');
    const header = lines[0].split(',');
    expect(cols[header.indexOf('ttftMs')]).toBe('100');
    expect(cols[header.indexOf('decodeCharsPerSec')]).toBe('100');
    expect(cols[header.indexOf('loadCached')]).toBe('false');
  });
});
