/**
 * @file use-document-qa.ts
 * @description Hook for managing document QA workflow using useOperationList from @localmode/react
 */
'use client';

import { useState } from 'react';
import { useOperationList, toAppError, readFileAsDataUrl, validateFile } from '@localmode/react';
import type { AskDocumentResult } from '@localmode/core';
import { getDocumentQAModel } from '../_services/document-qa.service';
import { ACCEPTED_IMAGE_TYPES } from '../_lib/constants';
import type { QAEntry, AppError } from '../_lib/types';

/** Hook for document QA operations */
export function useDocumentQA() {
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<AppError | null>(null);

  const { items: answers, isLoading, error: opError, execute, cancel, reset: resetOp, clearItems } = useOperationList<
    [{ document: string; question: string }], AskDocumentResult, QAEntry
  >({
    fn: async (input: { document: string; question: string }, signal: AbortSignal) => {
      const { askDocument } = await import('@localmode/core');
      return askDocument({ model: getDocumentQAModel(), document: input.document, question: input.question, abortSignal: signal });
    },
    transform: (result, input) => ({
      id: crypto.randomUUID(),
      question: input.question,
      answer: result.answer,
      score: result.score,
    }),
    prepend: false,
  });

  /** Handle image file upload */
  const uploadImage = async (file: File) => {
    const validationErr = validateFile({ file, accept: ACCEPTED_IMAGE_TYPES });
    if (validationErr) { setUploadError(validationErr); return; }
    setUploadError(null);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setImageDataUrl(dataUrl);
      clearItems();
    } catch {
      setUploadError({ message: 'Failed to read the uploaded file', recoverable: true });
    }
  };

  /** Submit a question about the uploaded document */
  const submitQuestion = async (questionText: string) => {
    if (!imageDataUrl || !questionText.trim()) return;
    await execute({ document: imageDataUrl, question: questionText });
  };

  /** Merged error from upload validation or model operation */
  const error = uploadError ?? toAppError(opError);

  const clearError = () => { setUploadError(null); resetOp(); };
  const reset = () => { setImageDataUrl(null); clearItems(); setUploadError(null); resetOp(); };

  return { imageDataUrl, answers, isAnswering: isLoading, error, uploadImage, submitQuestion, cancelQuestion: cancel, clearError, reset };
}
