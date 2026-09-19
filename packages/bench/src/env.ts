/**
 * Environment capture. Records identity + capability signals with honest
 * provenance: UA Client Hints on Chromium; UA parsing elsewhere with the OS
 * version marked 'unknown-frozen' (UA strings are frozen by design on Gecko
 * and WebKit). Clamped fields (cores, deviceMemory) are labeled clamped.
 *
 * Everything a browser will disclose is recorded, whether or not the current
 * analysis uses it: WebGPU + WebGL identity, the WebAssembly proposal matrix,
 * API availability, form factor, display, network, locale, power. Every probe
 * is individually guarded; a failing probe records nothing for its key.
 */

import type {
  APIAvailability,
  BrowserInfo,
  DeviceInfo,
  DeviceType,
  DisplayInfo,
  EnvironmentCapture,
  GPUInfo,
  LocaleInfo,
  NetworkInfo,
  OSInfo,
  WasmFeatureSupport,
  WebGLInfo,
} from './types.js';
import { inferTimerResolutionUs } from './timing.js';

/** Minimal structural types for APIs TypeScript's DOM lib may not carry. */
interface UADataBrand {
  brand: string;
  version: string;
}
interface NavigatorUAData {
  brands: UADataBrand[];
  mobile?: boolean;
  platform?: string;
  getHighEntropyValues(hints: string[]): Promise<Record<string, unknown>>;
}

/** WebGPU limits worth recording (identity + capacity signals, all numbers). */
const GPU_LIMIT_KEYS = [
  'maxBufferSize',
  'maxStorageBufferBindingSize',
  'maxUniformBufferBindingSize',
  'maxComputeWorkgroupStorageSize',
  'maxComputeInvocationsPerWorkgroup',
  'maxComputeWorkgroupSizeX',
  'maxComputeWorkgroupSizeY',
  'maxComputeWorkgroupSizeZ',
  'maxComputeWorkgroupsPerDimension',
  'maxBindGroups',
  'maxStorageBuffersPerShaderStage',
  'maxTextureDimension2D',
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
  const ua = nav?.userAgent ?? '';

  const { browser, os, uaData } = await identifyBrowserAndOS(nav);
  const gpu = await probeWebGPU(nav);
  const webgl = probeWebGL();
  const wasm = await detectWasmFeatures();
  // UA Client Hints exist only on Chromium, so their presence settles the engine
  // even where the UA string is spoofed; the UA decides for everything else.
  const engine = browser.source === 'ua-ch' ? 'Blink' : detectEngine(ua);

  attempt(() => {
    browser.engine = engine;
    if (nav?.vendor) browser.vendor = nav.vendor;
    if (nav && typeof nav.webdriver === 'boolean') browser.webdriver = nav.webdriver;
    if (nav && 'pdfViewerEnabled' in nav) {
      browser.pdfViewerEnabled = Boolean((nav as { pdfViewerEnabled?: boolean }).pdfViewerEnabled);
    }
    if (nav?.platform) os.navigatorPlatform = nav.platform;
  });

  const memory = probePerformanceMemory();
  const screenInfo = probeScreen();

  return {
    capturedAt: new Date().toISOString(),
    browser,
    os,
    hardware: {
      cores: nav?.hardwareConcurrency ?? null,
      // Chromium reports the real logical core count; Gecko and WebKit clamp or
      // randomize it, so the label follows the engine, not the brand name.
      coresClamped: engine !== 'Blink',
      deviceMemoryGB:
        nav && 'deviceMemory' in nav ? ((nav as { deviceMemory?: number }).deviceMemory ?? null) : null,
      deviceMemoryCapped: true,
      jsHeapSizeLimitBytes: memory?.limit,
      jsHeapUsedBytes: memory?.used,
    },
    gpu,
    webglRenderer: webgl?.renderer ?? null,
    webgl: webgl ?? undefined,
    gpuModel: resolveGpuModel(gpu, webgl?.renderer ?? null),
    flags: {
      crossOriginIsolated: typeof crossOriginIsolated !== 'undefined' ? crossOriginIsolated : false,
      sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
      wasmSimd: wasm.simd,
      secureContext: typeof isSecureContext !== 'undefined' ? isSecureContext : undefined,
      wasm,
    },
    apis: await probeApis(nav, gpu.available, webgl?.contextKind === 'webgl2'),
    device: probeDevice(nav, ua, uaData),
    storage: await probeStorage(nav),
    power: await probeBattery(nav),
    pressure: {
      supported: typeof globalThis !== 'undefined' && 'PressureObserver' in globalThis,
    },
    timerResolutionUs: inferTimerResolutionUs(),
    screen: screenInfo ? { width: screenInfo.width, height: screenInfo.height, dpr: screenInfo.dpr } : null,
    display: screenInfo ?? undefined,
    network: probeNetwork(nav),
    locale: probeLocale(),
    languages: nav?.languages ? [...nav.languages].slice(0, 3) : undefined,
    userAgent: ua || undefined,
    pageOrigin: attempt(() => (typeof location !== 'undefined' ? location.origin : undefined)),
    visibilityState: attempt(() =>
      typeof document !== 'undefined' ? document.visibilityState : undefined,
    ),
    userReportedDevice: options?.userReportedDevice,
  };
}

/** Run a synchronous probe; any throw yields undefined. */
function attempt<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

/** Identify the browser + OS with provenance. */
async function identifyBrowserAndOS(
  nav: Navigator | undefined,
): Promise<{ browser: BrowserInfo; os: OSInfo; uaData?: NavigatorUAData }> {
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
        'wow64',
        'formFactors',
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
          wow64: typeof high.wow64 === 'boolean' ? high.wow64 : undefined,
        },
        uaData: Object.assign(uaData, {
          formFactorsHint: Array.isArray(high.formFactors) ? (high.formFactors as string[]) : undefined,
        }),
      };
    } catch {
      // fall through to UA parsing
    }
  }

  const ua = nav?.userAgent ?? '';
  return { ...parseUserAgent(ua), uaData };
}

/**
 * UA-string fallback for browsers without UA Client Hints (every WebKit
 * browser). Conservative: browser name + version token, platform, and the OS
 * version only where the UA genuinely carries one.
 *
 * @example
 * parseUserAgent('... CriOS/145.0.7632.72 Mobile/15E148 Safari/604.1').browser.name; // 'Chrome iOS'
 */
export function parseUserAgent(ua: string): { browser: BrowserInfo; os: OSInfo } {
  return { browser: parseUABrowser(ua), os: parseUAOS(ua) };
}

/** Browser + version from the UA. iOS shells (CriOS/FxiOS/EdgiOS) are WebKit and named as such. */
function parseUABrowser(ua: string): BrowserInfo {
  const rules: Array<[string, RegExp]> = [
    ['Firefox iOS', /FxiOS\/(\d+[\d.]*)/],
    ['Firefox', /Firefox\/(\d+[\d.]*)/],
    ['Edge', /Edg(?:e|A|iOS)?\/(\d+[\d.]*)/],
    ['Chrome iOS', /CriOS\/(\d+[\d.]*)/],
    ['Safari', /Version\/(\d+[\d.]*).*Safari/],
    ['Chrome', /Chrome\/(\d+[\d.]*)/],
  ];
  for (const [name, re] of rules) {
    const m = ua.match(re);
    if (m) return { name, version: m[1], source: 'ua-parse' };
  }
  return { name: 'unknown', version: 'unknown', source: 'ua-parse' };
}

/**
 * OS from the UA. Chromium's reduced UA freezes desktop and Android versions,
 * so those stay 'unknown-frozen'; iOS UAs carry the real OS version.
 */
function parseUAOS(ua: string): OSInfo {
  let platform = 'unknown';
  if (/Windows/.test(ua)) platform = 'Windows';
  else if (/iPhone|iPad|iPod/.test(ua)) platform = 'iOS';
  else if (/Mac OS X/.test(ua)) platform = 'macOS';
  else if (/Android/.test(ua)) platform = 'Android';
  else if (/CrOS/.test(ua)) platform = 'Chrome OS';
  else if (/Linux/.test(ua)) platform = 'Linux';
  if (platform === 'iOS') {
    const m = ua.match(/OS (\d+(?:[_.]\d+)*) like Mac OS X/);
    if (m) return { platform, version: m[1].replace(/_/g, '.') };
  }
  return { platform, version: 'unknown-frozen' };
}

/**
 * Rendering engine from the UA. Every iOS browser is WebKit regardless of its
 * brand (App Store policy), so the iOS check comes first.
 *
 * @example
 * detectEngine('... CriOS/145.0 ...'); // 'WebKit'
 */
export function detectEngine(ua: string): BrowserInfo['engine'] {
  if (!ua) return 'unknown';
  if (/iPhone|iPad|iPod/.test(ua)) return 'WebKit';
  if (/Gecko\/\d|Firefox\//.test(ua) && !/like Gecko/.test(ua)) return 'Gecko';
  if (/Chrome\/|Chromium\/|Edg\//.test(ua)) return 'Blink';
  if (/AppleWebKit\//.test(ua)) return 'WebKit';
  return 'unknown';
}

/** Inputs to the form-factor derivation, each optional. */
export interface DeviceTypeSignals {
  ua: string;
  maxTouchPoints: number;
  /** UA-CH `formFactors` high-entropy hint (Chromium 125+). */
  formFactors?: string[];
  /** UA-CH `mobile` bit. */
  mobile?: boolean;
}

/**
 * Derive a form factor. UA-CH form factors win when present; otherwise the UA
 * decides, with `maxTouchPoints` unmasking an iPad that reports itself as a
 * Mac (iPadOS 13+ default) and separating Android tablets (no `Mobile` token)
 * from phones.
 *
 * @example
 * deriveDeviceType({ ua: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints });
 */
export function deriveDeviceType(signals: DeviceTypeSignals): DeviceType {
  const { ua, maxTouchPoints, formFactors, mobile } = signals;
  if (formFactors && formFactors.length > 0) {
    const set = new Set(formFactors.map((f) => f.toLowerCase()));
    if (set.has('xr')) return 'xr';
    if (set.has('automotive') || set.has('tv')) return 'tv';
    if (set.has('tablet')) return 'tablet';
    if (set.has('mobile') || set.has('watch')) return 'phone';
    if (set.has('desktop') || set.has('eink')) return 'desktop';
  }
  if (/iPad/.test(ua)) return 'tablet';
  if (/iPhone|iPod/.test(ua)) return 'phone';
  if (/Macintosh/.test(ua) && maxTouchPoints > 1) return 'tablet';
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'phone' : 'tablet';
  if (/CrKey|SmartTV|Tizen|Web0S|BRAVIA|AppleTV/i.test(ua)) return 'tv';
  if (/Quest|OculusBrowser|VR\b|XR\b/i.test(ua)) return 'xr';
  if (mobile === true) return 'phone';
  if (/Windows|Macintosh|Linux|CrOS/.test(ua)) return 'desktop';
  return 'unknown';
}

/** Form-factor + input capability probes. */
function probeDevice(
  nav: Navigator | undefined,
  ua: string,
  uaData: (NavigatorUAData & { formFactorsHint?: string[] }) | undefined,
): DeviceInfo | undefined {
  if (!nav) return undefined;
  return attempt(() => {
    const maxTouchPoints = typeof nav.maxTouchPoints === 'number' ? nav.maxTouchPoints : 0;
    const formFactors = uaData?.formFactorsHint;
    const mobileBit = uaData?.mobile;
    const type = deriveDeviceType({ ua, maxTouchPoints, formFactors, mobile: mobileBit });
    const mq = (q: string): boolean | undefined =>
      typeof matchMedia === 'function' ? attempt(() => matchMedia(q).matches) : undefined;
    const displayMode = ['fullscreen', 'standalone', 'minimal-ui', 'browser'].find(
      (m) => mq(`(display-mode: ${m})`) === true,
    );
    return {
      type,
      mobile: mobileBit ?? (type === 'phone' || type === 'tablet'),
      formFactors,
      maxTouchPoints,
      pointerCoarse: mq('(pointer: coarse)'),
      hoverNone: mq('(hover: none)'),
      displayMode,
    };
  });
}

/** Structural WebGPU types (the TS DOM lib may not include WebGPU). */
interface GPUAdapterLike {
  info?: Record<string, unknown>;
  limits?: unknown;
  features?: Iterable<string>;
}
interface GPULike {
  requestAdapter(): Promise<GPUAdapterLike | null>;
  getPreferredCanvasFormat?(): string;
  wgslLanguageFeatures?: Iterable<string>;
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
      subgroupMinSize: num(info.subgroupMinSize),
      subgroupMaxSize: num(info.subgroupMaxSize),
      isFallbackAdapter:
        typeof info.isFallbackAdapter === 'boolean' ? info.isFallbackAdapter : undefined,
      features: adapter.features ? [...(adapter.features as Iterable<string>)].sort() : undefined,
      limits,
      preferredCanvasFormat: attempt(() => gpu.getPreferredCanvasFormat?.()),
      wgslLanguageFeatures: attempt(() =>
        gpu.wgslLanguageFeatures ? [...gpu.wgslLanguageFeatures].sort() : undefined,
      ),
    };
  } catch {
    return { available: false };
  }
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** Software rasterizers that mean "no real GPU behind this context". */
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|mesa offscreen|microsoft basic render/i;

/** WebGL identity + capacity (the UNMASKED strings when the debug extension exists). */
function probeWebGL(): WebGLInfo | null {
  try {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    let contextKind: WebGLInfo['contextKind'] = 'webgl2';
    let gl: WebGLRenderingContext | WebGL2RenderingContext | null = canvas.getContext(
      'webgl2',
    ) as WebGL2RenderingContext | null;
    if (!gl) {
      contextKind = 'webgl';
      gl = canvas.getContext('webgl') as WebGLRenderingContext | null;
    }
    if (!gl) return { contextKind: null };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const vendor = ext
      ? (gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) as string)
      : (gl.getParameter(gl.VENDOR) as string);
    const renderer = ext
      ? (gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string)
      : (gl.getParameter(gl.RENDERER) as string);
    const info: WebGLInfo = {
      contextKind,
      vendor: str(vendor),
      renderer: str(renderer),
      version: str(gl.getParameter(gl.VERSION)),
      shadingLanguageVersion: str(gl.getParameter(gl.SHADING_LANGUAGE_VERSION)),
      maxTextureSize: num(gl.getParameter(gl.MAX_TEXTURE_SIZE)),
      maxRenderbufferSize: num(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)),
      maxVertexUniformVectors: num(gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS)),
      maxFragmentUniformVectors: num(gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS)),
      extensionCount: attempt(() => gl!.getSupportedExtensions()?.length),
      softwareRenderer: typeof renderer === 'string' ? SOFTWARE_RENDERER.test(renderer) : undefined,
    };
    attempt(() => gl!.getExtension('WEBGL_lose_context')?.loseContext());
    return info;
  } catch {
    return null;
  }
}

/**
 * GPU model for a capture. The WebGPU adapter description wins where a browser
 * fills it with a real model name (Chromium leaves it empty; WebKit repeats the
 * bare vendor token, which names nothing); otherwise the WebGL renderer string
 * is parsed.
 *
 * @example
 * resolveGpuModel({ vendor: 'apple', description: 'apple' }, 'Apple GPU'); // 'Apple GPU'
 */
export function resolveGpuModel(
  gpu: Pick<GPUInfo, 'vendor' | 'architecture' | 'description'>,
  webglRenderer: string | null | undefined,
): string | undefined {
  const description = gpu.description?.trim();
  if (description) {
    const bare = description.toLowerCase();
    const namesNothing = bare === gpu.vendor?.toLowerCase() || bare === gpu.architecture?.toLowerCase();
    if (!namesNothing) return description;
  }
  return parseGpuModel(webglRenderer);
}

/**
 * GPU model from a WebGL renderer string. ANGLE wraps the model as
 * `ANGLE (<vendor>, <model>[ (0x...)] <backend...>, <api>)`; Metal adds a
 * `ANGLE Metal Renderer: ` prefix. Native strings are returned as-is.
 *
 * @example
 * parseGpuModel('ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)'); // 'Apple M4'
 */
export function parseGpuModel(renderer: string | null | undefined): string | undefined {
  if (!renderer) return undefined;
  const angle = renderer.match(/^ANGLE \((.*)\)$/);
  if (!angle) return renderer.trim() || undefined;
  const inner = angle[1];
  // Split on top-level commas only; "Adreno (TM) 740" and "(LLVM 15.0.7, 256 bits)" keep their parens.
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of inner) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current.trim());
  // Three-part ANGLE strings are (vendor, model, backend); two-part ones are (vendor, model).
  let model = parts.length >= 2 ? parts[1] : parts[0];
  model = model.replace(/^ANGLE Metal Renderer:\s*/i, '');
  // Drop the PCI id and the Direct3D shader-model suffix that follow the model on Windows.
  model = model
    .replace(/\s*\(0x[0-9a-fA-F]+\)/g, '')
    .replace(/\s+Direct3D\d+.*$/i, '')
    .trim();
  return model || undefined;
}

/**
 * WebAssembly proposal support, probed the way `wasm-feature-detect` does:
 * validate or compile the smallest module that uses each feature. The byte
 * sequences are those of wasm-feature-detect 1.9.0, inlined so the harness
 * keeps its zero-dependency contract.
 *
 * @example
 * const wasm = await detectWasmFeatures(); // { simd: true, threads: true, ... }
 */
export async function detectWasmFeatures(): Promise<WasmFeatureSupport> {
  const validate = (bytes: number[]): boolean => {
    try {
      return WebAssembly.validate(new Uint8Array(bytes));
    } catch {
      return false;
    }
  };
  const compiles = (bytes: number[]): boolean => {
    try {
      new WebAssembly.Module(new Uint8Array(bytes));
      return true;
    } catch {
      return false;
    }
  };
  const has = (fn: () => boolean): boolean => {
    try {
      return fn();
    } catch {
      return false;
    }
  };
  const wasm = typeof WebAssembly !== 'undefined' ? WebAssembly : undefined;
  const W = wasm as unknown as Record<string, unknown> | undefined;

  const support: WasmFeatureSupport = {
    simd: validate([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]),
    relaxedSimd: validate([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 15, 1, 13, 0, 65, 1, 253, 15, 65, 2, 253, 15, 253, 128, 2, 11]),
    threads: has(() => {
      if (typeof MessageChannel !== 'undefined') new MessageChannel().port1.postMessage(new SharedArrayBuffer(1));
      return validate([0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 2, 1, 0, 5, 4, 1, 3, 1, 1, 10, 11, 1, 9, 0, 65, 0, 254, 16, 2, 0, 26, 11]);
    }),
    bulkMemory: validate([0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 2, 1, 0, 5, 3, 1, 0, 1, 10, 14, 1, 12, 0, 65, 0, 65, 0, 65, 0, 252, 10, 0, 0, 11]),
    exceptions: validate([0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 2, 1, 0, 10, 8, 1, 6, 0, 6, 64, 25, 11, 11]),
    exceptionsFinal: compiles([0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 2, 1, 0, 10, 16, 1, 14, 0, 2, 105, 31, 64, 1, 3, 0, 0, 11, 0, 11, 26, 11]),
    extendedConst: validate([0, 97, 115, 109, 1, 0, 0, 0, 5, 3, 1, 0, 1, 11, 9, 1, 0, 65, 1, 65, 2, 106, 11, 0]),
    gc: validate([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 95, 1, 120, 0]),
    memory64: validate([0, 97, 115, 109, 1, 0, 0, 0, 5, 3, 1, 4, 1]),
    multiMemory: compiles([0, 97, 115, 109, 1, 0, 0, 0, 5, 5, 2, 0, 0, 0, 0]),
    multiValue: validate([0, 97, 115, 109, 1, 0, 0, 0, 1, 6, 1, 96, 0, 2, 127, 127, 3, 2, 1, 0, 10, 8, 1, 6, 0, 65, 0, 65, 0, 11]),
    mutableGlobals: validate([0, 97, 115, 109, 1, 0, 0, 0, 2, 8, 1, 1, 97, 1, 98, 3, 127, 1, 6, 6, 1, 127, 1, 65, 0, 11, 7, 5, 1, 1, 97, 3, 1]),
    referenceTypes: validate([0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 2, 1, 0, 10, 7, 1, 5, 0, 208, 112, 26, 11]),
    saturatedFloatToInt: validate([0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 2, 1, 0, 10, 12, 1, 10, 0, 67, 0, 0, 0, 0, 252, 0, 26, 11]),
    signExtensions: validate([0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 2, 1, 0, 10, 8, 1, 6, 0, 65, 0, 192, 26, 11]),
    tailCall: validate([0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 2, 1, 0, 10, 6, 1, 4, 0, 18, 0, 11]),
    typedFunctionReferences: compiles([0, 97, 115, 109, 1, 0, 0, 0, 1, 16, 3, 96, 1, 127, 1, 127, 96, 1, 100, 0, 1, 127, 96, 0, 1, 127, 3, 4, 3, 1, 0, 2, 9, 5, 1, 3, 0, 1, 1, 10, 28, 3, 11, 0, 65, 10, 65, 42, 32, 0, 20, 0, 106, 11, 7, 0, 32, 0, 65, 1, 106, 11, 6, 0, 210, 1, 16, 0, 11]),
    wideArithmetic: validate([0, 97, 115, 109, 1, 0, 0, 0, 1, 10, 1, 96, 4, 126, 126, 126, 126, 2, 126, 126, 3, 2, 1, 0, 10, 14, 1, 12, 0, 32, 0, 32, 1, 32, 2, 32, 3, 252, 19, 11]),
    jspi: has(() => Boolean(W && 'Suspending' in W)),
    typeReflection: has(() => Boolean(W && 'Function' in W)),
    streamingCompilation: has(() => Boolean(W && typeof W.compileStreaming === 'function')),
    jsStringBuiltins: false,
  };

  // JS String Builtins: a module importing `wasm:js-string.test` instantiates
  // only when the engine accepts the `builtins` option and implements the module.
  support.jsStringBuiltins = await (async () => {
    try {
      if (!wasm) return false;
      const bytes = new Uint8Array([
        0, 97, 115, 109, 1, 0, 0, 0, 1, 6, 1, 96, 1, 111, 1, 127, 2, 23, 1, 14, 119, 97, 115, 109, 58,
        106, 115, 45, 115, 116, 114, 105, 110, 103, 4, 116, 101, 115, 116, 0, 0,
      ]);
      await (wasm.instantiate as (b: BufferSource, i?: unknown, o?: unknown) => Promise<unknown>)(
        bytes,
        {},
        { builtins: ['js-string'] },
      );
      return true;
    } catch {
      return false;
    }
  })();

  // Largest `maximum` the engine accepts on a 32-bit memory; 65536 pages = 4 GiB.
  for (const pages of [65536, 32768, 16384]) {
    try {
      new WebAssembly.Memory({ initial: 1, maximum: pages });
      support.maxMemoryPages = pages;
      break;
    } catch {
      // try the next smaller ceiling
    }
  }
  return support;
}

/** Presence checks for the APIs the runtimes depend on. */
async function probeApis(
  nav: Navigator | undefined,
  webgpu: boolean,
  webgl2: boolean,
): Promise<APIAvailability | undefined> {
  if (!nav) return undefined;
  const g = globalThis as unknown as Record<string, unknown>;
  const n = nav as unknown as Record<string, unknown>;
  const present = (obj: Record<string, unknown> | undefined, key: string): boolean =>
    attempt(() => Boolean(obj && key in obj)) ?? false;

  const opfs = await (async () => {
    try {
      const storage = nav.storage as unknown as { getDirectory?: () => Promise<unknown> } | undefined;
      if (!storage?.getDirectory) return false;
      await storage.getDirectory();
      return true;
    } catch {
      return false;
    }
  })();
  const persisted = await (async () => {
    try {
      const storage = nav.storage as unknown as { persisted?: () => Promise<boolean> } | undefined;
      return storage?.persisted ? await storage.persisted() : undefined;
    } catch {
      return undefined;
    }
  })();

  const builtInAi = async (key: string): Promise<string | undefined> => {
    try {
      const api = g[key] as { availability?: () => Promise<string> } | undefined;
      if (!api?.availability) return undefined;
      return await Promise.race([
        api.availability(),
        new Promise<string>((resolve) => setTimeout(() => resolve('timeout'), 2_000)),
      ]);
    } catch {
      return 'error';
    }
  };

  return {
    webgpu,
    webgl2,
    webnn: present(n, 'ml'),
    opfs,
    persistedStorage: persisted,
    indexedDB: present(g, 'indexedDB'),
    cacheApi: present(g, 'caches'),
    serviceWorker: present(n, 'serviceWorker'),
    webWorkers: present(g, 'Worker'),
    offscreenCanvas: present(g, 'OffscreenCanvas'),
    webLocks: present(n, 'locks'),
    broadcastChannel: present(g, 'BroadcastChannel'),
    wakeLock: present(n, 'wakeLock'),
    computePressure: present(g, 'PressureObserver'),
    performanceMemory: present(
      typeof performance !== 'undefined' ? (performance as unknown as Record<string, unknown>) : undefined,
      'memory',
    ),
    measureUserAgentSpecificMemory: present(
      typeof performance !== 'undefined' ? (performance as unknown as Record<string, unknown>) : undefined,
      'measureUserAgentSpecificMemory',
    ),
    schedulerYield: present(g.scheduler as Record<string, unknown> | undefined, 'yield'),
    webCodecs: present(g, 'VideoDecoder'),
    audioWorklet: present(g, 'AudioWorklet'),
    mediaDevices: present(n, 'mediaDevices'),
    webTransport: present(g, 'WebTransport'),
    promptApi: await builtInAi('LanguageModel'),
    summarizerApi: await builtInAi('Summarizer'),
    translatorApi: await (async () => {
      // Translator.availability needs a language pair; a common pair keeps the verdict comparable.
      try {
        const api = g.Translator as
          | { availability?: (o: { sourceLanguage: string; targetLanguage: string }) => Promise<string> }
          | undefined;
        if (!api?.availability) return undefined;
        return await Promise.race([
          api.availability({ sourceLanguage: 'en', targetLanguage: 'es' }),
          new Promise<string>((resolve) => setTimeout(() => resolve('timeout'), 2_000)),
        ]);
      } catch {
        return 'error';
      }
    })(),
    languageDetectorApi: await builtInAi('LanguageDetector'),
  };
}

/** `performance.memory` (Chromium) idle snapshot. */
function probePerformanceMemory(): { limit?: number; used?: number } | undefined {
  return attempt(() => {
    const mem = (performance as unknown as { memory?: { jsHeapSizeLimit?: number; usedJSHeapSize?: number } })
      .memory;
    if (!mem) return undefined;
    return { limit: num(mem.jsHeapSizeLimit), used: num(mem.usedJSHeapSize) };
  });
}

/** Display + viewport + media-query preferences. */
function probeScreen(): DisplayInfo | null {
  if (typeof screen === 'undefined') return null;
  try {
    const mq = (q: string): boolean | undefined =>
      typeof matchMedia === 'function' ? attempt(() => matchMedia(q).matches) : undefined;
    const scheme = mq('(prefers-color-scheme: dark)')
      ? 'dark'
      : mq('(prefers-color-scheme: light)')
        ? 'light'
        : 'no-preference';
    return {
      width: screen.width,
      height: screen.height,
      availWidth: num(screen.availWidth),
      availHeight: num(screen.availHeight),
      dpr: typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1,
      colorDepth: num(screen.colorDepth),
      orientation: attempt(() => screen.orientation?.type),
      viewportWidth: typeof innerWidth !== 'undefined' ? innerWidth : undefined,
      viewportHeight: typeof innerHeight !== 'undefined' ? innerHeight : undefined,
      hdr: mq('(dynamic-range: high)'),
      wideGamut: mq('(color-gamut: p3)'),
      isExtended: attempt(() => (screen as unknown as { isExtended?: boolean }).isExtended),
      prefersReducedMotion: mq('(prefers-reduced-motion: reduce)'),
      prefersColorScheme: scheme,
    };
  } catch {
    return null;
  }
}

/** Network Information API snapshot (Chromium desktop + Android; absent elsewhere). */
function probeNetwork(nav: Navigator | undefined): NetworkInfo | undefined {
  if (!nav) return undefined;
  return attempt(() => {
    const conn = (nav as unknown as {
      connection?: { effectiveType?: string; type?: string; downlink?: number; rtt?: number; saveData?: boolean };
    }).connection;
    const online = typeof nav.onLine === 'boolean' ? nav.onLine : undefined;
    if (!conn) return { supported: false, online };
    return {
      supported: true,
      effectiveType: str(conn.effectiveType),
      type: str(conn.type),
      downlinkMbps: num(conn.downlink),
      rttMs: num(conn.rtt),
      saveData: typeof conn.saveData === 'boolean' ? conn.saveData : undefined,
      online,
    };
  });
}

/** Time zone + locale from Intl; the offset from Date. */
function probeLocale(): LocaleInfo | undefined {
  return attempt(() => {
    const resolved = Intl.DateTimeFormat().resolvedOptions();
    return {
      timeZone: str(resolved.timeZone),
      timeZoneOffsetMinutes: new Date().getTimezoneOffset(),
      locale: str(resolved.locale),
      calendar: str(resolved.calendar),
    };
  });
}

async function probeStorage(
  nav: Navigator | undefined,
): Promise<EnvironmentCapture['storage']> {
  try {
    if (!nav?.storage?.estimate) return null;
    const est = await nav.storage.estimate();
    const details = (est as { usageDetails?: Record<string, number> }).usageDetails;
    return {
      quotaBytes: est.quota ?? undefined,
      usageBytes: est.usage ?? undefined,
      usageDetails: details && Object.keys(details).length > 0 ? { ...details } : undefined,
    };
  } catch {
    return null;
  }
}

async function probeBattery(nav: Navigator | undefined): Promise<EnvironmentCapture['power']> {
  try {
    const getBattery = nav && 'getBattery' in nav
      ? (nav as {
          getBattery?: () => Promise<{
            charging: boolean;
            level: number;
            chargingTime?: number;
            dischargingTime?: number;
          }>;
        }).getBattery
      : undefined;
    if (!getBattery) return { batterySupported: false };
    const battery = await getBattery.call(nav);
    const finite = (v: number | undefined): number | undefined =>
      typeof v === 'number' && Number.isFinite(v) ? v : undefined;
    return {
      batterySupported: true,
      charging: battery.charging,
      level: battery.level,
      chargingTimeSec: finite(battery.chargingTime),
      dischargingTimeSec: finite(battery.dischargingTime),
    };
  } catch {
    return { batterySupported: false };
  }
}
