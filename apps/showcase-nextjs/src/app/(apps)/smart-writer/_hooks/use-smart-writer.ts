/**
 * @file use-smart-writer.ts
 * @description Hook coordinating summarization and translation for the Smart Writer app
 */
'use client';

import { useState, useEffect } from 'react';
import { useSummarize, useTranslate, toAppError } from '@localmode/react';
import type { SummarizationModel, TranslationModel } from '@localmode/core';
import { getSummarizerModel, getActiveProvider } from '../_services/summarizer.service';
import { getTranslatorModel, getTranslatorProvider } from '../_services/translator.service';
import { LANGUAGE_PAIRS } from '../_lib/constants';
import type { ActiveProvider, WriterTab, SummaryType } from '../_lib/types';

/** Hook for Smart Writer operations */
export function useSmartWriter() {
  const [summarizerModel, setSummarizerModel] = useState<SummarizationModel | null>(null);
  const [translatorModel, setTranslatorModel] = useState<TranslationModel | null>(null);
  const [activeTab, setActiveTab] = useState<WriterTab>('summarize');
  const [pairIndex, setPairIndex] = useState(0);
  const [summaryProvider, setSummaryProvider] = useState<ActiveProvider>('transformers');
  const [translateProvider, setTranslateProvider] = useState<ActiveProvider>('transformers');

  // Load summarizer model on mount
  useEffect(() => {
    getSummarizerModel().then((m) => {
      setSummarizerModel(m);
      setSummaryProvider(getActiveProvider());
    });
  }, []);

  // Load translator model when language pair changes
  useEffect(() => {
    const pair = LANGUAGE_PAIRS[pairIndex];
    getTranslatorModel(pair.target, pair.modelId).then((m) => {
      setTranslatorModel(m);
      setTranslateProvider(getTranslatorProvider());
    });
  }, [pairIndex]);

  const summarizeHook = useSummarize({ model: summarizerModel! });
  const translateHook = useTranslate({ model: translatorModel! });

  const handleSummarize = async (text: string, _type?: SummaryType) => {
    if (!text.trim() || !summarizerModel) return;
    await summarizeHook.execute({ text, maxLength: 150 });
  };

  const handleTranslate = async (text: string) => {
    if (!text.trim() || !translatorModel) return;
    const pair = LANGUAGE_PAIRS[pairIndex];
    await translateHook.execute({ text, sourceLanguage: pair.source, targetLanguage: pair.target });
  };

  return {
    // Tab
    activeTab,
    setActiveTab,
    // Summary
    summary: summarizeHook.data?.summary ?? '',
    isSummarizing: summarizeHook.isLoading,
    summaryError: toAppError(summarizeHook.error),
    summaryProvider,
    handleSummarize,
    cancelSummary: summarizeHook.cancel,
    clearSummary: summarizeHook.reset,
    // Translation
    translation: translateHook.data?.translation ?? '',
    isTranslating: translateHook.isLoading,
    translationError: toAppError(translateHook.error),
    translateProvider,
    handleTranslate,
    cancelTranslation: translateHook.cancel,
    clearTranslation: translateHook.reset,
    // Language
    pairIndex,
    setPairIndex,
    currentPair: LANGUAGE_PAIRS[pairIndex],
    // Status
    isModelReady: !!summarizerModel,
  };
}
