import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';

const eslintConfig = defineConfig([
  ...nextVitals,
  // Mirror .gitignore's generated/artifact set. Anything emitted by a build, a
  // generator, or a test run is not source and must not be linted — the
  // Turbopack chunks under `.next-*/` in particular carry ~76 findings from
  // bundled third-party code.
  globalIgnores([
    '.next/**',
    '.next-*/**',
    'out/**',
    'build/**',
    'coverage/**',
    'next-env.d.ts',
    '.source/**',
    'public/r/**',
    'public/sw.js',
    'public/sw.js.map',
    'e2e-artifacts/**',
    'e2e/e2e-artifacts/**',
    'test-results/**',
    'playwright-report/**',
    // Emitted by scripts/generate-block-source.ts; never hand-edited.
    'src/lib/block-source.generated.ts',
  ]),
]);

export default eslintConfig;
