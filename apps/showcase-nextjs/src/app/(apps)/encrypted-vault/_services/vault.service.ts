/**
 * @file vault.service.ts
 * @description Service for vault encryption/decryption using @localmode/core security
 */
import { encrypt, decryptString, deriveEncryptionKey } from '@localmode/core';
import type { EncryptedData } from '@localmode/core';
import { STORAGE_KEY, VAULT_SALT_KEY } from '../_lib/constants';
import type { VaultEntry } from '../_lib/types';

/** In-memory derived encryption key (cleared on lock) */
let currentKey: CryptoKey | null = null;

/** In-memory passphrase for encrypt/decrypt (cleared on lock) */
let currentPassphrase: string | null = null;

/**
 * Check if the vault has been initialized (salt exists in localStorage)
 */
export function isVaultInitialized() {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(VAULT_SALT_KEY) !== null;
}

/**
 * Initialize a new vault with a password
 * Derives an encryption key and stores the salt in localStorage
 * @param password - The master password for the vault
 */
export async function initializeVault(password: string) {
  const { key, salt } = await deriveEncryptionKey(password);

  // Store salt in localStorage for future key derivation
  localStorage.setItem(VAULT_SALT_KEY, salt);

  // Initialize empty entries
  localStorage.setItem(STORAGE_KEY, JSON.stringify([]));

  // Store key and passphrase in memory
  currentKey = key;
  currentPassphrase = password;
}

/**
 * Unlock the vault with a password
 * Derives the key using the stored salt and verifies it works
 * @param password - The master password
 * @throws Error if the password is incorrect or vault is not initialized
 */
export async function unlockVault(password: string) {
  const storedSalt = localStorage.getItem(VAULT_SALT_KEY);
  if (!storedSalt) {
    throw new Error('Vault not initialized');
  }

  // Derive key with stored salt
  const { key } = await deriveEncryptionKey(password, storedSalt);

  // Verify the password by attempting to decrypt existing entries
  const entries = loadEntries();
  if (entries.length > 0) {
    try {
      // Try to decrypt the first entry's content to verify password
      const encrypted: EncryptedData = JSON.parse(entries[0].encryptedContent);
      await decryptString(encrypted, password);
    } catch {
      throw new Error('Incorrect password');
    }
  }

  // Store key and passphrase in memory
  currentKey = key;
  currentPassphrase = password;
}

/**
 * Lock the vault by clearing the in-memory key
 */
export function lockVault() {
  currentKey = null;
  currentPassphrase = null;
}

/**
 * Check if the vault is currently unlocked
 */
export function isVaultUnlocked() {
  return currentKey !== null && currentPassphrase !== null;
}

/**
 * Encrypt content using the current passphrase
 * @param content - Plaintext content to encrypt
 * @returns Serialized encrypted data string
 */
export async function encryptContent(content: string) {
  if (!currentPassphrase) {
    throw new Error('Vault is locked');
  }

  const encrypted = await encrypt(content, currentPassphrase);
  return JSON.stringify(encrypted);
}

/**
 * Decrypt content using the current passphrase
 * @param encryptedContent - Serialized encrypted data string
 * @returns Decrypted plaintext content
 */
export async function decryptContent(encryptedContent: string) {
  if (!currentPassphrase) {
    throw new Error('Vault is locked');
  }

  const encrypted: EncryptedData = JSON.parse(encryptedContent);
  return decryptString(encrypted, currentPassphrase);
}

/**
 * Load entries from localStorage
 */
export function loadEntries(): VaultEntry[] {
  if (typeof window === 'undefined') return [];

  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as Array<{
      id: string;
      title: string;
      encryptedContent: string;
      createdAt: string;
    }>;
    return parsed.map((e) => ({
      ...e,
      createdAt: new Date(e.createdAt),
    }));
  } catch {
    return [];
  }
}

/**
 * Save entries to localStorage
 * @param entries - Vault entries to persist
 */
export function saveEntries(entries: VaultEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

/**
 * Add an encrypted entry to the vault
 * @param title - Entry title
 * @param content - Plaintext content to encrypt and store
 */
export async function addEntry(title: string, content: string) {
  const encryptedContent = await encryptContent(content);

  const entry: VaultEntry = {
    id: crypto.randomUUID(),
    title,
    encryptedContent,
    createdAt: new Date(),
  };

  const entries = loadEntries();
  entries.push(entry);
  saveEntries(entries);

  return entry;
}

/**
 * Delete an entry from the vault
 * @param id - Entry ID to delete
 */
export function deleteEntry(id: string) {
  const entries = loadEntries();
  const filtered = entries.filter((e) => e.id !== id);
  saveEntries(filtered);
}
