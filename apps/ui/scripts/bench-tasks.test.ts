/**
 * /bench/tasks pure logic: the session query, the item-list pin check, the
 * session plan and its control marker (validated by @localmode/bench), and
 * the refusals of the task kind on /bench/run and in the control-run filer.
 */
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { controlTasksError, type TaskItem } from '@localmode/bench';
import { itemListDigest, parseTaskRequest, planTaskSession, taskControl, verifyItemList } from '../src/lib/bench/tasks';
import { TASK_ITEM_LISTS, type TaskItemListSpec } from '../src/lib/bench/task-item-lists';
import { parseControlRequest } from '../src/lib/bench/control';
import { collectControlRuns } from './collect-control-runs';
import { OPUS_TARGET_TOKENS, taskAdapterFor } from '../src/lib/bench/task-adapters';
import { PINNED_FALLBACK_MODELS } from '../src/lib/bench/task-model-pins';

const sha = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex');
const item = (id: string, text: string, src?: string, tgt?: string) => ({ id, text, sha256: sha(text), ...(src ? { src, tgt } : {}) });

const translateItems = [item('a/en-de', 'Hello there.', 'en', 'de'), item('b/en-de', 'Good morning.', 'en', 'de'), item('c/de-en', 'Guten Tag.', 'de', 'en')];
async function listOf(items: typeof translateItems, task: TaskItemListSpec['task'] = 'translate'): Promise<TaskItemListSpec> {
  return { id: 'unit', task, set: 'flores-devtest', subset: 'L', count: items.length, sha256: await itemListDigest(items) };
}
const body = (items: unknown[]) => items.map((i) => JSON.stringify(i)).join('\n') + '\n';

describe('parseTaskRequest()', () => {
  const base = '?task=translate&list=pilot-e2e-translate-flores-5&items=http://127.0.0.1:3101';
  it('accepts a session query with the default systems', () => {
    const r = parseTaskRequest(`${base}&session=2&order=reversed&cold=1`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.request).toMatchObject({ task: 'translate', phase: 'quality', sessionIndex: 2, order: 'reversed', processCold: true });
    expect(r.request.systems).toEqual(['chrome-ai/chrome-translator', 'transformers-wasm/opus-mt@q8']);
  });
  it('refuses a public item origin, an unknown list, a list of another task, a foreign system and a repeat off R', () => {
    expect(parseTaskRequest(base.replace('http://127.0.0.1:3101', 'https://example.com'))).toMatchObject({ ok: false });
    expect(parseTaskRequest(base.replace('pilot-e2e-translate-flores-5', 'nope'))).toMatchObject({ ok: false });
    expect(parseTaskRequest(base.replace('task=translate', 'task=summarize'))).toMatchObject({ ok: false });
    expect(parseTaskRequest(`${base}&systems=transformers-wasm/distilbart-cnn-6-6@q8`)).toMatchObject({ ok: false });
    expect(parseTaskRequest(`${base}&repeat=2`)).toMatchObject({ ok: false });
  });
});

describe('verifyItemList()', () => {
  it('accepts a list matching its pin', async () => {
    const r = await verifyItemList(body(translateItems), await listOf(translateItems));
    expect(r).toMatchObject({ ok: true });
  });
  it('refuses a tampered text, a reordered list, a short list and a translation item without languages', async () => {
    const list = await listOf(translateItems);
    const tampered = translateItems.map((i, k) => (k === 1 ? { ...i, text: i.text + ' ' } : i));
    expect(await verifyItemList(body(tampered), list)).toMatchObject({ ok: false, message: expect.stringContaining('SHA-256') });
    expect(await verifyItemList(body([...translateItems].reverse()), list)).toMatchObject({ ok: false, message: expect.stringContaining('digest') });
    expect(await verifyItemList(body(translateItems.slice(1)), list)).toMatchObject({ ok: false, message: expect.stringContaining('expects 3') });
    const bare = translateItems.map(({ src: _s, tgt: _t, ...rest }) => rest);
    expect(await verifyItemList(body(bare), await listOf(bare as typeof translateItems))).toMatchObject({ ok: false, message: expect.stringContaining('src and tgt') });
  });
  it('pins every compiled list with a 64-hex digest and a positive count', () => {
    for (const l of TASK_ITEM_LISTS) {
      expect(l.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(l.count).toBeGreaterThan(0);
    }
  });
});

describe('planTaskSession() and taskControl()', () => {
  it('expands opus-mt per direction, keeps the built-in first in the fixed order and records a valid marker', async () => {
    const list = await listOf(translateItems);
    const r = parseTaskRequest('?task=translate&list=pilot-e2e-translate-flores-5&items=http://127.0.0.1:3101');
    if (!r.ok) throw new Error(r.message);
    const request = { ...r.request, list };
    const plan = planTaskSession(request, translateItems as TaskItem[]);
    expect(plan.systemOrder).toEqual([
      'chrome-ai/chrome-translator',
      'transformers-wasm/opus-mt-en-de@q8',
      'transformers-wasm/opus-mt-de-en@q8',
    ]);
    expect(plan.cells.map((c) => `${c.arm}/${c.workloadId}:${c.items.length}`)).toEqual([
      'chrome-ai/chrome-translator/translate-en-de-L:2',
      'chrome-ai/chrome-translator/translate-de-en-L:1',
      'transformers-wasm/opus-mt-en-de@q8/translate-en-de-L:2',
      'transformers-wasm/opus-mt-de-en@q8/translate-de-en-L:1',
    ]);
    const control = taskControl(request, plan);
    expect(controlTasksError(control)).toBeUndefined();
    expect(control.runtimeOrder).toEqual(['chrome-ai', 'transformers-wasm']);
    const reversed = planTaskSession({ ...request, order: 'reversed' }, translateItems as TaskItem[]);
    expect(reversed.systemOrder).toEqual([...plan.systemOrder].reverse());
    expect(controlTasksError(taskControl({ ...request, order: 'reversed' }, reversed))).toBeUndefined();
  });
  it('plans no items on a download session', async () => {
    const list = await listOf(translateItems);
    const r = parseTaskRequest('?phase=download&task=translate&list=pilot-e2e-translate-flores-5&items=http://127.0.0.1:3101&systems=chrome-ai/chrome-translator');
    if (!r.ok) throw new Error(r.message);
    const plan = planTaskSession({ ...r.request, list }, translateItems as TaskItem[]);
    expect(plan.cells.map((c) => c.items.length)).toEqual([0, 0]);
  });
});

describe('the adapters and pins', () => {
  it('serves every arm a plan can hold and refuses others', () => {
    for (const arm of ['chrome-ai/chrome-summarizer', 'chrome-ai/chrome-summarizer-default', 'chrome-ai/chrome-translator', 'chrome-ai/chrome-language-detector', 'mediapipe/mediapipe-language-detector', 'transformers-wasm/distilbart-cnn-6-6@q8', 'transformers-webgpu/opus-mt-en-zh@fp32']) {
      expect(() => taskAdapterFor(arm, 'cnndm-test')).not.toThrow();
    }
    expect(() => taskAdapterFor('webllm/x', 'cnndm-test')).toThrow(/no task adapter/);
  });
  it('pins DistilBART and all 24 Opus-MT directions at a 40-hex revision with q8 and fp32 files, and the two target tokens', () => {
    expect(PINNED_FALLBACK_MODELS).toHaveLength(25);
    for (const m of PINNED_FALLBACK_MODELS) {
      expect(m.revision).toMatch(/^[0-9a-f]{40}$/);
      for (const dtype of ['q8', 'fp32'] as const) {
        expect(m.dtypes[dtype].length).toBeGreaterThanOrEqual(5);
        for (const f of m.dtypes[dtype]) expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
      }
    }
    expect(Object.keys(OPUS_TARGET_TOKENS).sort()).toEqual(['Xenova/opus-mt-en-ar', 'Xenova/opus-mt-en-zh']);
  });
});

describe('the task kind outside /bench/tasks', () => {
  it('/bench/run refuses ?control=chrome-ai-tasks', () => {
    expect(parseControlRequest('?control=chrome-ai-tasks')).toMatchObject({ status: 'refused', message: expect.stringContaining('/bench/tasks') });
  });
  it('the control-run filer refuses a chrome-ai-tasks file before anything is written', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'tasks-collect-'));
    mkdirSync(path.join(dir, 'runs'));
    const file = path.join(dir, 'run.json');
    writeFileSync(
      file,
      JSON.stringify({ protocol: 'localmode-bench/5', schemaVersion: 3, runId: 'task-run-0001', createdAt: new Date().toISOString(), harness: { name: 'h', version: '1', control: { kind: 'chrome-ai-tasks', runtimeOrder: [] } }, suite: 'custom', environment: {}, fingerprint: null, cells: [], events: [] }),
    );
    await expect(collectControlRuns({ datasetDir: dir, files: [file], dryRun: true })).rejects.toThrow(/never filed/);
  });
});

describe('follow-ups: sample lists, the secondary lane, the Translator pack, truncation, the contract', async () => {
  const tasksModule = await import('../src/lib/bench/tasks');
  const adaptersModule = await import('../src/lib/bench/task-adapters');
  it('pins every sample list by file, file SHA-256, count and digest under <task>-<set>-<subset>', () => {
    const samples = TASK_ITEM_LISTS.filter((l) => l.file);
    expect(samples).toHaveLength(18);
    for (const l of samples) {
      expect(l.id).toBe(`${l.task}-${l.set}-${l.subset}`);
      expect(l.fileSha256).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(samples.map((l) => l.subset).filter((s) => s === 'L')).toHaveLength(3);
    expect(TASK_ITEM_LISTS.find((l) => l.id === 'detect-language-wili-test-full')?.count).toBe(2600);
  });
  it('accepts an L list and the secondary current-releases arm, planned per direction after the primary fallback', async () => {
    const r = parseTaskRequest(
      '?phase=latency&task=translate&list=translate-flores-devtest-L&items=http://127.0.0.1:3101&systems=chrome-ai/chrome-translator,transformers-wasm/opus-mt@fp32,transformers-wasm-current/opus-mt@q8',
    );
    if (!r.ok) throw new Error(r.message);
    const plan = planTaskSession({ ...r.request, list: await listOf(translateItems) }, translateItems as TaskItem[]);
    expect(plan.systemOrder).toEqual([
      'chrome-ai/chrome-translator',
      'transformers-wasm/opus-mt-en-de@fp32',
      'transformers-wasm/opus-mt-de-en@fp32',
      'transformers-wasm-current/opus-mt-en-de@q8',
      'transformers-wasm-current/opus-mt-de-en@q8',
    ]);
    expect(() => taskAdapterFor('transformers-wasm-current/distilbart-cnn-6-6@q8', 'cnndm-test')).not.toThrow();
    expect(parseTaskRequest('?task=summarize&list=summarize-cnndm-test-L&items=http://127.0.0.1:3101&systems=transformers-wasm-current/distilbart-cnn-6-6@q4')).toMatchObject({ ok: false });
  });
  it('finds an installed Translator pack in the chrome://components record, in either order', () => {
    const parsed = [
      { name: 'Chrome TranslateKit', id: '', version: '2025.11.24.0', status: 'New' },
      { name: 'Chrome TranslateKit de-en', id: '', version: '2024.10.8.1', status: 'New' },
    ];
    expect(tasksModule.translatorPackInComponents(parsed, 'en', 'de')).toBe('Chrome TranslateKit de-en 2024.10.8.1');
    expect(tasksModule.translatorPackInComponents(parsed, 'de', 'en')).toBe('Chrome TranslateKit de-en 2024.10.8.1');
    expect(tasksModule.translatorPackInComponents(parsed, 'en', 'fr')).toBeUndefined();
    expect(tasksModule.translatorPackInComponents(undefined, 'en', 'de')).toBeUndefined();
  });
  it('sets the truncation flag from the token count and the model limit', () => {
    expect(adaptersModule.truncationRecord(1323, 1024)).toEqual({ inputTruncated: true, inputTokens: 1323, modelMaxTokens: 1024 });
    expect(adaptersModule.truncationRecord(1024, 1024)).toEqual({ inputTruncated: false, inputTokens: 1024, modelMaxTokens: 1024 });
    expect(adaptersModule.truncationRecord(undefined, 1024)).toBeUndefined();
  });
  it('names the page contract neutrally', () => {
    expect(tasksModule.TASK_PAGE_CONTRACT).toBe('bench-tasks-driver/1');
  });
});

describe('precreateTranslators(): one create() per pair, in order, each with its own span', () => {
  it('starts the next pair only after the previous one resolved, and records each pair separately', async () => {
    const { precreateTranslators } = await import('../src/lib/bench/task-adapters');
    const calls: string[] = [];
    const g = globalThis as Record<string, unknown>;
    const previous = g.Translator;
    g.Translator = {
      availability: async (o: { sourceLanguage: string; targetLanguage: string }) => (calls.push(`availability ${o.sourceLanguage}-${o.targetLanguage}`), 'downloadable'),
      create: (o: { sourceLanguage: string; targetLanguage: string }) => {
        calls.push(`create ${o.sourceLanguage}-${o.targetLanguage}`);
        return new Promise((resolve) => setTimeout(() => (calls.push(`created ${o.sourceLanguage}-${o.targetLanguage}`), resolve({ destroy() {} })), 30));
      },
    };
    try {
      const made = precreateTranslators([
        { src: 'en', tgt: 'de', pack: 'Chrome TranslateKit de-en 1' },
        { src: 'de', tgt: 'en', pack: 'Chrome TranslateKit de-en 1' },
      ]);
      // Only the first pair is started synchronously, inside the click.
      expect(calls).toEqual(['availability en-de', 'create en-de']);
      const a = made.get('en-de')!;
      const b = made.get('de-en')!;
      const [aEnd, bStart, bEnd] = [await a.endT, await b.startT, await b.endT];
      expect(calls).toEqual(['availability en-de', 'create en-de', 'created en-de', 'availability de-en', 'create de-en', 'created de-en']);
      expect(bStart).toBeGreaterThanOrEqual(aEnd);
      expect(aEnd - (await a.startT)).toBeGreaterThanOrEqual(25);
      expect(bEnd - bStart).toBeGreaterThanOrEqual(25);
      expect(a.order).toBe(1);
      expect(b.order).toBe(2);
      expect(await b.availability).toBe('downloadable');
    } finally {
      g.Translator = previous;
    }
  });
});

describe('pilot-sizing: a limit on the session plan', async () => {
  const tasksModule = await import('../src/lib/bench/tasks');
  it('reads limit / limitPerDirection only on a pilot-sizing session, one of them required there', () => {
    const base = '?phase=pilot-sizing&task=summarize&list=summarize-cnndm-test-S&items=http://127.0.0.1:3101';
    const ok = parseTaskRequest(`${base}&limit=3`);
    expect(ok).toMatchObject({ ok: true, request: { limit: 3 } });
    expect(parseTaskRequest(base)).toMatchObject({ ok: false });
    expect(parseTaskRequest(`${base}&limit=3&limitPerDirection=2`)).toMatchObject({ ok: false });
    expect(parseTaskRequest(base.replace('pilot-sizing', 'quality') + '&limit=3')).toMatchObject({ ok: false });
    expect(parseTaskRequest(`${base}&limit=0`)).toMatchObject({ ok: false });
  });
  it('runs only the prefix (per direction for translation) and records limitedTo beside the full digest', async () => {
    const list = await listOf(translateItems);
    const r = parseTaskRequest('?phase=pilot-sizing&task=translate&list=pilot-e2e-translate-flores-5&items=http://127.0.0.1:3101&limitPerDirection=1');
    if (!r.ok) throw new Error(r.message);
    const request = { ...r.request, list };
    const kept = tasksModule.applyLimit(request, translateItems as TaskItem[]);
    expect(kept.map((i) => i.id)).toEqual(['a/en-de', 'c/de-en']);
    const limitedTo = await tasksModule.limitedToRecord(request, kept);
    expect(limitedTo).toEqual({ count: 2, sha256: await itemListDigest(kept), perDirection: 1 });
    const plan = planTaskSession(request, kept);
    expect(plan.cells.reduce((n, c) => n + c.items.length, 0)).toBe(4);
    const control = taskControl(request, plan, undefined, limitedTo);
    expect(control.tasks!.itemList).toEqual({ id: 'unit', count: 3, sha256: list.sha256, limitedTo });
    expect(controlTasksError(control)).toBeUndefined();
    expect(tasksModule.applyLimit({ ...request, limitPerDirection: undefined, limit: 2 }, translateItems as TaskItem[]).map((i) => i.id)).toEqual(['a/en-de', 'b/en-de']);
  });
});
