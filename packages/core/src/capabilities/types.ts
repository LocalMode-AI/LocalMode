/**
 * Capability Detection Types
 *
 * Type definitions for device capability detection and feature support.
 *
 * @packageDocumentation
 */

// ============================================================================
// Device Capabilities
// ============================================================================

/**
 * Comprehensive device and browser capabilities.
 */
export interface DeviceCapabilities {
  /** Browser information */
  browser: {
    name: string;
    version: string;
    engine: string;
  };

  /** Device information */
  device: {
    type: 'desktop' | 'mobile' | 'tablet' | 'unknown';
    os: string;
    osVersion: string;
  };

  /** Hardware information */
  hardware: {
    /** Number of logical CPU cores */
    cores: number;
    /** Device memory in GB (if available) */
    memory?: number;
    /** GPU info (if available) */
    gpu?: string;
  };

  /** Feature availability */
  features: {
    webgpu: boolean;
    webnn: boolean;
    wasm: boolean;
    simd: boolean;
    threads: boolean;
    indexeddb: boolean;
    opfs: boolean;
    webworkers: boolean;
    sharedarraybuffer: boolean;
    crossOriginisolated: boolean;
    serviceworker: boolean;
    broadcastchannel: boolean;
    weblocks: boolean;
  };

  /** Storage information */
  storage: {
    quotaBytes: number;
    usedBytes: number;
    availableBytes: number;
    isPersisted: boolean;
  };
}

// ============================================================================
// Feature Support
// ============================================================================

/**
 * Result of checking feature support.
 */
export interface FeatureSupportResult {
  /** Whether the feature is supported */
  supported: boolean;

  /** Reason for lack of support (if not supported) */
  reason?: string;

  /** Recommended fallbacks */
  fallbacks?: FallbackRecommendation[];

  /** Browser recommendations for this feature */
  browserRecommendations?: BrowserRecommendation[];
}

/**
 * Fallback recommendation when a feature is not supported.
 */
export interface FallbackRecommendation {
  /** Feature this is a fallback for */
  feature: string;

  /** Alternative approach */
  alternative: string;

  /** Why this is recommended */
  reason: string;

  /** Tradeoffs of using this fallback */
  tradeoffs: string[];
}

/**
 * Browser recommendation for optimal support.
 */
export interface BrowserRecommendation {
  /** Browser name */
  browser: string;

  /** Minimum version required */
  minVersion: string;

  /** Features supported */
  features: string[];

  /** Additional notes */
  note?: string;
}

// ============================================================================
// Model Support
// ============================================================================

/**
 * Result of checking model support.
 */
export interface ModelSupportResult {
  /** Whether the model can run on this device */
  supported: boolean;

  /** Reason for lack of support (if not supported) */
  reason?: string;

  /** Memory required by the model in bytes */
  memoryRequired: number;

  /** Available memory in bytes (if detectable) */
  memoryAvailable?: number;

  /** Storage required by the model in bytes */
  storageRequired: number;

  /** Available storage in bytes */
  storageAvailable: number;

  /** Recommended inference device */
  recommendedDevice: 'webgpu' | 'wasm' | 'cpu';

  /** Alternative models that would work better */
  fallbackModels?: ModelFallback[];

  /** Browser recommendations for this model */
  browserRecommendations?: BrowserRecommendation[];
}

/**
 * Model fallback recommendation.
 */
export interface ModelFallback {
  /** Model identifier */
  modelId: string;

  /** Why this is recommended */
  reason: string;

  /** Memory required in MB */
  memoryRequired: number;
}

/**
 * Model requirements for support checking.
 */
export interface ModelRequirements {
  /** Model identifier */
  modelId: string;

  /** Estimated memory requirement in bytes */
  estimatedMemory: number;

  /** Estimated storage requirement in bytes */
  estimatedStorage: number;

  /** Whether WebGPU is preferred */
  prefersWebGPU?: boolean;

  /** Minimum CPU cores recommended */
  minCores?: number;
}

// ============================================================================
// Capability Report
// ============================================================================

/**
 * Comprehensive capability report.
 */
export interface CapabilityReport {
  /** Timestamp of the report */
  timestamp: Date;

  /** Device capabilities */
  capabilities: DeviceCapabilities;

  /** Summary scores */
  scores: {
    /** Overall ML readiness (0-100) */
    mlReadiness: number;
    /** Storage capacity score (0-100) */
    storageCapacity: number;
    /** Performance potential (0-100) */
    performancePotential: number;
  };

  /** Key recommendations */
  recommendations: string[];

  /** Detected issues */
  issues: Array<{
    severity: 'error' | 'warning' | 'info';
    message: string;
    suggestion?: string;
  }>;
}

// ============================================================================
// Memory Information
// ============================================================================

/**
 * Memory information from the browser.
 */
export interface MemoryInfo {
  /** Total JS heap size in bytes (Chrome only) */
  totalJSHeapSize?: number;

  /** Used JS heap size in bytes (Chrome only) */
  usedJSHeapSize?: number;

  /** JS heap size limit in bytes (Chrome only) */
  jsHeapSizeLimit?: number;

  /** Device memory in GB (if available) */
  deviceMemory?: number;
}

/**
 * Device information.
 */
export interface DeviceInfo {
  /** User agent string */
  userAgent: string;

  /** Platform string */
  platform: string;

  /** Number of logical CPU cores */
  hardwareConcurrency: number;

  /** Device memory in GB (if available) */
  deviceMemory?: number;

  /** Maximum touch points (indicates touch device) */
  maxTouchPoints: number;
}

