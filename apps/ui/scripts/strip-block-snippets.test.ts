import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { stripSnippet } from './strip-block-snippets';

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.dirname(SCRIPTS_DIR);
const FIXTURES = path.join(SCRIPTS_DIR, '__fixtures__');

const source = readFileSync(path.join(FIXTURES, 'sample-block.source.tsx'), 'utf8');
const expected = readFileSync(path.join(FIXTURES, 'sample-block.expected.tsx'), 'utf8');
const stripped = stripSnippet(source);

/** Content lines of the leading banner (between `/**` and the first close). */
function bannerLines(code: string): string[] {
  const open = code.indexOf('/**');
  const close = code.indexOf('*/', open);
  expect(open).toBeGreaterThanOrEqual(0);
  expect(close).toBeGreaterThan(open);
  return code
    .slice(open, close)
    .split('\n')
    .map((l) => l.replace(/^\s*\*?\s?/, '').trimEnd())
    .filter((l) => l.length > 0 && l !== '/**');
}

describe('stripSnippet — golden', () => {
  it('produces byte-exact expected output', () => {
    expect(stripped).toBe(expected);
  });
});

describe('stripSnippet — acceptance criteria', () => {
  it('removes every data-testid (attributes AND object-spread keys)', () => {
    expect(source).toContain('data-testid'); // fixture really has them
    expect(stripped.includes('data-testid')).toBe(false);
    // the testid VALUES only ever lived in a testid attr/key or the banner
    for (const id of ['sample-status', 'sample-run', 'sample-answer', 'sample-confidence']) {
      expect(stripped).not.toContain(id);
    }
  });

  it('removes all QA/E2E dev comments', () => {
    for (const marker of [
      'Driver contract',
      'E2E:',
      'QA note',
      'QA:',
      'must be removed',
      'must drop',
      'Feature bullets',
      'inferable',
    ]) {
      expect(stripped).not.toContain(marker);
    }
  });

  it('re-emits the header as at most 3 content lines (@file, @description, ≤1 @constraint)', () => {
    const lines = bannerLines(stripped);
    expect(lines.length).toBeLessThanOrEqual(3);
    expect(lines.some((l) => l.startsWith('@file'))).toBe(true);
    expect(lines.some((l) => l.startsWith('@description'))).toBe(true);
    // the multi-line description collapses to its FIRST physical line only
    expect(stripped).toContain(
      '@description Sample block for the strip-snippet golden test — one clean line.',
    );
    expect(stripped).not.toContain('This continuation line'); // dropped desc tail
    // the non-inferable @constraint line is preserved as the 3rd line
    expect(lines.some((l) => l.startsWith('@constraint'))).toBe(true);
    expect(stripped).toContain('@constraint wllama n_ctx capped at 8192 for the wasm32 heap.');
  });

  it('retains the /** KEEP */-tagged constraint comment verbatim', () => {
    const keep = '{/** KEEP: constraint comment retained because it carries a KEEP tag. */}';
    expect(source).toContain(keep);
    expect(stripped).toContain(keep);
  });

  it('leaves untouched code byte-identical (template literals, JSX text, real statements)', () => {
    // `//` and `/* */` INSIDE a template literal are NOT comments — survive verbatim
    expect(stripped).toContain(
      'const url = `https://example.com/a//b/* not a comment */`;',
    );
    // `//` inside JSX text is NOT a comment — survives verbatim
    expect(stripped).toContain('Visit https://example.com // not a comment (JSX text)');
    // ordinary statements untouched
    expect(stripped).toContain('const active: boolean = url.length > 0;');
    expect(stripped).toContain('{active ? item : label}');
    // a sibling object key next to a removed data-testid key survives, comma-clean
    expect(stripped).toContain("'data-score': String(i),");
    expect(stripped).not.toContain("'data-testid'");
  });

  it('is idempotent: stripping already-stripped output is a no-op', () => {
    expect(stripSnippet(stripped)).toBe(stripped);
  });

  it('proves the diff vs source is ONLY removed attributes/comments (normalized equality)', () => {
    // Drop comments, data-testid attrs/keys, and collapse whitespace from BOTH.
    // If the transform had altered any OTHER code, the normalized forms diverge.
    const norm = (s: string) =>
      s
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/[^\n]*/g, ' ')
        .replace(/data-testid\s*=\s*(\{[^}]*\}|"[^"]*")/g, ' ')
        .replace(/['"]data-testid['"]\s*:\s*[^,}]+,?/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    expect(norm(stripped)).toBe(norm(source));
  });
});

describe('stripSnippet — targeted object-spread key removal', () => {
  it('removes a lone data-testid key, leaving an empty object', () => {
    const src = `const x = <p {...(a ? { 'data-testid': 'z' } : {})} />;`;
    const out = stripSnippet(src);
    expect(out).not.toContain('data-testid');
    expect(out).toContain('{...(a ? {');
  });

  it('removes a data-testid key while preserving a sibling key and its comma', () => {
    const src = [
      'const x = <p',
      "  {...{ 'data-testid': 'z', 'data-score': '9' }}",
      '/>;',
    ].join('\n');
    const out = stripSnippet(src);
    expect(out).not.toContain('data-testid');
    expect(out).toContain("'data-score': '9'");
  });
});

describe('stripSnippet — compiles-witness (transform never breaks code)', () => {
  it('the stripped fixture type-checks with tsc --noEmit', { timeout: 60_000 }, () => {
    const witness = path.join(FIXTURES, '.strip-witness.tsx');
    writeFileSync(witness, stripSnippet(source), 'utf8');
    try {
      execFileSync(
        path.join(APP_ROOT, 'node_modules', '.bin', 'tsc'),
        [
          '--noEmit',
          '--jsx',
          'react-jsx',
          '--module',
          'esnext',
          '--moduleResolution',
          'bundler',
          '--target',
          'esnext',
          '--lib',
          'dom,dom.iterable,esnext',
          '--skipLibCheck',
          '--strict',
          '--esModuleInterop',
          witness,
        ],
        { cwd: APP_ROOT, stdio: 'pipe' },
      );
    } catch (err) {
      const e = err as { stdout?: Buffer; stderr?: Buffer };
      const out = `${e.stdout?.toString() ?? ''}${e.stderr?.toString() ?? ''}`;
      throw new Error(`stripped fixture failed to compile:\n${out}`);
    } finally {
      unlinkSync(witness);
    }
  });
});

describe('scanner-artifact containment (regression: literal /* inside a JSDoc)', () => {
  it('a header containing `@localmode/*` strips cleanly with the header preserved', () => {
    const src = [
      "'use client';",
      '',
      '/**',
      ' * @file x.ts',
      " * @description Block-local (imports @localmode/*, blocks carve-out); no download until first classification.",
      ' */',
      '',
      'export const a = 1; // dev note',
      '',
    ].join('\n');
    const out = stripSnippet(src);
    expect(out).toContain('@file x.ts');
    expect(out).toContain('@localmode/*');
    expect(out).not.toContain('dev note');
  });
});
