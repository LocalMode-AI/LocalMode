import { describe, expect, it } from 'vitest';
import {
  aggregateRuns,
  deviceClassOf,
  deviceSubclassOf,
  refineDeviceClass,
  rowsToCSV,
  runsToLongCSV,
} from '../src/aggregate.js';
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

// The coarse class (platform + WebGPU vendor-architecture) is what every
// browser exposes; the subclass adds the GPU model where the browser names a
// specific part, and falls back to the coarse class where it names nothing.
// Strings below are the ones the archived runs actually carry.
describe('refineDeviceClass()', () => {
  it('splits a coarse class by the GPU model when the model names a specific part', () => {
    expect(refineDeviceClass('macos/apple-metal-3', 'Apple M1 Pro')).toBe('macos/apple-m1-pro');
    expect(refineDeviceClass('macos/apple-metal-3', 'Apple M4 Max')).toBe('macos/apple-m4-max');
    expect(refineDeviceClass('macos/apple-metal-3', 'Apple M4')).toBe('macos/apple-m4');
    expect(refineDeviceClass('android/qualcomm-adreno-6xx', 'Adreno (TM) 650')).toBe('android/adreno-650');
    expect(refineDeviceClass('android/qualcomm-adreno-8xx', 'Adreno (TM) 830')).toBe('android/adreno-830');
    expect(refineDeviceClass('windows/nvidia-ampere', 'NVIDIA GeForce RTX 3070')).toBe('windows/nvidia-geforce-rtx-3070');
  });

  it('keeps the coarse class when the browser names nothing more specific', () => {
    // WebKit masks the GPU on every Apple device.
    expect(refineDeviceClass('ios/apple-apple', 'Apple GPU')).toBe('ios/apple-apple');
    // Windows integrated Radeon: the renderer string carries no generation; rdna-2 already does.
    expect(refineDeviceClass('windows/amd-rdna-2', 'AMD Radeon(TM) Graphics')).toBe('windows/amd-rdna-2');
    // Mesa's Arc string names a codename in parentheses, no part number.
    expect(refineDeviceClass('linux/intel-xe-lpg', 'Mesa Intel(R) Arc(tm) Graphics (MTL)')).toBe('linux/intel-xe-lpg');
    // Firefox reports a masked bucket.
    expect(refineDeviceClass('macos/gpu', 'Apple M1, or similar')).toBe('macos/gpu');
    expect(refineDeviceClass('linux/gpu', 'Intel(R) HD Graphics, or similar')).toBe('linux/gpu');
    expect(refineDeviceClass('macos/apple-metal-3', undefined)).toBe('macos/apple-metal-3');
    expect(refineDeviceClass('macos/apple-metal-3', '')).toBe('macos/apple-metal-3');
    // A WASM-only device keeps its marker even when WebGL names the GPU.
    expect(refineDeviceClass('linux/no-webgpu', 'Intel(R) UHD Graphics 620')).toBe('linux/no-webgpu');
  });

  it('deviceSubclassOf() reads the run\'s captured GPU model', () => {
    const run = makeRun();
    run.environment.gpuModel = 'Apple M1 Pro';
    expect(deviceSubclassOf(run)).toBe('macos/apple-m1-pro');
    delete run.environment.gpuModel;
    expect(deviceSubclassOf(run)).toBe('macos/apple-metal-3');
  });
});

describe('aggregateRuns()', () => {
  it('rows split by subclass and keep the coarse class for the rollup', () => {
    const m1 = makeRun({ runId: 'm1' });
    m1.environment.gpuModel = 'Apple M1 Pro';
    const m4 = makeRun({ runId: 'm4' });
    m4.environment.gpuModel = 'Apple M4 Max';
    const rows = aggregateRuns([m1, m4]);
    expect(rows.map((r) => r.deviceSubclass)).toEqual(['macos/apple-m1-pro', 'macos/apple-m4-max']);
    expect(rows.map((r) => r.deviceClass)).toEqual(['macos/apple-metal-3', 'macos/apple-metal-3']);
    expect(rows.map((r) => r.submissions)).toEqual([1, 1]);
  });

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
    expect(lines[0]).toContain('deviceClass,deviceSubclass,runtimeId');
    expect(lines[1]).toContain('"Model, ""quoted"""');
  });

  it('runsToLongCSV emits one line per iteration with exact metrics', () => {
    const run = makeRun();
    run.environment.gpuModel = 'Apple M3';
    const csv = runsToLongCSV([run]);
    const lines = csv.trim().split('\n');
    // Header + 3 iterations.
    expect(lines).toHaveLength(4);
    const cols = lines[1].split(',');
    const header = lines[0].split(',');
    expect(cols[header.indexOf('deviceClass')]).toBe('macos/apple-metal-3');
    expect(cols[header.indexOf('deviceSubclass')]).toBe('macos/apple-m3');
    expect(cols[header.indexOf('ttftMs')]).toBe('100');
    expect(cols[header.indexOf('decodeCharsPerSec')]).toBe('100');
    expect(cols[header.indexOf('loadCached')]).toBe('false');
  });
});
