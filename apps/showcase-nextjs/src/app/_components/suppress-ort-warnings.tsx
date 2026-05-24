/**
 * @file suppress-ort-warnings.tsx
 * @description Client-side script to suppress noisy ONNX Runtime and LiteRT WASM warnings.
 *
 * ONNX Runtime's and LiteRT's WASM binaries emit internal C++ log messages via
 * console.error that cannot be suppressed through JS-level settings. This
 * component patches console.error and console.warn to filter known harmless messages.
 */
'use client';

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

const ALL_PATTERNS = [
  ...ORT_WARNING_PATTERNS,
  ...TJS_WARNING_PATTERNS,
  ...LITERT_WARNING_PATTERNS,
];

const LITERT_TIMESTAMP_RE = /^W\d{4} \d{2}:\d{2}:\d{2}\.\d+/;

function isSuppressedWarning(args: unknown[]): boolean {
  return args.some(
    (arg) =>
      typeof arg === 'string' &&
      (ALL_PATTERNS.some((p) => arg.includes(p)) || LITERT_TIMESTAMP_RE.test(arg))
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

/** No-op component — the side effect runs at module evaluation time */
export function SuppressOrtWarnings() {
  return null;
}
