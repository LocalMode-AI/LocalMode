import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createMockRerankerModel } from '@localmode/core';
import type { RerankerModel, DoRerankOptions, DoRerankResult } from '@localmode/core';
import { useRerank } from '../src/hooks/use-rerank.js';
import { toAppError } from '../src/core/app-error.js';

/**
 * Reranker mock whose doRerank() promises are resolved manually by the test,
 * so in-flight overlap (re-execute aborts the previous call) can be driven
 * deterministically. Records every options object the core rerank() call
 * path delivers to the model boundary.
 */
function createDeferredRerankerModel() {
  const calls: DoRerankOptions[] = [];
  const deferreds: Array<{
    resolve: (value: DoRerankResult) => void;
    reject: (reason?: unknown) => void;
  }> = [];
  const model: RerankerModel = {
    modelId: 'mock:deferred-reranker',
    provider: 'mock',
    doRerank(options) {
      calls.push(options);
      return new Promise<DoRerankResult>((resolve, reject) => {
        deferreds.push({ resolve, reject });
      });
    },
  };
  return { model, calls, deferreds };
}

describe('useRerank', () => {
  const documents = [
    'Cooking pasta requires boiling water',
    'Machine learning is a type of artificial intelligence',
    'Deep learning is a subset of machine learning',
  ];

  it('reranks documents — results sorted by score descending with original index/text', async () => {
    const model = createMockRerankerModel({ scores: [0.1, 0.95, 0.6] });
    const { result } = renderHook(() => useRerank({ model }));

    await act(async () => {
      await result.current.execute({ query: 'What is machine learning?', documents });
    });

    expect(result.current.data).not.toBeNull();
    const results = result.current.data!.results;
    expect(results).toHaveLength(3);
    // Sorted by score descending with original index/text preserved
    expect(results[0]).toMatchObject({ index: 1, score: 0.95, text: documents[1] });
    expect(results[1]).toMatchObject({ index: 2, score: 0.6, text: documents[2] });
    expect(results[2]).toMatchObject({ index: 0, score: 0.1, text: documents[0] });
    expect(results[0].score).toBeGreaterThan(results[1].score);
    expect(results[1].score).toBeGreaterThan(results[2].score);
    // Usage and response metadata populated
    expect(result.current.data!.usage.inputTokens).toBeGreaterThan(0);
    expect(result.current.data!.response.modelId).toBe('mock:reranker');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    // Query/documents fidelity at the model boundary
    expect(model.calls).toHaveLength(1);
    expect(model.calls[0].query).toBe('What is machine learning?');
    expect(model.calls[0].documents).toEqual(documents);
    expect(model.calls[0].abortSignal).toBeInstanceOf(AbortSignal);
  });

  it('forwards hook-level topK to the model boundary when the call omits it', async () => {
    const model = createMockRerankerModel();
    const { result } = renderHook(() => useRerank({ model, topK: 2 }));

    await act(async () => {
      await result.current.execute({ query: 'q', documents });
    });

    expect(model.calls).toHaveLength(1);
    expect(model.calls[0].topK).toBe(2);
    expect(result.current.data!.results).toHaveLength(2);
  });

  it('per-call topK overrides hook-level topK', async () => {
    const model = createMockRerankerModel();
    const { result } = renderHook(() => useRerank({ model, topK: 5 }));

    await act(async () => {
      await result.current.execute({ query: 'q', documents, topK: 2 });
    });

    expect(model.calls).toHaveLength(1);
    expect(model.calls[0].topK).toBe(2);
    expect(result.current.data!.results.length).toBeLessThanOrEqual(2);
    expect(result.current.data!.results).toHaveLength(2);
  });

  it('ranks all documents when neither hook-level nor per-call topK is set', async () => {
    const model = createMockRerankerModel();
    const { result } = renderHook(() => useRerank({ model }));

    await act(async () => {
      await result.current.execute({ query: 'q', documents });
    });

    expect(model.calls).toHaveLength(1);
    expect(model.calls[0].topK).toBeUndefined();
    expect(result.current.data!.results).toHaveLength(documents.length);
  });

  it('cancel() mid-flight aborts at the model boundary silently — no error, data unchanged', async () => {
    const quickModel = createMockRerankerModel({ scores: [0.9] });
    const delayedModel = createMockRerankerModel({ delayMs: 60_000 });

    const { result, rerender } = renderHook(
      ({ model }: { model: RerankerModel }) => useRerank({ model }),
      { initialProps: { model: quickModel } }
    );

    // Seed data with a completed rerank so we can assert it survives the abort
    await act(async () => {
      await result.current.execute({ query: 'seed', documents: ['seed doc'] });
    });
    expect(result.current.data!.results[0].text).toBe('seed doc');
    const seededData = result.current.data;

    // Start a delayed rerank and cancel while it is in flight
    rerender({ model: delayedModel });
    act(() => {
      void result.current.execute({ query: 'q', documents });
    });
    await vi.waitFor(() => expect(delayedModel.calls).toHaveLength(1));
    expect(result.current.isLoading).toBe(true);

    act(() => {
      result.current.cancel();
    });
    // Let the mock's abort rejection propagate through core rerank()
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // Abort signal fired at the model boundary
    expect(delayedModel.calls[0].abortSignal?.aborted).toBe(true);
    // Silent abort: no error surfaced, loading finished, data unchanged
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBe(seededData);
  });

  it('cancel() returns to idle immediately even when the model cannot observe the abort', async () => {
    // Real-provider scenario (found in real-Chrome verification): wllama's
    // createRerank is a single non-interruptible in-worker call — it neither
    // rejects on abort nor checks the signal mid-compute; it RESOLVES later.
    // Cancel must return the UI to idle immediately, not when (or worse,
    // never after) the abandoned compute drains.
    const { model, calls, deferreds } = createDeferredRerankerModel();
    const { result } = renderHook(() => useRerank({ model }));

    act(() => {
      void result.current.execute({ query: 'q', documents });
    });
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    expect(result.current.isLoading).toBe(true);

    act(() => {
      result.current.cancel();
    });

    // Idle immediately after cancel — nothing has settled yet
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.data).toBeNull();

    // The abandoned compute finally resolves — its result must be discarded
    await act(async () => {
      deferreds[0].resolve({
        results: [{ index: 0, score: 0.9, text: documents[0] }],
        usage: { inputTokens: 2, durationMs: 1 },
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it("a superseded call's late rejection does not clobber the replacement's loading state", async () => {
    const { model, calls, deferreds } = createDeferredRerankerModel();
    const { result } = renderHook(() => useRerank({ model }));

    act(() => {
      void result.current.execute({ query: 'first', documents: ['first doc'] });
    });
    await vi.waitFor(() => expect(calls).toHaveLength(1));

    // Supersede: aborts the first call, second goes in flight
    act(() => {
      void result.current.execute({ query: 'second', documents: ['second doc'] });
    });
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    expect(result.current.isLoading).toBe(true);

    // The first call's rejection arrives late (e.g. its abort surfaced as a
    // wrapped plain Error) while the second is still running
    await act(async () => {
      deferreds[0].reject(new Error('Reranking was cancelled'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    // Still loading — the superseded call must not flip the replacement to idle
    expect(result.current.isLoading).toBe(true);
    expect(result.current.error).toBeNull();

    await act(async () => {
      deferreds[1].resolve({
        results: [{ index: 0, score: 0.7, text: 'second doc' }],
        usage: { inputTokens: 2, durationMs: 1 },
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(result.current.data!.results[0].text).toBe('second doc');
    expect(result.current.isLoading).toBe(false);
  });

  it('re-execute aborts the previous in-flight call — only the second result lands', async () => {
    const { model, calls, deferreds } = createDeferredRerankerModel();
    const { result } = renderHook(() => useRerank({ model }));

    act(() => {
      void result.current.execute({ query: 'first', documents: ['first doc'] });
    });
    await vi.waitFor(() => expect(calls).toHaveLength(1));

    act(() => {
      void result.current.execute({ query: 'second', documents: ['second doc'] });
    });
    await vi.waitFor(() => expect(calls).toHaveLength(2));

    // The first call's signal is aborted; the second stays live
    expect(calls[0].abortSignal?.aborted).toBe(true);
    expect(calls[1].abortSignal?.aborted).toBe(false);

    // Resolve the first (aborted) call late — its result must be discarded
    await act(async () => {
      deferreds[0].resolve({
        results: [{ index: 0, score: 0.9, text: 'first doc' }],
        usage: { inputTokens: 2, durationMs: 1 },
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(result.current.data).toBeNull();

    // Resolve the second call — its result lands
    await act(async () => {
      deferreds[1].resolve({
        results: [{ index: 0, score: 0.7, text: 'second doc' }],
        usage: { inputTokens: 2, durationMs: 1 },
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.data!.results[0].text).toBe('second doc');
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('surfaces model failures as an Error compatible with toAppError; reset() clears state', async () => {
    const quickModel = createMockRerankerModel({ scores: [0.8] });
    const failingModel: RerankerModel = {
      modelId: 'mock:failing-reranker',
      provider: 'mock',
      async doRerank() {
        throw new Error('GPU exploded');
      },
    };

    const { result, rerender } = renderHook(
      ({ model }: { model: RerankerModel }) => useRerank({ model }),
      { initialProps: { model: quickModel } }
    );

    // Seed data so we can assert the failure leaves it unchanged
    await act(async () => {
      await result.current.execute({ query: 'seed', documents: ['seed doc'] });
    });
    const seededData = result.current.data;
    expect(seededData).not.toBeNull();

    rerender({ model: failingModel });
    await act(async () => {
      // Must not throw to the caller — failures land in error state
      await result.current.execute({ query: 'q', documents });
    });

    expect(result.current.error).toBeInstanceOf(Error);
    // Core rerank() retries (default maxRetries: 2) before giving up
    expect(result.current.error!.message).toBe('Reranking failed after 3 attempts');
    const appError = toAppError(result.current.error);
    expect(appError).not.toBeNull();
    expect(appError!.message).toBe('Reranking failed after 3 attempts');
    expect(appError!.recoverable).toBe(true);
    // Data unchanged, loading finished
    expect(result.current.data).toBe(seededData);
    expect(result.current.isLoading).toBe(false);

    act(() => {
      result.current.reset();
    });
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });
});
