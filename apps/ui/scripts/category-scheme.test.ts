/**
 * @file category-scheme.test.ts
 * @description Synthetic N>1 witness + map-driven regression guard for the block
 * category scheme (design Decision 3 / blocks-category-scheme spec). Imports
 * ONLY the dependency-free `category-map` module, so it runs in the node-env
 * Vitest without alias/DOM config. Proves the multi-block (N>1) route/naming
 * mechanism structurally with a synthetic fixture and asserts the CURRENT map's
 * invariants derived from the map itself (flat categories keep `/blocks/<slug>`;
 * multi-block categories, introduced by Wave-2 split changes, expose deep
 * `/blocks/<category>/<slug>` routes) — robust to any category being flipped to
 * N>1 or renamed by a concurrent split change.
 */
import { describe, it, expect } from 'vitest';
import {
  type BlockCategory,
  CATEGORY_MAP,
  routeServedCategories,
  getCategory,
  getCategoryOf,
  isFlatCategory,
  itemNameFor,
  routeFor,
  blockItemName,
  canonicalRoute,
  categoryRoute,
} from '../src/app/blocks/category-map';

describe('category scheme — synthetic N>1 (multi-block) mechanism', () => {
  // A synthetic multi-block category, as a later split change would introduce.
  const multi: BlockCategory = {
    category: 'writing',
    title: 'Writing',
    blocks: [
      { slug: 'write', title: 'Write' },
      { slug: 'translate', title: 'Translate' },
      { slug: 'summarize', title: 'Summarize' },
    ],
  };

  it('treats a category with >1 block as non-flat', () => {
    expect(isFlatCategory(multi)).toBe(false);
  });

  it('derives `<category>/<slug>` registry item names for every member', () => {
    expect(itemNameFor(multi, 'write')).toBe('writing/write');
    expect(itemNameFor(multi, 'translate')).toBe('writing/translate');
    expect(itemNameFor(multi, 'summarize')).toBe('writing/summarize');
  });

  it('derives the canonical deep `/blocks/<category>/<slug>` route for every member', () => {
    expect(routeFor(multi, 'write')).toBe('/blocks/writing/write');
    expect(routeFor(multi, 'translate')).toBe('/blocks/writing/translate');
    expect(routeFor(multi, 'summarize')).toBe('/blocks/writing/summarize');
  });

  it('keeps deep routes distinct per member (a category page can host N)', () => {
    const routes = multi.blocks.map((b) => routeFor(multi, b.slug));
    expect(new Set(routes).size).toBe(multi.blocks.length);
  });
});

describe('category scheme — synthetic single-block (flat) mechanism', () => {
  const solo: BlockCategory = {
    category: 'solo',
    title: 'Solo',
    blocks: [{ slug: 'solo', title: 'Solo' }],
  };

  it('treats a category with exactly one block as flat (no stutter)', () => {
    expect(isFlatCategory(solo)).toBe(true);
    expect(itemNameFor(solo, 'solo')).toBe('solo');
    expect(routeFor(solo, 'solo')).toBe('/blocks/solo');
  });
});

describe('category scheme — current map invariants (map-driven)', () => {
  it('has exactly one chrome category (devtools-drawer); the rest are route-served', () => {
    const chrome = CATEGORY_MAP.filter((c) => c.chrome);
    expect(chrome.map((c) => c.category)).toEqual(['devtools-drawer']);
    // Route-served == every non-chrome category (count is map-driven so it stays
    // correct as concurrent split changes grow/rename categories).
    expect(routeServedCategories()).toHaveLength(CATEGORY_MAP.length - 1);
    expect(getCategory('devtools-drawer')?.chrome).toBe(true);
    expect(routeServedCategories().some((c) => c.category === 'devtools-drawer')).toBe(false);
    // Category ids are unique, and every block slug is globally unique.
    const ids = CATEGORY_MAP.map((c) => c.category);
    expect(new Set(ids).size).toBe(ids.length);
    const slugs = CATEGORY_MAP.flatMap((c) => c.blocks.map((b) => b.slug));
    expect(new Set(slugs).size, 'block slugs are globally unique').toBe(slugs.length);
  });

  it('derives names + routes correctly for every route-served category (flat or multi)', () => {
    for (const cat of routeServedCategories()) {
      expect(cat.blocks.length, `${cat.category} has ≥1 block`).toBeGreaterThan(0);
      if (isFlatCategory(cat)) {
        // Flat single-block category: name == slug == category, `/blocks/<slug>`.
        const slug = cat.blocks[0].slug;
        expect(slug).toBe(cat.category);
        expect(blockItemName(slug)).toBe(slug);
        expect(canonicalRoute(slug)).toBe(`/blocks/${slug}`);
        expect(categoryRoute(cat.category)).toBe(`/blocks/${slug}`);
      } else {
        // Multi-block category: deep `<category>/<slug>` names + routes, distinct.
        for (const b of cat.blocks) {
          expect(blockItemName(b.slug)).toBe(`${cat.category}/${b.slug}`);
          expect(canonicalRoute(b.slug)).toBe(`/blocks/${cat.category}/${b.slug}`);
          expect(itemNameFor(cat, b.slug)).toBe(`${cat.category}/${b.slug}`);
          expect(routeFor(cat, b.slug)).toBe(`/blocks/${cat.category}/${b.slug}`);
        }
        const routes = cat.blocks.map((b) => routeFor(cat, b.slug));
        expect(new Set(routes).size, `${cat.category} routes distinct`).toBe(cat.blocks.length);
        expect(categoryRoute(cat.category)).toBe(`/blocks/${cat.category}`);
      }
      // `getCategoryOf` round-trips every member slug back to its category.
      for (const b of cat.blocks) expect(getCategoryOf(b.slug)?.category).toBe(cat.category);
    }
  });
});

describe('category scheme — split-writing-text multi-block categories', () => {
  it('writing-tools hosts write/translate/summarize/complete at deep routes', () => {
    const cat = getCategory('writing-tools');
    expect(cat).toBeDefined();
    expect(isFlatCategory(cat!)).toBe(false);
    expect(cat!.blocks.map((b) => b.slug)).toEqual(['write', 'translate', 'summarize', 'complete']);
    for (const slug of ['write', 'translate', 'summarize', 'complete']) {
      expect(blockItemName(slug)).toBe(`writing-tools/${slug}`);
      expect(canonicalRoute(slug)).toBe(`/blocks/writing-tools/${slug}`);
    }
    expect(categoryRoute('writing-tools')).toBe('/blocks/writing-tools');
  });

  it('text-insights hosts sentiment-analyzer/text-classifier/model-evaluator/threshold-calibrator', () => {
    const cat = getCategory('text-insights');
    expect(cat).toBeDefined();
    expect(isFlatCategory(cat!)).toBe(false);
    expect(cat!.blocks.map((b) => b.slug)).toEqual([
      'sentiment-analyzer',
      'text-classifier',
      'model-evaluator',
      'threshold-calibrator',
    ]);
    for (const slug of ['sentiment-analyzer', 'text-classifier', 'model-evaluator', 'threshold-calibrator']) {
      expect(canonicalRoute(slug)).toBe(`/blocks/text-insights/${slug}`);
    }
  });
});
