/**
 * Capability Detection Module
 *
 * Comprehensive browser and device capability detection for ML workloads.
 *
 * @packageDocumentation
 */

// Export types
export * from './types.js';

// Export feature detection
export {
  isWebGPUSupported,
  isWebNNSupported,
  isWASMSupported,
  isWASMSIMDSupported,
  isWASMThreadsSupported,
  isIndexedDBSupported,
  isWebWorkersSupported,
  isSharedArrayBufferSupported,
  isCrossOriginIsolated,
  isOPFSSupported,
  isBroadcastChannelSupported,
  isWebLocksSupported,
  isServiceWorkerSupported,
  isWebCryptoSupported,
  features,
  runtime,
} from './features.js';

// Export device detection
export {
  getDeviceInfo,
  getMemoryInfo,
  getHardwareConcurrency,
  getStorageEstimate,
  detectBrowser,
  detectOS,
  detectDeviceType,
  detectGPU,
} from './device.js';

// Export capability detection
export {
  detectCapabilities,
  checkFeatureSupport,
  checkModelSupport,
  getRecommendedFallbacks,
  getBrowserRecommendations,
} from './detect.js';

// Export report generation
export { createCapabilityReport, formatCapabilityReport } from './report.js';

