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

// Differential Privacy - Noise Mechanisms
export { gaussianNoise, laplacianNoise, addNoise } from './dp-noise.js';

// Differential Privacy - Sensitivity
export {
  lookupSensitivity,
  getSensitivity,
  calibrateSensitivity,
  resolveSensitivity,
} from './dp-sensitivity.js';

// Differential Privacy - Budget
export { createPrivacyBudget } from './dp-budget.js';

// Differential Privacy - Embedding Middleware
export {
  dpEmbeddingMiddleware,
  computeGaussianSigma,
  computeLaplacianScale,
} from './dp-middleware.js';

// Differential Privacy - Types
export type {
  DPEmbeddingConfig,
  DPClassificationConfig,
  PrivacyBudgetConfig,
  PrivacyBudget,
} from './dp-types.js';
