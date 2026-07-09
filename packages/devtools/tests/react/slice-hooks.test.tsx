/**
 * @file slice-hooks.test.tsx
 * @description Task 5.1 — slice-hook behavior against the REAL bridge created
 * by the public `enableDevTools()`, with real collectors running:
 * - a real `createInferenceQueue` from `@localmode/core` executing real tasks
 *   through `registerQueue()` drives `useDevToolsQueueStats()`;
 * - a real `createPipeline().run()` driven through the public
 *   `createDevToolsProgressCallback()` drives `useDevToolsPipelineRuns()`;
 * - real `globalEventBus` emissions (the documented production integration
 *   path — app code emits vectordb/embedding events, as showcase llm-chat
 *   does for `modelLoad`) drive `useDevToolsEvents()` /
 *   `useDevToolsModelCache()` / `useDevToolsVectorDBs()`.
 *
 * No bridge mocks: the only shim sits BELOW the claimed boundary (see the
 * navigator.storage paper-trail comment).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { createInferenceQueue, createPipeline, globalEventBus } from '@localmode/core';
import {
  disableDevTools,
  registerQueue,
  createDevToolsProgressCallback,
} from '../../src/index.js';
import {
  useDevToolsQueueStats,
  useDevToolsPipelineRuns,
  useDevToolsEvents,
  useDevToolsModelCache,
  useDevToolsVectorDBs,
  useDevToolsStorage,
  useDevToolsCapabilities,
} from '../../src/react/index.js';

import { enableDevToolsSettled, SHIM_STORAGE_ESTIMATE } from './test-utils.js';

describe('slice hooks against the real bridge', () => {
  beforeEach(() => {
    delete (window as Record<string, unknown>).__LOCALMODE_DEVTOOLS__;
  });

  afterEach(async () => {
    // This afterEach runs BEFORE testing-library's auto-cleanup unmounts the
    // test's hooks, and disableDevTools() emits the lifecycle signal those
    // still-mounted hooks observe — so wrap it in act().
    await act(async () => {
      disableDevTools();
    });
    delete (window as Record<string, unknown>).__LOCALMODE_DEVTOOLS__;
  });

  it('useDevToolsQueueStats() updates from a real InferenceQueue executing real tasks', async () => {
    await enableDevToolsSettled();
    const queue = createInferenceQueue({ concurrency: 1 });
    const cleanup = registerQueue('embedding', queue);

    const { result } = renderHook(() => useDevToolsQueueStats());

    // Initial registration snapshot is visible at first render
    expect(result.current['embedding']).toBeDefined();
    expect(result.current['embedding'].completed).toBe(0);

    // Execute three real (tiny, deterministic) tasks through the real queue
    await act(async () => {
      await Promise.all([
        queue.add(async () => 'a'),
        queue.add(async () => 'b'),
        queue.add(async () => 'c'),
      ]);
    });

    await waitFor(() => {
      expect(result.current['embedding'].completed).toBe(3);
    });
    expect(result.current['embedding'].failed).toBe(0);
    expect(result.current['embedding'].pending).toBe(0);
    expect(result.current['embedding'].active).toBe(0);

    cleanup();
    queue.destroy();
  });

  it('useDevToolsPipelineRuns() shows running→completed with durationMs from a real pipeline run', async () => {
    await enableDevToolsSettled();
    const { result } = renderHook(() => useDevToolsPipelineRuns());

    // Gate the first step so the 'running' state is deterministically observable
    let releaseStep!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseStep = resolve;
    });

    const pipeline = createPipeline('rag-ingest')
      .step('chunk', async (input: string) => {
        await gate;
        return input.split(' ');
      })
      .step('count', async (words: string[]) => words.length)
      .build<string, number>();

    let runPromise!: Promise<unknown>;
    await act(async () => {
      runPromise = pipeline.run('hello devtools hooks', {
        onProgress: createDevToolsProgressCallback('rag-ingest'),
      });
      // Let the first onProgress notification flush a render
      await Promise.resolve();
    });

    expect(result.current['rag-ingest']).toBeDefined();
    expect(result.current['rag-ingest'].status).toBe('running');
    expect(result.current['rag-ingest'].currentStep).toBe('chunk');
    expect(result.current['rag-ingest'].total).toBe(2);
    expect(result.current['rag-ingest'].durationMs).toBeUndefined();

    await act(async () => {
      releaseStep();
      await runPromise;
    });

    expect(result.current['rag-ingest'].status).toBe('completed');
    expect(result.current['rag-ingest'].completed).toBe(2);
    expect(typeof result.current['rag-ingest'].durationMs).toBe('number');
    expect(result.current['rag-ingest'].durationMs!).toBeGreaterThanOrEqual(0);
  });

  it('useDevToolsEvents() / useDevToolsModelCache() / useDevToolsVectorDBs() update from real globalEventBus emissions', async () => {
    await enableDevToolsSettled();

    const { result: events } = renderHook(() => useDevToolsEvents());
    const { result: models } = renderHook(() => useDevToolsModelCache());
    const { result: vectorDBs } = renderHook(() => useDevToolsVectorDBs());

    expect(events.current).toEqual([]);
    expect(models.current).toEqual({});
    expect(vectorDBs.current).toEqual({});

    // Production integration path: app code emits on the real globalEventBus
    // (as showcase llm-chat emits `modelLoad` after a real model load).
    await act(async () => {
      globalEventBus.emit('modelLoad', { modelId: 'Xenova/bge-small-en-v1.5', durationMs: 1234 });
      globalEventBus.emit('add', { id: 'doc-1', collection: 'notes' });
      globalEventBus.emit('search', { collection: 'notes', resultsCount: 3, k: 5, durationMs: 12 });
    });

    // Events appended in bridge-buffer order
    expect(events.current.map((e) => e.type)).toEqual([
      'embedding:modelLoad',
      'vectordb:add',
      'vectordb:search',
    ]);

    // Model cache aggregate
    expect(models.current['Xenova/bge-small-en-v1.5']).toBeDefined();
    expect(models.current['Xenova/bge-small-en-v1.5'].status).toBe('loaded');
    expect(models.current['Xenova/bge-small-en-v1.5'].loadDurationMs).toBe(1234);

    // VectorDB aggregate
    expect(vectorDBs.current['notes']).toBeDefined();
    expect(vectorDBs.current['notes'].totalAdds).toBe(1);
    expect(vectorDBs.current['notes'].totalSearches).toBe(1);
    expect(vectorDBs.current['notes'].avgSearchDurationMs).toBe(12);
  });

  it('useDevToolsStorage() returns the polled quota snapshot', async () => {
    await enableDevToolsSettled();
    const { result } = renderHook(() => useDevToolsStorage());

    await waitFor(() => {
      expect(result.current).not.toBeNull();
    });
    expect(result.current!.usedBytes).toBe(SHIM_STORAGE_ESTIMATE.usage);
    expect(result.current!.quotaBytes).toBe(SHIM_STORAGE_ESTIMATE.quota);
    expect(result.current!.percentUsed).toBe(25);
    expect(result.current!.availableBytes).toBe(
      SHIM_STORAGE_ESTIMATE.quota - SHIM_STORAGE_ESTIMATE.usage
    );
    expect(result.current!.isPersisted).toBe(false);
  });

  it('useDevToolsCapabilities() returns the detected capabilities snapshot', async () => {
    await enableDevToolsSettled();
    const { result } = renderHook(() => useDevToolsCapabilities());

    await waitFor(() => {
      expect(result.current).not.toBeNull();
    });
    // Real detectCapabilities() ran in jsdom: assert on real feature flags
    expect(result.current!.features).toBeDefined();
    expect(typeof result.current!.features.wasm).toBe('boolean');
    expect(result.current!.browser).toBeDefined();
    expect(result.current!.device).toBeDefined();
    expect(result.current!.hardware).toBeDefined();
  });
});
