/**
 * @file enable-disable.test.ts
 * @description Tests for enableDevTools, disableDevTools, isDevToolsEnabled
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock core modules
vi.mock('@localmode/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@localmode/core')>();
  return {
    ...actual,
    globalEventBus: actual.createEventEmitter(),
    getStorageQuota: vi.fn().mockResolvedValue(null),
    detectCapabilities: vi.fn().mockResolvedValue({
      browser: {},
      device: {},
      hardware: {},
      features: {},
      storage: {},
    }),
  };
});

describe('enableDevTools / disableDevTools', () => {
  beforeEach(async () => {
    // Reset module state between tests
    const mod = await import('../src/index.js');
    if (mod.isDevToolsEnabled()) {
      mod.disableDevTools();
    }
    delete (globalThis as Record<string, unknown>).__LOCALMODE_DEVTOOLS__;
  });

  it('creates bridge on window when enabled', async () => {
    const { enableDevTools, isDevToolsEnabled } = await import('../src/index.js');

    enableDevTools();

    expect(isDevToolsEnabled()).toBe(true);
    expect((globalThis as Record<string, unknown>).__LOCALMODE_DEVTOOLS__).toBeDefined();
  });

  it('is idempotent on double call', async () => {
    const { enableDevTools } = await import('../src/index.js');

    enableDevTools();
    const bridge1 = (globalThis as Record<string, unknown>).__LOCALMODE_DEVTOOLS__;

    enableDevTools();
    const bridge2 = (globalThis as Record<string, unknown>).__LOCALMODE_DEVTOOLS__;

    // Same bridge object (not recreated)
    expect(bridge1).toBe(bridge2);
  });

  it('disableDevTools sets enabled to false', async () => {
    const { enableDevTools, disableDevTools, isDevToolsEnabled } = await import('../src/index.js');

    enableDevTools();
    expect(isDevToolsEnabled()).toBe(true);

    disableDevTools();
    expect(isDevToolsEnabled()).toBe(false);
  });

  it('disableDevTools is a no-op when not enabled', async () => {
    const { disableDevTools, isDevToolsEnabled } = await import('../src/index.js');

    expect(() => disableDevTools()).not.toThrow();
    expect(isDevToolsEnabled()).toBe(false);
  });

  it('accepts custom options', async () => {
    const { enableDevTools, disableDevTools } = await import('../src/index.js');

    enableDevTools({ eventBufferSize: 100, storagePollingIntervalMs: 10000 });

    const bridge = (globalThis as Record<string, unknown>).__LOCALMODE_DEVTOOLS__ as Record<string, unknown>;
    expect(bridge).toBeDefined();
    expect(bridge.version).toBe(1);

    disableDevTools();
  });

  it('registerQueue returns no-op when not enabled', async () => {
    const { registerQueue } = await import('../src/index.js');

    const unsub = registerQueue('test', {} as any);
    expect(typeof unsub).toBe('function');
    unsub(); // should not throw
  });

  it('createDevToolsProgressCallback returns no-op when not enabled', async () => {
    const { createDevToolsProgressCallback } = await import('../src/index.js');

    const cb = createDevToolsProgressCallback('test');
    expect(typeof cb).toBe('function');
    cb({ completed: 0, total: 1, currentStep: 'a' }); // should not throw
  });
});
