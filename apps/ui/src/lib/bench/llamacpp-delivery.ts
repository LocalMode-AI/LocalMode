/**
 * Token delivery stamps for the llama.cpp lanes on the `llamacpp-profile`
 * control kind.
 *
 * wllama runs llama.cpp in a module worker it builds from a Blob URL and
 * drives it by request and reply: one `wllama.action` request per call, each
 * answered by one reply carrying the request's `callbackId`. A streamed
 * completion is a polling loop of `get_result` round trips; a reply that
 * carries a token leads the provider to hand a chunk to the runner. Five
 * stamps per round trip, all on the shared clock
 * `performance.timeOrigin + performance.now()`, locate the time a token
 * spends between llama.cpp and the runner:
 *
 *   send  - the page posts the request          (page)
 *   wrecv - the worker receives it              (worker)
 *   emit  - the worker posts the reply          (worker)
 *   recv  - the page receives the reply         (page)
 *   chunk - the provider yields the token text  (page)
 *
 * The worker stamps come from a small module imported ahead of wllama's own
 * worker code: while armed, the page's `Worker` constructor wraps every
 * Blob-URL module worker in a module that imports the stamp module, then the
 * original. The stamp module listens for requests before wllama's handler is
 * installed and patches the worker's `postMessage`, adding `__lmd: { wrecv,
 * emit }` to every reply (wllama ignores unknown fields). The page stamps
 * `send` by wrapping the worker's `postMessage` and `recv` with a message
 * listener added in the constructor, ahead of wllama's own `onmessage`.
 * Nothing else in wllama changes. Pure functions turn a request's stamps into
 * the per-iteration statistics a run file carries. The page's and the
 * worker's clocks can be a fraction of a millisecond apart, so every
 * statistic pairs stamps of one clock, except the round trip's transit,
 * which cancels the offset; the offset itself is estimated as well.
 */

import { LLAMACPP_PROFILE_BIN_EDGES_MS, summarizeGaps, type LlamaCppIterationProfile } from '@localmode/bench';

/** The shared clock: epoch milliseconds with sub-millisecond resolution, comparable across page and worker. */
export function sharedNow(): number {
  return performance.timeOrigin + performance.now();
}

/** Source of the module a stamped worker imports before wllama's worker code. */
export const WORKER_STAMP_SOURCE = `
const now = () => performance.timeOrigin + performance.now();
const received = new Map();
globalThis.addEventListener('message', (e) => {
  const d = e.data;
  if (d && typeof d === 'object' && d.callbackId !== undefined) received.set(d.callbackId, now());
});
const post = globalThis.postMessage.bind(globalThis);
globalThis.postMessage = function (data, transfer) {
  if (data && typeof data === 'object' && data.callbackId !== undefined) {
    const wrecv = received.get(data.callbackId);
    received.delete(data.callbackId);
    data.__lmd = { wrecv: wrecv === undefined ? null : wrecv, emit: now() };
  }
  return post(data, transfer);
};
`;

/** One request and reply pair, as stamped. */
export interface RoundTrip {
  callbackId: number | string;
  send: number | null;
  wrecv: number | null;
  emit: number | null;
  recv: number;
}

/** The stamps of one profiled request. */
export interface RequestStamps {
  /** Replies received while the request ran, in order. */
  trips: RoundTrip[];
  /** Times the provider yielded a non-empty chunk. */
  chunks: number[];
}

/** Consecutive differences. */
function diffs(values: number[]): number[] {
  return values.slice(1).map((v, i) => v - values[i]);
}

/**
 * The delivery statistics of one request: which replies carried a token
 * (the latest reply received at or before each chunk), then the gaps and
 * the stage durations over those replies.
 *
 * @param stamps - The request's stamps.
 * @returns The iteration entry of a `llamacpp-delivery` profile.
 */
export function deliveryIterationProfile(stamps: RequestStamps): LlamaCppIterationProfile {
  const trips = [...stamps.trips].sort((a, b) => a.recv - b.recv);
  const chunks = [...stamps.chunks].sort((a, b) => a - b);
  const tokenTrips = new Set<RoundTrip>();
  const receiptToChunk: number[] = [];
  let j = -1;
  for (const c of chunks) {
    while (j + 1 < trips.length && trips[j + 1].recv <= c) j++;
    if (j < 0) continue;
    tokenTrips.add(trips[j]);
    receiptToChunk.push(c - trips[j].recv);
  }
  const tokens = trips.filter((t) => tokenTrips.has(t));
  const num = (v: number | null): v is number => typeof v === 'number' && Number.isFinite(v);
  const emits = tokens.map((t) => t.emit).filter(num);
  const turnaround: number[] = [];
  for (let i = 0; i + 1 < trips.length; i++) {
    const next = trips[i + 1].send;
    if (num(next)) turnaround.push(next - trips[i].recv);
  }
  const complete = tokens.filter((t) => num(t.send) && num(t.wrecv) && num(t.emit)) as Array<RoundTrip & { send: number; wrecv: number; emit: number }>;
  const offsets = complete.map((t) => (t.wrecv - t.send + (t.emit - t.recv)) / 2).sort((a, b) => a - b);
  return {
    tokens: tokens.length,
    chunks: chunks.length,
    messages: trips.length,
    emitGapMs: summarizeGaps(diffs(emits)),
    recvGapMs: summarizeGaps(diffs(tokens.map((t) => t.recv))),
    chunkGapMs: summarizeGaps(diffs(chunks)),
    workerMs: summarizeGaps(tokens.filter((t) => num(t.wrecv) && num(t.emit)).map((t) => (t.emit as number) - (t.wrecv as number))),
    roundTripTransitMs: summarizeGaps(complete.map((t) => t.recv - t.send - (t.emit - t.wrecv))),
    receiptToChunkMs: summarizeGaps(receiptToChunk),
    pageTurnaroundMs: summarizeGaps(turnaround),
    ...(offsets.length > 0 ? { clockOffsetMs: Math.round(offsets[Math.ceil(offsets.length / 2) - 1] * 1000) / 1000 } : {}),
  };
}

/** A worker the probe stamped, with what it saw. */
interface StampedWorkerRecord {
  sends: Map<number | string, number>;
  onTrip: ((trip: RoundTrip) => void) | null;
}

/**
 * The delivery probe of one llama.cpp model: arm it before wllama starts its
 * worker, disarm it once the worker exists, and record each profiled
 * request between `startRequest()` and `endRequest()`.
 */
export interface DeliveryProbe {
  /** Patch the page's `Worker` so every Blob-URL module worker created until `disarm()` is stamped. */
  arm(): void;
  /** Restore the page's `Worker` (the stamped worker keeps its stamps). */
  disarm(): void;
  /** Whether a worker was stamped. */
  readonly attached: boolean;
  startRequest(): void;
  /** Stamp a chunk of the open request. */
  chunk(): void;
  /** Close the open request and return its stamps. */
  endRequest(): RequestStamps | null;
}

/**
 * Create a delivery probe (browser only).
 *
 * @returns The probe.
 */
export function createDeliveryProbe(): DeliveryProbe {
  let original: typeof Worker | null = null;
  let stampedWorkers = 0;
  let stampUrl: string | null = null;
  let open: RequestStamps | null = null;

  const stamp = (trip: RoundTrip) => {
    if (open) open.trips.push(trip);
  };

  return {
    arm() {
      if (original || typeof Worker === 'undefined') return;
      const Base = Worker;
      original = Base;
      stampUrl ??= URL.createObjectURL(new Blob([WORKER_STAMP_SOURCE], { type: 'text/javascript' }));
      const moduleUrl = stampUrl;
      const probeRecord: StampedWorkerRecord = { sends: new Map(), onTrip: stamp };
      // Every Blob-URL module worker created while armed is stamped (wllama may
      // start helpers besides its llama.cpp worker); only replies carrying a
      // callbackId are recorded, and only while a request is open.
      class StampedWorker extends Base {
        constructor(url: string | URL, options?: WorkerOptions) {
          const href = String(url);
          const stamped = options?.type === 'module' && href.startsWith('blob:');
          const target = stamped
            ? URL.createObjectURL(
                new Blob([`import ${JSON.stringify(moduleUrl)};\nimport ${JSON.stringify(href)};\n`], { type: 'text/javascript' }),
              )
            : url;
          super(target, options);
          if (!stamped) return;
          stampedWorkers++;
          const post = this.postMessage.bind(this) as (message: unknown, transfer?: Transferable[] | StructuredSerializeOptions) => void;
          this.postMessage = ((message: unknown, transfer?: Transferable[] | StructuredSerializeOptions) => {
            const id = (message as { callbackId?: number | string } | null)?.callbackId;
            if (id !== undefined) probeRecord.sends.set(id, sharedNow());
            post(message, transfer);
          }) as Worker['postMessage'];
          this.addEventListener('message', (e: MessageEvent) => {
            const recv = sharedNow();
            const data = e.data as { callbackId?: number | string; __lmd?: { wrecv: number | null; emit: number } } | null;
            if (!data || data.callbackId === undefined) return;
            const send = probeRecord.sends.get(data.callbackId) ?? null;
            probeRecord.sends.delete(data.callbackId);
            probeRecord.onTrip?.({
              callbackId: data.callbackId,
              send,
              wrecv: data.__lmd?.wrecv ?? null,
              emit: data.__lmd?.emit ?? null,
              recv,
            });
          });
        }
      }
      (globalThis as { Worker: typeof Worker }).Worker = StampedWorker;
    },
    disarm() {
      if (!original) return;
      (globalThis as { Worker: typeof Worker }).Worker = original;
      original = null;
    },
    get attached() {
      return stampedWorkers > 0;
    },
    startRequest() {
      open = { trips: [], chunks: [] };
    },
    chunk() {
      open?.chunks.push(sharedNow());
    },
    endRequest() {
      const done = open;
      open = null;
      return done;
    },
  };
}

/** Histogram bin edges every delivery profile carries. */
export const DELIVERY_BIN_EDGES_MS = LLAMACPP_PROFILE_BIN_EDGES_MS;
