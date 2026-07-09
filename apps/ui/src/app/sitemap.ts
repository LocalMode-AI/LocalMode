import type { MetadataRoute } from 'next';
import { source } from '@/lib/source';
import {
  routeServedCategories,
  isFlatCategory,
  categoryRoute,
  canonicalRoute,
} from '@/app/blocks/category-map';

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://localmode.ai';

/**
 * Sitemap for localmode.ai. Drift-proof: block routes come from the same
 * `category-map` the gallery renders, and docs pages from the same `source` the
 * docs render — so adding/splitting a block or doc updates the sitemap for free.
 * Priorities follow seo.md §2.3 (homepage 1.0, hubs 0.9, category 0.8, tool/doc
 * pages 0.7). No dated frontmatter exists yet, so `lastModified` is build time.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [];
  const seen = new Set<string>();

  const add = (
    path: string,
    priority: number,
    changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'],
  ) => {
    if (seen.has(path)) return;
    seen.add(path);
    entries.push({ url: `${baseUrl}${path}`, lastModified: now, changeFrequency, priority });
  };

  // Home + primary hubs
  add('/', 1.0, 'weekly');
  add('/docs', 0.9, 'weekly');
  add('/docs/components', 0.8, 'weekly');
  add('/blocks', 0.8, 'weekly');
  add('/capabilities', 0.5, 'monthly');

  // Blocks: category pages (deep) + every block detail (tool) page.
  for (const category of routeServedCategories()) {
    if (isFlatCategory(category)) {
      // Flat category's page IS its single block — one 0.7 tool entry.
      add(canonicalRoute(category.blocks[0].slug), 0.7, 'monthly');
    } else {
      add(categoryRoute(category.category), 0.8, 'weekly');
      for (const block of category.blocks) add(canonicalRoute(block.slug), 0.7, 'monthly');
    }
  }

  // Docs pages (each fumadocs page). /docs + /docs/components already added above.
  for (const page of source.getPages()) {
    add(page.url, page.url === '/docs' ? 0.9 : 0.7, 'weekly');
  }

  return entries;
}
