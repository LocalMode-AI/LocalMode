/**
 * Environment capture helpers. Everything a browser will disclose about the
 * device is recorded even where the paper does not use it yet; these are the
 * pure, node-testable parts of that capture.
 */

import { describe, expect, it } from 'vitest';
import { deriveDeviceType, detectEngine, parseGpuModel, resolveGpuModel, detectWasmFeatures } from '../src/env.js';

describe('deriveDeviceType()', () => {
  it('uses UA Client Hints form factors and the mobile bit when present', () => {
    expect(deriveDeviceType({ formFactors: ['Tablet'], mobile: false, ua: '', maxTouchPoints: 5 })).toBe('tablet');
    expect(deriveDeviceType({ formFactors: ['Mobile'], mobile: true, ua: '', maxTouchPoints: 5 })).toBe('phone');
    expect(deriveDeviceType({ formFactors: ['Desktop'], mobile: false, ua: '', maxTouchPoints: 0 })).toBe('desktop');
  });

  it('falls back to the UA string on WebKit, where hints are absent', () => {
    const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/145.0 Mobile/15E148 Safari/604.1';
    const ipad = 'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
    // iPadOS Safari masquerades as a Mac; touch points give it away.
    const ipadAsMac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';
    const androidPhone = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36';
    const androidTablet = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';
    const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';
    expect(deriveDeviceType({ ua: iphone, maxTouchPoints: 5 })).toBe('phone');
    expect(deriveDeviceType({ ua: ipad, maxTouchPoints: 5 })).toBe('tablet');
    expect(deriveDeviceType({ ua: ipadAsMac, maxTouchPoints: 5 })).toBe('tablet');
    expect(deriveDeviceType({ ua: androidPhone, maxTouchPoints: 5 })).toBe('phone');
    expect(deriveDeviceType({ ua: androidTablet, maxTouchPoints: 5 })).toBe('tablet');
    expect(deriveDeviceType({ ua: mac, maxTouchPoints: 0 })).toBe('desktop');
  });
});

describe('parseGpuModel()', () => {
  it('extracts the GPU model from ANGLE and native renderer strings', () => {
    expect(parseGpuModel('ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)')).toBe('Apple M4');
    expect(parseGpuModel('ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 (0x00002786) Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe('NVIDIA GeForce RTX 4070');
    expect(parseGpuModel('ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x000046A6) Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe('Intel(R) Iris(R) Xe Graphics');
    expect(parseGpuModel('ANGLE (ARM, Mali-G78 MP20, OpenGL ES 3.2 v1.r38p1-01eac0.f7ccd93bdb0d5a5cd3f2b1a5a6fa2a52)')).toBe('Mali-G78 MP20');
    expect(parseGpuModel('ANGLE (Qualcomm, Adreno (TM) 740, OpenGL ES 3.2 V@0615.0)')).toBe('Adreno (TM) 740');
    expect(parseGpuModel('Apple GPU')).toBe('Apple GPU');
    expect(parseGpuModel('llvmpipe (LLVM 15.0.7, 256 bits)')).toBe('llvmpipe (LLVM 15.0.7, 256 bits)');
    // Playwright's software GL, as observed in the real-Chrome witness run.
    expect(
      parseGpuModel('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)'),
    ).toBe('Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0))');
    expect(parseGpuModel(null)).toBeUndefined();
  });
});

describe('resolveGpuModel()', () => {
  it('prefers a WebGPU description that names a model, else the WebGL renderer parse', () => {
    // Chromium leaves description empty: WebGL decides.
    expect(resolveGpuModel({ vendor: 'apple', architecture: 'metal-3', description: undefined }, 'ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)')).toBe('Apple M4');
    // WebKit on iPhone (run c5b06059) fills description with the bare vendor token; "apple" is not a model.
    expect(resolveGpuModel({ vendor: 'apple', architecture: 'apple', description: 'apple' }, 'Apple GPU')).toBe('Apple GPU');
    // A description that carries real information wins over a masked WebGL string.
    expect(resolveGpuModel({ vendor: 'nvidia', architecture: 'ampere', description: 'NVIDIA GeForce RTX 3060' }, 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002503) Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe('NVIDIA GeForce RTX 3060');
    expect(resolveGpuModel({ vendor: 'apple', architecture: 'apple', description: 'apple' }, null)).toBeUndefined();
  });
});

describe('detectEngine()', () => {
  it('names the engine, with every iOS browser as WebKit', () => {
    expect(detectEngine('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36')).toBe('Blink');
    expect(detectEngine('Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:141.0) Gecko/20100101 Firefox/141.0')).toBe('Gecko');
    expect(detectEngine('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15')).toBe('WebKit');
    expect(detectEngine('Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/145.0 Mobile/15E148 Safari/604.1')).toBe('WebKit');
    expect(detectEngine('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36 Edg/145.0.0.0')).toBe('Blink');
    expect(detectEngine('')).toBe('unknown');
  });
});

describe('detectWasmFeatures()', () => {
  it('reports the WebAssembly proposals this engine supports (node has a real WebAssembly)', async () => {
    const f = await detectWasmFeatures();
    // Baseline proposals every current engine ships.
    expect(f.simd).toBe(true);
    expect(f.bulkMemory).toBe(true);
    expect(f.referenceTypes).toBe(true);
    expect(f.multiValue).toBe(true);
    // Every feature probe answers with a boolean, never throws.
    const { maxMemoryPages, ...features } = f;
    for (const [name, value] of Object.entries(features)) {
      expect(typeof value, name).toBe('boolean');
    }
    // A 32-bit wasm memory can declare up to 65536 pages (4 GiB) on V8.
    expect(maxMemoryPages).toBe(65536);
    expect(Object.keys(features)).toEqual(
      expect.arrayContaining([
        'simd', 'relaxedSimd', 'threads', 'bulkMemory', 'exceptions', 'exceptionsFinal', 'extendedConst', 'gc',
        'memory64', 'multiMemory', 'multiValue', 'mutableGlobals', 'referenceTypes', 'saturatedFloatToInt',
        'signExtensions', 'tailCall', 'typedFunctionReferences', 'wideArithmetic', 'jspi', 'typeReflection',
        'streamingCompilation', 'jsStringBuiltins',
      ]),
    );
    // Newer proposals node 25 (V8) is known to ship, so a probe that silently
    // returned false would be caught here rather than hidden as "unsupported".
    expect(f.exceptionsFinal).toBe(true);
    expect(f.jsStringBuiltins).toBe(true);
    expect(f.gc).toBe(true);
    expect(f.tailCall).toBe(true);
  });
});
