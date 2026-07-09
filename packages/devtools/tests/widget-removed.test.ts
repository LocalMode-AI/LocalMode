// @vitest-environment node
/**
 * @file widget-removed.test.ts
 * @description Inverse witness for design D6 (blocks-deprecate-showcase): the
 * `DevToolsWidget` UI and its `@localmode/devtools/widget` subpath were removed
 * in v3.0.0. These assertions FAIL if the widget is reintroduced — proving the
 * public surface actually shrank rather than the widget merely being hidden.
 * The data layer (bridge/collectors) and the `./react` hooks are unchanged and
 * are covered by their own green suites.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { exports: Record<string, unknown> };

describe('devtools widget removal (design D6)', () => {
  it('no longer publishes the ./widget subpath export', () => {
    expect(pkg.exports['./widget']).toBeUndefined();
    // The two surviving public entries stay intact.
    expect(pkg.exports['.']).toBeDefined();
    expect(pkg.exports['./react']).toBeDefined();
  });

  it('the widget source module no longer resolves', async () => {
    // Computed specifier so Vite/Vitest does not try to pre-resolve a literal
    // path at transform time — the failure must happen at runtime resolution.
    const spec = '../src/widget/' + 'index.js';
    await expect(import(/* @vite-ignore */ spec)).rejects.toThrow();
  });
});
