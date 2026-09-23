import { defineConfig } from 'vitest/config';

/**
 * Config for the model-downloading integration suite.
 *
 * The suite is deliberately outside the default `*.test.ts` include pattern so
 * a normal `vitest run` never fetches models. It runs with the workspace root
 * as the Vitest root because the suite spawns child processes that resolve
 * package and source paths from there.
 */
export default defineConfig({
  test: {
    include: ['packages/transformers/tests/v4-migration-validation.integration.ts'],
    testTimeout: 300_000,
  },
});
