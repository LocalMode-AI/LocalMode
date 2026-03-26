/**
 * @fileoverview Tests for useCalibrateThreshold hook
 */

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createMockEmbeddingModel } from '@localmode/core';
import { useCalibrateThreshold } from '../src/hooks/use-calibrate-threshold.js';

describe('useCalibrateThreshold', () => {
  it('returns initial inert state', () => {
    const model = createMockEmbeddingModel();
    const { result } = renderHook(() => useCalibrateThreshold({ model }));

    expect(result.current.calibration).toBeNull();
    expect(result.current.isCalibrating).toBe(false);
    expect(result.current.error).toBeNull();
    expect(typeof result.current.calibrate).toBe('function');
    expect(typeof result.current.cancel).toBe('function');
    expect(typeof result.current.clearError).toBe('function');
  });

  it('calibrates successfully and returns ThresholdCalibration', async () => {
    const model = createMockEmbeddingModel({ dimensions: 8 });
    const { result } = renderHook(() => useCalibrateThreshold({ model }));

    await act(async () => {
      await result.current.calibrate(['cat', 'dog', 'car']);
    });

    expect(result.current.calibration).not.toBeNull();
    expect(result.current.calibration?.threshold).toBeDefined();
    expect(result.current.calibration?.percentile).toBe(90);
    expect(result.current.calibration?.sampleSize).toBe(3);
    expect(result.current.calibration?.distribution.count).toBe(3); // 3 choose 2
    expect(result.current.isCalibrating).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('supports custom percentile', async () => {
    const model = createMockEmbeddingModel({ dimensions: 8 });
    const { result } = renderHook(() =>
      useCalibrateThreshold({ model, percentile: 50 })
    );

    await act(async () => {
      await result.current.calibrate(['a', 'b', 'c', 'd']);
    });

    expect(result.current.calibration?.percentile).toBe(50);
  });

  it('sets error state on validation failure', async () => {
    const model = createMockEmbeddingModel();
    const { result } = renderHook(() => useCalibrateThreshold({ model }));

    await act(async () => {
      await result.current.calibrate(['single']); // Less than 2 samples
    });

    expect(result.current.error).not.toBeNull();
    expect(result.current.error?.message).toContain('at least 2');
    expect(result.current.calibration).toBeNull();
    expect(result.current.isCalibrating).toBe(false);
  });

  it('clears error state', async () => {
    const model = createMockEmbeddingModel();
    const { result } = renderHook(() => useCalibrateThreshold({ model }));

    // Trigger an error
    await act(async () => {
      await result.current.calibrate([]);
    });
    expect(result.current.error).not.toBeNull();

    // Clear the error
    act(() => {
      result.current.clearError();
    });
    expect(result.current.error).toBeNull();
  });

  it('cancels in-flight calibration', async () => {
    const model = createMockEmbeddingModel({ dimensions: 8, delay: 500 });
    const { result } = renderHook(() => useCalibrateThreshold({ model }));

    // Start calibration (don't await)
    let promise: Promise<unknown>;
    act(() => {
      promise = result.current.calibrate(['a', 'b', 'c']);
    });

    // Cancel immediately
    act(() => {
      result.current.cancel();
    });

    await act(async () => {
      await promise!;
    });

    // Should not have set calibration (was cancelled)
    expect(result.current.isCalibrating).toBe(false);
    expect(result.current.error).toBeNull(); // Abort errors are silent
  });
});
