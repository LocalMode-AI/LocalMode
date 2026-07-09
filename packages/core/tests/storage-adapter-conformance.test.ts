/**
 * @fileoverview Tests for the StorageAdapter conformance suite.
 *
 * Two goals:
 * 1. The full suite runs green against core's own MemoryStorage (which
 *    stores whole objects — the reference-correct behavior).
 * 2. The suite is provably able to FAIL: deliberately-broken adapters
 *    (extended-Collection-field dropping, Uint8Array widening) make the
 *    corresponding cases throw errors naming the violated contract.
 */

import { describe, it, expect } from 'vitest';
import {
  MemoryStorage,
  createStorageAdapterConformanceSuite,
} from '../src/index.js';
import type {
  Collection,
  StorageAdapterConformanceCase,
  StorageAdapterConformanceFactory,
} from '../src/index.js';

/**
 * Conformance factory over a MemoryStorage-family adapter. MemoryStorage's
 * close() is a no-op and its data lives on the instance, so returning the
 * same instance from reopen() IS "a new handle over the same underlying
 * database" for an in-memory adapter.
 */
function memoryFactory(create: () => MemoryStorage): StorageAdapterConformanceFactory {
  return async () => {
    const adapter = create();
    await adapter.open();
    return {
      adapter,
      reopen: async () => {
        await adapter.open();
        return adapter;
      },
    };
  };
}

function getCase(
  suite: StorageAdapterConformanceCase[],
  name: string
): StorageAdapterConformanceCase {
  const found = suite.find((c) => c.name === name);
  if (!found) {
    throw new Error(
      `Conformance case not found: '${name}'. Available: ${suite.map((c) => c.name).join(' | ')}`
    );
  }
  return found;
}

// ============================================================================
// Deliberately-broken adapters (red-first witnesses for the suite itself)
// ============================================================================

/**
 * Reproduces the shipped external-adapter bug: updateCollection persists only
 * { id, name, dimensions, createdAt }, silently dropping every extended
 * Collection field (modelFingerprint, calibration, pqCodebook, compression,
 * compressionCalibration, deltaCalibration).
 */
class ExtendedFieldDroppingStorage extends MemoryStorage {
  override async updateCollection(collection: Collection): Promise<void> {
    await super.updateCollection({
      id: collection.id,
      name: collection.name,
      dimensions: collection.dimensions,
      createdAt: collection.createdAt,
    });
  }
}

/**
 * Silently widens Uint8Array vector payloads to Float32Array on read —
 * the type-loss failure mode that turns quantized/compressed payloads
 * into garbage.
 */
class Uint8WideningStorage extends MemoryStorage {
  override async getVector(id: string): Promise<Float32Array | Uint8Array | null> {
    const stored = await super.getVector(id);
    return stored instanceof Uint8Array ? new Float32Array(stored) : stored;
  }
}

// ============================================================================
// Suite coverage (plumbing witness: the case list cannot silently shrink)
// ============================================================================

const EXPECTED_CASE_NAMES = [
  'documents: addDocument/getDocument round-trip',
  'documents: getDocument returns null for a missing id',
  'documents: deleteDocument removes the document',
  'documents: getAllDocuments/countDocuments scope to the collection',
  'vectors: Float32Array payload round-trips exactly',
  'vectors: Uint8Array payload round-trips as Uint8Array',
  'vectors: getVector returns null for a missing id',
  'vectors: deleteVector removes the vector',
  'vectors: getAllVectors returns a Map scoped to the collection',
  'index: saveIndex/loadIndex round-trip',
  'index: loadIndex returns null when no index is saved',
  'index: deleteIndex removes the saved index',
  'collections: create/get/getByName/getAll/update/delete round-trip',
  'collections: getCollection/getCollectionByName return null for missing records',
  'collections: extended fields round-trip through create and all read paths',
  'collections: updateCollection preserves extended fields',
  'clear: removes all data across stores',
  'clearCollection: clears only the target collection',
  'reopen: collection extended fields persist across close and reopen',
  'reopen: ingest → close → reopen → search returns ingested documents',
  'reopen: SQ8-compressed vectors keep cosine > 0.99 across reopen',
];

describe('createStorageAdapterConformanceSuite()', () => {
  it('covers the full contract surface (case list is complete)', () => {
    const suite = createStorageAdapterConformanceSuite(
      memoryFactory(() => new MemoryStorage())
    );
    expect(suite.map((c) => c.name)).toEqual(EXPECTED_CASE_NAMES);
    for (const c of suite) {
      expect(typeof c.run).toBe('function');
    }
  });

  describe('runs green against MemoryStorage (reference-correct adapter)', () => {
    const suite = createStorageAdapterConformanceSuite(
      memoryFactory(() => new MemoryStorage())
    );

    for (const c of suite) {
      it(c.name, c.run);
    }
  });

  describe('provably fails against broken adapters (red-first for the suite itself)', () => {
    it('updateCollection extended-field drop fails the fidelity case, naming every dropped field', async () => {
      const suite = createStorageAdapterConformanceSuite(
        memoryFactory(() => new ExtendedFieldDroppingStorage())
      );
      const fidelityCase = getCase(suite, 'collections: updateCollection preserves extended fields');

      const error = await fidelityCase.run().then(
        () => null,
        (e: unknown) => e as Error
      );
      expect(error).toBeInstanceOf(Error);
      expect(error!.message).toContain('dropped extended Collection field(s)');
      // Every extended field must be NAMED in the failure message.
      for (const field of [
        'modelFingerprint',
        'calibration',
        'pqCodebook',
        'compression',
        'compressionCalibration',
        'deltaCalibration',
      ]) {
        expect(error!.message).toContain(field);
      }
    });

    it('updateCollection extended-field drop fails the SQ8 reopen case (the cross-session corruption bug)', async () => {
      // The exact shipped-bug flow: compression calibration is written via
      // updateCollection(), so dropping extended fields there means reopened
      // vectors decode as raw bytes — the cosine check must catch it.
      const suite = createStorageAdapterConformanceSuite(
        memoryFactory(() => new ExtendedFieldDroppingStorage())
      );
      const sq8Case = getCase(suite, 'reopen: SQ8-compressed vectors keep cosine > 0.99 across reopen');

      await expect(sq8Case.run()).rejects.toThrow(/cosine similarity -?\d\.\d+ \(< 0\.99\) after reopen/);
      await expect(sq8Case.run()).rejects.toThrow(/compressionCalibration/);
    });

    it('Uint8Array-widening adapter fails the Uint8Array payload case', async () => {
      const suite = createStorageAdapterConformanceSuite(
        memoryFactory(() => new Uint8WideningStorage())
      );
      const payloadCase = getCase(suite, 'vectors: Uint8Array payload round-trips as Uint8Array');

      await expect(payloadCase.run()).rejects.toThrow(
        /must return a same-realm Uint8Array for a Uint8Array payload/
      );
    });

    it('broken adapters still pass unrelated cases (failures are precise, not blanket)', async () => {
      const suite = createStorageAdapterConformanceSuite(
        memoryFactory(() => new Uint8WideningStorage())
      );
      // Document ops are untouched by the widening bug — they must stay green.
      await expect(
        getCase(suite, 'documents: addDocument/getDocument round-trip').run()
      ).resolves.toBeUndefined();
    });
  });
});
