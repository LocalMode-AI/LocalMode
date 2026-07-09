import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createMockClassificationModel, createMockNERModel } from '@localmode/core';
import type { ZeroShotClassificationModel, DoClassifyZeroShotOptions } from '@localmode/core';
import { useClassify } from '../src/hooks/use-classify.js';
import { useExtractEntities } from '../src/hooks/use-extract-entities.js';
import { useClassifyZeroShot } from '../src/hooks/use-classify-zero-shot.js';

/**
 * Zero-shot mock that records every options object the core classifyZeroShot()
 * call path delivers to the model boundary, so tests can verify multiLabel /
 * hypothesisTemplate plumbing end to end.
 */
function createCapturingZeroShotModel() {
  const calls: DoClassifyZeroShotOptions[] = [];
  const model: ZeroShotClassificationModel = {
    modelId: 'mock:zero-shot',
    provider: 'mock',
    async doClassifyZeroShot(options) {
      calls.push(options);
      return {
        results: options.texts.map(() => ({
          labels: [...options.candidateLabels],
          scores: options.candidateLabels.map((_, i) => 1 - i * 0.1),
        })),
        usage: { inputTokens: 3, durationMs: 1 },
      };
    },
  };
  return { model, calls };
}

describe('useClassify', () => {
  it('classifies text', async () => {
    const model = createMockClassificationModel();
    const { result } = renderHook(() => useClassify({ model }));

    await act(async () => {
      await result.current.execute('I love this product!');
    });

    expect(result.current.data).not.toBeNull();
    expect(result.current.data?.label).toBeDefined();
    expect(result.current.data?.score).toBeGreaterThan(0);
    expect(result.current.isLoading).toBe(false);
  });
});

describe('useExtractEntities', () => {
  it('extracts named entities', async () => {
    const model = createMockNERModel();
    const { result } = renderHook(() => useExtractEntities({ model }));

    await act(async () => {
      await result.current.execute('John works at Google in Seattle');
    });

    expect(result.current.data).not.toBeNull();
    expect(result.current.data?.entities).toBeDefined();
    expect(result.current.data?.entities.length).toBeGreaterThan(0);
    expect(result.current.isLoading).toBe(false);
  });
});

describe('useClassifyZeroShot', () => {
  it('classifies text into candidate labels', async () => {
    const { model, calls } = createCapturingZeroShotModel();
    const { result } = renderHook(() => useClassifyZeroShot({ model }));

    await act(async () => {
      await result.current.execute({
        text: 'I just bought a Tesla',
        candidateLabels: ['automotive', 'finance'],
      });
    });

    expect(result.current.data).not.toBeNull();
    expect(result.current.data?.labels).toEqual(['automotive', 'finance']);
    expect(result.current.data?.scores[0]).toBeGreaterThan(result.current.data!.scores[1]);
    expect(result.current.isLoading).toBe(false);

    // Without hook-level options, nothing extra reaches the model boundary
    expect(calls).toHaveLength(1);
    expect(calls[0].multiLabel).toBeUndefined();
    expect(calls[0].hypothesisTemplate).toBeUndefined();
  });

  it('forwards hook-level multiLabel and hypothesisTemplate to the model boundary', async () => {
    const { model, calls } = createCapturingZeroShotModel();
    const { result } = renderHook(() =>
      useClassifyZeroShot({
        model,
        multiLabel: true,
        hypothesisTemplate: 'This text is about {}.',
      })
    );

    await act(async () => {
      await result.current.execute({
        text: 'AI photography on the new phone',
        candidateLabels: ['technology', 'photography'],
      });
    });

    expect(result.current.error).toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0].multiLabel).toBe(true);
    expect(calls[0].hypothesisTemplate).toBe('This text is about {}.');
    expect(calls[0].texts).toEqual(['AI photography on the new phone']);
    expect(calls[0].candidateLabels).toEqual(['technology', 'photography']);
  });

  it('per-call options override hook-level options', async () => {
    const { model, calls } = createCapturingZeroShotModel();
    const { result } = renderHook(() =>
      useClassifyZeroShot({
        model,
        multiLabel: true,
        hypothesisTemplate: 'Hook-level {}.',
      })
    );

    await act(async () => {
      await result.current.execute({
        text: 'override me',
        candidateLabels: ['a', 'b'],
        multiLabel: false,
        hypothesisTemplate: 'Per-call {}.',
      });
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].multiLabel).toBe(false);
    expect(calls[0].hypothesisTemplate).toBe('Per-call {}.');
  });

  it('per-call hypothesisTemplate works without a hook-level value', async () => {
    const { model, calls } = createCapturingZeroShotModel();
    const { result } = renderHook(() => useClassifyZeroShot({ model }));

    await act(async () => {
      await result.current.execute({
        text: 'standalone per-call',
        candidateLabels: ['x', 'y'],
        hypothesisTemplate: 'Only per-call {}.',
      });
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].hypothesisTemplate).toBe('Only per-call {}.');
  });
});
