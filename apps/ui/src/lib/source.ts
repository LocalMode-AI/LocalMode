import { docs } from 'collections/server';
import { type InferPageType, loader } from 'fumadocs-core/source';
import { createElement } from 'react';
import { icons } from 'lucide-react';
import { expandDocMarkdown } from '@/lib/llm-markdown';

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

/**
 * Render a docs page as markdown for LLM/agent surfaces, expanding the registry
 * MDX helper tags into real markdown (component source, props table, install
 * command). `expandSource` inlines the full component source (per-page "Copy
 * page" / "View as Markdown"); pass `false` to keep aggregate surfaces such as
 * `llms-full.txt` lean (a pointer to the registry JSON instead of full source).
 */
export async function getLLMText(
  page: InferPageType<typeof source>,
  opts: { expandSource?: boolean } = {},
) {
  const processed = await page.data.getText('processed');
  const expanded = await expandDocMarkdown(processed, {
    expandSource: opts.expandSource ?? true,
  });

  return `# ${page.data.title}

${expanded}`;
}
