/**
 * @file use-generate-object.ts
 * @description Hook for generating typed JSON objects with @localmode/core generateObject()
 */

import type { LanguageModel, ObjectSchema, GenerateObjectResult, ObjectOutputMode } from '@localmode/core';
import { useOperation } from '../core/use-operation.js';

/** Options for the useGenerateObject hook */
export interface UseGenerateObjectOptions<T> {
  /** The language model to use */
  model: LanguageModel;
  /** Schema defining the expected output structure */
  schema: ObjectSchema<T>;
  /** Output mode (default: 'json') */
  mode?: ObjectOutputMode;
  /** Maximum tokens to generate (default: 1024) */
  maxTokens?: number;
  /** Sampling temperature (default: 0) */
  temperature?: number;
  /** Maximum validation+retry attempts (default: 3) */
  maxRetries?: number;
  /** Optional system prompt */
  systemPrompt?: string;
}

/**
 * Hook for generating typed, validated JSON objects from a language model.
 *
 * @param options - Language model, schema, and generation configuration
 * @returns Operation state with execute(prompt: string) function
 *
 * @example
 * ```tsx
 * import { useGenerateObject, jsonSchema } from '@localmode/react';
 * import { webllm } from '@localmode/webllm';
 * import { z } from 'zod';
 *
 * const schema = jsonSchema(z.object({ name: z.string(), age: z.number() }));
 * const { data, isLoading, error, execute } = useGenerateObject({
 *   model: webllm.languageModel('Qwen3-1.7B-q4f16_1-MLC'),
 *   schema,
 * });
 *
 * await execute('Extract: John is 30 years old');
 * console.log(data?.object); // { name: "John", age: 30 }
 * ```
 */
export function useGenerateObject<T>(options: UseGenerateObjectOptions<T>) {
  const { model, schema, mode, maxTokens, temperature, maxRetries, systemPrompt } = options;

  return useOperation<[string], GenerateObjectResult<T>>({
    fn: async (prompt: string, signal: AbortSignal) => {
      const { generateObject } = await import('@localmode/core');
      return generateObject({
        model,
        schema,
        prompt,
        mode,
        maxTokens,
        temperature,
        maxRetries,
        systemPrompt,
        abortSignal: signal,
      });
    },
  });
}
