/**
 * @file route.ts
 * @description Per-block raw-markdown route. Serves any block or category page as
 * markdown at `/api/blocks-md/<slug>` (e.g. `/api/blocks-md/chat`,
 * `/api/blocks-md/knowledge`, `/api/blocks-md/knowledge/semantic-search`). Backs
 * each block page's "View as Markdown" action and lets agents fetch a block's
 * title, install command, and full source. Uses the same pure builder the block
 * shells use for "Copy page", so the two surfaces never drift.
 */
import { resolveBlockMarkdown } from '@/lib/block-markdown';
import { readBlockSource } from '@/lib/read-source';
import { routeServedCategories, isFlatCategory } from '@/app/blocks/category-map';
import { notFound } from 'next/navigation';

export const revalidate = false;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug?: string[] }> },
) {
  const { slug } = await params;
  const text = resolveBlockMarkdown(slug ?? [], readBlockSource);
  if (!text) notFound();

  return new Response(text, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
}

/** Every category page + every deep block page (mirrors the `/blocks/**` routes). */
export function generateStaticParams(): { slug: string[] }[] {
  const params: { slug: string[] }[] = [];
  for (const category of routeServedCategories()) {
    // The category page (`/blocks/<category>`) — also the block page itself for a
    // flat single-block category (chat).
    params.push({ slug: [category.category] });
    // Deep block pages (`/blocks/<category>/<slug>`) for non-flat categories.
    if (!isFlatCategory(category)) {
      for (const block of category.blocks) {
        params.push({ slug: [category.category, block.slug] });
      }
    }
  }
  return params;
}
