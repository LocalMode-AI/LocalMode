/**
 * Task-run fixtures: a hand-built `chrome-ai-tasks` run whose items, hashes
 * and timings are known, so each validator rule can be exercised by changing
 * one field.
 */

import type {
  BenchCellResult,
  BenchRunResult,
  TaskIteration,
  TaskKind,
  TaskSessionRecord,
} from '../../src/types.js';
import { BENCH_PROTOCOL_VERSION, BENCH_SCHEMA_VERSION, TASKS_PROTOCOL_VERSION } from '../../src/types.js';
import { sha256HexSync } from '../../src/tasks/sha256.js';
import { makeEnvironment } from '../helpers.js';

/** A streamed item: startT, three delta chunks 100 ms apart from startT + 200, endT 50 ms after the last. */
export function streamedItem(index: number, itemId: string, startT: number, text = 'Alpha beta gamma.', source?: string): TaskIteration {
  const parts = [text.slice(0, 5), text.slice(5, 10), text.slice(10)];
  const input = source ?? `Input text of item ${itemId}.`;
  return {
    itemId,
    index,
    startT,
    chunks: parts.map((p, i) => ({ t: startT + 200 + i * 100, c: p.length })),
    chunkMode: 'delta',
    endT: startT + 450,
    text,
    outputSha256: sha256HexSync(text),
    inputChars: input.length,
    sourceSha256: sha256HexSync(input),
    gates: [],
  };
}

/** A non-streaming item: one chunk `{ t: endT, c: text.length }`. */
export function flatItem(index: number, itemId: string, startT: number, durationMs: number, text: string, input = `Input ${itemId}`): TaskIteration {
  return {
    itemId,
    index,
    startT,
    chunks: [{ t: startT + durationMs, c: text.length }],
    chunkMode: 'none',
    endT: startT + durationMs,
    text,
    outputSha256: sha256HexSync(text),
    inputChars: input.length,
    sourceSha256: sha256HexSync(input),
    gates: [],
  };
}

export function tasksRecord(overrides: Partial<TaskSessionRecord> = {}): TaskSessionRecord {
  return {
    protocol: TASKS_PROTOCOL_VERSION,
    phase: 'latency',
    task: 'summarize',
    set: 'cnndm-test',
    subset: 'L',
    itemList: { id: 'summarize-cnndm-L', count: 3, sha256: 'a'.repeat(64) },
    sessionIndex: 1,
    order: 'fixed',
    systemOrder: ['chrome-ai/chrome-summarizer', 'transformers-wasm/distilbart-cnn-6-6@q8'],
    processCold: true,
    ...overrides,
  };
}

function cell(runtimeId: 'chrome-ai' | 'transformers-wasm' | 'mediapipe', systemId: string, workloadId: string, kind: TaskKind, iterations: TaskIteration[], base: number): BenchCellResult {
  return {
    cellId: `${runtimeId}/${systemId}/${workloadId}`,
    runtimeId,
    model: { benchModelId: systemId, runtimeId, providerModelId: systemId, displayName: systemId, task: 'task' },
    workloadId,
    workloadKind: kind,
    resolvedBackend: runtimeId === 'chrome-ai' ? 'chrome-builtin' : 'wasm',
    load: { cached: true, startT: base, endT: base + 50 },
    iterations,
    status: 'ok',
    task: {
      api: runtimeId === 'chrome-ai' ? 'Summarizer' : 'transformers.js summarization',
      ...(runtimeId === 'chrome-ai'
        ? { availabilityBefore: 'available', availabilityAtCreate: 'available', availabilityAfter: 'available', inputQuota: 6000 }
        : {}),
    },
  };
}

/** A valid two-arm summarize session: the built-in streams, the fallback does not. */
export function makeTaskRun(overrides: Partial<BenchRunResult> = {}): BenchRunResult {
  const tasks = tasksRecord();
  const builtIn = cell('chrome-ai', 'chrome-summarizer', 'summarize-cnndm-L', 'summarize', [
    streamedItem(0, 'cnn/1', 1000),
    streamedItem(1, 'cnn/2', 2000),
    streamedItem(2, 'cnn/3', 3000),
  ], 900);
  const fallback = cell('transformers-wasm', 'distilbart-cnn-6-6@q8', 'summarize-cnndm-L', 'summarize', [
    flatItem(0, 'cnn/1', 5000, 900, 'Summary one.'),
    flatItem(1, 'cnn/2', 6000, 800, 'Summary two.'),
    flatItem(2, 'cnn/3', 7000, 850, 'Summary three.'),
  ], 4000);
  return {
    protocol: BENCH_PROTOCOL_VERSION,
    schemaVersion: BENCH_SCHEMA_VERSION,
    runId: 'task-run-fixture-01',
    createdAt: '2026-10-28T00:00:00.000Z',
    harness: {
      name: '@localmode/bench',
      version: '0.10.0',
      control: { kind: 'chrome-ai-tasks', runtimeOrder: ['chrome-ai', 'transformers-wasm'], tasks },
    },
    suite: 'custom',
    environment: makeEnvironment(),
    fingerprint: { mflops: 1500, n: 160, iterations: 120, durationMs: 650, checksum: 1.5 },
    cells: [builtIn, fallback],
    events: [
      { t: 0, type: 'suite-start' },
      { t: 500, type: 'preflight', detail: 'ok: fixture' },
      { t: 9000, type: 'suite-end' },
    ],
    ...overrides,
  };
}

/** A valid detect-language session over MediaPipe and Chrome's detector. */
export function makeDetectRun(): BenchRunResult {
  const run = makeTaskRun();
  const tasks = tasksRecord({
    task: 'detect-language',
    set: 'flores-devtest',
    itemList: { id: 'detect-flores-L', count: 2, sha256: 'b'.repeat(64) },
    systemOrder: ['chrome-ai/chrome-language-detector', 'mediapipe/mediapipe-language-detector'],
  });
  const detectItem = (index: number, startT: number, ms: number): TaskIteration => ({
    ...flatItem(index, `lid/${index}`, startT, ms, 'de'),
    detect: [{ language: 'de', confidence: 0.99 }, { language: 'und', confidence: 0.001 }],
  });
  run.harness.control = { kind: 'chrome-ai-tasks', runtimeOrder: ['chrome-ai', 'mediapipe'], tasks };
  run.cells = [
    cell('chrome-ai', 'chrome-language-detector', 'detect-flores-L', 'detect-language', [detectItem(0, 1000, 1.5), detectItem(1, 1010, 0.03)], 900),
    cell('mediapipe', 'mediapipe-language-detector', 'detect-flores-L', 'detect-language', [detectItem(0, 2000, 0.4), detectItem(1, 2010, 0.2)], 1900),
  ];
  for (const c of run.cells) c.task!.api = c.runtimeId === 'chrome-ai' ? 'LanguageDetector' : 'mediapipe language detector';
  return run;
}
