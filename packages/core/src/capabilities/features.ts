/**
 * Feature Detection Utilities
 *
 * Detect browser and device feature support for ML workloads.
 *
 * @packageDocumentation
 */

// ============================================================================
// Core Feature Detection
// ============================================================================

/**
 * Check if WebGPU is supported.
 *
 * @returns Promise resolving to true if WebGPU is available
 */
export async function isWebGPUSupported(): Promise<boolean> {
  if (typeof navigator === 'undefined') return false;
  if (!('gpu' in navigator)) return false;

  try {
    const adapter = await (navigator as any).gpu?.requestAdapter();
    return !!adapter;
  } catch {
    return false;
  }
}

/**
 * Check if WebNN is supported.
 *
 * @returns true if WebNN is available
 */
export function isWebNNSupported(): boolean {
  if (typeof navigator === 'undefined') return false;
  return 'ml' in navigator;
}

/**
 * Check if WebAssembly is supported.
 *
 * @returns true if WASM is available
 */
export function isWASMSupported(): boolean {
  try {
    if (typeof WebAssembly === 'object') {
      // Test instantiation
      if (typeof WebAssembly.instantiate === 'function') {
        const module = new WebAssembly.Module(
          Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00)
        );
        if (module instanceof WebAssembly.Module) {
          const instance = new WebAssembly.Instance(module);
          return instance instanceof WebAssembly.Instance;
        }
      }
    }
  } catch {
    // WASM not supported
  }
  return false;
}

/**
 * Check if WASM SIMD is supported.
 *
 * @returns true if WASM SIMD is available
 */
export function isWASMSIMDSupported(): boolean {
  try {
    // SIMD detection via feature detection
    // This is a minimal SIMD module
    const simdModule = new Uint8Array([
      0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x05, 0x01, 0x60,
      0x00, 0x01, 0x7b, 0x03, 0x02, 0x01, 0x00, 0x0a, 0x0a, 0x01, 0x08, 0x00,
      0x41, 0x00, 0xfd, 0x0f, 0x00, 0x00, 0x0b,
    ]);
    new WebAssembly.Module(simdModule);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if WASM threads are supported.
 *
 * @returns true if WASM threads are available
 */
export function isWASMThreadsSupported(): boolean {
  try {
    // Threads require SharedArrayBuffer
    if (typeof SharedArrayBuffer === 'undefined') return false;

    // Test for atomics
    if (typeof Atomics === 'undefined') return false;

    // Test for WASM threads support
    const threadsModule = new Uint8Array([
      0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x04, 0x01, 0x60,
      0x00, 0x00, 0x03, 0x02, 0x01, 0x00, 0x05, 0x04, 0x01, 0x03, 0x01, 0x01,
      0x0a, 0x0b, 0x01, 0x09, 0x00, 0x41, 0x00, 0xfe, 0x10, 0x02, 0x00, 0x1a,
      0x0b,
    ]);
    new WebAssembly.Module(threadsModule);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if IndexedDB is supported.
 *
 * @returns true if IndexedDB is available
 */
export function isIndexedDBSupported(): boolean {
  try {
    return typeof indexedDB !== 'undefined';
  } catch {
    return false;
  }
}

/**
 * Check if Web Workers are supported.
 *
 * @returns true if Web Workers are available
 */
export function isWebWorkersSupported(): boolean {
  return typeof Worker !== 'undefined';
}

/**
 * Check if SharedArrayBuffer is supported.
 *
 * @returns true if SharedArrayBuffer is available
 */
export function isSharedArrayBufferSupported(): boolean {
  return typeof SharedArrayBuffer !== 'undefined';
}

/**
 * Check if the page is cross-origin isolated.
 *
 * Required for SharedArrayBuffer in modern browsers.
 *
 * @returns true if cross-origin isolated
 */
export function isCrossOriginIsolated(): boolean {
  return typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated;
}

/**
 * Check if Origin Private File System is supported.
 *
 * @returns true if OPFS is available
 */
export function isOPFSSupported(): boolean {
  return typeof navigator !== 'undefined' && 'storage' in navigator;
}

/**
 * Check if BroadcastChannel is supported.
 *
 * @returns true if BroadcastChannel is available
 */
export function isBroadcastChannelSupported(): boolean {
  return typeof BroadcastChannel !== 'undefined';
}

/**
 * Check if Web Locks API is supported.
 *
 * @returns true if Web Locks are available
 */
export function isWebLocksSupported(): boolean {
  return typeof navigator !== 'undefined' && 'locks' in navigator;
}

/**
 * Check if Service Workers are supported.
 *
 * @returns true if Service Workers are available
 */
export function isServiceWorkerSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
}

/**
 * Check if Web Crypto API is supported.
 *
 * @returns true if Web Crypto is available
 */
export function isWebCryptoSupported(): boolean {
  return typeof crypto !== 'undefined' && 'subtle' in crypto;
}

// ============================================================================
// Feature Object (Quick Access)
// ============================================================================

/**
 * Quick access to all feature detection results.
 *
 * Note: WebGPU detection is async and not included here.
 * Use isWebGPUSupported() for async detection.
 */
export const features = {
  get wasm() {
    return isWASMSupported();
  },
  get simd() {
    return isWASMSIMDSupported();
  },
  get threads() {
    return isWASMThreadsSupported();
  },
  get indexeddb() {
    return isIndexedDBSupported();
  },
  get webworkers() {
    return isWebWorkersSupported();
  },
  get sharedarraybuffer() {
    return isSharedArrayBufferSupported();
  },
  get crossOriginisolated() {
    return isCrossOriginIsolated();
  },
  get opfs() {
    return isOPFSSupported();
  },
  get broadcastchannel() {
    return isBroadcastChannelSupported();
  },
  get weblocks() {
    return isWebLocksSupported();
  },
  get serviceworker() {
    return isServiceWorkerSupported();
  },
  get webcrypto() {
    return isWebCryptoSupported();
  },
  get webnn() {
    return isWebNNSupported();
  },
} as const;

/**
 * Runtime environment detection.
 */
export const runtime = {
  get isBrowser() {
    return typeof window !== 'undefined' && typeof document !== 'undefined';
  },
  get isNode() {
    return typeof process !== 'undefined' && process.versions?.node !== undefined;
  },
  get isElectron() {
    return typeof process !== 'undefined' && process.versions?.electron !== undefined;
  },
  get isWebWorker() {
    return typeof self !== 'undefined' && typeof (self as any).WorkerGlobalScope !== 'undefined';
  },
  get isServiceWorker() {
    return typeof ServiceWorkerGlobalScope !== 'undefined';
  },
  get isDeno() {
    return typeof (globalThis as any).Deno !== 'undefined';
  },
  get isBun() {
    return typeof (globalThis as any).Bun !== 'undefined';
  },
} as const;

