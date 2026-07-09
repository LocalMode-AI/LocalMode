/**
 * @file build-sw.mjs
 * @description Postbuild step: compiles src/app/sw.ts → public/sw.js with esbuild,
 * then injects the precache manifest via @serwist/build. Runs after `next build`
 * (see package.json "build"). Honors the env-gated distDir (UI_DIST_DIR) so the
 * isolated E2E builds precache from the same output dir they built into.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(__dirname, '..');
process.chdir(appDir);

const swSrc = path.join(appDir, 'src/app/sw.ts');
const swDest = path.join(appDir, 'public/sw.js');
// Match next.config.mjs's env-gated distDir so the precache globs hit real output.
const distDir = `${process.env.UI_DIST_DIR || '.next'}/`;

// Step 1: Compile TypeScript → bundled JavaScript
await build({
  entryPoints: [swSrc],
  outfile: swDest,
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['chrome111', 'edge111', 'firefox111', 'safari16.4'],
});

// Step 2: Inject precache manifest into the compiled SW
const serwistNextPath = import.meta.resolve('@serwist/next/config');
const require = createRequire(serwistNextPath);
const buildPath = require.resolve('@serwist/build');
const { injectManifest } = await import(buildPath);

const { count, size, warnings } = await injectManifest({
  swSrc: swDest,
  swDest,
  globDirectory: appDir,
  // Precache the readable app shell (prerendered HTML + CSS + fonts + public
  // assets) — NOT the JS chunks. Precaching every provider/block chunk would be a
  // ~70MB background download on SW install; instead the heavy JS is runtime-cached
  // on first visit (Serwist defaultCache), so pages you've opened work offline and
  // unopened pages fall back to /offline.
  globPatterns: [
    `${distDir}static/**/*.{css,woff,woff2,ttf,otf}`,
    `${distDir}server/app/offline*.html`,
    'public/**/*.{png,ico,svg,json,webmanifest}',
  ],
  globIgnores: [
    'public/sw.js',
    'public/sw.js.map',
    `${distDir}server/app/**/_not-found.html`,
    `${distDir}server/app/_global-error*`,
    `${distDir}server/pages/404.html`,
    `${distDir}server/pages/500.html`,
  ],
  dontCacheBustURLsMatching: new RegExp(`^${distDir}static/`),
  maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
  manifestTransforms: [
    (entries) => ({
      manifest: entries.map((entry) => {
        const appPrefix = `${distDir}server/app/`;
        const pagesPrefix = `${distDir}server/pages/`;
        if (entry.url.startsWith(appPrefix) || entry.url.startsWith(pagesPrefix)) {
          const prefix = entry.url.startsWith(appPrefix) ? appPrefix : pagesPrefix;
          let pagePath = entry.url.slice(prefix.length).replace(/\.html$/, '');
          if (pagePath === 'index') pagePath = '';
          else pagePath = pagePath.replace(/\/index$/, '');
          entry.url = `/${pagePath}`;
        }
        if (entry.url.startsWith(`${distDir}static/`)) {
          entry.url = entry.url.replace(distDir, '/_next/');
        }
        if (entry.url.startsWith('public/')) {
          entry.url = `/${entry.url.slice('public/'.length)}`;
        }
        return entry;
      }),
    }),
  ],
});

if (warnings.length > 0) console.warn('[serwist]', warnings.join('\n'));
console.log(`[serwist] Precached ${count} files (${(size / 1024).toFixed(1)} KB) → public/sw.js`);
