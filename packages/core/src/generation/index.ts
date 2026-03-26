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
export { generateObject } from './generate-object.js';
export { streamObject } from './stream-object.js';
export { jsonSchema, extractJSON, parsePartialJSON, buildStructuredPrompt } from './schema.js';

// ═══════════════════════════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════════════════════════

export { wrapLanguageModel, composeLanguageModelMiddleware } from './middleware.js';

// ═══════════════════════════════════════════════════════════════
// CONTENT UTILITIES
// ═══════════════════════════════════════════════════════════════

export { normalizeContent, getTextContent } from './content.js';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type {
  // Multimodal content types
  TextPart,
  ImagePart,
  ContentPart,
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
  // Structured output types
  ObjectSchema,
  ObjectOutputMode,
  GenerateObjectOptions,
  GenerateObjectResult,
  StreamObjectOptions,
  StreamObjectResult,
  DeepPartial,
  // Factory types
  LanguageModelFactory,
  // Middleware types
  LanguageModelMiddleware,
} from './types.js';

