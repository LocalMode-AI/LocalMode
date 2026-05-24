import {
  defineConfig,
  defineCollections,
  defineDocs,
  frontmatterSchema,
  metaSchema,
} from 'fumadocs-mdx/config';
import { z } from 'zod/v4';

// You can customise Zod schemas for frontmatter and `meta.json` here
// see https://fumadocs.dev/docs/mdx/collections
export const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    schema: frontmatterSchema,
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
  meta: {
    schema: metaSchema,
  },
});

export const blogPosts = defineCollections({
  type: 'doc',
  dir: 'content/blog',
  files: ['*.mdx'],
  schema: frontmatterSchema.extend({
    author: z.string(),
    date: z.string().date().or(z.date()),
  }),
});

export const modelPages = defineCollections({
  type: 'doc',
  dir: 'content/blog/models',
  schema: frontmatterSchema.extend({
    author: z.string(),
    date: z.string().date().or(z.date()),
    noindex: z.boolean().optional(),
  }),
});

export const taskPages = defineCollections({
  type: 'doc',
  dir: 'content/blog/tasks',
  schema: frontmatterSchema.extend({
    author: z.string(),
    date: z.string().date().or(z.date()),
    noindex: z.boolean().optional(),
  }),
});

export const comparePages = defineCollections({
  type: 'doc',
  dir: 'content/blog/compare',
  schema: frontmatterSchema.extend({
    author: z.string(),
    date: z.string().date().or(z.date()),
    noindex: z.boolean().optional(),
  }),
});

export const useCasePages = defineCollections({
  type: 'doc',
  dir: 'content/blog/use-cases',
  schema: frontmatterSchema.extend({
    author: z.string(),
    date: z.string().date().or(z.date()),
    noindex: z.boolean().optional(),
  }),
});

export const compatibilityPages = defineCollections({
  type: 'doc',
  dir: 'content/blog/compatibility',
  schema: frontmatterSchema.extend({
    author: z.string(),
    date: z.string().date().or(z.date()),
    noindex: z.boolean().optional(),
  }),
});

export default defineConfig({
  mdxOptions: {
    // MDX options
  },
});
