/**
 * The analysis CLI reads a chrome-ai-tasks run like any control run: the
 * run validates, appears in runs.csv, cells.csv and iterations.csv, and
 * contributes no leaderboard row. Runs the real script in a child process
 * over a dataset holding a protocol run and a task run produced by
 * runTaskSession.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createHarnessControl,
  runTaskSession,
  sha256HexSync,
  type BenchRunResult,
  type TaskSystemAdapter,
} from '../src/index.js';
import { makeAnalysisRun } from './fixtures/analysis-runs.js';
import { tasksRecord } from './fixtures/task-runs.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(HERE, '../scripts/analyze.ts');
const TSX = resolve(HERE, '../../../node_modules/.bin/tsx');

let dataset: string;
beforeEach(() => {
  dataset = mkdtempSync(join(tmpdir(), 'bench-analyze-tasks-'));
});
afterEach(() => {
  rmSync(dataset, { recursive: true, force: true });
});

function detector(language: string, backend: string): TaskSystemAdapter {
  return {
    async load() {
      return {
        api: 'detector',
        resolvedBackend: backend,
        async runItem() {
          await new Promise((r) => setTimeout(r, 1));
          return { mode: 'none' as const, text: language, detect: [{ language, confidence: 0.98 }, { language: 'und', confidence: 0.01 }] };
        },
        async dispose() {},
      };
    },
  };
}

async function taskRun(): Promise<BenchRunResult> {
  const tasks = tasksRecord({
    task: 'detect-language',
    set: 'flores-devtest',
    subset: 'pilot',
    phase: 'pilot',
    itemList: { id: 'detect-flores-pilot', count: 2, sha256: 'e'.repeat(64) },
    systemOrder: ['chrome-ai/chrome-language-detector', 'mediapipe/mediapipe-language-detector'],
  });
  const texts = ['Guten Morgen, wie geht es?', 'Das Wetter ist schön.'];
  const items = texts.map((text, i) => ({ id: `flores/devtest/${i}/de/full`, text, sha256: sha256HexSync(text) }));
  const model = (runtimeId: 'chrome-ai' | 'mediapipe', id: string) => ({ benchModelId: id, runtimeId, providerModelId: id, displayName: id, task: 'task' as const });
  return runTaskSession({
    harness: { name: '@localmode/bench', version: '0.10.0', control: createHarnessControl('chrome-ai-tasks', { tasks }) },
    cells: [
      { model: model('chrome-ai', 'chrome-language-detector'), workloadId: 'detect-flores-pilot', items },
      { model: model('mediapipe', 'mediapipe-language-detector'), workloadId: 'detect-flores-pilot', items },
    ],
    adapters: new Map([
      ['chrome-ai/chrome-language-detector', detector('de', 'chrome-builtin')],
      ['mediapipe/mediapipe-language-detector', detector('de', 'wasm')],
    ]),
    memorySampleTimeoutMs: 50,
  });
}

describe('analyze.ts over a dataset holding a chrome-ai-tasks run', () => {
  it('reads it like a control run and keeps it out of leaderboard.csv', async () => {
    const protocolRun = makeAnalysisRun();
    const task = await taskRun();
    for (const run of [protocolRun, task]) {
      const path = join(dataset, 'runs/2026/10', `${run.runId}.json`);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify(run));
    }
    const out = join(dataset, 'out');
    const res = spawnSync(TSX, [SCRIPT, dataset, out, '--no-errata'], { encoding: 'utf8', timeout: 60_000 });
    expect(res.stderr).toBe('');
    expect(res.code ?? res.status).toBe(0);
    expect(res.stdout).toContain('analyzed 2/2 runs');

    const validation = readFileSync(join(out, 'validation.txt'), 'utf8');
    expect(validation).toMatch(new RegExp(`${task.runId}\\.json: shape=ok flags=\\[\\]`));

    const runsCsv = readFileSync(join(out, 'runs.csv'), 'utf8').trimEnd().split('\n');
    const header = runsCsv[0].split(',');
    const taskRow = runsCsv.find((l) => l.startsWith(task.runId))!;
    expect(taskRow).toBeDefined();
    const fields = taskRow.split(',');
    expect(fields[header.indexOf('controlKind')]).toBe('chrome-ai-tasks');
    expect(fields[header.indexOf('controlRuntimeOrder')]).toBe('chrome-ai>mediapipe');
    expect(fields[header.indexOf('validationOk')]).toBe('true');

    const cells = readFileSync(join(out, 'cells.csv'), 'utf8');
    expect(cells).toContain(`${task.runId},localmode-bench/5,chrome-ai/chrome-language-detector/detect-flores-pilot,`);
    expect(cells).toContain(`${task.runId},localmode-bench/5,mediapipe/mediapipe-language-detector/detect-flores-pilot,`);
    const iterations = readFileSync(join(out, 'iterations.csv'), 'utf8').split('\n').filter((l) => l.startsWith(task.runId));
    expect(iterations).toHaveLength(4);

    const leaderboard = readFileSync(join(out, 'leaderboard.csv'), 'utf8');
    expect(leaderboard).not.toContain('chrome-language-detector');
    expect(leaderboard).not.toContain('detect-flores-pilot');
    expect(leaderboard).toContain('qwen'); // the protocol run still aggregates
  }, 90_000);
});
