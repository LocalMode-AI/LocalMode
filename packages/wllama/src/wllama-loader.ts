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

/**
 * The thread pool a loaded wllama instance actually built, from the runtime's
 * own `isMultithread()` / `getNumThreads()`; null when the runtime does not
 * expose them. Recorded next to the requested thread count so a lane that
 * fell back to one thread says so.
 */
export function readThreadPool(
  instance: Partial<Pick<WllamaInstance, 'isMultithread' | 'getNumThreads'>>,
): { multithread: boolean; threads: number } | null {
  if (typeof instance.isMultithread !== 'function' || typeof instance.getNumThreads !== 'function') return null;
  const multithread = instance.isMultithread();
  const threads = instance.getNumThreads();
  if (typeof multithread !== 'boolean' || typeof threads !== 'number') return null;
  return { multithread, threads };
}

/** wllama's logger hooks (console-compatible). */
export interface WllamaLoggerLike {
  debug: (...args: unknown[]) => void;
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

/** Constructor shape of the wllama runtime class. */
export type WllamaCtor = new (
  config: { default: string },
  wllamaConfig?: { logger?: WllamaLoggerLike; suppressNativeLog?: boolean },
) => WllamaInstance;

/** Layers llama.cpp reported offloading to the GPU at load, from its own log line. */
export interface OffloadedLayers {
  gpu: number;
  total: number;
}

/**
 * A wllama logger that forwards everything to the console and records what
 * llama.cpp says about GPU offload while a model loads. wllama 3.5 offloads
 * every layer to WebGPU by default when `navigator.gpu` exists, and nothing
 * but this log line says whether it happened.
 *
 * @example
 * const capture = createOffloadCapturingLogger();
 * new Wllama(paths, { logger: capture.logger });
 * // after loadModelFromUrl(): capture.offloaded -> { gpu: 31, total: 31 }
 */
export function createOffloadCapturingLogger(): { logger: WllamaLoggerLike; readonly offloaded: OffloadedLayers | null } {
  let offloaded: OffloadedLayers | null = null;
  const scan = (args: unknown[]) => {
    for (const a of args) {
      if (typeof a !== 'string') continue;
      const m = a.match(/offloaded (\d+)\/(\d+) layers to GPU/);
      if (m) offloaded = { gpu: Number(m[1]), total: Number(m[2]) };
    }
  };
  return {
    logger: {
      debug: (...args) => { scan(args); console.debug(...args); },
      log: (...args) => { scan(args); console.log(...args); },
      warn: (...args) => { scan(args); console.warn(...args); },
      error: (...args) => { scan(args); console.error(...args); },
    },
    get offloaded() {
      return offloaded;
    },
  };
}

/**
 * Minimal shape of wllama's ModelManager: downloads GGUF files into the OPFS
 * cache WITHOUT creating an inference context. This is the only safe way to
 * preload a model of unknown task type — loading an embedding/reranker GGUF
 * through a plain `loadModelFromUrl()` runs llama.cpp's causal-LLM init warmup
 * on an encoder-only model and aborts the WASM (`llama_context::output_reserve`).
 */
export interface ModelManagerLike {
  getModelOrDownload(
    sourceOrURL: string | { url: string; mmprojUrl?: string },
    options?: {
      progressCallback?: (opts: { loaded: number; total: number }) => unknown;
    }
  ): Promise<unknown>;
}

/** Constructor shape of wllama's ModelManager. */
export type ModelManagerCtor = new (params?: {
  parallelDownloads?: number;
}) => ModelManagerLike;

/** The wllama module exports the loader returns. */
export interface WllamaModule {
  Wllama: WllamaCtor;
  ModelManager: ModelManagerCtor;
}

/**
 * Import the wllama runtime module from the CDN.
 *
 * @returns The module's exports (at minimum `{ Wllama, ModelManager }`).
 * @internal
 */
export async function importWllama(): Promise<WllamaModule> {
  const dynamicImport = new Function('u', 'return import(u)') as (
    url: string
  ) => Promise<WllamaModule>;
  return dynamicImport(WLLAMA_CDN_ESM);
}
