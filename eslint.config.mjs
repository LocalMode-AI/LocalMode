// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/**
 * Root ESLint flat config.
 *
 * Scope: `packages/**` (the published library code) plus root-level tooling
 * files. Each app under `apps/*` ships its own `eslint.config.mjs` (Next.js
 * presets) and its own `lint` script, so they are ignored here to avoid
 * linting the same files under two different rule sets.
 */
export default tseslint.config(
  {
    // Several packages carry `eslint-disable` comments for rules this config
    // does not enable (`no-console` around deliberate warnings,
    // `@typescript-eslint/no-deprecated`). They document intent, and `--fix`
    // would otherwise strip them and leave blank lines behind.
    linterOptions: { reportUnusedDisableDirectives: 'off' },
  },
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.source/**',
      '**/coverage/**',
      '**/*.d.ts',
      // Apps own their configs + lint scripts
      'apps/**',
      // Not part of the workspace build
      'examples_WIP/**',
      'docs_WIP/**',
      // Generated / vendored
      '**/*.generated.ts',
      '**/public/**',
      '**/e2e-artifacts/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['packages/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.worker,
      },
    },
    rules: {
      // Underscore prefix is the repo's convention for intentionally unused bindings.
      // `ignoreRestSiblings` permits the destructure-to-omit idiom
      // (`const { onBargeIn, ...coreOptions } = options`).
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
          ignoreRestSiblings: true,
        },
      ],
      // `any` is sometimes unavoidable at provider/WASM boundaries — flag, don't block.
      '@typescript-eslint/no-explicit-any': 'warn',
      // Same rationale: casting an overloaded provider import to call it.
      '@typescript-eslint/no-unsafe-function-type': 'warn',
      // Empty `interface X extends Y {}` is a deliberate, augmentable public alias.
      '@typescript-eslint/no-empty-object-type': ['error', { allowInterfaces: 'always' }],
      // A `let` that is read before its single assignment cannot become `const`
      // without risking a temporal-dead-zone error.
      'prefer-const': ['error', { ignoreReadBeforeAssign: true }],
      // Redundant escapes are semantically identical; rewriting regexes by hand
      // is riskier than the finding is valuable.
      'no-useless-escape': 'warn',
    },
  },

  {
    // Hook packages: the `react-hooks/*` rules these files already reference in
    // `eslint-disable` comments only exist once the plugin is registered.
    files: ['packages/react/**/*.{ts,tsx}', 'packages/devtools/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  {
    // Tests and benchmarks exercise edge cases that the strict rules would fight.
    // Unused bindings here are noise rather than shipped dead code (TypeScript's
    // `noUnusedLocals` does not cover tests, which are outside `tsconfig.include`),
    // so they are surfaced as warnings instead of blocking the lint gate.
    files: [
      'packages/**/tests/**/*.{ts,tsx}',
      'packages/**/*.test.{ts,tsx}',
      'packages/**/*.test-d.ts',
      'packages/**/*.bench.ts',
      'packages/**/src/testing/**/*.ts',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
          ignoreRestSiblings: true,
        },
      ],
    },
  },

  {
    // Root tooling (vitest config, scripts).
    files: ['*.{js,mjs,cjs,ts}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
);
