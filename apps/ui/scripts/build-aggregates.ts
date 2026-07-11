/**
 * @file build-aggregates.ts
 * @description Generates the bulk / per-family aggregate registry items from the
 * catalog AFTER `shadcn build`, so there is no manually-maintained drift.
 *
 * For every catalog item named `ui/<family>/...` (or `ui/<family>`), we group by
 * `<family>` and emit:
 *   - `public/r/ui/all.json`            → installs every public component
 *   - `public/r/ui/<family>.json`       → installs that family's components
 *
 * Each aggregate is a `registry:block` whose `registryDependencies` point at the
 * member items via the `@localmode/ui/<name>` namespace, so `npx shadcn add
 * @localmode/ui/all` (or `@localmode/ui/<family>`) pulls them all in one command.
 *
 * Internal items (categories includes "internal", e.g. `ui/lib/utils`) are
 * excluded from `all`/family rollups — they come in transitively as deps.
 *
 * Blocks (`ui/blocks/*`) are ALSO excluded from `all`/family rollups (see
 * `isBlock()`), by design — they are opt-in composed wiring items, never part
 * of an aggregate regardless of the extra `categories: ["blocks", "<category>"]`
 * tag added by the category-scheme change (the exclusion keys on the `name`
 * prefix, not the category tag).
 *
 * This module is importable without side effects: `main()` only runs when the
 * file is executed directly (the `registry:build` pipeline), so the pure helpers
 * (`isBlock`, `isInternal`) can be unit-witnessed.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export interface RegistryFile {
  path: string;
  type: string;
  target?: string;
}

export interface RegistryItem {
  name: string;
  type: string;
  title?: string;
  description?: string;
  dependencies?: string[];
  registryDependencies?: string[];
  files?: RegistryFile[];
  categories?: string[];
  [key: string]: unknown;
}

interface Registry {
  name: string;
  homepage?: string;
  items: RegistryItem[];
}

const APP_ROOT = process.cwd();
const REGISTRY_PATH = path.join(APP_ROOT, 'registry.json');
const OUT_DIR = path.join(APP_ROOT, 'public', 'r', 'ui');

const NAMESPACE = '@localmode';

export function isInternal(item: RegistryItem) {
  return (item.categories ?? []).includes('internal');
}

/** Blocks (`ui/blocks/*`) are composed wiring-layer items, not primitives —
 * they are excluded from `ui/all` and family aggregates by design. The check
 * keys on the item NAME prefix, so it holds regardless of the block's
 * `categories` tags (a Wave-0 block carries `["blocks", "<category>"]`). */
export function isBlock(item: RegistryItem) {
  return item.name.startsWith('ui/blocks/');
}

/** A component item is named `ui/<family>/<component>`. */
function familyOf(name: string): string | null {
  if (!name.startsWith('ui/')) return null;
  const rest = name.slice('ui/'.length); // e.g. "local-first/device-badge" or "conversation/message"
  const parts = rest.split('/');
  // `ui/<family>/<component>` → family is parts[0]. A bare single-segment
  // `ui/<component>` has no family grouping and rolls up only into `all`.
  return parts.length >= 2 ? parts[0] : null;
}

function writeAggregate(
  fileName: string,
  title: string,
  description: string,
  members: RegistryItem[],
) {
  const json = {
    $schema: 'https://ui.shadcn.com/schema/registry-item.json',
    name: path.basename(fileName, '.json'),
    type: 'registry:block',
    title,
    description,
    registryDependencies: members.map((m) => `${NAMESPACE}/${m.name}`),
  };
  const target = path.join(OUT_DIR, fileName);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(json, null, 2) + '\n', 'utf8');
  return target;
}

function main() {
  if (!existsSync(REGISTRY_PATH)) {
    console.error(`[build-aggregates] registry.json not found at ${REGISTRY_PATH}`);
    process.exit(1);
  }

  const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8')) as Registry;
  const publicItems = registry.items.filter((i) => !isInternal(i) && !isBlock(i) && i.name.startsWith('ui/'));

  if (publicItems.length === 0) {
    console.warn('[build-aggregates] no public ui/* items found; skipping aggregates.');
    return;
  }

  mkdirSync(OUT_DIR, { recursive: true });

  // all
  const allPath = writeAggregate(
    'all.json',
    'All LocalMode UI components',
    'Installs every public @localmode/ui component in one command.',
    publicItems,
  );
  console.log(`[build-aggregates] wrote ${path.relative(APP_ROOT, allPath)} (${publicItems.length} items)`);

  // per-family
  const byFamily = new Map<string, RegistryItem[]>();
  for (const item of publicItems) {
    const fam = familyOf(item.name);
    if (!fam) continue;
    const list = byFamily.get(fam) ?? [];
    list.push(item);
    byFamily.set(fam, list);
  }

  for (const [family, members] of byFamily) {
    const famPath = writeAggregate(
      `${family}.json`,
      `LocalMode UI — ${family}`,
      `Installs every component in the ${family} family.`,
      members,
    );
    console.log(`[build-aggregates] wrote ${path.relative(APP_ROOT, famPath)} (${members.length} items)`);
  }

  if (byFamily.size === 0) {
    console.log('[build-aggregates] no multi-segment families yet (only ui/all generated).');
  }
}

/** True when this module is the process entrypoint (the `registry:build`
 * pipeline runs `tsx scripts/build-aggregates.ts`), false when imported by a
 * test/harness — so importing the pure helpers never triggers a build. */
function isDirectRun(): boolean {
  const invoked = process.argv[1];
  if (!invoked) return false;
  try {
    return realpathSync(invoked) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  main();
}
