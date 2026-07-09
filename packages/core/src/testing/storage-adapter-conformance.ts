/**
 * StorageAdapter conformance suite.
 *
 * A framework-agnostic contract test suite for {@link StorageAdapter}
 * implementations. Adapter packages (and user-implemented adapters) map the
 * returned cases onto their own test framework — the suite itself imports no
 * test framework and asserts with plain `Error` throws, so core stays
 * zero-dependency.
 *
 * The suite covers the full storage contract: document/vector/index/collection
 * operations, typed-array payload fidelity (`Float32Array` AND `Uint8Array`),
 * full-fidelity `Collection` round-trips including the extended optional
 * fields core persists on the collection record (`modelFingerprint`,
 * `calibration`, `pqCodebook`, `compression`, `compressionCalibration`,
 * `deltaCalibration`), `clear`/`clearCollection` scoping, null returns for
 * missing records, and — critically — persistence across a close → reopen
 * cycle through the real `createVectorDB()`/`ingest()` integration path.
 * The reopen cases exist because adapter bugs that drop collection fields or
 * fail to persist data are invisible to single-session tests: quantized or
 * compressed vectors round-trip perfectly in-session and silently decode as
 * garbage in the next session.
 *
 * @packageDocumentation
 */

import type { StorageAdapter } from '../storage/types.js';
import type { Collection, Document, SerializedHNSWIndex } from '../types.js';
import { createVectorDB } from '../db.js';
import { ingest } from '../rag/ingest.js';
import { TEXT_METADATA_FIELD } from '../rag/types.js';

// ============================================================================
// Public types
// ============================================================================

/**
 * Context yielded by a {@link StorageAdapterConformanceFactory}.
 */
export interface StorageAdapterConformanceContext {
  /**
   * A freshly constructed, already-open adapter over a NEW, empty database.
   * Giving each factory invocation a unique database name is the factory
   * author's job — cases assume full isolation from one another.
   */
  adapter: StorageAdapter;

  /**
   * Return a NEW adapter instance over the SAME underlying database, after
   * the previous instance has been closed. Persistence cases use this to
   * prove data survives a close → reopen cycle. In-memory adapters whose
   * `close()` is a no-op and whose data lives on the instance may return the
   * same instance — that IS their "same underlying database".
   */
  reopen: () => Promise<StorageAdapter>;
}

/**
 * Factory invoked once per conformance case for a fresh, isolated database.
 */
export type StorageAdapterConformanceFactory = () => Promise<StorageAdapterConformanceContext>;

/**
 * A single named conformance case. `run()` resolves on success and throws an
 * `Error` naming the violated contract on failure.
 */
export interface StorageAdapterConformanceCase {
  /** Human-readable case name (used as the test title by adopters). */
  name: string;
  /** Execute the case against a fresh database from the factory. */
  run: () => Promise<void>;
}

// ============================================================================
// Assertion + fixture helpers (framework-free)
// ============================================================================

/**
 * Throw an actionable contract-violation error when the condition is false.
 */
function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`StorageAdapter contract violation: ${message}`);
  }
}

/**
 * Realm-safe typed-array tag detection. `instanceof` fails on typed arrays
 * structured-cloned from another realm (e.g. fake-indexeddb in tests), so
 * equality checks key on the `Object.prototype.toString` tag instead.
 */
function typedArrayTag(value: unknown): string | null {
  const tag = Object.prototype.toString.call(value);
  return /^\[object (?:Float|Int|Uint)\d+(?:Clamped)?Array\]$/.test(tag) ? tag : null;
}

/**
 * Deep structural equality over plain objects, arrays, typed arrays, and
 * primitives — the value shapes a `Collection` record can carry. Typed
 * arrays must match in tag (e.g. a `Float32Array` widened to a plain array
 * or a different typed-array type is NOT equal), compared element-wise.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return false;
  }

  const tagA = typedArrayTag(a);
  const tagB = typedArrayTag(b);
  if (tagA !== null || tagB !== null) {
    if (tagA !== tagB) return false;
    const arrA = a as unknown as ArrayLike<number>;
    const arrB = b as unknown as ArrayLike<number>;
    if (arrA.length !== arrB.length) return false;
    for (let i = 0; i < arrA.length; i++) {
      if (!Object.is(arrA[i], arrB[i])) return false;
    }
    return true;
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  const recA = a as Record<string, unknown>;
  const recB = b as Record<string, unknown>;
  const keysA = Object.keys(recA).filter((k) => recA[k] !== undefined);
  const keysB = Object.keys(recB).filter((k) => recB[k] !== undefined);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!deepEqual(recA[key], recB[key])) return false;
  }
  return true;
}

/** Simple deterministic 32-bit string hash (for text-seeded test vectors). */
function hashText(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash);
}

/**
 * Deterministic normalized vector from a seed (Mulberry32 PRNG). Local to
 * the suite so identical seeds always produce identical vectors regardless
 * of call order or batch position.
 */
function deterministicVector(dimensions: number, seed: number): Float32Array {
  let state = seed;
  const random = (): number => {
    let t = (state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const vector = new Float32Array(dimensions);
  let magnitude = 0;
  for (let i = 0; i < dimensions; i++) {
    vector[i] = random() * 2 - 1;
    magnitude += vector[i] * vector[i];
  }
  magnitude = Math.sqrt(magnitude);
  if (magnitude > 0) {
    for (let i = 0; i < dimensions; i++) {
      vector[i] /= magnitude;
    }
  }
  return vector;
}

/** Cosine similarity between two vectors. */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dot / magnitude;
}

/**
 * The optional `Collection` fields core persists on the collection record.
 * Dropping any of them silently corrupts quantized/compressed databases
 * across sessions and disables drift detection.
 */
const EXTENDED_COLLECTION_FIELDS = [
  'modelFingerprint',
  'calibration',
  'pqCodebook',
  'compression',
  'compressionCalibration',
  'deltaCalibration',
] as const;

/**
 * Build a `Collection` fixture carrying every extended optional field with
 * distinct, exactly-representable values.
 */
function createExtendedCollection(id: string, name: string): Collection {
  return {
    id,
    name,
    dimensions: 8,
    createdAt: 1700000000000,
    modelFingerprint: { modelId: 'mock:embedding', provider: 'mock', dimensions: 8 },
    calibration: {
      min: new Float32Array([-1, -0.75, -0.5, -0.25, -1.25, -0.125, -2, -0.0625]),
      max: new Float32Array([1, 0.75, 0.5, 0.25, 1.25, 0.125, 2, 0.0625]),
    },
    pqCodebook: {
      subvectors: 2,
      centroids: 2,
      subvectorDim: 4,
      codebook: [
        [new Float32Array([0.5, -0.5, 0.25, -0.25]), new Float32Array([1, -1, 0.75, -0.75])],
        [new Float32Array([0.125, -0.125, 2, -2]), new Float32Array([0.0625, -0.0625, 1.5, -1.5])],
      ],
    },
    compression: { type: 'sq8' },
    compressionCalibration: {
      min: new Float32Array([-3, -2.5, -2, -1.5, -1, -0.5, -0.25, -0.125]),
      max: new Float32Array([3, 2.5, 2, 1.5, 1, 0.5, 0.25, 0.125]),
    },
    deltaCalibration: {
      min: new Float32Array([-0.5, -0.5, -0.5, -0.5, -0.5, -0.5, -0.5, -0.5]),
      max: new Float32Array([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]),
    },
  };
}

/**
 * Deep-compare an expected `Collection` against a stored read-back, throwing
 * an error that NAMES the dropped/corrupted extended fields on mismatch.
 *
 * @param expected - The collection as written
 * @param actual - The collection as read back (null when the read failed)
 * @param readPath - Which read operation produced `actual` (for the message)
 */
function assertCollectionFidelity(
  expected: Collection,
  actual: Collection | null | undefined,
  readPath: string
): void {
  assert(
    actual !== null && actual !== undefined,
    `${readPath} returned ${String(actual)} for an existing collection '${expected.id}'`
  );

  assert(
    actual.id === expected.id &&
      actual.name === expected.name &&
      actual.dimensions === expected.dimensions &&
      actual.createdAt === expected.createdAt,
    `${readPath} corrupted the base Collection fields (id/name/dimensions/createdAt) for '${expected.id}'`
  );

  const dropped: string[] = [];
  const corrupted: string[] = [];
  for (const field of EXTENDED_COLLECTION_FIELDS) {
    const expectedValue = expected[field];
    const actualValue = actual[field];
    if (expectedValue === undefined) continue;
    if (actualValue === undefined) {
      dropped.push(field);
    } else if (!deepEqual(expectedValue, actualValue)) {
      corrupted.push(field);
    }
  }

  if (dropped.length > 0 || corrupted.length > 0) {
    const parts: string[] = [];
    if (dropped.length > 0) parts.push(`dropped extended Collection field(s): ${dropped.join(', ')}`);
    if (corrupted.length > 0) parts.push(`corrupted extended Collection field(s): ${corrupted.join(', ')}`);
    throw new Error(
      `StorageAdapter contract violation: ${readPath} ${parts.join('; ')}. ` +
        `Adapters must round-trip the FULL Collection object (persist { ...collection }, ` +
        `never a cherry-picked subset) — these fields carry quantization calibration, ` +
        `compression calibration, PQ codebooks, and the model fingerprint; dropping them ` +
        `corrupts quantized/compressed vectors on the next session and disables drift detection.`
    );
  }
}

// ============================================================================
// Case plumbing
// ============================================================================

/** Context handed to each case body, with reopen tracking for cleanup. */
interface TrackedContext {
  adapter: StorageAdapter;
  reopen: () => Promise<StorageAdapter>;
}

/**
 * Wrap a case body with fresh-factory setup and best-effort adapter cleanup.
 * Cleanup never masks a failure: assertion errors from the body propagate;
 * only redundant `close()` errors during teardown are ignored.
 */
function makeCase(
  factory: StorageAdapterConformanceFactory,
  name: string,
  body: (ctx: TrackedContext) => Promise<void>
): StorageAdapterConformanceCase {
  return {
    name,
    run: async () => {
      const raw = await factory();
      const adapters: StorageAdapter[] = [raw.adapter];
      const ctx: TrackedContext = {
        adapter: raw.adapter,
        reopen: async () => {
          const next = await raw.reopen();
          adapters.push(next);
          return next;
        },
      };
      try {
        await body(ctx);
      } finally {
        for (const adapter of adapters) {
          try {
            await adapter.close();
          } catch {
            // Teardown-only: the adapter may already be closed by the case.
          }
        }
      }
    },
  };
}

/** Fixed timestamps keep document round-trip comparisons exact. */
const DOC_CREATED_AT = 1700000001000;
const DOC_UPDATED_AT = 1700000002000;

function makeDoc(id: string, collectionId: string, metadata?: Record<string, unknown>) {
  return {
    id,
    collectionId,
    metadata,
    createdAt: DOC_CREATED_AT,
    updatedAt: DOC_UPDATED_AT,
  };
}

function makeIndexFixture(): SerializedHNSWIndex {
  return {
    version: 1,
    dimensions: 8,
    m: 16,
    efConstruction: 200,
    entryPointId: 'vec-1',
    maxLevel: 1,
    nodes: [
      { id: 'vec-1', level: 1, connections: [[0, ['vec-2']], [1, []]] },
      { id: 'vec-2', level: 0, connections: [[0, ['vec-1']]] },
    ],
  };
}

// ============================================================================
// The suite
// ============================================================================

/**
 * Create the StorageAdapter conformance suite for an adapter factory.
 *
 * Returns named cases covering the full {@link StorageAdapter} contract:
 * document/vector/index/collection operations with collection scoping,
 * `Float32Array` AND `Uint8Array` vector payload fidelity, full-fidelity
 * `Collection` round-trips including all extended optional fields,
 * `clear`/`clearCollection` scoping, null returns for missing records, and
 * close → reopen persistence through the real `createVectorDB()`/`ingest()`
 * integration path (plain and SQ8-compressed).
 *
 * Each case calls `factory()` for a fresh, isolated database — the factory
 * must return an already-open adapter over a NEW (uniquely named) empty
 * database, plus a `reopen()` handle that yields a NEW open adapter over the
 * SAME underlying database after close. Cases throw plain `Error`s naming
 * the violated contract; no test framework is imported.
 *
 * @param factory - Adapter factory yielding a fresh adapter and reopen handle
 * @returns Named conformance cases to map onto the adopter's test framework
 *
 * @example
 * ```typescript
 * // storage-conformance.test.ts in an adapter package (Vitest)
 * import 'fake-indexeddb/auto';
 * import { describe, it } from 'vitest';
 * import { createStorageAdapterConformanceSuite } from '@localmode/core';
 * import { DexieStorage } from '../src/index.js';
 *
 * const suite = createStorageAdapterConformanceSuite(async () => {
 *   const name = `conformance-${Date.now()}-${Math.random().toString(36).slice(2)}`;
 *   const adapter = new DexieStorage({ name });
 *   await adapter.open();
 *   return {
 *     adapter,
 *     reopen: async () => {
 *       const reopened = new DexieStorage({ name });
 *       await reopened.open();
 *       return reopened;
 *     },
 *   };
 * });
 *
 * describe('DexieStorage conformance', () => {
 *   for (const c of suite) it(c.name, c.run);
 * });
 * ```
 *
 * @see {@link StorageAdapter} for the contract under test
 */
export function createStorageAdapterConformanceSuite(
  factory: StorageAdapterConformanceFactory
): StorageAdapterConformanceCase[] {
  return [
    // ────────────────────────────────────────────────────────────────
    // Document operations
    // ────────────────────────────────────────────────────────────────
    makeCase(factory, 'documents: addDocument/getDocument round-trip', async ({ adapter }) => {
      const doc = makeDoc('doc-1', 'col-a', { title: 'Hello', nested: { tags: ['x', 'y'] } });
      await adapter.addDocument(doc);
      const stored = await adapter.getDocument('doc-1');
      assert(stored !== null, `getDocument('doc-1') returned null for a document that was just added`);
      assert(
        deepEqual(stored, doc),
        `getDocument('doc-1') did not round-trip the stored document (id/collectionId/metadata/createdAt/updatedAt must all survive)`
      );
    }),

    makeCase(factory, 'documents: getDocument returns null for a missing id', async ({ adapter }) => {
      const stored = await adapter.getDocument('does-not-exist');
      assert(stored === null, `getDocument() must return null for a missing id, got ${JSON.stringify(stored)}`);
    }),

    makeCase(factory, 'documents: deleteDocument removes the document', async ({ adapter }) => {
      await adapter.addDocument(makeDoc('doc-1', 'col-a'));
      await adapter.deleteDocument('doc-1');
      const stored = await adapter.getDocument('doc-1');
      assert(stored === null, `getDocument() must return null after deleteDocument(), got ${JSON.stringify(stored)}`);
    }),

    makeCase(
      factory,
      'documents: getAllDocuments/countDocuments scope to the collection',
      async ({ adapter }) => {
        await adapter.addDocument(makeDoc('doc-1', 'col-a'));
        await adapter.addDocument(makeDoc('doc-2', 'col-a'));
        await adapter.addDocument(makeDoc('doc-3', 'col-b'));

        const docsA = await adapter.getAllDocuments('col-a');
        assert(
          docsA.length === 2 && docsA.map((d) => d.id).sort().join(',') === 'doc-1,doc-2',
          `getAllDocuments('col-a') must return exactly the 2 documents of that collection, got [${docsA.map((d) => d.id).join(', ')}]`
        );

        const countA = await adapter.countDocuments('col-a');
        const countB = await adapter.countDocuments('col-b');
        assert(countA === 2, `countDocuments('col-a') must be 2, got ${countA}`);
        assert(countB === 1, `countDocuments('col-b') must be 1, got ${countB}`);
      }
    ),

    // ────────────────────────────────────────────────────────────────
    // Vector operations
    // ────────────────────────────────────────────────────────────────
    makeCase(factory, 'vectors: Float32Array payload round-trips exactly', async ({ adapter }) => {
      const vector = new Float32Array([0.5, -1.25, 0.0625, 3, -0.75, 2.5, -0.125, 1]);
      await adapter.addVector({ id: 'vec-1', collectionId: 'col-a', vector });

      const stored = await adapter.getVector('vec-1');
      assert(stored !== null, `getVector('vec-1') returned null for a vector that was just added`);
      assert(
        stored instanceof Float32Array,
        `getVector() must return a same-realm Float32Array for a Float32Array payload ` +
          `(cross-realm views from structured clone must be re-wrapped — core's decompression relies on instanceof), ` +
          `got ${Object.prototype.toString.call(stored)}`
      );
      assert(stored.length === vector.length, `Float32Array payload length changed: expected ${vector.length}, got ${stored.length}`);
      for (let i = 0; i < vector.length; i++) {
        assert(stored[i] === vector[i], `Float32Array payload corrupted at index ${i}: expected ${vector[i]}, got ${stored[i]}`);
      }
    }),

    makeCase(
      factory,
      'vectors: Uint8Array payload round-trips as Uint8Array',
      async ({ adapter }) => {
        const payload = new Uint8Array([0, 1, 2, 127, 128, 200, 254, 255]);
        await adapter.addVector({ id: 'vec-q', collectionId: 'col-a', vector: payload });

        const stored = await adapter.getVector('vec-q');
        assert(stored !== null, `getVector('vec-q') returned null for a vector that was just added`);
        assert(
          stored instanceof Uint8Array,
          `getVector() must return a same-realm Uint8Array for a Uint8Array payload — NOT silently widen it ` +
            `to Float32Array (quantized/compressed payloads decode as garbage if the type is lost), ` +
            `got ${Object.prototype.toString.call(stored)}`
        );
        assert(stored.length === payload.length, `Uint8Array payload length changed: expected ${payload.length}, got ${stored.length}`);
        for (let i = 0; i < payload.length; i++) {
          assert(stored[i] === payload[i], `Uint8Array payload corrupted at index ${i}: expected ${payload[i]}, got ${stored[i]}`);
        }
      }
    ),

    makeCase(factory, 'vectors: getVector returns null for a missing id', async ({ adapter }) => {
      const stored = await adapter.getVector('does-not-exist');
      assert(stored === null, `getVector() must return null for a missing id, got ${Object.prototype.toString.call(stored)}`);
    }),

    makeCase(factory, 'vectors: deleteVector removes the vector', async ({ adapter }) => {
      await adapter.addVector({ id: 'vec-1', collectionId: 'col-a', vector: new Float32Array([1, 2, 3, 4]) });
      await adapter.deleteVector('vec-1');
      const stored = await adapter.getVector('vec-1');
      assert(stored === null, `getVector() must return null after deleteVector()`);
    }),

    makeCase(
      factory,
      'vectors: getAllVectors returns a Map scoped to the collection',
      async ({ adapter }) => {
        const f32 = new Float32Array([0.25, -0.5, 0.75, -1]);
        const u8 = new Uint8Array([10, 20, 30, 40]);
        await adapter.addVector({ id: 'vec-1', collectionId: 'col-a', vector: f32 });
        await adapter.addVector({ id: 'vec-2', collectionId: 'col-a', vector: u8 });
        await adapter.addVector({ id: 'vec-3', collectionId: 'col-b', vector: new Float32Array([9, 9, 9, 9]) });

        const all = await adapter.getAllVectors('col-a');
        assert(all instanceof Map, `getAllVectors() must return a Map, got ${Object.prototype.toString.call(all)}`);
        assert(all.size === 2, `getAllVectors('col-a') must contain exactly the 2 vectors of that collection, got ${all.size}`);
        assert(!all.has('vec-3'), `getAllVectors('col-a') leaked vector 'vec-3' from collection 'col-b'`);

        const gotF32 = all.get('vec-1');
        const gotU8 = all.get('vec-2');
        assert(gotF32 instanceof Float32Array, `getAllVectors() must preserve Float32Array payload types`);
        assert(gotU8 instanceof Uint8Array, `getAllVectors() must preserve Uint8Array payload types (not widen to Float32Array)`);
        assert(deepEqual(gotF32, f32), `getAllVectors() corrupted the Float32Array payload of 'vec-1'`);
        assert(deepEqual(gotU8, u8), `getAllVectors() corrupted the Uint8Array payload of 'vec-2'`);
      }
    ),

    // ────────────────────────────────────────────────────────────────
    // Index operations
    // ────────────────────────────────────────────────────────────────
    makeCase(factory, 'index: saveIndex/loadIndex round-trip', async ({ adapter }) => {
      const index = makeIndexFixture();
      await adapter.saveIndex('col-a', index);
      const loaded = await adapter.loadIndex('col-a');
      assert(loaded !== null, `loadIndex('col-a') returned null for an index that was just saved`);
      assert(
        deepEqual(loaded, index),
        `loadIndex() did not round-trip the serialized HNSW index (version/dimensions/nodes/connections must all survive)`
      );
    }),

    makeCase(factory, 'index: loadIndex returns null when no index is saved', async ({ adapter }) => {
      const loaded = await adapter.loadIndex('never-saved');
      assert(loaded === null, `loadIndex() must return null when no index exists for the collection`);
    }),

    makeCase(factory, 'index: deleteIndex removes the saved index', async ({ adapter }) => {
      await adapter.saveIndex('col-a', makeIndexFixture());
      await adapter.deleteIndex('col-a');
      const loaded = await adapter.loadIndex('col-a');
      assert(loaded === null, `loadIndex() must return null after deleteIndex()`);
    }),

    // ────────────────────────────────────────────────────────────────
    // Collection operations
    // ────────────────────────────────────────────────────────────────
    makeCase(
      factory,
      'collections: create/get/getByName/getAll/update/delete round-trip',
      async ({ adapter }) => {
        const base: Collection = { id: 'col-a', name: 'alpha', dimensions: 8, createdAt: 1700000000000 };
        await adapter.createCollection(base);

        const byId = await adapter.getCollection('col-a');
        assert(byId !== null && byId.name === 'alpha', `getCollection('col-a') must return the created collection`);

        const byName = await adapter.getCollectionByName('alpha');
        assert(byName !== null && byName.id === 'col-a', `getCollectionByName('alpha') must return the created collection`);

        await adapter.createCollection({ id: 'col-b', name: 'beta', dimensions: 16, createdAt: 1700000000001 });
        const all = await adapter.getAllCollections();
        assert(
          all.length === 2 && all.map((c) => c.id).sort().join(',') === 'col-a,col-b',
          `getAllCollections() must return both created collections, got [${all.map((c) => c.id).join(', ')}]`
        );

        await adapter.updateCollection({ ...base, dimensions: 32 });
        const updated = await adapter.getCollection('col-a');
        assert(updated !== null && updated.dimensions === 32, `updateCollection() changes must be visible via getCollection()`);

        await adapter.deleteCollection('col-a');
        assert((await adapter.getCollection('col-a')) === null, `getCollection() must return null after deleteCollection()`);
        assert((await adapter.getCollection('col-b')) !== null, `deleteCollection('col-a') must not remove other collections`);
      }
    ),

    makeCase(
      factory,
      'collections: getCollection/getCollectionByName return null for missing records',
      async ({ adapter }) => {
        assert((await adapter.getCollection('missing')) === null, `getCollection() must return null for a missing id`);
        assert(
          (await adapter.getCollectionByName('missing')) === null,
          `getCollectionByName() must return null for a missing name`
        );
      }
    ),

    makeCase(
      factory,
      'collections: extended fields round-trip through create and all read paths',
      async ({ adapter }) => {
        const collection = createExtendedCollection('col-ext', 'extended');
        await adapter.createCollection(collection);

        assertCollectionFidelity(collection, await adapter.getCollection('col-ext'), 'getCollection()');
        assertCollectionFidelity(collection, await adapter.getCollectionByName('extended'), 'getCollectionByName()');

        const all = await adapter.getAllCollections();
        const fromAll = all.find((c) => c.id === 'col-ext');
        assertCollectionFidelity(collection, fromAll, 'getAllCollections()');
      }
    ),

    makeCase(
      factory,
      'collections: updateCollection preserves extended fields',
      async ({ adapter }) => {
        // Mirror core's real write pattern: the collection is created bare,
        // then calibration/fingerprint data is added via updateCollection().
        const bare: Collection = { id: 'col-ext', name: 'extended', dimensions: 8, createdAt: 1700000000000 };
        await adapter.createCollection(bare);

        const withExtended = createExtendedCollection('col-ext', 'extended');
        await adapter.updateCollection(withExtended);

        assertCollectionFidelity(withExtended, await adapter.getCollection('col-ext'), 'updateCollection() → getCollection()');
        assertCollectionFidelity(
          withExtended,
          await adapter.getCollectionByName('extended'),
          'updateCollection() → getCollectionByName()'
        );
      }
    ),

    // ────────────────────────────────────────────────────────────────
    // Clear operations
    // ────────────────────────────────────────────────────────────────
    makeCase(factory, 'clear: removes all data across stores', async ({ adapter }) => {
      await adapter.createCollection({ id: 'col-a', name: 'alpha', dimensions: 4, createdAt: 1700000000000 });
      await adapter.addDocument(makeDoc('doc-1', 'col-a'));
      await adapter.addVector({ id: 'doc-1', collectionId: 'col-a', vector: new Float32Array([1, 2, 3, 4]) });
      await adapter.saveIndex('col-a', makeIndexFixture());

      await adapter.clear();

      assert((await adapter.getDocument('doc-1')) === null, `clear() must remove documents`);
      assert((await adapter.getVector('doc-1')) === null, `clear() must remove vectors`);
      assert((await adapter.loadIndex('col-a')) === null, `clear() must remove indexes`);
      const collections = await adapter.getAllCollections();
      assert(collections.length === 0, `clear() must remove collections, ${collections.length} remained`);
    }),

    makeCase(factory, 'clearCollection: clears only the target collection', async ({ adapter }) => {
      await adapter.addDocument(makeDoc('doc-a', 'col-a'));
      await adapter.addVector({ id: 'doc-a', collectionId: 'col-a', vector: new Float32Array([1, 2, 3, 4]) });
      await adapter.saveIndex('col-a', makeIndexFixture());
      await adapter.addDocument(makeDoc('doc-b', 'col-b'));
      await adapter.addVector({ id: 'doc-b', collectionId: 'col-b', vector: new Float32Array([5, 6, 7, 8]) });
      await adapter.saveIndex('col-b', makeIndexFixture());

      await adapter.clearCollection('col-a');

      assert((await adapter.getDocument('doc-a')) === null, `clearCollection('col-a') must remove the collection's documents`);
      assert((await adapter.getVector('doc-a')) === null, `clearCollection('col-a') must remove the collection's vectors`);
      assert((await adapter.loadIndex('col-a')) === null, `clearCollection('col-a') must remove the collection's index`);

      assert((await adapter.getDocument('doc-b')) !== null, `clearCollection('col-a') must NOT remove documents of other collections`);
      assert((await adapter.getVector('doc-b')) !== null, `clearCollection('col-a') must NOT remove vectors of other collections`);
      assert((await adapter.loadIndex('col-b')) !== null, `clearCollection('col-a') must NOT remove indexes of other collections`);
    }),

    // ────────────────────────────────────────────────────────────────
    // Persistence across close → reopen
    // ────────────────────────────────────────────────────────────────
    makeCase(
      factory,
      'reopen: collection extended fields persist across close and reopen',
      async ({ adapter, reopen }) => {
        const collection = createExtendedCollection('col-ext', 'extended');
        await adapter.createCollection(collection);
        await adapter.close();

        const reopened = await reopen();
        assertCollectionFidelity(collection, await reopened.getCollection('col-ext'), 'reopen → getCollection()');
        assertCollectionFidelity(
          collection,
          await reopened.getCollectionByName('extended'),
          'reopen → getCollectionByName()'
        );
      }
    ),

    makeCase(
      factory,
      'reopen: ingest → close → reopen → search returns ingested documents',
      async ({ adapter, reopen }) => {
        const dimensions = 32;
        const embedText = (text: string): Float32Array => deterministicVector(dimensions, hashText(text));
        const embedder = async (texts: string[]): Promise<Float32Array[]> => texts.map(embedText);

        const documents = [
          { id: 'alpha', text: 'The quick brown fox jumps over the lazy dog.', metadata: { category: 'animals' } },
          { id: 'beta', text: 'Vector databases index embeddings for similarity search.', metadata: { category: 'tech' } },
          { id: 'gamma', text: 'Bread rises when yeast ferments sugars in the dough.', metadata: { category: 'baking' } },
        ];

        // Sync features are orthogonal to the storage contract under test;
        // disabling them keeps the case deterministic in non-browser runtimes.
        const sync = { enableLocking: false, enableBroadcast: false };

        const db = await createVectorDB({ name: 'conformance-reopen', dimensions, storage: adapter, sync });
        await ingest(db, documents, { generateEmbeddings: true, embedder });
        await db.close();

        const reopened = await reopen();
        const db2 = await createVectorDB({ name: 'conformance-reopen', dimensions, storage: reopened, sync });

        const results = await db2.search(embedText(documents[1].text), { k: 10 });
        await db2.close();

        assert(
          results.length === 3,
          `search() after reopen must return all 3 ingested chunks — the adapter failed to persist documents/vectors ` +
            `across sessions (got ${results.length} results)`
        );

        const top = results[0];
        assert(
          top.id === 'chunk_beta_0',
          `search() after reopen must rank the exact-match chunk first, got '${top.id}' — persisted vectors decoded incorrectly`
        );
        assert(
          top.score > 0.99,
          `search() after reopen must score the exact-match chunk > 0.99, got ${top.score.toFixed(4)} — persisted vectors decoded incorrectly`
        );
        assert(
          top.metadata?.category === 'tech' &&
            top.metadata?.sourceDocId === 'beta' &&
            top.metadata?.[TEXT_METADATA_FIELD] === documents[1].text,
          `search() after reopen must return the chunk with intact metadata (category/sourceDocId/${TEXT_METADATA_FIELD}), ` +
            `got ${JSON.stringify(top.metadata)}`
        );

        const ids = results.map((r) => r.id).sort().join(',');
        assert(
          ids === 'chunk_alpha_0,chunk_beta_0,chunk_gamma_0',
          `search() after reopen must return every ingested chunk, got [${ids}]`
        );
      }
    ),

    makeCase(
      factory,
      'reopen: SQ8-compressed vectors keep cosine > 0.99 across reopen',
      async ({ adapter, reopen }) => {
        const dimensions = 16;
        const count = 12;
        const originals = new Map<string, Float32Array>();
        const docs: Document[] = [];
        for (let i = 0; i < count; i++) {
          const id = `sq8-${i}`;
          const vector = deterministicVector(dimensions, 1000 + i);
          originals.set(id, vector);
          docs.push({ id, vector, metadata: { index: i } });
        }

        const sync = { enableLocking: false, enableBroadcast: false };
        const compression = { type: 'sq8' as const };

        const db = await createVectorDB({ name: 'conformance-sq8', dimensions, storage: adapter, sync, compression });
        await db.addMany(docs);
        await db.close();

        const reopened = await reopen();
        const db2 = await createVectorDB({ name: 'conformance-sq8', dimensions, storage: reopened, sync, compression });

        try {
          for (const [id, original] of originals) {
            const doc = await db2.get(id);
            assert(doc !== null, `get('${id}') returned null after reopen — the adapter failed to persist documents/vectors`);
            const similarity = cosineSimilarity(original, doc.vector);
            assert(
              similarity > 0.99,
              `SQ8-compressed vector '${id}' decoded with cosine similarity ${similarity.toFixed(4)} (< 0.99) after reopen. ` +
                `The adapter almost certainly dropped the collection's compressionCalibration/compression fields on write — ` +
                `collection ops must round-trip the FULL Collection object, or every compressed vector decodes as raw bytes ` +
                `in the next session.`
            );
          }
        } finally {
          await db2.close();
        }
      }
    ),
  ];
}
