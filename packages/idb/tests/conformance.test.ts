/**
 * @fileoverview StorageAdapter conformance suite run for IDBStorage.
 *
 * Maps the framework-agnostic contract cases from `@localmode/core`'s testing
 * utilities onto Vitest. Each case gets a fresh, uniquely named database
 * (fake-indexeddb backing, same as storage.test.ts); `reopen()` returns a NEW
 * `IDBStorage` instance over the SAME database name so the persistence cases
 * can prove data survives a close → reopen cycle.
 */

import 'fake-indexeddb/auto';
import { describe, it } from 'vitest';
import { createStorageAdapterConformanceSuite } from '@localmode/core';
import { IDBStorage } from '../src/index.js';

let dbCounter = 0;

const suite = createStorageAdapterConformanceSuite(async () => {
  const name = `idb-conformance-${Date.now()}-${dbCounter++}-${Math.random().toString(36).slice(2)}`;
  const adapter = new IDBStorage({ name });
  await adapter.open();
  return {
    adapter,
    reopen: async () => {
      const reopened = new IDBStorage({ name });
      await reopened.open();
      return reopened;
    },
  };
});

describe('IDBStorage — StorageAdapter conformance', () => {
  for (const c of suite) {
    it(c.name, () => c.run(), 30000);
  }
});
