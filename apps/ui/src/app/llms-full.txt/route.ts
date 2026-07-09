import { BLOCK_CARDS } from '@/app/blocks/blocks-catalog';
import { blockItemName, canonicalRoute, routeServedCategories } from '@/app/blocks/category-map';
import { getLLMText, source } from '@/lib/source';

export const revalidate = false;

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://localmode.ai';

// Keep the manifest em-dash-free: block descriptions are reused verbatim from the
// gallery catalog, so normalize any em/en dash to a plain hyphen at emit time.
const plain = (text: string) => text.replace(/[—–]/g, '-');

// Description lookup keyed by block slug (grid-card copy is the shared source).
const descBySlug = new Map(BLOCK_CARDS.map((card) => [card.slug, card.description]));

// Fuller Blocks reference derived from the shared category map + gallery catalog so
// it stays in sync with the live `/blocks` gallery (title + description + canonical
// URL + install command per block, grouped by category).
function blocksText(): string {
  const sections = routeServedCategories()
    .map((category) => {
      const blocks = category.blocks
        .map((block) => {
          const description = descBySlug.get(block.slug);
          const install = `npx shadcn@latest add @localmode/ui/blocks/${blockItemName(block.slug)}`;
          return `### ${block.title}

${description ? `${plain(description)}\n\n` : ''}- URL: ${baseUrl}${canonicalRoute(block.slug)}
- Install: ${install}`;
        })
        .join('\n\n');
      return `## ${category.title}\n\n${blocks}`;
    })
    .join('\n\n');

  return `# Blocks

LocalMode UI blocks are composed, installable experiences that wire the copy-owned primitives to real on-device models. Each block runs entirely in the browser, is served live at the /blocks gallery, and installs with the shadcn CLI.

${sections}`;
}

export async function GET() {
  // Aggregate manifest: expand props tables + install commands, but keep it lean
  // by pointing at each component's registry JSON instead of inlining full source
  // (the per-page /api/md route inlines the source for single-page "Copy page").
  const scan = source.getPages().map((page) => getLLMText(page, { expandSource: false }));
  const scanned = await Promise.all(scan);

  return new Response([...scanned, blocksText()].join('\n\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
