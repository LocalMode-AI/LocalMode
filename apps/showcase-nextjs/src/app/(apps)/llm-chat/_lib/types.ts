/**
 * @file types.ts
 * @description Type definitions for the local-chat application
 */

/** Message role in a chat conversation */
export type MessageRole = 'user' | 'assistant' | 'system';

/** Inference backend discriminator */
export type ModelBackend = 'webgpu' | 'wasm' | 'onnx';

/** Backend filter for the model sidebar tabs */
export type BackendFilter = 'all' | ModelBackend;

/** Chat message representing a single message in conversation */
export interface ChatMessage {
  /** Unique message identifier */
  id: string;
  /** Who sent the message */
  role: MessageRole;
  /** Message content — string for text-only, ContentPart[] for multimodal */
  content: string | import('@localmode/core').ContentPart[];
  /** When the message was created */
  timestamp: Date;
  /** Whether this message was served from the semantic cache */
  cached?: boolean;
  /** Cache lookup duration in milliseconds (only present on cached messages) */
  cacheDurationMs?: number;
  /** Agent steps that produced this message (only present on agent-mode assistant messages) */
  agentSteps?: AgentStepDisplay[];
}

/** Semantic cache statistics for display */
export interface CacheStats {
  /** Number of cached entries */
  entries: number;
  /** Total cache hits since creation */
  hits: number;
  /** Total cache misses since creation */
  misses: number;
  /** Hit rate (hits / (hits + misses)), 0 if no lookups */
  hitRate: number;
}

/** Model size category for filtering */
export type ModelCategory = 'tiny' | 'small' | 'medium' | 'large';

/** Model information with cache status */
export interface ModelInfo {
  /** Unique model identifier (WebLLM model ID or wllama GGUF key) */
  id: string;
  /** Display name of the model */
  name: string;
  /** Maximum context length in tokens */
  contextLength: number;
  /** Human-readable size (e.g., "1.5GB") */
  size: string;
  /** Size in bytes */
  sizeBytes: number;
  /** Model description */
  description: string;
  /** Size category */
  category: ModelCategory;
  /** Inference backend for this model */
  backend: ModelBackend;
  /** Whether the model is cached locally */
  isCached: boolean;
  /** Whether this model supports vision (image) input */
  vision?: boolean;
}

/** An image attached to a chat message for vision models */
export interface ChatImageAttachment {
  /** Base64-encoded image data (without data: prefix) */
  data: string;
  /** MIME type (e.g., 'image/jpeg', 'image/png') */
  mimeType: string;
  /** Original filename for display */
  name: string;
  /** Object URL for preview rendering */
  previewUrl: string;
}

/** Display info for a backend badge */
export interface BackendDisplayInfo {
  /** Badge label */
  label: string;
  /** Secondary detail line (e.g., runtime/format context) */
  detail: string;
  /** Acceleration type shown in model info line (e.g., "WebGPU", "WASM") */
  accel: string;
  /** Model format shown in model info line (e.g., "MLC", "ONNX", "GGUF") */
  format: string;
  /** Text color class */
  color: string;
  /** Background color class */
  bgColor: string;
  /** Border color class */
  borderColor: string;
}

/** Category display information for UI */
export interface CategoryInfo {
  /** Category title */
  title: string;
  /** Category subtitle/description */
  subtitle: string;
  /** Text color class */
  color: string;
  /** Background color class */
  bgColor: string;
  /** Border color class */
  borderColor: string;
}

/** Application state for routing */
export type AppState = 'model-selection' | 'chat';

/** Application error for UI display */
export interface AppError {
  /** Error message for display */
  message: string;
  /** Error code for programmatic handling */
  code?: string;
  /** Whether the error is recoverable */
  recoverable?: boolean;
}

/** Display information for an agent step in the chat interface */
export interface AgentStepDisplay {
  /** Zero-based step number */
  index: number;
  /** Step type — tool_call or finish */
  type: 'tool_call' | 'finish';
  /** Name of the tool called (for tool_call steps) */
  toolName?: string;
  /** Arguments passed to the tool */
  toolArgs?: Record<string, unknown>;
  /** Tool result text */
  observation?: string;
  /** Time spent on this step in milliseconds */
  durationMs: number;
}

/** Display info for an agent tool badge in the header */
export interface AgentToolInfo {
  /** Tool name */
  name: string;
  /** Human-readable description */
  description: string;
  /** Tailwind color class for the badge */
  color: string;
}
