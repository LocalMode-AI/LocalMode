/**
 * Table QA Functions
 *
 * Function-first API for table question answering.
 *
 * @packageDocumentation
 */

import type {
  TableQAModel,
  AskTableOptions,
  AskTableResult,
  TableQAModelFactory,
} from './types.js';

// Global provider for string model ID resolution
let globalTableQAProvider: TableQAModelFactory | null = null;

/**
 * Set the global table QA provider for string model ID resolution.
 *
 * @param provider - Factory function to create table QA models from string IDs
 */
export function setGlobalTableQAProvider(provider: TableQAModelFactory | null): void {
  globalTableQAProvider = provider;
}

/**
 * Resolve a model from string ID or return the model object.
 */
function resolveModel(modelOrId: TableQAModel | string): TableQAModel {
  if (typeof modelOrId !== 'string') {
    return modelOrId;
  }

  if (!globalTableQAProvider) {
    throw new Error(
      'No global table QA provider configured. ' +
        'Either pass a TableQAModel object or call setGlobalTableQAProvider() first.'
    );
  }

  return globalTableQAProvider(modelOrId);
}

/**
 * Ask a question about tabular data.
 *
 * @param options - Table QA options including model, table, and question
 * @returns Promise with answer and usage information
 *
 * @example Basic usage
 * ```ts
 * import { askTable } from '@localmode/core';
 * import { transformers } from '@localmode/transformers';
 *
 * const { answer, cells, usage } = await askTable({
 *   model: transformers.tableQA('Xenova/tapas-base-finetuned-wtq'),
 *   table: {
 *     headers: ['Name', 'Age', 'City'],
 *     rows: [
 *       ['Alice', '30', 'New York'],
 *       ['Bob', '25', 'Los Angeles'],
 *       ['Charlie', '35', 'Chicago'],
 *     ],
 *   },
 *   question: 'Who is the oldest?',
 * });
 *
 * console.log(answer); // "Charlie"
 * ```
 *
 * @example Aggregation queries
 * ```ts
 * const { answer, aggregator } = await askTable({
 *   model: transformers.tableQA('Xenova/tapas-base-finetuned-wtq'),
 *   table: salesData,
 *   question: 'What is the total revenue?',
 * });
 *
 * console.log(`${aggregator}: ${answer}`); // "SUM: $10,000"
 * ```
 *
 * @throws {Error} If table QA fails
 */
export async function askTable(options: AskTableOptions): Promise<AskTableResult> {
  const {
    model: modelOrId,
    table,
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

      const result = await model.doAskTable({
        table,
        questions: [question],
        abortSignal,
        providerOptions,
      });

      const durationMs = performance.now() - startTime;

      const answer = result.answers[0];

      return {
        answer: answer.answer,
        cells: answer.cells,
        aggregator: answer.aggregator,
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

  throw lastError || new Error('Table QA failed');
}

