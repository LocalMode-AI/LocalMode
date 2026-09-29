/**
 * Suite-level trace recorder. The Compute Pressure observer reports a sample
 * every second whether or not the state moved; a 10-minute thorough run on
 * an M1 Pro (51876c89) carried 1,662 `pressure-change` events, 1,090 of them
 * repeating "nominal". Only genuine transitions belong in the trace.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { TraceRecorder } from '../src/trace.js';

type Callback = (records: Array<{ state: string }>) => void;

function installFakePressureObserver(): { emit: (state: string) => void; observed: string[] } {
  const observed: string[] = [];
  let callback: Callback | undefined;
  class FakePressureObserver {
    constructor(cb: Callback) {
      callback = cb;
    }
    async observe(source: string) {
      observed.push(source);
    }
    disconnect() {}
  }
  (globalThis as { PressureObserver?: unknown }).PressureObserver = FakePressureObserver;
  return { emit: (state) => callback?.([{ state }]), observed };
}

afterEach(() => {
  delete (globalThis as { PressureObserver?: unknown }).PressureObserver;
});

describe('TraceRecorder compute pressure', () => {
  it('records a pressure-change event only when the state actually changes', async () => {
    const fake = installFakePressureObserver();
    const trace = new TraceRecorder();
    await trace.attach();
    expect(fake.observed).toEqual(['cpu']);

    for (const state of ['nominal', 'nominal', 'nominal', 'fair', 'fair', 'serious', 'nominal', 'nominal']) {
      fake.emit(state);
    }
    const pressure = trace.all.filter((e) => e.type === 'pressure-change').map((e) => e.detail);
    expect(pressure).toEqual(['nominal', 'fair', 'serious', 'nominal']);
    // The live gate still sees the latest sample even when nothing was recorded.
    expect(trace.pressureState).toBe('nominal');
    await trace.dispose();
  });
});

/**
 * Screen wake lock. WebKit (Safari on macOS and iOS) grants
 * `navigator.wakeLock.request('screen')` only with a user activation, so the
 * request a series run makes after its automatic reload is rejected with
 * NotAllowedError while Chromium and Gecko grant it. The trace records the
 * denial explicitly and re-requests the lock on the next user interaction.
 */
describe('TraceRecorder screen wake lock', () => {
  type Sentinel = { release(): Promise<void>; addEventListener(t: string, cb: () => void): void; released: boolean };
  let activated = false;
  let requests = 0;
  const makeSentinel = (): Sentinel => {
    const listeners: Array<() => void> = [];
    const s: Sentinel = {
      released: false,
      async release() {
        s.released = true;
        for (const cb of listeners) cb();
      },
      addEventListener(_t, cb) {
        listeners.push(cb);
      },
    };
    return s;
  };
  /** A WebKit-like lock: rejects unless the call happens during a user activation. */
  function installWakeLock(policy: 'activation' | 'always' | 'never'): Sentinel[] {
    const granted: Sentinel[] = [];
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        request(type: string) {
          requests++;
          expect(type).toBe('screen');
          if (policy === 'always' || (policy === 'activation' && activated)) {
            const s = makeSentinel();
            granted.push(s);
            return Promise.resolve(s);
          }
          return Promise.reject(new DOMException('Permission was denied', 'NotAllowedError'));
        },
      },
    });
    return granted;
  }
  /** Dispatch an interaction the way a browser does: activation is transient, held only during the handler. */
  function interact(type: string): void {
    activated = true;
    window.dispatchEvent(new Event(type));
    activated = false;
  }
  const flush = () => new Promise((r) => setTimeout(r, 0));

  afterEach(() => {
    delete (navigator as { wakeLock?: unknown }).wakeLock;
    activated = false;
    requests = 0;
  });

  it('records a granted lock as wakelock-acquired without detail and no denial', async () => {
    installWakeLock('always');
    const trace = new TraceRecorder();
    await trace.attach();
    const lock = trace.all.filter((e) => e.type.startsWith('wakelock'));
    expect(lock).toEqual([{ t: expect.any(Number), type: 'wakelock-acquired' }]);
    await trace.dispose();
    expect(trace.all.map((e) => e.type)).toContain('wakelock-released');
  });

  it('records a rejected request as wakelock-denied with the error name', async () => {
    installWakeLock('never');
    const trace = new TraceRecorder();
    await trace.attach();
    const lock = trace.all.filter((e) => e.type.startsWith('wakelock'));
    expect(lock).toEqual([{ t: expect.any(Number), type: 'wakelock-denied', detail: 'NotAllowedError' }]);
    await trace.dispose();
  });

  it('re-requests the lock on the next user interaction and records it as acquired by user activation', async () => {
    const granted = installWakeLock('activation');
    const trace = new TraceRecorder();
    await trace.attach();
    expect(granted).toHaveLength(0);
    interact('pointerdown');
    await flush();
    expect(granted).toHaveLength(1);
    expect(trace.all.filter((e) => e.type.startsWith('wakelock')).map((e) => [e.type, e.detail])).toEqual([
      ['wakelock-denied', 'NotAllowedError'],
      ['wakelock-acquired', 'user-activation'],
    ]);
    // Once held, later interactions request nothing more.
    const before = requests;
    interact('keydown');
    await flush();
    expect(requests).toBe(before);
    await trace.dispose();
    expect(granted[0].released).toBe(true);
  });

  it('keeps listening after an interaction that is not a user activation', async () => {
    const granted = installWakeLock('activation');
    const trace = new TraceRecorder();
    await trace.attach();
    window.dispatchEvent(new Event('pointerdown')); // no activation (a touch pointerdown is not one)
    await flush();
    expect(granted).toHaveLength(0);
    interact('touchend');
    await flush();
    expect(granted).toHaveLength(1);
    expect(trace.all.filter((e) => e.type === 'wakelock-denied')).toHaveLength(1);
    await trace.dispose();
  });

  it('stops listening on dispose', async () => {
    const granted = installWakeLock('activation');
    const trace = new TraceRecorder();
    await trace.attach();
    await trace.dispose();
    const before = requests;
    interact('pointerdown');
    await flush();
    expect(requests).toBe(before);
    expect(granted).toHaveLength(0);
    expect(trace.all.some((e) => e.type === 'wakelock-acquired')).toBe(false);
  });
});
