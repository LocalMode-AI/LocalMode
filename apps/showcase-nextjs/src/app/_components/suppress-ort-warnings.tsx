/**
 * @file suppress-ort-warnings.tsx
 * @description Client-side script to suppress noisy ONNX Runtime WASM warnings.
 *
 * ONNX Runtime's WASM binary emits warnings via console.error that cannot be
 * suppressed through the JS-level ort.env.logLevel setting (the WASM binary
 * routes all log levels through console.error). This component patches
 * console.error and console.warn to filter known harmless messages.
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

const ALL_PATTERNS = [...ORT_WARNING_PATTERNS, ...TJS_WARNING_PATTERNS];

function isOrtWarning(args: unknown[]): boolean {
  return args.some(
    (arg) => typeof arg === 'string' && ALL_PATTERNS.some((p) => arg.includes(p))
  );
}

if (typeof window !== 'undefined') {
  const originalError = console.error;
  const originalWarn = console.warn;

  console.error = (...args: unknown[]) => {
    if (!isOrtWarning(args)) originalError.apply(console, args);
  };

  console.warn = (...args: unknown[]) => {
    if (!isOrtWarning(args)) originalWarn.apply(console, args);
  };
}

/** No-op component — the side effect runs at module evaluation time */
export function SuppressOrtWarnings() {
  return null;
}
