/**
 * Device Detection Utilities
 *
 * Detect device, browser, and hardware information.
 *
 * @packageDocumentation
 */

import type { DeviceInfo, MemoryInfo } from './types.js';

// ============================================================================
// Device Information
// ============================================================================

/**
 * Get device information.
 *
 * @returns Device information object
 */
export function getDeviceInfo(): DeviceInfo {
  if (typeof navigator === 'undefined') {
    return {
      userAgent: '',
      platform: 'node',
      hardwareConcurrency: 1,
      maxTouchPoints: 0,
    };
  }

  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    hardwareConcurrency: navigator.hardwareConcurrency || 1,
    deviceMemory: (navigator as any).deviceMemory,
    maxTouchPoints: navigator.maxTouchPoints || 0,
  };
}

/**
 * Get memory information (Chrome only).
 *
 * @returns Memory information if available
 */
export function getMemoryInfo(): MemoryInfo {
  const info: MemoryInfo = {};

  if (typeof navigator !== 'undefined') {
    info.deviceMemory = (navigator as any).deviceMemory;
  }

  if (typeof performance !== 'undefined' && (performance as any).memory) {
    const memory = (performance as any).memory;
    info.totalJSHeapSize = memory.totalJSHeapSize;
    info.usedJSHeapSize = memory.usedJSHeapSize;
    info.jsHeapSizeLimit = memory.jsHeapSizeLimit;
  }

  return info;
}

/**
 * Get hardware concurrency (number of logical CPU cores).
 *
 * @returns Number of logical CPU cores
 */
export function getHardwareConcurrency(): number {
  if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) {
    return navigator.hardwareConcurrency;
  }
  return 1;
}

/**
 * Get storage estimate from the browser.
 *
 * @returns Storage estimate with quota and usage
 */
export async function getStorageEstimate(): Promise<{
  quota: number;
  usage: number;
  persisted: boolean;
} | null> {
  if (typeof navigator === 'undefined' || !navigator.storage) {
    return null;
  }

  try {
    const [estimate, persisted] = await Promise.all([
      navigator.storage.estimate(),
      navigator.storage.persisted(),
    ]);

    return {
      quota: estimate.quota ?? 0,
      usage: estimate.usage ?? 0,
      persisted,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// Browser Detection
// ============================================================================

/**
 * Detect browser name and version from user agent.
 *
 * @returns Browser information
 */
export function detectBrowser(): { name: string; version: string; engine: string } {
  if (typeof navigator === 'undefined') {
    return { name: 'unknown', version: '0', engine: 'unknown' };
  }

  const ua = navigator.userAgent;

  // Chrome
  if (ua.includes('Chrome/') && !ua.includes('Edg/')) {
    const match = ua.match(/Chrome\/(\d+(?:\.\d+)*)/);
    return {
      name: 'Chrome',
      version: match?.[1] ?? 'unknown',
      engine: 'Blink',
    };
  }

  // Edge
  if (ua.includes('Edg/')) {
    const match = ua.match(/Edg\/(\d+(?:\.\d+)*)/);
    return {
      name: 'Edge',
      version: match?.[1] ?? 'unknown',
      engine: 'Blink',
    };
  }

  // Firefox
  if (ua.includes('Firefox/')) {
    const match = ua.match(/Firefox\/(\d+(?:\.\d+)*)/);
    return {
      name: 'Firefox',
      version: match?.[1] ?? 'unknown',
      engine: 'Gecko',
    };
  }

  // Safari
  if (ua.includes('Safari/') && !ua.includes('Chrome')) {
    const match = ua.match(/Version\/(\d+(?:\.\d+)*)/);
    return {
      name: 'Safari',
      version: match?.[1] ?? 'unknown',
      engine: 'WebKit',
    };
  }

  return { name: 'unknown', version: '0', engine: 'unknown' };
}

/**
 * Detect operating system and version.
 *
 * @returns OS information
 */
export function detectOS(): { name: string; version: string } {
  if (typeof navigator === 'undefined') {
    if (typeof process !== 'undefined') {
      return { name: process.platform, version: process.version };
    }
    return { name: 'unknown', version: '0' };
  }

  const ua = navigator.userAgent;

  // Windows
  if (ua.includes('Windows')) {
    const match = ua.match(/Windows NT (\d+(?:\.\d+)*)/);
    const ntVersion = match?.[1] ?? '10';
    const version = ntVersion === '10.0' ? '10/11' : ntVersion;
    return { name: 'Windows', version };
  }

  // macOS
  if (ua.includes('Mac OS X')) {
    const match = ua.match(/Mac OS X (\d+[._]\d+(?:[._]\d+)?)/);
    const version = match?.[1]?.replace(/_/g, '.') ?? 'unknown';
    return { name: 'macOS', version };
  }

  // iOS
  if (ua.includes('iPhone') || ua.includes('iPad')) {
    const match = ua.match(/OS (\d+[._]\d+(?:[._]\d+)?)/);
    const version = match?.[1]?.replace(/_/g, '.') ?? 'unknown';
    return { name: 'iOS', version };
  }

  // Android
  if (ua.includes('Android')) {
    const match = ua.match(/Android (\d+(?:\.\d+)*)/);
    return { name: 'Android', version: match?.[1] ?? 'unknown' };
  }

  // Linux
  if (ua.includes('Linux')) {
    return { name: 'Linux', version: 'unknown' };
  }

  return { name: 'unknown', version: '0' };
}

/**
 * Detect device type (desktop, mobile, tablet).
 *
 * @returns Device type
 */
export function detectDeviceType(): 'desktop' | 'mobile' | 'tablet' | 'unknown' {
  if (typeof navigator === 'undefined') {
    return 'unknown';
  }

  const ua = navigator.userAgent;

  // Check for tablet first (iPads, Android tablets)
  if (ua.includes('iPad') || (ua.includes('Android') && !ua.includes('Mobile'))) {
    return 'tablet';
  }

  // Check for mobile devices
  if (
    ua.includes('iPhone') ||
    ua.includes('iPod') ||
    (ua.includes('Android') && ua.includes('Mobile')) ||
    ua.includes('webOS') ||
    ua.includes('BlackBerry') ||
    ua.includes('IEMobile') ||
    ua.includes('Opera Mini')
  ) {
    return 'mobile';
  }

  // Check for touch capability on tablets that might not identify as such
  if (navigator.maxTouchPoints > 0) {
    // Could be a touch laptop or tablet
    // Use screen size as additional heuristic
    if (typeof screen !== 'undefined' && screen.width < 1024) {
      return 'tablet';
    }
  }

  return 'desktop';
}

// ============================================================================
// GPU Detection
// ============================================================================

/**
 * Detect GPU information via WebGL.
 *
 * @returns GPU vendor and renderer if available
 */
export function detectGPU(): { vendor: string; renderer: string } | null {
  if (typeof document === 'undefined') return null;

  try {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl');

    if (!gl) return null;

    const debugInfo = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) return null;

    return {
      vendor: (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) ?? 'unknown',
      renderer: (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) ?? 'unknown',
    };
  } catch {
    return null;
  }
}

