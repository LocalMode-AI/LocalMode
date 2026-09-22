/**
 * Unit tests for the bench store helpers (index aggregation, run paths,
 * nonce) — pure logic; the GitHub network boundary is exercised by the
 * opt-in integration script (see bench-store docs) and the e2e dev-mode lane.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RunIndexEntry } from '../src/lib/bench/store';
import { aggregateIndex, rateLimitWithRetry, SUBMIT_RATE_LIMIT, SUBMIT_RATE_WINDOW_SEC, toIndexEntry } from '../src/lib/bench/store';
import { summarizeRun, type BenchRunResult } from '@localmode/bench';
import { issueNonce, verifyNonce, NONCE_MAX_AGE_MS } from '../src/lib/bench/nonce';

function entry(overrides: Partial<RunIndexEntry> & { runId: string }): RunIndexEntry {
  return {
    createdAt: '2026-07-16T00:00:00.000Z',
    protocol: 'localmode-bench/4',
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
  it('groups by the GPU-model subclass, derived for entries written before it existed', () => {
    const rows = aggregateIndex([
      entry({ runId: 'm1a', gpuModel: 'Apple M1 Pro' }),
      entry({ runId: 'm1b', gpuModel: 'Apple M1 Pro', deviceSubclass: 'macos/apple-m1-pro' }),
      entry({ runId: 'm4', gpuModel: 'Apple M4 Max' }),
      // No GPU model at all (pre-0.3.0 entry): stays in the coarse class.
      entry({ runId: 'old' }),
    ]);
    expect(rows.map((r) => [r.deviceClass, r.deviceSubclass, r.submissions])).toEqual([
      ['macos/apple-metal-3', 'macos/apple-m1-pro', 2],
      ['macos/apple-metal-3', 'macos/apple-m4-max', 1],
      ['macos/apple-metal-3', 'macos/apple-metal-3', 1],
    ]);
  });

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

  it('aggregates only runs measured under the current protocol (older or unversioned entries are excluded)', () => {
    // Metric definitions changed between protocol versions; mixing them in one
    // row would average incomparable numbers. Pre-v2 index entries carry no
    // protocol field at all.
    const v1 = entry({ runId: 'v1' });
    delete (v1 as Partial<RunIndexEntry>).protocol;
    const rows = aggregateIndex([
      entry({ runId: 'current' }),
      v1,
      entry({ runId: 'archived-v2', protocol: 'localmode-bench/2' }),
      entry({ runId: 'archived-v3', protocol: 'localmode-bench/3' }),
      entry({ runId: 'future', protocol: 'localmode-bench/5' }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].submissions).toBe(1);
  });

  it('routes warm loads to loadWarmMs', () => {
    const warm = entry({ runId: 'w' });
    warm.cells[0] = { ...warm.cells[0], loadCached: true, loadMs: 900 };
    const rows = aggregateIndex([warm]);
    expect(rows[0].loadWarmMs).toBe(900);
    expect(rows[0].loadColdMs).toBeUndefined();
  });
});

describe('toIndexEntry() → aggregateIndex() (protocol v2 fields)', () => {
  /** A v2 run: one terminal-burst chat cell (LiteRT shape) and one MMLU cell with a parse rate. */
  function v2Run(): BenchRunResult {
    const model = {
      benchModelId: 'qwen3-0.6b',
      runtimeId: 'litert' as const,
      providerModelId: 'qwen3-0.6B',
      displayName: 'Qwen3 0.6B (LiteRT)',
      task: 'llm' as const,
      sizeBytes: 614_236_160,
    };
    return {
      protocol: 'localmode-bench/4',
      schemaVersion: 3,
      runId: 'run-v2-0001',
      createdAt: '2026-09-19T00:00:00.000Z',
      harness: { name: '@localmode/bench', version: '0.2.0' },
      suite: 'standard',
      environment: {
        capturedAt: '2026-09-19T00:00:00.000Z',
        browser: { name: 'Chrome', version: '145', source: 'ua-ch' },
        os: { platform: 'macOS', version: '15.5' },
        hardware: { cores: 10, coresClamped: false, deviceMemoryGB: 8, deviceMemoryCapped: true },
        gpu: { available: true, vendor: 'apple', architecture: 'metal-3' },
        webglRenderer: 'Apple M3',
        flags: { crossOriginIsolated: true, sharedArrayBuffer: true, wasmSimd: true },
        storage: null,
        power: { batterySupported: false },
        pressure: { supported: false },
        timerResolutionUs: 5,
        screen: null,
      },
      fingerprint: { mflops: 1500, n: 160, iterations: 120, durationMs: 650, checksum: 1.5 },
      cells: [
        {
          cellId: 'litert/qwen3-0.6b/chat-pp128-tg128',
          runtimeId: 'litert',
          model,
          workloadId: 'chat-pp128-tg128',
          workloadKind: 'llm-generate',
          resolvedBackend: 'gpu',
          load: { cached: false, startT: 0, endT: 35_700 },
          // 600 chars delivered as one chunk 30 s in: non-incremental, 20 chars/s end to end.
          iterations: [{ startT: 1000, chunks: [{ t: 30_999, c: 600 }], endT: 31_000, text: 'x'.repeat(600), gates: [] }],
          status: 'ok',
        },
        {
          cellId: 'litert/qwen3-0.6b/quality-mmlu-25',
          runtimeId: 'litert',
          model,
          workloadId: 'quality-mmlu-25',
          workloadKind: 'quality-mmlu',
          resolvedBackend: 'gpu',
          load: null,
          iterations: [],
          quality: { taskId: 'tinymmlu-25', score: 0.36, n: 25, parseRate: 0.6 },
          status: 'ok',
        },
      ],
      events: [],
    };
  }

  it('carries protocol, end-to-end rate, stream flag, and parse rate into the index and the leaderboard row', () => {
    const run = v2Run();
    const entry = toIndexEntry(run, summarizeRun(run), false, 'runs/2026/09/run-v2-0001.json');
    expect(entry.protocol).toBe('localmode-bench/4');
    const chat = entry.cells.find((c) => c.workloadId === 'chat-pp128-tg128')!;
    expect(chat.streamIncremental).toBe(false);
    expect(chat.ttftMs).toBeUndefined();
    expect(chat.decodeCharsPerSec).toBeUndefined();
    expect(chat.overallCharsPerSec).toBeCloseTo(20, 0);
    const quality = entry.cells.find((c) => c.workloadId === 'quality-mmlu-25')!;
    expect(quality.qualityScore).toBe(0.36);
    expect(quality.qualityParseRate).toBe(0.6);

    const rows = aggregateIndex([entry]);
    const chatRow = rows.find((r) => r.workloadId === 'chat-pp128-tg128')!;
    expect(chatRow.decodeCharsPerSec).toBeUndefined();
    expect(chatRow.overallCharsPerSec).toBeCloseTo(20, 0);
    const qualityRow = rows.find((r) => r.workloadId === 'quality-mmlu-25')!;
    expect(qualityRow.qualityScore).toBe(0.36);
    expect(qualityRow.qualityParseRate).toBe(0.6);
  });

  it('carries the device identity, runtime versions, and self-report into the index entry', () => {
    const run = v2Run();
    run.harness = {
      name: '@localmode/bench',
      version: '0.3.0',
      runtimeVersions: { '@litert-lm/core': '0.12.1', '@wllama/wllama': '3.5.1' },
      commit: 'abc1234',
    };
    run.cells[0].runtimeVersion = '0.12.1';
    run.environment = {
      ...run.environment,
      browser: { ...run.environment.browser, engine: 'Blink', webdriver: false },
      os: { ...run.environment.os, architecture: 'arm', model: '' },
      hardware: { ...run.environment.hardware, jsHeapSizeLimitBytes: 4_294_705_152 },
      gpuModel: 'Apple M3',
      device: { type: 'desktop', mobile: false, maxTouchPoints: 0 },
      storage: { quotaBytes: 300_000_000_000 },
      userReportedDevice: 'MacBook Air M3 16GB',
    };
    const entry = toIndexEntry(run, summarizeRun(run), false, 'runs/2026/09/run-v2-0001.json');
    expect(entry).toMatchObject({
      engine: 'Blink',
      osVersion: '15.5',
      architecture: 'arm',
      gpuArchitecture: 'metal-3',
      gpuModel: 'Apple M3',
      deviceSubclass: 'macos/apple-m3',
      deviceType: 'desktop',
      cores: 10,
      deviceMemoryGB: 8,
      jsHeapSizeLimitBytes: 4_294_705_152,
      storageQuotaBytes: 300_000_000_000,
      crossOriginIsolated: true,
      webgpu: true,
      timerResolutionUs: 5,
      webdriver: false,
      harnessVersion: '0.3.0',
      runtimeVersions: { '@litert-lm/core': '0.12.1', '@wllama/wllama': '3.5.1' },
      userReportedDevice: 'MacBook Air M3 16GB',
    });
    // An empty UA-CH model (every non-Android platform) must not become a "" device model.
    expect(entry.deviceModel).toBeUndefined();
    expect(entry.cells[0].runtimeVersion).toBe('0.12.1');
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

describe('rateLimitWithRetry() (in-instance window)', () => {
  afterEach(() => {
    vi.useRealTimers();
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.KV_REST_API_URL;
  });

  it('allows a batch of devices behind one address and then names the wait', async () => {
    // A household running the lab batch, or an office, shares one client
    // address; the earlier limit of 5 per hour rejected the fifth device.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-21T14:00:00.000Z'));
    const key = `submit:test-${Math.random()}`;
    expect(SUBMIT_RATE_LIMIT).toBeGreaterThanOrEqual(20);
    for (let i = 0; i < SUBMIT_RATE_LIMIT; i++) {
      const v = await rateLimitWithRetry(key);
      expect(v.allowed).toBe(true);
    }
    vi.setSystemTime(new Date('2026-09-21T14:10:00.000Z'));
    const rejected = await rateLimitWithRetry(key);
    expect(rejected.allowed).toBe(false);
    // 50 minutes remain of the hour that started with the first attempt.
    expect(rejected.retryAfterSec).toBe(50 * 60);
    // The window opens again exactly when it says.
    vi.setSystemTime(new Date('2026-09-21T15:00:00.001Z'));
    const again = await rateLimitWithRetry(key);
    expect(again.allowed).toBe(true);
    expect(again.retryAfterSec).toBe(SUBMIT_RATE_WINDOW_SEC);
  });
});
