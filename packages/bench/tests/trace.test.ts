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
