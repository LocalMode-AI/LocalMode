/**
 * Text Generation Domain Types
 *
 * Types and interfaces for text generation with language models.
 * Supports multimodal content (text + images) via ContentPart types.
 *
 * @packageDocumentation
 */

// ═══════════════════════════════════════════════════════════════
// MULTIMODAL CONTENT TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * A text content part within a multimodal message.
 *
 * @example
 * ```ts
 * const part: TextPart = { type: 'text', text: 'What is in this image?' };
 * ```
 */
export interface TextPart {
  /** Discriminator for text content */
  type: 'text';

  /** The text content */
  text: string;
}

/**
 * An image content part within a multimodal message.
 *
 * Images are represented as base64-encoded data with a MIME type.
 * This is the canonical browser representation — images from
 * FileReader, canvas, or clipboard all produce base64.
 *
 * @example
 * ```ts
 * const part: ImagePart = {
 *   type: 'image',
 *   data: 'iVBORw0KGgo...', // base64 without data: prefix
 *   mimeType: 'image/png',
 * };
 * ```
 */
export interface ImagePart {
  /** Discriminator for image content */
  type: 'image';

  /** Base64-encoded image data (without `data:` URI prefix) */
  data: string;

  /** MIME type (e.g., 'image/jpeg', 'image/png', 'image/webp', 'image/gif') */
  mimeType: string;
}

/**
 * A single part of multimodal message content.
 *
 * Used when a message contains mixed content types (text + images).
 * Discriminated via the `type` field.
 *
 * @example
 * ```ts
 * const parts: ContentPart[] = [
 *   { type: 'text', text: 'Describe this image' },
 *   { type: 'image', data: 'iVBOR...', mimeType: 'image/jpeg' },
 * ];
 * ```
 */
export type ContentPart = TextPart | ImagePart;

// ═══════════════════════════════════════════════════════════════
// COMMON TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Usage information for text generation.
 */
export interface GenerationUsage {
  /** Number of input tokens processed */
  inputTokens: number;

  /** Number of output tokens generated */
  outputTokens: number;

  /** Total tokens (input + output) */
  totalTokens: number;

  /** Time spent on generation (milliseconds) */
  durationMs: number;
}

/**
 * Response metadata for text generation.
 */
export interface GenerationResponse {
  /** Optional request ID */
  id?: string;

  /** Model ID used */
  modelId: string;

  /** Timestamp of the response */
  timestamp: Date;
}

/**
 * Reason for generation completion.
 */
export type FinishReason = 'stop' | 'length' | 'content_filter' | 'error';

/**
 * A single message in a conversation.
 *
 * Content can be a plain string (text-only) or an array of content parts
 * for multimodal messages (text + images).
 *
 * @example Text-only message
 * ```ts
 * const msg: ChatMessage = { role: 'user', content: 'Hello' };
 * ```
 *
 * @example Multimodal message
 * ```ts
 * const msg: ChatMessage = {
 *   role: 'user',
 *   content: [
 *     { type: 'text', text: 'What is in this image?' },
 *     { type: 'image', data: 'iVBOR...', mimeType: 'image/jpeg' },
 *   ],
 * };
 * ```
 */
export interface ChatMessage {
  /** Role of the message sender */
  role: 'system' | 'user' | 'assistant';

  /** Message content — string for text-only, ContentPart[] for multimodal */
  content: string | ContentPart[];
}

// ═══════════════════════════════════════════════════════════════
// LANGUAGE MODEL INTERFACE
// ═══════════════════════════════════════════════════════════════

/**
 * Interface for language models (LLMs).
 *
 * Providers implement this interface to enable text generation.
 */
export interface LanguageModel {
  /** Unique identifier for this model */
  readonly modelId: string;

  /** Provider name */
  readonly provider: string;

  /** Maximum context length in tokens */
  readonly contextLength: number;

  /**
   * Whether this model supports vision (image) input.
   * When `true`, the model accepts `ImagePart` content in messages.
   * Defaults to `false` / `undefined` for text-only models.
   */
  readonly supportsVision?: boolean;

  /**
   * Generate text completion.
   *
   * @param options - Generation options
   * @returns Promise with generation result
   */
  doGenerate(options: DoGenerateOptions): Promise<DoGenerateResult>;

  /**
   * Stream text generation (optional).
   *
   * @param options - Stream options
   * @returns AsyncIterable of stream chunks
   */
  doStream?(options: DoStreamOptions): AsyncIterable<StreamChunk>;
}

/**
 * Options passed to LanguageModel.doGenerate()
 */
export interface DoGenerateOptions {
  /** The prompt to generate from */
  prompt: string;

  /** Optional system prompt */
  systemPrompt?: string;

  /** Messages for chat-style generation */
  messages?: ChatMessage[];

  /** Maximum tokens to generate */
  maxTokens?: number;

  /** Temperature for sampling (0-2) */
  temperature?: number;

  /** Top-p sampling */
  topP?: number;

  /** Stop sequences */
  stopSequences?: string[];

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from LanguageModel.doGenerate()
 */
export interface DoGenerateResult {
  /** Generated text */
  text: string;

  /** Reason for completion */
  finishReason: FinishReason;

  /** Usage information */
  usage: GenerationUsage;
}

/**
 * Options passed to LanguageModel.doStream()
 */
export interface DoStreamOptions extends DoGenerateOptions {}

/**
 * A chunk from streaming generation.
 */
export interface StreamChunk {
  /** Text delta */
  text: string;

  /** Whether this is the final chunk */
  done: boolean;

  /** Finish reason (only on final chunk) */
  finishReason?: FinishReason;

  /** Usage information (only on final chunk) */
  usage?: GenerationUsage;
}

// ═══════════════════════════════════════════════════════════════
// GENERATE TEXT FUNCTION OPTIONS & RESULTS
// ═══════════════════════════════════════════════════════════════

/**
 * Options for the generateText() function.
 *
 * @example
 * ```ts
 * const { text } = await generateText({
 *   model: webllm.languageModel('Llama-3.2-1B-Instruct-q4f16_1-MLC'),
 *   prompt: 'Explain quantum computing in simple terms',
 *   maxTokens: 200,
 * });
 * ```
 */
export interface GenerateTextOptions {
  /** The language model to use */
  model: LanguageModel | string;

  /** The prompt to generate from */
  prompt: string;

  /** Optional system prompt */
  systemPrompt?: string;

  /** Messages for chat-style generation */
  messages?: ChatMessage[];

  /** Maximum tokens to generate (default: 256) */
  maxTokens?: number;

  /** Temperature for sampling (0-2, default: 0.7) */
  temperature?: number;

  /** Top-p sampling (default: 1.0) */
  topP?: number;

  /** Stop sequences */
  stopSequences?: string[];

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Maximum retry attempts (default: 2) */
  maxRetries?: number;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from the generateText() function.
 */
export interface GenerateTextResult {
  /** Generated text */
  text: string;

  /** Reason for completion */
  finishReason: FinishReason;

  /** Usage information */
  usage: GenerationUsage;

  /** Response metadata */
  response: GenerationResponse;
}

// ═══════════════════════════════════════════════════════════════
// STREAM TEXT FUNCTION OPTIONS & RESULTS
// ═══════════════════════════════════════════════════════════════

/**
 * Options for the streamText() function.
 *
 * @example
 * ```ts
 * const stream = await streamText({
 *   model: webllm.languageModel('Llama-3.2-1B-Instruct-q4f16_1-MLC'),
 *   prompt: 'Write a story about a robot',
 *   maxTokens: 500,
 * });
 *
 * for await (const chunk of stream) {
 *   process.stdout.write(chunk.text);
 * }
 * ```
 */
export interface StreamTextOptions {
  /** The language model to use */
  model: LanguageModel | string;

  /** The prompt to generate from */
  prompt: string;

  /** Optional system prompt */
  systemPrompt?: string;

  /** Messages for chat-style generation */
  messages?: ChatMessage[];

  /** Maximum tokens to generate (default: 256) */
  maxTokens?: number;

  /** Temperature for sampling (0-2, default: 0.7) */
  temperature?: number;

  /** Top-p sampling (default: 1.0) */
  topP?: number;

  /** Stop sequences */
  stopSequences?: string[];

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Maximum retry attempts (default: 2) */
  maxRetries?: number;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;

  /** Callback for each chunk */
  onChunk?: (chunk: StreamChunk) => void;
}

/**
 * Result from the streamText() function.
 */
export interface StreamTextResult {
  /** AsyncIterable of text chunks */
  stream: AsyncIterable<StreamChunk>;

  /** Promise that resolves to the full text when complete */
  text: Promise<string>;

  /** Promise that resolves to usage when complete */
  usage: Promise<GenerationUsage>;

  /** Response metadata */
  response: GenerationResponse;
}

// ═══════════════════════════════════════════════════════════════
// STRUCTURED OUTPUT TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Recursively makes all properties optional.
 * Used for streaming partial objects in streamObject().
 */
export type DeepPartial<T> = T extends object
  ? { [P in keyof T]?: DeepPartial<T[P]> }
  : T;

/**
 * Output mode for structured generation.
 *
 * - `'json'` — Generate a JSON object matching the schema (default)
 * - `'array'` — Generate a JSON array of objects matching the schema
 * - `'enum'` — Generate one value from a set of allowed values
 */
export type ObjectOutputMode = 'json' | 'array' | 'enum';

/**
 * Schema definition for structured output.
 * Accepts a Zod schema (via jsonSchema()) or any object with parse + jsonSchema.
 *
 * @typeParam T - The type that the schema validates to
 */
export interface ObjectSchema<T = unknown> {
  /** Validate and parse raw value against the schema */
  parse: (value: unknown) => T;

  /** JSON Schema representation (for prompt construction) */
  jsonSchema: Record<string, unknown>;

  /** Human-readable description of the schema */
  description?: string;
}

/**
 * Options for the generateObject() function.
 *
 * @typeParam T - The expected output type defined by the schema
 *
 * @example
 * ```ts
 * import { generateObject, jsonSchema } from '@localmode/core';
 * import { webllm } from '@localmode/webllm';
 * import { z } from 'zod';
 *
 * const { object } = await generateObject({
 *   model: webllm.languageModel('Qwen3-1.7B-q4f16_1-MLC'),
 *   schema: jsonSchema(z.object({ name: z.string(), age: z.number() })),
 *   prompt: 'Extract: John is 30 years old',
 * });
 * // object: { name: "John", age: 30 }
 * ```
 */
export interface GenerateObjectOptions<T> {
  /** The language model to use */
  model: LanguageModel | string;

  /** Schema defining the expected output structure */
  schema: ObjectSchema<T>;

  /** The prompt describing what to extract/generate */
  prompt: string;

  /** Optional system prompt (appended to schema instructions) */
  systemPrompt?: string;

  /** Output mode (default: 'json') */
  mode?: ObjectOutputMode;

  /** Messages for chat-style generation */
  messages?: ChatMessage[];

  /** Maximum tokens to generate (default: 1024) */
  maxTokens?: number;

  /** Temperature for sampling (default: 0 for deterministic output) */
  temperature?: number;

  /** Top-p sampling (default: 1.0) */
  topP?: number;

  /** Maximum validation+retry attempts (default: 3) */
  maxRetries?: number;

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from the generateObject() function.
 *
 * @typeParam T - The parsed object type
 */
export interface GenerateObjectResult<T> {
  /** The parsed, validated object */
  object: T;

  /** Raw text from the model (before parsing) */
  rawText: string;

  /** Reason for completion */
  finishReason: FinishReason;

  /** Usage information (includes all retry attempts) */
  usage: GenerationUsage;

  /** Response metadata */
  response: GenerationResponse;

  /** Number of attempts needed (1 = first try worked) */
  attempts: number;
}

/**
 * Options for the streamObject() function.
 *
 * @typeParam T - The expected output type defined by the schema
 *
 * @example
 * ```ts
 * import { streamObject, jsonSchema } from '@localmode/core';
 * import { webllm } from '@localmode/webllm';
 * import { z } from 'zod';
 *
 * const result = await streamObject({
 *   model: webllm.languageModel('Qwen3-1.7B-q4f16_1-MLC'),
 *   schema: jsonSchema(z.object({ name: z.string(), items: z.array(z.string()) })),
 *   prompt: 'Generate a shopping list for a BBQ',
 * });
 *
 * for await (const partial of result.partialObjectStream) {
 *   console.log(partial); // { name: "BBQ", items: ["burgers", ...] }
 * }
 *
 * const final = await result.object; // fully validated
 * ```
 */
export interface StreamObjectOptions<T> {
  /** The language model to use */
  model: LanguageModel | string;

  /** Schema defining the expected output structure */
  schema: ObjectSchema<T>;

  /** The prompt */
  prompt: string;

  /** Optional system prompt */
  systemPrompt?: string;

  /** Output mode (default: 'json') */
  mode?: ObjectOutputMode;

  /** Messages for chat-style generation */
  messages?: ChatMessage[];

  /** Maximum tokens to generate (default: 1024) */
  maxTokens?: number;

  /** Temperature for sampling (default: 0) */
  temperature?: number;

  /** Top-p sampling (default: 1.0) */
  topP?: number;

  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;

  /** Callback for each partial object update */
  onPartialObject?: (partial: DeepPartial<T>) => void;

  /** Provider-specific options */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/**
 * Result from the streamObject() function.
 *
 * @typeParam T - The parsed object type
 */
export interface StreamObjectResult<T> {
  /** AsyncIterable of partial objects as they're built */
  partialObjectStream: AsyncIterable<DeepPartial<T>>;

  /** Promise that resolves to the final validated object */
  object: Promise<T>;

  /** Promise that resolves to the raw text */
  rawText: Promise<string>;

  /** Promise that resolves to usage when complete */
  usage: Promise<GenerationUsage>;

  /** Response metadata */
  response: GenerationResponse;
}

// ═══════════════════════════════════════════════════════════════
// PROVIDER FACTORY TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Factory function type for creating language models.
 */
export type LanguageModelFactory = (
  modelId: string,
  settings?: Record<string, unknown>
) => LanguageModel;

// ═══════════════════════════════════════════════════════════════
// LANGUAGE MODEL MIDDLEWARE
// ═══════════════════════════════════════════════════════════════

/**
 * Middleware for wrapping language models.
 *
 * Mirrors the structure of {@link EmbeddingModelMiddleware} for consistency.
 * Each hook is optional and provides a different interception point.
 *
 * @example Logging middleware
 * ```ts
 * const loggingMiddleware: LanguageModelMiddleware = {
 *   wrapGenerate: async ({ doGenerate, prompt, model }) => {
 *     console.log(`Generating with ${model.modelId}: ${prompt.slice(0, 50)}`);
 *     const start = Date.now();
 *     const result = await doGenerate();
 *     console.log(`Completed in ${Date.now() - start}ms`);
 *     return result;
 *   },
 * };
 * ```
 *
 * @example Guardrails middleware
 * ```ts
 * const guardrailsMiddleware: LanguageModelMiddleware = {
 *   transformParams: async ({ prompt, systemPrompt, messages }) => ({
 *     prompt: sanitize(prompt),
 *     systemPrompt,
 *     messages,
 *   }),
 * };
 * ```
 *
 * @see {@link wrapLanguageModel} - Apply middleware to a model
 * @see {@link composeLanguageModelMiddleware} - Compose multiple middleware
 */
export interface LanguageModelMiddleware {
  /**
   * Transform generation parameters before calling the model.
   * Called before doGenerate or doStream with the original parameters.
   */
  transformParams?: (params: {
    prompt: string;
    systemPrompt?: string;
    messages?: ChatMessage[];
  }) => Promise<{ prompt: string; systemPrompt?: string; messages?: ChatMessage[] }> | { prompt: string; systemPrompt?: string; messages?: ChatMessage[] };

  /**
   * Wrap the generate call (for caching, logging, retry, etc.).
   * Called with the doGenerate function, prompt, and model reference.
   * The middleware controls whether the original model is called.
   */
  wrapGenerate?: (options: {
    doGenerate: () => Promise<DoGenerateResult>;
    prompt: string;
    model: LanguageModel;
  }) => Promise<DoGenerateResult>;

  /**
   * Wrap the stream call (for caching, logging, retry, etc.).
   * Called with the doStream function, prompt, and model reference.
   * The middleware controls whether the original model's stream is used.
   */
  wrapStream?: (options: {
    doStream: () => AsyncIterable<StreamChunk>;
    prompt: string;
    model: LanguageModel;
  }) => AsyncIterable<StreamChunk>;
}

