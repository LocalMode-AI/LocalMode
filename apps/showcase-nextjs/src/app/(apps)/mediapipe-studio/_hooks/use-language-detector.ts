/**
 * @file use-language-detector.ts
 * @description Hook for debounced live language detection
 */
'use client';

import { useEffect, useState } from 'react';
import { useDetectLanguage, toAppError } from '@localmode/react';
import { getLanguageName } from '@localmode/core';
import { getLanguageDetector } from '../_services/mediapipe.service';
import { LANGUAGE_DEBOUNCE_MS, LANGUAGE_MIN_LENGTH } from '../_lib/constants';
import type { LanguageResult } from '../_lib/types';

/**
 * Hook for detecting the language of text input.
 *
 * Detection runs automatically (debounced) once the text passes a minimum
 * length, and can also be triggered manually.
 */
export function useLanguageDetector() {
  const [text, setText] = useState('');
  const { data, error, isLoading, execute, reset } = useDetectLanguage({
    model: getLanguageDetector(),
    maxResults: 5,
  });

  // Debounced auto-detection when the text is long enough.
  useEffect(() => {
    if (text.trim().length < LANGUAGE_MIN_LENGTH) {
      reset();
      return;
    }
    const timer = setTimeout(() => {
      void execute(text);
    }, LANGUAGE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // `execute`/`reset` are stable refs from useOperation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const languages: LanguageResult[] = (data?.languages ?? []).map((lang) => ({
    code: lang.languageCode,
    name: getLanguageName(lang.languageCode),
    confidence: lang.confidence,
  }));

  return {
    text,
    setText,
    languages,
    isDetecting: isLoading,
    error: toAppError(error),
    detectNow: () => execute(text),
  };
}
