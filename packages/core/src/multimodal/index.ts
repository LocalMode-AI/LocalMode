/**
 * Multimodal Embeddings Domain
 *
 * Functions and types for cross-modal embedding (text + image in shared vector space).
 *
 * @packageDocumentation
 */

// ═══════════════════════════════════════════════════════════════
// FUNCTIONS
// ═══════════════════════════════════════════════════════════════

export {
  embedImage,
  embedManyImages,
  setGlobalMultimodalEmbeddingProvider,
} from './embed-image.js';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export * from './types.js';
