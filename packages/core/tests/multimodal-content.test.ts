import { describe, it, expect } from 'vitest';
import {
  normalizeContent,
  getTextContent,
  generateText,
} from '../src/index.js';
import { createMockVisionLanguageModel } from '../src/testing/index.js';
import type { ContentPart } from '../src/index.js';

describe('normalizeContent()', () => {
  it('converts string to single TextPart array', () => {
    const result = normalizeContent('Hello');
    expect(result).toEqual([{ type: 'text', text: 'Hello' }]);
  });

  it('passes ContentPart[] through unchanged', () => {
    const parts: ContentPart[] = [
      { type: 'text', text: 'Hi' },
      { type: 'image', data: 'abc123', mimeType: 'image/png' },
    ];
    const result = normalizeContent(parts);
    expect(result).toBe(parts);
  });

  it('handles empty string', () => {
    const result = normalizeContent('');
    expect(result).toEqual([{ type: 'text', text: '' }]);
  });

  it('handles empty array', () => {
    const result = normalizeContent([]);
    expect(result).toEqual([]);
  });
});

describe('getTextContent()', () => {
  it('returns string directly', () => {
    expect(getTextContent('Hello world')).toBe('Hello world');
  });

  it('extracts text from mixed ContentPart array', () => {
    const parts: ContentPart[] = [
      { type: 'text', text: 'Describe' },
      { type: 'image', data: 'abc', mimeType: 'image/png' },
      { type: 'text', text: 'this image' },
    ];
    expect(getTextContent(parts)).toBe('Describe this image');
  });

  it('returns empty string for image-only array', () => {
    const parts: ContentPart[] = [
      { type: 'image', data: 'abc', mimeType: 'image/png' },
    ];
    expect(getTextContent(parts)).toBe('');
  });

  it('handles empty array', () => {
    expect(getTextContent([])).toBe('');
  });
});

describe('multimodal message passthrough', () => {
  it('generateText passes ContentPart[] messages to provider', async () => {
    const model = createMockVisionLanguageModel();

    const { text } = await generateText({
      model,
      prompt: '',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is this?' },
            { type: 'image', data: 'iVBOR', mimeType: 'image/png' },
          ],
        },
      ],
    });

    expect(text).toBe('Received 1 text part and 1 image part');
  });

  it('generateText handles string content messages', async () => {
    const model = createMockVisionLanguageModel();

    const { text } = await generateText({
      model,
      prompt: '',
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(text).toBe('Received text: Hello');
  });

  it('mock vision model has supportsVision: true', () => {
    const model = createMockVisionLanguageModel();
    expect(model.supportsVision).toBe(true);
  });
});
