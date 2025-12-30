/**
 * Text Generation Domain Types
 *
 * Types and interfaces for text generation with language models.
 *
 * @packageDocumentation
 */

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
 */
export interface ChatMessage {
  /** Role of the message sender */
  role: 'system' | 'user' | 'assistant';

  /** Message content */
  content: string;
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
 *   model: webllm.languageModel('Llama-3.2-1B-Instruct-q4f16'),
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
 *   model: webllm.languageModel('Llama-3.2-1B-Instruct-q4f16'),
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
// PROVIDER FACTORY TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Factory function type for creating language models.
 */
export type LanguageModelFactory = (
  modelId: string,
  settings?: Record<string, unknown>
) => LanguageModel;

