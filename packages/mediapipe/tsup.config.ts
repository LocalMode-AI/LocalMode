import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: [
    '@mediapipe/tasks-vision',
    '@mediapipe/tasks-audio',
    '@mediapipe/tasks-text',
    '@localmode/core',
  ],
});
