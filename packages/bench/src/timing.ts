/**
 * Wall-clock timing helpers. All benchmark timestamps use `performance.now()`
 * (5 µs resolution on cross-origin-isolated Chromium, coarser elsewhere);
 * decode rates are derived from endpoint timestamps, never from averaged
 * per-token deltas, because per-token gaps sit at or below timer quantization.
 */

/** Monotonic high-resolution timestamp in ms (performance.now, Date fallback). */
export function hrNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/**
 * Infer the effective `performance.now()` quantum by sampling timer deltas.
 * Genuine traces sit on this grid; the value is recorded in the environment
 * capture and used by the timer-grid integrity check.
 *
 * @param samples - Number of distinct increments to observe (default 64).
 * @returns Inferred quantum in microseconds, or null outside a browser.
 * @example
 * const q = inferTimerResolutionUs(); // 5 on isolated Chromium
 */
export function inferTimerResolutionUs(samples = 64): number | null {
  if (typeof performance === 'undefined') return null;
  const deltas: number[] = [];
  let prev = performance.now();
  let guard = 0;
  while (deltas.length < samples && guard < 2_000_000) {
    const t = performance.now();
    if (t > prev) {
      deltas.push(t - prev);
      prev = t;
    }
    guard++;
  }
  if (deltas.length === 0) return null;
  const minDelta = Math.min(...deltas);
  return Math.round(minDelta * 1000 * 100) / 100;
}

/** Await a real delay (setTimeout) — used for cool-downs between cells. */
export function sleep(ms: number, abortSignal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (abortSignal?.aborted) {
      reject(abortDomException());
      return;
    }
    const id = setTimeout(() => {
      abortSignal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(id);
      reject(abortDomException());
    }
    abortSignal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** A DOMException('AbortError') that also works in non-DOM environments. */
export function abortDomException(): Error {
  if (typeof DOMException !== 'undefined') return new DOMException('Aborted', 'AbortError');
  const err = new Error('Aborted');
  err.name = 'AbortError';
  return err;
}
