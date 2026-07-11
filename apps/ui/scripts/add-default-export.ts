//
// @file add-default-export.ts
// @description registry:build post-processing step. After `shadcn build` emits
// the per-item registry JSON, this appends `export default <PrimaryComponent>`
// to the PRIMARY file's `content` in every `registry:component` /
// `registry:ui` payload under `public/r/ui/**` — leaving the source files in
// `registry/localmode/**` named-export-only.
//
// Why: "Open in v0" fetches the item JSON, writes the files, and auto-generates
// a preview `Page` that DEFAULT-imports the item's primary component. LocalMode
// primitives are named-export-only (the tree-shaking convention), so v0's
// default import resolves to `undefined` and the preview crashes with
// "Element type is invalid: … got: undefined". A default export in the SHIPPED
// payload makes the v0 preview render, without touching the named-only source
// (the shadcn CLI installs files by content, so it copies the payload verbatim).
//
// Primary component: PascalCase of the primary file's basename (the file whose
// basename equals the item's last name segment) — `device-badge.tsx` →
// `DeviceBadge`. Matched against the file's real named exports (exact, then a
// UNIQUE case-insensitive match for casing like `ChromeAIDownloadGate`). A few
// multi-component files have no basename-matching export; those are pinned in
// PRIMARY_EXPORT_OVERRIDES to the demo's showcase component. If none resolves,
// the item is skipped with a warning — we never emit a default that points at a
// non-existent binding.
//
// Composition: runs right after `shadcn build`. Later steps preserve it —
// `strip-registry-blocks` only touches `ui/blocks/*`, `build-aggregates` only
// WRITES aggregate files, and `absolutize-registry-deps` round-trips the whole
// JSON (rewriting only `registryDependencies`), so the appended content
// survives. Idempotent: skips any file that already has a default export.
//
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** Item types whose primary component v0 default-imports into its preview. */
const COMPONENT_TYPES = new Set(['registry:component', 'registry:ui']);

/** Code files whose basename can name a React component. */
const CODE_EXT = /\.(tsx?|jsx?|mts|cts)$/;

/**
 * A handful of primitives are single files exporting SEVERAL components with no
 * export matching the filename. Pin each to the component its demo showcases —
 * the one v0 should render as the preview.
 */
export const PRIMARY_EXPORT_OVERRIDES: Record<string, string> = {
  // pipeline-tracker.tsx exports MultiStep/Stage/StepsPlan/InferenceQueueSurface;
  // the demo leads with — and the item is named for — MultiStepPipelineTracker.
  'ui/conversation/pipeline-tracker': 'MultiStepPipelineTracker',
};

interface RegistryFile {
  path: string;
  content?: string;
  type: string;
  target?: string;
}
interface RegistryItem {
  name?: string;
  type?: string;
  files?: RegistryFile[];
  [key: string]: unknown;
}

/** `device-badge` → `DeviceBadge`, `chrome-ai-download-gate` → `ChromeAiDownloadGate`. */
export function pascalCase(basename: string): string {
  const base = basename.replace(CODE_EXT, '');
  return base
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/** True when `filePath`'s basename (sans extension) equals the item's last name segment. */
export function isPrimaryFile(itemName: string, filePath: string): boolean {
  if (!CODE_EXT.test(filePath)) return false;
  const lastSegment = itemName.split('/').pop() ?? '';
  const base = path.basename(filePath).replace(CODE_EXT, '');
  return base === lastSegment;
}

/** Collect the value-level named exports declared in a component file. */
export function namedExports(content: string): Set<string> {
  const names = new Set<string>();
  // export [async] function|const|let|var|class Name
  for (const m of content.matchAll(
    /export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z0-9_$]+)/g,
  )) {
    names.add(m[1]);
  }
  // export { A, B as C } — the exported (local-or-aliased) name is what matters
  for (const block of content.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of block[1].split(',')) {
      const token = part.trim();
      if (!token) continue;
      const exported = token.split(/\s+as\s+/).pop()!.trim();
      if (/^[A-Za-z0-9_$]+$/.test(exported)) names.add(exported);
    }
  }
  return names;
}

/** True when the file already declares a default export. */
export function hasDefaultExport(content: string): boolean {
  return /(^|\n)\s*export\s+default\b/.test(content);
}

/**
 * Resolve the named export to re-export as `default` for one item's primary file.
 * Order: explicit override → exact PascalCase(basename) → UNIQUE case-insensitive
 * PascalCase match. Returns null when nothing resolves (caller warns + skips).
 */
export function resolvePrimaryExport(
  itemName: string,
  fileBasename: string,
  exports: Set<string>,
): string | null {
  const override = PRIMARY_EXPORT_OVERRIDES[itemName];
  if (override) return exports.has(override) ? override : null;

  const want = pascalCase(fileBasename);
  if (exports.has(want)) return want;

  const lower = want.toLowerCase();
  const ci = [...exports].filter((e) => e.toLowerCase() === lower);
  return ci.length === 1 ? ci[0] : null;
}

/** Append `export default <name>;` to `content` (single blank-line separator). */
export function appendDefaultExport(content: string, name: string): string {
  return `${content.replace(/\s*$/, '')}\n\nexport default ${name};\n`;
}

/** Recursively list every `.json` file under `dir`. */
function listJson(dir: string): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listJson(full));
    else if (entry.name.endsWith('.json')) out.push(full);
  }
  return out;
}

function main(): void {
  const uiDir = path.join(process.cwd(), 'public', 'r', 'ui');

  let itemsTouched = 0;
  const unresolved: string[] = [];

  for (const file of listJson(uiDir)) {
    const item = JSON.parse(readFileSync(file, 'utf8')) as RegistryItem;
    if (!item.name || !COMPONENT_TYPES.has(item.type ?? '')) continue;
    if (!Array.isArray(item.files) || item.files.length === 0) continue;

    const primary = item.files.find(
      (f) => typeof f.content === 'string' && isPrimaryFile(item.name!, f.path),
    );
    if (!primary || typeof primary.content !== 'string') continue;
    if (hasDefaultExport(primary.content)) continue;

    const exportName = resolvePrimaryExport(
      item.name,
      path.basename(primary.path),
      namedExports(primary.content),
    );
    if (!exportName) {
      unresolved.push(item.name);
      continue;
    }

    primary.content = appendDefaultExport(primary.content, exportName);
    writeFileSync(file, JSON.stringify(item, null, 2) + '\n', 'utf8');
    itemsTouched++;
  }

  console.log(`add-default-export: added a default export to ${itemsTouched} component payload(s).`);
  if (unresolved.length > 0) {
    console.warn(
      `add-default-export: could not resolve a primary component for ${unresolved.length} item(s) — ` +
        `add an entry to PRIMARY_EXPORT_OVERRIDES:\n  ${unresolved.join('\n  ')}`,
    );
  }
}

// Only run the CLI when executed directly, so the pure helpers stay importable.
if (process.argv[1] && path.resolve(process.argv[1]).endsWith('add-default-export.ts')) {
  main();
}
