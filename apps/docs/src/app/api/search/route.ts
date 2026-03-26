import { source, blog } from '@/lib/source';
import { createSearchAPI } from 'fumadocs-core/search/server';
import type { AdvancedIndex } from 'fumadocs-core/search/server';

export const { GET } = createSearchAPI('advanced', {
  // https://docs.orama.com/docs/orama-js/supported-languages
  language: 'english',
  indexes: [
    // Docs pages
    ...source.getPages().map<AdvancedIndex>((page) => ({
      id: page.url,
      title: page.data.title,
      description: page.data.description,
      structuredData: page.data.structuredData,
      url: page.url,
    })),
    // Blog posts
    ...blog.getPages().map<AdvancedIndex>((page) => ({
      id: page.url,
      title: page.data.title,
      description: page.data.description,
      structuredData: page.data.structuredData,
      url: page.url,
    })),
  ],
});
