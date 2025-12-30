/**
 * Vision P2 Feature Tests
 *
 * Tests for segmentImage(), detectObjects(), extractImageFeatures(), imageToImage().
 *
 * @packageDocumentation
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  segmentImage,
  detectObjects,
  extractImageFeatures,
  imageToImage,
  setGlobalSegmentationProvider,
  setGlobalObjectDetectionProvider,
  setGlobalImageFeatureProvider,
  setGlobalImageToImageProvider,
} from '../src/vision/index.js';
import {
  createMockSegmentationModel,
  createMockObjectDetectionModel,
  createMockImageFeatureModel,
  createMockImageToImageModel,
} from '../src/testing/index.js';

describe('segmentImage()', () => {
  afterEach(() => {
    setGlobalSegmentationProvider(() => {
      throw new Error('No global provider');
    });
  });

  it('should segment image into masks', async () => {
    const model = createMockSegmentationModel();

    const result = await segmentImage({
      model,
      image: new Blob(['test'], { type: 'image/png' }),
    });

    expect(result.masks.length).toBeGreaterThan(0);
    expect(result.masks[0].label).toBeDefined();
    expect(result.masks[0].mask).toBeInstanceOf(Uint8Array);
    expect(result.masks[0].score).toBeGreaterThan(0);
  });

  it('should support image path input', async () => {
    const model = createMockSegmentationModel();

    const result = await segmentImage({
      model,
      image: 'test.png',
    });

    expect(result.masks.length).toBeGreaterThan(0);
  });

  it('should support abort signal', async () => {
    const model = createMockSegmentationModel({ delay: 100 });
    const controller = new AbortController();

    const promise = segmentImage({
      model,
      image: 'test.png',
      abortSignal: controller.signal,
    });

    controller.abort();

    await expect(promise).rejects.toThrow();
  });

  it('should use global provider with string model ID', async () => {
    setGlobalSegmentationProvider(() => createMockSegmentationModel());

    const result = await segmentImage({
      model: 'test-model' as any,
      image: 'test.png',
    });

    expect(result.masks.length).toBeGreaterThan(0);
  });
});

describe('detectObjects()', () => {
  afterEach(() => {
    setGlobalObjectDetectionProvider(() => {
      throw new Error('No global provider');
    });
  });

  it('should detect objects in image', async () => {
    const model = createMockObjectDetectionModel();

    const result = await detectObjects({
      model,
      image: new Blob(['test'], { type: 'image/png' }),
    });

    expect(result.objects.length).toBeGreaterThan(0);
    expect(result.objects[0].label).toBeDefined();
    expect(result.objects[0].score).toBeGreaterThan(0);
    expect(result.objects[0].box).toBeDefined();
    expect(result.objects[0].box.x).toBeDefined();
    expect(result.objects[0].box.y).toBeDefined();
    expect(result.objects[0].box.width).toBeDefined();
    expect(result.objects[0].box.height).toBeDefined();
  });

  it('should respect threshold option', async () => {
    const model = createMockObjectDetectionModel();

    const result = await detectObjects({
      model,
      image: 'test.png',
      threshold: 0.8,
    });

    expect(result.objects.length).toBeGreaterThan(0);
  });

  it('should support abort signal', async () => {
    const model = createMockObjectDetectionModel({ delay: 100 });
    const controller = new AbortController();

    const promise = detectObjects({
      model,
      image: 'test.png',
      abortSignal: controller.signal,
    });

    controller.abort();

    await expect(promise).rejects.toThrow();
  });

  it('should use global provider with string model ID', async () => {
    setGlobalObjectDetectionProvider(() =>
      createMockObjectDetectionModel()
    );

    const result = await detectObjects({
      model: 'test-model' as any,
      image: 'test.png',
    });

    expect(result.objects.length).toBeGreaterThan(0);
  });
});

describe('extractImageFeatures()', () => {
  afterEach(() => {
    setGlobalImageFeatureProvider(() => {
      throw new Error('No global provider');
    });
  });

  it('should extract feature vector from image', async () => {
    const model = createMockImageFeatureModel({ dimensions: 512 });

    const result = await extractImageFeatures({
      model,
      image: new Blob(['test'], { type: 'image/png' }),
    });

    expect(result.features).toBeInstanceOf(Float32Array);
    expect(result.features.length).toBe(512);
  });

  it('should support image path input', async () => {
    const model = createMockImageFeatureModel();

    const result = await extractImageFeatures({
      model,
      image: 'test.png',
    });

    expect(result.features).toBeInstanceOf(Float32Array);
  });

  it('should support abort signal', async () => {
    const model = createMockImageFeatureModel({ delay: 100 });
    const controller = new AbortController();

    const promise = extractImageFeatures({
      model,
      image: 'test.png',
      abortSignal: controller.signal,
    });

    controller.abort();

    await expect(promise).rejects.toThrow();
  });

  it('should use global provider with string model ID', async () => {
    setGlobalImageFeatureProvider(() =>
      createMockImageFeatureModel({ dimensions: 768 })
    );

    const result = await extractImageFeatures({
      model: 'test-model' as any,
      image: 'test.png',
    });

    expect(result.features.length).toBe(768);
  });
});

describe('imageToImage()', () => {
  afterEach(() => {
    setGlobalImageToImageProvider(() => {
      throw new Error('No global provider');
    });
  });

  it('should transform image', async () => {
    const model = createMockImageToImageModel();

    const result = await imageToImage({
      model,
      image: new Blob(['test'], { type: 'image/png' }),
    });

    expect(result.image).toBeInstanceOf(Blob);
  });

  it('should support scale option', async () => {
    const model = createMockImageToImageModel();

    const result = await imageToImage({
      model,
      image: 'test.png',
      scale: 2,
    });

    expect(result.image).toBeInstanceOf(Blob);
  });

  it('should support abort signal', async () => {
    const model = createMockImageToImageModel({ delay: 100 });
    const controller = new AbortController();

    const promise = imageToImage({
      model,
      image: 'test.png',
      abortSignal: controller.signal,
    });

    controller.abort();

    await expect(promise).rejects.toThrow();
  });

  it('should use global provider with string model ID', async () => {
    setGlobalImageToImageProvider(() => createMockImageToImageModel());

    const result = await imageToImage({
      model: 'test-model' as any,
      image: 'test.png',
    });

    expect(result.image).toBeInstanceOf(Blob);
  });
});

