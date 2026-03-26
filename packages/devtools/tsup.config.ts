import { defineConfig } from 'tsup';

export default defineConfig([
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
    external: ['@localmode/core'],
  },
  {
    entry: { widget: 'src/widget/index.tsx' },
    format: ['esm', 'cjs'],
    dts: true,
    minify: true,
    treeshake: true,
    splitting: false,
    sourcemap: true,
    outDir: 'dist',
    external: ['@localmode/core', 'react', 'react-dom', 'react/jsx-runtime'],
  },
]);
