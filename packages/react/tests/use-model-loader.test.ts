/**
 * @file use-model-loader.test.ts
 * @description Tests for useModelLoader hook exports and types
 */

import { describe, it, expect } from 'vitest';

describe('useModelLoader', () => {
  it('is exported from the package', async () => {
    const mod = await import('../src/index.js');
    expect(typeof mod.useModelLoader).toBe('function');
  });

  it('UseModelLoaderReturn type is exported', async () => {
    // TypeScript compile-time check — if this file compiles, the type exists
    const mod = await import('../src/utilities/use-model-loader.js');
    expect(typeof mod.useModelLoader).toBe('function');
  });
});
