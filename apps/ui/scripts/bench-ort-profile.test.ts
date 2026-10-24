/**
 * The `ort-profile` aggregation: real ONNX Runtime Web profile lines, as
 * Transformers.js 4.2.0's ONNX Runtime printed them from `endProfiling()`
 * for Qwen3 0.6B q4 in Chrome 156 (WebGPU on the page, WASM in a worker),
 * trimmed to the session events, three runs with their first node events,
 * and the first GPU events of each run. The pass test drives the real
 * console capture: the fake session prints those lines through
 * `console.log` from `endProfiling()`, as ONNX Runtime does.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cellProfileError, PROFILE_MAX_OPERATOR_ROWS, type OrtOperatorRow } from '@localmode/bench';
import {
  boundOperatorRows,
  cellOrtProfile,
  createOrtProfileAccumulator,
  endProfilingInto,
  installOrtProfileConsole,
  runOrtProfilePass,
  splitGpuEventsIntoRuns,
  type OrtRunOwner,
  type ProfilableModel,
} from '../src/lib/bench/ort-profile';

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8')) as string[];
const WEBGPU = fixture('ort-profile-webgpu.lines.json');
const WASM = fixture('ort-profile-wasm.lines.json');
const CELL = 'transformers-webgpu/qwen3-0.6b/chat-pp128-tg128';

/** The fixture's events, parsed independently of the module under test. */
function events(lines: string[]) {
  return lines
    .map((l) => l.trim().replace(/,$/, ''))
    .filter((t) => t !== '[' && t !== ']')
    .map((t) => JSON.parse(t) as { cat: string; name: string; dur: number; ts: number; args: Record<string, unknown> });
}

const OWNERS: OrtRunOwner[] = [null, { cellId: CELL, phase: 'prefill' }, { cellId: CELL, phase: 'decode' }];

describe('createOrtProfileAccumulator on real ONNX Runtime lines', () => {
  it('WebGPU: node events per run by model_run order, GPU events split into runs at the timestamp gaps, the warmup run left out', () => {
    const acc = createOrtProfileAccumulator(OWNERS);
    for (const line of WEBGPU) acc.line(line);
    const agg = acc.finish();
    const parsed = events(WEBGPU);
    const runs = parsed.filter((e) => e.name === 'model_run');
    expect(agg.recordedRuns).toBe(3);
    expect(agg.events).toBe(parsed.length);
    const cell = agg.cells.get(CELL)!;
    expect(cell.recordedRuns).toBe(2);
    expect(cell.modelRunUs).toBe(runs[1].dur + runs[2].dur);
    // Node events: the fixture keeps 10 per run (the first four and six heavy ones); runs 1 and 2 belong to the cell.
    expect(cell.nodeEvents).toBe(20);
    const nodeRows = cell.rows.filter((r) => r.timing === 'node');
    const nodes = parsed.filter((e) => e.cat === 'Node');
    // Each row carries the provider ONNX Runtime assigned the node (a WebGPU
    // session places some shape nodes on the CPU provider).
    expect(new Set(nodeRows.map((r) => r.provider))).toEqual(new Set(nodes.slice(10, 30).map((e) => e.args.provider)));
    expect(nodeRows.some((r) => r.provider === 'WebGpuExecutionProvider')).toBe(true);
    expect(nodeRows.reduce((a, r) => a + r.count, 0)).toBe(20);
    const cellNodeUs = nodes.slice(10, 30).reduce((a, e) => a + e.dur, 0);
    expect(nodeRows.reduce((a, r) => a + r.totalMs, 0)).toBeCloseTo(cellNodeUs / 1000, 6);
    // The GPU events: six per run in the fixture, the warmup's six left out.
    const gpuRows = cell.rows.filter((r) => r.timing === 'gpu');
    expect(gpuRows.reduce((a, r) => a + r.count, 0)).toBe(12);
    expect(new Set(gpuRows.map((r) => r.phase))).toEqual(new Set(['prefill', 'decode']));
    const api = parsed.filter((e) => e.cat === 'Api');
    expect(gpuRows.reduce((a, r) => a + r.totalMs, 0)).toBeCloseTo(api.slice(6).reduce((a, e) => a + e.dur, 0) / 1000, 6);
    // Op type and program come from the GPU event name `<node>&<opType>&<program>`.
    const [, opType, program] = api[6].name.split('&');
    expect(gpuRows.some((r) => r.opType === opType && r.kernel === program && r.phase === 'prefill')).toBe(true);
    // A node row's kernel is the node name's last segment, without _kernel_time.
    const first = nodes[10];
    const kernel = first.name.replace(/_kernel_time$/, '').split('/').pop()!.replace(/_\d+$/, '');
    expect(nodeRows.some((r) => r.opType === first.args.op_name && r.kernel === kernel && r.phase === 'prefill')).toBe(true);
  });

  it('WASM: CPU provider node events, no GPU rows; the profile validates', () => {
    const owners: OrtRunOwner[] = [null, { cellId: 'w', phase: 'prefill' }, { cellId: 'w', phase: 'decode' }];
    const acc = createOrtProfileAccumulator(owners, { keepRaw: true });
    for (const line of WASM) acc.line(line);
    const agg = acc.finish();
    const cell = agg.cells.get('w')!;
    expect(cell.rows.every((r) => r.timing === 'node' && r.provider === 'CPUExecutionProvider')).toBe(true);
    expect(cell.nodeEvents).toBe(12);
    // The raw lines kept: the session's own events and the cell's two runs, warmup excluded.
    const kept = agg.raw!.map((l) => JSON.parse(l) as { cat: string; name: string });
    expect(kept.filter((e) => e.name === 'model_run')).toHaveLength(2);
    expect(kept.filter((e) => e.cat === 'Node')).toHaveLength(12);
    expect(kept.filter((e) => e.cat === 'Session' && e.name === 'session_initialization')).toHaveLength(1);
    const profile = cellOrtProfile('w', [agg], 2, { warmupTokens: 4, maxTokens: 2 });
    expect(profile).toMatchObject({ kind: 'ort-operators', runs: 2, nodeEvents: 12, pass: { warmupTokens: 4, maxTokens: 2 } });
    expect(profile.gpuMs).toBeUndefined();
    expect(profile.truncated).toBeUndefined();
    expect(cellProfileError({ runtimeId: 'transformers-wasm', profile }, { kind: 'ort-profile' })).toBeUndefined();
  });

  it('marks a cell truncated when the profile holds fewer runs than the request made', () => {
    const acc = createOrtProfileAccumulator(OWNERS);
    for (const line of WEBGPU) acc.line(line);
    const profile = cellOrtProfile(CELL, [acc.finish()], 5, { warmupTokens: 4, maxTokens: 4 });
    expect(profile.truncated).toBe(true);
    expect(profile.runs).toBe(5);
  });
});

describe('splitGpuEventsIntoRuns and boundOperatorRows', () => {
  it('cuts at the runs - 1 largest gaps, a backwards jump counting as a gap', () => {
    expect(splitGpuEventsIntoRuns([0, 66, 132, 9000, 9066, 200, 266], 3)).toEqual([0, 0, 0, 1, 1, 2, 2]);
    expect(splitGpuEventsIntoRuns([5, 6], 1)).toEqual([0, 0]);
    expect(splitGpuEventsIntoRuns([5], 2)).toBeNull();
  });

  it('keeps the largest rows and folds the rest into one (other) row per phase and timing', () => {
    const rows: OrtOperatorRow[] = Array.from({ length: PROFILE_MAX_OPERATOR_ROWS + 6 }, (_, i) => ({
      phase: i % 2 === 0 ? 'decode' : 'prefill',
      timing: i % 3 === 0 ? 'gpu' : 'node',
      opType: `Op${i}`,
      kernel: `K${i}`,
      provider: 'CPUExecutionProvider',
      totalMs: 1000 - i,
      count: 1,
    }));
    const { operators, foldedRows } = boundOperatorRows(rows);
    expect(foldedRows).toBe(6);
    expect(operators.slice(0, PROFILE_MAX_OPERATOR_ROWS).map((r) => r.opType)).toEqual(rows.slice(0, PROFILE_MAX_OPERATOR_ROWS).map((r) => r.opType));
    const others = operators.slice(PROFILE_MAX_OPERATOR_ROWS);
    expect(others.every((r) => r.opType === '(other)')).toBe(true);
    expect(others.reduce((a, r) => a + r.count, 0)).toBe(6);
    expect(others.reduce((a, r) => a + r.totalMs, 0)).toBeCloseTo(rows.slice(PROFILE_MAX_OPERATOR_ROWS).reduce((a, r) => a + r.totalMs, 0), 6);
  });
});

describe('runOrtProfilePass through the console capture', () => {
  /** A model whose session runs once per requested token and prints `lines` from endProfiling(), as ONNX Runtime does. */
  function fakeModel(lines: string[], calls: string[]): ProfilableModel {
    const session = {
      run: (..._args: unknown[]) => calls.push('run'),
      endProfiling: () => {
        for (const line of lines) console.log(line);
      },
    };
    return {
      async preload() {
        calls.push('preload');
      },
      getInferenceSessions: () => ({ model: session }),
      async doGenerate({ maxTokens = 1 }) {
        calls.push(`generate ${maxTokens}`);
        for (let i = 0; i < maxTokens; i++) session.run({});
        return {};
      },
      async unload() {
        calls.push('unload');
      },
    };
  }

  it('warmup then the cell request, the profile captured from the console and attributed, the raw events kept', async () => {
    installOrtProfileConsole();
    const calls: string[] = [];
    const seen: unknown[] = [];
    const original = console.log;
    const result = await runOrtProfilePass({
      cellId: CELL,
      request: { prompt: 'p', maxTokens: 2 },
      warmupTokens: 1,
      keepRaw: true,
      createModel: () => fakeModel(WEBGPU, calls),
    });
    expect(calls).toEqual(['preload', 'generate 1', 'run', 'generate 2', 'run', 'run', 'unload']);
    expect(result.profile).toMatchObject({ kind: 'ort-operators', runs: 2, nodeEvents: 20, pass: { warmupTokens: 1, maxTokens: 2 } });
    expect(result.profile.gpuMs).toBeGreaterThanOrEqual(0);
    expect(cellProfileError({ runtimeId: 'transformers-webgpu', profile: result.profile }, { kind: 'ort-profile' })).toBeUndefined();
    const raw = JSON.parse(result.rawJson!) as Array<{ name: string }>;
    expect(raw.filter((e) => e.name === 'model_run')).toHaveLength(2);
    // Outside a capture the console is untouched.
    console.log = ((...a: unknown[]) => seen.push(a)) as typeof console.log;
    console.log = original;
  });

  it('refuses a session that printed nothing (the runtime bound the console before the capture)', async () => {
    const calls: string[] = [];
    await expect(
      runOrtProfilePass({ cellId: CELL, request: { prompt: 'p', maxTokens: 1 }, warmupTokens: 1, createModel: () => fakeModel([], calls) }),
    ).rejects.toThrow('ONNX Runtime printed no profile for session model');
    expect(calls.at(-1)).toBe('unload');
  });

  it('endProfilingInto counts the lines it routed', () => {
    installOrtProfileConsole();
    const got: unknown[] = [];
    const n = endProfilingInto({ endProfiling: () => ['[', '{"cat":"Session"}', ']'].forEach((l) => console.log(l)) }, (l) => got.push(l));
    expect(n).toBe(3);
    expect(got).toEqual(['[', '{"cat":"Session"}', ']']);
    expect(() => endProfilingInto({}, () => {})).toThrow('this ONNX Runtime session has no endProfiling()');
  });
});
