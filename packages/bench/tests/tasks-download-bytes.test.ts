/**
 * Download bytes of a task cell: the model-folder delta (from the driver's
 * per-click measurement when given, else from the session's start and end
 * folder sizes over the cell's model folders), kept apart from the
 * whole-profile delta.
 */
import { describe, expect, it } from 'vitest';
import {
  createHarnessControl,
  runTaskSession,
  sha256HexSync,
  validateRunShape,
  type LoadedTaskSystem,
  type TaskDriverRecord,
  type TaskSystemAdapter,
} from '../src/index.js';
import { makeTaskRun, tasksRecord } from './fixtures/task-runs.js';

const driver = (start: Record<string, number>): TaskDriverRecord => ({
  driverVersion: 'test/1',
  launch: { executablePath: '/chrome', args: [], ignoredDefaultArgs: [], commandLine: 'chrome' },
  profileId: 'p',
  chromeVersionText: 'Google Chrome 156',
  components: { start: { text: '', parsed: [] } },
  onDeviceInternals: { start: { text: '' } },
  freeDiskBytes: { start: 1 },
  profileFolderBytes: { start },
});

async function downloadSession(captures: Record<string, unknown>) {
  const text = 'x';
  const loaded: LoadedTaskSystem = {
    api: 'Translator',
    resolvedBackend: 'chrome-builtin',
    availabilityAtCreate: 'downloadable',
    download: { events: [{ t: 1, loaded: 1, total: 1 }], wallMs: 70, modelFolders: ['TranslateKit'] },
    async runItem() {
      return { mode: 'none', text: 'y' };
    },
    async dispose() {},
  };
  const adapter: TaskSystemAdapter = { load: async () => loaded };
  const tasks = tasksRecord({
    phase: 'download',
    task: 'translate',
    set: 'flores-devtest',
    subset: 'pilot',
    processCold: false,
    itemList: { id: 't', count: 1, sha256: 'f'.repeat(64) },
    systemOrder: ['chrome-ai/chrome-translator'],
    driver: driver({ TranslateKit: 1_000, Default: 50_000 }),
  });
  return runTaskSession({
    harness: { name: '@localmode/bench', version: '0.10.1', control: createHarnessControl('chrome-ai-tasks', { tasks }) },
    cells: [
      { model: { benchModelId: 'chrome-translator', runtimeId: 'chrome-ai', providerModelId: 'Translator', displayName: 'T', task: 'task' }, workloadId: 'translate-en-zh-pilot', items: [] },
    ],
    adapters: new Map([['chrome-ai/chrome-translator', adapter]]),
    finalize: async () => captures as never,
    skipFingerprint: true,
    memorySampleTimeoutMs: 10,
  }).then((run) => ({ run, sha: sha256HexSync(text) }));
}

describe('download bytes of a task cell', () => {
  it("takes the model-folder delta from the driver's per-click reading and keeps the whole-profile delta apart", async () => {
    const { run } = await downloadSession({
      profileFolderBytes: { TranslateKit: 1_000, Default: 49_000 },
      modelBytesDeltaByCell: { 'chrome-ai/chrome-translator/translate-en-zh-pilot': 0 },
      profileBytesDeltaByCell: { 'chrome-ai/chrome-translator/translate-en-zh-pilot': -884_736 },
    });
    expect(run.cells[0].task!.download).toMatchObject({
      modelFolders: ['TranslateKit'],
      modelBytesDelta: 0,
      modelBytesSource: 'driver-click',
      wholeProfileBytesDelta: -884_736,
    });
    expect(validateRunShape(run)).toEqual([]);
  });
  it('falls back to the session start and end sizes of the model folders only', async () => {
    const { run } = await downloadSession({ profileFolderBytes: { TranslateKit: 138_000_000, Default: 49_000 } });
    expect(run.cells[0].task!.download).toMatchObject({ modelBytesDelta: 137_999_000, modelBytesSource: 'session-folders' });
    expect(run.cells[0].task!.download!.wholeProfileBytesDelta).toBeUndefined();
  });
  it('refuses a model delta without its folders or source, and accepts the earlier profileBytesDelta', () => {
    const run = makeTaskRun();
    run.cells[0].task!.download = { events: [], wallMs: 1, modelBytesDelta: 5 } as never;
    expect(validateRunShape(run).join()).toMatch(/modelBytesDelta needs modelFolders and modelBytesSource/);
    run.cells[0].task!.download = { events: [], wallMs: 1, profileBytesDelta: -10 } as never;
    expect(validateRunShape(run)).toEqual([]);
  });
});

describe('modelBytesSource values', () => {
  it('accepts driver-click and session-folders, and the aliases driver and page; refuses anything else', () => {
    for (const source of ['driver-click', 'session-folders', 'driver', 'page']) {
      const run = makeTaskRun();
      run.cells[0].task!.download = { events: [], wallMs: 1, modelFolders: ['TranslateKit'], modelBytesDelta: 0, modelBytesSource: source } as never;
      expect(validateRunShape(run), source).toEqual([]);
    }
    const run = makeTaskRun();
    run.cells[0].task!.download = { events: [], wallMs: 1, modelFolders: ['TranslateKit'], modelBytesDelta: 0, modelBytesSource: 'guess' } as never;
    expect(validateRunShape(run).join()).toMatch(/modelBytesSource/);
  });
});
