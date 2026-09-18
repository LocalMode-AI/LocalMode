/**
 * Environment capture. Records identity + capability signals with honest
 * provenance: UA Client Hints on Chromium; UA parsing elsewhere with the OS
 * version marked 'unknown-frozen' (UA strings are frozen by design on Gecko
 * and WebKit). Clamped fields (cores, deviceMemory) are labeled clamped.
 */

import type { BrowserInfo, EnvironmentCapture, GPUInfo, OSInfo } from './types.js';
import { inferTimerResolutionUs } from './timing.js';

/** Minimal structural types for APIs TypeScript's DOM lib may not carry. */
interface UADataBrand {
  brand: string;
  version: string;
}
interface NavigatorUAData {
  brands: UADataBrand[];
  getHighEntropyValues(hints: string[]): Promise<Record<string, unknown>>;
}

/** WebGPU limits worth recording (identity + capacity signals, all numbers). */
const GPU_LIMIT_KEYS = [
  'maxBufferSize',
  'maxStorageBufferBindingSize',
  'maxComputeWorkgroupStorageSize',
  'maxComputeInvocationsPerWorkgroup',
  'maxComputeWorkgroupSizeX',
] as const;

/**
 * Capture the full benchmark environment. Never throws — every probe is
 * individually guarded and absent signals are recorded as absent.
 *
 * @param options.userReportedDevice - Optional free-text device self-report
 *   (displayed as "user-reported", never treated as ground truth).
 * @example
 * const env = await captureEnvironment();
 */
export async function captureEnvironment(options?: {
  userReportedDevice?: string;
}): Promise<EnvironmentCapture> {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;

  const { browser, os } = await identifyBrowserAndOS(nav);
  const gpu = await probeWebGPU(nav);

  return {
    capturedAt: new Date().toISOString(),
    browser,
    os,
    hardware: {
      cores: nav?.hardwareConcurrency ?? null,
      coresClamped: browser.name !== 'Chrome' && browser.name !== 'Edge',
      deviceMemoryGB:
        nav && 'deviceMemory' in nav ? ((nav as { deviceMemory?: number }).deviceMemory ?? null) : null,
      deviceMemoryCapped: true,
    },
    gpu,
    webglRenderer: probeWebGLRenderer(),
    flags: {
      crossOriginIsolated: typeof crossOriginIsolated !== 'undefined' ? crossOriginIsolated : false,
      sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
      wasmSimd: probeWasmSimd(),
    },
    storage: await probeStorage(nav),
    power: await probeBattery(nav),
    pressure: {
      supported: typeof globalThis !== 'undefined' && 'PressureObserver' in globalThis,
    },
    timerResolutionUs: inferTimerResolutionUs(),
    screen:
      typeof screen !== 'undefined'
        ? {
            width: screen.width,
            height: screen.height,
            dpr: typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1,
          }
        : null,
    languages: nav?.languages ? [...nav.languages].slice(0, 3) : undefined,
    userReportedDevice: options?.userReportedDevice,
  };
}

/** Identify the browser + OS with provenance. */
async function identifyBrowserAndOS(
  nav: Navigator | undefined,
): Promise<{ browser: BrowserInfo; os: OSInfo }> {
  const uaData = nav && 'userAgentData' in nav
    ? ((nav as { userAgentData?: NavigatorUAData }).userAgentData)
    : undefined;

  if (uaData) {
    try {
      const high = await uaData.getHighEntropyValues([
        'platform',
        'platformVersion',
        'architecture',
        'bitness',
        'model',
        'fullVersionList',
      ]);
      const list =
        (high.fullVersionList as UADataBrand[] | undefined) ?? uaData.brands ?? [];
      const primary =
        list.find((b) => !/not.?a.?brand/i.test(b.brand) && b.brand !== 'Chromium') ??
        list.find((b) => !/not.?a.?brand/i.test(b.brand));
      return {
        browser: {
          name: primary?.brand ?? 'Chromium',
          version: primary?.version ?? 'unknown',
          source: 'ua-ch',
          brands: list.map((b) => ({ brand: b.brand, version: b.version })),
        },
        os: {
          platform: String(high.platform ?? 'unknown'),
          version: String(high.platformVersion ?? 'unknown'),
          architecture: high.architecture ? String(high.architecture) : undefined,
          bitness: high.bitness ? String(high.bitness) : undefined,
          model: high.model ? String(high.model) : undefined,
        },
      };
    } catch {
      // fall through to UA parsing
    }
  }

  const ua = nav?.userAgent ?? '';
  return { browser: parseUABrowser(ua), os: parseUAOS(ua) };
}

/** Conservative UA parsing: browser + major version only. */
function parseUABrowser(ua: string): BrowserInfo {
  const rules: Array<[string, RegExp]> = [
    ['Firefox', /Firefox\/(\d+[\d.]*)/],
    ['Edge', /Edg(?:e|A|iOS)?\/(\d+[\d.]*)/],
    ['Safari', /Version\/(\d+[\d.]*).*Safari/],
    ['Chrome', /Chrome\/(\d+[\d.]*)/],
  ];
  for (const [name, re] of rules) {
    const m = ua.match(re);
    if (m) return { name, version: m[1], source: 'ua-parse' };
  }
  return { name: 'unknown', version: 'unknown', source: 'ua-parse' };
}

/** OS from UA. Version is 'unknown-frozen' — UA OS versions are frozen/capped. */
function parseUAOS(ua: string): OSInfo {
  let platform = 'unknown';
  if (/Windows/.test(ua)) platform = 'Windows';
  else if (/iPhone|iPad|iPod/.test(ua)) platform = 'iOS';
  else if (/Mac OS X/.test(ua)) platform = 'macOS';
  else if (/Android/.test(ua)) platform = 'Android';
  else if (/Linux/.test(ua)) platform = 'Linux';
  return { platform, version: 'unknown-frozen' };
}

/** Structural WebGPU types (the TS DOM lib may not include WebGPU). */
interface GPUAdapterLike {
  info?: Record<string, unknown>;
  limits?: unknown;
  features?: Iterable<string>;
}
interface GPULike {
  requestAdapter(): Promise<GPUAdapterLike | null>;
}

/** Probe the WebGPU adapter identity via the `adapter.info` attribute. */
async function probeWebGPU(nav: Navigator | undefined): Promise<GPUInfo> {
  const gpu = nav && 'gpu' in nav ? (nav as { gpu?: GPULike }).gpu : undefined;
  if (!gpu) return { available: false };
  try {
    const adapter = await Promise.race([
      gpu.requestAdapter(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3_000)),
    ]);
    if (!adapter) return { available: false };
    const info = adapter.info ?? {};
    const limits: Record<string, number> = {};
    const adapterLimits = adapter.limits as Record<string, number> | undefined;
    if (adapterLimits) {
      for (const key of GPU_LIMIT_KEYS) {
        const v = adapterLimits[key];
        if (typeof v === 'number') limits[key] = v;
      }
    }
    return {
      available: true,
      vendor: str(info.vendor),
      architecture: str(info.architecture),
      device: str(info.device),
      description: str(info.description),
      isFallbackAdapter:
        typeof info.isFallbackAdapter === 'boolean' ? info.isFallbackAdapter : undefined,
      features: adapter.features ? [...(adapter.features as Iterable<string>)].sort() : undefined,
      limits,
    };
  } catch {
    return { available: false };
  }
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/** WebGL renderer string (secondary GPU identity signal). */
function probeWebGLRenderer(): string | null {
  try {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    const gl =
      (canvas.getContext('webgl2') as WebGL2RenderingContext | null) ??
      (canvas.getContext('webgl') as WebGLRenderingContext | null);
    if (!gl) return null;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = ext
      ? (gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string)
      : (gl.getParameter(gl.RENDERER) as string);
    return typeof renderer === 'string' ? renderer : null;
  } catch {
    return null;
  }
}

/** WASM SIMD support via WebAssembly.validate of a canonical SIMD module. */
function probeWasmSimd(): boolean {
  try {
    // Minimal module containing a v128 operation (standard detection bytes).
    return WebAssembly.validate(
      new Uint8Array([
        0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0,
        253, 15, 253, 98, 11,
      ]),
    );
  } catch {
    return false;
  }
}

async function probeStorage(
  nav: Navigator | undefined,
): Promise<{ quotaBytes?: number; usageBytes?: number } | null> {
  try {
    if (!nav?.storage?.estimate) return null;
    const est = await nav.storage.estimate();
    return { quotaBytes: est.quota ?? undefined, usageBytes: est.usage ?? undefined };
  } catch {
    return null;
  }
}

async function probeBattery(
  nav: Navigator | undefined,
): Promise<{ batterySupported: boolean; charging?: boolean; level?: number }> {
  try {
    const getBattery = nav && 'getBattery' in nav
      ? (nav as { getBattery?: () => Promise<{ charging: boolean; level: number }> }).getBattery
      : undefined;
    if (!getBattery) return { batterySupported: false };
    const battery = await getBattery.call(nav);
    return { batterySupported: true, charging: battery.charging, level: battery.level };
  } catch {
    return { batterySupported: false };
  }
}
