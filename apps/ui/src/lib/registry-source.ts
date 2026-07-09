/**
 * @file registry-source.ts
 * @description Server-only reader for a registry item's demo source, shared by
 * the Code tab ({@link import('@/components/component-preview')}) and the
 * markdown pipeline (`getLLMText`). It reads the demo `.tsx` from disk and
 * rewrites its in-repo relative imports to the post-install `@/components/*` /
 * `@/lib/*` aliases a consumer actually uses, so the displayed snippet is
 * copy-paste accurate with no MDX duplication and no drift.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

/** Map `ui/conversation/message` → `registry/localmode/conversation/message/message-demo.tsx`. */
export function demoSourcePath(name: string): string {
  const rest = name.replace(/^ui\//, '');
  const parts = rest.split('/');
  const last = parts[parts.length - 1];
  return `registry/localmode/${rest}/${last}-demo.tsx`;
}

/**
 * Rewrite a demo's in-repo relative imports to the post-install aliases a
 * consumer actually uses. In this repo a demo sits next to its component
 * (`./sources`, `../prompt-input/prompt-input`); after `npx shadcn add`, every
 * installed item lands flat under `@/components/*` (and shared libs under
 * `@/lib/*`). This only transforms the DISPLAYED string — the demo files keep
 * their natural relative paths for in-repo compilation.
 */
export function rewriteImportsForDisplay(source: string): string {
  return source
    .replace(/from (['"])\.\.\/lib\/([^'"\n]+)\1/g, 'from $1@/lib/$2$1')
    .replace(/from (['"])\.\.\/[^/'"\n]+\/([^'"\n]+)\1/g, 'from $1@/components/$2$1')
    .replace(/from (['"])\.\/lib\/([^'"\n]+)\1/g, 'from $1@/lib/$2$1')
    .replace(/from (['"])\.\/([^'"\n]+)\1/g, 'from $1@/components/$2$1');
}

/** Read the demo source for `name` (import paths rewritten for copy-accuracy), or null. */
export function readDemoSource(name: string): string | null {
  try {
    const raw = readFileSync(path.join(process.cwd(), demoSourcePath(name)), 'utf8');
    return rewriteImportsForDisplay(raw);
  } catch {
    return null;
  }
}
