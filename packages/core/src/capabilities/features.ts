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
// Live Transcribe / Audio Capture Detection
// ============================================================================

/**
 * Check if `AudioWorklet` (low-latency audio processing) is supported.
 *
 * AudioWorklet allows VAD and audio framing to run on the audio rendering
 * thread instead of the main thread. Without it, `live-transcribe` falls
 * back to the deprecated `ScriptProcessorNode`.
 *
 * @returns true if AudioWorklet is available
 */
export function isAudioWorkletSupported(): boolean {
  if (typeof globalThis === 'undefined') return false;
  const Ctx =
    (globalThis as { AudioContext?: typeof AudioContext }).AudioContext ??
    (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return false;
  try {
    return 'audioWorklet' in Ctx.prototype;
  } catch {
    return false;
  }
}

/**
 * Check if `navigator.mediaDevices.getUserMedia` (microphone capture) is supported.
 *
 * Requires a secure context (HTTPS or `localhost`) in modern browsers.
 *
 * @returns true if media capture is available
 */
export function isMediaCaptureSupported(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (typeof navigator.mediaDevices === 'undefined') return false;
  return typeof navigator.mediaDevices.getUserMedia === 'function';
}

/**
 * Check if {@link createLiveTranscriber} can construct a controller in the
 * current runtime.
 *
 * Live transcription requires `getUserMedia` and an `AudioContext`. The
 * worklet path is preferred but a `ScriptProcessorNode` fallback is used
 * when `AudioWorklet` is unavailable, so the live-transcribe capability
 * is satisfied as long as media capture and AudioContext are present.
 *
 * @returns true if live transcription is supported
 */
export function isLiveTranscribeSupported(): boolean {
  if (!isMediaCaptureSupported()) return false;
  if (typeof globalThis === 'undefined') return false;
  const Ctx =
    (globalThis as { AudioContext?: typeof AudioContext }).AudioContext ??
    (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return typeof Ctx === 'function';
}

// ============================================================================
// Chrome Built-in AI Detection
// ============================================================================

/**
 * Check if Chrome Built-in AI is supported.
 *
 * @returns true if Chrome AI APIs are available
 */
export function isChromeAISupported(): boolean {
  return typeof self !== 'undefined' && 'ai' in self;
}

/**
 * Check if Chrome AI Summarizer API is supported.
 *
 * @returns true if the Summarizer API is available
 */
export function isSummarizerAPISupported(): boolean {
  if (!isChromeAISupported()) return false;
  return 'summarizer' in (self as any).ai;
}

/**
 * Check if Chrome AI Translator API is supported.
 *
 * @returns true if the Translator API is available
 */
export function isTranslatorAPISupported(): boolean {
  if (!isChromeAISupported()) return false;
  return 'translator' in (self as any).ai;
}

/**
 * Check if Chrome AI Language Model (Prompt) API is supported.
 *
 * @returns true if the Language Model API is available
 */
export function isLanguageModelAPISupported(): boolean {
  if (!isChromeAISupported()) return false;
  return 'languageModel' in (self as any).ai;
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
  get chromeAI() {
    return isChromeAISupported();
  },
  get chromeAISummarizer() {
    return isSummarizerAPISupported();
  },
  get chromeAITranslator() {
    return isTranslatorAPISupported();
  },
  get chromeAILanguageModel() {
    return isLanguageModelAPISupported();
  },
  get audioWorklet() {
    return isAudioWorkletSupported();
  },
  get mediaCapture() {
    return isMediaCaptureSupported();
  },
  get liveTranscribe() {
    return isLiveTranscribeSupported();
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

