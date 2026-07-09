/**
 * @file types.ts
 * @description Shared types for @localmode/react hooks
 */

// ═══════════════════════════════════════════════════════════════
// BASE HOOK RETURN TYPES
// ═══════════════════════════════════════════════════════════════

/** Return type for useOperation-based hooks */
export interface UseOperationReturn<TOutput> {
  /** Result data from the last successful execution */
  data: TOutput | null;
  /** Error from the last failed execution */
  error: Error | null;
  /** Whether an operation is currently running */
  isLoading: boolean;
  /** Execute the operation */
  execute: (...args: unknown[]) => Promise<TOutput | null>;
  /** Cancel the current operation */
  cancel: () => void;
  /** Reset state to initial values */
  reset: () => void;
}

/** Return type for useStreaming-based hooks */
export interface UseStreamingReturn {
  /** Accumulated text content from streaming */
  content: string;
  /** Whether streaming is currently active */
  isStreaming: boolean;
  /** Error from the last failed stream */
  error: Error | null;
  /** Send input to start streaming */
  send: (input: string) => Promise<void>;
  /** Cancel the current stream */
  cancel: () => void;
  /** Reset state to initial values */
  reset: () => void;
}

// ═══════════════════════════════════════════════════════════════
// CHAT TYPES
// ═══════════════════════════════════════════════════════════════

/** A chat message with metadata for the React useChat hook */
export interface ReactChatMessage {
  /** Unique message identifier */
  id: string;
  /** Who sent the message */
  role: 'user' | 'assistant' | 'system';
  /** Message content — string for text-only, ContentPart[] for multimodal */
  content: string | import('@localmode/core').ContentPart[];
  /** When the message was created */
  timestamp: Date;
}

/** An image attachment for sending with chat messages */
export interface ImageAttachment {
  /** Base64-encoded image data (without data: prefix) */
  data: string;
  /** MIME type (e.g., 'image/jpeg', 'image/png') */
  mimeType: string;
  /** Original filename for display purposes */
  name?: string;
}

/** Options for the useChat hook */
export interface UseChatOptions {
  /** The language model to use for generation */
  model: import('@localmode/core').LanguageModel;
  /** System prompt to include in all requests */
  systemPrompt?: string;
  /** Maximum tokens to generate per response */
  maxTokens?: number;
  /** Sampling temperature */
  temperature?: number;
  /** Whether to persist messages to IndexedDB (default: true) */
  persist?: boolean;
  /** IndexedDB storage key for message persistence (default: 'localmode-chat-messages') */
  persistKey?: string;
  /** Initial messages to populate when no persisted data exists */
  initialMessages?: ReactChatMessage[];
}

/**
 * Lifecycle status of the useChat hook.
 *
 * - `'ready'` — idle, no request in flight
 * - `'submitted'` — send/regenerate called, first chunk not yet arrived
 * - `'streaming'` — chunks are flowing
 * - `'error'` — the last request failed
 */
export type ChatStatus = 'ready' | 'submitted' | 'streaming' | 'error';

/** Return type for the useChat hook */
export interface UseChatReturn {
  /** All messages in the conversation */
  messages: ReactChatMessage[];
  /** Whether the assistant is currently streaming a response */
  isStreaming: boolean;
  /** Error from the last failed operation */
  error: Error | null;
  /** Token usage from the last completed turn (null until a turn completes) */
  usage: import('@localmode/core').GenerationUsage | null;
  /** Cumulative token usage across all completed turns this session */
  totalUsage: import('@localmode/core').GenerationUsage;
  /** Lifecycle status of the current request */
  status: ChatStatus;
  /** ID of the assistant message currently being streamed (null when idle) */
  streamingMessageId: string | null;
  /** Text variants for the last assistant turn (index 0 is the original reply) */
  variants: string[];
  /** Index of the variant currently shown as the last assistant message */
  variantIndex: number;
  /** Send a user message and stream the assistant response */
  send: (text: string, options?: { images?: ImageAttachment[]; providerOptions?: Record<string, Record<string, unknown>> }) => Promise<void>;
  /** Cancel the current streaming response */
  cancel: () => void;
  /** Clear all messages (and persisted storage) */
  clearMessages: () => void;
  /** Replace all messages; the new state is persisted when persistence is enabled */
  setMessages: (messages: ReactChatMessage[]) => void;
  /** Update the system prompt for future requests */
  setSystemPrompt: (prompt: string) => void;
  /** Re-run the last user turn, appending the result as a new variant of the last assistant reply */
  regenerate: () => Promise<void>;
  /** Show the variant at the given index as the last assistant message (clamped to valid range) */
  setVariantIndex: (index: number) => void;
}

// ═══════════════════════════════════════════════════════════════
// SEMANTIC SEARCH TYPES
// ═══════════════════════════════════════════════════════════════

/** Options for the useSemanticSearch hook */
export interface UseSemanticSearchOptions {
  /** The embedding model to use */
  model: import('@localmode/core').EmbeddingModel;
  /** The vector database to search (any object with a search method) */
  db: import('@localmode/core').SemanticSearchDB;
  /** Number of results to return (default: 10) */
  topK?: number;
  /** Metadata filter to apply to every search */
  filter?: Record<string, unknown>;
  /** Minimum similarity threshold for results */
  threshold?: number;
}

/** Per-call overrides for useSemanticSearch's search() function */
export interface SemanticSearchCallOptions {
  /** Metadata filter for this call (overrides the hook-level filter) */
  filter?: Record<string, unknown>;
  /** Minimum similarity threshold for this call (overrides the hook-level threshold) */
  threshold?: number;
  /** Number of results for this call (overrides the hook-level topK) */
  topK?: number;
}

/** Return type for the useSemanticSearch hook */
export interface UseSemanticSearchReturn {
  /** Search results from the last query */
  results: Array<{ id: string; content: string; metadata: Record<string, unknown>; score: number }>;
  /** Whether a search is currently running */
  isSearching: boolean;
  /** Error from the last failed search */
  error: Error | null;
  /** Usage information from the last completed search (null until a search completes) */
  usage: import('@localmode/core').SemanticSearchUsage | null;
  /** Execute a semantic search query, optionally overriding filter/threshold/topK for this call */
  search: (query: string, options?: SemanticSearchCallOptions) => Promise<void>;
  /** Reset results and error state */
  reset: () => void;
}

// ═══════════════════════════════════════════════════════════════
// PIPELINE TYPES
// ═══════════════════════════════════════════════════════════════

/** A single step in a pipeline */
export interface PipelineStep<TIn = unknown, TOut = unknown> {
  /** Human-readable name for the step */
  name: string;
  /** Async function that processes input and returns output */
  execute: (input: TIn, signal: AbortSignal) => Promise<TOut>;
}

/** Progress information for a running pipeline */
export interface PipelineProgress {
  /** Number of steps completed */
  completed: number;
  /** Total number of steps */
  total: number;
  /** Name of the currently executing step */
  currentStep: string;
}

/** Return type for the usePipeline hook */
export interface UsePipelineReturn<TResult = unknown> {
  /** Final result from the last successful pipeline run */
  result: TResult | null;
  /** Whether the pipeline is currently running */
  isRunning: boolean;
  /** Error from the last failed run */
  error: Error | null;
  /** Name of the currently executing step (null when not running) */
  currentStep: string | null;
  /** Progress information */
  progress: PipelineProgress | null;
  /** Execute the pipeline with initial input */
  execute: (input: unknown) => Promise<TResult | null>;
  /** Cancel the current pipeline run */
  cancel: () => void;
  /** Reset all state */
  reset: () => void;
}
