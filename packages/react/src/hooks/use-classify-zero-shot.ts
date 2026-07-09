/**
 * @file use-classify-zero-shot.ts
 * @description Hook for zero-shot text classification
 */

import type { ZeroShotClassificationModel, ClassifyZeroShotResult } from '@localmode/core';
import { useOperation } from '../core/use-operation.js';

/** Options for the useClassifyZeroShot hook */
export interface UseClassifyZeroShotOptions {
  /** The zero-shot classification model to use */
  model: ZeroShotClassificationModel;
  /** Allow multiple labels per text (default: provider default, usually false) */
  multiLabel?: boolean;
  /**
   * Hypothesis template, e.g. `"This text is about {}."`.
   *
   * Delivered to the model's `doClassifyZeroShot()` boundary (which defines
   * `hypothesisTemplate`) by wrapping the model, since the core
   * `classifyZeroShot()` function does not expose it at the function level.
   */
  hypothesisTemplate?: string;
}

/** Input for zero-shot classification */
export interface ClassifyZeroShotInput {
  /** The text to classify */
  text: string;
  /** Candidate labels to classify into */
  candidateLabels: string[];
  /** Per-call override of the hook-level `multiLabel` option */
  multiLabel?: boolean;
  /** Per-call override of the hook-level `hypothesisTemplate` option */
  hypothesisTemplate?: string;
}

/**
 * Hook for zero-shot text classification with custom labels.
 *
 * Hook-level `multiLabel` / `hypothesisTemplate` apply to every call and can
 * be overridden per call via the execute input.
 *
 * @param options - Zero-shot classification model configuration
 * @returns Operation state with execute({ text, candidateLabels }) function
 *
 * @example
 * ```tsx
 * const { data, execute } = useClassifyZeroShot({
 *   model,
 *   multiLabel: true,
 *   hypothesisTemplate: 'This text is about {}.',
 * });
 * await execute({ text: 'New phone camera', candidateLabels: ['tech', 'food'] });
 * ```
 */
export function useClassifyZeroShot(options: UseClassifyZeroShotOptions) {
  const { model, multiLabel, hypothesisTemplate } = options;

  return useOperation<[ClassifyZeroShotInput], ClassifyZeroShotResult>({
    fn: async (input: ClassifyZeroShotInput, signal: AbortSignal) => {
      const { classifyZeroShot } = await import('@localmode/core');

      // Per-call overrides win over hook-level options
      const effectiveMultiLabel = input.multiLabel ?? multiLabel;
      const effectiveHypothesisTemplate = input.hypothesisTemplate ?? hypothesisTemplate;

      // classifyZeroShot() forwards multiLabel but has no function-level
      // hypothesisTemplate option, so inject it at the model boundary
      // (DoClassifyZeroShotOptions defines it) while keeping the core call
      // path (retries, abort handling, response shaping) intact.
      const effectiveModel: ZeroShotClassificationModel =
        effectiveHypothesisTemplate === undefined
          ? model
          : {
              modelId: model.modelId,
              provider: model.provider,
              doClassifyZeroShot: (opts) =>
                model.doClassifyZeroShot({
                  ...opts,
                  hypothesisTemplate: effectiveHypothesisTemplate,
                }),
            };

      return classifyZeroShot({
        model: effectiveModel,
        text: input.text,
        candidateLabels: input.candidateLabels,
        multiLabel: effectiveMultiLabel,
        abortSignal: signal,
      });
    },
  });
}
