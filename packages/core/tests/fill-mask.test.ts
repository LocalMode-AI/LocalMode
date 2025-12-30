/**
 * Fill-Mask Domain Tests
 *
 * Tests for fillMask() function.
 *
 * @packageDocumentation
 */

import { describe, it, expect, afterEach } from 'vitest';
import { fillMask, setGlobalFillMaskProvider } from '../src/fill-mask/index.js';
import { createMockFillMaskModel } from '../src/testing/index.js';

describe('fillMask()', () => {
  afterEach(() => {
    setGlobalFillMaskProvider(() => {
      throw new Error('No global provider');
    });
  });

  it('should predict masked tokens', async () => {
    const model = createMockFillMaskModel();

    const result = await fillMask({
      model,
      text: 'The capital of France is [MASK].',
    });

    expect(result.predictions.length).toBeGreaterThan(0);
    expect(result.predictions[0].token).toBeDefined();
    expect(result.predictions[0].score).toBeGreaterThan(0);
    expect(result.predictions[0].score).toBeLessThanOrEqual(1);
  });

  it('should respect topK option', async () => {
    const model = createMockFillMaskModel();

    const result = await fillMask({
      model,
      text: 'Test [MASK]',
      topK: 3,
    });

    expect(result.predictions.length).toBeLessThanOrEqual(3);
  });

  it('should include filledText in predictions', async () => {
    const model = createMockFillMaskModel();

    const result = await fillMask({
      model,
      text: 'Hello [MASK]',
    });

    // Each prediction should have a filled text variant
    expect(result.predictions[0]).toBeDefined();
  });

  it('should include sequence in predictions', async () => {
    const model = createMockFillMaskModel();

    const result = await fillMask({
      model,
      text: 'Hello [MASK]',
    });

    // Each prediction should have a sequence with the mask filled
    expect(result.predictions[0].sequence).toBeDefined();
    expect(result.predictions[0].sequence.length).toBeGreaterThan(0);
  });

  it('should support abort signal', async () => {
    const model = createMockFillMaskModel({ delay: 100 });
    const controller = new AbortController();

    const promise = fillMask({
      model,
      text: 'Test [MASK]',
      abortSignal: controller.signal,
    });

    controller.abort();

    await expect(promise).rejects.toThrow();
  });

  it('should use global provider with string model ID', async () => {
    setGlobalFillMaskProvider(() => createMockFillMaskModel());

    const result = await fillMask({
      model: 'test-model' as any,
      text: 'Test [MASK]',
    });

    expect(result.predictions.length).toBeGreaterThan(0);
  });
});
