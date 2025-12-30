/**
 * Capability Detection
 *
 * Comprehensive device and browser capability detection for ML workloads.
 *
 * @packageDocumentation
 */

import type {
  DeviceCapabilities,
  FeatureSupportResult,
  ModelSupportResult,
  ModelRequirements,
  FallbackRecommendation,
  BrowserRecommendation,
} from './types.js';
import {
  isWebGPUSupported,
  isWebNNSupported,
  isWASMSupported,
  isWASMSIMDSupported,
  isWASMThreadsSupported,
  isIndexedDBSupported,
  isOPFSSupported,
  isWebWorkersSupported,
  isSharedArrayBufferSupported,
  isCrossOriginIsolated,
  isServiceWorkerSupported,
  isBroadcastChannelSupported,
  isWebLocksSupported,
} from './features.js';
import {
  detectBrowser,
  detectOS,
  detectDeviceType,
  getHardwareConcurrency,
  getStorageEstimate,
  detectGPU,
} from './device.js';

// ============================================================================
// Comprehensive Capability Detection
// ============================================================================

/**
 * Detect all device and browser capabilities.
 *
 * @returns Comprehensive capability information
 *
 * @example
 * ```typescript
 * import { detectCapabilities } from '@localmode/core';
 *
 * const caps = await detectCapabilities();
 *
 * console.log('Browser:', caps.browser.name, caps.browser.version);
 * console.log('Device:', caps.device.type, caps.device.os);
 * console.log('WebGPU:', caps.features.webgpu);
 * console.log('Storage available:', caps.storage.availableBytes);
 * ```
 */
export async function detectCapabilities(): Promise<DeviceCapabilities> {
  const browser = detectBrowser();
  const os = detectOS();
  const deviceType = detectDeviceType();
  const gpu = detectGPU();
  const storage = await getStorageEstimate();
  const webgpu = await isWebGPUSupported();

  return {
    browser,
    device: {
      type: deviceType,
      os: os.name,
      osVersion: os.version,
    },
    hardware: {
      cores: getHardwareConcurrency(),
      memory: typeof navigator !== 'undefined' ? (navigator as any).deviceMemory : undefined,
      gpu: gpu?.renderer,
    },
    features: {
      webgpu,
      webnn: isWebNNSupported(),
      wasm: isWASMSupported(),
      simd: isWASMSIMDSupported(),
      threads: isWASMThreadsSupported(),
      indexeddb: isIndexedDBSupported(),
      opfs: isOPFSSupported(),
      webworkers: isWebWorkersSupported(),
      sharedarraybuffer: isSharedArrayBufferSupported(),
      crossOriginisolated: isCrossOriginIsolated(),
      serviceworker: isServiceWorkerSupported(),
      broadcastchannel: isBroadcastChannelSupported(),
      weblocks: isWebLocksSupported(),
    },
    storage: {
      quotaBytes: storage?.quota ?? 0,
      usedBytes: storage?.usage ?? 0,
      availableBytes: (storage?.quota ?? 0) - (storage?.usage ?? 0),
      isPersisted: storage?.persisted ?? false,
    },
  };
}

// ============================================================================
// Feature Support Checking
// ============================================================================

/**
 * Check if a specific feature is supported with recommendations.
 *
 * @param feature - Feature name to check
 * @returns Feature support result with fallbacks
 *
 * @example
 * ```typescript
 * import { checkFeatureSupport } from '@localmode/core';
 *
 * const result = await checkFeatureSupport('webgpu');
 * if (!result.supported) {
 *   console.log('WebGPU not supported:', result.reason);
 *   console.log('Fallbacks:', result.fallbacks);
 * }
 * ```
 */
export async function checkFeatureSupport(
  feature:
    | 'webgpu'
    | 'webnn'
    | 'wasm'
    | 'simd'
    | 'threads'
    | 'indexeddb'
    | 'sharedarraybuffer'
    | 'opfs'
    | 'serviceworker'
): Promise<FeatureSupportResult> {
  const featureChecks: Record<string, () => Promise<boolean> | boolean> = {
    webgpu: isWebGPUSupported,
    webnn: isWebNNSupported,
    wasm: isWASMSupported,
    simd: isWASMSIMDSupported,
    threads: isWASMThreadsSupported,
    indexeddb: isIndexedDBSupported,
    sharedarraybuffer: isSharedArrayBufferSupported,
    opfs: isOPFSSupported,
    serviceworker: isServiceWorkerSupported,
  };

  const check = featureChecks[feature];
  if (!check) {
    return { supported: false, reason: `Unknown feature: ${feature}` };
  }

  const supported = await check();

  if (supported) {
    return { supported: true };
  }

  // Provide specific recommendations based on feature
  return getFeatureRecommendations(feature);
}

/**
 * Get recommendations for unsupported features.
 */
function getFeatureRecommendations(feature: string): FeatureSupportResult {
  const recommendations: Record<string, FeatureSupportResult> = {
    webgpu: {
      supported: false,
      reason: 'WebGPU is not available in this browser',
      fallbacks: [
        {
          feature: 'webgpu',
          alternative: 'wasm',
          reason: 'WebAssembly is widely supported',
          tradeoffs: ['2-5x slower inference', 'Higher CPU usage'],
        },
      ],
      browserRecommendations: [
        { browser: 'Chrome', minVersion: '113', features: ['WebGPU'] },
        { browser: 'Edge', minVersion: '113', features: ['WebGPU'] },
        {
          browser: 'Firefox',
          minVersion: '118',
          features: ['WebGPU'],
          note: 'Behind flag in about:config',
        },
        { browser: 'Safari', minVersion: '18', features: ['WebGPU'], note: 'macOS 15+ / iOS 18+' },
      ],
    },
    webnn: {
      supported: false,
      reason: 'WebNN is not available in this browser',
      fallbacks: [
        {
          feature: 'webnn',
          alternative: 'webgpu',
          reason: 'WebGPU provides GPU acceleration',
          tradeoffs: ['May have higher overhead'],
        },
        {
          feature: 'webnn',
          alternative: 'wasm',
          reason: 'WebAssembly is widely supported',
          tradeoffs: ['No hardware acceleration'],
        },
      ],
      browserRecommendations: [
        {
          browser: 'Chrome',
          minVersion: '119',
          features: ['WebNN'],
          note: 'Behind flag, limited support',
        },
      ],
    },
    sharedarraybuffer: {
      supported: false,
      reason: isCrossOriginIsolated()
        ? 'SharedArrayBuffer not available'
        : 'Cross-origin isolation headers not set',
      fallbacks: [
        {
          feature: 'sharedarraybuffer',
          alternative: 'single-threaded',
          reason: 'Run without multi-threading',
          tradeoffs: ['Slower processing', 'May block UI during heavy operations'],
        },
      ],
      browserRecommendations: [
        {
          browser: 'All',
          minVersion: 'N/A',
          features: ['SharedArrayBuffer'],
          note:
            'Requires headers: Cross-Origin-Opener-Policy: same-origin, Cross-Origin-Embedder-Policy: require-corp',
        },
      ],
    },
    indexeddb: {
      supported: false,
      reason: 'IndexedDB is not available (possibly private browsing mode)',
      fallbacks: [
        {
          feature: 'indexeddb',
          alternative: 'memory',
          reason: 'In-memory storage for session',
          tradeoffs: ['Data not persisted', 'Lost on page refresh'],
        },
      ],
    },
    wasm: {
      supported: false,
      reason: 'WebAssembly is not supported in this browser',
      browserRecommendations: [
        { browser: 'Chrome', minVersion: '57', features: ['WebAssembly'] },
        { browser: 'Firefox', minVersion: '52', features: ['WebAssembly'] },
        { browser: 'Safari', minVersion: '11', features: ['WebAssembly'] },
        { browser: 'Edge', minVersion: '16', features: ['WebAssembly'] },
      ],
    },
    simd: {
      supported: false,
      reason: 'WebAssembly SIMD is not supported',
      fallbacks: [
        {
          feature: 'simd',
          alternative: 'scalar',
          reason: 'Fall back to scalar operations',
          tradeoffs: ['2-4x slower for vector operations'],
        },
      ],
      browserRecommendations: [
        { browser: 'Chrome', minVersion: '91', features: ['WASM SIMD'] },
        { browser: 'Firefox', minVersion: '89', features: ['WASM SIMD'] },
        { browser: 'Safari', minVersion: '16.4', features: ['WASM SIMD'] },
      ],
    },
    threads: {
      supported: false,
      reason: 'WebAssembly threads are not supported',
      fallbacks: [
        {
          feature: 'threads',
          alternative: 'single-threaded',
          reason: 'Run without multi-threading',
          tradeoffs: ['Cannot utilize multiple CPU cores'],
        },
      ],
    },
    opfs: {
      supported: false,
      reason: 'Origin Private File System is not available',
      fallbacks: [
        {
          feature: 'opfs',
          alternative: 'indexeddb',
          reason: 'Use IndexedDB for storage',
          tradeoffs: ['Slower for large files', 'Less efficient binary storage'],
        },
      ],
    },
    serviceworker: {
      supported: false,
      reason: 'Service Workers are not available',
      fallbacks: [
        {
          feature: 'serviceworker',
          alternative: 'none',
          reason: 'Operate without offline caching',
          tradeoffs: ['No offline support', 'Models must be re-downloaded'],
        },
      ],
    },
  };

  return recommendations[feature] ?? { supported: false, reason: `Feature not supported: ${feature}` };
}

// ============================================================================
// Model Support Checking
// ============================================================================

/**
 * Check if a model can run on this device.
 *
 * @param requirements - Model requirements
 * @returns Model support result with recommendations
 *
 * @example
 * ```typescript
 * import { checkModelSupport } from '@localmode/core';
 *
 * const result = await checkModelSupport({
 *   modelId: 'Xenova/whisper-large-v3',
 *   estimatedMemory: 3_000_000_000, // 3GB
 *   estimatedStorage: 1_500_000_000, // 1.5GB
 * });
 *
 * if (!result.supported) {
 *   console.log('Model not supported:', result.reason);
 *   console.log('Try these instead:', result.fallbackModels);
 * }
 * ```
 */
export async function checkModelSupport(
  requirements: ModelRequirements
): Promise<ModelSupportResult> {
  const caps = await detectCapabilities();

  // Check storage
  const storageAvailable = caps.storage.availableBytes;
  if (requirements.estimatedStorage > storageAvailable) {
    return {
      supported: false,
      reason: `Insufficient storage. Required: ${formatBytes(requirements.estimatedStorage)}, Available: ${formatBytes(storageAvailable)}`,
      memoryRequired: requirements.estimatedMemory,
      storageRequired: requirements.estimatedStorage,
      storageAvailable,
      recommendedDevice: 'wasm',
      fallbackModels: getModelFallbacks(requirements.modelId),
    };
  }

  // Check memory (if available)
  const memoryAvailable = caps.hardware.memory
    ? caps.hardware.memory * 1024 * 1024 * 1024
    : undefined;

  if (memoryAvailable && requirements.estimatedMemory > memoryAvailable * 0.7) {
    return {
      supported: false,
      reason: `Insufficient memory. Required: ${formatBytes(requirements.estimatedMemory)}, Available: ~${formatBytes(memoryAvailable)}`,
      memoryRequired: requirements.estimatedMemory,
      memoryAvailable,
      storageRequired: requirements.estimatedStorage,
      storageAvailable,
      recommendedDevice: 'wasm',
      fallbackModels: getModelFallbacks(requirements.modelId),
    };
  }

  // Check CPU cores for large models
  if (requirements.minCores && caps.hardware.cores < requirements.minCores) {
    return {
      supported: false,
      reason: `Insufficient CPU cores. Required: ${requirements.minCores}, Available: ${caps.hardware.cores}`,
      memoryRequired: requirements.estimatedMemory,
      memoryAvailable,
      storageRequired: requirements.estimatedStorage,
      storageAvailable,
      recommendedDevice: 'wasm',
      fallbackModels: getModelFallbacks(requirements.modelId),
    };
  }

  // Determine recommended device
  let recommendedDevice: 'webgpu' | 'wasm' | 'cpu' = 'wasm';

  if (requirements.prefersWebGPU !== false && caps.features.webgpu) {
    recommendedDevice = 'webgpu';
  } else if (caps.features.wasm) {
    recommendedDevice = 'wasm';
  } else {
    recommendedDevice = 'cpu';
  }

  return {
    supported: true,
    memoryRequired: requirements.estimatedMemory,
    memoryAvailable,
    storageRequired: requirements.estimatedStorage,
    storageAvailable,
    recommendedDevice,
  };
}

// ============================================================================
// Fallback Recommendations
// ============================================================================

/**
 * Built-in model fallback registry.
 */
const MODEL_FALLBACKS: Record<string, Array<{ modelId: string; memoryRequired: number; reason: string }>> = {
  // Whisper models
  'Xenova/whisper-large-v3': [
    { modelId: 'Xenova/whisper-medium', memoryRequired: 1500, reason: 'Better accuracy than small' },
    { modelId: 'Xenova/whisper-small', memoryRequired: 500, reason: 'Good balance of speed and accuracy' },
    { modelId: 'Xenova/whisper-tiny', memoryRequired: 150, reason: 'Fastest, suitable for real-time' },
  ],
  'Xenova/whisper-medium': [
    { modelId: 'Xenova/whisper-small', memoryRequired: 500, reason: 'Smaller with good accuracy' },
    { modelId: 'Xenova/whisper-tiny', memoryRequired: 150, reason: 'Fastest option' },
  ],
  // Embedding models
  'Xenova/all-mpnet-base-v2': [
    { modelId: 'Xenova/all-MiniLM-L6-v2', memoryRequired: 90, reason: 'Smaller with good quality' },
    { modelId: 'Xenova/paraphrase-MiniLM-L3-v2', memoryRequired: 60, reason: 'Fastest embedding model' },
  ],
  // LLMs
  'Llama-3.2-3B-Instruct-q4f16': [
    { modelId: 'Llama-3.2-1B-Instruct-q4f16', memoryRequired: 800, reason: 'Smaller but capable' },
    { modelId: 'SmolLM2-360M-Instruct-q4f16', memoryRequired: 300, reason: 'Very small, basic tasks' },
  ],
};

/**
 * Get fallback models for a given model.
 */
function getModelFallbacks(
  modelId: string
): Array<{ modelId: string; memoryRequired: number; reason: string }> {
  return MODEL_FALLBACKS[modelId] ?? [];
}

/**
 * Get recommended fallbacks for unsupported features.
 *
 * @param features - List of unsupported features
 * @returns List of fallback recommendations
 */
export function getRecommendedFallbacks(features: string[]): FallbackRecommendation[] {
  const fallbacks: FallbackRecommendation[] = [];

  for (const feature of features) {
    const result = getFeatureRecommendations(feature);
    if (result.fallbacks) {
      fallbacks.push(...result.fallbacks);
    }
  }

  return fallbacks;
}

/**
 * Get browser recommendations for optimal feature support.
 *
 * @param options - Options for recommendations
 * @returns List of browser recommendations
 */
export async function getBrowserRecommendations(options: {
  features: string[];
}): Promise<BrowserRecommendation[]> {
  const allRecommendations: BrowserRecommendation[] = [];

  for (const feature of options.features) {
    const result = await checkFeatureSupport(feature as any);
    if (result.browserRecommendations) {
      allRecommendations.push(...result.browserRecommendations);
    }
  }

  // Deduplicate by browser
  const byBrowser = new Map<string, BrowserRecommendation>();

  for (const rec of allRecommendations) {
    const existing = byBrowser.get(rec.browser);
    if (existing) {
      // Merge features
      const features = new Set([...existing.features, ...rec.features]);
      existing.features = Array.from(features);
      // Keep higher version
      if (rec.minVersion > existing.minVersion) {
        existing.minVersion = rec.minVersion;
      }
      // Append notes
      if (rec.note && !existing.note?.includes(rec.note)) {
        existing.note = existing.note ? `${existing.note}; ${rec.note}` : rec.note;
      }
    } else {
      byBrowser.set(rec.browser, { ...rec });
    }
  }

  return Array.from(byBrowser.values());
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format bytes as human-readable string.
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

