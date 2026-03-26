import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  minify: true,
  treeshake: true,
  splitting: false,
  sourcemap: true,
  outDir: 'dist',
  external: ['ai', '@ai-sdk/provider', '@ai-sdk/provider-utils', '@localmode/core'],
});
