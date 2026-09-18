/**
 * Unit tests for the bench store helpers (index aggregation, run paths,
 * nonce) — pure logic; the GitHub network boundary is exercised by the
 * opt-in integration script (see bench-store docs) and the e2e dev-mode lane.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RunIndexEntry } from '../src/lib/bench/store';
import { aggregateIndex } from '../src/lib/bench/store';
import { issueNonce, verifyNonce, NONCE_MAX_AGE_MS } from '../src/lib/bench/nonce';

function entry(overrides: Partial<RunIndexEntry> & { runId: string }): RunIndexEntry {
  return {
    createdAt: '2026-07-16T00:00:00.000Z',
    suite: 'quick',
    deviceClass: 'macos/apple-metal-3',
    browser: 'Chrome',
    browserVersion: '140',
    os: 'macOS',
    gpuVendor: 'apple',
    flagged: false,
    path: `runs/2026/07/${overrides.runId}.json`,
    cells: [
      {
        cellId: 'wllama/qwen3-0.6b/chat-pp128-tg128',
        runtimeId: 'wllama',
        benchModelId: 'qwen3-0.6b',
        modelName: 'Qwen3 0.6B (GGUF Q4_K_M)',
        workloadId: 'chat-pp128-tg128',
        resolvedBackend: 'wasm',
        ttftMs: 500,
        decodeCharsPerSec: 90,
        loadMs: 12_000,
        loadCached: false,
        highVariance: false,
      },
    ],
    ...overrides,
  };
}

describe('aggregateIndex()', () => {
  it('groups by (device, runtime, model, workload) and medians across runs', () => {
    const rows = aggregateIndex([
      entry({ runId: 'a' }),
      entry({ runId: 'b', cells: [{ ...entry({ runId: 'x' }).cells[0], ttftMs: 700 }] }),
      entry({ runId: 'c', cells: [{ ...entry({ runId: 'x' }).cells[0], ttftMs: 600 }] }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].submissions).toBe(3);
    expect(rows[0].ttftMs).toBe(600);
    expect(rows[0].provisional).toBe(false);
    expect(rows[0].loadColdMs).toBe(12_000);
  });

  it('excludes flagged entries and marks small groups provisional', () => {
    const rows = aggregateIndex([entry({ runId: 'a' }), entry({ runId: 'bad', flagged: true })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].submissions).toBe(1);
    expect(rows[0].provisional).toBe(true);
  });

  it('routes warm loads to loadWarmMs', () => {
    const warm = entry({ runId: 'w' });
    warm.cells[0] = { ...warm.cells[0], loadCached: true, loadMs: 900 };
    const rows = aggregateIndex([warm]);
    expect(rows[0].loadWarmMs).toBe(900);
    expect(rows[0].loadColdMs).toBeUndefined();
  });
});

describe('nonce', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('round-trips with a secret and rejects tampering + expiry', () => {
    vi.stubEnv('BENCH_NONCE_SECRET', 'test-secret');
    const nonce = issueNonce(1_000_000);
    expect(verifyNonce(nonce, 1_000_000 + 60_000)).toBe(true);
    expect(verifyNonce(nonce + '0', 1_000_000)).toBe(false);
    expect(verifyNonce(nonce.replace(/^\d/, '9'), 1_000_000)).toBe(false);
    expect(verifyNonce(nonce, 1_000_000 + NONCE_MAX_AGE_MS + 1)).toBe(false);
  });

  it('rejects future-dated nonces beyond clock skew', () => {
    vi.stubEnv('BENCH_NONCE_SECRET', 'test-secret');
    const nonce = issueNonce(2_000_000);
    expect(verifyNonce(nonce, 2_000_000 - 120_000)).toBe(false);
  });

  it('uses dev nonces only when no secret is configured', () => {
    vi.stubEnv('BENCH_NONCE_SECRET', '');
    const dev = issueNonce();
    expect(dev.startsWith('dev.')).toBe(true);
    expect(verifyNonce(dev)).toBe(true);
    vi.stubEnv('BENCH_NONCE_SECRET', 'now-set');
    expect(verifyNonce(dev)).toBe(false);
  });
});
