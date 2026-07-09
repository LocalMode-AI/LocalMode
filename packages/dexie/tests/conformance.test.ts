/**
 * @fileoverview StorageAdapter conformance suite run against DexieStorage.
 *
 * Maps every case of core's framework-agnostic conformance suite onto Vitest.
 * Each case gets a fresh, uniquely named database (cases assume full isolation
 * from one another); `reopen()` yields a NEW DexieStorage instance over the
 * SAME underlying database — the suite closes the previous instance itself
 * before calling it, so persistence cases exercise a real close → reopen
 * cycle rather than in-memory instance state.
 *
 * Backed by fake-indexeddb (same unit-layer backing as storage.test.ts, with
 * the same cross-realm typed-array caveats noted there).
 */

import 'fake-indexeddb/auto';
import { describe, it } from 'vitest';
import { createStorageAdapterConformanceSuite } from '@localmode/core';
import { DexieStorage } from '../src/index.js';

let dbCounter = 0;

const suite = createStorageAdapterConformanceSuite(async () => {
  // Unique per invocation: timestamp + monotonic counter + random suffix.
  const name = `dexie-conformance-${Date.now()}-${dbCounter++}-${Math.random()
    .toString(36)
    .slice(2)}`;

  const adapter = new DexieStorage({ name });
  await adapter.open();

  return {
    adapter,
    reopen: async () => {
      const reopened = new DexieStorage({ name });
      await reopened.open();
      return reopened;
    },
  };
});

describe('DexieStorage conformance', () => {
  for (const c of suite) {
    it(c.name, () => c.run());
  }
});
