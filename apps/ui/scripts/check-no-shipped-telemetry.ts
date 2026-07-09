/**
 * @file check-no-shipped-telemetry.ts
 * @description Build tripwire: fails if any analytics/telemetry call reaches code
 * that ships to consumers.
 *
 * WHY THIS EXISTS
 *   Registry primitives and block sources are COPIED into consumers' repos by the
 *   shadcn CLI and execute in their end users' browsers. An analytics import in
 *   one of those files would inject telemetry into every consuming app — breaking
 *   the no-telemetry promise, the primitives' portability invariant, and making
 *   downstream apps ship tracking their authors never opted into.
 *
 *   Nothing else catches this. Types don't: an analytics import type-checks fine.
 *   `stripSnippet` doesn't: it removes data-testid and comments, not imports or
 *   call expressions. Site analytics belongs ONLY in chrome that never ships —
 *   `src/app/layout.tsx`, `src/components/block-shell.tsx`, `src/app/blocks/page.tsx`.
 *
 * WHAT IT SCANS
 *   1. Sources — every `files[].path` declared in `registry.json`. Derived from the
 *      catalog rather than hardcoded directories, so new items are covered the day
 *      they are added, and non-shipped files (demos, page.tsx) are never scanned.
 *   2. The Code-tab snapshots in `src/lib/block-source.generated.ts`.
 *   3. The built payloads in `public/r/ ** /*.json` — the literal installed bytes.
 *
 * KNOWN LIMITS (documented, not silent)
 *   Literal pattern matching. A bespoke `fetch()` to a tracking endpoint under a
 *   novel hostname would pass. A blanket `fetch(` ban is not viable because blocks
 *   legitimately fetch models and the HuggingFace API. The patterns below cover
 *   every vendor SDK and beacon API a contributor would plausibly reach for.
 *
 * Run:  cd apps/ui && npx tsx scripts/check-no-shipped-telemetry.ts
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ROOT = fileURLToPath(new URL('..', import.meta.url));

export interface TelemetryPattern {
  id: string;
  pattern: RegExp;
  why: string;
}

/**
 * Matched against shipped file contents. Deliberately specific: bare words like
 * "analytics" appear in legitimate prose and demo copy, so every pattern here
 * targets an import specifier, a global API, or a vendor host.
 */
export const TELEMETRY_PATTERNS: TelemetryPattern[] = [
  { id: 'vercel-analytics', pattern: /@vercel\/analytics/, why: 'Vercel Web Analytics belongs in site chrome only' },
  { id: 'vercel-speed-insights', pattern: /@vercel\/speed-insights/, why: 'Speed Insights belongs in site chrome only' },
  { id: 'send-beacon', pattern: /navigator\s*\.\s*sendBeacon/, why: 'beacon API exfiltrates data from consumer apps' },
  { id: 'gtag', pattern: /\bgtag\s*\(/, why: 'Google Analytics global' },
  { id: 'data-layer', pattern: /\bdataLayer\s*\.\s*push|window\s*\.\s*dataLayer/, why: 'Google Tag Manager global' },
  { id: 'gtm-host', pattern: /googletagmanager\.com/, why: 'Google Tag Manager host' },
  { id: 'ga-host', pattern: /google-analytics\.com/, why: 'Google Analytics host' },
  { id: 'posthog', pattern: /posthog-js|posthog\.com/, why: 'PostHog SDK/host' },
  { id: 'mixpanel', pattern: /mixpanel-browser|mixpanel\.com/, why: 'Mixpanel SDK/host' },
  { id: 'segment', pattern: /@segment\/analytics|segment\.(io|com)/, why: 'Segment SDK/host' },
  { id: 'amplitude', pattern: /@amplitude\/|amplitude\.com/, why: 'Amplitude SDK/host' },
  { id: 'plausible', pattern: /plausible\.io/, why: 'Plausible host' },
  { id: 'umami', pattern: /umami\.is/, why: 'Umami host' },
  { id: 'fathom', pattern: /usefathom\.com/, why: 'Fathom host' },
];

export interface Violation {
  file: string;
  line: number;
  patternId: string;
  why: string;
  excerpt: string;
}

export interface ScannedFile {
  /** Display path, e.g. `registry/localmode/...` or `public/r/ui/blocks/chat.json → chat.tsx`. */
  file: string;
  content: string;
}

/** Scan one file's content against every pattern. Pure — the unit test's target. */
export function scanContent(file: string, content: string): Violation[] {
  const violations: Violation[] = [];
  const lines = content.split('\n');

  for (const { id, pattern, why } of TELEMETRY_PATTERNS) {
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i])) {
        violations.push({ file, line: i + 1, patternId: id, why, excerpt: lines[i].trim().slice(0, 120) });
      }
    }
  }
  return violations;
}

/** Scan many files. */
export function scanFiles(files: ScannedFile[]): Violation[] {
  return files.flatMap(({ file, content }) => scanContent(file, content));
}

/**
 * The authoritative shipped-source list: every `files[].path` in `registry.json`.
 * Throws if the catalog or a declared file is missing — that is real drift, and a
 * guard that cannot find its inputs must fail loudly rather than pass vacuously.
 */
export function shippedSourceFiles(appRoot: string = APP_ROOT): ScannedFile[] {
  const catalogPath = path.join(appRoot, 'registry.json');
  if (!existsSync(catalogPath)) {
    throw new Error(`registry.json not found at ${catalogPath}`);
  }

  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8')) as {
    items: { name: string; files?: { path: string }[] }[];
  };

  const files: ScannedFile[] = [];
  for (const item of catalog.items) {
    for (const f of item.files ?? []) {
      const abs = path.join(appRoot, f.path);
      if (!existsSync(abs)) {
        throw new Error(`registry.json declares "${f.path}" (item ${item.name}) but it does not exist`);
      }
      files.push({ file: f.path, content: readFileSync(abs, 'utf8') });
    }
  }

  if (files.length === 0) {
    throw new Error('registry.json declared zero shipped files — the guard would pass vacuously');
  }

  const generated = path.join(appRoot, 'src/lib/block-source.generated.ts');
  if (existsSync(generated)) {
    files.push({ file: 'src/lib/block-source.generated.ts', content: readFileSync(generated, 'utf8') });
  }

  return files;
}

function walkJson(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const abs = path.join(dir, entry);
    if (statSync(abs).isDirectory()) return walkJson(abs);
    return abs.endsWith('.json') ? [abs] : [];
  });
}

/**
 * The built registry payloads — the literal bytes a consumer installs. Returns an
 * empty list when `public/r` has not been generated yet (it is gitignored); the
 * caller decides whether that is acceptable.
 */
export function shippedArtifactFiles(appRoot: string = APP_ROOT): ScannedFile[] {
  const rDir = path.join(appRoot, 'public', 'r');
  if (!existsSync(rDir)) return [];

  return walkJson(rDir).flatMap((abs) => {
    const item = JSON.parse(readFileSync(abs, 'utf8')) as {
      files?: { path: string; content?: string }[];
    };
    const rel = path.relative(appRoot, abs);
    return (item.files ?? [])
      .filter((f) => typeof f.content === 'string')
      .map((f) => ({ file: `${rel} → ${f.path}`, content: f.content as string }));
  });
}

function main(): void {
  const sources = shippedSourceFiles();
  const artifacts = shippedArtifactFiles();

  const violations = [...scanFiles(sources), ...scanFiles(artifacts)];

  console.log(`Scanned ${sources.length} shipped sources + ${artifacts.length} built payloads.`);
  if (artifacts.length === 0) {
    console.log('NOTE: public/r/ is absent — built payloads were NOT checked. Run `pnpm registry:build` first.');
  }

  if (violations.length > 0) {
    console.error(`\n✗ ${violations.length} telemetry violation(s) in code that ships to consumers:\n`);
    for (const v of violations) {
      console.error(`  ${v.file}:${v.line}  [${v.patternId}] ${v.why}`);
      console.error(`    ${v.excerpt}\n`);
    }
    console.error('Analytics may live ONLY in site chrome that never ships (e.g. src/app/layout.tsx).');
    process.exit(1);
  }

  console.log('✓ No telemetry in any shipped registry source or payload.');
}

// Only run when invoked directly, so the unit test can import the pure helpers.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
