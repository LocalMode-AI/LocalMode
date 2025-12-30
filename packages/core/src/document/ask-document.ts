/**
 * Document QA Functions
 *
 * Function-first API for document question answering.
 *
 * @packageDocumentation
 */

import type {
  DocumentQAModel,
  AskDocumentOptions,
  AskDocumentResult,
  DocumentQAModelFactory,
} from './types.js';

// Global provider for string model ID resolution
let globalDocumentQAProvider: DocumentQAModelFactory | null = null;

/**
 * Set the global document QA provider for string model ID resolution.
 *
 * @param provider - Factory function to create document QA models from string IDs
 */
export function setGlobalDocumentQAProvider(provider: DocumentQAModelFactory | null): void {
  globalDocumentQAProvider = provider;
}

/**
 * Resolve a model from string ID or return the model object.
 */
function resolveModel(modelOrId: DocumentQAModel | string): DocumentQAModel {
  if (typeof modelOrId !== 'string') {
    return modelOrId;
  }

  if (!globalDocumentQAProvider) {
    throw new Error(
      'No global document QA provider configured. ' +
        'Either pass a DocumentQAModel object or call setGlobalDocumentQAProvider() first.'
    );
  }

  return globalDocumentQAProvider(modelOrId);
}

/**
 * Ask a question about a document image.
 *
 * @param options - Document QA options including model, document, and question
 * @returns Promise with answer and usage information
 *
 * @example Basic usage
 * ```ts
 * import { askDocument } from '@localmode/core';
 * import { transformers } from '@localmode/transformers';
 *
 * const { answer, score, usage } = await askDocument({
 *   model: transformers.documentQA('Xenova/donut-base-finetuned-docvqa'),
 *   document: invoiceImage,
 *   question: 'What is the total amount?',
 * });
 *
 * console.log(answer); // "$1,234.56"
 * console.log(`Confidence: ${(score * 100).toFixed(1)}%`);
 * ```
 *
 * @example Form extraction
 * ```ts
 * const { answer } = await askDocument({
 *   model: transformers.documentQA('Xenova/donut-base-finetuned-docvqa'),
 *   document: formImage,
 *   question: 'What is the customer name?',
 * });
 * ```
 *
 * @throws {Error} If document QA fails
 */
export async function askDocument(options: AskDocumentOptions): Promise<AskDocumentResult> {
  const {
    model: modelOrId,
    document,
    question,
    abortSignal,
    maxRetries = 2,
    providerOptions,
  } = options;

  abortSignal?.throwIfAborted();

  const model = resolveModel(modelOrId);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    abortSignal?.throwIfAborted();

    try {
      const startTime = performance.now();

      const result = await model.doAskDocument({
        document,
        questions: [question],
        abortSignal,
        providerOptions,
      });

      const durationMs = performance.now() - startTime;

      const answer = result.answers[0];

      return {
        answer: answer.answer,
        score: answer.score,
        usage: {
          ...result.usage,
          durationMs,
        },
        response: {
          modelId: model.modelId,
          timestamp: new Date(),
        },
      };
    } catch (error) {
      lastError = error as Error;

      if (abortSignal?.aborted) {
        throw error;
      }

      if (attempt === maxRetries) {
        throw error;
      }

      const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error('Document QA failed');
}
