/**
 * PII (Personally Identifiable Information) Redaction Utilities
 *
 * Provides utilities for detecting and redacting PII from text data
 * before embedding or storing in the vector database.
 *
 * @packageDocumentation
 */

import type { EmbeddingModelMiddleware } from '../embeddings/types.js';
import type { VectorDBMiddleware } from '../middleware/types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for PII redaction.
 */
export interface PIIRedactionOptions {
  /** Redact email addresses (default: true) */
  emails?: boolean;

  /** Redact phone numbers (default: true) */
  phones?: boolean;

  /** Redact SSN patterns (default: true) */
  ssn?: boolean;

  /** Redact credit card numbers (default: true) */
  creditCards?: boolean;

  /** Redact IP addresses (default: false) */
  ipAddresses?: boolean;

  /** Redact dates (default: false) */
  dates?: boolean;

  /** Custom patterns to redact */
  customPatterns?: Array<{ pattern: RegExp; replacement: string }>;

  /** Replacement text for redacted content (default: '[REDACTED]') */
  replacement?: string;

  /** Category-specific replacements */
  replacements?: {
    email?: string;
    phone?: string;
    ssn?: string;
    creditCard?: string;
    ipAddress?: string;
    date?: string;
  };
}

/**
 * Result of PII detection.
 */
export interface PIIDetectionResult {
  /** Whether any PII was detected */
  hasPII: boolean;

  /** Detected PII types and their positions */
  detections: PIIDetection[];

  /** Redacted text (if applicable) */
  redactedText?: string;
}

/**
 * A single PII detection.
 */
export interface PIIDetection {
  /** Type of PII detected */
  type: PIIType;

  /** Start position in the text */
  start: number;

  /** End position in the text */
  end: number;

  /** Original matched text (masked for security) */
  maskedMatch: string;
}

/**
 * Types of PII that can be detected.
 */
export type PIIType = 'email' | 'phone' | 'ssn' | 'creditCard' | 'ipAddress' | 'date' | 'custom';

// ============================================================================
// PII Patterns
// ============================================================================

/**
 * Regular expression patterns for common PII types.
 */
export const PII_PATTERNS = {
  /**
   * Email address pattern.
   * Matches: user@domain.com, first.last@company.co.uk
   */
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,

  /**
   * Phone number patterns (US-focused, with international prefix).
   * Matches: 555-123-4567, (555) 123-4567, +1-555-123-4567, 5551234567
   */
  phone: /\b(?:\+1[-.\s]?)?(?:\(?[0-9]{3}\)?[-.\s]?)?[0-9]{3}[-.\s]?[0-9]{4}\b/g,

  /**
   * Social Security Number pattern.
   * Matches: 123-45-6789
   */
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,

  /**
   * Credit card number patterns.
   * Matches: 1234 5678 9012 3456, 1234-5678-9012-3456, 1234567890123456
   */
  creditCard: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,

  /**
   * IPv4 address pattern.
   * Matches: 192.168.1.1
   */
  ipAddress: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,

  /**
   * Common date patterns.
   * Matches: 01/15/2024, 2024-01-15, January 15, 2024
   */
  date: /\b(?:\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})\b/gi,
} as const;

/**
 * Default replacement strings for different PII types.
 */
export const DEFAULT_PII_REPLACEMENTS = {
  email: '[EMAIL_REDACTED]',
  phone: '[PHONE_REDACTED]',
  ssn: '[SSN_REDACTED]',
  creditCard: '[CARD_REDACTED]',
  ipAddress: '[IP_REDACTED]',
  date: '[DATE_REDACTED]',
  custom: '[REDACTED]',
} as const;

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Redact PII from text.
 *
 * @param text - The text to redact PII from
 * @param options - Redaction options
 * @returns Redacted text
 *
 * @example
 * ```typescript
 * import { redactPII } from '@localmode/core';
 *
 * const text = 'Contact john@example.com or call 555-123-4567';
 * const redacted = redactPII(text);
 * // 'Contact [EMAIL_REDACTED] or call [PHONE_REDACTED]'
 *
 * // Custom replacement
 * const masked = redactPII(text, { replacement: '***' });
 * // 'Contact *** or call ***'
 * ```
 */
export function redactPII(text: string, options: PIIRedactionOptions = {}): string {
  const {
    emails = true,
    phones = true,
    ssn = true,
    creditCards = true,
    ipAddresses = false,
    dates = false,
    customPatterns = [],
    replacement,
    replacements = {},
  } = options;

  let result = text;

  // Create a function to get the replacement for a PII type
  const getReplacement = (type: PIIType): string => {
    if (replacement) return replacement;
    if (type in replacements) {
      return replacements[type as keyof typeof replacements] ?? DEFAULT_PII_REPLACEMENTS[type];
    }
    return DEFAULT_PII_REPLACEMENTS[type] ?? DEFAULT_PII_REPLACEMENTS.custom;
  };

  // Apply redactions in order
  if (emails) {
    result = result.replace(PII_PATTERNS.email, getReplacement('email'));
  }

  if (phones) {
    result = result.replace(PII_PATTERNS.phone, getReplacement('phone'));
  }

  if (ssn) {
    result = result.replace(PII_PATTERNS.ssn, getReplacement('ssn'));
  }

  if (creditCards) {
    result = result.replace(PII_PATTERNS.creditCard, getReplacement('creditCard'));
  }

  if (ipAddresses) {
    result = result.replace(PII_PATTERNS.ipAddress, getReplacement('ipAddress'));
  }

  if (dates) {
    result = result.replace(PII_PATTERNS.date, getReplacement('date'));
  }

  // Apply custom patterns
  for (const { pattern, replacement: customReplacement } of customPatterns) {
    result = result.replace(pattern, customReplacement);
  }

  return result;
}

/**
 * Detect PII in text without redacting.
 *
 * @param text - The text to scan for PII
 * @param options - Detection options (same as redaction options)
 * @returns Detection result with positions and types of PII found
 *
 * @example
 * ```typescript
 * import { detectPII } from '@localmode/core';
 *
 * const result = detectPII('Email: john@example.com');
 * console.log(result.hasPII); // true
 * console.log(result.detections[0].type); // 'email'
 * ```
 */
export function detectPII(text: string, options: PIIRedactionOptions = {}): PIIDetectionResult {
  const {
    emails = true,
    phones = true,
    ssn = true,
    creditCards = true,
    ipAddresses = false,
    dates = false,
    customPatterns = [],
  } = options;

  const detections: PIIDetection[] = [];

  const detectPattern = (pattern: RegExp, type: PIIType) => {
    // Create a new regex to avoid shared state issues
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(text)) !== null) {
      detections.push({
        type,
        start: match.index,
        end: match.index + match[0].length,
        maskedMatch: maskPII(match[0], type),
      });
    }
  };

  if (emails) detectPattern(PII_PATTERNS.email, 'email');
  if (phones) detectPattern(PII_PATTERNS.phone, 'phone');
  if (ssn) detectPattern(PII_PATTERNS.ssn, 'ssn');
  if (creditCards) detectPattern(PII_PATTERNS.creditCard, 'creditCard');
  if (ipAddresses) detectPattern(PII_PATTERNS.ipAddress, 'ipAddress');
  if (dates) detectPattern(PII_PATTERNS.date, 'date');

  // Custom patterns
  for (const { pattern } of customPatterns) {
    detectPattern(pattern, 'custom');
  }

  // Sort by position
  detections.sort((a, b) => a.start - b.start);

  return {
    hasPII: detections.length > 0,
    detections,
    redactedText: detections.length > 0 ? redactPII(text, options) : text,
  };
}

/**
 * Mask a PII match for safe logging/display.
 * Shows first and last characters with masked middle.
 */
function maskPII(match: string, type: PIIType): string {
  if (match.length <= 4) {
    return '*'.repeat(match.length);
  }

  switch (type) {
    case 'email': {
      const atIndex = match.indexOf('@');
      if (atIndex > 2) {
        return match[0] + '*'.repeat(atIndex - 2) + match.slice(atIndex - 1);
      }
      return '*'.repeat(match.length);
    }
    case 'creditCard':
      // Show last 4 digits
      return '*'.repeat(match.length - 4) + match.slice(-4);
    case 'phone':
      // Show last 4 digits
      return '*'.repeat(match.length - 4) + match.slice(-4);
    case 'ssn':
      // Show last 4 digits
      return '***-**-' + match.slice(-4);
    default:
      // Generic masking
      return match[0] + '*'.repeat(match.length - 2) + match[match.length - 1];
  }
}

// ============================================================================
// Middleware Functions
// ============================================================================

/**
 * Create an embedding model middleware that redacts PII before embedding.
 *
 * @param options - PII redaction options
 * @returns Embedding model middleware
 *
 * @example
 * ```typescript
 * import { embed, wrapEmbeddingModel, piiRedactionMiddleware } from '@localmode/core';
 *
 * const safeModel = wrapEmbeddingModel({
 *   model: transformers.embedding('Xenova/all-MiniLM-L6-v2'),
 *   middleware: piiRedactionMiddleware({ emails: true, phones: true }),
 * });
 *
 * await embed({
 *   model: safeModel,
 *   value: 'Contact john@example.com at 555-123-4567',
 * });
 * // Embeds: 'Contact [EMAIL_REDACTED] at [PHONE_REDACTED]'
 * ```
 */
export function piiRedactionMiddleware(
  options: PIIRedactionOptions = {}
): EmbeddingModelMiddleware {
  return {
    transformParams: ({ values }) => {
      return {
        values: values.map((v) => (typeof v === 'string' ? redactPII(v, options) : v)),
      };
    },
  };
}

/**
 * Create a VectorDB middleware that redacts PII from document text before storage.
 *
 * @param options - PII redaction options
 * @returns VectorDB middleware
 *
 * @example
 * ```typescript
 * import { createVectorDB, wrapVectorDB, piiRedactionVectorDBMiddleware } from '@localmode/core';
 *
 * const db = await createVectorDB({ name: 'safe-db', dimensions: 384 });
 * const safeDb = wrapVectorDB({
 *   db,
 *   middleware: piiRedactionVectorDBMiddleware({ emails: true }),
 * });
 * ```
 */
export function piiRedactionVectorDBMiddleware(
  options: PIIRedactionOptions = {}
): VectorDBMiddleware {
  return {
    beforeAdd: (document) => {
      // Redact PII from metadata text fields
      if (document.metadata) {
        const redactedMetadata = { ...document.metadata };

        for (const [key, value] of Object.entries(redactedMetadata)) {
          if (typeof value === 'string') {
            redactedMetadata[key] = redactPII(value, options);
          }
        }

        return { ...document, metadata: redactedMetadata };
      }

      return document;
    },
  };
}

/**
 * Check if text contains any PII.
 *
 * @param text - Text to check
 * @param options - Detection options
 * @returns true if PII is detected
 *
 * @example
 * ```typescript
 * if (hasPII(userInput)) {
 *   console.warn('Input contains PII');
 * }
 * ```
 */
export function hasPII(text: string, options: PIIRedactionOptions = {}): boolean {
  return detectPII(text, options).hasPII;
}

