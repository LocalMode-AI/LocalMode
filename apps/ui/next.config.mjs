import { createMDX } from 'fumadocs-mdx/next';
import { LEGACY_REDIRECTS, CATEGORY_RENAMES } from './src/lib/legacy-redirects.ts';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // Env-gated build output dir so parallel E2E runs can build/serve in isolation
  // without clobbering a shared `.next`. Defaults to `.next` when unset.
  distDir: process.env.UI_DIST_DIR || '.next',
  transpilePackages: ['fumadocs-ui', 'fumadocs-core', '@fumadocs/ui'],
  async redirects() {
    return [
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
    ];
  },
};

export default withMDX(config);
