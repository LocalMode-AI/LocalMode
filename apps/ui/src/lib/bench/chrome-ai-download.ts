/**
 * Gemini Nano download shared between the Run button and the Chrome AI lane.
 * Chrome downloads its built-in model once, browser-wide, but only starts
 * that download from a user activation (a click). The Run click therefore
 * kicks it off here, synchronously, before the suite's first await; the
 * chrome-ai adapter waits on the same promise when its cells come up, while
 * the other lanes run in the meantime. No provider package is imported.
 */

export type ChromeAIStatus = 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'unsupported';

interface PromptApiFactory {
  availability(): Promise<string>;
  create(options?: { monitor?: (m: EventTarget) => void }): Promise<{ destroy(): void }>;
}

function factory(): PromptApiFactory | undefined {
  return (globalThis as { LanguageModel?: PromptApiFactory }).LanguageModel;
}

/** `LanguageModel.availability()` folded to the five states the runner cares about. */
export async function chromeAIStatus(): Promise<ChromeAIStatus> {
  const api = factory();
  if (!api) return 'unsupported';
  try {
    const s = await api.availability();
    if (s === 'available' || s === 'downloadable' || s === 'downloading') return s;
    return 'unavailable';
  } catch {
    return 'unsupported';
  }
}

type ProgressListener = (pct: number) => void;

let inflight: Promise<void> | null = null;
let lastPct = 0;
const listeners = new Set<ProgressListener>();

function notify(pct: number): void {
  lastPct = pct;
  for (const l of listeners) l(pct);
}

/**
 * Start Chrome's one-time Gemini Nano download. Must be called synchronously
 * inside a user-activation handler (the Run click); a later call returns the
 * same in-flight promise. Resolves when the model is ready; rejects with
 * Chrome's error (e.g. `NotAllowedError` without an activation).
 *
 * @example
 * <Button onClick={() => { startChromeAIDownload(); void run(); }}>Run</Button>
 */
export function startChromeAIDownload(): Promise<void> | null {
  const api = factory();
  if (!api) return null;
  if (inflight) return inflight;
  inflight = (async () => {
    const session = await api.create({
      monitor(m) {
        m.addEventListener('downloadprogress', ((evt: Event) => {
          const e = evt as Event & { loaded?: number; total?: number };
          const loaded = e.loaded ?? 0;
          const total = e.total && e.total > 0 ? e.total : 1;
          notify(Math.min(100, Math.round((loaded / total) * 1000) / 10));
        }) as EventListener);
      },
    });
    notify(100);
    // The session was only the download trigger; the lane creates its own.
    try {
      session.destroy();
    } catch {
      // Nothing to release.
    }
  })();
  // A failed download surfaces through the chrome-ai lane's error cell, not
  // as an unhandled rejection here.
  inflight.catch(() => {
    inflight = null;
  });
  return inflight;
}

/** The download started by the Run click, if one is in flight (or finished). */
export function chromeAIDownloadInFlight(): Promise<void> | null {
  return inflight;
}

/** Latest download percentage (0 until a progress event arrives, 100 when done). */
export function chromeAIDownloadPct(): number {
  return lastPct;
}

/** Subscribe to download progress; returns the unsubscribe function. */
export function onChromeAIDownloadProgress(listener: ProgressListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
