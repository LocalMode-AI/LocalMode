/**
 * @file type-table-data.test.ts
 * @description Real-flow tests for the props-table resolver behind
 * `<AutoTypeTable>` and the markdown export. No mocks: sources are read from the
 * real registry files and resolved by the real fumadocs-typescript generator.
 * Covers the read boundary (only `registry/` sources, no `..` escape) and the
 * inherited-attribute filter, which depends on the dom-baseline types loading.
 */
import { describe, expect, it } from 'vitest';
import { getOwnPropDocs } from '@/lib/type-table-data';

describe('getOwnPropDocs()', () => {
  it('resolves a standalone props interface from a registry source', async () => {
    const docs = await getOwnPropDocs({
      path: 'registry/localmode/local-first/device-badge/device-badge.tsx',
      name: 'DeviceBadgeProps',
    });
    expect(docs.map((d) => d.name)).toEqual(['DeviceBadgeProps']);
    const names = docs[0].entries.map((e) => e.name);
    expect(names).toEqual(expect.arrayContaining(['capability', 'label']));
    expect(docs[0].entries.find((e) => e.name === 'capability')?.default).toBe('"webgpu"');
  });

  it("drops the inherited <div> attributes of a ComponentProps<'div'> interface", async () => {
    const docs = await getOwnPropDocs({
      path: 'registry/localmode/conversation/in-message-error/in-message-error.tsx',
      name: 'InMessageErrorProps',
    });
    const names = docs.flatMap((d) => d.entries.map((e) => e.name)).sort();
    expect(names).toEqual(['error', 'onRetry', 'retryLabel']);
  });

  it('rejects a source outside registry/', async () => {
    await expect(
      getOwnPropDocs({ path: 'src/lib/dom-baseline.ts', name: 'DomBaselineDiv' })
    ).rejects.toThrow('Type-table source must live under registry/: "src/lib/dom-baseline.ts"');
  });

  it('rejects a registry/ path that escapes the root with ..', async () => {
    await expect(
      getOwnPropDocs({ path: 'registry/../src/lib/dom-baseline.ts', name: 'DomBaselineDiv' })
    ).rejects.toThrow(
      'Type-table source must live under registry/: "registry/../src/lib/dom-baseline.ts"'
    );
  });
});
