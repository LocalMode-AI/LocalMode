/**
 * Encryption Middleware for VectorDB
 *
 * Provides encryption-at-rest for document metadata stored in VectorDB (vectors stay plaintext so the index can search them).
 *
 * @packageDocumentation
 */

import type { VectorDBMiddleware, EncryptionMiddlewareOptions } from '../middleware/types.js';
import type { Document } from '../types.js';
import { ValidationError } from '../errors/index.js';

// ============================================================================
// Encryption Middleware
// ============================================================================

/**
 * Create a VectorDB middleware that encrypts/decrypts documents.
 *
 * Uses AES-GCM encryption via the Web Crypto API. Metadata fields are
 * encrypted before they reach storage and decrypted on `get()` and in search
 * results. Vectors stay in plaintext: the index computes distances over them,
 * so ciphertext vectors could be neither stored (their length differs from the
 * collection's dimensions) nor searched.
 *
 * @param options - Encryption options including the CryptoKey
 * @returns VectorDB middleware
 * @throws {ValidationError} If `encryptVectors: true` is passed
 *
 * @example
 * ```typescript
 * import {
 *   createVectorDB,
 *   wrapVectorDB,
 *   encryptionMiddleware,
 *   deriveEncryptionKey,
 * } from '@localmode/core';
 *
 * // Derive a key from the user's password. Persist `salt` (it is not secret)
 * // and pass it back on the next session to derive the same key.
 * const { key, salt } = await deriveEncryptionKey('user-password');
 *
 * // Wrap a database so metadata is encrypted at rest
 * const db = await createVectorDB({ name: 'encrypted-db', dimensions: 384 });
 * const encryptedDb = wrapVectorDB({
 *   db,
 *   middleware: [encryptionMiddleware({ key })],
 * });
 *
 * // Data is encrypted before storage, decrypted on retrieval
 * await encryptedDb.add({ id: '1', vector, metadata: { secret: 'data' } });
 * ```
 */
export function encryptionMiddleware(options: EncryptionMiddlewareOptions): VectorDBMiddleware {
  const {
    key,
    encryptVectors = false,
    encryptMetadata = true,
    encryptText = true,
    excludeFields = [],
  } = options;

  if (encryptVectors) {
    throw new ValidationError(
      'encryptVectors is not supported: the vector index must read plaintext vectors to store and search them',
      'Omit encryptVectors (metadata is still encrypted). To protect vectors at rest, encrypt an exported snapshot with encryptVector() instead.'
    );
  }

  return {
    beforeAdd: async (document: Document): Promise<Document> => {
      const result: Document = {
        id: document.id,
        vector: document.vector,
        metadata: document.metadata ? { ...document.metadata } : undefined,
      };

      // Encrypt metadata fields
      if (encryptMetadata && result.metadata) {
        const encryptedMetadata: Record<string, unknown> = {};

        for (const [field, value] of Object.entries(result.metadata)) {
          if (excludeFields.includes(field)) {
            encryptedMetadata[field] = value;
          } else if (typeof value === 'string') {
            // String fields stay plaintext when text encryption is disabled.
            encryptedMetadata[field] = encryptText ? await encryptString(value, key) : value;
          } else if (value !== null && typeof value === 'object') {
            encryptedMetadata[field] = await encryptJSON(value, key);
          } else {
            // Primitives (numbers, booleans) - encrypt as string
            encryptedMetadata[field] = await encryptString(JSON.stringify(value), key);
          }
        }

        result.metadata = encryptedMetadata;
      }

      return result;
    },

    afterGet: async (document: Document | undefined): Promise<Document | undefined> => {
      if (!document) return undefined;

      const result: Document = {
        id: document.id,
        vector: document.vector,
        metadata: document.metadata ? { ...document.metadata } : undefined,
      };

      // Decrypt metadata fields
      if (encryptMetadata && result.metadata) {
        const decryptedMetadata: Record<string, unknown> = {};

        for (const [field, value] of Object.entries(result.metadata)) {
          if (excludeFields.includes(field)) {
            decryptedMetadata[field] = value;
          } else if (isEncryptedString(value)) {
            try {
              const decrypted = await decryptString(value as EncryptedString, key);
              // Try to parse as JSON for complex types
              try {
                decryptedMetadata[field] = JSON.parse(decrypted);
              } catch {
                decryptedMetadata[field] = decrypted;
              }
            } catch {
              // Decryption failed, keep original
              decryptedMetadata[field] = value;
            }
          } else {
            decryptedMetadata[field] = value;
          }
        }

        result.metadata = decryptedMetadata;
      }

      return result;
    },

    afterSearch: async (results) => {
      // Decrypt metadata in search results
      if (!encryptMetadata) return results;

      return Promise.all(
        results.map(async (result) => {
          if (!result.metadata) return result;

          const decryptedMetadata: Record<string, unknown> = {};

          for (const [field, value] of Object.entries(result.metadata)) {
            if (excludeFields.includes(field)) {
              decryptedMetadata[field] = value;
            } else if (isEncryptedString(value)) {
              try {
                const decrypted = await decryptString(value as EncryptedString, key);
                try {
                  decryptedMetadata[field] = JSON.parse(decrypted);
                } catch {
                  decryptedMetadata[field] = decrypted;
                }
              } catch {
                decryptedMetadata[field] = value;
              }
            } else {
              decryptedMetadata[field] = value;
            }
          }

          return { ...result, metadata: decryptedMetadata };
        })
      );
    },
  };
}

// ============================================================================
// Encryption Helpers
// ============================================================================

/**
 * Encrypted string format (stored as JSON string).
 */
interface EncryptedString {
  __encrypted: true;
  ciphertext: string;
  iv: string;
}

/**
 * Check if a value is an encrypted string.
 */
function isEncryptedString(value: unknown): value is EncryptedString {
  return (
    typeof value === 'object' &&
    value !== null &&
    '__encrypted' in value &&
    (value as EncryptedString).__encrypted === true
  );
}

/**
 * Encrypt a string using AES-GCM.
 */
async function encryptString(text: string, key: CryptoKey): Promise<EncryptedString> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);

  return {
    __encrypted: true,
    ciphertext: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(iv.buffer),
  };
}

/**
 * Decrypt an encrypted string.
 */
async function decryptString(encrypted: EncryptedString, key: CryptoKey): Promise<string> {
  const ciphertext = base64ToArrayBuffer(encrypted.ciphertext);
  const iv = base64ToArrayBuffer(encrypted.iv);

  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(iv) }, key, ciphertext);

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

/**
 * Encrypt a JSON object.
 */
async function encryptJSON(data: unknown, key: CryptoKey): Promise<EncryptedString> {
  return encryptString(JSON.stringify(data), key);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Convert ArrayBuffer to base64 string.
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert base64 string to ArrayBuffer.
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// ============================================================================
// Key Derivation
// ============================================================================

/**
 * Derive an AES-GCM encryption key from a password.
 *
 * @param password - The password to derive the key from
 * @param salt - Optional salt (will be generated if not provided)
 * @param iterations - PBKDF2 iterations (default: 100000)
 * @returns The derived CryptoKey and salt used
 *
 * @example
 * ```typescript
 * const { key, salt } = await deriveEncryptionKey('user-password');
 * // Store salt securely for later key derivation
 * localStorage.setItem('encryption-salt', salt);
 * ```
 */
export async function deriveEncryptionKey(
  password: string,
  salt?: string | Uint8Array,
  iterations: number = 100000
): Promise<{ key: CryptoKey; salt: string }> {
  const encoder = new TextEncoder();
  let saltBytes: Uint8Array;
  
  if (!salt) {
    saltBytes = crypto.getRandomValues(new Uint8Array(16));
  } else if (salt instanceof Uint8Array) {
    saltBytes = salt;
  } else {
    saltBytes = new Uint8Array(base64ToArrayBuffer(salt));
  }

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  return {
    key,
    salt: arrayBufferToBase64(saltBytes.buffer as ArrayBuffer),
  };
}

/**
 * Alias for deriveEncryptionKey for backward compatibility.
 * 
 * @deprecated Use deriveEncryptionKey instead
 */
export const deriveKey = deriveEncryptionKey;

