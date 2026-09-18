import { describe, expect, it } from 'vitest';
import { runFingerprint } from '../src/fingerprint.js';

describe('runFingerprint()', () => {
  it('runs the deterministic matmul and reports plausible throughput', async () => {
    const fp = await runFingerprint({ n: 64, minDurationMs: 60 });
    expect(fp.iterations).toBeGreaterThan(0);
    expect(fp.durationMs).toBeGreaterThanOrEqual(60);
    expect(fp.mflops).toBeGreaterThan(1);
    expect(Number.isFinite(fp.checksum)).toBe(true);
  }, 20_000);

  it('produces the identical checksum across runs (deterministic inputs)', async () => {
    const a = await runFingerprint({ n: 64, minDurationMs: 20 });
    const b = await runFingerprint({ n: 64, minDurationMs: 20 });
    expect(a.checksum).toBe(b.checksum);
  }, 20_000);
});
