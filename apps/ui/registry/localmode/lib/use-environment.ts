/**
 * Copy-owned environment hooks for LocalMode UI components. These read only
 * browser APIs (`navigator`, `navigator.storage`, `navigator.onLine`,
 * WebAssembly/WebGL feature detection) — no AI, no `@localmode/*` dependency —
 * so the environment-aware components install and compile in any React app.
 *
 * Ported from `@localmode/react` (`useCapabilities`, `useStorageQuota`,
 * `useNetworkStatus`) and the `@localmode/core` detection helpers they call
 * (`detectCapabilities`, `getStorageQuota`). Behavior matches the originals,
 * plus a copy-owned extension: `features.camera` / `features.microphone`
 * media-input AVAILABILITY detection (secure context + `getUserMedia` present
 * + `enumerateDevices()` reports a device of that kind — never prompts).
 * Runtime permission state is deliberately NOT part of the detection; permission
 * prompts and denial handling belong to the consuming surface.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

const IS_SERVER = typeof window === 'undefined';

// ============================================================================
// Types (mirror @localmode/core DeviceCapabilities / StorageQuota)
// ============================================================================

/** Comprehensive device + browser capability information. */
export interface DeviceCapabilities {
  browser: { name: string; version: string; engine: string };
  device: { type: 'desktop' | 'mobile' | 'tablet' | 'unknown'; os: string; osVersion: string };
  hardware: { cores: number; memory?: number; gpu?: string };
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
    chromeAI: boolean;
    chromeAISummarizer: boolean;
    chromeAITranslator: boolean;
    /** A video-input device is available (availability only — never prompts). */
    camera: boolean;
    /** An audio-input device is available (availability only — never prompts). */
    microphone: boolean;
  };
  storage: { quotaBytes: number; usedBytes: number; availableBytes: number; isPersisted: boolean };
}

/** Browser storage quota snapshot. */
export interface StorageQuota {
  usedBytes: number;
  quotaBytes: number;
  /** Percentage of quota used (0–100). */
  percentUsed: number;
  isPersisted: boolean;
  availableBytes: number;
}

// ============================================================================
// Feature detection (navigator / WebAssembly / WebGL — no AI)
// ============================================================================

async function isWebGPUSupported(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('gpu' in navigator)) return false;
  try {
    const adapter = await (navigator as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu?.requestAdapter();
    return !!adapter;
  } catch {
    return false;
  }
}

function isWebNNSupported(): boolean {
  return typeof navigator !== 'undefined' && 'ml' in navigator;
}

function isWASMSupported(): boolean {
  try {
    if (typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function') {
      const module = new WebAssembly.Module(
        Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00)
      );
      if (module instanceof WebAssembly.Module) {
        return new WebAssembly.Instance(module) instanceof WebAssembly.Instance;
      }
    }
  } catch {
    /* unsupported */
  }
  return false;
}

function isWASMSIMDSupported(): boolean {
  try {
    new WebAssembly.Module(
      new Uint8Array([
        0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b,
        0x03, 0x02, 0x01, 0x00, 0x0a, 0x0a, 0x01, 0x08, 0x00, 0x41, 0x00, 0xfd, 0x0f, 0x00, 0x00,
        0x0b,
      ])
    );
    return true;
  } catch {
    return false;
  }
}

function isWASMThreadsSupported(): boolean {
  try {
    if (typeof SharedArrayBuffer === 'undefined' || typeof Atomics === 'undefined') return false;
    new WebAssembly.Module(
      new Uint8Array([
        0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x04, 0x01, 0x60, 0x00, 0x00, 0x03,
        0x02, 0x01, 0x00, 0x05, 0x04, 0x01, 0x03, 0x01, 0x01, 0x0a, 0x0b, 0x01, 0x09, 0x00, 0x41,
        0x00, 0xfe, 0x10, 0x02, 0x00, 0x1a, 0x0b,
      ])
    );
    return true;
  } catch {
    return false;
  }
}

function isIndexedDBSupported(): boolean {
  try {
    return typeof indexedDB !== 'undefined';
  } catch {
    return false;
  }
}

function isOPFSSupported(): boolean {
  return typeof navigator !== 'undefined' && 'storage' in navigator;
}

function isWebWorkersSupported(): boolean {
  return typeof Worker !== 'undefined';
}

function isSharedArrayBufferSupported(): boolean {
  return typeof SharedArrayBuffer !== 'undefined';
}

function isCrossOriginIsolated(): boolean {
  return typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated;
}

function isServiceWorkerSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
}

function isBroadcastChannelSupported(): boolean {
  return typeof BroadcastChannel !== 'undefined';
}

function isWebLocksSupported(): boolean {
  return typeof navigator !== 'undefined' && 'locks' in navigator;
}

/**
 * Media-input AVAILABILITY detection (camera / microphone). True when the page
 * is a secure context, `navigator.mediaDevices.getUserMedia` exists, and
 * `enumerateDevices()` reports at least one device of the corresponding kind.
 * `enumerateDevices()` never prompts (pre-permission it returns kind-only,
 * label-less entries), so this stays a passive availability check — runtime
 * permission state is deliberately NOT detected here.
 */
async function detectMediaInputs(): Promise<{ camera: boolean; microphone: boolean }> {
  const unavailable = { camera: false, microphone: false };
  if (
    typeof navigator === 'undefined' ||
    typeof navigator.mediaDevices?.getUserMedia !== 'function' ||
    typeof navigator.mediaDevices?.enumerateDevices !== 'function'
  ) {
    return unavailable;
  }
  if (typeof isSecureContext !== 'undefined' && !isSecureContext) return unavailable;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return {
      camera: devices.some((d) => d.kind === 'videoinput'),
      microphone: devices.some((d) => d.kind === 'audioinput'),
    };
  } catch {
    return unavailable;
  }
}

function isChromeAISupported(): boolean {
  return typeof self !== 'undefined' && 'ai' in self;
}

function isSummarizerAPISupported(): boolean {
  return isChromeAISupported() && 'summarizer' in (self as unknown as { ai: object }).ai;
}

function isTranslatorAPISupported(): boolean {
  return isChromeAISupported() && 'translator' in (self as unknown as { ai: object }).ai;
}

// ============================================================================
// Device detection (user-agent / WebGL — no AI)
// ============================================================================

function getHardwareConcurrency(): number {
  if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) {
    return navigator.hardwareConcurrency;
  }
  return 1;
}

function detectBrowser(): { name: string; version: string; engine: string } {
  if (typeof navigator === 'undefined') return { name: 'unknown', version: '0', engine: 'unknown' };
  const ua = navigator.userAgent;
  if (ua.includes('Chrome/') && !ua.includes('Edg/')) {
    return { name: 'Chrome', version: ua.match(/Chrome\/(\d+(?:\.\d+)*)/)?.[1] ?? 'unknown', engine: 'Blink' };
  }
  if (ua.includes('Edg/')) {
    return { name: 'Edge', version: ua.match(/Edg\/(\d+(?:\.\d+)*)/)?.[1] ?? 'unknown', engine: 'Blink' };
  }
  if (ua.includes('Firefox/')) {
    return { name: 'Firefox', version: ua.match(/Firefox\/(\d+(?:\.\d+)*)/)?.[1] ?? 'unknown', engine: 'Gecko' };
  }
  if (ua.includes('Safari/') && !ua.includes('Chrome')) {
    return { name: 'Safari', version: ua.match(/Version\/(\d+(?:\.\d+)*)/)?.[1] ?? 'unknown', engine: 'WebKit' };
  }
  return { name: 'unknown', version: '0', engine: 'unknown' };
}

function detectOS(): { name: string; version: string } {
  if (typeof navigator === 'undefined') return { name: 'unknown', version: '0' };
  const ua = navigator.userAgent;
  if (ua.includes('Windows')) {
    const nt = ua.match(/Windows NT (\d+(?:\.\d+)*)/)?.[1] ?? '10';
    return { name: 'Windows', version: nt === '10.0' ? '10/11' : nt };
  }
  if (ua.includes('Mac OS X')) {
    return { name: 'macOS', version: ua.match(/Mac OS X (\d+[._]\d+(?:[._]\d+)?)/)?.[1]?.replace(/_/g, '.') ?? 'unknown' };
  }
  if (ua.includes('iPhone') || ua.includes('iPad')) {
    return { name: 'iOS', version: ua.match(/OS (\d+[._]\d+(?:[._]\d+)?)/)?.[1]?.replace(/_/g, '.') ?? 'unknown' };
  }
  if (ua.includes('Android')) {
    return { name: 'Android', version: ua.match(/Android (\d+(?:\.\d+)*)/)?.[1] ?? 'unknown' };
  }
  if (ua.includes('Linux')) return { name: 'Linux', version: 'unknown' };
  return { name: 'unknown', version: '0' };
}

function detectDeviceType(): 'desktop' | 'mobile' | 'tablet' | 'unknown' {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent;
  if (ua.includes('iPad') || (ua.includes('Android') && !ua.includes('Mobile'))) return 'tablet';
  if (
    ua.includes('iPhone') || ua.includes('iPod') ||
    (ua.includes('Android') && ua.includes('Mobile')) ||
    ua.includes('webOS') || ua.includes('BlackBerry') || ua.includes('IEMobile') || ua.includes('Opera Mini')
  ) {
    return 'mobile';
  }
  if (navigator.maxTouchPoints > 0 && typeof screen !== 'undefined' && screen.width < 1024) return 'tablet';
  return 'desktop';
}

function detectGPU(): { vendor: string; renderer: string } | null {
  if (typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return null;
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) return null;
    return {
      vendor: gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) ?? 'unknown',
      renderer: gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) ?? 'unknown',
    };
  } catch {
    return null;
  }
}

async function getStorageEstimate(): Promise<{ quota: number; usage: number; persisted: boolean } | null> {
  if (typeof navigator === 'undefined' || !navigator.storage) return null;
  try {
    const [estimate, persisted] = await Promise.all([
      navigator.storage.estimate(),
      navigator.storage.persisted(),
    ]);
    return { quota: estimate.quota ?? 0, usage: estimate.usage ?? 0, persisted };
  } catch {
    return null;
  }
}

// ============================================================================
// Detection entry points
// ============================================================================

/** Detect all device + browser capabilities. */
export async function detectCapabilities(): Promise<DeviceCapabilities> {
  const storage = await getStorageEstimate();
  const webgpu = await isWebGPUSupported();
  const media = await detectMediaInputs();
  const gpu = detectGPU();
  const os = detectOS();
  return {
    browser: detectBrowser(),
    device: { type: detectDeviceType(), os: os.name, osVersion: os.version },
    hardware: {
      cores: getHardwareConcurrency(),
      memory: typeof navigator !== 'undefined' ? (navigator as { deviceMemory?: number }).deviceMemory : undefined,
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
      chromeAI: isChromeAISupported(),
      chromeAISummarizer: isSummarizerAPISupported(),
      chromeAITranslator: isTranslatorAPISupported(),
      camera: media.camera,
      microphone: media.microphone,
    },
    storage: {
      quotaBytes: storage?.quota ?? 0,
      usedBytes: storage?.usage ?? 0,
      availableBytes: (storage?.quota ?? 0) - (storage?.usage ?? 0),
      isPersisted: storage?.persisted ?? false,
    },
  };
}

/** Query the browser storage quota; returns null when unavailable. */
export async function getStorageQuota(): Promise<StorageQuota | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
  try {
    const estimate = await navigator.storage.estimate();
    const persisted = (await navigator.storage.persisted?.()) ?? false;
    const usedBytes = estimate.usage ?? 0;
    const quotaBytes = estimate.quota ?? 0;
    return {
      usedBytes,
      quotaBytes,
      percentUsed: quotaBytes > 0 ? (usedBytes / quotaBytes) * 100 : 0,
      isPersisted: persisted,
      availableBytes: Math.max(0, quotaBytes - usedBytes),
    };
  } catch {
    return null;
  }
}

// ============================================================================
// Hooks
// ============================================================================

/** Detect device capabilities once on mount; `refresh()` re-detects. */
export function useCapabilities() {
  const [capabilities, setCapabilities] = useState<DeviceCapabilities | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const detect = useCallback(async () => {
    if (IS_SERVER) return;
    setIsDetecting(true);
    setError(null);
    try {
      const caps = await detectCapabilities();
      if (mountedRef.current) setCapabilities(caps);
    } catch (err) {
      if (mountedRef.current) setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      if (mountedRef.current) setIsDetecting(false);
    }
  }, []);

  useEffect(() => {
    void detect();
  }, [detect]);

  if (IS_SERVER) {
    return { capabilities: null, isDetecting: false, error: null, refresh: async () => {} };
  }
  return { capabilities, isDetecting, error, refresh: detect };
}

/** Monitor browser storage quota; queries on mount, exposes `refresh()`. */
export function useStorageQuota() {
  const [quota, setQuota] = useState<StorageQuota | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchQuota = useCallback(async () => {
    if (IS_SERVER) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await getStorageQuota();
      if (mountedRef.current && result) setQuota(result);
    } catch (err) {
      if (mountedRef.current) setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchQuota();
  }, [fetchQuota]);

  if (IS_SERVER) {
    return { quota: null, isLoading: false, error: null, refresh: async () => {} };
  }
  return { quota, isLoading, error, refresh: fetchQuota };
}

function getOnlineStatus() {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

function subscribeOnline(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

/** Reactively track online/offline status (tear-free via useSyncExternalStore). */
export function useNetworkStatus() {
  const isOnline = useSyncExternalStore(subscribeOnline, getOnlineStatus, () => true);
  return { isOnline, isOffline: !isOnline };
}
