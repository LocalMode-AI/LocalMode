//
// @file strip-registry-blocks.ts
// @description registry:build post-processing step. After `shadcn build` emits
// the per-item registry JSON, this rewrites the `content` payload of every
// TS/TSX/JS/JSX file in each `public/r/ui/blocks/*.json` block item through the
// shared `stripSnippet` transform (removes data-testid + dev comments, trims the
// header). Only the SHIPPED registry payloads are touched — the live in-app
// component tree under `src/app/blocks/**` keeps its data-testids so the E2E
// specs keep driving the running app.
//
// Composition: this step runs after `shadcn build`, which emits the per-item
// JSON this rewrites, and before `build-aggregates`, which reads the emitted
// payloads.
//
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { stripSnippet } from './strip-block-snippets';

interface RegistryFile {
  path: string;
  content?: string;
  type: string;
  target?: string;
}
interface RegistryItem {
  name: string;
  files?: RegistryFile[];
  [key: string]: unknown;
}

const APP_ROOT = process.cwd();
const BLOCKS_DIR = path.join(APP_ROOT, 'public', 'r', 'ui', 'blocks');

const CODE_EXT = /\.(tsx?|jsx?|mts|cts)$/;

function listJson(dir: string): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return []; // no blocks emitted yet
  }
  const out: string[] = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listJson(full));
    else if (e.isFile() && e.name.endsWith('.json')) out.push(full);
  }
  return out;
}

function main() {
  const files = listJson(BLOCKS_DIR);
  if (files.length === 0) {
    console.warn('[strip-registry-blocks] no public/r/ui/blocks/*.json found; nothing to strip.');
    return;
  }

  let itemsTouched = 0;
  let filesTouched = 0;
  for (const jsonPath of files) {
    const item = JSON.parse(readFileSync(jsonPath, 'utf8')) as RegistryItem;
    if (!item.files?.length) continue;

    let changed = false;
    for (const f of item.files) {
      if (typeof f.content !== 'string') continue;
      if (!CODE_EXT.test(f.path)) continue;
      const next = stripSnippet(f.content);
      if (next !== f.content) {
        f.content = next;
        changed = true;
        filesTouched++;
      }
    }

    if (changed) {
      writeFileSync(jsonPath, JSON.stringify(item, null, 2) + '\n', 'utf8');
      itemsTouched++;
    }
  }

  console.log(
    `[strip-registry-blocks] stripped ${filesTouched} file payload(s) across ${itemsTouched} block item(s).`,
  );
}

main();
