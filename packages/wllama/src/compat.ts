/**
 * GGUF Browser Compatibility Checker
 *
 * Cross-references GGUF model metadata with device capabilities to estimate
 * whether a model can run on the current device before downloading.
 *
 * @packageDocumentation
 */

import type { GGUFMetadata } from './gguf.js';
import { parseGGUFMetadata } from './gguf.js';
import { isCrossOriginIsolated } from './utils.js';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Browser compatibility assessment result for a GGUF model.
 *
 * All fields provide heuristic estimates — actual performance depends on
 * device load, browser memory management, and other running tabs.
 */
export interface GGUFBrowserCompat {
  /** Whether the model is estimated to run on this device */
  canRun: boolean;

  /** Estimated RAM required in bytes (fileSize * 1.2 overhead factor) */
  estimatedRAM: number;

  /** Human-readable RAM estimate (e.g., '1.2 GB') */
  estimatedRAMHuman: string;

  /** Device RAM in bytes from `navigator.deviceMemory` (null if unavailable) */
  deviceRAM: number | null;

  /** Human-readable device RAM (e.g., '8 GB', or 'unknown') */
  deviceRAMHuman: string;

  /** Available storage quota in bytes from `navigator.storage.estimate()` (null if unavailable) */
  availableStorage: number | null;

  /** Human-readable available storage */
  availableStorageHuman: string;

  /** Whether multi-threading requires CORS headers (always true for wllama) */
  needsCORS: boolean;

  /** Whether current page has CORS isolation */
  hasCORS: boolean;

  /** Heuristic speed estimate (e.g., '~15-30 tok/s multi-thread') */
  estimatedSpeed: string;

  /** Human-readable warnings */
  warnings: string[];

  /** Actionable suggestions */
  recommendations: string[];
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

/** RAM overhead factor: model in WASM memory + inference buffers */
const RAM_OVERHEAD_FACTOR = 1.2;

/** Headroom factor: leave 40% for browser + other tabs */
const RAM_HEADROOM_FACTOR = 0.6;

/** Default RAM assumption when navigator.deviceMemory is unavailable (4GB) */
const DEFAULT_DEVICE_RAM_GB = 4;

/** 1 GB in bytes */
const GB = 1024 * 1024 * 1024;

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Format bytes into a human-readable string.
 * @internal
 */
function formatBytes(bytes: number): string {
  if (bytes >= GB) {
    return `${(bytes / GB).toFixed(1)} GB`;
  }
  const mb = 1024 * 1024;
  if (bytes >= mb) {
    return `${(bytes / mb).toFixed(0)} MB`;
  }
  const kb = 1024;
  return `${(bytes / kb).toFixed(0)} KB`;
}

/**
 * Get device RAM in bytes from navigator.deviceMemory.
 * Returns null if unavailable (Firefox, Safari).
 * @internal
 */
function getDeviceRAMBytes(): number | null {
  if (typeof navigator !== 'undefined' && 'deviceMemory' in navigator) {
    const memGB = (navigator as unknown as { deviceMemory: number }).deviceMemory;
    if (typeof memGB === 'number' && memGB > 0) {
      return memGB * GB;
    }
  }
  return null;
}

/**
 * Get available storage quota in bytes.
 * Returns null if the Storage API is unavailable.
 * @internal
 */
async function getAvailableStorage(abortSignal?: AbortSignal): Promise<number | null> {
  abortSignal?.throwIfAborted();
  try {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      if (estimate.quota !== undefined && estimate.usage !== undefined) {
        return estimate.quota - estimate.usage;
      }
      return estimate.quota ?? null;
    }
  } catch {
    // Storage API may throw in certain contexts
  }
  return null;
}

/**
 * Estimate inference speed based on model characteristics and device.
 * @internal
 */
function estimateSpeed(
  parameterCount: number,
  quantization: string,
  isMultiThread: boolean,
  deviceRAMBytes: number | null
): string {
  // Base speed estimation: inversely proportional to parameter count
  // Rough baseline: 1B params ~ 20-40 tok/s multi-thread, 8-15 tok/s single-thread
  const paramsInBillions = parameterCount / 1_000_000_000;

  // Quantization factor: Q4 is ~1.0x, Q8 is ~0.7x, F16 is ~0.4x
  let quantFactor = 1.0;
  if (quantization.includes('Q8') || quantization.includes('Q6')) {
    quantFactor = 0.7;
  } else if (quantization.includes('F16') || quantization.includes('F32') || quantization.includes('BF16')) {
    quantFactor = 0.4;
  } else if (quantization.includes('Q5')) {
    quantFactor = 0.85;
  } else if (quantization.includes('Q3') || quantization.includes('Q2')) {
    quantFactor = 1.1;
  }

  // Device tier factor
  let deviceFactor = 1.0;
  if (deviceRAMBytes !== null) {
    const ramGB = deviceRAMBytes / GB;
    if (ramGB >= 8) deviceFactor = 1.2;
    else if (ramGB >= 4) deviceFactor = 1.0;
    else deviceFactor = 0.7;
  }

  // Threading factor
  const threadFactor = isMultiThread ? 3.0 : 1.0;

  // Calculate range
  const baseSpeed = (30 / Math.max(paramsInBillions, 0.1)) * quantFactor * deviceFactor * threadFactor;
  const lowSpeed = Math.max(1, Math.round(baseSpeed * 0.6));
  const highSpeed = Math.max(lowSpeed + 1, Math.round(baseSpeed * 1.2));
  const threadLabel = isMultiThread ? 'multi-thread' : 'single-thread';

  return `~${lowSpeed}-${highSpeed} tok/s ${threadLabel}`;
}

// ═══════════════════════════════════════════════════════════════
// MAIN FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Check if a GGUF model can run on the current device.
 *
 * Cross-references GGUF metadata with device capabilities:
 * - RAM: `navigator.deviceMemory` (Chrome/Edge) or 4GB fallback
 * - Storage: `navigator.storage.estimate()` for cache space
 * - CORS: `SharedArrayBuffer` availability for multi-threading
 * - Speed: Heuristic estimate based on model size and device tier
 *
 * @param metadata - Parsed GGUF metadata from {@link parseGGUFMetadata}
 * @param options - Optional abort signal
 * @returns Compatibility assessment
 *
 * @example
 * ```ts
 * import { parseGGUFMetadata, checkGGUFBrowserCompat } from '@localmode/wllama';
 *
 * const metadata = await parseGGUFMetadata('bartowski/Llama-3.2-1B-Instruct-GGUF:Q4_K_M.gguf');
 * const compat = await checkGGUFBrowserCompat(metadata);
 *
 * if (compat.canRun) {
 *   console.log('Model can run on this device');
 *   console.log('Estimated speed:', compat.estimatedSpeed);
 * } else {
 *   console.log('Warnings:', compat.warnings);
 *   console.log('Suggestions:', compat.recommendations);
 * }
 * ```
 */
export async function checkGGUFBrowserCompat(
  metadata: GGUFMetadata,
  options?: { abortSignal?: AbortSignal }
): Promise<GGUFBrowserCompat> {
  options?.abortSignal?.throwIfAborted();

  const warnings: string[] = [];
  const recommendations: string[] = [];

  // 1. Compute RAM estimate
  const estimatedRAM = metadata.fileSize * RAM_OVERHEAD_FACTOR;
  const estimatedRAMHuman = formatBytes(estimatedRAM);

  // 2. Get device RAM
  const deviceRAMBytes = getDeviceRAMBytes();
  const deviceRAMHuman = deviceRAMBytes !== null ? formatBytes(deviceRAMBytes) : 'unknown';

  // 3. Get available storage
  const availableStorage = await getAvailableStorage(options?.abortSignal);
  const availableStorageHuman = availableStorage !== null ? formatBytes(availableStorage) : 'unknown';

  // 4. Check CORS isolation
  const hasCORS = isCrossOriginIsolated();
  const needsCORS = true; // Always true for wllama multi-threading

  // 5. Estimate speed
  const speed = estimateSpeed(
    metadata.parameterCount,
    metadata.quantization,
    hasCORS,
    deviceRAMBytes
  );

  // 6. Determine canRun
  // Use actual device RAM or conservative 4GB assumption
  const effectiveDeviceRAM = deviceRAMBytes ?? DEFAULT_DEVICE_RAM_GB * GB;
  const canRun = estimatedRAM < effectiveDeviceRAM * RAM_HEADROOM_FACTOR;

  // 7. Generate warnings and recommendations
  if (deviceRAMBytes === null) {
    warnings.push(
      'Device RAM could not be detected (navigator.deviceMemory unavailable in this browser). ' +
      `Assuming ${DEFAULT_DEVICE_RAM_GB} GB for compatibility estimation.`
    );
  }

  if (!canRun) {
    const requiredHuman = estimatedRAMHuman;
    const availableHuman = deviceRAMBytes !== null ? formatBytes(deviceRAMBytes * RAM_HEADROOM_FACTOR) : `${(DEFAULT_DEVICE_RAM_GB * RAM_HEADROOM_FACTOR).toFixed(1)} GB (estimated)`;
    warnings.push(
      `Model requires approximately ${requiredHuman} RAM but only ${availableHuman} is available for inference (60% of device RAM).`
    );

    // Recommend smaller quantization
    if (metadata.quantization.includes('Q8') || metadata.quantization.includes('Q6') || metadata.quantization.includes('Q5')) {
      recommendations.push(
        'Try a Q4_K_M quantization of this model for ~50% smaller memory footprint'
      );
    }

    // Recommend smaller model
    const paramsInBillions = metadata.parameterCount / 1_000_000_000;
    if (paramsInBillions > 3) {
      recommendations.push(
        'Consider a smaller model variant (1B-3B parameters) for this device'
      );
    }
  }

  if (!hasCORS) {
    recommendations.push(
      'Add Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy headers to enable multi-threading (2-4x faster)'
    );
  }

  if (availableStorage !== null && metadata.fileSize > availableStorage) {
    warnings.push(
      `Model file (${formatBytes(metadata.fileSize)}) exceeds available storage (${availableStorageHuman}). ` +
      'The model may not be cached after download.'
    );
    recommendations.push(
      'Free up browser storage or clear cached models to make room for this model'
    );
  }

  return {
    canRun,
    estimatedRAM,
    estimatedRAMHuman,
    deviceRAM: deviceRAMBytes,
    deviceRAMHuman,
    availableStorage,
    availableStorageHuman,
    needsCORS,
    hasCORS,
    estimatedSpeed: speed,
    warnings,
    recommendations,
  };
}

/**
 * Parse GGUF metadata and check browser compatibility in one call.
 *
 * Convenience function that combines {@link parseGGUFMetadata} and
 * {@link checkGGUFBrowserCompat}. This is the primary user-facing function
 * for the "can I run this model?" workflow.
 *
 * @param url - Full URL or HuggingFace shorthand (`repo/name:filename.gguf`)
 * @param options - Optional abort signal
 * @returns Compatibility assessment with parsed metadata attached
 *
 * @example
 * ```ts
 * import { checkGGUFBrowserCompatFromURL } from '@localmode/wllama';
 *
 * const result = await checkGGUFBrowserCompatFromURL(
 *   'bartowski/Llama-3.2-1B-Instruct-GGUF:Llama-3.2-1B-Instruct-Q4_K_M.gguf'
 * );
 *
 * console.log(result.canRun);           // true
 * console.log(result.estimatedSpeed);   // '~15-30 tok/s multi-thread'
 * console.log(result.metadata.architecture); // 'llama'
 * console.log(result.metadata.quantization); // 'Q4_K_M'
 * ```
 */
export async function checkGGUFBrowserCompatFromURL(
  url: string,
  options?: { abortSignal?: AbortSignal }
): Promise<GGUFBrowserCompat & { metadata: GGUFMetadata }> {
  options?.abortSignal?.throwIfAborted();

  // Parse metadata via Range requests
  const metadata = await parseGGUFMetadata(url, options);

  options?.abortSignal?.throwIfAborted();

  // Check compatibility
  const compat = await checkGGUFBrowserCompat(metadata, options);

  return {
    ...compat,
    metadata,
  };
}
