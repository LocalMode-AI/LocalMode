/**
 * @file block-markdown.ts
 * @description Pure markdown builder for block pages — backs the "Copy page" /
 * "View as Markdown" actions (analogous to the docs `getLLMText` pipeline, but
 * blocks are app routes, not MDX docs). One source of truth for both surfaces:
 * the client shell builds the Copy string from the SAME functions the
 * `/api/blocks-md` route uses, so Copy and View can never drift. Block metadata
 * (title/description) comes from the shared gallery catalog; the source snapshot
 * is injected by the caller (the shell passes its already-loaded `source` prop;
 * the route reads it via `readBlockSource`). No filesystem access here, so this
 * is safe to import into a client component.
 */
import { BLOCK_CARDS, BLOCK_CATEGORIES } from '@/app/blocks/blocks-catalog';
import { getCategory, isFlatCategory, itemNameFor } from '@/app/blocks/category-map';
import { installCommand, registryItemUrl } from '@/lib/registry';

/** The registry item name for a block, e.g. `chat` → `ui/blocks/chat`. */
function itemName(name: string): string {
  return `ui/blocks/${name}`;
}

/** Final path segment of a block item name (`knowledge/semantic-search` → `semantic-search`). */
function lastSegment(name: string): string {
  const parts = name.split('/');
  return parts[parts.length - 1];
}

/** Look up a gallery card by its block slug. */
function cardBySlug(slug: string) {
  return BLOCK_CARDS.find((c) => c.slug === slug);
}

/** One block's body: description, install command, registry pointer, full source. */
function blockBody({
  description,
  name,
  source,
}: {
  description: string;
  name: string;
  source: string | null;
}): string {
  const item = itemName(name);
  const parts = [
    description,
    '',
    '**Install**',
    '',
    '```bash',
    installCommand(item),
    '```',
    '',
    `**Full block (all files):** ${registryItemUrl(item)}`,
  ];
  if (source) parts.push('', '```tsx', source.trim(), '```');
  return parts.join('\n');
}

/**
 * Markdown for a single block page (`/blocks/chat`, `/blocks/knowledge/rag-chat`).
 * `source` is the block's main-file snapshot (same as the Code tab), or null.
 */
export function blockPageMarkdown(name: string, source: string | null): string {
  const card = cardBySlug(lastSegment(name));
  const title = card?.title ?? lastSegment(name);
  const description = card?.pageDescription ?? card?.description ?? '';
  return `# ${title}\n\n${blockBody({ description, name, source })}\n`;
}

/**
 * Markdown for a category page (`/blocks/knowledge`) — every member block under
 * its own `##` heading. `sourceBySlug` maps each member block slug to its source
 * snapshot (the client passes the mounted `source` props; the route reads them).
 */
export function categoryPageMarkdown(
  categoryId: string,
  sourceBySlug: Record<string, string | null>,
): string | null {
  const category = getCategory(categoryId);
  if (!category || category.chrome) return null;

  const header = category.blocks.length === 1
    ? `The ${category.title} block, ready to install and run entirely in the browser.`
    : `${category.blocks.length} on-device blocks in the ${category.title} category — each installs and runs on its own, entirely in the browser.`;

  const sections = category.blocks.map((block) => {
    const card = cardBySlug(block.slug);
    const name = itemNameFor(category, block.slug);
    return `## ${block.title}\n\n${blockBody({
      description: card?.pageDescription ?? card?.description ?? '',
      name,
      source: sourceBySlug[block.slug] ?? null,
    })}`;
  });

  return `# ${category.title}\n\n${header}\n\n${sections.join('\n\n')}\n`;
}

/**
 * Resolve the markdown for any `/blocks/…` slug (used by the route). Returns null
 * for an unknown slug or a slug that resolves to no block. `readSource(name)`
 * yields a block's source snapshot for the registry item name after `ui/blocks/`.
 */
export function resolveBlockMarkdown(
  slug: string[],
  readSource: (name: string) => string | null,
): string | null {
  if (slug.length === 1) {
    const category = getCategory(slug[0]);
    // Chrome (e.g. devtools-drawer) has no page/route — never markdown.
    if (!category || category.chrome) return null;
    // A flat single-block category (chat) → the block page itself.
    if (isFlatCategory(category)) {
      return blockPageMarkdown(slug[0], readSource(slug[0]));
    }
    // A multi-block (or deep single-block) category → the category page.
    const sourceBySlug: Record<string, string | null> = {};
    for (const block of category.blocks) {
      sourceBySlug[block.slug] = readSource(itemNameFor(category, block.slug));
    }
    return categoryPageMarkdown(slug[0], sourceBySlug);
  }

  if (slug.length === 2) {
    const category = getCategory(slug[0]);
    if (!category || !category.blocks.some((b) => b.slug === slug[1])) return null;
    const name = itemNameFor(category, slug[1]);
    return blockPageMarkdown(name, readSource(name));
  }

  return null;
}
