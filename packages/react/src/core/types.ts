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

/** Return type for the useChat hook */
export interface UseChatReturn {
  /** All messages in the conversation */
  messages: ReactChatMessage[];
  /** Whether the assistant is currently streaming a response */
  isStreaming: boolean;
  /** Error from the last failed operation */
  error: Error | null;
  /** Send a user message and stream the assistant response */
  send: (text: string, options?: { images?: ImageAttachment[] }) => Promise<void>;
  /** Cancel the current streaming response */
  cancel: () => void;
  /** Clear all messages (and persisted storage) */
  clearMessages: () => void;
  /** Update the system prompt for future requests */
  setSystemPrompt: (prompt: string) => void;
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
}

/** Return type for the useSemanticSearch hook */
export interface UseSemanticSearchReturn {
  /** Search results from the last query */
  results: Array<{ id: string; content: string; metadata: Record<string, unknown>; score: number }>;
  /** Whether a search is currently running */
  isSearching: boolean;
  /** Error from the last failed search */
  error: Error | null;
  /** Execute a semantic search query */
  search: (query: string) => Promise<void>;
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
