/**
 * Validation Middleware
 *
 * Validate documents before adding to VectorDB.
 *
 * @packageDocumentation
 */

import type { Document } from '../types.js';
import type { VectorDBMiddleware, ValidationMiddlewareOptions } from './types.js';

/**
 * Create validation middleware for VectorDB.
 *
 * @example
 * ```typescript
 * import { createVectorDB, wrapVectorDB, validationMiddleware } from '@localmode/core';
 *
 * const db = await createVectorDB({ name: 'my-db', dimensions: 384 });
 *
 * const validatedDb = wrapVectorDB({
 *   db,
 *   middleware: validationMiddleware({
 *     dimensions: 384,
 *     validateValues: true,
 *     maxTextLength: 100000,
 *   }),
 * });
 * ```
 */
export function validationMiddleware(options: ValidationMiddlewareOptions = {}): VectorDBMiddleware {
  const {
    dimensions,
    validateValues = true,
    validateMetadata = true,
    maxMetadataSize = 1024 * 1024, // 1MB
    maxTextLength = 100 * 1024, // 100KB
    customValidator,
  } = options;

  const validateDocument = (doc: Document): void => {
    // Validate ID
    if (!doc.id || typeof doc.id !== 'string') {
      throw new Error('Document must have a valid string ID');
    }

    // Validate vector dimensions
    if (dimensions !== undefined && doc.vector) {
      if (doc.vector.length !== dimensions) {
        throw new Error(
          `Vector dimension mismatch: expected ${dimensions}, got ${doc.vector.length}`
        );
      }
    }

    // Validate vector values (no NaN or Infinity)
    if (validateValues && doc.vector) {
      for (let i = 0; i < doc.vector.length; i++) {
        const value = doc.vector[i];
        if (!Number.isFinite(value)) {
          throw new Error(`Invalid vector value at index ${i}: ${value}`);
        }
      }
    }

    // Validate text length (if metadata contains __text field)
    const textContent = doc.metadata?.['__text'];
    if (typeof textContent === 'string' && textContent.length > maxTextLength) {
      throw new Error(
        `Text content exceeds maximum length: ${textContent.length} > ${maxTextLength}`
      );
    }

    // Validate metadata size
    if (validateMetadata && doc.metadata) {
      const metadataSize = new Blob([JSON.stringify(doc.metadata)]).size;
      if (metadataSize > maxMetadataSize) {
        throw new Error(
          `Metadata exceeds maximum size: ${metadataSize} > ${maxMetadataSize}`
        );
      }
    }

    // Custom validation
    if (customValidator) {
      const result = customValidator(doc);
      if (typeof result === 'string') {
        throw new Error(`Custom validation failed: ${result}`);
      }
      if (result === false) {
        throw new Error('Custom validation failed');
      }
    }
  };

  return {
    beforeAdd: async (doc: Document) => {
      validateDocument(doc);
      return doc;
    },
  };
}

/**
 * Alias for validationMiddleware.
 */
export const createValidationMiddleware = validationMiddleware;

