/**
 * Key storage and management.
 * Handles secure storage of encryption keys in IndexedDB.
 */

import { hashPassphrase, verifyPassphrase, isCryptoSupported } from './crypto.js';

/**
 * Key metadata stored in IndexedDB.
 */
export interface KeyMetadata {
  /** Database this key is for */
  dbName: string;
  /** Hash of the passphrase for verification */
  passphraseHash: string;
  /** When the key was created */
  createdAt: number;
  /** When the key was last used */
  lastUsedAt: number;
  /** Number of key derivation iterations */
  iterations: number;
  /** Whether encryption is currently enabled */
  enabled: boolean;
}

/**
 * Store name for key metadata.
 */
const KEYSTORE_DB_NAME = 'vectordb_keystore';
const KEYSTORE_VERSION = 1;
const KEY_STORE_NAME = 'keys';

/**
 * Open the keystore database.
 */
async function openKeystore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(KEYSTORE_DB_NAME, KEYSTORE_VERSION);

    request.onerror = () => reject(new Error(`Failed to open keystore: ${request.error?.message}`));

    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(KEY_STORE_NAME)) {
        db.createObjectStore(KEY_STORE_NAME, { keyPath: 'dbName' });
      }
    };
  });
}

/**
 * Keystore manager for encryption keys.
 */
export class Keystore {
  private passphrase: string | null = null;
  private iterations: number = 100000;

  /**
   * Check if encryption is supported.
   */
  static isSupported(): boolean {
    return isCryptoSupported();
  }

  /**
   * Initialize encryption for a database with a passphrase.
   * This stores the passphrase hash for verification.
   */
  async initialize(dbName: string, passphrase: string, iterations: number = 100000): Promise<void> {
    if (!Keystore.isSupported()) {
      throw new Error('Web Crypto API not supported');
    }

    const db = await openKeystore();

    try {
      const hash = await hashPassphrase(passphrase);

      const metadata: KeyMetadata = {
        dbName,
        passphraseHash: hash,
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
        iterations,
        enabled: true,
      };

      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(KEY_STORE_NAME, 'readwrite');
        const store = tx.objectStore(KEY_STORE_NAME);
        const request = store.put(metadata);

        request.onerror = () => reject(request.error);
        tx.oncomplete = () => resolve();
      });

      this.passphrase = passphrase;
      this.iterations = iterations;
    } finally {
      db.close();
    }
  }

  /**
   * Unlock encryption for a database by verifying the passphrase.
   */
  async unlock(dbName: string, passphrase: string): Promise<boolean> {
    if (!Keystore.isSupported()) {
      throw new Error('Web Crypto API not supported');
    }

    const metadata = await this.getMetadata(dbName);

    if (!metadata) {
      throw new Error(`No encryption configured for database: ${dbName}`);
    }

    const isValid = await verifyPassphrase(passphrase, metadata.passphraseHash);

    if (isValid) {
      this.passphrase = passphrase;
      this.iterations = metadata.iterations;
      await this.updateLastUsed(dbName);
    }

    return isValid;
  }

  /**
   * Lock encryption (clear the passphrase from memory).
   */
  lock(): void {
    this.passphrase = null;
  }

  /**
   * Check if encryption is unlocked.
   */
  isUnlocked(): boolean {
    return this.passphrase !== null;
  }

  /**
   * Get the current passphrase (throws if locked).
   */
  getPassphrase(): string {
    if (!this.passphrase) {
      throw new Error('Encryption is locked. Call unlock() first.');
    }
    return this.passphrase;
  }

  /**
   * Get the key derivation iterations.
   */
  getIterations(): number {
    return this.iterations;
  }

  /**
   * Get key metadata for a database.
   */
  async getMetadata(dbName: string): Promise<KeyMetadata | null> {
    const db = await openKeystore();

    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(KEY_STORE_NAME, 'readonly');
        const store = tx.objectStore(KEY_STORE_NAME);
        const request = store.get(dbName);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result ?? null);
      });
    } finally {
      db.close();
    }
  }

  /**
   * Check if a database has encryption configured.
   */
  async hasEncryption(dbName: string): Promise<boolean> {
    const metadata = await this.getMetadata(dbName);
    return metadata?.enabled ?? false;
  }

  /**
   * Update the last used timestamp.
   */
  private async updateLastUsed(dbName: string): Promise<void> {
    const db = await openKeystore();

    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(KEY_STORE_NAME, 'readwrite');
        const store = tx.objectStore(KEY_STORE_NAME);
        const getRequest = store.get(dbName);

        getRequest.onerror = () => reject(getRequest.error);
        getRequest.onsuccess = () => {
          const metadata = getRequest.result as KeyMetadata | undefined;
          if (metadata) {
            metadata.lastUsedAt = Date.now();
            store.put(metadata);
          }
        };

        tx.oncomplete = () => resolve();
      });
    } finally {
      db.close();
    }
  }

  /**
   * Change the encryption passphrase.
   * Note: This only updates the stored hash, not re-encrypted data.
   */
  async changePassphrase(
    dbName: string,
    oldPassphrase: string,
    newPassphrase: string
  ): Promise<boolean> {
    // Verify old passphrase
    const isValid = await this.unlock(dbName, oldPassphrase);
    if (!isValid) {
      return false;
    }

    // Update with new passphrase
    const db = await openKeystore();

    try {
      const newHash = await hashPassphrase(newPassphrase);

      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(KEY_STORE_NAME, 'readwrite');
        const store = tx.objectStore(KEY_STORE_NAME);
        const getRequest = store.get(dbName);

        getRequest.onerror = () => reject(getRequest.error);
        getRequest.onsuccess = () => {
          const metadata = getRequest.result as KeyMetadata | undefined;
          if (metadata) {
            metadata.passphraseHash = newHash;
            metadata.lastUsedAt = Date.now();
            store.put(metadata);
          }
        };

        tx.oncomplete = () => resolve();
      });

      this.passphrase = newPassphrase;
      return true;
    } finally {
      db.close();
    }
  }

  /**
   * Disable encryption for a database.
   */
  async disable(dbName: string, passphrase: string): Promise<boolean> {
    // Verify passphrase first
    const isValid = await this.unlock(dbName, passphrase);
    if (!isValid) {
      return false;
    }

    const db = await openKeystore();

    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(KEY_STORE_NAME, 'readwrite');
        const store = tx.objectStore(KEY_STORE_NAME);
        const getRequest = store.get(dbName);

        getRequest.onerror = () => reject(getRequest.error);
        getRequest.onsuccess = () => {
          const metadata = getRequest.result as KeyMetadata | undefined;
          if (metadata) {
            metadata.enabled = false;
            metadata.lastUsedAt = Date.now();
            store.put(metadata);
          }
        };

        tx.oncomplete = () => resolve();
      });

      this.lock();
      return true;
    } finally {
      db.close();
    }
  }

  /**
   * Delete key metadata for a database.
   */
  async delete(dbName: string): Promise<void> {
    const db = await openKeystore();

    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(KEY_STORE_NAME, 'readwrite');
        const store = tx.objectStore(KEY_STORE_NAME);
        const request = store.delete(dbName);

        request.onerror = () => reject(request.error);
        tx.oncomplete = () => resolve();
      });

      this.lock();
    } finally {
      db.close();
    }
  }
}

/**
 * Create a new keystore instance.
 */
export function createKeystore(): Keystore {
  return new Keystore();
}
