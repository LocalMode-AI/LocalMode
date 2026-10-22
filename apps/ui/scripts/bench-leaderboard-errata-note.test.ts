// @vitest-environment jsdom
/**
 * The /bench leaderboard table's errata note, rendered with React 19 in jsdom
 * over rows from the real `aggregateIndex()`: a row an erratum excluded cells
 * from shows its count beside the run count, and one line under the table
 * names the exclusions and links to the methodology's Errata section; with no
 * exclusion on a displayed row there is no note.
 */
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { mount, type Mounted } from './_equivalence-dom';
import { LeaderboardTable } from '../src/components/bench/leaderboard-table';
import { aggregateIndex, type RunIndexEntry } from '../src/lib/bench/store';

const CELL_ID = 'litert/qwen3-0.6b/quality-mmlu-25';

function entry(runId: string, qualityScore: number, qualityParseRate: number): RunIndexEntry {
  return {
    runId,
    createdAt: '2026-10-12T14:11:14.048Z',
    protocol: 'localmode-bench/5',
    suite: 'thorough',
    deviceClass: 'windows/nvidia-ampere',
    deviceSubclass: 'windows/nvidia-geforce-rtx-3080-ti',
    browser: 'Google Chrome',
    browserVersion: '154.0.8037.58',
    os: 'Windows',
    flagged: false,
    path: `runs/2026/10/${runId}.json`,
    cells: [
      {
        cellId: CELL_ID,
        runtimeId: 'litert',
        benchModelId: 'qwen3-0.6b',
        modelName: 'Qwen3 0.6B (LiteRT)',
        workloadId: 'quality-mmlu-25',
        resolvedBackend: 'gpu',
        qualityScore,
        qualityParseRate,
        highVariance: false,
      },
    ],
  };
}

const entries = [entry('run-good-1', 0.4, 1), entry('run-good-2', 0.48, 0.96), entry('run-replaced', 0, 0)];
const ERRATUM = {
  runId: 'run-replaced',
  cellIds: [CELL_ID],
  reason: 'loaded the replaced model file',
  recordedAt: '2026-10-22',
  reference: 'README.md',
};

let mounted: Mounted | undefined;
afterEach(async () => {
  await mounted?.unmount();
  mounted = undefined;
});

describe('LeaderboardTable errata note', () => {
  it('shows the per-row count and one note line when a displayed row has exclusions', async () => {
    mounted = await mount(createElement(LeaderboardTable, { rows: aggregateIndex(entries, undefined, [ERRATUM]) }));
    const text = mounted.container.textContent ?? '';
    expect(text).toContain('(+1 excluded by erratum)');
    const notes = [...mounted.container.querySelectorAll('p')].filter((p) => p.textContent?.startsWith('Errata:'));
    expect(notes).toHaveLength(1);
    expect(notes[0].textContent).toBe(
      "Errata: 1 row shown exclude 1 published cell listed in the dataset's index/errata.json, each with its reason; nothing is re-scored (how errata work).",
    );
    expect(notes[0].querySelector('a')?.getAttribute('href')).toBe('/bench/methodology#errata');
    // The quality median is the two remaining runs'.
    expect(text).toContain('0.440');
  });

  it('shows no note when no displayed row has exclusions', async () => {
    mounted = await mount(createElement(LeaderboardTable, { rows: aggregateIndex(entries) }));
    const text = mounted.container.textContent ?? '';
    expect(text).not.toContain('excluded by erratum');
    expect(text).not.toContain('Errata:');
    expect(text).toContain('0.400');
  });
});
