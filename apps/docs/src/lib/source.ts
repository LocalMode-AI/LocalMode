import {
  docs,
  blogPosts,
  modelPages,
  taskPages,
  comparePages,
  useCasePages,
  compatibilityPages,
} from 'collections/server';
import { type InferPageType, loader } from 'fumadocs-core/source';
import { toFumadocsSource } from 'fumadocs-mdx/runtime/server';
import { createElement } from 'react';
import { icons } from 'lucide-react';

// See https://fumadocs.dev/docs/headless/source-api for more info
export const source = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
  icon: (icon) => {
    if (!icon) return;
    // lucide-react's `icons` map is what fumadocs expects for string -> icon resolution
    const Icon = icons[icon as keyof typeof icons];
    if (!Icon) return;
    return createElement(Icon);
  },
});

export const blog = loader({
  baseUrl: '/blog',
  source: toFumadocsSource(blogPosts, []),
});

export const models = loader({
  baseUrl: '/blog/models',
  source: toFumadocsSource(modelPages, []),
});

export const tasks = loader({
  baseUrl: '/blog/tasks',
  source: toFumadocsSource(taskPages, []),
});

export const compare = loader({
  baseUrl: '/blog/compare',
  source: toFumadocsSource(comparePages, []),
});

export const useCases = loader({
  baseUrl: '/blog/use-cases',
  source: toFumadocsSource(useCasePages, []),
});

export const compatibility = loader({
  baseUrl: '/blog/compatibility',
  source: toFumadocsSource(compatibilityPages, []),
});

export function getPageImage(page: InferPageType<typeof source>) {
  const segments = [...page.slugs, 'image.png'];

  return {
    segments,
    url: `/og/docs/${segments.join('/')}`,
  };
}

export async function getLLMText(page: InferPageType<typeof source>) {
  const processed = await page.data.getText('processed');

  return `# ${page.data.title}

${processed}`;
}
