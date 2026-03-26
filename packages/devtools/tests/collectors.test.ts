/**
 * @file collectors.test.ts
 * @description Tests for individual DevTools collectors
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createEventEmitter } from '@localmode/core';
import type { VectorDBEvents, EmbeddingEvents } from '@localmode/core';
import { createBridge, resetEventIdCounter } from '../src/bridge.js';
import { createPipelineCollector } from '../src/collectors/pipeline.js';
import { registerQueueCollector } from '../src/collectors/queue.js';

// Mock globalEventBus for event collector tests
vi.mock('@localmode/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@localmode/core')>();
  const mockBus = actual.createEventEmitter<VectorDBEvents & EmbeddingEvents>();
  return {
    ...actual,
    globalEventBus: mockBus,
    getStorageQuota: vi.fn().mockResolvedValue({
      usedBytes: 100_000,
      quotaBytes: 1_000_000,
      percentUsed: 10,
      isPersisted: false,
      availableBytes: 900_000,
    }),
    detectCapabilities: vi.fn().mockResolvedValue({
      browser: { name: 'Chrome', version: '138' },
      device: { type: 'desktop' },
      hardware: { cores: 8, memory: 16 },
      features: { webgpu: true, wasm: true },
      storage: {},
    }),
  };
});

describe('Pipeline collector', () => {
  beforeEach(() => {
    resetEventIdCounter();
  });

  it('tracks pipeline progress', () => {
    const { bridge, notify } = createBridge(500);
    const onProgress = createPipelineCollector('test-pipeline', bridge, notify);

    onProgress({ completed: 0, total: 3, currentStep: 'chunk' });
    expect(bridge.pipelines['test-pipeline']).toBeDefined();
    expect(bridge.pipelines['test-pipeline'].currentStep).toBe('chunk');
    expect(bridge.pipelines['test-pipeline'].status).toBe('running');

    onProgress({ completed: 3, total: 3, currentStep: '' });
    expect(bridge.pipelines['test-pipeline'].status).toBe('completed');
    expect(bridge.pipelines['test-pipeline'].durationMs).toBeDefined();
  });
});

describe('Queue collector', () => {
  it('tracks queue stats', () => {
    const { bridge, notify } = createBridge(500);
    const listeners = new Map<string, Set<(stats: unknown) => void>>();

    const mockQueue = {
      add: vi.fn(),
      on: vi.fn((event: string, callback: (stats: unknown) => void) => {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event)!.add(callback);
        return () => { listeners.get(event)?.delete(callback); };
      }),
      clear: vi.fn(),
      destroy: vi.fn(),
      stats: { pending: 0, active: 0, completed: 0, failed: 0, avgLatencyMs: 0 },
    };

    const cleanup = registerQueueCollector('test-queue', mockQueue, bridge, notify);

    // Simulate stats emission
    const statsCallbacks = listeners.get('stats');
    if (statsCallbacks) {
      for (const cb of statsCallbacks) {
        cb({ pending: 2, active: 1, completed: 5, failed: 0, avgLatencyMs: 42 });
      }
    }

    expect(bridge.queues['test-queue']).toBeDefined();
    expect(bridge.queues['test-queue'].pending).toBe(2);
    expect(bridge.queues['test-queue'].avgLatencyMs).toBe(42);

    cleanup();
  });
});

describe('Storage collector', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetEventIdCounter();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('polls storage quota at interval', async () => {
    const { startStorageCollector } = await import('../src/collectors/storage.js');
    const { bridge, notify } = createBridge(500);

    const cleanup = startStorageCollector(bridge, notify, 1000);

    // First poll is immediate
    await vi.advanceTimersByTimeAsync(0);
    expect(bridge.storage).not.toBeNull();
    expect(bridge.storage?.usedBytes).toBe(100_000);

    cleanup();
  });
});

describe('Capabilities collector', () => {
  beforeEach(() => {
    resetEventIdCounter();
  });

  it('detects capabilities once', async () => {
    const { startCapabilitiesCollector } = await import('../src/collectors/capabilities.js');
    const { bridge, notify } = createBridge(500);

    const cleanup = startCapabilitiesCollector(bridge, notify);

    // Wait for the async detectCapabilities to resolve
    await new Promise((r) => setTimeout(r, 10));

    expect(bridge.capabilities).not.toBeNull();
    expect(bridge.capabilities?.features).toBeDefined();

    cleanup();
  });
});

describe('Event collector', () => {
  beforeEach(() => {
    resetEventIdCounter();
  });

  it('captures VectorDB events and aggregates stats', async () => {
    const { globalEventBus } = await import('@localmode/core');
    const { startEventCollector } = await import('../src/collectors/events.js');
    const { bridge, notify, eventBuffer } = createBridge(500);

    const cleanup = startEventCollector(bridge, eventBuffer, notify);

    // Emit a VectorDB add event
    (globalEventBus as ReturnType<typeof createEventEmitter>).emit('add', { id: 'doc-1', collection: 'test' });

    expect(eventBuffer.size).toBe(1);
    expect(eventBuffer.getAll()[0].type).toBe('vectordb:add');
    expect(bridge.vectorDBs['test']).toBeDefined();
    expect(bridge.vectorDBs['test'].totalAdds).toBe(1);

    // Emit a search event
    (globalEventBus as ReturnType<typeof createEventEmitter>).emit('search', { resultsCount: 5, k: 10, durationMs: 42 });

    expect(bridge.vectorDBs['default'].totalSearches).toBe(1);
    expect(bridge.vectorDBs['default'].avgSearchDurationMs).toBe(42);

    cleanup();
  });

  it('captures model load events', async () => {
    const { globalEventBus } = await import('@localmode/core');
    const { startEventCollector } = await import('../src/collectors/events.js');
    const { bridge, notify, eventBuffer } = createBridge(500);

    const cleanup = startEventCollector(bridge, eventBuffer, notify);

    (globalEventBus as ReturnType<typeof createEventEmitter>).emit('modelLoad', {
      modelId: 'Xenova/bge-small-en-v1.5',
      durationMs: 3200,
    });

    expect(bridge.models['Xenova/bge-small-en-v1.5']).toBeDefined();
    expect(bridge.models['Xenova/bge-small-en-v1.5'].status).toBe('loaded');
    expect(bridge.models['Xenova/bge-small-en-v1.5'].loadDurationMs).toBe(3200);

    cleanup();
  });
});
