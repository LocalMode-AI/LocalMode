/**
 * @file build-aggregates.test.ts
 * @description Unit witness for the pure aggregate-membership predicates.
 * @constraint `isBlock()` keys on the `ui/blocks/` name prefix, NOT the category
 * tag, so a block is excluded from `ui/all` + family aggregates under any tag.
 */
import { describe, it, expect } from 'vitest';
import { isBlock, isInternal, type RegistryItem } from './build-aggregates';

const twoTagBlock: RegistryItem = {
  name: 'ui/blocks/knowledge/semantic-search',
  type: 'registry:block',
  categories: ['blocks', 'knowledge'],
};
const flatBlock: RegistryItem = { name: 'ui/blocks/chat', type: 'registry:block', categories: ['blocks'] };
const nestedBlock: RegistryItem = {
  name: 'ui/blocks/vision/object-detector',
  type: 'registry:block',
  categories: ['blocks', 'vision'],
};
const primitive: RegistryItem = {
  name: 'ui/conversation/message',
  type: 'registry:component',
  categories: ['conversation'],
};
const seed: RegistryItem = { name: 'ui/device-badge', type: 'registry:component', categories: ['local-first'] };
const internal: RegistryItem = { name: 'ui/lib/utils', type: 'registry:lib', categories: ['internal'] };

describe('isBlock()', () => {
  it('keys on the name prefix, unaffected by the category tag', () => {
    expect(isBlock(twoTagBlock)).toBe(true);
    expect(isBlock(flatBlock)).toBe(true);
    expect(isBlock(nestedBlock)).toBe(true);
    expect(isBlock(primitive)).toBe(false);
    expect(isBlock(seed)).toBe(false);
  });
});

describe('isInternal()', () => {
  it('flags only items tagged "internal"', () => {
    expect(isInternal(internal)).toBe(true);
    expect(isInternal(primitive)).toBe(false);
    expect(isInternal(flatBlock)).toBe(false);
  });
});

describe('aggregate rollup predicate', () => {
  it('includes only public non-block components', () => {
    const fixture = [twoTagBlock, flatBlock, nestedBlock, primitive, seed, internal];
    const publicItems = fixture.filter((i) => !isInternal(i) && !isBlock(i) && i.name.startsWith('ui/'));
    expect(publicItems.map((i) => i.name)).toEqual(['ui/conversation/message', 'ui/device-badge']);
  });
});
