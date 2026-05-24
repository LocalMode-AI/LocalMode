/**
 * @file use-ocr.ts
 * @description Hook for OCR with model selection and prompt mode support
 */
'use client';

import { useState, useRef } from 'react';
import { toAppError, readFileAsDataUrl, validateFile } from '@localmode/react';
import type { ExtractTextResult } from '@localmode/core';
import { getOCRModel } from '../_services/ocr.service';
import { ACCEPTED_IMAGE_TYPES, MAX_FILE_SIZE, DEFAULT_MODEL_ID, OCR_MODELS, OCR_MODES, DEFAULT_MODE_ID } from '../_lib/constants';
import type { AppError } from '../_lib/types';

export function useOCR() {
  const [selectedModelId, setSelectedModelId] = useState(DEFAULT_MODEL_ID);
  const [selectedModeId, setSelectedModeId] = useState(DEFAULT_MODE_ID);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [extractedText, setExtractedText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const selectedModel = OCR_MODELS.find((m) => m.id === selectedModelId) ?? OCR_MODELS[0];
  const selectedMode = OCR_MODES.find((m) => m.id === selectedModeId) ?? OCR_MODES[0];

  const processFile = async (file: File) => {
    const validationErr = validateFile({ file, accept: ACCEPTED_IMAGE_TYPES, maxSize: MAX_FILE_SIZE });
    if (validationErr) {
      setError(validationErr);
      return;
    }

    setError(null);
    setExtractedText('');
    setIsProcessing(true);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setImageDataUrl(dataUrl);

      const model = getOCRModel(selectedModelId);
      const { extractText } = await import('@localmode/core');

      const prompt = selectedModel.generative ? selectedMode.prompt : undefined;

      const result: ExtractTextResult = await extractText({
        model,
        image: dataUrl,
        prompt,
        abortSignal: controller.signal,
      });

      if (!controller.signal.aborted) {
        setExtractedText(result.text);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (!controller.signal.aborted) {
        setError(toAppError(err as Error) ?? { message: 'OCR processing failed' });
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsProcessing(false);
      }
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
    setIsProcessing(false);
  };

  const reset = () => {
    abortRef.current?.abort();
    setImageDataUrl(null);
    setExtractedText('');
    setError(null);
    setIsProcessing(false);
  };

  const clearError = () => setError(null);

  const selectModel = (modelId: string) => {
    if (modelId !== selectedModelId) {
      setSelectedModelId(modelId);
      if (imageDataUrl) {
        setExtractedText('');
      }
    }
  };

  return {
    imageDataUrl,
    extractedText,
    isProcessing,
    error,
    selectedModel,
    selectedModeId,
    processFile,
    cancel,
    clearError,
    reset,
    selectModel,
    setSelectedModeId,
  };
}
