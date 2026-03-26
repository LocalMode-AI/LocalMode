/**
 * Streaming Structured Object Generation Function
 *
 * Stream partial JSON objects as tokens arrive, with final validation.
 * Builds on top of streamText() with partial JSON parsing.
 *
 * @packageDocumentation
 */

import type {
  StreamObjectOptions,
  StreamObjectResult,
  DeepPartial,
} from './types.js';
import { streamText } from './stream-text.js';
import { buildStructuredPrompt, extractJSON, parsePartialJSON } from './schema.js';

/**
 * Stream a typed JSON object from a language model.
 *
 * Yields progressively more complete partial objects as tokens arrive.
 * The final object is validated against the schema on completion.
 *
 * @param options - Stream options including model, schema, and prompt
 * @returns Object with partialObjectStream, object promise, rawText promise, usage promise
 *
 * @example Basic streaming
 * ```ts
 * import { streamObject, jsonSchema } from '@localmode/core';
 * import { webllm } from '@localmode/webllm';
 * import { z } from 'zod';
 *
 * const result = await streamObject({
 *   model: webllm.languageModel('Qwen3-1.7B-q4f16_1-MLC'),
 *   schema: jsonSchema(z.object({
 *     name: z.string(),
 *     items: z.array(z.string()),
 *   })),
 *   prompt: 'Generate a shopping list for a BBQ',
 * });
 *
 * for await (const partial of result.partialObjectStream) {
 *   console.log(partial); // { name: "BBQ Shopping", items: ["burgers"] }
 * }
 *
 * const final = await result.object; // fully validated
 * ```
 *
 * @example With onPartialObject callback
 * ```ts
 * const result = await streamObject({
 *   model,
 *   schema,
 *   prompt: 'Extract data...',
 *   onPartialObject: (partial) => updateUI(partial),
 * });
 * ```
 *
 * @throws {Error} If model doesn't support streaming
 * @throws {Error} If final object fails schema validation
 *
 * @see {@link generateObject} for non-streaming generation
 * @see {@link jsonSchema} for converting Zod schemas
 */
export async function streamObject<T>(
  options: StreamObjectOptions<T>
): Promise<StreamObjectResult<T>> {
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
    abortSignal,
    onPartialObject,
    providerOptions,
  } = options;

  abortSignal?.throwIfAborted();

  const structuredSystemPrompt = buildStructuredPrompt(schema, mode, systemPrompt);

  const streamResult = await streamText({
    model,
    prompt,
    systemPrompt: structuredSystemPrompt,
    messages,
    maxTokens,
    temperature,
    topP,
    abortSignal,
    providerOptions,
  });

  let resolveObject: (value: T) => void;
  let rejectObject: (error: Error) => void;

  const objectPromise = new Promise<T>((resolve, reject) => {
    resolveObject = resolve;
    rejectObject = reject;
  });

  // Build partial object stream from text stream
  async function* partialObjects(): AsyncIterable<DeepPartial<T>> {
    let accumulated = '';
    let lastPartial: unknown = undefined;

    try {
      for await (const chunk of streamResult.stream) {
        accumulated += chunk.text;

        const partial = parsePartialJSON(accumulated);
        if (partial !== undefined && partial !== lastPartial) {
          lastPartial = partial;
          if (onPartialObject) {
            onPartialObject(partial as DeepPartial<T>);
          }
          yield partial as DeepPartial<T>;
        }
      }

      // Final validation
      const rawText = accumulated;
      try {
        const raw = extractJSON(rawText);
        const parsed = schema.parse(raw);
        resolveObject(parsed);
      } catch (error) {
        rejectObject(error as Error);
      }
    } catch (error) {
      rejectObject(error as Error);
      throw error;
    }
  }

  return {
    partialObjectStream: partialObjects(),
    object: objectPromise,
    rawText: streamResult.text,
    usage: streamResult.usage,
    response: streamResult.response,
  };
}
