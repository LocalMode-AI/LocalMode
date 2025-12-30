/**
 * OCR Domain Tests
 *
 * Tests for extractText() function.
 *
 * @packageDocumentation
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  extractText,
  setGlobalOCRProvider,
} from '../src/ocr/index.js';
import { createMockOCRModel } from '../src/testing/index.js';

describe('extractText()', () => {
  afterEach(() => {
    setGlobalOCRProvider(() => {
      throw new Error('No global provider');
    });
  });

  it('should extract text from image', async () => {
    const model = createMockOCRModel({
      mockText: 'Extracted text from image.',
    });

    const result = await extractText({
      model,
      image: new Blob(['test'], { type: 'image/png' }),
    });

    expect(result.text).toBe('Extracted text from image.');
    expect(result.usage.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should include text regions when detectRegions is true', async () => {
    const model = createMockOCRModel();

    const result = await extractText({
      model,
      image: 'test.png',
      detectRegions: true,
    });

    expect(result.regions).toBeDefined();
    expect(result.regions!.length).toBeGreaterThan(0);
    expect(result.regions![0].text).toBeDefined();
    expect(result.regions![0].confidence).toBeGreaterThan(0);
  });

  it('should include bounding boxes in regions', async () => {
    const model = createMockOCRModel();

    const result = await extractText({
      model,
      image: 'test.png',
      detectRegions: true,
    });

    expect(result.regions).toBeDefined();
    expect(result.regions![0].bbox).toBeDefined();
    expect(result.regions![0].bbox!.x).toBeDefined();
    expect(result.regions![0].bbox!.y).toBeDefined();
    expect(result.regions![0].bbox!.width).toBeDefined();
    expect(result.regions![0].bbox!.height).toBeDefined();
  });

  it('should support languages option', async () => {
    const model = createMockOCRModel();

    const result = await extractText({
      model,
      image: 'test.png',
      languages: ['en'],
    });

    expect(result.text).toBeDefined();
  });

  it('should handle extraction without regions', async () => {
    const model = createMockOCRModel();

    const result = await extractText({
      model,
      image: 'test.png',
    });

    expect(result.text).toBeDefined();
    // Regions may or may not be present depending on detectRegions option
  });

  it('should support abort signal', async () => {
    const model = createMockOCRModel({ delay: 100 });
    const controller = new AbortController();

    const promise = extractText({
      model,
      image: 'test.png',
      abortSignal: controller.signal,
    });

    controller.abort();

    await expect(promise).rejects.toThrow();
  });

  it('should use global provider with string model ID', async () => {
    setGlobalOCRProvider(() =>
      createMockOCRModel({ mockText: 'Global OCR text.' })
    );

    const result = await extractText({
      model: 'test-model' as any,
      image: 'test.png',
    });

    expect(result.text).toBe('Global OCR text.');
  });
});

