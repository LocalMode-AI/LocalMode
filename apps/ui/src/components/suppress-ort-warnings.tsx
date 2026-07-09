'use client';

/**
 * @file suppress-ort-warnings.tsx
 * @description Filters a fixed, documented set of harmless ONNX Runtime /
 * Transformers.js / LiteRT WASM console messages that those C++/WASM binaries
 * emit via console.error|warn and that cannot be silenced through JS options.
 * Only messages matching the exact known patterns below are dropped; every other
 * console message passes through unchanged (a real error is never hidden). The
 * side effect runs at module-evaluation time, so merely rendering this (null)
 * component installs the filter.
 */
const ORT_WARNING_PATTERNS = [
  'VerifyEachNodeIsAssignedToAnEp',
  'Some nodes were not assigned to the preferred execution providers',
  'Rerunning with verbose output on a non-minimal build will show node assignments',
];

const TJS_WARNING_PATTERNS = [
  'dtype not specified for',
  'Unable to determine content-length from response headers',
];

const LITERT_WARNING_PATTERNS = [
  'litert_lm_loader',
  'llm_executor_settings_utils',
  'accelerator_registry',
  'gpu_registry',
  'cpu_registry',
  'npu_registry',
  'compiled_model',
  'environment.cc',
  'Created TensorFlow Lite XNNPACK delegate',
];

const ALL_PATTERNS = [...ORT_WARNING_PATTERNS, ...TJS_WARNING_PATTERNS, ...LITERT_WARNING_PATTERNS];

// LiteRT/glog lines are prefixed with a `Wmmdd HH:MM:SS.frac` timestamp.
const LITERT_TIMESTAMP_RE = /^W\d{4} \d{2}:\d{2}:\d{2}\.\d+/;

function isSuppressedWarning(args: unknown[]): boolean {
  return args.some(
    (arg) =>
      typeof arg === 'string' &&
      (ALL_PATTERNS.some((p) => arg.includes(p)) || LITERT_TIMESTAMP_RE.test(arg)),
  );
}

if (typeof window !== 'undefined') {
  const originalError = console.error;
  const originalWarn = console.warn;

  console.error = (...args: unknown[]) => {
    if (!isSuppressedWarning(args)) originalError.apply(console, args);
  };
  console.warn = (...args: unknown[]) => {
    if (!isSuppressedWarning(args)) originalWarn.apply(console, args);
  };
}

/** No-op component — the filter is installed at module-evaluation time above. */
export function SuppressOrtWarnings() {
  return null;
}
