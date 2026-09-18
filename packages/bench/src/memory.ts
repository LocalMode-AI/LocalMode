/**
 * Memory sampling at protocol points (baseline / post-load / post-run).
 * Uses `performance.measureUserAgentSpecificMemory()` (Chromium, requires
 * cross-origin isolation, resolves at the next GC — up to ~20 s), with the
 * legacy Chromium JS-heap as fallback. Never call inside a timed region.
 */

/** Which memory API is usable in this context. */
export function memoryApiAvailable(): 'uaSpecific' | 'legacyHeap' | 'none' {
  if (
    typeof performance !== 'undefined' &&
    'measureUserAgentSpecificMemory' in performance &&
    typeof crossOriginIsolated !== 'undefined' &&
    crossOriginIsolated
  ) {
    return 'uaSpecific';
  }
  if (
    typeof performance !== 'undefined' &&
    'memory' in performance &&
    typeof (performance as { memory?: { usedJSHeapSize?: number } }).memory?.usedJSHeapSize ===
      'number'
  ) {
    return 'legacyHeap';
  }
  return 'none';
}

/**
 * Sample total page memory in bytes, or null when unavailable / timed out.
 * The UA-specific measurement is raced against `timeoutMs` because it only
 * resolves at the next garbage collection.
 *
 * @param timeoutMs - Max wait for the GC-gated measurement (default 25000).
 * @example
 * const bytes = await sampleMemoryBytes(); // 734003200 | null
 */
export async function sampleMemoryBytes(timeoutMs = 25_000): Promise<number | null> {
  const api = memoryApiAvailable();
  if (api === 'uaSpecific') {
    try {
      const result = await Promise.race([
        (
          performance as unknown as {
            measureUserAgentSpecificMemory: () => Promise<{ bytes: number }>;
          }
        ).measureUserAgentSpecificMemory(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
      ]);
      if (result && typeof result.bytes === 'number') return result.bytes;
    } catch {
      // fall through to legacy
    }
  }
  if (api !== 'none') {
    const legacy = (performance as { memory?: { usedJSHeapSize?: number } }).memory;
    if (typeof legacy?.usedJSHeapSize === 'number') return legacy.usedJSHeapSize;
  }
  return null;
}
