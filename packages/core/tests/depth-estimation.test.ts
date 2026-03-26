import { describe, it, expect } from 'vitest';
import {
  estimateDepth,
  setGlobalDepthEstimationProvider,
  createMockDepthEstimationModel,
} from '../src/index.js';

describe('estimateDepth()', () => {
  it('returns { depthMap, usage, response }', async () => {
    const model = createMockDepthEstimationModel();
    const image = new Blob([new Uint8Array(100)], { type: 'image/png' });

    const result = await estimateDepth({ model, image });

    expect(result.depthMap).toBeInstanceOf(Float32Array);
    expect(result.depthMap.length).toBe(224 * 224);
    expect(result.usage).toHaveProperty('durationMs');
    expect(result.response).toHaveProperty('modelId');
    expect(result.response).toHaveProperty('timestamp');
    expect(result.response.timestamp).toBeInstanceOf(Date);
  });

  it('respects custom dimensions', async () => {
    const model = createMockDepthEstimationModel({ width: 640, height: 480 });
    const image = new Blob([new Uint8Array(100)], { type: 'image/png' });

    const result = await estimateDepth({ model, image });

    expect(result.depthMap).toBeInstanceOf(Float32Array);
    expect(result.depthMap.length).toBe(640 * 480);
  });

  it('supports AbortSignal', async () => {
    const model = createMockDepthEstimationModel();
    const image = new Blob([new Uint8Array(100)], { type: 'image/png' });
    const controller = new AbortController();
    controller.abort();

    await expect(
      estimateDepth({ model, image, abortSignal: controller.signal })
    ).rejects.toThrow();
  });

  it('retries on transient failure', async () => {
    let callCount = 0;

    const model = {
      modelId: 'test:flaky-depth',
      provider: 'test',
      async doEstimate(options: {
        images: unknown[];
        abortSignal?: AbortSignal;
      }) {
        callCount++;
        if (callCount === 1) {
          throw new Error('Transient failure');
        }
        return {
          depthMaps: [new Float32Array(100)],
          usage: { durationMs: 10 },
        };
      },
    };

    const image = new Blob([new Uint8Array(100)], { type: 'image/png' });
    const result = await estimateDepth({ model, image });

    expect(result.depthMap).toBeInstanceOf(Float32Array);
    expect(callCount).toBe(2);
  });

  it('throws after max retries exhausted', async () => {
    const model = {
      modelId: 'test:always-fails',
      provider: 'test',
      async doEstimate() {
        throw new Error('Persistent failure');
      },
    };

    const image = new Blob([new Uint8Array(100)], { type: 'image/png' });

    await expect(estimateDepth({ model, image, maxRetries: 1 })).rejects.toThrow(
      'Persistent failure'
    );
  });

  it('throws when using string model ID without global provider', async () => {
    setGlobalDepthEstimationProvider(null);

    const image = new Blob([new Uint8Array(100)], { type: 'image/png' });

    await expect(estimateDepth({ model: 'some-model', image })).rejects.toThrow(
      'No global depth estimation provider configured'
    );
  });

  it('resolves string model ID with global provider', async () => {
    const mockModel = createMockDepthEstimationModel();
    setGlobalDepthEstimationProvider(() => mockModel);

    const image = new Blob([new Uint8Array(100)], { type: 'image/png' });
    const result = await estimateDepth({ model: 'any-model-id', image });

    expect(result.depthMap).toBeInstanceOf(Float32Array);

    // Clean up
    setGlobalDepthEstimationProvider(null);
  });
});
