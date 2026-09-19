import { createMDX } from 'fumadocs-mdx/next';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEGACY_REDIRECTS, CATEGORY_RENAMES } from './src/lib/legacy-redirects.ts';

const withMDX = createMDX();
const here = dirname(fileURLToPath(import.meta.url));

/**
 * The inference runtimes each bench lane executes, keyed by the provider
 * package that bundles them. Their installed versions are resolved at build
 * time and stamped into every benchmark submission (`harness.runtimeVersions`)
 * so a result can always be tied to the exact runtime that produced it.
 * wllama is the exception: it loads from a CDN pin, which the provider exports.
 */
const BENCH_RUNTIME_PACKAGES = {
  '@localmode/transformers': ['@huggingface/transformers'],
  '@localmode/webllm': ['@mlc-ai/web-llm'],
  '@localmode/wllama': ['@wllama/wllama'],
  '@localmode/litert': ['@litert-lm/core'],
  '@localmode/mediapipe': ['@mediapipe/tasks-text'],
  '@localmode/chrome-ai': [],
  '@localmode/bench': [],
};

function readPackageVersion(packageJsonPath) {
  try {
    return JSON.parse(readFileSync(packageJsonPath, 'utf8')).version;
  } catch {
    return undefined;
  }
}

/**
 * The wllama version that executes is the CDN pin inside the provider's
 * bundle, not whatever npm installed; read it from the built provider.
 */
function readWllamaCdnPin(providerDir) {
  for (const file of ['dist/index.js', 'src/wllama-loader.ts']) {
    try {
      const m = readFileSync(join(providerDir, file), 'utf8').match(/@wllama\/wllama@(\d+\.\d+\.\d+)/);
      if (m) return m[1];
    } catch {
      // try the next candidate
    }
  }
  return undefined;
}

/** Resolve installed versions of the provider packages and the runtimes they wrap. */
function resolveBenchRuntimeVersions() {
  const versions = {};
  for (const [provider, runtimes] of Object.entries(BENCH_RUNTIME_PACKAGES)) {
    let providerDir;
    try {
      providerDir = realpathSync(join(here, 'node_modules', ...provider.split('/')));
    } catch {
      continue;
    }
    const providerVersion = readPackageVersion(join(providerDir, 'package.json'));
    if (providerVersion) versions[provider] = providerVersion;
    for (const runtime of runtimes) {
      // pnpm links each package's direct dependencies into its own node_modules.
      const v = readPackageVersion(join(providerDir, 'node_modules', ...runtime.split('/'), 'package.json'));
      if (v) versions[runtime] = v;
    }
    if (provider === '@localmode/wllama') {
      const pin = readWllamaCdnPin(providerDir);
      if (pin) versions['@wllama/wllama'] = pin;
    }
  }
  return versions;
}

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // Env-gated build output dir so parallel E2E runs can build/serve in isolation
  // without clobbering a shared `.next`. Defaults to `.next` when unset.
  distDir: process.env.UI_DIST_DIR || '.next',
  env: {
    NEXT_PUBLIC_BENCH_RUNTIME_VERSIONS: JSON.stringify(resolveBenchRuntimeVersions()),
    NEXT_PUBLIC_BENCH_BUILD_COMMIT:
      process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? process.env.BENCH_BUILD_COMMIT ?? '',
  },
  transpilePackages: ['fumadocs-ui', 'fumadocs-core', '@fumadocs/ui'],
  async redirects() {
    return [
      // Device Badge moved from a top-level seed into the local-first family.
      { source: '/docs/device-badge', destination: '/docs/local-first/device-badge', permanent: true },
      // The rag block was absorbed into knowledge-base, then into the `knowledge`
      // category. Re-pointed to the category page so the legacy chain never loops
      // through the knowledge-base → knowledge CATEGORY_RENAMES 308.
      { source: '/blocks/rag', destination: '/blocks/knowledge', permanent: true },
      // NOTE: the `/blocks/vision → /blocks/vision-lab` entry was REMOVED —
      // `/blocks/vision` is now the REAL vision category page. The reverse
      // `/blocks/vision-lab → /blocks/vision` 308 is emitted from CATEGORY_RENAMES
      // below (flipping it here would create a redirect loop).
      // The voice block was absorbed into audio-studio, then dissolved into the
      // `audio` category. Re-pointed to the category page so the legacy chain never
      // loops through the audio-studio → audio CATEGORY_RENAMES 308.
      { source: '/blocks/voice', destination: '/blocks/audio', permanent: true },
      { source: '/demos', destination: '/blocks', permanent: true },
      { source: '/demos/:name', destination: '/blocks/:name', permanent: true },
      { source: '/test-lab/:name', destination: '/blocks/:name', permanent: true },
      // Legacy slugs → absorbing block routes. Single source of truth in
      // src/lib/legacy-redirects.ts, shared with the redirect-walk E2E spec so
      // config and test cannot drift. No catch-all: unknown legacy paths 404
      // rather than shadow a real route.
      ...LEGACY_REDIRECTS.map(({ slug, blockPath }) => ({
        source: `/${slug}`,
        destination: blockPath,
        permanent: true,
      })),
      // Renamed-category 308s. Single source in src/lib/legacy-redirects.ts,
      // shared with the redirect-walk E2E spec. Each renamed category adds an
      // entry there producing a 308 from the old /blocks/<name> route to the new.
      ...CATEGORY_RENAMES.map(({ from, to }) => ({
        source: `/blocks/${from}`,
        destination: `/blocks/${to}`,
        permanent: true,
      })),
    ];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Cross-Origin Isolation → unlocks SharedArrayBuffer + multi-threaded WASM
          // (faster on-device inference). COEP is `credentialless` (NOT require-corp)
          // so cross-origin model downloads (HuggingFace / MediaPipe CDNs, which don't
          // send CORP) still load — they're fetched without credentials. Verified in
          // e2e that a real model still downloads under these headers.
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
        ],
      },
      // WebKit (Safari, and every browser on iOS) does not implement COEP
      // `credentialless`, so those pages were never cross-origin isolated: no
      // SharedArrayBuffer, single-threaded WASM, and wllama's shared 4 GB WASM
      // memory cannot be created at all ("Out of memory" on iPhone). WebKit
      // gets `require-corp` instead; every cross-origin asset the site loads
      // (jsDelivr, HuggingFace, MediaPipe, Google Fonts) is fetched with CORS or
      // sends CORP, so nothing is blocked. Header rules apply in order and a
      // later matching rule overrides the same key, so these two win on WebKit.
      // Vercel evaluates `has` values with RE2: no lookarounds.
      {
        source: '/(.*)',
        has: [{ type: 'header', key: 'user-agent', value: '.*(iPhone|iPad|iPod).*' }],
        headers: [{ key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' }],
      },
      {
        source: '/(.*)',
        has: [{ type: 'header', key: 'user-agent', value: '.*Version/[0-9.]+.*Safari/.*' }],
        headers: [{ key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' }],
      },
    ];
  },
};

export default withMDX(config);
