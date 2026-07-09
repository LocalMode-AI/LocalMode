//
// @file absolutize-registry-deps.ts
// @description registry:build post-processing step. Rewrites every namespaced
// `registryDependencies` entry (`@localmode/ui/<item>`) in the emitted
// `public/r/**.json` payloads into an absolute registry URL
// (`<origin>/r/ui/<item>.json`).
//
// Why: namespaced refs resolve only through a consumer's `components.json`
// `registries` map. The shadcn CLI has that map; "Open in v0" does not —
// shadcn's own docs state Open in v0 "does not support cssVars, css, envVars,
// namespaced registries, or advanced authentication methods". Absolute URLs are
// understood by BOTH the CLI and v0, so one form serves both consumers.
//
// Composition: this runs LAST, after `build-aggregates`, because the generated
// aggregates (`ui/all`, `ui/<family>`) and the deprecated block-alias composites
// emit namespaced member refs of their own. Running last covers every payload in
// one pass and makes the step idempotent.
//
// Origin: resolved from the environment, mirroring `src/lib/registry.ts`, so
// preview deploys and the consumer-test lanes (which serve `public/r` from
// localhost) can point the dependency URLs at themselves rather than production.
//
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** The shadcn namespace token consumers configure in `components.json`. */
const NAMESPACE_PREFIX = '@localmode/';

/** Fallback origin when no environment override is present. */
const DEFAULT_ORIGIN = 'https://localmode.ai';

interface RegistryItem {
  name?: string;
  registryDependencies?: string[];
  [key: string]: unknown;
}

/**
 * Resolve the public origin the registry is served from.
 * Mirrors `REGISTRY_ORIGIN` in `src/lib/registry.ts`; trailing slashes trimmed
 * so the emitted URLs never contain a double slash.
 */
export function resolveRegistryOrigin(
  env: Record<string, string | undefined> = process.env,
): string {
  const origin =
    env.NEXT_PUBLIC_REGISTRY_ORIGIN ?? env.NEXT_PUBLIC_SITE_URL ?? DEFAULT_ORIGIN;
  return origin.replace(/\/+$/, '');
}

/**
 * Convert a single `registryDependencies` entry to its v0-compatible form.
 *
 * - `@localmode/ui/lib/utils` → `<origin>/r/ui/lib/utils.json`
 * - `button` (bare shadcn item) → unchanged
 * - `https://…/r/x.json` (already absolute) → unchanged
 * - anything else (local path, GitHub ref) → unchanged
 */
export function absolutizeDependency(dep: string, origin: string): string {
  if (!dep.startsWith(NAMESPACE_PREFIX)) return dep;
  const itemName = dep.slice(NAMESPACE_PREFIX.length);
  return `${origin}/r/${itemName}.json`;
}

/** Map {@link absolutizeDependency} over an item's dependency list. */
export function absolutizeDependencies(
  deps: string[] | undefined,
  origin: string,
): string[] | undefined {
  if (!Array.isArray(deps)) return deps;
  return deps.map((dep) => absolutizeDependency(dep, origin));
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
  const registryDir = path.join(process.cwd(), 'public', 'r');
  const origin = resolveRegistryOrigin();

  let rewrittenItems = 0;
  let rewrittenDeps = 0;

  for (const file of listJson(registryDir)) {
    const raw = readFileSync(file, 'utf8');
    const item = JSON.parse(raw) as RegistryItem;
    const before = item.registryDependencies;
    if (!Array.isArray(before)) continue;

    const after = absolutizeDependencies(before, origin)!;
    const changed = after.some((dep, i) => dep !== before[i]);
    if (!changed) continue;

    rewrittenDeps += after.filter((dep, i) => dep !== before[i]).length;
    rewrittenItems++;
    item.registryDependencies = after;
    writeFileSync(file, JSON.stringify(item, null, 2), 'utf8');
  }

  console.log(
    `absolutize-registry-deps: rewrote ${rewrittenDeps} dependencies across ${rewrittenItems} items → ${origin}/r/…`,
  );
}

// Only run the CLI when executed directly, so the pure helpers stay importable.
if (process.argv[1] && path.resolve(process.argv[1]).endsWith('absolutize-registry-deps.ts')) {
  main();
}
