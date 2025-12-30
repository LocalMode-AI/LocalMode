/**
 * Security Module
 *
 * Provides encryption, PII redaction, and security utilities.
 *
 * @packageDocumentation
 */

// Encryption utilities
export {
  encrypt,
  decrypt,
  decryptString,
  encryptVector,
  decryptVector,
  encryptJSON,
  decryptJSON,
  hashPassphrase,
  verifyPassphrase,
  isCryptoSupported,
  type EncryptionConfig,
  type EncryptedData,
} from './crypto.js';

// Keystore
export { Keystore, createKeystore, type KeyMetadata } from './keystore.js';

// PII Redaction
export {
  redactPII,
  detectPII,
  hasPII,
  piiRedactionMiddleware,
  piiRedactionVectorDBMiddleware,
  PII_PATTERNS,
  DEFAULT_PII_REPLACEMENTS,
  type PIIRedactionOptions,
  type PIIDetectionResult,
  type PIIDetection,
  type PIIType,
} from './pii.js';

// Encryption Middleware
export {
  encryptionMiddleware,
  deriveEncryptionKey,
  deriveKey, // Alias for backward compatibility
} from './encryption-middleware.js';
