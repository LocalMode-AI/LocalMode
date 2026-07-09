/**
 * @fileoverview StorageAdapter conformance suite run against LocalForageStorage.
 *
 * Wires core's framework-agnostic `createStorageAdapterConformanceSuite` onto
 * Vitest. Each case gets a fresh `LocalForageStorage` over a unique store name
 * (full isolation between cases); `reopen()` returns a NEW instance over the
 * SAME store name, proving persistence across a close → reopen cycle.
 *
 * Backing: fake-indexeddb (same unit-layer backing as the existing
 * storage.test.ts) — localforage selects its IndexedDB driver, so typed-array
 * payloads go through real structured-clone semantics rather than the
 * localStorage JSON path.
 */

import 'fake-indexeddb/auto';
import { describe, it } from 'vitest';
import { createStorageAdapterConformanceSuite } from '@localmode/core';
import { LocalForageStorage } from '../src/index.js';

let conformanceCounter = 0;

const suite = createStorageAdapterConformanceSuite(async () => {
  const name = `conformance-${Date.now()}-${conformanceCounter++}-${Math.random()
    .toString(36)
    .slice(2)}`;

  const adapter = new LocalForageStorage({ name });
  await adapter.open();

  return {
    adapter,
    reopen: async () => {
      const reopened = new LocalForageStorage({ name });
      await reopened.open();
      return reopened;
    },
  };
});

describe('LocalForageStorage conformance', () => {
  for (const c of suite) {
    it(c.name, () => c.run());
  }
});
