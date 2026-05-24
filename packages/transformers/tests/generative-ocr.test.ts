/**
 * Generative OCR Model Tests
 *
 * Unit tests for model ID detection functions and class structure.
 * These tests verify detection logic and interface compliance without
 * requiring actual TJS v4 model downloads.
 *
 * @packageDocumentation
 */

import { describe, it, expect } from 'vitest';
import {
  isGenerativeOCRModel,
  isGlmOcrModel,
  isLightOnOCRModel,
  TransformersGenerativeOCRModel,
} from '../src/implementations/generative-ocr.js';
import { createTransformers } from '../src/index.js';

describe('isGlmOcrModel()', () => {
  it('detects onnx-community GLM-OCR-ONNX', () => {
    expect(isGlmOcrModel('onnx-community/GLM-OCR-ONNX')).toBe(true);
  });

  it('detects case-insensitive glm-ocr', () => {
    expect(isGlmOcrModel('some-user/glm-ocr-custom')).toBe(true);
  });

  it('detects underscore variant glm_ocr', () => {
    expect(isGlmOcrModel('user/glm_ocr_ft')).toBe(true);
  });

  it('detects joined glmocr', () => {
    expect(isGlmOcrModel('octopusmegalopod/some-glmocr-ggufs')).toBe(true);
  });

  it('rejects unrelated model IDs', () => {
    expect(isGlmOcrModel('Xenova/trocr-small-printed')).toBe(false);
    expect(isGlmOcrModel('onnx-community/LightOnOCR-2-1B-ONNX')).toBe(false);
    expect(isGlmOcrModel('onnx-community/Qwen3.5-0.8B-ONNX')).toBe(false);
  });
});

describe('isLightOnOCRModel()', () => {
  it('detects onnx-community LightOnOCR-2-1B-ONNX', () => {
    expect(isLightOnOCRModel('onnx-community/LightOnOCR-2-1B-ONNX')).toBe(true);
  });

  it('detects case-insensitive lightonocr', () => {
    expect(isLightOnOCRModel('user/lightonocr-custom')).toBe(true);
  });

  it('detects hyphenated variant lighton-ocr', () => {
    expect(isLightOnOCRModel('user/lighton-ocr-model')).toBe(true);
  });

  it('detects underscore variant lighton_ocr', () => {
    expect(isLightOnOCRModel('user/lighton_ocr_model')).toBe(true);
  });

  it('rejects unrelated model IDs', () => {
    expect(isLightOnOCRModel('Xenova/trocr-small-printed')).toBe(false);
    expect(isLightOnOCRModel('onnx-community/GLM-OCR-ONNX')).toBe(false);
    expect(isLightOnOCRModel('onnx-community/Qwen3.5-0.8B-ONNX')).toBe(false);
  });
});

describe('isGenerativeOCRModel()', () => {
  it('returns true for GLM-OCR models', () => {
    expect(isGenerativeOCRModel('onnx-community/GLM-OCR-ONNX')).toBe(true);
  });

  it('returns true for LightOnOCR models', () => {
    expect(isGenerativeOCRModel('onnx-community/LightOnOCR-2-1B-ONNX')).toBe(true);
  });

  it('returns false for TrOCR models', () => {
    expect(isGenerativeOCRModel('Xenova/trocr-small-printed')).toBe(false);
    expect(isGenerativeOCRModel('Xenova/trocr-small-handwritten')).toBe(false);
  });

  it('returns false for non-OCR models', () => {
    expect(isGenerativeOCRModel('Xenova/bge-small-en-v1.5')).toBe(false);
    expect(isGenerativeOCRModel('onnx-community/Qwen3.5-0.8B-ONNX')).toBe(false);
  });
});

describe('TransformersGenerativeOCRModel', () => {
  it('sets modelId with transformers: prefix', () => {
    const model = new TransformersGenerativeOCRModel('onnx-community/GLM-OCR-ONNX');
    expect(model.modelId).toBe('transformers:onnx-community/GLM-OCR-ONNX');
  });

  it('sets provider to transformers', () => {
    const model = new TransformersGenerativeOCRModel('onnx-community/GLM-OCR-ONNX');
    expect(model.provider).toBe('transformers');
  });

  it('implements OCRModel interface (has doOCR method)', () => {
    const model = new TransformersGenerativeOCRModel('onnx-community/GLM-OCR-ONNX');
    expect(typeof model.doOCR).toBe('function');
  });
});

describe('transformers.ocr() factory routing', () => {
  it('returns TransformersGenerativeOCRModel for GLM-OCR model ID', () => {
    const provider = createTransformers();
    const model = provider.ocr('onnx-community/GLM-OCR-ONNX');
    expect(model).toBeInstanceOf(TransformersGenerativeOCRModel);
  });

  it('returns TransformersGenerativeOCRModel for LightOnOCR model ID', () => {
    const provider = createTransformers();
    const model = provider.ocr('onnx-community/LightOnOCR-2-1B-ONNX');
    expect(model).toBeInstanceOf(TransformersGenerativeOCRModel);
  });

  it('does not return TransformersGenerativeOCRModel for TrOCR model ID', () => {
    const provider = createTransformers();
    const model = provider.ocr('Xenova/trocr-small-printed');
    expect(model).not.toBeInstanceOf(TransformersGenerativeOCRModel);
  });
});
