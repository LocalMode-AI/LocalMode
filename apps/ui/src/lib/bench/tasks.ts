/**
 * Task sessions on /bench/tasks (the `chrome-ai-tasks` control kind): the
 * query string a session is opened with, the item lists the page accepts
 * (each pinned by a digest compiled into the page), the check of a served
 * list against its pin, and the plan of cells a session runs. Everything in
 * this module is pure; the systems themselves live in task-adapters.ts.
 */
import {
  createHarnessControl,
  sha256Hex,
  taskArmId,
  taskSystemOrder,
  TASK_KINDS,
  TASK_PHASES,
  TASK_SUBSETS,
  type BenchModelRef,
  type BenchRuntimeId,
  type HarnessControl,
  type TaskDriverRecord,
  type TaskItem,
  type TaskKind,
  type TaskOrder,
  type TaskPhase,
  type TaskPlannedCell,
  type TaskSet,
  type TaskSubset,
} from '@localmode/bench';
import { TASK_ITEM_LISTS, type TaskItemListSpec } from './task-item-lists';

/** Version of the page-side driver contract (`window.__benchTasks`), recorded by the driver it talks to. */
export const TASK_PAGE_VERSION = '1';

/** Name of the page-side driver contract (`window.__benchTasks.contract`). */
export const TASK_PAGE_CONTRACT = 'bench-tasks-driver/1';

/** The built-in system of each task. */
export const BUILT_IN_SYSTEM: Record<TaskKind, string> = {
  summarize: 'chrome-summarizer',
  translate: 'chrome-translator',
  'detect-language': 'chrome-language-detector',
};

/** The fallback family of each task (`opus-mt` expands to one model per direction). */
export const FALLBACK_FAMILY: Record<TaskKind, string> = {
  summarize: 'distilbart-cnn-6-6',
  translate: 'opus-mt',
  'detect-language': 'mediapipe-language-detector',
};

/** Short set names used in workload ids. */
const SET_SHORT: Record<TaskSet, string> = {
  'cnndm-test': 'cnndm',
  'cnndm-reserve': 'cnndm-reserve',
  'xsum-test': 'xsum',
  'flores-devtest': 'flores',
  'wili-test': 'wili',
};

/** What a /bench/tasks URL asks for. */
export interface TaskRequest {
  phase: TaskPhase;
  task: TaskKind;
  list: TaskItemListSpec;
  sessionIndex: number;
  order: TaskOrder;
  /** Item server origin (e.g. `http://127.0.0.1:3101`). */
  itemsOrigin: string;
  /** Arm templates: `<runtimeId>/<system>`, `opus-mt@<dtype>` expanding per direction. */
  systems: string[];
  processCold: boolean;
  repeat?: number;
  /** Chrome full version the session must run on (preflight), when pinned. */
  chromeBuild?: string;
  /** A `pilot-sizing` session runs only the first `limit` items, or the first `limitPerDirection` of each direction. */
  limit?: number;
  limitPerDirection?: number;
}

/** A refused request, with the reason shown on the page. */
export type TaskRequestResult = { ok: true; request: TaskRequest } | { ok: false; message: string };

/** Default arm templates per task: the built-in, then the WASM q8 fallback. */
export function defaultSystems(task: TaskKind): string[] {
  const fallbackLane: BenchRuntimeId = task === 'detect-language' ? 'mediapipe' : 'transformers-wasm';
  const fallback = task === 'detect-language' ? FALLBACK_FAMILY[task] : `${FALLBACK_FAMILY[task]}@q8`;
  return [`chrome-ai/${BUILT_IN_SYSTEM[task]}`, `${fallbackLane}/${fallback}`];
}

/** The arm templates a task accepts. */
function systemAllowed(task: TaskKind, template: string): boolean {
  const slash = template.indexOf('/');
  const lane = template.slice(0, slash);
  const system = template.slice(slash + 1);
  if (lane === 'chrome-ai') {
    if (system === BUILT_IN_SYSTEM[task]) return true;
    return task === 'summarize' && system === 'chrome-summarizer-default';
  }
  if (task === 'detect-language') return lane === 'mediapipe' && system === FALLBACK_FAMILY[task];
  if (lane !== 'transformers-wasm' && lane !== 'transformers-webgpu' && lane !== 'transformers-wasm-current') return false;
  return new RegExp(`^${FALLBACK_FAMILY[task]}@(q8|fp32)$`).test(system);
}

/**
 * Read a /bench/tasks query string.
 *
 * Parameters: `phase`, `task`, `list` (an id of `TASK_ITEM_LISTS`, whose task
 * must match), `session` (1-based), `order` (`fixed` | `reversed`), `items`
 * (the item server origin, `http://127.0.0.1:<port>` or `http://localhost:<port>`
 * only, so no item text reaches a public origin), optional `systems`
 * (comma-separated arm templates; default: the built-in and the WASM q8
 * fallback), `cold=1` (Chrome was launched for this session), `repeat` (R
 * sessions), `chrome` (the pinned Chrome full version).
 *
 * @param search - The query string.
 * @returns The request, or the reason it is refused.
 */
export function parseTaskRequest(search: string): TaskRequestResult {
  const p = new URLSearchParams(search);
  const phase = (p.get('phase') ?? 'quality') as TaskPhase;
  if (!TASK_PHASES.includes(phase)) return { ok: false, message: `phase must be one of ${TASK_PHASES.join(', ')}` };
  const task = p.get('task') as TaskKind;
  if (!TASK_KINDS.includes(task)) return { ok: false, message: `task must be one of ${TASK_KINDS.join(', ')}` };
  const list = TASK_ITEM_LISTS.find((l) => l.id === p.get('list'));
  if (!list) return { ok: false, message: `list must be one of the item lists compiled into this page (${TASK_ITEM_LISTS.map((l) => l.id).join(', ')})` };
  if (list.task !== task) return { ok: false, message: `list ${list.id} is a ${list.task} list, not ${task}` };
  if (!TASK_SUBSETS.includes(list.subset)) return { ok: false, message: `list ${list.id} has an unknown subset` };
  const sessionIndex = Number(p.get('session') ?? '1');
  if (!Number.isInteger(sessionIndex) || sessionIndex < 1 || sessionIndex > 10_000) return { ok: false, message: 'session must be an integer from 1' };
  const order = (p.get('order') ?? 'fixed') as TaskOrder;
  if (order !== 'fixed' && order !== 'reversed') return { ok: false, message: 'order must be fixed or reversed' };
  const itemsOrigin = (p.get('items') ?? '').replace(/\/+$/, '');
  if (!/^http:\/\/(127\.0\.0\.1|localhost):\d{2,5}$/.test(itemsOrigin)) {
    return { ok: false, message: 'items must be the local item server origin, http://127.0.0.1:<port>' };
  }
  const systems = p.has('systems')
    ? (p.get('systems') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    : defaultSystems(task);
  if (systems.length === 0) return { ok: false, message: 'systems must list at least one system' };
  for (const s of systems) {
    if (!systemAllowed(task, s)) return { ok: false, message: `system ${s} is not a ${task} system` };
  }
  if (new Set(systems).size !== systems.length) return { ok: false, message: 'systems lists a system twice' };
  const repeatRaw = p.get('repeat');
  let repeat: number | undefined;
  if (repeatRaw !== null) {
    repeat = Number(repeatRaw);
    if (list.subset !== 'R' || !Number.isInteger(repeat) || repeat < 1) return { ok: false, message: 'repeat is set only on an R list, as an integer from 1' };
  }
  const readLimit = (key: string) => (p.has(key) ? Number(p.get(key)) : undefined);
  const limit = readLimit('limit');
  const limitPerDirection = readLimit('limitPerDirection');
  if (limit !== undefined || limitPerDirection !== undefined) {
    if (phase !== 'pilot-sizing') return { ok: false, message: 'limit and limitPerDirection are set only on a pilot-sizing session' };
    if (limit !== undefined && limitPerDirection !== undefined) return { ok: false, message: 'set limit or limitPerDirection, not both' };
    const n = (limit ?? limitPerDirection) as number;
    if (!Number.isInteger(n) || n < 1) return { ok: false, message: 'a limit is a positive integer' };
    if (limitPerDirection !== undefined && task !== 'translate') return { ok: false, message: 'limitPerDirection is set only on a translate session' };
  } else if (phase === 'pilot-sizing') {
    return { ok: false, message: 'a pilot-sizing session needs limit or limitPerDirection' };
  }
  const chromeBuild = p.get('chrome') ?? undefined;
  if (chromeBuild !== undefined && !/^\d+\.\d+\.\d+\.\d+$/.test(chromeBuild)) return { ok: false, message: 'chrome must be a full version (e.g. 156.0.8078.48)' };
  return {
    ok: true,
    request: {
      phase,
      task,
      list,
      sessionIndex,
      order,
      itemsOrigin,
      systems,
      processCold: p.get('cold') === '1',
      ...(repeat !== undefined ? { repeat } : {}),
      ...(chromeBuild ? { chromeBuild } : {}),
      ...(limit !== undefined ? { limit } : {}),
      ...(limitPerDirection !== undefined ? { limitPerDirection } : {}),
    },
  };
}

/**
 * The items a session runs: the whole verified list, or on a `pilot-sizing`
 * session its first `limit` items, or the first `limitPerDirection` items of
 * each translation direction, in list order.
 *
 * @param request - The parsed request.
 * @param items - The full verified list.
 * @returns The items to run.
 */
export function applyLimit(request: Pick<TaskRequest, 'limit' | 'limitPerDirection'>, items: readonly TaskItem[]): TaskItem[] {
  if (request.limit !== undefined) return items.slice(0, request.limit);
  if (request.limitPerDirection !== undefined) {
    const seen = new Map<string, number>();
    return items.filter((i) => {
      const key = `${i.src}-${i.tgt}`;
      const n = (seen.get(key) ?? 0) + 1;
      seen.set(key, n);
      return n <= request.limitPerDirection!;
    });
  }
  return [...items];
}

/**
 * The `itemList.limitedTo` record of a limited session (undefined otherwise):
 * the kept items' count and digest, and the limit applied.
 *
 * @param request - The parsed request.
 * @param kept - The items the session runs (`applyLimit`).
 * @returns The record.
 */
export async function limitedToRecord(
  request: Pick<TaskRequest, 'limit' | 'limitPerDirection'>,
  kept: readonly TaskItem[],
): Promise<{ count: number; sha256: string; limit?: number; perDirection?: number } | undefined> {
  if (request.limit === undefined && request.limitPerDirection === undefined) return undefined;
  return {
    count: kept.length,
    sha256: await itemListDigest(kept),
    ...(request.limit !== undefined ? { limit: request.limit } : { perDirection: request.limitPerDirection }),
  };
}

/** One line of a served item list. */
interface ServedItem {
  id: string;
  text: string;
  sha256: string;
  src?: string;
  tgt?: string;
}

/**
 * The digest of an item list: SHA-256 over `<id>\t<sha256>\n` per item, in order.
 *
 * @param items - `{ id, sha256 }` per item.
 * @returns 64 hex characters.
 */
export async function itemListDigest(items: ReadonlyArray<{ id: string; sha256: string }>): Promise<string> {
  return sha256Hex(items.map((i) => `${i.id}\t${i.sha256}\n`).join(''));
}

/**
 * Parse and verify a served item list (JSON lines) against its pin: every
 * line `{ id, text, sha256, src?, tgt? }`, ids distinct, each text's SHA-256
 * equal to its `sha256`, the count and the list digest equal to the values
 * compiled into the page, and translation items carrying both languages.
 *
 * @param body - The served file.
 * @param list - The compiled pin.
 * @returns The items, or the first reason the list is refused.
 */
export async function verifyItemList(
  body: string,
  list: TaskItemListSpec,
): Promise<{ ok: true; items: TaskItem[] } | { ok: false; message: string }> {
  const lines = body.split('\n').filter((l) => l.trim().length > 0);
  const items: TaskItem[] = [];
  const ids = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    let parsed: ServedItem;
    try {
      parsed = JSON.parse(lines[i]) as ServedItem;
    } catch {
      return { ok: false, message: `line ${i + 1} is not JSON` };
    }
    if (typeof parsed.id !== 'string' || typeof parsed.text !== 'string' || typeof parsed.sha256 !== 'string') {
      return { ok: false, message: `line ${i + 1} must be { id, text, sha256 }` };
    }
    if (ids.has(parsed.id)) return { ok: false, message: `item ${parsed.id} appears twice` };
    ids.add(parsed.id);
    if ((await sha256Hex(parsed.text)) !== parsed.sha256) return { ok: false, message: `item ${parsed.id}: the text does not match its SHA-256` };
    if (list.task === 'translate' && (typeof parsed.src !== 'string' || typeof parsed.tgt !== 'string')) {
      return { ok: false, message: `item ${parsed.id}: a translation item needs src and tgt` };
    }
    items.push({ id: parsed.id, text: parsed.text, sha256: parsed.sha256, ...(parsed.src ? { src: parsed.src, tgt: parsed.tgt } : {}) });
  }
  if (items.length !== list.count) return { ok: false, message: `the list holds ${items.length} items; the page expects ${list.count}` };
  const digest = await itemListDigest(items);
  if (digest !== list.sha256) return { ok: false, message: `the list digest ${digest} is not the pinned ${list.sha256}` };
  return { ok: true, items };
}

/** Translation directions of a list, in first-appearance order. */
export function listDirections(items: readonly TaskItem[]): Array<{ src: string; tgt: string }> {
  const out: Array<{ src: string; tgt: string }> = [];
  for (const item of items) {
    if (item.src && item.tgt && !out.some((d) => d.src === item.src && d.tgt === item.tgt)) out.push({ src: item.src, tgt: item.tgt });
  }
  return out;
}

/** Display name and provider model id of a system. */
function describeSystem(system: string): { providerModelId: string; displayName: string } {
  if (system === 'chrome-summarizer') return { providerModelId: 'Summarizer', displayName: 'Chrome Summarizer' };
  if (system === 'chrome-summarizer-default') return { providerModelId: 'Summarizer', displayName: 'Chrome Summarizer (default options)' };
  if (system.startsWith('chrome-translator')) return { providerModelId: 'Translator', displayName: 'Chrome Translator' };
  if (system === 'chrome-language-detector') return { providerModelId: 'LanguageDetector', displayName: 'Chrome Language Detector' };
  if (system === 'mediapipe-language-detector') return { providerModelId: 'language_detector', displayName: 'MediaPipe language detector' };
  const [base, dtype] = system.split('@');
  const repo = base.startsWith('opus-mt-') ? `Xenova/${base}` : `Xenova/${base}`;
  return { providerModelId: repo, displayName: `${repo} (${dtype})` };
}

/** One cell of a session plan, with the arm id it belongs to. */
export interface PlannedTaskCell extends TaskPlannedCell {
  arm: string;
  /** Translation direction of the cell. */
  direction?: { src: string; tgt: string };
}

/** The plan of a session: its control marker inputs and its cells. */
export interface TaskSessionPlan {
  systemOrder: string[];
  cells: PlannedTaskCell[];
}

/**
 * Plan a session's cells. A translation fallback template (`opus-mt@q8`)
 * expands to one system per direction of the list (`opus-mt-en-de@q8`); the
 * built-in translator is one system with one cell per direction. The arms
 * are put in the task's fixed order (or its reverse); within an arm the
 * cells follow the list's directions.
 *
 * @param request - The parsed request.
 * @param items - The verified items.
 * @returns The plan.
 */
export function planTaskSession(request: TaskRequest, items: readonly TaskItem[]): TaskSessionPlan {
  const directions = request.task === 'translate' ? listDirections(items) : [];
  const setShort = SET_SHORT[request.list.set];
  const arms: Array<{ arm: string; runtimeId: BenchRuntimeId; system: string; directions: Array<{ src: string; tgt: string } | undefined> }> = [];
  for (const template of request.systems) {
    const slash = template.indexOf('/');
    const runtimeId = template.slice(0, slash) as BenchRuntimeId;
    const system = template.slice(slash + 1);
    if (request.task === 'translate' && system.startsWith('opus-mt@')) {
      const dtype = system.split('@')[1];
      for (const d of directions) {
        const id = `opus-mt-${d.src}-${d.tgt}@${dtype}`;
        arms.push({ arm: taskArmId(runtimeId, id), runtimeId, system: id, directions: [d] });
      }
    } else {
      arms.push({ arm: taskArmId(runtimeId, system), runtimeId, system, directions: request.task === 'translate' ? directions : [undefined] });
    }
  }
  const systemOrder = taskSystemOrder(arms.map((a) => a.arm), request.order);
  const cells: PlannedTaskCell[] = [];
  for (const armId of systemOrder) {
    const arm = arms.find((a) => a.arm === armId)!;
    const { providerModelId, displayName } = describeSystem(arm.system);
    for (const direction of arm.directions) {
      const model: BenchModelRef = {
        benchModelId: arm.system,
        runtimeId: arm.runtimeId,
        providerModelId: direction && arm.runtimeId === 'chrome-ai' ? `${providerModelId}:${direction.src}-${direction.tgt}` : providerModelId,
        displayName,
        task: 'task',
        ...(arm.system.includes('@') ? { quantization: arm.system.split('@')[1] } : {}),
      };
      const workloadId =
        request.task === 'translate' && direction
          ? `translate-${direction.src}-${direction.tgt}-${request.list.subset}`
          : `${request.task === 'detect-language' ? 'detect' : request.task}-${setShort}-${request.list.subset}`;
      const cellItems =
        request.phase === 'download'
          ? []
          : direction
            ? items.filter((i) => i.src === direction.src && i.tgt === direction.tgt)
            : [...items];
      cells.push({ arm: armId, model, workloadId, items: cellItems, ...(direction ? { direction } : {}) });
    }
  }
  return { systemOrder, cells };
}

/**
 * The `harness.control` record of a session.
 *
 * @param request - The parsed request.
 * @param plan - The session plan.
 * @param driver - The driver's start captures, when a driver injected them.
 * @returns The marker (`createHarnessControl('chrome-ai-tasks', { tasks })`).
 */
export function taskControl(
  request: TaskRequest,
  plan: TaskSessionPlan,
  driver?: TaskDriverRecord,
  limitedTo?: { count: number; sha256: string; limit?: number; perDirection?: number },
): HarnessControl {
  return createHarnessControl('chrome-ai-tasks', {
    tasks: {
      protocol: 'tasks/1',
      phase: request.phase,
      task: request.task,
      set: request.list.set,
      subset: request.list.subset as TaskSubset,
      itemList: { id: request.list.id, count: request.list.count, sha256: request.list.sha256, ...(limitedTo ? { limitedTo } : {}) },
      sessionIndex: request.sessionIndex,
      order: request.order,
      systemOrder: plan.systemOrder,
      processCold: request.processCold,
      ...(request.repeat !== undefined ? { repeat: request.repeat } : {}),
      ...(driver ? { driver } : {}),
    },
  });
}

/**
 * The `chrome://components` entry that shows a Translator pair's language
 * pack installed (`Chrome TranslateKit <a>-<b>`, either order), as
 * `<name> <version>`; undefined when the record does not list it.
 *
 * @param parsed - The driver's parsed `chrome://components` entries.
 * @param src - Source language.
 * @param tgt - Target language.
 * @returns The entry text, or undefined.
 */
export function translatorPackInComponents(
  parsed: ReadonlyArray<{ name: string; version: string }> | undefined,
  src: string,
  tgt: string,
): string | undefined {
  const entry = parsed?.find((c) => c.name === `Chrome TranslateKit ${src}-${tgt}` || c.name === `Chrome TranslateKit ${tgt}-${src}`);
  return entry ? `${entry.name} ${entry.version}` : undefined;
}

/** File name of an exported task session. */
export function taskExportFileName(runId: string): string {
  return `localmode-tasks-${runId}.json`;
}
