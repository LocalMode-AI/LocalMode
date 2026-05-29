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

const blogBaseSchema = frontmatterSchema.extend({
  author: z.string(),
  date: z.string().date().or(z.date()),
  dateModified: z.string().date().or(z.date()).optional(),
  noindex: z.boolean().optional(),
  faq: z.array(z.object({
    question: z.string(),
    answer: z.string(),
  })).optional().default([]),
});

export const blogPosts = defineCollections({
  type: 'doc',
  dir: 'content/blog',
  files: ['*.mdx'],
  schema: blogBaseSchema,
});

export const modelPages = defineCollections({
  type: 'doc',
  dir: 'content/blog/models',
  schema: blogBaseSchema,
});

export const taskPages = defineCollections({
  type: 'doc',
  dir: 'content/blog/tasks',
  schema: blogBaseSchema,
});

export const comparePages = defineCollections({
  type: 'doc',
  dir: 'content/blog/compare',
  schema: blogBaseSchema,
});

export const useCasePages = defineCollections({
  type: 'doc',
  dir: 'content/blog/use-cases',
  schema: blogBaseSchema,
});

export const compatibilityPages = defineCollections({
  type: 'doc',
  dir: 'content/blog/compatibility',
  schema: blogBaseSchema,
});

export default defineConfig({
  mdxOptions: {
    // MDX options
  },
});
