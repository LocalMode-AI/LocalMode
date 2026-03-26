/**
 * @localmode/ai-sdk
 *
 * AI SDK provider for LocalMode — use local models with
 * generateText(), streamText(), and embed() from the `ai` package.
 *
 * @packageDocumentation
 */

export { createLocalMode } from './provider.js';
export { LocalModeLanguageModel } from './language-model.js';
export { LocalModeEmbeddingModel } from './embedding-model.js';
export { mapFinishReason, convertPrompt } from './utils.js';
export type { LocalModeProviderOptions, LocalModeProvider } from './types.js';
