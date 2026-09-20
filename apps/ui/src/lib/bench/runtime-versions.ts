/**
 * Runtime package versions stamped into benchmark submissions. Resolved at
 * build time by next.config.mjs (installed versions of the provider packages
 * and the inference runtimes they wrap; wllama's CDN pin) and exposed through
 * a public env var, so every run records the exact software that produced it.
 */

/** Package name → version, as resolved at build time. Empty when the build did not stamp them. */
export function benchRuntimeVersions(): Record<string, string> {
  try {
    const raw = process.env.NEXT_PUBLIC_BENCH_RUNTIME_VERSIONS;
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** Git commit of the deployed build when the host exposes it. */
export function benchBuildCommit(): string | undefined {
  const sha = process.env.NEXT_PUBLIC_BENCH_BUILD_COMMIT;
  return sha ? sha : undefined;
}

/** The npm package whose version identifies each bench runtime lane. */
const RUNTIME_PACKAGE_BY_LANE: Record<string, string> = {
  'transformers-webgpu': '@huggingface/transformers',
  'transformers-wasm': '@huggingface/transformers',
  webllm: '@mlc-ai/web-llm',
  wllama: '@wllama/wllama',
  'wllama-webgpu': '@wllama/wllama',
  litert: '@litert-lm/core',
  mediapipe: '@mediapipe/tasks-text',
};

/**
 * Version string for a runtime lane, e.g. `transformers-wasm` → "4.2.0".
 * Chrome Built-in AI has no package: the browser version in the environment
 * capture is its runtime identity, so it stays undefined here.
 */
export function runtimeVersionFor(runtimeId: string): string | undefined {
  const pkg = RUNTIME_PACKAGE_BY_LANE[runtimeId];
  return pkg ? benchRuntimeVersions()[pkg] : undefined;
}
