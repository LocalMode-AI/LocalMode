/**
 * @file use-model-status.ts
 * @description Hook for tracking model loading and readiness state
 */

import { useState, useEffect } from 'react';

const IS_SERVER = typeof window === 'undefined';

/** Options for the useModelStatus hook */
interface ModelWithId {
  readonly modelId: string;
  readonly provider: string;
}

/**
 * Hook for tracking whether a model is ready for inference.
 *
 * @param model - Any model instance with modelId and provider
 * @returns Model readiness state
 */
export function useModelStatus(model: ModelWithId) {
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error] = useState<Error | null>(null);

  useEffect(() => {
    if (IS_SERVER) return;

    // Model instances are generally ready once constructed.
    // Provider-specific loading (model download) happens on first use.
    // We optimistically mark as ready since the model instance exists.
    setIsReady(true);
    setIsLoading(false);
  }, [model.modelId, model.provider]);

  if (IS_SERVER) {
    return { isReady: false, isLoading: false, error: null };
  }

  return { isReady, isLoading, error };
}
