/**
 * Structured Object Generation Function
 *
 * Generate typed, validated JSON objects from language models.
 * Builds on top of generateText() with schema-aware prompting,
 * JSON extraction, validation, and retry with self-correction.
 *
 * @packageDocumentation
 */

import type { GenerateObjectOptions, GenerateObjectResult } from './types.js';
import { generateText } from './generate-text.js';
import { buildStructuredPrompt, extractJSON } from './schema.js';

/**
 * Generate a typed, validated JSON object using a language model.
 *
 * Instructs the model to output JSON matching the provided schema,
 * then extracts, parses, and validates the result. On validation failure,
 * retries with self-correction feedback (up to maxRetries attempts).
 *
 * @param options - Generation options including model, schema, and prompt
 * @returns Promise with the parsed object, raw text, usage, and metadata
 *
 * @example Basic usage
 * ```ts
 * import { generateObject, jsonSchema } from '@localmode/core';
 * import { webllm } from '@localmode/webllm';
 * import { z } from 'zod';
 *
 * const { object } = await generateObject({
 *   model: webllm.languageModel('Qwen3-1.7B-q4f16_1-MLC'),
 *   schema: jsonSchema(z.object({
 *     name: z.string(),
 *     email: z.string(),
 *   })),
 *   prompt: 'Extract contact info from: "Hi, I\'m Sarah at sarah@acme.co"',
 * });
 *
 * console.log(object.name);  // "Sarah"
 * console.log(object.email); // "sarah@acme.co"
 * ```
 *
 * @example With array mode
 * ```ts
 * const { object } = await generateObject({
 *   model,
 *   schema: jsonSchema(z.array(z.object({ item: z.string(), qty: z.number() }))),
 *   prompt: 'Generate a shopping list for a BBQ party',
 *   mode: 'array',
 * });
 * ```
 *
 * @example With cancellation
 * ```ts
 * const controller = new AbortController();
 * const promise = generateObject({ model, schema, prompt, abortSignal: controller.signal });
 * controller.abort();
 * ```
 *
 * @throws {StructuredOutputError} If all retry attempts fail validation
 * @throws {Error} If aborted via AbortSignal
 *
 * @see {@link streamObject} for streaming partial objects
 * @see {@link jsonSchema} for converting Zod schemas
 */
export async function generateObject<T>(
  options: GenerateObjectOptions<T>
): Promise<GenerateObjectResult<T>> {
  const {
    model,
    schema,
    prompt,
    systemPrompt,
    mode = 'json',
    messages,
    maxTokens = 1024,
    temperature = 0,
    topP,
    maxRetries = 3,
    abortSignal,
    providerOptions,
  } = options;

  abortSignal?.throwIfAborted();

  const structuredSystemPrompt = buildStructuredPrompt(schema, mode, systemPrompt);

  let lastError: Error | null = null;
  let totalUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, durationMs: 0 };
  let lastResponse = { modelId: '', timestamp: new Date() };
  let lastFinishReason: 'stop' | 'length' | 'content_filter' | 'error' = 'stop';
  let lastRawText = '';

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    abortSignal?.throwIfAborted();

    // On retry, append validation error for self-correction
    const retryHint =
      lastError && attempt > 1
        ? `\n\nYour previous response failed validation: ${lastError.message}\nPlease fix the JSON and try again.`
        : '';

    const result = await generateText({
      model,
      prompt: prompt + retryHint,
      systemPrompt: structuredSystemPrompt,
      messages,
      maxTokens,
      temperature,
      topP,
      maxRetries: 0,
      abortSignal,
      providerOptions,
    });

    // Accumulate usage across attempts
    totalUsage.inputTokens += result.usage.inputTokens;
    totalUsage.outputTokens += result.usage.outputTokens;
    totalUsage.totalTokens += result.usage.totalTokens;
    totalUsage.durationMs += result.usage.durationMs;
    lastResponse = result.response;
    lastFinishReason = result.finishReason;
    lastRawText = result.text;

    try {
      const raw = extractJSON(result.text);
      const parsed = schema.parse(raw);

      return {
        object: parsed,
        rawText: result.text,
        finishReason: lastFinishReason,
        usage: totalUsage,
        response: lastResponse,
        attempts: attempt,
      };
    } catch (error) {
      lastError = error as Error;

      // Don't retry on abort
      if (abortSignal?.aborted) {
        throw error;
      }

      if (attempt === maxRetries) {
        // Import error class dynamically to avoid circular deps
        const { StructuredOutputError } = await import('../errors/index.js');
        throw new StructuredOutputError(
          `Failed to generate valid object after ${maxRetries} attempts`,
          {
            hint: `Last validation error: ${lastError.message}. Raw output: "${lastRawText.slice(0, 200)}"`,
            cause: lastError,
            attempts: maxRetries,
          }
        );
      }
    }
  }

  // Should not reach here
  const { StructuredOutputError } = await import('../errors/index.js');
  throw new StructuredOutputError('generateObject failed unexpectedly', {
    cause: lastError ?? undefined,
  });
}
