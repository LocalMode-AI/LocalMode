/**
 * @file types.ts
 * @description Type definitions for the local-chat application
 */
import type { WebLLMModelId } from '@localmode/webllm';

/** Message role in a chat conversation */
export type MessageRole = 'user' | 'assistant' | 'system';

/** Chat message representing a single message in conversation */
export interface ChatMessage {
  /** Unique message identifier */
  id: string;
  /** Who sent the message */
  role: MessageRole;
  /** Message content */
  content: string;
  /** When the message was created */
  timestamp: Date;
}

/** Model size category for filtering */
export type ModelCategory = 'tiny' | 'small' | 'medium' | 'large';

/** Model information with cache status */
export interface ModelInfo {
  /** Unique model identifier */
  id: WebLLMModelId;
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
  /** Whether the model is cached locally */
  isCached: boolean;
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
