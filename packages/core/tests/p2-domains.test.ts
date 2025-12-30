/**
 * P2 Domain Tests
 *
 * Tests for all P2 domain functions and mock models.
 *
 * @packageDocumentation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  // Mock models
  createMockLanguageModel,
  createMockTranslationModel,
  createMockSummarizationModel,
  createMockFillMaskModel,
  createMockQuestionAnsweringModel,
  createMockOCRModel,
  createMockDocumentQAModel,
  createMockSegmentationModel,
  createMockObjectDetectionModel,
  createMockImageFeatureModel,
  createMockImageToImageModel,
  createMockTextToSpeechModel,
  createMockImageCaptionModel,
  // Test utilities
  createTestVector,
} from '../src/testing/index.js';

// ═══════════════════════════════════════════════════════════════
// MOCK MODEL TESTS
// ═══════════════════════════════════════════════════════════════

describe('P2 Mock Models', () => {
  describe('createMockLanguageModel()', () => {
    it('should generate text', async () => {
      const model = createMockLanguageModel();

      const result = await model.doGenerate({
        prompt: 'Hello, how are you?',
      });

      expect(result.text).toBeDefined();
      expect(result.text.length).toBeGreaterThan(0);
      expect(result.finishReason).toBe('stop');
      expect(result.usage.inputTokens).toBeGreaterThan(0);
      expect(result.usage.outputTokens).toBeGreaterThan(0);
      expect(result.usage.durationMs).toBeGreaterThan(0);
    });

    it('should stream text', async () => {
      const model = createMockLanguageModel();

      const tokens: string[] = [];
      for await (const chunk of model.doStream!({ prompt: 'Hello' })) {
        tokens.push(chunk.text);
      }

      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens.join('')).toContain('This is a mock response');
    });

    it('should use custom response', async () => {
      const model = createMockLanguageModel({
        mockResponse: 'Custom test response.',
      });

      const result = await model.doGenerate({ prompt: 'Test' });

      expect(result.text).toBe('Custom test response.');
    });
  });

  describe('createMockTranslationModel()', () => {
    it('should translate text', async () => {
      const model = createMockTranslationModel();

      const result = await model.doTranslate({
        texts: ['Hello world'],
        targetLanguage: 'de',
      });

      expect(result.translations[0]).toContain('[translated]');
      expect(result.translations[0]).toContain('Hello world');
      expect(result.usage.inputTokens).toBeGreaterThan(0);
    });
  });

  describe('createMockSummarizationModel()', () => {
    it('should summarize text', async () => {
      const model = createMockSummarizationModel();

      const result = await model.doSummarize({
        texts: ['This is a long text. It has multiple sentences. We need to summarize it.'],
      });

      expect(result.summaries).toBeDefined();
      expect(result.summaries.length).toBeGreaterThan(0);
      expect(result.summaries[0].length).toBeGreaterThan(0);
      expect(result.usage.inputTokens).toBeGreaterThan(0);
    });

    it('should use custom summary', async () => {
      const model = createMockSummarizationModel({
        mockSummary: 'Custom summary.',
      });

      const result = await model.doSummarize({ texts: ['Long text here.'] });

      expect(result.summaries[0]).toBe('Custom summary.');
    });
  });

  describe('createMockFillMaskModel()', () => {
    it('should predict masked tokens', async () => {
      const model = createMockFillMaskModel();

      const result = await model.doFillMask({
        texts: ['The capital of France is [MASK].'],
      });

      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results[0][0].token).toBeDefined();
      expect(result.results[0][0].score).toBeGreaterThan(0);
    });

    it('should respect topK', async () => {
      const model = createMockFillMaskModel();

      const result = await model.doFillMask({
        texts: ['Test [MASK]'],
        topK: 2,
      });

      expect(result.results[0].length).toBeLessThanOrEqual(2);
    });
  });

  describe('createMockQuestionAnsweringModel()', () => {
    it('should answer questions', async () => {
      const model = createMockQuestionAnsweringModel();

      const result = await model.doAnswer({
        questions: [{
          question: 'What is the capital of France?',
          context: 'Paris is the capital of France. It is a beautiful city.',
        }],
      });

      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results[0].length).toBeGreaterThan(0);
      expect(result.results[0][0].answer).toBeDefined();
      expect(result.results[0][0].score).toBeGreaterThan(0);
      expect(result.results[0][0].start).toBeDefined();
      expect(result.results[0][0].end).toBeDefined();
    });
  });

  describe('createMockOCRModel()', () => {
    it('should extract text from images', async () => {
      const model = createMockOCRModel();

      const result = await model.doOCR({
        images: [new Blob(['test'], { type: 'image/png' })],
        detectRegions: true,
      });

      expect(result.texts).toBeDefined();
      expect(result.texts.length).toBeGreaterThan(0);
      expect(result.texts[0].length).toBeGreaterThan(0);
      expect(result.regions).toBeDefined();
      expect(result.usage.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should use custom text', async () => {
      const model = createMockOCRModel({
        mockText: 'Custom OCR text.',
      });

      const result = await model.doOCR({
        images: ['test.png'],
      });

      expect(result.texts[0]).toBe('Custom OCR text.');
    });
  });

  describe('createMockDocumentQAModel()', () => {
    it('should answer questions about documents', async () => {
      const model = createMockDocumentQAModel();

      const result = await model.doAskDocument({
        document: 'Invoice total: $100.00',
        questions: ['What is the total?'],
      });

      expect(result.answers.length).toBeGreaterThan(0);
      expect(result.answers[0].answer).toBeDefined();
    });

    it('should answer questions about tables', async () => {
      const model = createMockDocumentQAModel();

      const result = await model.doAskTable({
        table: { headers: ['Name', 'Price'], rows: [['Widget', '10']] },
        questions: ['What is the price?'],
      });

      expect(result.answers.length).toBeGreaterThan(0);
    });
  });

  describe('createMockSegmentationModel()', () => {
    it('should segment images', async () => {
      const model = createMockSegmentationModel();

      const result = await model.doSegment({
        images: [new Blob(['test'], { type: 'image/png' })],
      });

      expect(result.results.length).toBe(1);
      expect(result.results[0].masks.length).toBeGreaterThan(0);
      expect(result.results[0].masks[0].label).toBeDefined();
      expect(result.results[0].masks[0].mask).toBeInstanceOf(Uint8Array);
    });
  });

  describe('createMockObjectDetectionModel()', () => {
    it('should detect objects', async () => {
      const model = createMockObjectDetectionModel();

      const result = await model.doDetect({
        images: [new Blob(['test'], { type: 'image/png' })],
      });

      expect(result.results.length).toBe(1);
      expect(result.results[0].objects.length).toBeGreaterThan(0);
      expect(result.results[0].objects[0].label).toBeDefined();
      expect(result.results[0].objects[0].box).toBeDefined();
      expect(result.results[0].objects[0].box.x).toBeDefined();
    });
  });

  describe('createMockImageFeatureModel()', () => {
    it('should extract features', async () => {
      const model = createMockImageFeatureModel();

      const result = await model.doExtract({
        images: [new Blob(['test'], { type: 'image/png' })],
      });

      expect(result.features.length).toBe(1);
      expect(result.features[0]).toBeInstanceOf(Float32Array);
      expect(result.features[0].length).toBe(model.dimensions);
    });

    it('should use custom dimensions', async () => {
      const model = createMockImageFeatureModel({ dimensions: 768 });

      const result = await model.doExtract({
        images: ['test.png'],
      });

      expect(result.features[0].length).toBe(768);
    });
  });

  describe('createMockImageToImageModel()', () => {
    it('should transform images', async () => {
      const model = createMockImageToImageModel();

      const result = await model.doTransform({
        images: [new Blob(['test'], { type: 'image/png' })],
      });

      expect(result.images.length).toBe(1);
      expect(result.images[0]).toBeInstanceOf(Blob);
    });
  });

  describe('createMockTextToSpeechModel()', () => {
    it('should synthesize speech', async () => {
      const model = createMockTextToSpeechModel();

      const result = await model.doSynthesize({
        text: 'Hello world',
      });

      expect(result.audio).toBeInstanceOf(Blob);
      expect(result.audio.size).toBeGreaterThan(0);
      expect(result.sampleRate).toBe(model.sampleRate);
      expect(result.usage.characterCount).toBe(11); // "Hello world"
    });
  });

  describe('createMockImageCaptionModel()', () => {
    it('should caption images', async () => {
      const model = createMockImageCaptionModel();

      const result = await model.doCaption({
        images: [new Blob(['test'], { type: 'image/png' })],
      });

      expect(result.captions.length).toBe(1);
      expect(result.captions[0]).toBeDefined();
      expect(result.captions[0].length).toBeGreaterThan(0);
    });

    it('should use custom caption', async () => {
      const model = createMockImageCaptionModel({
        mockCaption: 'Custom image caption.',
      });

      const result = await model.doCaption({
        images: ['test.png'],
      });

      expect(result.captions[0]).toBe('Custom image caption.');
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// ABORT SIGNAL TESTS
// ═══════════════════════════════════════════════════════════════

describe('AbortSignal Support', () => {
  it('should abort language model generation', async () => {
    const model = createMockLanguageModel({ delay: 100 });
    const controller = new AbortController();

    const promise = model.doGenerate({
      prompt: 'Test',
      abortSignal: controller.signal,
    });

    controller.abort();

    await expect(promise).rejects.toThrow();
  });

  it('should abort translation', async () => {
    const model = createMockTranslationModel({ delay: 100 });
    const controller = new AbortController();

    const promise = model.doTranslate({
      text: 'Test',
      targetLanguage: 'de',
      abortSignal: controller.signal,
    });

    controller.abort();

    await expect(promise).rejects.toThrow();
  });

  it('should abort OCR', async () => {
    const model = createMockOCRModel({ delay: 100 });
    const controller = new AbortController();

    const promise = model.doOCR({
      images: ['test.png'],
      abortSignal: controller.signal,
    });

    controller.abort();

    await expect(promise).rejects.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════
// DELAY TESTS
// ═══════════════════════════════════════════════════════════════

describe('Delay Support', () => {
  it('should apply delay to mock models', async () => {
    const model = createMockLanguageModel({ delay: 50 });
    const start = Date.now();

    await model.doGenerate({ prompt: 'Test' });

    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40); // Allow some tolerance
  });
});

