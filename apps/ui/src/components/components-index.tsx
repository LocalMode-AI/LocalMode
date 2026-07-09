/**
 * @file components-index.tsx
 * @description Browse/index surface — reads `registry.json` at build time and
 * renders every public component as a visual preview card grouped by family,
 * with a family filter and per-family counts (see {@link ComponentsBrowser}).
 * Internal items (e.g. the shared cn() util) and block items (`ui/blocks/*`) are
 * excluded — components only. Server component; the interactive filter + lazy
 * previews run client-side.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ComponentsBrowser, type BrowserItem } from '@/components/components-browser';
import { COMPONENT_PREVIEW_HEIGHTS } from '@/lib/component-preview-heights';

interface RegistryItem {
  name: string;
  title?: string;
  description?: string;
  categories?: string[];
}

interface Registry {
  items: RegistryItem[];
}

/** Map a registry item name (`ui/conversation/message`) to its docs slug. */
function docsSlug(name: string) {
  // `ui/device-badge` → `/docs/device-badge`; `ui/conversation/message` → `/docs/conversation/message`
  return `/docs/${name.replace(/^ui\//, '')}`;
}

/** Family slug from the item name (the docs folder), or `general` for the seed. */
function familyOf(name: string) {
  const parts = name.replace(/^ui\//, '').split('/');
  return parts.length > 1 ? parts[0] : 'general';
}

function loadRegistry(): Registry {
  const file = path.join(process.cwd(), 'registry.json');
  return JSON.parse(readFileSync(file, 'utf8')) as Registry;
}

/** Render all public registry components as a filterable preview-card grid. */
export function ComponentsIndex() {
  const registry = loadRegistry();
  const items: BrowserItem[] = registry.items
    .filter(
      (i) =>
        i.name.startsWith('ui/') &&
        !i.name.startsWith('ui/blocks/') &&
        !(i.categories ?? []).includes('internal'),
    )
    .map((i) => ({
      name: i.name,
      title: i.title ?? i.name,
      description: i.description ?? '',
      family: familyOf(i.name),
      slug: docsSlug(i.name),
    }))
    // Order by preview height (tallest first) so two side-by-side cards have
    // similar-height previews; family filters stay height-sorted within a family.
    .sort(
      (a, b) =>
        (COMPONENT_PREVIEW_HEIGHTS[b.name] ?? 220) - (COMPONENT_PREVIEW_HEIGHTS[a.name] ?? 220) ||
        a.name.localeCompare(b.name),
    );

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No components published yet.</p>;
  }

  return <ComponentsBrowser items={items} />;
}
