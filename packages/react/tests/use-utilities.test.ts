import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useNetworkStatus } from '../src/utilities/use-network-status.js';
import { useModelStatus } from '../src/utilities/use-model-status.js';

describe('useNetworkStatus', () => {
  it('returns online status', () => {
    const { result } = renderHook(() => useNetworkStatus());

    // In test environment, navigator.onLine is typically true
    expect(typeof result.current.isOnline).toBe('boolean');
    expect(result.current.isOffline).toBe(!result.current.isOnline);
  });
});

describe('useModelStatus', () => {
  it('returns ready for a model instance', () => {
    const mockModel = { modelId: 'test:model', provider: 'test' };
    const { result } = renderHook(() => useModelStatus(mockModel));

    // Model instances are optimistically marked ready
    expect(result.current.isReady).toBe(true);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });
});
