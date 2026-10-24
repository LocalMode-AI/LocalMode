// @vitest-environment node
/**
 * The `llamacpp-profile` delivery probe: the statistics a request's stamps
 * reduce to, the stamp module wllama's worker imports (run in a separate
 * VM context with a worker-like global, posting real messages through its
 * patched postMessage), and the page-side Worker patch (constructed through
 * the real global `Worker` slot, with a recording base class standing in
 * for the browser's Worker, which Node lacks). The real worker path is
 * exercised by the real-Chrome run of the kind.
 */
import { resolveObjectURL } from 'node:buffer';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { cellProfileError, LLAMACPP_PROFILE_BIN_EDGES_MS } from '@localmode/bench';
import { createDeliveryProbe, deliveryIterationProfile, WORKER_STAMP_SOURCE, type RoundTrip } from '../src/lib/bench/llamacpp-delivery';

const trip = (callbackId: number, send: number, wrecv: number, emit: number, recv: number): RoundTrip => ({ callbackId, send, wrecv, emit, recv });

describe('deliveryIterationProfile()', () => {
  it('finds the token replies from the chunks and times each stage of the delivery path', () => {
    // Three tokens, each one get_result round trip with 640 ms of worker time,
    // with an empty poll between the second and the third.
    const trips = [
      trip(1, 0, 0.2, 640.2, 640.6),
      trip(2, 640.7, 640.9, 1280.9, 1281.4),
      trip(3, 1281.5, 1281.6, 1281.8, 1282.0),
      trip(4, 1282.1, 1282.3, 1922.3, 1922.6),
    ];
    const chunks = [640.8, 1281.7, 1922.9];
    const p = deliveryIterationProfile({ trips, chunks });
    expect(p.tokens).toBe(3);
    expect(p.messages).toBe(4);
    expect(p.chunks).toBe(3);
    expect(p.recvGapMs.n).toBe(2);
    expect(p.recvGapMs.p50).toBeCloseTo(640.8, 3);
    expect(p.recvGapMs.max).toBeCloseTo(641.2, 3);
    expect(p.emitGapMs.p50).toBeCloseTo(640.7, 3);
    expect(p.chunkGapMs.max).toBeCloseTo(641.2, 3);
    expect(p.workerMs.n).toBe(3);
    expect(p.workerMs.p50).toBeCloseTo(640, 3);
    // Transit both ways, free of the clock offset: (recv - send) - (emit - wrecv).
    expect(p.roundTripTransitMs.n).toBe(3);
    expect(p.roundTripTransitMs.max).toBeCloseTo(0.7, 3);
    expect(p.roundTripTransitMs.p50).toBeCloseTo(0.6, 3);
    // Clock offset: the median of ((wrecv - send) + (emit - recv)) / 2 = (0.2 - 0.4) / 2 and so on.
    expect(p.clockOffsetMs).toBeCloseTo(-0.1, 3);
    expect(p.receiptToChunkMs.max).toBeCloseTo(0.3, 3);
    // Page turnaround over every reply: receipt to the next send.
    expect(p.pageTurnaroundMs.n).toBe(3);
    expect(p.pageTurnaroundMs.max).toBeCloseTo(0.1, 3);
    expect(p.workerMs.histogram).toEqual(LLAMACPP_PROFILE_BIN_EDGES_MS.map((e) => (e === 500 ? 3 : 0)));
    const profile = { kind: 'llamacpp-delivery' as const, binEdgesMs: [...LLAMACPP_PROFILE_BIN_EDGES_MS], iterations: [p] };
    expect(cellProfileError({ runtimeId: 'wllama', profile }, { kind: 'llamacpp-profile' })).toBeUndefined();
  });

  it('an empty request gives zero counts and empty statistics', () => {
    const p = deliveryIterationProfile({ trips: [], chunks: [] });
    expect([p.tokens, p.messages, p.chunks, p.recvGapMs.n, p.roundTripTransitMs.n]).toEqual([0, 0, 0, 0, 0]);
    expect(p.clockOffsetMs).toBeUndefined();
  });
});

describe('the worker stamp module', () => {
  it('stamps the receipt of each request and the emission of its reply, leaving other messages alone', () => {
    const posted: unknown[] = [];
    const listeners: Array<(e: { data: unknown }) => void> = [];
    let clock = 1000;
    const sandbox = {
      performance: { timeOrigin: 1_000_000, now: () => clock },
      addEventListener: (type: string, fn: (e: { data: unknown }) => void) => type === 'message' && listeners.push(fn),
      postMessage: (data: unknown) => posted.push(data),
      Map,
    };
    const context = createContext(sandbox);
    runInContext(WORKER_STAMP_SOURCE, context);
    // wllama's worker calls the global postMessage; the module replaced it.
    const post = runInContext('postMessage', context) as (d: unknown, t?: unknown) => void;
    for (const fn of listeners) fn({ data: { verb: 'wllama.action', args: ['get_result'], callbackId: 7 } });
    clock = 1640;
    post({ callbackId: 7, result: new Uint8Array(1) });
    post({ verb: 'console.log', args: ['x'] });
    expect(posted[0]).toMatchObject({ callbackId: 7, __lmd: { wrecv: 1_001_000, emit: 1_001_640 } });
    expect(posted[1]).toEqual({ verb: 'console.log', args: ['x'] });
  });
});

describe('createDeliveryProbe()', () => {
  it('while armed, wraps a Blob-URL module worker in a module importing the stamp module first, and records each round trip of an open request', async () => {
    const constructed: Array<{ url: string; options?: WorkerOptions }> = [];
    class RecordingWorker extends EventTarget {
      sent: unknown[] = [];
      constructor(url: string | URL, options?: WorkerOptions) {
        super();
        constructed.push({ url: String(url), options });
      }
      postMessage(message: unknown) {
        this.sent.push(message);
      }
    }
    const g = globalThis as { Worker?: unknown };
    const previous = g.Worker;
    g.Worker = RecordingWorker;
    try {
      const probe = createDeliveryProbe();
      probe.arm();
      const W = g.Worker as new (url: string, options?: WorkerOptions) => RecordingWorker;
      const worker = new W('blob:nodedata:wllama-worker', { type: 'module' });
      const plain = new W('https://example.com/other.js');
      probe.disarm();
      expect(g.Worker).toBe(RecordingWorker);
      expect(probe.attached).toBe(true);
      expect(constructed[1]).toEqual({ url: 'https://example.com/other.js', options: undefined });
      // The wrapper imports the stamp module, then wllama's own worker code.
      const wrapper = await resolveObjectURL(constructed[0].url)!.text();
      const imports = [...wrapper.matchAll(/import "([^"]+)";/g)].map((m) => m[1]);
      expect(imports[1]).toBe('blob:nodedata:wllama-worker');
      expect(await resolveObjectURL(imports[0])!.text()).toBe(WORKER_STAMP_SOURCE);
      expect(constructed[0].options).toEqual({ type: 'module' });
      expect(plain).toBeInstanceOf(RecordingWorker);

      probe.startRequest();
      worker.postMessage({ verb: 'wllama.action', args: [], callbackId: 3 });
      worker.dispatchEvent(Object.assign(new Event('message'), { data: { callbackId: 3, __lmd: { wrecv: 1, emit: 2 } } }));
      probe.chunk();
      const stamps = probe.endRequest()!;
      expect(stamps.trips).toHaveLength(1);
      expect(stamps.trips[0]).toMatchObject({ callbackId: 3, wrecv: 1, emit: 2 });
      expect(typeof stamps.trips[0].send).toBe('number');
      expect(stamps.trips[0].recv).toBeGreaterThanOrEqual(stamps.trips[0].send!);
      expect(stamps.chunks).toHaveLength(1);
      // Outside a request nothing is recorded.
      worker.dispatchEvent(Object.assign(new Event('message'), { data: { callbackId: 4 } }));
      expect(probe.endRequest()).toBeNull();
    } finally {
      g.Worker = previous;
    }
  });
});
