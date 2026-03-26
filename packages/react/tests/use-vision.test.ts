import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  createMockImageCaptionModel,
  createMockObjectDetectionModel,
  createMockSegmentationModel,
} from '@localmode/core';
import { useCaptionImage } from '../src/hooks/use-caption-image.js';
import { useDetectObjects } from '../src/hooks/use-detect-objects.js';
import { useSegmentImage } from '../src/hooks/use-segment-image.js';

const MOCK_IMAGE = 'data:image/png;base64,iVBOR';

describe('useCaptionImage', () => {
  it('captions an image', async () => {
    const model = createMockImageCaptionModel({ mockCaption: 'A test image' });
    const { result } = renderHook(() => useCaptionImage({ model }));

    await act(async () => {
      await result.current.execute(MOCK_IMAGE);
    });

    expect(result.current.data).not.toBeNull();
    expect(result.current.data?.caption).toBeDefined();
    expect(result.current.isLoading).toBe(false);
  });
});

describe('useDetectObjects', () => {
  it('detects objects in an image', async () => {
    const model = createMockObjectDetectionModel();
    const { result } = renderHook(() => useDetectObjects({ model }));

    await act(async () => {
      await result.current.execute(MOCK_IMAGE);
    });

    expect(result.current.data).not.toBeNull();
    expect(result.current.data?.objects).toBeDefined();
    expect(result.current.data?.objects.length).toBeGreaterThan(0);
    expect(result.current.isLoading).toBe(false);
  });
});

describe('useSegmentImage', () => {
  it('segments an image', async () => {
    const model = createMockSegmentationModel();
    const { result } = renderHook(() => useSegmentImage({ model }));

    await act(async () => {
      await result.current.execute(MOCK_IMAGE);
    });

    expect(result.current.data).not.toBeNull();
    expect(result.current.data?.masks).toBeDefined();
    expect(result.current.isLoading).toBe(false);
  });
});
