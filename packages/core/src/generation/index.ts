/**
 * Text Generation Domain
 *
 * Functions and types for text generation with language models.
 *
 * @packageDocumentation
 */

// ═══════════════════════════════════════════════════════════════
// FUNCTIONS
// ═══════════════════════════════════════════════════════════════

export { generateText, setGlobalLanguageModelProvider } from './generate-text.js';
export { streamText } from './stream-text.js';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type {
  // Common types
  GenerationUsage,
  GenerationResponse,
  FinishReason,
  ChatMessage,
  // Model interface
  LanguageModel,
  DoGenerateOptions,
  DoGenerateResult,
  DoStreamOptions,
  StreamChunk,
  // generateText() types
  GenerateTextOptions,
  GenerateTextResult,
  // streamText() types
  StreamTextOptions,
  StreamTextResult,
  // Factory types
  LanguageModelFactory,
} from './types.js';

