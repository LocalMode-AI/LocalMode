/**
 * @file types.ts
 * @description Type definitions for the encrypted vault application
 */

/** A vault entry with encrypted content */
export interface VaultEntry {
  /** Unique entry identifier */
  id: string;
  /** Entry title (stored in plaintext) */
  title: string;
  /** Encrypted content (serialized EncryptedData) */
  encryptedContent: string;
  /** When the entry was created */
  createdAt: Date;
}

/** Current state of the vault */
export type VaultState = 'locked' | 'unlocked' | 'setup';

/** Application error for UI display */
export interface AppError {
  /** Error message for display */
  message: string;
  /** Error code for programmatic handling */
  code?: string;
  /** Whether the error is recoverable */
  recoverable?: boolean;
}
