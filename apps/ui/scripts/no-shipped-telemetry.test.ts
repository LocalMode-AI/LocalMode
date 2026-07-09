/**
 * @file no-shipped-telemetry.test.ts
 * @description Witnesses for the shipped-telemetry tripwire. Runs under
 * `pnpm --filter ui test:unit`.
 *
 * The load-bearing cases are the ones that prove the guard CAN fail:
 *   - every declared pattern is exercised by a violating fixture (a regex that
 *     never matches is a guard that never fires);
 *   - `shippedSourceFiles()` must return a non-empty list (a wiring bug that
 *     scans zero files would otherwise pass vacuously);
 *   - a registry.json declaring a missing file must throw, not silently skip.
 * Only then does the real scan over the live catalog mean anything.
 */
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, afterEach } from 'vitest';

import {
  TELEMETRY_PATTERNS,
  scanContent,
  scanFiles,
  shippedSourceFiles,
  shippedArtifactFiles,
} from './check-no-shipped-telemetry';

/** One violating line per pattern id. Adding a pattern without a fixture fails. */
const VIOLATING: Record<string, string> = {
  'vercel-analytics': `import { Analytics } from '@vercel/analytics/next';`,
  'vercel-speed-insights': `import { SpeedInsights } from '@vercel/speed-insights/next';`,
  'send-beacon': `navigator.sendBeacon('/collect', payload);`,
  gtag: `gtag('event', 'model_loaded');`,
  'data-layer': `window.dataLayer.push({ event: 'install' });`,
  'gtm-host': `<script src="https://www.googletagmanager.com/gtm.js" />`,
  'ga-host': `fetch('https://www.google-analytics.com/collect');`,
  posthog: `import posthog from 'posthog-js';`,
  mixpanel: `import mixpanel from 'mixpanel-browser';`,
  segment: `import { Analytics } from '@segment/analytics-next';`,
  amplitude: `import * as amp from '@amplitude/analytics-browser';`,
  plausible: `<script src="https://plausible.io/js/script.js" />`,
  umami: `<script src="https://umami.is/script.js" />`,
  fathom: `<script src="https://cdn.usefathom.com/script.js" />`,
};

const tempRoots: string[] = [];
afterEach(() => {
  for (const dir of tempRoots.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function makeTempRoot(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'lm-telemetry-guard-'));
  tempRoots.push(dir);
  return dir;
}

describe('TELEMETRY_PATTERNS', () => {
  it('has a violating fixture for every declared pattern', () => {
    const declared = TELEMETRY_PATTERNS.map((p) => p.id).sort();
    expect(Object.keys(VIOLATING).sort()).toEqual(declared);
  });

  it.each(TELEMETRY_PATTERNS.map((p) => p.id))('pattern %s actually fires on its fixture', (id) => {
    const violations = scanContent('fixture.tsx', VIOLATING[id]);
    expect(violations.map((v) => v.patternId)).toContain(id);
  });
});

describe('scanContent()', () => {
  it('reports zero violations for a clean component', () => {
    const clean = [
      `import { cn } from '@/lib/utils';`,
      `export function Badge({ label }: { label: string }) {`,
      `  return <span className={cn('badge')}>{label}</span>;`,
      `}`,
    ].join('\n');
    expect(scanContent('badge.tsx', clean)).toEqual([]);
  });

  it('does not flag the word "analytics" in prose or JSX copy', () => {
    // A real false positive this guard must not produce: a demo whose copy
    // mentions analytics, and a prop named `analytics`.
    const prose = [
      `const description = 'Run analytics entirely on-device, no cloud.';`,
      `<p>Privacy-first analytics without a server</p>`,
      `export interface Props { analytics?: boolean }`,
    ].join('\n');
    expect(scanContent('demo.tsx', prose)).toEqual([]);
  });

  it('records file, line and excerpt for a violation', () => {
    const src = `const a = 1;\nimport { Analytics } from '@vercel/analytics/next';\n`;
    const [v] = scanContent('blocks/chat/chat.tsx', src);
    expect(v.file).toBe('blocks/chat/chat.tsx');
    expect(v.line).toBe(2);
    expect(v.patternId).toBe('vercel-analytics');
    expect(v.excerpt).toContain('@vercel/analytics');
  });

  it('flags a violation in a built payload string too', () => {
    const payload = [{ file: 'r/ui/blocks/chat.json → chat.tsx', content: VIOLATING['vercel-analytics'] }];
    expect(scanFiles(payload)).toHaveLength(1);
  });
});

describe('shippedSourceFiles()', () => {
  it('throws when registry.json is absent', () => {
    expect(() => shippedSourceFiles(makeTempRoot())).toThrow(/registry\.json not found/);
  });

  it('throws when the catalog declares a file that does not exist (drift)', () => {
    const root = makeTempRoot();
    writeFileSync(
      path.join(root, 'registry.json'),
      JSON.stringify({ items: [{ name: 'ui/ghost', files: [{ path: 'registry/ghost.tsx' }] }] }),
    );
    expect(() => shippedSourceFiles(root)).toThrow(/does not exist/);
  });

  it('throws rather than passing vacuously when the catalog ships zero files', () => {
    const root = makeTempRoot();
    writeFileSync(path.join(root, 'registry.json'), JSON.stringify({ items: [] }));
    expect(() => shippedSourceFiles(root)).toThrow(/zero shipped files/);
  });

  it('reads a declared file from disk', () => {
    const root = makeTempRoot();
    mkdirSync(path.join(root, 'registry'), { recursive: true });
    writeFileSync(path.join(root, 'registry', 'ok.tsx'), 'export const ok = true;\n');
    writeFileSync(
      path.join(root, 'registry.json'),
      JSON.stringify({ items: [{ name: 'ui/ok', files: [{ path: 'registry/ok.tsx' }] }] }),
    );
    const files = shippedSourceFiles(root);
    expect(files).toHaveLength(1);
    expect(files[0].content).toContain('export const ok');
  });
});

describe('the real catalog', () => {
  const sources = shippedSourceFiles();

  it('declares a non-empty shipped surface (plumbing: the scan is not vacuous)', () => {
    expect(sources.length).toBeGreaterThan(100);
  });

  it('ships zero telemetry in any registry source', () => {
    expect(scanFiles(sources)).toEqual([]);
  });

  it('ships zero telemetry in any built payload (when public/r is present)', () => {
    const artifacts = shippedArtifactFiles();
    if (artifacts.length === 0) {
      // public/r is gitignored; a clean checkout has not run registry:build yet.
      // Documented gap rather than a silent pass — the source scan above still ran.
      console.warn('public/r/ absent — built-payload scan skipped. Run `pnpm registry:build`.');
      return;
    }
    expect(scanFiles(artifacts)).toEqual([]);
  });
});
