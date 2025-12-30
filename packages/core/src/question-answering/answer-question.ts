/**
 * Question Answering Functions
 *
 * Function-first API for extractive question answering.
 *
 * @packageDocumentation
 */

import type {
  QuestionAnsweringModel,
  AnswerQuestionOptions,
  AnswerQuestionResult,
  AnswerQuestionManyOptions,
  AnswerQuestionManyResult,
  QuestionAnsweringModelFactory,
} from './types.js';

// Global provider for string model ID resolution
let globalQAProvider: QuestionAnsweringModelFactory | null = null;

/**
 * Set the global question answering provider for string model ID resolution.
 *
 * @param provider - Factory function to create QA models from string IDs
 */
export function setGlobalQuestionAnsweringProvider(
  provider: QuestionAnsweringModelFactory | null
): void {
  globalQAProvider = provider;
}

/**
 * Resolve a model from string ID or return the model object.
 */
function resolveModel(modelOrId: QuestionAnsweringModel | string): QuestionAnsweringModel {
  if (typeof modelOrId !== 'string') {
    return modelOrId;
  }

  if (!globalQAProvider) {
    throw new Error(
      'No global question answering provider configured. ' +
        'Either pass a QuestionAnsweringModel object or call setGlobalQuestionAnsweringProvider() first.'
    );
  }

  return globalQAProvider(modelOrId);
}

/**
 * Answer a question based on a context using a QA model.
 *
 * @param options - Question answering options including model, question, and context
 * @returns Promise with extracted answer and usage information
 *
 * @example Basic usage
 * ```ts
 * import { answerQuestion } from '@localmode/core';
 * import { transformers } from '@localmode/transformers';
 *
 * const { answer, score, usage } = await answerQuestion({
 *   model: transformers.questionAnswering('Xenova/distilbert-base-cased-distilled-squad'),
 *   question: 'What is the capital of France?',
 *   context: 'France is a country in Europe. Its capital is Paris, which is known for the Eiffel Tower.',
 * });
 *
 * console.log(answer); // "Paris"
 * console.log(`Confidence: ${(score * 100).toFixed(1)}%`);
 * ```
 *
 * @example Multiple answers
 * ```ts
 * const { answer, allAnswers } = await answerQuestion({
 *   model: transformers.questionAnswering('Xenova/distilbert-base-cased-distilled-squad'),
 *   question: 'Who invented the telephone?',
 *   context: 'Alexander Graham Bell is credited with inventing the telephone. Some argue it was Antonio Meucci.',
 *   topK: 3,
 * });
 *
 * console.log('Top answer:', answer);
 * console.log('All answers:', allAnswers);
 * ```
 *
 * @throws {Error} If question answering fails
 */
export async function answerQuestion(options: AnswerQuestionOptions): Promise<AnswerQuestionResult> {
  const {
    model: modelOrId,
    question,
    context,
    topK = 1,
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

      const result = await model.doAnswer({
        questions: [{ question, context }],
        topK,
        abortSignal,
        providerOptions,
      });

      const durationMs = performance.now() - startTime;

      const topAnswer = result.results[0][0];

      return {
        answer: topAnswer.answer,
        score: topAnswer.score,
        start: topAnswer.start,
        end: topAnswer.end,
        allAnswers: topK > 1 ? result.results[0] : undefined,
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

  throw lastError || new Error('Question answering failed');
}

/**
 * Answer multiple questions based on their contexts.
 *
 * @param options - Question answering options including model and questions
 * @returns Promise with answers for each question
 *
 * @example
 * ```ts
 * const { answers } = await answerQuestionMany({
 *   model: transformers.questionAnswering('Xenova/distilbert-base-cased-distilled-squad'),
 *   questions: [
 *     { question: 'What is the capital?', context: 'The capital of France is Paris.' },
 *     { question: 'Who is the president?', context: 'The president is Emmanuel Macron.' },
 *   ],
 * });
 *
 * console.log(answers[0][0].answer); // "Paris"
 * console.log(answers[1][0].answer); // "Emmanuel Macron"
 * ```
 */
export async function answerQuestionMany(
  options: AnswerQuestionManyOptions
): Promise<AnswerQuestionManyResult> {
  const {
    model: modelOrId,
    questions,
    topK = 1,
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

      const result = await model.doAnswer({
        questions,
        topK,
        abortSignal,
        providerOptions,
      });

      const durationMs = performance.now() - startTime;

      return {
        answers: result.results,
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

  throw lastError || new Error('Question answering failed');
}

