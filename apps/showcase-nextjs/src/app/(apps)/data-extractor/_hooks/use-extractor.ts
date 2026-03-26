/**
 * @file use-extractor.ts
 * @description Hook for managing structured data extraction using useGenerateObject
 */

import { useState } from 'react';
import { useGenerateObject, toAppError } from '@localmode/react';
import { getModel } from '../_services/extractor.service';
import { EXTRACTION_TEMPLATES, DEFAULT_TEMPLATE, DEFAULT_MODEL_ID } from '../_lib/constants';
import type { TemplateName } from '../_lib/types';

/**
 * Hook for structured data extraction with template switching and model selection.
 */
export function useExtractor() {
  const [template, setTemplate] = useState<TemplateName>(DEFAULT_TEMPLATE);
  const [modelId, setModelId] = useState(DEFAULT_MODEL_ID);

  const currentTemplate = EXTRACTION_TEMPLATES[template];
  const model = getModel(modelId);

  const { data, isLoading, error, execute, cancel, reset } = useGenerateObject({
    model,
    schema: currentTemplate.schema,
    temperature: 0,
    maxRetries: 3,
  });

  const extract = async (text: string) => {
    if (!text.trim()) return;
    await execute(text);
  };

  const switchTemplate = (name: TemplateName) => {
    cancel();
    reset();
    setTemplate(name);
  };

  const switchModel = (id: string) => {
    cancel();
    reset();
    setModelId(id);
  };

  return {
    /** Extracted object result */
    result: data?.object ?? null,
    /** Raw text from model */
    rawText: data?.rawText ?? '',
    /** Number of attempts taken */
    attempts: data?.attempts ?? 0,
    /** Usage statistics */
    usage: data?.usage ?? null,
    /** Whether extraction is in progress */
    isExtracting: isLoading,
    /** Current error */
    error: toAppError(error),
    /** Current template name */
    template,
    /** Current template config */
    currentTemplate,
    /** Current model ID */
    modelId,
    /** Extract structured data from text */
    extract,
    /** Cancel in-flight extraction */
    cancel,
    /** Clear error state */
    clearError: reset,
    /** Switch extraction template (cancels + resets) */
    setTemplate: switchTemplate,
    /** Switch model (cancels + resets) */
    setModelId: switchModel,
  };
}
