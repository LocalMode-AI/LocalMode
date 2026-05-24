/**
 * @file audit-log.ts
 * @description Append-only, hash-chained, signed (and optionally encrypted)
 *              audit log primitive for compliance-driven workloads (HIPAA,
 *              SOX, FedRAMP-aligned).
 *
 * Properties enforced by this module:
 *
 * 1. Append-only — the public {@link AuditLog} interface exposes
 *    `append`, `list`, `head`, `tail`, `count`, and `close`. There is
 *    intentionally no `update`, `delete`, `compact`, or `clear`. Mutating
 *    history would defeat the audit story.
 * 2. Hash-chained — every entry stores `hash = base64(SHA-256(prevHash + canonicalJSON(entry-without-hash-and-signature)))`.
 *    `verifyChain()` recomputes hashes and detects modified payloads,
 *    inserted entries, or deleted middle entries.
 * 3. Signed — every entry's `signature` is a base64-encoded HMAC-SHA-256
 *    (default) or Ed25519 (when caller provides an Ed25519 CryptoKey)
 *    signature over `hash`. Signing the hash (not the payload) means the
 *    chain remains verifiable when payloads are encrypted at rest.
 * 4. Optionally encrypted — when an AES-GCM `CryptoKey` is supplied via
 *    `options.encryption`, payloads are AES-GCM encrypted before
 *    persistence. The hash is always computed over the *plaintext*
 *    canonical JSON so verification works without the encryption key.
 * 5. Storage-agnostic — persists via any value satisfying the
 *    {@link StorageAdapter} contract (IndexedDB by default, MemoryStorage
 *    for tests, Dexie/idb/localForage for downstream apps).
 * 6. Network-free — this module performs no network I/O. `exportAuditLog()`
 *    yields JSON Lines that the caller may transmit anywhere they like.
 *
 * Zero external dependencies — Web Crypto only.
 *
 * @see ../errors/index.ts {@link AuditLogError}
 */

import { AuditLogError } from '../errors/index.js';
import type { StoredDocument, Collection } from '../types.js';
import type { StorageAdapter } from '../storage/types.js';
import { IndexedDBStorage } from '../storage/indexeddb.js';

// ============================================================================
// Public Types
// ============================================================================

/**
 * A single, immutable entry in an audit log chain.
 *
 * Once persisted, no field of an `AuditEntry` may be changed. The library
 * provides no API to do so; callers who want a "corrected" entry must
 * append a new entry that references the original by id in its payload.
 */
export interface AuditEntry {
  /** Globally unique identifier for the entry. Defaults to `crypto.randomUUID()`. */
  id: string;
  /** Wall-clock timestamp (ms since epoch). Monotonically non-decreasing within a chain. */
  timestamp: number;
  /** Base64 SHA-256 of the previous entry's `hash`, or `null` for the genesis entry. */
  prevHash: string | null;
  /** Base64 SHA-256 over `prevHash + canonicalize({ id, timestamp, prevHash, kind, payload })`. */
  hash: string;
  /** Base64 signature over `hash` using the configured signature key. */
  signature: string;
  /** Caller-defined event type, e.g. `'user.login'`, `'policy.decision'`, `'redaction.performed'`. */
  kind: string;
  /** Caller-defined JSON-serializable record. Hashed in plaintext form, persisted encrypted if configured. */
  payload: unknown;
}

/**
 * Options for {@link createAuditLog}.
 */
export interface AuditLogOptions {
  /** Logical name of the chain. Used as the IndexedDB database name (`audit_log_{name}`) when `storage` is omitted. */
  name: string;
  /** Optional injected storage adapter. Defaults to a dedicated `IndexedDBStorage('audit_log_{name}')`. */
  storage?: StorageAdapter;
  /**
   * Optional caller-supplied signature key. Must be either an HMAC `CryptoKey`
   * with hash `SHA-256` or an Ed25519 `CryptoKey`. When omitted, an ephemeral
   * HMAC-SHA-256 key is generated for the lifetime of the instance.
   */
  signatureKey?: CryptoKey;
  /** Optional AES-GCM encryption key. When provided, payloads are encrypted at rest. Hashes remain over plaintext. */
  encryption?: { key: CryptoKey };
  /** Default chunk size for `list()`/`verifyChain()`/`exportAuditLog()` cancellation checks. Defaults to 1000. */
  chunkSize?: number;
}

/**
 * Options for {@link AuditLog.append}.
 */
export interface AppendOptions {
  /** Explicit entry id. If supplied and already present in the chain, `append` rejects with `duplicate_id`. */
  id?: string;
  /** Explicit timestamp (ms since epoch). Must be `>= tail.timestamp`, else `non_monotonic_timestamp`. */
  timestamp?: number;
  /** AbortSignal honored before storage write. */
  abortSignal?: AbortSignal;
}

/**
 * Options for {@link AuditLog.list}.
 */
export interface ListOptions {
  /** Maximum number of entries to return. */
  limit?: number;
  /** Number of entries to skip from the start of the chain. */
  offset?: number;
  /** Only include entries with `timestamp >= since`. */
  since?: number;
  /** Only include entries whose `kind` strictly equals this value. */
  kind?: string;
  /** AbortSignal honored at chunk boundaries. */
  abortSignal?: AbortSignal;
}

/**
 * Options for {@link verifyChain}.
 */
export interface VerifyOptions {
  /** AbortSignal honored at chunk boundaries (default chunk size 1000). */
  abortSignal?: AbortSignal;
  /** Progress callback invoked between chunks. */
  onProgress?: (checked: number, total: number) => void;
  /** Override default chunk size (1000). */
  chunkSize?: number;
}

/**
 * Result of {@link verifyChain}.
 */
export interface VerifyResult {
  /** True if every entry's hash, signature, and prevHash are intact. */
  ok: boolean;
  /** Zero-based index of the broken entry (set when `ok === false`). */
  brokenAt?: number;
  /** Diagnostic reason for failure. */
  reason?:
    | 'hash_mismatch'
    | 'prev_hash_mismatch'
    | 'signature_mismatch'
    | 'storage_error';
  /** Number of entries actually checked (may be less than total when aborted or broken). */
  entriesChecked: number;
  /** Wall-clock duration of the verify call in milliseconds. */
  durationMs: number;
}

/**
 * Options for {@link exportAuditLog}.
 */
export interface ExportOptions {
  /** When `true`, emit plaintext payloads (requires the encryption key on the AuditLog instance). */
  decryptPayloads?: boolean;
  /** AbortSignal honored at chunk boundaries. */
  abortSignal?: AbortSignal;
  /** Override default chunk size (1000). */
  chunkSize?: number;
}

/**
 * The append-only audit log handle returned by {@link createAuditLog}.
 *
 * The interface deliberately omits `update`, `delete`, `compact`, and
 * `clear`. Append-only is part of the contract, not an implementation
 * detail.
 */
export interface AuditLog {
  /** Append a new entry to the chain. Returns the persisted entry (with computed hash and signature). */
  append(kind: string, payload: unknown, options?: AppendOptions): Promise<AuditEntry>;
  /** Read entries in chain order, oldest first. */
  list(options?: ListOptions): Promise<AuditEntry[]>;
  /** Return the oldest (genesis) entry, or `null` for an empty chain. */
  head(): Promise<AuditEntry | null>;
  /** Return the most recent entry, or `null` for an empty chain. */
  tail(): Promise<AuditEntry | null>;
  /** Return the total entry count. */
  count(): Promise<number>;
  /** Release the storage adapter (only adapters this log opened itself; injected adapters are left untouched). */
  close(): Promise<void>;
  /**
   * Internal: the verification key (public for HMAC, public-key for Ed25519).
   * Exposed so that `verifyChain()` and `exportAuditLog()` can read it without
   * a closure handshake.
   * @internal
   */
  readonly _verificationKey: CryptoKey;
  /**
   * Internal: the encryption key, when configured. Exposed for `exportAuditLog`
   * which needs it for `decryptPayloads`.
   * @internal
   */
  readonly _encryptionKey: CryptoKey | null;
  /**
   * Internal: read raw persisted entries (encrypted form) without decryption.
   * Used by `verifyChain()` (which hashes over plaintext but only needs to
   * recompute against what was hashed; for encrypted logs, the persisted record
   * stores the canonical-plaintext hash so this returns enough info).
   * @internal
   */
  _readRawEntries(options?: { abortSignal?: AbortSignal }): Promise<PersistedEntry[]>;
  /**
   * Internal: chunk size to use for cancellable iteration.
   * @internal
   */
  readonly _chunkSize: number;
}

// ============================================================================
// Internal: Persisted record shape
// ============================================================================

/**
 * Shape of an encrypted payload as persisted (when encryption is configured).
 * Persisted as a plain object inside `StoredDocument.metadata`.
 */
interface EncryptedPayload {
  __aesgcm: 1;
  ciphertext: string; // base64
  iv: string; // base64
}

/**
 * Internal persisted form. Stored as a `StoredDocument` whose `metadata`
 * carries the audit fields. Decoupled from `AuditEntry` because the
 * persisted `payload` may be the encrypted blob.
 */
interface PersistedEntry {
  /** Sequence number (zero-padded string is the storage id). */
  seq: number;
  id: string;
  timestamp: number;
  prevHash: string | null;
  hash: string;
  signature: string;
  kind: string;
  /** Plaintext payload OR encrypted blob `{ __aesgcm: 1, ciphertext, iv }`. */
  payload: unknown;
}

// ============================================================================
// Internal: small helpers
// ============================================================================

const DEFAULT_CHUNK_SIZE = 1000;
const DEFAULT_PBKDF2_ITERATIONS = 100_000;
const SEQ_PADDING = 12; // 10^12 entries — well past any realistic chain length
const COLLECTION_PREFIX = 'audit_log:';

/** Base64-encode an ArrayBuffer / Uint8Array. */
function bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

/** Base64-decode to ArrayBuffer. */
function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/** Web Crypto availability check. */
function assertCryptoSupported(): void {
  if (
    typeof crypto === 'undefined' ||
    typeof crypto.subtle === 'undefined' ||
    typeof crypto.getRandomValues !== 'function'
  ) {
    throw new AuditLogError(
      'Web Crypto API is not available in this runtime',
      'crypto_unsupported'
    );
  }
}

/** Throw an AuditLogError with code `aborted` if the signal is aborted. */
function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new AuditLogError('Audit log operation was aborted', 'aborted');
  }
}

/** Zero-pad a sequence number for lexicographic-stable storage keys. */
function padSeq(seq: number): string {
  const s = String(seq);
  return s.length >= SEQ_PADDING ? s : '0'.repeat(SEQ_PADDING - s.length) + s;
}

// ============================================================================
// Canonical JSON
// ============================================================================

/**
 * Serialize `value` to a stable JSON string with sorted object keys, omitting
 * `undefined`, throwing on functions / symbols / circular references.
 *
 * This is a minimal canonicalization good enough for application-controlled
 * audit payloads. It is *not* full RFC 8785 — number normalization (e.g.,
 * `1.0` -> `"1"`) is left to the underlying `JSON.stringify`.
 *
 * @internal
 */
export function canonicalize(value: unknown): string {
  const seen = new WeakSet<object>();
  const walk = (v: unknown): unknown => {
    if (v === null) return null;
    const t = typeof v;
    if (t === 'function' || t === 'symbol') {
      throw new TypeError(`canonicalize: ${t} is not JSON-serializable`);
    }
    if (t !== 'object') return v;
    if (seen.has(v as object)) {
      throw new TypeError('canonicalize: circular reference');
    }
    seen.add(v as object);
    if (Array.isArray(v)) {
      return v.map(walk);
    }
    const obj = v as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const out: Record<string, unknown> = {};
    for (const k of keys) {
      const child = obj[k];
      if (child === undefined) continue;
      out[k] = walk(child);
    }
    return out;
  };
  return JSON.stringify(walk(value));
}

// ============================================================================
// Hashing & Signing
// ============================================================================

/**
 * Compute base64 SHA-256 of a string.
 * @internal
 */
async function sha256(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return bufferToBase64(digest);
}

/**
 * Sign `hash` (a base64 string) with the configured key. Returns a base64 signature.
 * @internal
 */
async function signEntry(hash: string, key: CryptoKey): Promise<string> {
  const algoName = (key.algorithm as { name: string }).name;
  const data = new TextEncoder().encode(hash);
  if (algoName === 'HMAC') {
    const sig = await crypto.subtle.sign('HMAC', key, data);
    return bufferToBase64(sig);
  }
  if (algoName === 'Ed25519') {
    const sig = await crypto.subtle.sign({ name: 'Ed25519' }, key, data);
    return bufferToBase64(sig);
  }
  throw new AuditLogError(
    `Unsupported signature algorithm: ${algoName}`,
    'unsupported_signature_algorithm'
  );
}

/**
 * Verify a base64 `signature` over `hash` against `key`. Returns true/false.
 * @internal
 */
async function verifySignature(
  hash: string,
  signature: string,
  key: CryptoKey
): Promise<boolean> {
  const algoName = (key.algorithm as { name: string }).name;
  const data = new TextEncoder().encode(hash);
  let sigBuffer: ArrayBuffer;
  try {
    sigBuffer = base64ToBuffer(signature);
  } catch {
    return false;
  }
  if (algoName === 'HMAC') {
    return crypto.subtle.verify('HMAC', key, sigBuffer, data);
  }
  if (algoName === 'Ed25519') {
    return crypto.subtle.verify({ name: 'Ed25519' }, key, sigBuffer, data);
  }
  throw new AuditLogError(
    `Unsupported signature algorithm: ${algoName}`,
    'unsupported_signature_algorithm'
  );
}

// ============================================================================
// Encryption helpers
// ============================================================================

/**
 * AES-GCM encrypt a JSON-serializable payload. Returns the persisted blob.
 * @internal
 */
async function encryptPayload(payload: unknown, key: CryptoKey): Promise<EncryptedPayload> {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext
  );
  return {
    __aesgcm: 1,
    ciphertext: bufferToBase64(ciphertext),
    iv: bufferToBase64(iv.buffer),
  };
}

/**
 * AES-GCM decrypt a persisted blob.
 * @internal
 */
async function decryptPayload(blob: EncryptedPayload, key: CryptoKey): Promise<unknown> {
  try {
    const ct = base64ToBuffer(blob.ciphertext);
    const iv = base64ToBuffer(blob.iv);
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    return JSON.parse(new TextDecoder().decode(plaintext));
  } catch (cause) {
    throw new AuditLogError(
      'Failed to decrypt audit log payload',
      'decryption_failed',
      { cause: cause instanceof Error ? cause : undefined }
    );
  }
}

/** Type guard for the persisted encrypted blob shape. */
function isEncryptedBlob(v: unknown): v is EncryptedPayload {
  return (
    typeof v === 'object' &&
    v !== null &&
    (v as Record<string, unknown>).__aesgcm === 1 &&
    typeof (v as Record<string, unknown>).ciphertext === 'string' &&
    typeof (v as Record<string, unknown>).iv === 'string'
  );
}

// ============================================================================
// Public: Key derivation / generation
// ============================================================================

/**
 * Options for {@link deriveAuditKey}.
 */
export interface DeriveAuditKeyOptions {
  /** Caller-supplied passphrase. */
  passphrase: string;
  /** Caller-controlled salt. Persist alongside the chain so the same passphrase reproduces the key. */
  salt: string | Uint8Array;
  /** PBKDF2 iterations. Default 100,000. */
  iterations?: number;
  /** Signature algorithm. Defaults to `'HMAC'`. */
  algorithm?: 'HMAC' | 'Ed25519';
  /** Whether the derived key is extractable. Default `false`. */
  extractable?: boolean;
}

/**
 * Derive a signature key from a passphrase using PBKDF2-SHA-256.
 *
 * The default algorithm is HMAC-SHA-256 (universally supported). For
 * `algorithm: 'Ed25519'` the runtime must support deterministic Ed25519
 * key derivation via Web Crypto, which is currently uncommon — most
 * callers should use HMAC.
 *
 * @example
 * ```ts
 * const salt = 'my-app-audit-salt'; // persist this alongside the chain
 * const key = await deriveAuditKey({ passphrase: userPassword, salt });
 * const log = await createAuditLog({ name: 'app', signatureKey: key });
 * ```
 *
 * @throws AuditLogError code `unsupported_signature_algorithm`
 *         When `algorithm` is `'Ed25519'` but the runtime does not support
 *         deterministic derivation.
 * @throws AuditLogError code `crypto_unsupported` when Web Crypto is missing.
 */
export async function deriveAuditKey(options: DeriveAuditKeyOptions): Promise<CryptoKey> {
  assertCryptoSupported();
  const {
    passphrase,
    salt,
    iterations = DEFAULT_PBKDF2_ITERATIONS,
    algorithm = 'HMAC',
    extractable = false,
  } = options;

  const saltBytes =
    typeof salt === 'string' ? new TextEncoder().encode(salt) : salt;

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  if (algorithm === 'HMAC') {
    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: saltBytes.buffer as ArrayBuffer,
        iterations,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'HMAC', hash: 'SHA-256' },
      extractable,
      ['sign', 'verify']
    );
  }

  // Ed25519 path: derive 32 raw bytes via PBKDF2 and import as Ed25519.
  let raw: ArrayBuffer;
  try {
    raw = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: saltBytes.buffer as ArrayBuffer,
        iterations,
        hash: 'SHA-256',
      },
      keyMaterial,
      256
    );
  } catch (cause) {
    throw new AuditLogError(
      'Failed to derive Ed25519 key material via PBKDF2',
      'unsupported_signature_algorithm',
      { cause: cause instanceof Error ? cause : undefined }
    );
  }

  try {
    return await crypto.subtle.importKey(
      'raw',
      raw,
      { name: 'Ed25519' },
      extractable,
      ['sign']
    );
  } catch (cause) {
    throw new AuditLogError(
      'Ed25519 deterministic key derivation is not supported in this runtime',
      'unsupported_signature_algorithm',
      { cause: cause instanceof Error ? cause : undefined }
    );
  }
}

/**
 * Options for {@link generateEphemeralAuditKey}.
 */
export interface GenerateEphemeralAuditKeyOptions {
  /** Signature algorithm. Defaults to `'HMAC'`. */
  algorithm?: 'HMAC' | 'Ed25519';
  /** Whether the generated key is extractable. Default `false`. */
  extractable?: boolean;
}

/**
 * Generate a fresh random signature key for the lifetime of a session.
 *
 * Default algorithm is HMAC-SHA-256. Ed25519 is only available where
 * `crypto.subtle.generateKey({ name: 'Ed25519' }, ...)` is supported.
 *
 * @example
 * ```ts
 * const key = await generateEphemeralAuditKey({ extractable: true });
 * // Caller is responsible for backing up the key out-of-band if persistence is desired.
 * ```
 */
export async function generateEphemeralAuditKey(
  options: GenerateEphemeralAuditKeyOptions = {}
): Promise<CryptoKey> {
  assertCryptoSupported();
  const { algorithm = 'HMAC', extractable = false } = options;

  if (algorithm === 'HMAC') {
    return crypto.subtle.generateKey(
      { name: 'HMAC', hash: 'SHA-256' },
      extractable,
      ['sign', 'verify']
    );
  }

  try {
    const pair = (await crypto.subtle.generateKey(
      { name: 'Ed25519' } as unknown as AlgorithmIdentifier,
      extractable,
      ['sign', 'verify']
    )) as CryptoKeyPair;
    return pair.privateKey;
  } catch (cause) {
    throw new AuditLogError(
      'Ed25519 is not supported by this runtime',
      'unsupported_signature_algorithm',
      { cause: cause instanceof Error ? cause : undefined }
    );
  }
}

// ============================================================================
// Storage layout
// ============================================================================

/**
 * Build a {@link Collection} for the audit log. The audit log persists each
 * entry as a {@link StoredDocument} under this collection so it doesn't
 * collide with VectorDB documents that callers might keep in the same adapter.
 */
function makeAuditCollection(name: string): Collection {
  return {
    id: `${COLLECTION_PREFIX}${name}`,
    name: `__audit_log_${name}`,
    dimensions: 0,
    createdAt: Date.now(),
  };
}

/**
 * Build the storage id for a sequence number.
 * Form: `audit_log:{name}:{padded-seq}` so iteration is lexicographically
 * sorted and the prefix prevents collision with VectorDB document ids.
 */
function makeEntryId(name: string, seq: number): string {
  return `${COLLECTION_PREFIX}${name}:${padSeq(seq)}`;
}

/** Read all persisted entries for a chain in chain order. */
async function readAllEntries(
  storage: StorageAdapter,
  collectionId: string
): Promise<PersistedEntry[]> {
  const docs = await storage.getAllDocuments(collectionId);
  const entries: PersistedEntry[] = [];
  for (const doc of docs) {
    const meta = doc.metadata as Record<string, unknown> | undefined;
    if (!meta || typeof meta.seq !== 'number') continue;
    entries.push({
      seq: meta.seq as number,
      id: meta.id as string,
      timestamp: meta.timestamp as number,
      prevHash: (meta.prevHash as string | null) ?? null,
      hash: meta.hash as string,
      signature: meta.signature as string,
      kind: meta.kind as string,
      payload: meta.payload,
    });
  }
  entries.sort((a, b) => a.seq - b.seq);
  return entries;
}

/** Persist a single entry as a StoredDocument under the audit collection. */
async function writeEntry(
  storage: StorageAdapter,
  name: string,
  collectionId: string,
  entry: PersistedEntry
): Promise<void> {
  const doc: StoredDocument = {
    id: makeEntryId(name, entry.seq),
    collectionId,
    metadata: {
      seq: entry.seq,
      id: entry.id,
      timestamp: entry.timestamp,
      prevHash: entry.prevHash,
      hash: entry.hash,
      signature: entry.signature,
      kind: entry.kind,
      payload: entry.payload,
    },
    createdAt: entry.timestamp,
    updatedAt: entry.timestamp,
  };
  await storage.addDocument(doc);
}

// ============================================================================
// Public: AuditLog factory
// ============================================================================

/**
 * Create an append-only, hash-chained, signed audit log.
 *
 * On first call against a given storage adapter, an empty chain is
 * initialized. On subsequent calls, the existing chain is loaded into
 * memory, and the tail entry's signature is verified against the supplied
 * (or generated) signature key. A mismatch rejects with `signature_mismatch`
 * — appending to a chain you did not write requires the matching key.
 *
 * @example
 * ```ts
 * import { createAuditLog, generateEphemeralAuditKey, MemoryStorage } from '@localmode/core';
 *
 * const key = await generateEphemeralAuditKey();
 * const log = await createAuditLog({
 *   name: 'demo',
 *   storage: new MemoryStorage(),
 *   signatureKey: key,
 * });
 *
 * await log.append('user.login', { userId: 'u1' });
 * await log.append('policy.decision', { action: 'allow', resource: 'r1' });
 * console.log(await log.count()); // 2
 * ```
 *
 * @throws AuditLogError code `crypto_unsupported` when `crypto.subtle` is missing.
 * @throws AuditLogError code `unsupported_signature_algorithm` when an unsupported `signatureKey` is supplied.
 * @throws AuditLogError code `signature_mismatch` when an existing chain's tail does not verify under the supplied key.
 */
export async function createAuditLog(options: AuditLogOptions): Promise<AuditLog> {
  assertCryptoSupported();

  const { name, signatureKey, encryption, chunkSize = DEFAULT_CHUNK_SIZE } = options;

  // Resolve storage. We track whether we own it so close() only closes
  // adapters we opened ourselves.
  let storage: StorageAdapter;
  let ownsStorage = false;
  if (options.storage) {
    storage = options.storage;
  } else {
    storage = new IndexedDBStorage(`audit_log_${name}`) as unknown as StorageAdapter;
    ownsStorage = true;
    await storage.open();
  }

  // Resolve signature key.
  let key: CryptoKey;
  if (signatureKey) {
    const algoName = (signatureKey.algorithm as { name: string }).name;
    if (
      !(algoName === 'HMAC' || algoName === 'Ed25519')
    ) {
      throw new AuditLogError(
        `Unsupported signature key algorithm: ${algoName}. Use HMAC-SHA-256 or Ed25519.`,
        'unsupported_signature_algorithm'
      );
    }
    if (algoName === 'HMAC') {
      const hash = (signatureKey.algorithm as { hash?: { name?: string } }).hash;
      if (hash && hash.name && hash.name !== 'SHA-256') {
        throw new AuditLogError(
          `HMAC keys must use SHA-256 (received ${hash.name}).`,
          'unsupported_signature_algorithm'
        );
      }
    }
    key = signatureKey;
  } else {
    key = await generateEphemeralAuditKey();
  }

  // Ensure the audit collection exists.
  const collection = makeAuditCollection(name);
  const existing = await storage.getCollection(collection.id);
  if (!existing) {
    await storage.createCollection(collection);
  }

  // Load existing chain.
  const persisted = await readAllEntries(storage, collection.id);

  // Verify the tail signature so we fail fast on key mismatch.
  if (persisted.length > 0) {
    const tail = persisted[persisted.length - 1]!;
    const ok = await verifySignature(tail.hash, tail.signature, key);
    if (!ok) {
      // Detach if we own the storage adapter so we don't leak the connection.
      if (ownsStorage) {
        try {
          await storage.close();
        } catch {
          // ignore
        }
      }
      throw new AuditLogError(
        'Existing audit chain tail signature does not verify under the supplied key',
        'signature_mismatch'
      );
    }
  }

  // In-memory tail tracking.
  let nextSeq = persisted.length;
  let tailEntry: PersistedEntry | null =
    persisted.length > 0 ? persisted[persisted.length - 1]! : null;
  let headEntry: PersistedEntry | null = persisted.length > 0 ? persisted[0]! : null;
  // Also track ids for duplicate detection without re-reading storage.
  const knownIds = new Set<string>(persisted.map((e) => e.id));

  // ---- Method implementations ----

  const append = async (
    kind: string,
    payload: unknown,
    appendOptions: AppendOptions = {}
  ): Promise<AuditEntry> => {
    throwIfAborted(appendOptions.abortSignal);

    const id = appendOptions.id ?? crypto.randomUUID();
    if (knownIds.has(id)) {
      throw new AuditLogError(
        `Audit entry id already exists: ${id}`,
        'duplicate_id',
        { context: { id } }
      );
    }

    // Resolve timestamp: clamp default; reject explicit out-of-order.
    let timestamp: number;
    if (appendOptions.timestamp !== undefined) {
      if (tailEntry && appendOptions.timestamp < tailEntry.timestamp) {
        throw new AuditLogError(
          `Explicit timestamp ${appendOptions.timestamp} is less than tail timestamp ${tailEntry.timestamp}`,
          'non_monotonic_timestamp',
          { context: { explicit: appendOptions.timestamp, tail: tailEntry.timestamp } }
        );
      }
      timestamp = appendOptions.timestamp;
    } else {
      const now = Date.now();
      timestamp = tailEntry ? Math.max(now, tailEntry.timestamp) : now;
    }

    const prevHash = tailEntry ? tailEntry.hash : null;

    // Hash is computed over plaintext canonical JSON (NEVER the ciphertext).
    const canonicalInput =
      (prevHash ?? '') +
      canonicalize({ id, timestamp, prevHash, kind, payload });
    const hash = await sha256(canonicalInput);
    const signature = await signEntry(hash, key);

    // Persist (encrypted if configured).
    const persistedPayload =
      encryption?.key !== undefined
        ? await encryptPayload(payload, encryption.key)
        : payload;

    throwIfAborted(appendOptions.abortSignal);

    const seq = nextSeq;
    const persistedEntry: PersistedEntry = {
      seq,
      id,
      timestamp,
      prevHash,
      hash,
      signature,
      kind,
      payload: persistedPayload,
    };

    try {
      await writeEntry(storage, name, collection.id, persistedEntry);
    } catch (cause) {
      throw new AuditLogError(
        'Failed to persist audit entry to storage',
        'storage_error',
        { cause: cause instanceof Error ? cause : undefined }
      );
    }

    nextSeq++;
    tailEntry = persistedEntry;
    if (!headEntry) headEntry = persistedEntry;
    knownIds.add(id);

    return {
      id,
      timestamp,
      prevHash,
      hash,
      signature,
      kind,
      payload, // Return plaintext to caller regardless of encryption-at-rest.
    };
  };

  const decryptIfNeeded = async (raw: unknown): Promise<unknown> => {
    if (encryption?.key !== undefined && isEncryptedBlob(raw)) {
      return decryptPayload(raw, encryption.key);
    }
    return raw;
  };

  const list = async (listOptions: ListOptions = {}): Promise<AuditEntry[]> => {
    throwIfAborted(listOptions.abortSignal);
    const all = await readAllEntries(storage, collection.id);
    const out: AuditEntry[] = [];
    let skipped = 0;
    for (let i = 0; i < all.length; i++) {
      if ((i + 1) % chunkSize === 0) {
        throwIfAborted(listOptions.abortSignal);
      }
      const e = all[i]!;
      if (listOptions.kind !== undefined && e.kind !== listOptions.kind) continue;
      if (listOptions.since !== undefined && e.timestamp < listOptions.since) continue;
      if (listOptions.offset !== undefined && skipped < listOptions.offset) {
        skipped++;
        continue;
      }
      const payload = await decryptIfNeeded(e.payload);
      out.push({
        id: e.id,
        timestamp: e.timestamp,
        prevHash: e.prevHash,
        hash: e.hash,
        signature: e.signature,
        kind: e.kind,
        payload,
      });
      if (listOptions.limit !== undefined && out.length >= listOptions.limit) break;
    }
    return out;
  };

  const head = async (): Promise<AuditEntry | null> => {
    if (!headEntry) return null;
    return {
      id: headEntry.id,
      timestamp: headEntry.timestamp,
      prevHash: headEntry.prevHash,
      hash: headEntry.hash,
      signature: headEntry.signature,
      kind: headEntry.kind,
      payload: await decryptIfNeeded(headEntry.payload),
    };
  };

  const tail = async (): Promise<AuditEntry | null> => {
    if (!tailEntry) return null;
    return {
      id: tailEntry.id,
      timestamp: tailEntry.timestamp,
      prevHash: tailEntry.prevHash,
      hash: tailEntry.hash,
      signature: tailEntry.signature,
      kind: tailEntry.kind,
      payload: await decryptIfNeeded(tailEntry.payload),
    };
  };

  const count = async (): Promise<number> => {
    return storage.countDocuments(collection.id);
  };

  const close = async (): Promise<void> => {
    if (ownsStorage) {
      try {
        await storage.close();
      } catch {
        // ignore — close should be idempotent
      }
    }
  };

  const _readRawEntries = async (
    rawOptions: { abortSignal?: AbortSignal } = {}
  ): Promise<PersistedEntry[]> => {
    throwIfAborted(rawOptions.abortSignal);
    return readAllEntries(storage, collection.id);
  };

  // Build the AuditLog handle. We define the methods with an object literal
  // that explicitly excludes update/delete/compact/clear so tests can assert
  // the runtime shape.
  const log: AuditLog = {
    append,
    list,
    head,
    tail,
    count,
    close,
    _verificationKey: key,
    _encryptionKey: encryption?.key ?? null,
    _readRawEntries,
    _chunkSize: chunkSize,
  };

  return log;
}

// ============================================================================
// verifyChain
// ============================================================================

/**
 * Walk every entry of an audit log chain, recomputing hashes and verifying
 * signatures.
 *
 * `verifyChain()` does NOT require the encryption key — only the signature
 * verification key (which is part of the {@link AuditLog} instance). For
 * encrypted logs, the persisted record stores the canonical-plaintext hash;
 * this function verifies the signature over that stored hash and checks the
 * `prevHash` link, but it cannot recompute the hash without the plaintext.
 * On unencrypted logs, the hash is fully recomputed.
 *
 * @example
 * ```ts
 * const result = await verifyChain(log, { abortSignal: controller.signal });
 * if (!result.ok) {
 *   console.error(`Chain broken at index ${result.brokenAt}: ${result.reason}`);
 * }
 * ```
 */
export async function verifyChain(
  log: AuditLog,
  options: VerifyOptions = {}
): Promise<VerifyResult> {
  const start = Date.now();
  const chunkSize = options.chunkSize ?? log._chunkSize ?? DEFAULT_CHUNK_SIZE;

  let entries: PersistedEntry[];
  try {
    entries = await log._readRawEntries({ abortSignal: options.abortSignal });
  } catch (err) {
    if (err instanceof AuditLogError && err.code === 'aborted') throw err;
    return {
      ok: false,
      reason: 'storage_error',
      entriesChecked: 0,
      durationMs: Date.now() - start,
    };
  }

  const total = entries.length;
  let prevHash: string | null = null;
  let checked = 0;

  for (let i = 0; i < total; i++) {
    if (i > 0 && i % chunkSize === 0) {
      if (options.abortSignal?.aborted) {
        throw new AuditLogError('verifyChain aborted', 'aborted');
      }
      options.onProgress?.(checked, total);
    }

    const e = entries[i]!;

    // 1. prevHash link check
    if (e.prevHash !== prevHash) {
      return {
        ok: false,
        brokenAt: i,
        reason: 'prev_hash_mismatch',
        entriesChecked: checked,
        durationMs: Date.now() - start,
      };
    }

    // 2. hash recomputation — only when payload is plaintext (i.e., the log was
    //    not encrypted, or the persisted plaintext matches what was hashed).
    //    For encrypted logs we cannot recompute without the encryption key, so
    //    we trust the stored hash but still verify the signature over it.
    if (!isEncryptedBlob(e.payload)) {
      const canonicalInput =
        (e.prevHash ?? '') +
        canonicalize({
          id: e.id,
          timestamp: e.timestamp,
          prevHash: e.prevHash,
          kind: e.kind,
          payload: e.payload,
        });
      let recomputed: string;
      try {
        recomputed = await sha256(canonicalInput);
      } catch (cause) {
        return {
          ok: false,
          brokenAt: i,
          reason: 'storage_error',
          entriesChecked: checked,
          durationMs: Date.now() - start,
        };
      }
      if (recomputed !== e.hash) {
        return {
          ok: false,
          brokenAt: i,
          reason: 'hash_mismatch',
          entriesChecked: checked,
          durationMs: Date.now() - start,
        };
      }
    }

    // 3. Signature verification (always possible — signs the hash, not the payload).
    let sigOk: boolean;
    try {
      sigOk = await verifySignature(e.hash, e.signature, log._verificationKey);
    } catch (err) {
      if (err instanceof AuditLogError && err.code === 'aborted') throw err;
      return {
        ok: false,
        brokenAt: i,
        reason: 'signature_mismatch',
        entriesChecked: checked,
        durationMs: Date.now() - start,
      };
    }
    if (!sigOk) {
      return {
        ok: false,
        brokenAt: i,
        reason: 'signature_mismatch',
        entriesChecked: checked,
        durationMs: Date.now() - start,
      };
    }

    prevHash = e.hash;
    checked++;
  }

  if (options.abortSignal?.aborted) {
    throw new AuditLogError('verifyChain aborted', 'aborted');
  }
  options.onProgress?.(checked, total);

  return {
    ok: true,
    entriesChecked: checked,
    durationMs: Date.now() - start,
  };
}

// ============================================================================
// exportAuditLog
// ============================================================================

/**
 * Export every entry of an audit log as JSON Lines.
 *
 * Each yielded string is a JSON-encoded entry followed by `'\n'`. The
 * default export preserves the on-disk format (including encrypted
 * payloads) so a verifier with only the signature key can recompute the
 * chain. Pass `{ decryptPayloads: true }` to emit plaintext payloads — the
 * exporting `AuditLog` instance must have been created with the encryption
 * key for this to succeed.
 *
 * @example
 * ```ts
 * const lines: string[] = [];
 * for await (const line of exportAuditLog(log)) {
 *   lines.push(line);
 * }
 * const blob = new Blob(lines, { type: 'application/x-ndjson' });
 * // Caller is responsible for transmitting the Blob to S3, Azure Blob, etc.
 * ```
 */
export async function* exportAuditLog(
  log: AuditLog,
  options: ExportOptions = {}
): AsyncIterable<string> {
  const chunkSize = options.chunkSize ?? log._chunkSize ?? DEFAULT_CHUNK_SIZE;
  throwIfAborted(options.abortSignal);

  const entries = await log._readRawEntries({ abortSignal: options.abortSignal });

  for (let i = 0; i < entries.length; i++) {
    if (i > 0 && i % chunkSize === 0) {
      throwIfAborted(options.abortSignal);
    }
    const e = entries[i]!;

    let payload: unknown = e.payload;
    if (options.decryptPayloads && log._encryptionKey && isEncryptedBlob(payload)) {
      payload = await decryptPayload(payload, log._encryptionKey);
    }

    const line = JSON.stringify({
      id: e.id,
      timestamp: e.timestamp,
      prevHash: e.prevHash,
      hash: e.hash,
      signature: e.signature,
      kind: e.kind,
      payload,
    });
    yield line + '\n';
  }
  throwIfAborted(options.abortSignal);
}
