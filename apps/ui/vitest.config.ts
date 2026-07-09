import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// apps/ui unit tests. Scoped to `scripts/**/*.test.ts` ONLY, so the standalone
// tsx assertion scripts (`scripts/check-*.ts`, run directly, not via Vitest) are
// never globbed as test files.
export default defineConfig({
  // Automatic JSX runtime so the promoted `.tsx` primitives (which import named
  // hooks from 'react' but not the default `React`) transform correctly under
  // Vitest — matching the Next.js app's own build. Added for the group-10
  // equivalence tests (blocks-shared-promotions); the pre-existing pure-TS
  // scripts tests import no JSX and are unaffected.
  esbuild: { jsx: 'automatic' },
  resolve: {
    // Mirror the tsconfig `@/` aliases the promoted primitives and their
    // block-local originals import, so the equivalence tests exercise the REAL
    // component source (not a re-declared copy). Additive — the standalone
    // scripts tests use relative imports and never touch these aliases.
    alias: [
      {
        find: '@/components/provider-fallback-badge',
        replacement: r(
          './registry/localmode/local-first/provider-fallback-badge/provider-fallback-badge.tsx',
        ),
      },
      {
        find: '@/components/option-list',
        replacement: r('./registry/localmode/input-controls/option-list/option-list.tsx'),
      },
      { find: '@/registry', replacement: r('./registry') },
      { find: '@/lib', replacement: r('./src/lib') },
      // The block-markdown builder reads the gallery catalog + category map.
      { find: '@/app', replacement: r('./src/app') },
    ],
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['scripts/**/*.test.ts'],
  },
});
