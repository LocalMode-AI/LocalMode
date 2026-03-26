import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  createMockTranslationModel,
  createMockSummarizationModel,
  createMockOCRModel,
} from '@localmode/core';
import { useTranslate } from '../src/hooks/use-translate.js';
import { useSummarize } from '../src/hooks/use-summarize.js';
import { useExtractText } from '../src/hooks/use-extract-text.js';

describe('useTranslate', () => {
  it('translates text', async () => {
    const model = createMockTranslationModel({ translationPrefix: '[FR]' });
    const { result } = renderHook(() => useTranslate({ model }));

    await act(async () => {
      await result.current.execute({ text: 'Hello', targetLanguage: 'fr' });
    });

    expect(result.current.data).not.toBeNull();
    expect(result.current.data?.translation).toContain('[FR]');
    expect(result.current.isLoading).toBe(false);
  });
});

describe('useSummarize', () => {
  it('summarizes text', async () => {
    const model = createMockSummarizationModel();
    const { result } = renderHook(() => useSummarize({ model }));

    await act(async () => {
      await result.current.execute({
        text: 'This is a long piece of text that needs to be summarized into a shorter form.',
      });
    });

    expect(result.current.data).not.toBeNull();
    expect(result.current.data?.summary).toBeDefined();
    expect(result.current.isLoading).toBe(false);
  });
});

describe('useExtractText', () => {
  it('extracts text from image', async () => {
    const model = createMockOCRModel({ mockText: 'Extracted text' });
    const { result } = renderHook(() => useExtractText({ model }));

    await act(async () => {
      await result.current.execute('data:image/png;base64,iVBOR');
    });

    expect(result.current.data).not.toBeNull();
    expect(result.current.data?.text).toBe('Extracted text');
    expect(result.current.isLoading).toBe(false);
  });
});
