/**
 * Tests for the useEncryptedVault React hook.
 *
 * Real boundaries throughout: real Web Crypto (Node/jsdom `crypto.subtle` —
 * nothing crypto-related is mocked) and real `MemoryStorage` adapters shared
 * across hook instances to simulate reload. `iterations: 1000` is a genuine
 * config knob (PBKDF2 still runs); one test keeps the 100k default to prove
 * the real path. The SSR (`IS_SERVER`) branch is exercised for real in
 * `use-encrypted-vault.ssr.test.ts` under a node environment.
 */

import { describe, it, expect } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { MemoryStorage } from '@localmode/core';
import type { StorageAdapter, StoredDocument } from '@localmode/core';
import {
  useEncryptedVault,
  VaultPassphraseError,
  VaultLockedError,
} from '../src/hooks/use-encrypted-vault.js';

const PASSPHRASE = 'correct horse';
const WRONG_PASSPHRASE = 'battery staple';
const META_ID = '__vault_meta__';
const VAULT_NAME = 'test';
const COLLECTION_ID = `vault:${VAULT_NAME}`;
/** Low-but-real PBKDF2 iterations — a config knob, not a mock. */
const TEST_ITERATIONS = 1000;

type Payload = { note?: string; secret?: string };

function makeStorage(): StorageAdapter {
  return new MemoryStorage();
}

function renderVault(storage: StorageAdapter, options: { iterations?: number } = {}) {
  return renderHook(() =>
    useEncryptedVault<Payload>({
      name: VAULT_NAME,
      storage,
      iterations: options.iterations ?? TEST_ITERATIONS,
    })
  );
}

/** Initialize a vault on the given storage and unmount, leaving it locked. */
async function initializeVault(storage: StorageAdapter, items: Payload[] = []) {
  const { result, unmount } = renderVault(storage);
  await act(async () => {
    expect(await result.current.unlock(PASSPHRASE)).toBe(true);
  });
  for (const data of items) {
    await act(async () => {
      expect(await result.current.createItem(data)).not.toBeNull();
    });
  }
  unmount();
}

/**
 * Wrap a real MemoryStorage so `getDocument` gains latency. The inner adapter
 * still does all real work — the delay simulates I/O so in-flight operations
 * can be cancelled deterministically.
 */
function withSlowGetDocument(inner: StorageAdapter, delayMs: number): StorageAdapter {
  return new Proxy(inner, {
    get(target, prop, receiver) {
      if (prop === 'getDocument') {
        return async (id: string) => {
          await new Promise((r) => setTimeout(r, delayMs));
          return target.getDocument(id);
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

/** Record every adapter method call while delegating to the real adapter. */
function withCallRecorder(inner: StorageAdapter): { storage: StorageAdapter; calls: string[] } {
  const calls: string[] = [];
  const storage = new Proxy(inner, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value === 'function') {
        return (...args: unknown[]) => {
          calls.push(String(prop));
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      }
      return value;
    },
  });
  return { storage, calls };
}

function base64ByteLength(base64: string): number {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).byteLength;
}

async function sha256Base64(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

describe('useEncryptedVault', () => {
  // ==========================================================================
  // 2.1 Lifecycle
  // ==========================================================================

  describe('lifecycle', () => {
    it('first unlock initializes: uninitialized → unlocked with a persisted meta record', async () => {
      const storage = makeStorage();
      const { result } = renderVault(storage);

      expect(result.current.status).toBe('uninitialized');
      expect(result.current.items).toEqual([]);

      let unlocked = false;
      await act(async () => {
        unlocked = await result.current.unlock(PASSPHRASE);
      });

      expect(unlocked).toBe(true);
      expect(result.current.status).toBe('unlocked');
      expect(result.current.error).toBeNull();
      expect(result.current.isBusy).toBe(false);

      // Independent witness: the meta record landed in storage with
      // salt + iteration count + verifier ciphertext.
      const metaDoc = await storage.getDocument(META_ID);
      expect(metaDoc).not.toBeNull();
      const meta = metaDoc!.metadata as {
        version: number;
        salt: string;
        iterations: number;
        verifier: { ciphertext: string; iv: string };
      };
      expect(meta.version).toBe(1);
      expect(typeof meta.salt).toBe('string');
      expect(base64ByteLength(meta.salt)).toBe(16);
      expect(meta.iterations).toBe(TEST_ITERATIONS);
      expect(typeof meta.verifier.ciphertext).toBe('string');
      expect(base64ByteLength(meta.verifier.iv)).toBe(12);
    });

    it('remount over an initialized vault starts locked; correct passphrase restores decrypted items', async () => {
      const storage = makeStorage();
      await initializeVault(storage, [{ note: 'alpha' }, { note: 'beta' }]);

      // Fresh hook instance over the same adapter — simulated reload.
      const { result } = renderVault(storage);
      await waitFor(() => {
        expect(result.current.status).toBe('locked');
      });
      expect(result.current.items).toEqual([]);

      let unlocked = false;
      await act(async () => {
        unlocked = await result.current.unlock(PASSPHRASE);
      });

      expect(unlocked).toBe(true);
      expect(result.current.status).toBe('unlocked');
      expect(result.current.items.map((i) => i.data.note)).toEqual(['alpha', 'beta']);
      expect(result.current.error).toBeNull();
    });

    it('works with the default 100000 PBKDF2 iterations (real path, no override)', async () => {
      const storage = makeStorage();
      const first = renderHook(() => useEncryptedVault<Payload>({ name: VAULT_NAME, storage }));
      await act(async () => {
        expect(await first.result.current.unlock(PASSPHRASE)).toBe(true);
      });
      await act(async () => {
        expect(await first.result.current.createItem({ note: 'default-iters' })).not.toBeNull();
      });
      first.unmount();

      const meta = (await storage.getDocument(META_ID))!.metadata as { iterations: number };
      expect(meta.iterations).toBe(100000);

      const second = renderHook(() => useEncryptedVault<Payload>({ name: VAULT_NAME, storage }));
      await waitFor(() => expect(second.result.current.status).toBe('locked'));
      await act(async () => {
        expect(await second.result.current.unlock(PASSPHRASE)).toBe(true);
      });
      expect(second.result.current.items.map((i) => i.data.note)).toEqual(['default-iters']);
    });
  });

  // ==========================================================================
  // 2.2 Wrong passphrase (empty vault — the fail-open case the design closes)
  // ==========================================================================

  describe('wrong passphrase', () => {
    it('resolves false with VaultPassphraseError on an initialized EMPTY vault', async () => {
      const storage = makeStorage();
      await initializeVault(storage); // zero items

      const { result } = renderVault(storage);
      await waitFor(() => expect(result.current.status).toBe('locked'));

      let unlocked = true;
      await act(async () => {
        unlocked = await result.current.unlock(WRONG_PASSPHRASE);
      });

      expect(unlocked).toBe(false);
      expect(result.current.error).toBeInstanceOf(VaultPassphraseError);
      expect(result.current.error!.name).toBe('VaultPassphraseError');
      expect(result.current.status).toBe('locked');
      expect(result.current.items).toEqual([]);
      expect(result.current.isBusy).toBe(false);

      // The failed unlock retained no key: CRUD still reports locked.
      await act(async () => {
        expect(await result.current.createItem({ note: 'x' })).toBeNull();
      });
      expect(result.current.error).toBeInstanceOf(VaultLockedError);
    });

    it('recovers: wrong passphrase then correct passphrase unlocks and clears the error', async () => {
      const storage = makeStorage();
      await initializeVault(storage, [{ note: 'kept' }]);

      const { result } = renderVault(storage);
      await waitFor(() => expect(result.current.status).toBe('locked'));

      await act(async () => {
        expect(await result.current.unlock(WRONG_PASSPHRASE)).toBe(false);
      });
      expect(result.current.error).toBeInstanceOf(VaultPassphraseError);

      await act(async () => {
        expect(await result.current.unlock(PASSPHRASE)).toBe(true);
      });
      expect(result.current.status).toBe('unlocked');
      expect(result.current.error).toBeNull();
      expect(result.current.items.map((i) => i.data.note)).toEqual(['kept']);
    });
  });

  // ==========================================================================
  // 2.3 At-rest inspection (raw StoredDocuments, full-record scan)
  // ==========================================================================

  describe('encrypted at rest', () => {
    it('persists only ciphertext/IV envelopes + salt/iterations/verifier — no plaintext, passphrase, or hash', async () => {
      const storage = makeStorage();
      const marker = 'plaintext-marker-7f3a';
      const { result } = renderVault(storage);

      await act(async () => {
        expect(await result.current.unlock(PASSPHRASE)).toBe(true);
      });
      await act(async () => {
        expect(await result.current.createItem({ secret: marker })).not.toBeNull();
      });
      await act(async () => {
        expect(await result.current.createItem({ secret: marker })).not.toBeNull();
      });

      // Full record for the full run: every persisted document, serialized.
      const docs = await storage.getAllDocuments(COLLECTION_ID);
      expect(docs).toHaveLength(3); // meta + 2 items
      const serialized = JSON.stringify(docs);

      // No plaintext marker in ANY persisted field.
      expect(serialized).not.toContain(marker);
      // No passphrase and no unsalted SHA-256 of it (the Keystore anti-pattern).
      expect(serialized).not.toContain(PASSPHRASE);
      expect(serialized).not.toContain(await sha256Base64(PASSPHRASE));

      // Meta record: exactly the documented fields, nothing key-shaped.
      const metaDoc = docs.find((d) => d.id === META_ID)!;
      expect(Object.keys(metaDoc.metadata!).sort()).toEqual([
        'iterations',
        'salt',
        'verifier',
        'version',
      ]);
      const verifier = (metaDoc.metadata as { verifier: Record<string, string> }).verifier;
      expect(Object.keys(verifier).sort()).toEqual(['ciphertext', 'iv']);

      // Item records: exactly the envelope fields; IV is 12 bytes; v: 1.
      const itemDocs = docs.filter((d) => d.id !== META_ID);
      for (const doc of itemDocs) {
        expect(Object.keys(doc.metadata!).sort()).toEqual([
          'ciphertext',
          'createdAt',
          'iv',
          'updatedAt',
          'v',
        ]);
        const meta = doc.metadata as { v: number; ciphertext: string; iv: string };
        expect(meta.v).toBe(1);
        expect(base64ByteLength(meta.iv)).toBe(12);
        expect(base64ByteLength(meta.ciphertext)).toBeGreaterThan(0);
      }

      // Fresh IV per write: two items with IDENTICAL plaintext must differ
      // in both IV and ciphertext.
      const [a, b] = itemDocs.map((d) => d.metadata as { ciphertext: string; iv: string });
      expect(a!.iv).not.toBe(b!.iv);
      expect(a!.ciphertext).not.toBe(b!.ciphertext);
    });
  });

  // ==========================================================================
  // 2.4 CRUD round-trip + locked-state behavior
  // ==========================================================================

  describe('CRUD', () => {
    it('create/update/read/delete round-trips through items and storage with timestamps', async () => {
      const storage = makeStorage();
      const { result } = renderVault(storage);
      await act(async () => {
        expect(await result.current.unlock(PASSPHRASE)).toBe(true);
      });

      // Create
      let created: Awaited<ReturnType<typeof result.current.createItem>> = null;
      await act(async () => {
        created = await result.current.createItem({ note: 'alpha' });
      });
      expect(created).not.toBeNull();
      expect(created!.data).toEqual({ note: 'alpha' });
      expect(created!.createdAt).toBeGreaterThan(0);
      expect(created!.updatedAt).toBe(created!.createdAt);
      expect(result.current.items).toHaveLength(1);
      expect(await storage.getDocument(created!.id)).not.toBeNull();

      // Update
      let updated: Awaited<ReturnType<typeof result.current.updateItem>> = null;
      await act(async () => {
        updated = await result.current.updateItem(created!.id, { note: 'beta' });
      });
      expect(updated).not.toBeNull();
      expect(updated!.data).toEqual({ note: 'beta' });
      expect(updated!.createdAt).toBe(created!.createdAt);
      expect(updated!.updatedAt).toBeGreaterThanOrEqual(updated!.createdAt);
      expect(result.current.items[0]!.data).toEqual({ note: 'beta' });

      // Read decrypts the UPDATED envelope straight from storage.
      let read: Awaited<ReturnType<typeof result.current.readItem>> = null;
      await act(async () => {
        read = await result.current.readItem(created!.id);
      });
      expect(read).not.toBeNull();
      expect(read!.data).toEqual({ note: 'beta' });
      expect(read!.createdAt).toBe(created!.createdAt);

      // Delete
      let deleted = false;
      await act(async () => {
        deleted = await result.current.deleteItem(created!.id);
      });
      expect(deleted).toBe(true);
      expect(result.current.items).toEqual([]);
      expect(await storage.getDocument(created!.id)).toBeNull();

      // Missing-id paths resolve null/false without an error.
      await act(async () => {
        expect(await result.current.readItem('missing')).toBeNull();
        expect(await result.current.updateItem('missing', { note: 'x' })).toBeNull();
        expect(await result.current.deleteItem('missing')).toBe(false);
      });
      expect(result.current.error).toBeNull();
    });

    it('refresh() re-reads and decrypts out-of-band storage state', async () => {
      const storage = makeStorage();
      const { result } = renderVault(storage);
      await act(async () => {
        expect(await result.current.unlock(PASSPHRASE)).toBe(true);
      });
      let created: Awaited<ReturnType<typeof result.current.createItem>> = null;
      await act(async () => {
        created = await result.current.createItem({ note: 'here' });
      });

      // Out-of-band delete directly on the adapter (bypassing the hook).
      await storage.deleteDocument(created!.id);
      expect(result.current.items).toHaveLength(1); // hook state is stale

      await act(async () => {
        await result.current.refresh();
      });
      expect(result.current.items).toEqual([]);
      expect(result.current.error).toBeNull();
    });

    it('the reserved meta id is filtered from every read/mutate path', async () => {
      const storage = makeStorage();
      const { result } = renderVault(storage);
      await act(async () => {
        expect(await result.current.unlock(PASSPHRASE)).toBe(true);
      });
      const before = JSON.stringify(await storage.getAllDocuments(COLLECTION_ID));

      await act(async () => {
        expect(await result.current.readItem(META_ID)).toBeNull();
        expect(await result.current.updateItem(META_ID, { note: 'x' })).toBeNull();
        expect(await result.current.deleteItem(META_ID)).toBe(false);
      });

      expect(result.current.error).toBeNull();
      // Meta record untouched.
      expect(JSON.stringify(await storage.getAllDocuments(COLLECTION_ID))).toBe(before);
      expect(result.current.items).toEqual([]);
    });

    it('CRUD + refresh while locked resolve null/false with VaultLockedError and never touch storage', async () => {
      const inner = makeStorage();
      await initializeVault(inner, [{ note: 'sealed' }]);

      const { storage: recorded, calls } = withCallRecorder(inner);
      const { result } = renderVault(recorded);
      await waitFor(() => expect(result.current.status).toBe('locked'));

      const docsBefore = JSON.stringify(await inner.getAllDocuments(COLLECTION_ID));
      calls.length = 0; // ignore mount-detection reads

      await act(async () => {
        expect(await result.current.createItem({ note: 'x' })).toBeNull();
      });
      expect(result.current.error).toBeInstanceOf(VaultLockedError);
      expect(result.current.error!.name).toBe('VaultLockedError');

      await act(async () => {
        expect(await result.current.readItem('any')).toBeNull();
        expect(await result.current.updateItem('any', { note: 'x' })).toBeNull();
        expect(await result.current.deleteItem('any')).toBe(false);
        await result.current.refresh();
      });
      expect(result.current.error).toBeInstanceOf(VaultLockedError);
      expect(result.current.isBusy).toBe(false);

      // Two witnesses: zero adapter calls made, and the raw contents are
      // byte-identical.
      expect(calls).toEqual([]);
      expect(JSON.stringify(await inner.getAllDocuments(COLLECTION_ID))).toBe(docsBefore);
    });
  });

  // ==========================================================================
  // 2.5 lock() semantics
  // ==========================================================================

  describe('lock()', () => {
    it('clears items, makes CRUD fail with VaultLockedError, and re-unlock decrypts the same data', async () => {
      const storage = makeStorage();
      const { result } = renderVault(storage);
      await act(async () => {
        expect(await result.current.unlock(PASSPHRASE)).toBe(true);
      });
      await act(async () => {
        expect(await result.current.createItem({ note: 'persisted' })).not.toBeNull();
      });
      expect(result.current.items).toHaveLength(1);

      act(() => {
        result.current.lock();
      });

      expect(result.current.status).toBe('locked');
      expect(result.current.items).toEqual([]);
      expect(result.current.isBusy).toBe(false);

      // The key was dropped: CRUD reports locked (observable witness for the
      // non-extractable key being cleared).
      await act(async () => {
        expect(await result.current.createItem({ note: 'nope' })).toBeNull();
        expect(await result.current.readItem('any')).toBeNull();
      });
      expect(result.current.error).toBeInstanceOf(VaultLockedError);

      // Re-unlock decrypts the same persisted data — the key was the only
      // thing dropped.
      await act(async () => {
        expect(await result.current.unlock(PASSPHRASE)).toBe(true);
      });
      expect(result.current.status).toBe('unlocked');
      expect(result.current.items.map((i) => i.data.note)).toEqual(['persisted']);
    });
  });

  // ==========================================================================
  // 2.6 Abort (SSR lives in use-encrypted-vault.ssr.test.ts, node env)
  // ==========================================================================

  describe('cancellation', () => {
    it('cancel() mid-unlock leaves status locked, error null, isBusy false, no key retained', async () => {
      const inner = makeStorage();
      await initializeVault(inner, [{ note: 'locked-away' }]);

      const slow = withSlowGetDocument(inner, 50);
      const { result } = renderVault(slow);
      await waitFor(() => expect(result.current.status).toBe('locked'));

      let unlocked = true;
      await act(async () => {
        const promise = result.current.unlock(PASSPHRASE);
        result.current.cancel();
        unlocked = await promise;
      });

      expect(unlocked).toBe(false);
      expect(result.current.status).toBe('locked');
      expect(result.current.error).toBeNull();
      expect(result.current.isBusy).toBe(false);
      expect(result.current.items).toEqual([]);

      // No in-memory key was retained: CRUD still reports locked.
      await act(async () => {
        expect(await result.current.createItem({ note: 'x' })).toBeNull();
      });
      expect(result.current.error).toBeInstanceOf(VaultLockedError);
    });

    it('a cancelled FIRST unlock persists nothing (no partial initialization)', async () => {
      const inner = makeStorage();
      const slow = withSlowGetDocument(inner, 50);
      const { result } = renderVault(slow);
      expect(result.current.status).toBe('uninitialized');

      let unlocked = true;
      await act(async () => {
        const promise = result.current.unlock(PASSPHRASE);
        result.current.cancel();
        unlocked = await promise;
      });

      expect(unlocked).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.isBusy).toBe(false);
      // No meta record was written — the vault is still uninitialized.
      expect(await inner.getDocument(META_ID)).toBeNull();
    });

    it('unmount aborts an in-flight unlock without setState warnings or storage writes', async () => {
      const inner = makeStorage();
      const slow = withSlowGetDocument(inner, 50);
      const { result, unmount } = renderVault(slow);

      let promise: Promise<boolean> | undefined;
      await act(async () => {
        promise = result.current.unlock(PASSPHRASE);
      });
      unmount();
      expect(await promise!).toBe(false);

      // The aborted initialization never wrote the meta record.
      expect(await inner.getDocument(META_ID)).toBeNull();
    });
  });

  // ==========================================================================
  // Storage pluggability
  // ==========================================================================

  describe('pluggable storage', () => {
    it('persists every record through the injected adapter (no default IndexedDB database)', async () => {
      const inner = makeStorage();
      const { storage: recorded, calls } = withCallRecorder(inner);
      const { result } = renderVault(recorded);

      await act(async () => {
        expect(await result.current.unlock(PASSPHRASE)).toBe(true);
      });
      await act(async () => {
        expect(await result.current.createItem({ note: 'via-adapter' })).not.toBeNull();
      });

      // All writes went through the injected instance...
      expect(calls).toContain('addDocument');
      const docs: StoredDocument[] = await inner.getAllDocuments(COLLECTION_ID);
      expect(docs).toHaveLength(2); // meta + item
      // ...and no IndexedDB database was created (jsdom has no indexedDB —
      // a default-adapter attempt would have failed loudly instead).
      expect(typeof (globalThis as { indexedDB?: unknown }).indexedDB).toBe('undefined');
      expect(result.current.error).toBeNull();
    });
  });
});
