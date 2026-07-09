/**
 * @file wllama-loader.ts
 * @description Single shared loader for the wllama runtime module.
 *
 * Imports `@wllama/wllama` from the jsDelivr CDN ESM build via a
 * runtime-constructed dynamic import (`new Function('u', 'return import(u)')`).
 * The indirection is deliberate: bundlers (Turbopack, Webpack) break wllama's
 * Web Worker when they transpile the `@wllama/wllama` package, so the import
 * MUST stay invisible to static analysis. Do not convert this to a regular
 * `import` / `import()` — it will compile, then break at runtime in apps.
 *
 * This module is also the test seam: unit tests mock `./wllama-loader.js`
 * (one layer below the model/embedding/reranker classes under test) instead of
 * `@wllama/wllama`, which the code never imports statically.
 */

/**
 * CDN base pinned to the version range declared in package.json.
 *
 * 3.5.1 is the minimum version that ships `createRerank` — the reranker
 * support 3.2.3 never had (found by real-Chrome verification of `useRerank`:
 * `wllamaInstance.createRerank is not a function` after a full GGUF load).
 */
const WLLAMA_CDN_BASE = 'https://cdn.jsdelivr.net/npm/@wllama/wllama@3.5.1';

/** CDN URL of the wllama ESM entry. */
export const WLLAMA_CDN_ESM = `${WLLAMA_CDN_BASE}/esm/index.js`;

/** CDN URL of the single-thread/multi-thread wllama WASM binary. */
export const WLLAMA_CDN_WASM = `${WLLAMA_CDN_BASE}/src/wasm/wllama.wasm`;

/** Instance type of the wllama runtime class (types come from the npm dep). */
export type WllamaInstance = InstanceType<
  Awaited<typeof import('@wllama/wllama')>['Wllama']
>;

/** Constructor shape of the wllama runtime class. */
export type WllamaCtor = new (config: { default: string }) => WllamaInstance;

/**
 * Import the wllama runtime module from the CDN.
 *
 * @returns The module's exports (at minimum `{ Wllama }`).
 * @internal
 */
export async function importWllama(): Promise<{ Wllama: WllamaCtor }> {
  const dynamicImport = new Function('u', 'return import(u)') as (
    url: string
  ) => Promise<{ Wllama: WllamaCtor }>;
  return dynamicImport(WLLAMA_CDN_ESM);
}
