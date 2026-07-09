/**
 * @file block-markdown.test.ts
 * @description Tests for the block "Copy page" / "View as Markdown" builder over
 * the REAL gallery catalog + category map. `readSource` is the builder's own
 * injected parameter (the shell passes its mounted `source`; the route passes
 * `readBlockSource`), stubbed here so the assertions target the routing + markdown
 * shape; the route e2e proves the real source is inlined. Also pins the
 * client-vs-route parity: `blockPageMarkdown`/`categoryPageMarkdown` (Copy) and
 * `resolveBlockMarkdown` (View) produce identical output for the same source.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  blockPageMarkdown,
  categoryPageMarkdown,
  resolveBlockMarkdown,
} from '@/lib/block-markdown';
import { BLOCK_CARDS } from '@/app/blocks/blocks-catalog';

const stub = (name: string) => `SRC:${name}`;

// Drift guard: the "Copy page" / "View as Markdown" body uses each card's
// `pageDescription`, which must stay identical to the block page's own
// `<BlockShell description="…">`. This reads every block's page.tsx and asserts
// they match, so an edit to one that misses the other fails here (not in prod).
describe('block pageDescription ↔ page.tsx (no drift)', () => {
  for (const card of BLOCK_CARDS) {
    if (!card.pageDescription) continue;
    it(`${card.slug}: pageDescription equals its page's BlockShell description`, () => {
      const path = `src/app/blocks/${card.route.replace(/^\/blocks\//, '')}/page.tsx`;
      expect(existsSync(path), `${path} exists`).toBe(true);
      const match = readFileSync(path, 'utf8').match(/description="([^"]*)"/);
      expect(match?.[1]).toBe(card.pageDescription);
    });
  }
});

describe('resolveBlockMarkdown routing', () => {
  it('flat single-block category (chat) → the block page', () => {
    const md = resolveBlockMarkdown(['chat'], stub);
    expect(md).toContain('# Chat');
    // The full page description (pageDescription), not the short card teaser.
    expect(md).toContain('switch on agent mode to let it use tools');
    expect(md).toContain('npx shadcn@latest add @localmode/ui/blocks/chat');
    expect(md).toContain('/r/ui/blocks/chat.json');
    expect(md).toContain('```tsx\nSRC:chat\n```');
  });

  it('multi-block category (knowledge) → every member under its own ## heading', () => {
    const md = resolveBlockMarkdown(['knowledge'], stub) ?? '';
    expect(md).toContain('# Knowledge');
    for (const h of ['## Semantic Search', '## Document QA', '## RAG Chat', '## Vector Data Manager']) {
      expect(md).toContain(h);
    }
    // Deep item names in the install commands.
    expect(md).toContain('npx shadcn@latest add @localmode/ui/blocks/knowledge/semantic-search');
    // One source fence per member block, from the injected reader (deep name).
    expect(md).toContain('```tsx\nSRC:knowledge/semantic-search\n```');
    expect((md.match(/```tsx/g) ?? []).length).toBe(4);
  });

  it('deep single block → that block page', () => {
    const md = resolveBlockMarkdown(['knowledge', 'semantic-search'], stub) ?? '';
    expect(md).toContain('# Semantic Search');
    // The full page description (pageDescription), not the short card teaser.
    expect(md).toContain('Build a searchable knowledge base right in your browser');
    expect(md).toContain('@localmode/ui/blocks/knowledge/semantic-search');
    expect(md).toContain('```tsx\nSRC:knowledge/semantic-search\n```');
  });

  it('returns null for chrome, unknown, and malformed slugs', () => {
    expect(resolveBlockMarkdown(['devtools-drawer'], stub)).toBeNull(); // layout chrome, no page
    expect(resolveBlockMarkdown(['nope'], stub)).toBeNull();
    expect(resolveBlockMarkdown(['knowledge', 'nope'], stub)).toBeNull();
    expect(resolveBlockMarkdown([], stub)).toBeNull();
    expect(resolveBlockMarkdown(['a', 'b', 'c'], stub)).toBeNull();
  });
});

describe('Copy (client) === View (route) parity', () => {
  it('single block: shell builder matches the route resolver byte-for-byte', () => {
    const copy = blockPageMarkdown('chat', 'THE-SOURCE');
    const view = resolveBlockMarkdown(['chat'], () => 'THE-SOURCE');
    expect(copy).toBe(view);
  });

  it('category: shell builder matches the route resolver byte-for-byte', () => {
    // The shell passes the mounted sources keyed by slug; the route reads them by
    // item name. Same content ⇒ identical markdown.
    const sourceBySlug: Record<string, string> = {
      'semantic-search': 'A',
      'document-qa': 'B',
      'rag-chat': 'C',
      'vector-data-manager': 'D',
    };
    const copy = categoryPageMarkdown('knowledge', sourceBySlug);
    const view = resolveBlockMarkdown(['knowledge'], (name) => sourceBySlug[name.split('/').pop() as string]);
    expect(copy).toBe(view);
  });
});
