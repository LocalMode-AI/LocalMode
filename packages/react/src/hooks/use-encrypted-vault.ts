/**
 * @file use-encrypted-vault.ts
 * @description Passphrase-locked, encrypted CRUD vault hook over a pluggable
 *              core `StorageAdapter`. The AES-GCM key derived from the
 *              passphrase lives only in a React ref while unlocked — the
 *              passphrase is never retained and no key material is ever
 *              persisted. Items are AES-GCM envelopes (fresh 12-byte IV per
 *              write, versioned, base64) at rest; wrong passphrases are
 *              detected deterministically via an encrypted verifier record,
 *              which works even on an empty vault.
 *
 * Storage layout (audit-log precedent — documents in a name-derived collection):
 * - Meta document (reserved id `__vault_meta__`, excluded from `items`):
 *   `metadata = { version: 1, salt, iterations, verifier: { ciphertext, iv } }`
 * - Item documents: `metadata = { v: 1, ciphertext, iv, createdAt, updatedAt }`
 *   where the ciphertext is the AES-GCM encryption of `JSON.stringify(data)`.
 *   Everything except the item id and timestamps is ciphertext at rest.
 *
 * One vault per storage namespace: the reserved meta id is global within an
 * adapter, so give each vault its own adapter (the default IndexedDB database
 * is already namespaced per vault name).
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import type { StorageAdapter, StoredDocument } from '@localmode/core';

const IS_SERVER = typeof window === 'undefined';

/** Reserved document id for the vault meta record (never exposed as an item). */
const META_ID = '__vault_meta__';

/** Fixed sentinel encrypted at initialize time for wrong-passphrase detection. */
const VERIFIER_SENTINEL = 'localmode-vault-verifier:v1';

/** Default PBKDF2 iterations (matches the core `deriveEncryptionKey` default). */
const DEFAULT_ITERATIONS = 100000;

/** Envelope format version persisted with every item. */
const ENVELOPE_VERSION = 1 as const;

// ============================================================================
// Typed errors
// ============================================================================

/**
 * Unlock was attempted with the wrong passphrase.
 *
 * Detection is deterministic: the vault's encrypted verifier record fails
 * AES-GCM authentication under the derived key, so it works even on a vault
 * with zero items. `name` is set explicitly so `err.name` checks work across
 * realms.
 *
 * @see useEncryptedVault
 */
export class VaultPassphraseError extends Error {
  constructor(
    message = 'Wrong passphrase: the vault verifier failed to decrypt with the key derived from the supplied passphrase.'
  ) {
    super(message);
    this.name = 'VaultPassphraseError';
  }
}

/**
 * A CRUD operation or `refresh()` was invoked while the vault was not
 * unlocked. The operation resolves `null`/`false` and never touches storage.
 * `name` is set explicitly so `err.name` checks work across realms.
 *
 * @see useEncryptedVault
 */
export class VaultLockedError extends Error {
  constructor(
    message = 'Vault is locked: call unlock(passphrase) before reading or writing items.'
  ) {
    super(message);
    this.name = 'VaultLockedError';
  }
}

// ============================================================================
// Public types
// ============================================================================

/** Vault lifecycle state. */
export type VaultStatus = 'uninitialized' | 'locked' | 'unlocked';

/** A decrypted vault item. `data` is only ever populated while unlocked. */
export interface VaultItem<T = unknown> {
  /** Unique item id (generated via `crypto.randomUUID()`). */
  id: string;
  /** Decrypted payload — only populated while unlocked. */
  data: T;
  /** Creation timestamp (ms since epoch). Stored in plaintext. */
  createdAt: number;
  /** Last-update timestamp (ms since epoch). Stored in plaintext. */
  updatedAt: number;
}

/** Options for the useEncryptedVault hook. */
export interface UseEncryptedVaultOptions {
  /**
   * Vault namespace. Names the default IndexedDB database (`vault_<name>`)
   * and the vault's storage collection.
   * @defaultValue 'default'
   */
  name?: string;

  /**
   * Pluggable storage adapter (e.g. `MemoryStorage`, Dexie/idb/localForage
   * adapters). When omitted, a dedicated `IndexedDBStorage('vault_<name>')`
   * is created, opened, and closed by the hook.
   */
  storage?: StorageAdapter;

  /**
   * PBKDF2 iterations used when the vault is initialized (first unlock).
   * Subsequent unlocks always use the iteration count persisted in the vault
   * meta record.
   * @defaultValue 100000
   */
  iterations?: number;
}

/** Return type from the useEncryptedVault hook. */
export interface UseEncryptedVaultReturn<T = unknown> {
  /** Vault lifecycle state, detected from the persisted meta record on mount. */
  status: VaultStatus;
  /** Decrypted item list while unlocked; `[]` otherwise. */
  items: VaultItem<T>[];
  /** True while an unlock/CRUD/refresh operation is in flight. */
  isBusy: boolean;
  /**
   * Last operation error, or null. Typed failures surface here:
   * {@link VaultPassphraseError} on wrong passphrase, {@link VaultLockedError}
   * on CRUD while locked. Methods resolve `null`/`false` instead of throwing.
   */
  error: Error | null;
  /**
   * Unlock the vault. Initializes on first use (persisting only a fresh
   * PBKDF2 salt, the iteration count, and an AES-GCM verifier record) and
   * verifies the passphrase on subsequent unlocks. Resolves `true` on
   * success; `false` on failure or cancellation.
   */
  unlock: (passphrase: string) => Promise<boolean>;
  /** Synchronously lock the vault: clears the in-memory key and decrypted items. */
  lock: () => void;
  /** Encrypt and persist a new item. Resolves `null` on failure or while locked. */
  createItem: (data: T) => Promise<VaultItem<T> | null>;
  /** Read and decrypt a single item by id. Resolves `null` if missing or locked. */
  readItem: (id: string) => Promise<VaultItem<T> | null>;
  /** Re-encrypt an existing item with new data. Resolves `null` if missing or locked. */
  updateItem: (id: string, data: T) => Promise<VaultItem<T> | null>;
  /** Delete an item by id. Resolves `false` if missing or locked. */
  deleteItem: (id: string) => Promise<boolean>;
  /** Re-read and decrypt all items from storage into `items`. */
  refresh: () => Promise<void>;
  /** Abort the in-flight operation (silent — no `error` state). */
  cancel: () => void;
}

// ============================================================================
// Internal AES-GCM envelope helpers (Web Crypto only — zero dependencies)
// ============================================================================

/** Versioned AES-GCM envelope persisted for every item. */
interface VaultEnvelope {
  v: typeof ENVELOPE_VERSION;
  /** Base64 AES-GCM ciphertext. */
  ciphertext: string;
  /** Base64-encoded 12-byte IV. */
  iv: string;
}

/** Parsed shape of the vault meta record. */
interface VaultMetaRecord {
  version: number;
  salt: string;
  iterations: number;
  verifier: { ciphertext: string; iv: string };
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/** Encrypt a UTF-8 string with a fresh random 12-byte IV. */
async function encryptWithKey(plaintext: string, key: CryptoKey): Promise<VaultEnvelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  return {
    v: ENVELOPE_VERSION,
    ciphertext: bufferToBase64(ciphertext),
    iv: bufferToBase64(iv.buffer),
  };
}

/** Decrypt an envelope back to a UTF-8 string. Throws on authentication failure. */
async function decryptWithKey(
  envelope: { ciphertext: string; iv: string },
  key: CryptoKey
): Promise<string> {
  const iv = new Uint8Array(base64ToBuffer(envelope.iv));
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    base64ToBuffer(envelope.ciphertext)
  );
  return new TextDecoder().decode(plaintext);
}

/** Parse + validate the persisted vault meta record. */
function parseMetaRecord(doc: StoredDocument): VaultMetaRecord {
  const meta = doc.metadata as Partial<VaultMetaRecord> | undefined;
  if (
    !meta ||
    typeof meta.salt !== 'string' ||
    typeof meta.iterations !== 'number' ||
    !meta.verifier ||
    typeof meta.verifier.ciphertext !== 'string' ||
    typeof meta.verifier.iv !== 'string'
  ) {
    throw new Error(
      'useEncryptedVault: the vault meta record is malformed — storage contents are corrupted or were written by an incompatible version.'
    );
  }
  return meta as VaultMetaRecord;
}

/** Decrypt a persisted item document into a VaultItem. */
async function decryptItemDoc<T>(doc: StoredDocument, key: CryptoKey): Promise<VaultItem<T>> {
  const meta = doc.metadata as
    | { v?: number; ciphertext?: string; iv?: string; createdAt?: number; updatedAt?: number }
    | undefined;
  if (
    !meta ||
    meta.v !== ENVELOPE_VERSION ||
    typeof meta.ciphertext !== 'string' ||
    typeof meta.iv !== 'string'
  ) {
    throw new Error(
      `useEncryptedVault: item "${doc.id}" has a malformed or unsupported envelope (expected v: ${ENVELOPE_VERSION}).`
    );
  }
  let json: string;
  try {
    json = await decryptWithKey({ ciphertext: meta.ciphertext, iv: meta.iv }, key);
  } catch {
    throw new Error(
      `useEncryptedVault: failed to decrypt item "${doc.id}" — the record may be corrupted.`
    );
  }
  return {
    id: doc.id,
    data: JSON.parse(json) as T,
    createdAt: typeof meta.createdAt === 'number' ? meta.createdAt : doc.createdAt,
    updatedAt: typeof meta.updatedAt === 'number' ? meta.updatedAt : doc.updatedAt,
  };
}

/** JSON-serialize an item payload, rejecting non-serializable values. */
function stringifyData(data: unknown): string {
  const json = JSON.stringify(data);
  if (json === undefined) {
    throw new Error(
      'useEncryptedVault: item data must be JSON-serializable (received a value JSON.stringify cannot represent).'
    );
  }
  return json;
}

/** Chain-order sort: oldest first, id as a deterministic tiebreaker. */
function sortItems<T>(items: VaultItem<T>[]): VaultItem<T>[] {
  return items.sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
}

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === 'AbortError') ||
    (err instanceof Error && err.name === 'AbortError')
  );
}

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

// ============================================================================
// Hook
// ============================================================================

/**
 * React hook for a passphrase-locked, encrypted item vault persisted through
 * a pluggable core `StorageAdapter` (default: a dedicated
 * `IndexedDBStorage('vault_<name>')`).
 *
 * Lifecycle: `status` starts `'uninitialized'` and settles to `'locked'` on
 * mount when a persisted vault meta record exists. A single
 * `unlock(passphrase)` entrypoint initializes the vault on first use and
 * verifies the passphrase afterwards; the key is derived exactly once per
 * unlock via core `deriveEncryptionKey` (PBKDF2) and the non-extractable
 * `CryptoKey` is held only in a ref. `lock()` and unmount clear it.
 *
 * @param options - Vault name, injectable storage adapter, PBKDF2 iterations
 * @returns Vault state and actions (see {@link UseEncryptedVaultReturn})
 *
 * @example
 * ```tsx
 * function Vault() {
 *   const { status, items, error, unlock, lock, createItem, deleteItem } =
 *     useEncryptedVault<{ note: string }>({ name: 'notes' });
 *
 *   if (status !== 'unlocked') {
 *     return (
 *       <form onSubmit={(e) => { e.preventDefault(); unlock(passphraseInput); }}>
 *         <button>{status === 'uninitialized' ? 'Create vault' : 'Unlock'}</button>
 *         {error?.name === 'VaultPassphraseError' && <p>Wrong passphrase</p>}
 *       </form>
 *     );
 *   }
 *   return (
 *     <div>
 *       {items.map((i) => (
 *         <div key={i.id}>
 *           {i.data.note} <button onClick={() => deleteItem(i.id)}>x</button>
 *         </div>
 *       ))}
 *       <button onClick={() => createItem({ note: 'hello' })}>Add</button>
 *       <button onClick={lock}>Lock</button>
 *     </div>
 *   );
 * }
 * ```
 *
 * @throws Never throws to the caller — failures resolve `null`/`false` and
 *         surface via `error` ({@link VaultPassphraseError} on wrong
 *         passphrase, {@link VaultLockedError} on operations while locked, a
 *         plain `Error` when Web Crypto is unavailable or storage fails).
 *
 * @see VaultPassphraseError
 * @see VaultLockedError
 */
export function useEncryptedVault<T = unknown>(
  options: UseEncryptedVaultOptions = {}
): UseEncryptedVaultReturn<T> {
  const { name = 'default', storage: externalStorage, iterations = DEFAULT_ITERATIONS } = options;
  const collectionId = `vault:${name}`;

  const [status, setStatus] = useState<VaultStatus>('uninitialized');
  const [items, setItems] = useState<VaultItem<T>[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  /** The derived non-extractable CryptoKey — held in a ref ONLY, never in state or storage. */
  const keyRef = useRef<CryptoKey | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  /** Last issued timestamp — keeps createdAt/updatedAt strictly monotonic per hook instance. */
  const lastTimestampRef = useRef(0);
  const storagePromiseRef = useRef<Promise<{ storage: StorageAdapter; owned: boolean }> | null>(
    null
  );

  /**
   * Wall-clock timestamp, nudged forward on same-millisecond calls so item
   * ordering (sorted by `createdAt`) deterministically preserves insertion
   * order across reloads — two writes in the same millisecond would otherwise
   * tie and fall back to random-UUID order.
   */
  const nextTimestamp = useCallback((): number => {
    const now = Math.max(Date.now(), lastTimestampRef.current + 1);
    lastTimestampRef.current = now;
    return now;
  }, []);

  /** Resolve (and memoize) the storage adapter; create + open the default one lazily. */
  const resolveStorage = useCallback(async (): Promise<StorageAdapter> => {
    if (!storagePromiseRef.current) {
      const promise = (async () => {
        let storage: StorageAdapter;
        let owned = false;
        if (externalStorage) {
          storage = externalStorage;
        } else {
          const { IndexedDBStorage } = await import('@localmode/core');
          storage = new IndexedDBStorage(`vault_${name}`) as unknown as StorageAdapter;
          owned = true;
          await storage.open();
        }
        const existing = await storage.getCollection(collectionId);
        if (!existing) {
          await storage.createCollection({
            id: collectionId,
            name: `__vault_${name}`,
            dimensions: 0,
            createdAt: Date.now(),
          });
        }
        return { storage, owned };
      })();
      storagePromiseRef.current = promise;
      // Drop the memo on failure so a later operation can retry.
      promise.catch(() => {
        if (storagePromiseRef.current === promise) {
          storagePromiseRef.current = null;
        }
      });
    }
    return (await storagePromiseRef.current).storage;
  }, [externalStorage, name, collectionId]);

  // Mount: detect vault status from the persisted meta record.
  // Cleanup: abort in-flight work, clear the key, close owned storage.
  useEffect(() => {
    if (IS_SERVER) return;
    mountedRef.current = true;
    let cancelled = false;

    // Reset per-storage state (also covers name/storage identity changes).
    keyRef.current = null;
    setStatus('uninitialized');
    setItems([]);
    setError(null);
    setIsBusy(false);

    (async () => {
      try {
        const storage = await resolveStorage();
        if (cancelled) return;
        const metaDoc = await storage.getDocument(META_ID);
        if (cancelled || !mountedRef.current) return;
        if (metaDoc) setStatus('locked');
      } catch (err) {
        if (cancelled || !mountedRef.current || isAbortError(err)) return;
        setError(toError(err));
      }
    })();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      abortControllerRef.current?.abort();
      // Clear key material on unmount — same guarantee as lock().
      keyRef.current = null;
      const pending = storagePromiseRef.current;
      storagePromiseRef.current = null;
      if (pending) {
        void pending
          .then(({ storage, owned }) => (owned ? storage.close() : undefined))
          .catch(() => undefined);
      }
    };
  }, [resolveStorage]);

  /** Start an operation: abort the previous one, allocate a fresh controller. */
  const beginOp = useCallback((): AbortController => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setError(null);
    setIsBusy(true);
    return controller;
  }, []);

  /** Finish an operation: clear isBusy iff this op is still the current one. */
  const endOp = useCallback((controller: AbortController): void => {
    if (mountedRef.current && abortControllerRef.current === controller) {
      setIsBusy(false);
    }
  }, []);

  /** Fail an operation: aborts are silent; everything else surfaces via `error`. */
  const failOp = useCallback((controller: AbortController, err: unknown): void => {
    if (!mountedRef.current) return;
    if (!controller.signal.aborted && !isAbortError(err)) {
      setError(toError(err));
    }
    if (abortControllerRef.current === controller) {
      setIsBusy(false);
    }
  }, []);

  /** Guard for CRUD/refresh: the key ref is the single source of "unlocked". */
  const requireUnlockedKey = useCallback((): CryptoKey | null => {
    const key = keyRef.current;
    if (!key) {
      setError(new VaultLockedError());
      return null;
    }
    return key;
  }, []);

  const unlock = useCallback(
    async (passphrase: string): Promise<boolean> => {
      if (IS_SERVER) return false;

      const controller = beginOp();
      try {
        const { deriveEncryptionKey, isCryptoSupported } = await import('@localmode/core');
        if (!isCryptoSupported()) {
          throw new Error(
            'useEncryptedVault: Web Crypto (crypto.subtle) is unavailable in this environment — encrypted vaults require a secure context (HTTPS or localhost).'
          );
        }
        const storage = await resolveStorage();
        controller.signal.throwIfAborted();

        const metaDoc = await storage.getDocument(META_ID);
        controller.signal.throwIfAborted();

        let key: CryptoKey;
        let decrypted: VaultItem<T>[];

        if (!metaDoc) {
          // First unlock initializes the vault: fresh salt + verifier record.
          const derived = await deriveEncryptionKey(passphrase, undefined, iterations);
          controller.signal.throwIfAborted();
          const verifier = await encryptWithKey(VERIFIER_SENTINEL, derived.key);
          controller.signal.throwIfAborted();
          const now = nextTimestamp();
          await storage.addDocument({
            id: META_ID,
            collectionId,
            metadata: {
              version: 1,
              salt: derived.salt,
              iterations,
              verifier: { ciphertext: verifier.ciphertext, iv: verifier.iv },
            },
            createdAt: now,
            updatedAt: now,
          });
          controller.signal.throwIfAborted();
          key = derived.key;
          decrypted = [];
        } else {
          // The vault exists — reflect that even if mount detection hasn't settled.
          if (mountedRef.current) {
            setStatus((prev) => (prev === 'uninitialized' ? 'locked' : prev));
          }
          const meta = parseMetaRecord(metaDoc);
          // Derive exactly once per unlock, from the stored salt + iterations.
          const derived = await deriveEncryptionKey(passphrase, meta.salt, meta.iterations);
          controller.signal.throwIfAborted();
          // Encrypted-verifier check: AES-GCM auth failure ⇒ wrong passphrase.
          try {
            const sentinel = await decryptWithKey(meta.verifier, derived.key);
            if (sentinel !== VERIFIER_SENTINEL) throw new Error('verifier mismatch');
          } catch {
            throw new VaultPassphraseError();
          }
          controller.signal.throwIfAborted();
          const docs = await storage.getAllDocuments(collectionId);
          controller.signal.throwIfAborted();
          const list: VaultItem<T>[] = [];
          for (const doc of docs) {
            if (doc.id === META_ID) continue;
            list.push(await decryptItemDoc<T>(doc, derived.key));
          }
          controller.signal.throwIfAborted();
          key = derived.key;
          decrypted = sortItems(list);
          // Seed the monotonic clock past the newest persisted timestamp.
          for (const item of decrypted) {
            lastTimestampRef.current = Math.max(
              lastTimestampRef.current,
              item.createdAt,
              item.updatedAt
            );
          }
        }

        if (!mountedRef.current || controller.signal.aborted) {
          // Cancelled or unmounted: retain nothing — the vault stays locked.
          endOp(controller);
          return false;
        }
        keyRef.current = key;
        setItems(decrypted);
        setStatus('unlocked');
        endOp(controller);
        return true;
      } catch (err) {
        failOp(controller, err);
        return false;
      }
    },
    [beginOp, endOp, failOp, resolveStorage, collectionId, iterations, nextTimestamp]
  );

  const lock = useCallback((): void => {
    if (IS_SERVER) return;
    abortControllerRef.current?.abort();
    keyRef.current = null;
    setItems([]);
    setError(null);
    setIsBusy(false);
    setStatus((prev) => (prev === 'unlocked' ? 'locked' : prev));
  }, []);

  const createItem = useCallback(
    async (data: T): Promise<VaultItem<T> | null> => {
      if (IS_SERVER) return null;
      const key = requireUnlockedKey();
      if (!key) return null;

      const controller = beginOp();
      try {
        const json = stringifyData(data);
        const storage = await resolveStorage();
        controller.signal.throwIfAborted();
        const envelope = await encryptWithKey(json, key);
        controller.signal.throwIfAborted();
        const now = nextTimestamp();
        const id = crypto.randomUUID();
        await storage.addDocument({
          id,
          collectionId,
          metadata: {
            v: ENVELOPE_VERSION,
            ciphertext: envelope.ciphertext,
            iv: envelope.iv,
            createdAt: now,
            updatedAt: now,
          },
          createdAt: now,
          updatedAt: now,
        });
        controller.signal.throwIfAborted();
        const item: VaultItem<T> = { id, data, createdAt: now, updatedAt: now };
        if (mountedRef.current && !controller.signal.aborted) {
          setItems((prev) => sortItems([...prev, item]));
        }
        endOp(controller);
        return item;
      } catch (err) {
        failOp(controller, err);
        return null;
      }
    },
    [beginOp, endOp, failOp, requireUnlockedKey, resolveStorage, collectionId, nextTimestamp]
  );

  const readItem = useCallback(
    async (id: string): Promise<VaultItem<T> | null> => {
      if (IS_SERVER) return null;
      const key = requireUnlockedKey();
      if (!key) return null;
      if (id === META_ID) return null; // reserved id is never exposed

      const controller = beginOp();
      try {
        const storage = await resolveStorage();
        controller.signal.throwIfAborted();
        const doc = await storage.getDocument(id);
        controller.signal.throwIfAborted();
        if (!doc || doc.collectionId !== collectionId) {
          endOp(controller);
          return null;
        }
        const item = await decryptItemDoc<T>(doc, key);
        endOp(controller);
        return item;
      } catch (err) {
        failOp(controller, err);
        return null;
      }
    },
    [beginOp, endOp, failOp, requireUnlockedKey, resolveStorage, collectionId]
  );

  const updateItem = useCallback(
    async (id: string, data: T): Promise<VaultItem<T> | null> => {
      if (IS_SERVER) return null;
      const key = requireUnlockedKey();
      if (!key) return null;
      if (id === META_ID) return null; // reserved id is never exposed

      const controller = beginOp();
      try {
        const json = stringifyData(data);
        const storage = await resolveStorage();
        controller.signal.throwIfAborted();
        const doc = await storage.getDocument(id);
        controller.signal.throwIfAborted();
        if (!doc || doc.collectionId !== collectionId) {
          endOp(controller);
          return null;
        }
        const envelope = await encryptWithKey(json, key);
        controller.signal.throwIfAborted();
        const prevMeta = doc.metadata as { createdAt?: number } | undefined;
        const createdAt =
          typeof prevMeta?.createdAt === 'number' ? prevMeta.createdAt : doc.createdAt;
        const now = nextTimestamp();
        await storage.addDocument({
          id,
          collectionId,
          metadata: {
            v: ENVELOPE_VERSION,
            ciphertext: envelope.ciphertext,
            iv: envelope.iv,
            createdAt,
            updatedAt: now,
          },
          createdAt,
          updatedAt: now,
        });
        controller.signal.throwIfAborted();
        const item: VaultItem<T> = { id, data, createdAt, updatedAt: now };
        if (mountedRef.current && !controller.signal.aborted) {
          setItems((prev) => prev.map((i) => (i.id === id ? item : i)));
        }
        endOp(controller);
        return item;
      } catch (err) {
        failOp(controller, err);
        return null;
      }
    },
    [beginOp, endOp, failOp, requireUnlockedKey, resolveStorage, collectionId, nextTimestamp]
  );

  const deleteItem = useCallback(
    async (id: string): Promise<boolean> => {
      if (IS_SERVER) return false;
      const key = requireUnlockedKey();
      if (!key) return false;
      if (id === META_ID) return false; // reserved id is never exposed

      const controller = beginOp();
      try {
        const storage = await resolveStorage();
        controller.signal.throwIfAborted();
        const doc = await storage.getDocument(id);
        controller.signal.throwIfAborted();
        if (!doc || doc.collectionId !== collectionId) {
          endOp(controller);
          return false;
        }
        await storage.deleteDocument(id);
        controller.signal.throwIfAborted();
        if (mountedRef.current && !controller.signal.aborted) {
          setItems((prev) => prev.filter((i) => i.id !== id));
        }
        endOp(controller);
        return true;
      } catch (err) {
        failOp(controller, err);
        return false;
      }
    },
    [beginOp, endOp, failOp, requireUnlockedKey, resolveStorage, collectionId]
  );

  const refresh = useCallback(async (): Promise<void> => {
    if (IS_SERVER) return;
    const key = requireUnlockedKey();
    if (!key) return;

    const controller = beginOp();
    try {
      const storage = await resolveStorage();
      controller.signal.throwIfAborted();
      const docs = await storage.getAllDocuments(collectionId);
      controller.signal.throwIfAborted();
      const list: VaultItem<T>[] = [];
      for (const doc of docs) {
        if (doc.id === META_ID) continue;
        list.push(await decryptItemDoc<T>(doc, key));
      }
      controller.signal.throwIfAborted();
      if (mountedRef.current && !controller.signal.aborted) {
        setItems(sortItems(list));
      }
      endOp(controller);
    } catch (err) {
      failOp(controller, err);
    }
  }, [beginOp, endOp, failOp, requireUnlockedKey, resolveStorage, collectionId]);

  const cancel = useCallback((): void => {
    abortControllerRef.current?.abort();
  }, []);

  // SSR: return inert state (no storage, no Web Crypto).
  if (IS_SERVER) {
    return {
      status: 'uninitialized',
      items: [],
      isBusy: false,
      error: null,
      unlock: async () => false,
      lock: () => {},
      createItem: async () => null,
      readItem: async () => null,
      updateItem: async () => null,
      deleteItem: async () => false,
      refresh: async () => {},
      cancel: () => {},
    };
  }

  return {
    status,
    items,
    isBusy,
    error,
    unlock,
    lock,
    createItem,
    readItem,
    updateItem,
    deleteItem,
    refresh,
    cancel,
  };
}
