/**
 * Postbuild script that generates the service worker using esbuild + @serwist/build.
 *
 * 1. Compiles src/app/sw.ts → public/sw.js with esbuild (bundles all imports)
 * 2. Injects the precache manifest via @serwist/build (replaces self.__SW_MANIFEST)
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
const distDir = '.next/';

// Step 1: Compile TypeScript → bundled JavaScript
await build({
  entryPoints: [swSrc],
  outfile: swDest,
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['chrome111', 'edge111', 'firefox111', 'safari16.4'],
});

// Step 2: Inject precache manifest into compiled SW
const serwistNextPath = import.meta.resolve('@serwist/next/config');
const require = createRequire(serwistNextPath);
const buildPath = require.resolve('@serwist/build');
const { injectManifest } = await import(buildPath);

const { count, size, warnings } = await injectManifest({
  swSrc: swDest,
  swDest,
  globDirectory: appDir,
  globPatterns: [
    `${distDir}static/**/*.{js,css,html,ico,png,jpg,jpeg,gif,svg,webp,json,webmanifest}`,
    `${distDir}server/{app,pages}/**/*.html`,
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
        // Rewrite .next/server/app/*.html → /* (prerendered pages)
        const appPrefix = `${distDir}server/app/`;
        const pagesPrefix = `${distDir}server/pages/`;
        if (entry.url.startsWith(appPrefix) || entry.url.startsWith(pagesPrefix)) {
          const prefix = entry.url.startsWith(appPrefix) ? appPrefix : pagesPrefix;
          let pagePath = entry.url.slice(prefix.length);
          // Strip .html extension
          pagePath = pagePath.replace(/\.html$/, '');
          // Strip "index" segment (root or trailing)
          if (pagePath === 'index') {
            pagePath = '';
          } else {
            pagePath = pagePath.replace(/\/index$/, '');
          }
          entry.url = `/${pagePath}`;
        }
        // Rewrite .next/static/* → /_next/static/*
        if (entry.url.startsWith(`${distDir}static/`)) {
          entry.url = entry.url.replace(distDir, '/_next/');
        }
        // Rewrite public/* → /*
        if (entry.url.startsWith('public/')) {
          entry.url = `/${entry.url.slice('public/'.length)}`;
        }
        return entry;
      }),
    }),
  ],
});

if (warnings.length > 0) {
  console.warn('[serwist]', warnings.join('\n'));
}

console.log(`[serwist] Precached ${count} files (${(size / 1024).toFixed(1)} KB) → public/sw.js`);
