/**
 * @file prep-registry-dirs.ts
 * @description Pre-creates the nested output directories `shadcn build` needs.
 *
 * `shadcn build` writes each item to `public/r/<name>.json` but does not
 * `mkdir -p` for nested item names (e.g. `ui/lib/utils` → `public/r/ui/lib/`).
 * On a clean checkout `public/r/` doesn't exist, so the build fails with ENOENT.
 * This step reads the catalog and ensures every item's parent directory exists
 * BEFORE `shadcn build` runs, keeping the build reproducible from scratch.
 */
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

interface RegistryItem {
  name: string;
}
interface Registry {
  items: RegistryItem[];
}

const APP_ROOT = process.cwd();
const R_DIR = path.join(APP_ROOT, 'public', 'r');

const registry = JSON.parse(
  readFileSync(path.join(APP_ROOT, 'registry.json'), 'utf8'),
) as Registry;

// Ensure the base output dir and each item's parent dir exist.
mkdirSync(R_DIR, { recursive: true });
for (const item of registry.items) {
  const dir = path.dirname(path.join(R_DIR, `${item.name}.json`));
  mkdirSync(dir, { recursive: true });
}

console.log(`[prep-registry-dirs] ensured output dirs for ${registry.items.length} item(s).`);
