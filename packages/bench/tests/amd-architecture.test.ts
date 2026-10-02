import { describe, expect, it } from 'vitest';
import {
  AMD_DEVICE_ID_ARCHITECTURE,
  aggregateRuns,
  amdArchitectureFromRenderer,
  deviceClassOf,
  deviceSubclassOf,
  gpuArchitectureOf,
} from '../src/aggregate.js';
import type { BenchRunResult } from '../src/types.js';
import { makeRun } from './helpers.js';

// Renderer strings exactly as the published Windows runs carry them.
const BARCELO = 'ANGLE (AMD, AMD Radeon (TM) Graphics (0x000015E7) Direct3D11 vs_5_0 ps_5_0, D3D11)';
const LUCIENNE = 'ANGLE (AMD, AMD Radeon(TM) Graphics (0x0000164C) Direct3D11 vs_5_0 ps_5_0, D3D11)';
const KAVERI = 'ANGLE (AMD, AMD Radeon(TM) R5 Graphics (0x0000130A) Direct3D11 vs_5_0 ps_5_0, D3D11)';
const GRANITE_RIDGE = 'ANGLE (AMD, AMD Radeon(TM) Graphics (0x000013C0) Direct3D11 vs_5_0 ps_5_0, D3D11)';

/** A Windows run on an AMD adapter, as Chromium reports it. */
function amdRun(renderer: string, architecture: string, gpuModel: string): BenchRunResult {
  const run = makeRun();
  run.environment.os = { ...run.environment.os, platform: 'Windows' };
  run.environment.gpu = { available: true, vendor: 'amd', architecture };
  run.environment.webglRenderer = renderer;
  run.environment.gpuModel = gpuModel;
  return run;
}

describe('amdArchitectureFromRenderer()', () => {
  it('reads the device id ANGLE prints and returns the table architecture', () => {
    expect(amdArchitectureFromRenderer(BARCELO)).toBe('gcn-5');
    expect(amdArchitectureFromRenderer(LUCIENNE)).toBe('gcn-5');
    expect(amdArchitectureFromRenderer(KAVERI)).toBe('gcn-2');
    expect(amdArchitectureFromRenderer(GRANITE_RIDGE)).toBe('rdna-2');
  });

  it('accepts a lowercase id', () => {
    expect(amdArchitectureFromRenderer('ANGLE (AMD, AMD Radeon(TM) Graphics (0x000015e7) Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe('gcn-5');
  });

  it('returns undefined for a renderer without a device id', () => {
    expect(amdArchitectureFromRenderer('ANGLE (AMD, AMD Radeon Pro 5500M OpenGL Engine, OpenGL 4.1)')).toBeUndefined();
    expect(amdArchitectureFromRenderer('AMD Radeon(TM) Graphics')).toBeUndefined();
    expect(amdArchitectureFromRenderer(null)).toBeUndefined();
    expect(amdArchitectureFromRenderer(undefined)).toBeUndefined();
    expect(amdArchitectureFromRenderer('')).toBeUndefined();
  });

  it('returns undefined for a non-AMD renderer, even when the id matches a table key', () => {
    expect(amdArchitectureFromRenderer('ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 (0x00002484) Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBeUndefined();
    expect(amdArchitectureFromRenderer('ANGLE (Intel, Intel(R) UHD Graphics (0x000015E7) Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBeUndefined();
  });

  it('returns undefined for an AMD id the table does not list', () => {
    expect(AMD_DEVICE_ID_ARCHITECTURE['744C']).toBeUndefined();
    expect(amdArchitectureFromRenderer('ANGLE (AMD, AMD Radeon RX 7900 XTX (0x0000744C) Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBeUndefined();
  });
});

describe('device class with the AMD device-id correction', () => {
  it('classes Barcelo (0x15E7) as gcn-5 where Chromium says rdna-2, and records the browser label', () => {
    const run = amdRun(BARCELO, 'rdna-2', 'AMD Radeon (TM) Graphics');
    expect(gpuArchitectureOf(run)).toEqual({ architecture: 'gcn-5', reported: 'rdna-2' });
    expect(deviceClassOf(run)).toBe('windows/amd-gcn-5');
    expect(deviceSubclassOf(run)).toBe('windows/amd-gcn-5');
    // The run file itself is not rewritten.
    expect(run.environment.gpu.architecture).toBe('rdna-2');
  });

  it('classes Lucienne (0x164C) as gcn-5 and Kaveri (0x130A) as gcn-2', () => {
    expect(deviceClassOf(amdRun(LUCIENNE, 'rdna-2', 'AMD Radeon(TM) Graphics'))).toBe('windows/amd-gcn-5');
    const kaveri = amdRun(KAVERI, 'gcn-1', 'AMD Radeon(TM) R5 Graphics');
    expect(deviceClassOf(kaveri)).toBe('windows/amd-gcn-2');
    expect(gpuArchitectureOf(kaveri).reported).toBe('gcn-1');
    // The R5 part number already names the subclass, so it does not depend on the class.
    expect(deviceSubclassOf(kaveri)).toBe('windows/amd-radeon-r5-graphics');
  });

  it('leaves Granite Ridge (0x13C0) as rdna-2 with no reported label, since Chromium agrees', () => {
    const run = amdRun(GRANITE_RIDGE, 'rdna-2', 'AMD Radeon(TM) Graphics');
    expect(gpuArchitectureOf(run)).toEqual({ architecture: 'rdna-2' });
    expect(deviceClassOf(run)).toBe('windows/amd-rdna-2');
  });

  it('keeps the browser label for an AMD id the table does not list', () => {
    const run = amdRun('ANGLE (AMD, AMD Radeon RX 7900 XTX (0x0000744C) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'rdna-3', 'AMD Radeon RX 7900 XTX');
    expect(gpuArchitectureOf(run)).toEqual({ architecture: 'rdna-3' });
    expect(deviceClassOf(run)).toBe('windows/amd-rdna-3');
  });

  it('keeps the browser label when the renderer carries no id or the adapter is not AMD', () => {
    expect(deviceClassOf(amdRun('AMD Radeon(TM) Graphics', 'rdna-2', 'AMD Radeon(TM) Graphics'))).toBe('windows/amd-rdna-2');
    const nvidia = amdRun(BARCELO, 'ampere', 'NVIDIA GeForce RTX 3070');
    nvidia.environment.gpu = { available: true, vendor: 'nvidia', architecture: 'ampere' };
    expect(deviceClassOf(nvidia)).toBe('windows/nvidia-ampere');
    const noWebGPU = amdRun(BARCELO, 'rdna-2', 'AMD Radeon (TM) Graphics');
    noWebGPU.environment.gpu = { available: false };
    expect(deviceClassOf(noWebGPU)).toBe('windows/no-webgpu');
  });

  it('groups a corrected run under the corrected leaderboard row', () => {
    const barcelo = amdRun(BARCELO, 'rdna-2', 'AMD Radeon (TM) Graphics');
    const granite = amdRun(GRANITE_RIDGE, 'rdna-2', 'AMD Radeon(TM) Graphics');
    granite.runId = 'granite';
    const classes = new Set(aggregateRuns([barcelo, granite]).map((r) => r.deviceSubclass));
    expect(classes).toEqual(new Set(['windows/amd-gcn-5', 'windows/amd-rdna-2']));
  });
});
