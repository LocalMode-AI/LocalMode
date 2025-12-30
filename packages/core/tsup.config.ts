import { defineConfig } from 'tsup';

export default defineConfig([
  // Main entry
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    minify: true,
    treeshake: true,
    splitting: false,
    sourcemap: true,
    outDir: 'dist',
  },
  // Worker entry (ESM only for workers)
  {
    entry: ['src/worker/index.ts'],
    format: ['esm'],
    dts: true,
    minify: true,
    treeshake: true,
    splitting: false,
    sourcemap: true,
    outDir: 'dist/worker',
  },
]);

