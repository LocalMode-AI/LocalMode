/**
 * @file use-model-load.test.ts
 * @description Tests for the useModelLoad hook: cross-provider progress
 * normalization, warmup-driven status machine, singleton registry, SSR.
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import { useModelLoad, type AnyLoadProgress } from '../src/utilities/use-model-load.js';

/** Unique key per test — the registry is module-level and never cleared. */
let keyCounter = 0;
function uniqueKey(label: string) {
  keyCounter += 1;
  return `use-model-load-test:${label}:${keyCounter}`;
}

/** A promise with externally-controlled settle. */
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Fake provider model factory that captures the hook-bound onProgress. */
function fakeProvider(modelId: string) {
  const model = { modelId, provider: 'fake' };
  let onProgress: ((p: AnyLoadProgress) => void) | null = null;
  const create = vi.fn((cb: (p: AnyLoadProgress) => void) => {
    onProgress = cb;
    return model;
  });
  const emit = (p: AnyLoadProgress) => {
    if (!onProgress) throw new Error('create() was never invoked — no onProgress bound');
    act(() => {
      onProgress!(p);
    });
  };
  return { model, create, emit };
}

describe('useModelLoad', () => {
  it('starts idle with empty progress, creates the model once on mount', async () => {
    const key = uniqueKey('initial');
    const { model, create } = fakeProvider(key);

    const { result, rerender } = renderHook(() =>
      useModelLoad({ key, create, warmup: async () => {} })
    );

    expect(result.current.status).toBe('idle');
    expect(result.current.progress).toBe(0);
    expect(result.current.perFile.size).toBe(0);
    expect(result.current.cached).toBeUndefined();
    expect(result.current.error).toBeNull();
    expect(result.current.progressValue).toEqual({ percent: 0 });

    // The model is created in a mount effect (first client use), exactly once.
    await waitFor(() => expect(result.current.model).toBe(model));
    rerender();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('aggregates transformers-style per-file events: fraction = Σloaded/Σtotal', async () => {
    const key = uniqueKey('per-file');
    const { create, emit } = fakeProvider(key);
    const warmup = deferred();

    const { result } = renderHook(() =>
      useModelLoad({ key, create, warmup: () => warmup.promise })
    );

    let loadPromise!: Promise<void>;
    act(() => {
      loadPromise = result.current.load();
    });
    expect(result.current.status).toBe('loading');

    // initiate carries no byte counts — no progress change
    emit({ status: 'initiate', file: 'a.onnx', name: 'model' });
    expect(result.current.progress).toBe(0);

    emit({ status: 'progress', file: 'a.onnx', progress: 50, loaded: 50, total: 100 });
    expect(result.current.progress).toBeCloseTo(0.5);

    emit({ status: 'progress', file: 'b.onnx', progress: 75, loaded: 300, total: 400 });
    // Σloaded/Σtotal = 350/500 = 0.7 — NOT an average of per-file percents
    // (avg of 50% and 75% would be 0.625)
    expect(result.current.progress).toBeCloseTo(0.7);
    expect(result.current.perFile.get('a.onnx')).toEqual({ loaded: 50, total: 100 });
    expect(result.current.perFile.get('b.onnx')).toEqual({ loaded: 300, total: 400 });
    expect(result.current.progressValue.loaded).toBe(350);
    expect(result.current.progressValue.total).toBe(500);
    expect(result.current.progressValue.percent).toBeCloseTo(0.7); // 0–1 fraction per DownloadProgressValue contract

    // per-file 'done' without byte counts leaves the aggregate untouched
    emit({ status: 'done', file: 'a.onnx' });
    expect(result.current.progress).toBeCloseTo(0.7);

    await act(async () => {
      warmup.resolve();
      await loadPromise;
    });
    expect(result.current.status).toBe('ready');
    expect(result.current.progress).toBe(1);
  });

  it('normalizes webllm-style aggregated percent events', async () => {
    const key = uniqueKey('webllm-percent');
    const { create, emit } = fakeProvider(key);
    const warmup = deferred();

    const { result } = renderHook(() =>
      useModelLoad({ key, create, warmup: () => warmup.promise })
    );

    act(() => {
      void result.current.load();
    });

    emit({ status: 'progress', progress: 42 });
    expect(result.current.progress).toBeCloseTo(0.42);
    expect(result.current.perFile.size).toBe(0);
    expect(result.current.progressValue.loaded).toBeUndefined();
    expect(result.current.progressValue.total).toBeUndefined();
    expect(result.current.progressValue.percent).toBeCloseTo(0.42);
  });

  it('normalizes wllama/litert-style single-file byte events into a synthetic entry', async () => {
    const key = uniqueKey('single-file');
    const { create, emit } = fakeProvider(key);
    const warmup = deferred();

    const { result } = renderHook(() =>
      useModelLoad({ key, create, warmup: () => warmup.promise })
    );

    act(() => {
      void result.current.load();
    });

    // wllama emits both percent and bytes; the byte path must win (richer data)
    emit({ status: 'download', progress: 25, loaded: 25, total: 100 });
    expect(result.current.progress).toBeCloseTo(0.25);
    expect(result.current.perFile.size).toBe(1);
    expect(Array.from(result.current.perFile.values())[0]).toEqual({ loaded: 25, total: 100 });
    expect(result.current.progressValue.loaded).toBe(25);
    expect(result.current.progressValue.total).toBe(100);

    emit({ status: 'download', loaded: 80, total: 100 });
    expect(result.current.progress).toBeCloseTo(0.8);
    expect(result.current.perFile.size).toBe(1);
  });

  it("'ready' without file sets fraction=1 but NEVER drives status — warmup does", async () => {
    const key = uniqueKey('ready-event');
    const { create, emit } = fakeProvider(key);
    const warmup = deferred();

    const { result } = renderHook(() =>
      useModelLoad({ key, create, warmup: () => warmup.promise })
    );

    let loadPromise!: Promise<void>;
    act(() => {
      loadPromise = result.current.load();
    });

    // Provider claims 'ready' (e.g. wllama after download) but the warmup
    // inference has not completed — status must remain 'loading'.
    emit({ status: 'ready' });
    expect(result.current.progress).toBe(1);
    expect(result.current.status).toBe('loading');

    await act(async () => {
      warmup.resolve();
      await loadPromise;
    });
    expect(result.current.status).toBe('ready');
  });

  it('warmup rejection drives status to error, load() rejects, and a retry can recover', async () => {
    const key = uniqueKey('error-retry');
    const { create } = fakeProvider(key);
    const failure = new Error('GPU out of memory');
    const warmup = vi
      .fn<(model: unknown) => Promise<void>>()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useModelLoad({ key, create, warmup }));

    await act(async () => {
      await expect(result.current.load()).rejects.toThrow('GPU out of memory');
    });
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe(failure);

    // Retry after error starts a fresh load and recovers.
    await act(async () => {
      await result.current.load();
    });
    expect(result.current.status).toBe('ready');
    expect(result.current.error).toBeNull();
    expect(warmup).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('concurrent load() calls join the in-flight load (warmup runs once)', async () => {
    const key = uniqueKey('concurrent');
    const { create } = fakeProvider(key);
    const gate = deferred();
    const warmup = vi.fn(() => gate.promise);

    const { result } = renderHook(() => useModelLoad({ key, create, warmup }));

    let p1!: Promise<void>;
    let p2!: Promise<void>;
    act(() => {
      p1 = result.current.load();
      p2 = result.current.load();
    });

    await act(async () => {
      gate.resolve();
      await Promise.all([p1, p2]);
    });

    expect(warmup).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('ready');

    // load() after 'ready' resolves immediately without another warmup.
    await act(async () => {
      await result.current.load();
    });
    expect(warmup).toHaveBeenCalledTimes(1);
  });

  it('registry survives unmount/remount mid-download: progress and model persist', async () => {
    const key = uniqueKey('remount');
    const first = fakeProvider(key);
    const warmup = deferred();

    const { result, unmount } = renderHook(() =>
      useModelLoad({ key, create: first.create, warmup: () => warmup.promise })
    );

    let loadPromise!: Promise<void>;
    act(() => {
      loadPromise = result.current.load();
    });
    first.emit({ status: 'download', loaded: 50, total: 100 });
    expect(result.current.progress).toBeCloseTo(0.5);

    unmount();

    // Remount with a NEW create — the registry entry must win: same model,
    // same in-flight load, progress intact, no second construction.
    const second = fakeProvider(key);
    const { result: result2 } = renderHook(() =>
      useModelLoad({ key, create: second.create, warmup: () => warmup.promise })
    );

    expect(result2.current.status).toBe('loading');
    expect(result2.current.progress).toBeCloseTo(0.5);
    expect(result2.current.model).toBe(first.model);
    expect(second.create).not.toHaveBeenCalled();
    expect(first.create).toHaveBeenCalledTimes(1);

    // Progress events through the ORIGINAL binding still reach the remounted hook.
    first.emit({ status: 'download', loaded: 90, total: 100 });
    expect(result2.current.progress).toBeCloseTo(0.9);

    await act(async () => {
      warmup.resolve();
      await loadPromise;
    });
    expect(result2.current.status).toBe('ready');
  });

  describe('monotonic published progress', () => {
    it('clamps published progress to be non-decreasing when Σtotal grows mid-download', async () => {
      const key = uniqueKey('monotonic-clamp');
      const { create, emit } = fakeProvider(key);
      const warmup = deferred();

      const { result } = renderHook(() =>
        useModelLoad({ key, create, warmup: () => warmup.promise })
      );

      let loadPromise!: Promise<void>;
      act(() => {
        loadPromise = result.current.load();
      });

      emit({ status: 'progress', file: 'a.onnx', loaded: 2, total: 100 });
      expect(result.current.progress).toBeCloseTo(0.02);

      // b.onnx is discovered mid-download: Σtotal jumps 100 → 300 and the raw
      // Σloaded/Σtotal dips to 3/300 = 0.01. Published progress must hold at
      // the high-water mark instead of moving backwards.
      emit({ status: 'progress', file: 'b.onnx', loaded: 1, total: 200 });
      expect(result.current.progress).toBeCloseTo(0.02);
      expect(result.current.progressValue.percent).toBeCloseTo(0.02);

      // The underlying byte counts stay raw/truthful — only the derived
      // aggregate is clamped.
      expect(result.current.perFile.get('b.onnx')).toEqual({ loaded: 1, total: 200 });
      expect(result.current.progressValue.loaded).toBe(3);
      expect(result.current.progressValue.total).toBe(300);

      // Once raw progress passes the high-water mark, publishing resumes.
      emit({ status: 'progress', file: 'b.onnx', loaded: 148, total: 200 });
      expect(result.current.progress).toBeCloseTo(0.5); // (2 + 148) / 300

      await act(async () => {
        warmup.resolve();
        await loadPromise;
      });
      expect(result.current.progress).toBe(1);
    });

    it('resets the high-water mark on a new load() attempt after an error', async () => {
      const key = uniqueKey('monotonic-reset');
      const { create, emit } = fakeProvider(key);
      const w1 = deferred();
      const w2 = deferred();
      const warmup = vi
        .fn<(model: unknown) => Promise<unknown>>()
        .mockImplementationOnce(() => w1.promise)
        .mockImplementationOnce(() => w2.promise);

      const { result } = renderHook(() => useModelLoad({ key, create, warmup }));

      let p1!: Promise<void>;
      act(() => {
        p1 = result.current.load();
      });
      emit({ status: 'progress', file: 'a.onnx', loaded: 60, total: 100 });
      expect(result.current.progress).toBeCloseTo(0.6);

      await act(async () => {
        w1.reject(new Error('network drop'));
        await expect(p1).rejects.toThrow('network drop');
      });
      expect(result.current.status).toBe('error');

      // Retry: the clamp must not pin the new attempt to the failed attempt's
      // peak — a fresh (lower) raw value publishes as-is.
      let p2!: Promise<void>;
      act(() => {
        p2 = result.current.load();
      });
      emit({ status: 'progress', file: 'a.onnx', loaded: 10, total: 100 });
      expect(result.current.progress).toBeCloseTo(0.1);

      await act(async () => {
        w2.resolve(undefined);
        await p2;
      });
      expect(result.current.status).toBe('ready');
      expect(result.current.progress).toBe(1);
    });
  });

  it('SSR render is inert: idle snapshot, create never invoked', () => {
    const key = uniqueKey('ssr');
    const create = vi.fn(() => ({ modelId: key, provider: 'fake' }));

    function Probe() {
      const { status, progress, model, perFile } = useModelLoad({
        key,
        create,
        warmup: async () => {},
        autoLoad: true,
      });
      return createElement(
        'div',
        null,
        `${status}|${progress}|${model === null ? 'no-model' : 'model'}|${perFile.size}`
      );
    }

    // renderToString uses getServerSnapshot and runs no effects — the real
    // server path for this hook.
    const html = renderToString(createElement(Probe));
    expect(html).toContain('idle|0|no-model|0');
    expect(create).not.toHaveBeenCalled();
  });

  it('evaluates isCached() once when load() starts and exposes it on cached + progressValue', async () => {
    const key = uniqueKey('is-cached');
    const { create } = fakeProvider(key);
    const isCached = vi.fn(async () => true);

    const { result } = renderHook(() =>
      useModelLoad({ key, create, warmup: async () => {}, isCached })
    );

    expect(result.current.cached).toBeUndefined();

    await act(async () => {
      await result.current.load();
    });

    await waitFor(() => expect(result.current.cached).toBe(true));
    expect(result.current.progressValue.cached).toBe(true);
    expect(isCached).toHaveBeenCalledTimes(1);

    // load() after ready does not re-probe.
    await act(async () => {
      await result.current.load();
    });
    expect(isCached).toHaveBeenCalledTimes(1);
  });

  it('autoLoad starts the load on mount without calling load()', async () => {
    const key = uniqueKey('auto-load');
    const { create } = fakeProvider(key);
    const warmup = vi.fn(async () => {});

    const { result } = renderHook(() => useModelLoad({ key, create, warmup, autoLoad: true }));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(warmup).toHaveBeenCalledTimes(1);
  });

  describe('default warmup (feature detection)', () => {
    it('runs generateText({ prompt: "Hi", maxTokens: 1 }) for doGenerate models', async () => {
      const key = uniqueKey('warmup-generate');
      const doGenerate = vi.fn(async () => ({
        text: 'ok',
        finishReason: 'stop' as const,
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      }));
      const languageModel = {
        modelId: key,
        provider: 'fake',
        contextLength: 2048,
        doGenerate,
      };

      const { result } = renderHook(() =>
        useModelLoad({ key, create: () => languageModel })
      );

      await act(async () => {
        await result.current.load();
      });

      expect(result.current.status).toBe('ready');
      expect(doGenerate).toHaveBeenCalledTimes(1);
      expect(doGenerate.mock.calls[0]?.[0]).toMatchObject({ prompt: 'Hi', maxTokens: 1 });
    });

    it('runs embed({ value: "." }) for doEmbed models', async () => {
      const key = uniqueKey('warmup-embed');
      const doEmbed = vi.fn(async (options: { values: string[] }) => ({
        embeddings: options.values.map(() => new Float32Array(3)),
        usage: { tokens: 1 },
        response: { modelId: key, timestamp: new Date() },
      }));
      const embeddingModel = {
        modelId: key,
        provider: 'fake',
        dimensions: 3,
        maxEmbeddingsPerCall: 10,
        supportsParallelCalls: true,
        doEmbed,
      };

      const { result } = renderHook(() =>
        useModelLoad({ key, create: () => embeddingModel })
      );

      await act(async () => {
        await result.current.load();
      });

      expect(result.current.status).toBe('ready');
      expect(doEmbed).toHaveBeenCalledTimes(1);
      expect(doEmbed.mock.calls[0]?.[0]?.values).toEqual(['.']);
    });

    it('throws a descriptive error for models with neither doGenerate nor doEmbed', async () => {
      const key = uniqueKey('warmup-unknown');
      const oddModel = { modelId: key, provider: 'fake', transcribeAudio: async () => {} };

      const { result } = renderHook(() => useModelLoad({ key, create: () => oddModel }));

      await act(async () => {
        await expect(result.current.load()).rejects.toThrow(/warmup/);
      });

      expect(result.current.status).toBe('error');
      expect(result.current.error?.message).toContain('doGenerate');
      expect(result.current.error?.message).toContain('doEmbed');
      expect(result.current.error?.message).toContain('warmup');
    });
  });
});
