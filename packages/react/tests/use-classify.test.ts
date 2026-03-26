import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createMockClassificationModel, createMockNERModel } from '@localmode/core';
import { useClassify } from '../src/hooks/use-classify.js';
import { useExtractEntities } from '../src/hooks/use-extract-entities.js';

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
