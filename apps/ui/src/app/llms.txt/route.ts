import { BLOCK_CARDS } from '@/app/blocks/blocks-catalog';
import { canonicalRoute, routeServedCategories } from '@/app/blocks/category-map';
import { source } from '@/lib/source';

export const revalidate = false;

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://localmode.ai';

// Keep the manifest em-dash-free: block descriptions are reused verbatim from the
// gallery catalog, so normalize any em/en dash to a plain hyphen at emit time.
const plain = (text: string) => text.replace(/[—–]/g, '-');

// Description lookup keyed by block slug (grid-card copy is the shared source).
const descBySlug = new Map(BLOCK_CARDS.map((card) => [card.slug, card.description]));

export function GET() {
  // Build the index dynamically from the real docs tree so the seed item — and
  // every future Family A/B component — appears here automatically (no drift).
  const lines = source.getPages().map((page) => {
    const title = page.data.title;
    const description = page.data.description ?? '';
    return `- [${title}](${baseUrl}${page.url})${description ? `: ${description}` : ''}`;
  });

  // Build the Blocks index from the shared category map + gallery catalog so it
  // stays in sync with the live `/blocks` gallery (no hand-maintained list).
  const blockSections = routeServedCategories()
    .map((category) => {
      const items = category.blocks
        .map((block) => {
          const description = descBySlug.get(block.slug);
          const suffix = description ? `: ${plain(description)}` : '';
          return `- [${block.title}](${baseUrl}${canonicalRoute(block.slug)})${suffix}`;
        })
        .join('\n');
      return `### ${category.title}\n\n${items}`;
    })
    .join('\n\n');

  const content = `# LocalMode UI

> LocalMode UI is a shadcn-style registry of copy-owned, composable AI UI components for the browser. Local-first and privacy-first: inference runs entirely in the browser, data never leaves the device. Components are installed with the shadcn CLI under the @localmode/ui namespace (npx shadcn@latest add @localmode/ui/<name>) and styled with shadcn/ui CSS variables so they inherit the consumer's theme.

## Docs

${lines.join('\n')}

## Blocks

> Composed, installable block experiences that wire the primitives to real on-device models. Each runs entirely in the browser and installs with the shadcn CLI (npx shadcn@latest add @localmode/ui/blocks/<name>).

${blockSections}

## Links

- [Full Documentation for AI](${baseUrl}/llms-full.txt): Complete component reference
- [Core LocalMode Docs](https://localmode.dev/docs): The @localmode engine and React hooks
- [GitHub](https://github.com/LocalMode-AI/LocalMode): Source code
`;

  return new Response(content.trim(), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
