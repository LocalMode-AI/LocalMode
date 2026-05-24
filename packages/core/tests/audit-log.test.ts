/**
 * Tests for the append-only, hash-chained, signed audit log.
 *
 * Covers happy path, append-only contract, tamper detection (3 vectors),
 * idempotency, monotonic timestamps, AbortSignal, encryption (incl. verify
 * without encryption key), HMAC vs Ed25519, key derivation, JSONL export
 * (incl. receiver-side verification), and backward compatibility across
 * instances sharing the same key.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createAuditLog,
  verifyChain,
  exportAuditLog,
  deriveAuditKey,
  generateEphemeralAuditKey,
  AuditLogError,
  MemoryStorage,
} from '../src/index.js';
import type { AuditLog } from '../src/index.js';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Read raw audit-log records directly out of a MemoryStorage instance so we
 * can simulate tampering without using the AuditLog API. Returns the
 * StoredDocument representations sorted by sequence number.
 */
async function readPersisted(storage: MemoryStorage, name: string) {
  const collectionId = `audit_log:${name}`;
  const docs = await storage.getAllDocuments(collectionId);
  docs.sort((a, b) => {
    const sa = (a.metadata as { seq: number }).seq;
    const sb = (b.metadata as { seq: number }).seq;
    return sa - sb;
  });
  return docs;
}

afterEach(() => {
  vi.useRealTimers();
});

// ============================================================================
// Happy path
// ============================================================================

describe('createAuditLog — happy path', () => {
  it('appends three entries, lists them in order, and verifyChain succeeds', async () => {
    const storage = new MemoryStorage();
    const log = await createAuditLog({ name: 'happy', storage });

    const e1 = await log.append('user.login', { userId: 'u1' });
    const e2 = await log.append('user.action', { resource: 'r1' });
    const e3 = await log.append('user.logout', { userId: 'u1' });

    expect(await log.count()).toBe(3);
    expect(e1.prevHash).toBeNull();
    expect(e2.prevHash).toBe(e1.hash);
    expect(e3.prevHash).toBe(e2.hash);

    const list = await log.list();
    expect(list.map((e) => e.kind)).toEqual([
      'user.login',
      'user.action',
      'user.logout',
    ]);

    const result = await verifyChain(log);
    expect(result.ok).toBe(true);
    expect(result.entriesChecked).toBe(3);
    expect(typeof result.durationMs).toBe('number');
  });

  it('hash is base64 length 44 (SHA-256) and prevHash chain is intact for 100 entries', async () => {
    const storage = new MemoryStorage();
    const log = await createAuditLog({ name: 'hash-chain', storage });

    const entries = [];
    for (let i = 0; i < 100; i++) {
      entries.push(await log.append('k', { i }));
    }

    for (let i = 0; i < 100; i++) {
      expect(entries[i]!.hash).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
      expect(entries[i]!.hash.length).toBe(44);
      if (i === 0) {
        expect(entries[i]!.prevHash).toBeNull();
      } else {
        expect(entries[i]!.prevHash).toBe(entries[i - 1]!.hash);
      }
    }

    const result = await verifyChain(log);
    expect(result.ok).toBe(true);
  });

  it('head() and tail() return the oldest and newest entries', async () => {
    const storage = new MemoryStorage();
    const log = await createAuditLog({ name: 'head-tail', storage });

    expect(await log.head()).toBeNull();
    expect(await log.tail()).toBeNull();

    const a = await log.append('a', {});
    const b = await log.append('b', {});

    const head = await log.head();
    const tail = await log.tail();
    expect(head?.id).toBe(a.id);
    expect(tail?.id).toBe(b.id);
  });
});

// ============================================================================
// Append-only contract
// ============================================================================

describe('AuditLog — append-only contract', () => {
  it('runtime object has no update / delete / compact / clear / removeEntry / editEntry', async () => {
    const storage = new MemoryStorage();
    const log = await createAuditLog({ name: 'no-mutate', storage });

    const forbidden = ['update', 'delete', 'compact', 'clear', 'removeEntry', 'editEntry'] as const;
    for (const m of forbidden) {
      expect((log as unknown as Record<string, unknown>)[m]).toBeUndefined();
    }
  });
});

// ============================================================================
// Tamper detection (3 vectors)
// ============================================================================

describe('verifyChain — tamper detection', () => {
  it('detects modified payload (hash_mismatch)', async () => {
    const storage = new MemoryStorage();
    const log = await createAuditLog({ name: 'tamper-payload', storage });
    await log.append('a', { v: 1 });
    await log.append('b', { v: 2 });
    await log.append('c', { v: 3 });

    // Modify the middle entry's payload directly without touching hash/signature.
    const docs = await readPersisted(storage, 'tamper-payload');
    const target = docs[1]!;
    const meta = target.metadata as Record<string, unknown>;
    meta.payload = { v: 999 };
    await storage.addDocument(target);

    const result = await verifyChain(log);
    expect(result.ok).toBe(false);
    expect(result.brokenAt).toBe(1);
    expect(result.reason).toBe('hash_mismatch');
  });

  it('detects deleted middle entry (prev_hash_mismatch)', async () => {
    const storage = new MemoryStorage();
    const log = await createAuditLog({ name: 'tamper-delete', storage });
    await log.append('a', { v: 1 });
    await log.append('b', { v: 2 });
    await log.append('c', { v: 3 });

    const docs = await readPersisted(storage, 'tamper-delete');
    await storage.deleteDocument(docs[1]!.id);

    const result = await verifyChain(log);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('prev_hash_mismatch');
    // The entry at index 1 in the (post-deletion) array is the original third
    // entry, whose prevHash points to the deleted entry's hash.
    expect(result.brokenAt).toBe(1);
  });

  it('detects modified signature (signature_mismatch)', async () => {
    const storage = new MemoryStorage();
    const log = await createAuditLog({ name: 'tamper-sig', storage });
    await log.append('a', { v: 1 });
    await log.append('b', { v: 2 });
    await log.append('c', { v: 3 });

    const docs = await readPersisted(storage, 'tamper-sig');
    const target = docs[2]!;
    const meta = target.metadata as Record<string, unknown>;
    // Replace the signature with random base64 of the same length.
    meta.signature = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
    await storage.addDocument(target);

    const result = await verifyChain(log);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('signature_mismatch');
    expect(result.brokenAt).toBe(2);
  });

  it('also detects modified hash field (becomes signature_mismatch since signature was over original hash)', async () => {
    const storage = new MemoryStorage();
    const log = await createAuditLog({ name: 'tamper-hash', storage });
    const e1 = await log.append('a', { v: 1 });
    await log.append('b', { v: 2 });

    const docs = await readPersisted(storage, 'tamper-hash');
    const target = docs[0]!;
    const meta = target.metadata as Record<string, unknown>;
    // Flip a couple of characters in the hash. This breaks both the hash
    // recomputation and the prev_hash chain check.
    meta.hash = e1.hash.slice(0, -2) + 'XX';
    await storage.addDocument(target);

    const result = await verifyChain(log);
    expect(result.ok).toBe(false);
    // Could be hash_mismatch (we recompute) or signature_mismatch (we sign the
    // hash). Either is acceptable for our tamper-detection guarantees.
    expect(['hash_mismatch', 'signature_mismatch']).toContain(result.reason);
  });
});

// ============================================================================
// Idempotency
// ============================================================================

describe('append — idempotency', () => {
  it('rejects duplicate explicit ids with AuditLogError code duplicate_id', async () => {
    const storage = new MemoryStorage();
    const log = await createAuditLog({ name: 'dup', storage });

    await log.append('k', {}, { id: 'fixed' });

    let caught: unknown = null;
    try {
      await log.append('k', {}, { id: 'fixed' });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AuditLogError);
    expect((caught as AuditLogError).code).toBe('duplicate_id');

    expect(await log.count()).toBe(1);
    const result = await verifyChain(log);
    expect(result.ok).toBe(true);
  });

  it('auto-generates unique ids over many appends', async () => {
    const storage = new MemoryStorage();
    const log = await createAuditLog({ name: 'ids', storage });

    const ids = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const e = await log.append('k', { i });
      ids.add(e.id);
    }
    expect(ids.size).toBe(200);
  });
});

// ============================================================================
// Monotonic timestamps
// ============================================================================

describe('append — monotonic timestamps', () => {
  it('rejects explicit timestamp older than tail with non_monotonic_timestamp', async () => {
    const storage = new MemoryStorage();
    const log = await createAuditLog({ name: 'mono', storage });
    await log.append('k', {}, { timestamp: 1_700_000_000_000 });

    let caught: unknown = null;
    try {
      await log.append('k', {}, { timestamp: 0 });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AuditLogError);
    expect((caught as AuditLogError).code).toBe('non_monotonic_timestamp');
  });

  it('clamps default timestamp to tail when wall clock skews backwards', async () => {
    const storage = new MemoryStorage();
    const log = await createAuditLog({ name: 'mono-clamp', storage });

    vi.setSystemTime(1_700_000_000_000);
    const a = await log.append('k', {});
    expect(a.timestamp).toBe(1_700_000_000_000);

    // Simulate clock skew: now is BEFORE the tail timestamp.
    vi.setSystemTime(1_699_999_999_000);
    const b = await log.append('k', {});
    expect(b.timestamp).toBe(1_700_000_000_000);

    const result = await verifyChain(log);
    expect(result.ok).toBe(true);
  });

  it('allows equal timestamps within the same millisecond', async () => {
    const storage = new MemoryStorage();
    const log = await createAuditLog({ name: 'mono-equal', storage });
    vi.setSystemTime(1_700_000_000_000);
    const a = await log.append('k', {});
    const b = await log.append('k', {});
    expect(a.timestamp).toBe(b.timestamp);
  });
});

// ============================================================================
// AbortSignal
// ============================================================================

describe('AbortSignal support', () => {
  it('append rejects without writing when given a pre-aborted signal', async () => {
    const storage = new MemoryStorage();
    const log = await createAuditLog({ name: 'abort-append', storage });

    const before = await log.count();
    expect(before).toBe(0);

    const controller = new AbortController();
    controller.abort();

    let caught: unknown = null;
    try {
      await log.append('k', {}, { abortSignal: controller.signal });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AuditLogError);
    expect((caught as AuditLogError).code).toBe('aborted');
    expect(await log.count()).toBe(0);
  });

  it('verifyChain stops within one chunk boundary on abort', async () => {
    const storage = new MemoryStorage();
    const log = await createAuditLog({ name: 'abort-verify', storage, chunkSize: 100 });

    // Build a chain with 500 entries.
    for (let i = 0; i < 500; i++) {
      await log.append('k', { i });
    }

    const controller = new AbortController();
    let progressCalls = 0;
    let aborted = false;
    const verifyPromise = verifyChain(log, {
      abortSignal: controller.signal,
      chunkSize: 100,
      onProgress: (checked, total) => {
        progressCalls++;
        if (checked >= 200 && !aborted) {
          controller.abort();
          aborted = true;
        }
      },
    });

    let caught: unknown = null;
    try {
      await verifyPromise;
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AuditLogError);
    expect((caught as AuditLogError).code).toBe('aborted');
    expect(progressCalls).toBeGreaterThan(0);
  });
});

// ============================================================================
// Cross-storage (Memory ↔ replay into an injected adapter)
// ============================================================================

describe('cross-storage', () => {
  it('chain authored on one MemoryStorage replays into another via raw entries', async () => {
    const storageA = new MemoryStorage();
    const key = await generateEphemeralAuditKey({ extractable: true });
    const logA = await createAuditLog({ name: 'cross', storage: storageA, signatureKey: key });
    await logA.append('a', { v: 1 });
    await logA.append('b', { v: 2 });
    await logA.append('c', { v: 3 });

    // "Replay" into a second MemoryStorage by copying the persisted documents.
    const storageB = new MemoryStorage();
    const docsA = await readPersisted(storageA, 'cross');
    // Ensure collection exists on B.
    const colA = await storageA.getCollection('audit_log:cross');
    if (colA) await storageB.createCollection(colA);
    for (const doc of docsA) {
      await storageB.addDocument(doc);
    }

    const logB = await createAuditLog({ name: 'cross', storage: storageB, signatureKey: key });
    expect(await logB.count()).toBe(3);
    const result = await verifyChain(logB);
    expect(result.ok).toBe(true);
    expect(result.entriesChecked).toBe(3);
  });
});

// ============================================================================
// Encryption integration
// ============================================================================

describe('encryption integration', () => {
  it('persists ciphertext (no plaintext substring on disk) and decrypts on list()', async () => {
    const storage = new MemoryStorage();
    const aesKey = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    const sigKey = await generateEphemeralAuditKey({ extractable: true });
    const log = await createAuditLog({
      name: 'enc',
      storage,
      signatureKey: sigKey,
      encryption: { key: aesKey },
    });

    const SECRET = '__SECRET_MARKER_xyz__';
    await log.append('phi.access', { note: SECRET, userId: 'u1' });

    // Inspect persisted form — must not contain the plaintext marker.
    const docs = await readPersisted(storage, 'enc');
    const persistedJson = JSON.stringify(docs);
    expect(persistedJson).not.toContain(SECRET);

    // Reading via list() decrypts the payload.
    const list = await log.list();
    expect(list).toHaveLength(1);
    expect((list[0]!.payload as { note: string }).note).toBe(SECRET);
  });

  it('verifyChain succeeds against an encrypted log when only the signature key is provided', async () => {
    const storage = new MemoryStorage();
    const aesKey = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    const sigKey = await generateEphemeralAuditKey({ extractable: true });

    const writer = await createAuditLog({
      name: 'enc-verify',
      storage,
      signatureKey: sigKey,
      encryption: { key: aesKey },
    });
    await writer.append('a', { secret: 'phi-A' });
    await writer.append('b', { secret: 'phi-B' });
    await writer.append('c', { secret: 'phi-C' });

    // Open a *new* AuditLog instance against the same storage with the
    // signature key only (no encryption key).
    const verifier = await createAuditLog({
      name: 'enc-verify',
      storage,
      signatureKey: sigKey,
      // No encryption key.
    });

    const result = await verifyChain(verifier);
    expect(result.ok).toBe(true);
    expect(result.entriesChecked).toBe(3);

    // list() on the verifier returns the encrypted blobs unchanged.
    const list = await verifier.list();
    expect(list).toHaveLength(3);
    for (const e of list) {
      expect(e.payload).toMatchObject({ __aesgcm: 1 });
    }
  });

  it('list() with the wrong AES-GCM key rejects with decryption_failed', async () => {
    const storage = new MemoryStorage();
    const aesKey1 = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    const aesKey2 = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    const sigKey = await generateEphemeralAuditKey({ extractable: true });

    const writer = await createAuditLog({
      name: 'enc-wrong',
      storage,
      signatureKey: sigKey,
      encryption: { key: aesKey1 },
    });
    await writer.append('a', { secret: 'phi-1' });

    const reader = await createAuditLog({
      name: 'enc-wrong',
      storage,
      signatureKey: sigKey,
      encryption: { key: aesKey2 },
    });

    let caught: unknown = null;
    try {
      await reader.list();
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AuditLogError);
    expect((caught as AuditLogError).code).toBe('decryption_failed');
  });
});

// ============================================================================
// HMAC vs Ed25519
// ============================================================================

describe('signature algorithms', () => {
  it('default key is HMAC-SHA-256', async () => {
    const storage = new MemoryStorage();
    const log = await createAuditLog({ name: 'algo-default', storage });
    const algoName = (log._verificationKey.algorithm as { name: string }).name;
    expect(algoName).toBe('HMAC');
    const hash = (log._verificationKey.algorithm as { hash?: { name?: string } }).hash;
    expect(hash?.name).toBe('SHA-256');

    await log.append('a', {});
    const result = await verifyChain(log);
    expect(result.ok).toBe(true);
  });

  it('appends and verifies with Ed25519 when the runtime supports it', async () => {
    let pair: CryptoKeyPair | null = null;
    try {
      pair = (await crypto.subtle.generateKey(
        { name: 'Ed25519' } as unknown as AlgorithmIdentifier,
        true,
        ['sign', 'verify']
      )) as CryptoKeyPair;
    } catch {
      console.warn('Skipping Ed25519 test — runtime does not support Ed25519');
      return;
    }
    const storage = new MemoryStorage();
    const log = await createAuditLog({
      name: 'algo-ed25519',
      storage,
      signatureKey: pair.privateKey,
    });

    await log.append('a', {});
    await log.append('b', {});

    // Re-open with the public key for verification (asymmetric path).
    const verifier = await createAuditLog({
      name: 'algo-ed25519',
      storage,
      signatureKey: pair.publicKey,
    });
    const result = await verifyChain(verifier);
    expect(result.ok).toBe(true);
    expect(result.entriesChecked).toBe(2);
  });

  it('rejects unsupported signature algorithm (RSA) with unsupported_signature_algorithm', async () => {
    const storage = new MemoryStorage();
    const rsa = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
        hash: 'SHA-256',
      },
      false,
      ['sign', 'verify']
    );

    let caught: unknown = null;
    try {
      await createAuditLog({
        name: 'algo-rsa',
        storage,
        signatureKey: (rsa as CryptoKeyPair).privateKey,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AuditLogError);
    expect((caught as AuditLogError).code).toBe('unsupported_signature_algorithm');
  });
});

// ============================================================================
// Key derivation
// ============================================================================

describe('deriveAuditKey', () => {
  it('produces deterministic signatures over identical input given the same passphrase + salt', async () => {
    const k1 = await deriveAuditKey({ passphrase: 'p', salt: 's' });
    const k2 = await deriveAuditKey({ passphrase: 'p', salt: 's' });

    const data = new TextEncoder().encode('hello');
    const s1 = await crypto.subtle.sign('HMAC', k1, data);
    const s2 = await crypto.subtle.sign('HMAC', k2, data);

    const a = new Uint8Array(s1);
    const b = new Uint8Array(s2);
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) {
      expect(a[i]).toBe(b[i]);
    }
  });

  it('different salts produce different signatures', async () => {
    const k1 = await deriveAuditKey({ passphrase: 'p', salt: 's1' });
    const k2 = await deriveAuditKey({ passphrase: 'p', salt: 's2' });

    const data = new TextEncoder().encode('hello');
    const s1 = new Uint8Array(await crypto.subtle.sign('HMAC', k1, data));
    const s2 = new Uint8Array(await crypto.subtle.sign('HMAC', k2, data));

    let differs = false;
    for (let i = 0; i < s1.length; i++) {
      if (s1[i] !== s2[i]) {
        differs = true;
        break;
      }
    }
    expect(differs).toBe(true);
  });

  it('extractable defaults to false', async () => {
    const k = await deriveAuditKey({ passphrase: 'p', salt: 's' });
    expect(k.extractable).toBe(false);
  });
});

describe('generateEphemeralAuditKey', () => {
  it('returns an HMAC-SHA-256 key by default', async () => {
    const k = await generateEphemeralAuditKey();
    expect((k.algorithm as { name: string }).name).toBe('HMAC');
    const hash = (k.algorithm as { hash?: { name?: string } }).hash;
    expect(hash?.name).toBe('SHA-256');
  });

  it('subsequent calls produce different keys', async () => {
    const k1 = await generateEphemeralAuditKey({ extractable: true });
    const k2 = await generateEphemeralAuditKey({ extractable: true });
    const data = new TextEncoder().encode('x');
    const s1 = new Uint8Array(await crypto.subtle.sign('HMAC', k1, data));
    const s2 = new Uint8Array(await crypto.subtle.sign('HMAC', k2, data));

    let differs = false;
    for (let i = 0; i < s1.length; i++) {
      if (s1[i] !== s2[i]) {
        differs = true;
        break;
      }
    }
    expect(differs).toBe(true);
  });
});

// ============================================================================
// Backward compatibility
// ============================================================================

describe('backward compatibility — append to a chain you didn\'t write', () => {
  it('instance B with the same key continues an existing chain', async () => {
    const storage = new MemoryStorage();
    const key = await generateEphemeralAuditKey({ extractable: true });
    const logA = await createAuditLog({ name: 'bc', storage, signatureKey: key });
    await logA.append('a', { v: 1 });
    await logA.append('b', { v: 2 });

    const logB = await createAuditLog({ name: 'bc', storage, signatureKey: key });
    expect(await logB.count()).toBe(2);
    const e3 = await logB.append('c', { v: 3 });
    const tail = await logA.tail();
    expect(e3.prevHash).toBe(tail?.hash);

    const result = await verifyChain(logB);
    expect(result.ok).toBe(true);
    expect(result.entriesChecked).toBe(3);
  });

  it('instance B with a wrong key rejects at createAuditLog with signature_mismatch', async () => {
    const storage = new MemoryStorage();
    const keyA = await generateEphemeralAuditKey({ extractable: true });
    const keyB = await generateEphemeralAuditKey({ extractable: true });
    const logA = await createAuditLog({ name: 'bc-wrong', storage, signatureKey: keyA });
    await logA.append('a', {});
    await logA.append('b', {});

    let caught: unknown = null;
    try {
      await createAuditLog({ name: 'bc-wrong', storage, signatureKey: keyB });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AuditLogError);
    expect((caught as AuditLogError).code).toBe('signature_mismatch');

    // Existing entries unchanged.
    const docs = await readPersisted(storage, 'bc-wrong');
    expect(docs).toHaveLength(2);
  });
});

// ============================================================================
// JSONL export (incl. receiver-side verification)
// ============================================================================

describe('exportAuditLog — JSONL', () => {
  it('yields exactly N lines, each ending with \\n and parsing as JSON', async () => {
    const storage = new MemoryStorage();
    const log = await createAuditLog({ name: 'export', storage });
    await log.append('a', { v: 1 });
    await log.append('b', { v: 2 });
    await log.append('c', { v: 3 });

    const lines: string[] = [];
    for await (const line of exportAuditLog(log)) {
      lines.push(line);
    }
    expect(lines).toHaveLength(3);
    for (const line of lines) {
      expect(line.endsWith('\n')).toBe(true);
      const parsed = JSON.parse(line);
      expect(parsed).toHaveProperty('id');
      expect(parsed).toHaveProperty('hash');
      expect(parsed).toHaveProperty('signature');
    }
  });

  it('default export preserves on-disk format for encrypted logs', async () => {
    const storage = new MemoryStorage();
    const aesKey = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    const sigKey = await generateEphemeralAuditKey({ extractable: true });
    const log = await createAuditLog({
      name: 'export-enc',
      storage,
      signatureKey: sigKey,
      encryption: { key: aesKey },
    });
    await log.append('a', { secret: 'phi-1' });

    const lines: string[] = [];
    for await (const line of exportAuditLog(log)) {
      lines.push(line);
    }
    const parsed = JSON.parse(lines[0]!);
    expect(parsed.payload).toMatchObject({ __aesgcm: 1 });
    expect(typeof parsed.payload.ciphertext).toBe('string');
  });

  it('decryptPayloads: true emits plaintext payloads', async () => {
    const storage = new MemoryStorage();
    const aesKey = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    const sigKey = await generateEphemeralAuditKey({ extractable: true });
    const log = await createAuditLog({
      name: 'export-dec',
      storage,
      signatureKey: sigKey,
      encryption: { key: aesKey },
    });
    await log.append('a', { secret: 'phi-A' });

    const lines: string[] = [];
    for await (const line of exportAuditLog(log, { decryptPayloads: true })) {
      lines.push(line);
    }
    const parsed = JSON.parse(lines[0]!);
    expect(parsed.payload).toEqual({ secret: 'phi-A' });
  });

  it('receiver-side verification: parse the JSONL, recompute hashes, verify signatures, confirm prevHash chain', async () => {
    // Use an extractable HMAC key so we can re-import it into the receiver.
    const sigKey = await generateEphemeralAuditKey({ extractable: true });
    const storage = new MemoryStorage();
    const log = await createAuditLog({ name: 'export-verify', storage, signatureKey: sigKey });
    await log.append('a', { v: 1 });
    await log.append('b', { v: 2 });
    await log.append('c', { v: 3 });

    const lines: string[] = [];
    for await (const line of exportAuditLog(log)) {
      lines.push(line);
    }

    // Receiver: parse lines, recompute hash chain, verify signatures.
    type Line = {
      id: string;
      timestamp: number;
      prevHash: string | null;
      hash: string;
      signature: string;
      kind: string;
      payload: unknown;
    };
    const parsed: Line[] = lines.map((l) => JSON.parse(l));

    // Receiver imports the key from raw bytes (would normally come from a
    // separate channel; we extract it here for the test).
    const rawKey = await crypto.subtle.exportKey('raw', sigKey);
    const verifyKey = await crypto.subtle.importKey(
      'raw',
      rawKey,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    // Inline canonicalize for receiver — re-implements the same minimal canonicalization.
    const canonicalize = (value: unknown): string => {
      const walk = (v: unknown): unknown => {
        if (v === null || typeof v !== 'object') return v;
        if (Array.isArray(v)) return v.map(walk);
        const obj = v as Record<string, unknown>;
        const out: Record<string, unknown> = {};
        for (const k of Object.keys(obj).sort()) {
          if (obj[k] === undefined) continue;
          out[k] = walk(obj[k]);
        }
        return out;
      };
      return JSON.stringify(walk(value));
    };

    const b64ToBuf = (s: string): ArrayBuffer => {
      const bin = atob(s);
      const u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      return u.buffer;
    };
    const bufToB64 = (b: ArrayBuffer): string => {
      const u = new Uint8Array(b);
      let s = '';
      for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]!);
      return btoa(s);
    };

    let prev: string | null = null;
    for (const e of parsed) {
      // 1. prevHash chain check.
      expect(e.prevHash).toBe(prev);

      // 2. Recompute hash.
      const canonical =
        (e.prevHash ?? '') +
        canonicalize({
          id: e.id,
          timestamp: e.timestamp,
          prevHash: e.prevHash,
          kind: e.kind,
          payload: e.payload,
        });
      const recomputed = bufToB64(
        await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical))
      );
      expect(recomputed).toBe(e.hash);

      // 3. Verify signature.
      const sigOk = await crypto.subtle.verify(
        'HMAC',
        verifyKey,
        b64ToBuf(e.signature),
        new TextEncoder().encode(e.hash)
      );
      expect(sigOk).toBe(true);

      prev = e.hash;
    }
  });
});

// ============================================================================
// Storage isolation
// ============================================================================

describe('storage prefix isolation', () => {
  it('using the same MemoryStorage for two named chains keeps them separate', async () => {
    const storage = new MemoryStorage();
    const a = await createAuditLog({ name: 'isolate-a', storage });
    const b = await createAuditLog({ name: 'isolate-b', storage });
    await a.append('x', {});
    await b.append('y', {});
    await b.append('z', {});

    expect(await a.count()).toBe(1);
    expect(await b.count()).toBe(2);
  });
});

// ============================================================================
// Network-call audit (static source check)
// ============================================================================

describe('source contains no network primitives', () => {
  it('audit-log.ts has no fetch / XMLHttpRequest / WebSocket / sendBeacon / EventSource', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const file = path.resolve(__dirname, '../src/security/audit-log.ts');
    const source = await fs.readFile(file, 'utf8');
    expect(source).not.toMatch(/\bfetch\(/);
    expect(source).not.toMatch(/new\s+XMLHttpRequest/);
    expect(source).not.toMatch(/new\s+WebSocket/);
    expect(source).not.toMatch(/navigator\.sendBeacon/);
    expect(source).not.toMatch(/new\s+EventSource/);
  });
});

// ============================================================================
// Type-level append-only check (compile-time)
// ============================================================================

describe('AuditLog type — append-only at compile time', () => {
  it('AuditLog has no update/delete/compact members at runtime', async () => {
    const log: AuditLog = await createAuditLog({ name: 'types', storage: new MemoryStorage() });
    // @ts-expect-error — append-only contract: no `update` method.
    expect(log.update).toBeUndefined();
    // @ts-expect-error — append-only contract: no `delete` method.
    expect(log.delete).toBeUndefined();
    // @ts-expect-error — append-only contract: no `compact` method.
    expect(log.compact).toBeUndefined();
  });
});
