/**
 * The `tasks/1` sub-protocol of the `chrome-ai-tasks` control kind: its
 * constants, the system-order rule, and the shape checks of the session
 * record (`harness.control.tasks`) and of a task cell (`cells[].task` and its
 * `TaskIteration`s). Pure; shared by `createHarnessControl`,
 * `runTaskSession` and `validateRunShape`.
 */

import type {
  BenchRuntimeId,
  TaskKind,
  TaskOrder,
  TaskPhase,
  TaskSet,
  TaskSubset,
} from '../types.js';
import { TASKS_PROTOCOL_VERSION } from '../types.js';
import { sha256HexSync } from './sha256.js';

/** The tasks a session may run (also the workload kinds of its cells). */
export const TASK_KINDS: readonly TaskKind[] = ['summarize', 'translate', 'detect-language'] as const;

/** Session phases. */
export const TASK_PHASES: readonly TaskPhase[] = ['download', 'quality', 'latency', 'pilot'] as const;

/** Item sets, and the tasks each serves. */
export const TASK_SETS: Readonly<Record<TaskSet, readonly TaskKind[]>> = {
  'cnndm-test': ['summarize'],
  'cnndm-reserve': ['summarize'],
  'xsum-test': ['summarize'],
  'flores-devtest': ['translate', 'detect-language'],
  'wili-test': ['detect-language'],
};

/** Item subsets. */
export const TASK_SUBSETS: readonly TaskSubset[] = ['full', 'S', 'R', 'L', 'pilot'] as const;

/** System orders. */
export const TASK_ORDERS: readonly TaskOrder[] = ['fixed', 'reversed'] as const;

/** The runtimes a task cell may run on. */
export const TASK_RUNTIMES: readonly BenchRuntimeId[] = [
  'chrome-ai',
  'transformers-wasm',
  'transformers-webgpu',
  'transformers-wasm-current',
  'mediapipe',
] as const;

/** Per-item watchdog, ms: a timeout is that item's error and the session moves on (nothing is retried). */
export const TASK_ITEM_WATCHDOG_MS: Readonly<Record<TaskKind, number>> = {
  summarize: 180_000,
  translate: 60_000,
  'detect-language': 10_000,
};

/** Longest the session waits between systems for compute pressure to settle. */
export const TASK_PRESSURE_GATE_MS = 30_000;

/** Most detector candidates an item keeps. */
export const TASK_DETECT_MAX_CANDIDATES = 20;

/** Longest output an item may carry (the shape limit of an `LLMIteration`'s text). */
export const TASK_TEXT_MAX_CHARS = 20_000;

/** Longest text of one `chrome://` capture the driver may inject. */
export const TASK_CAPTURE_MAX_CHARS = 200_000;

/** Most items one item list may hold. */
export const TASK_LIST_MAX_ITEMS = 100_000;

const HEX64 = /^[0-9a-f]{64}$/;

/**
 * The arm id of a system on a lane: `<runtimeId>/<systemId>` (the cell id
 * without its workload). A system can run on two lanes, so `systemOrder`
 * lists arms.
 *
 * @param runtimeId - The lane.
 * @param systemId - The system (the cell's `model.benchModelId`).
 * @returns The arm id.
 * @example
 * taskArmId('transformers-wasm', 'opus-mt-en-de@q8'); // 'transformers-wasm/opus-mt-en-de@q8'
 */
export function taskArmId(runtimeId: string, systemId: string): string {
  return `${runtimeId}/${systemId}`;
}

/** Splits an arm id into lane and system; undefined when it is not one. */
function parseArm(arm: unknown): { runtimeId: BenchRuntimeId; systemId: string } | undefined {
  if (typeof arm !== 'string') return undefined;
  const slash = arm.indexOf('/');
  if (slash < 1) return undefined;
  const runtimeId = arm.slice(0, slash) as BenchRuntimeId;
  const systemId = arm.slice(slash + 1);
  if (!TASK_RUNTIMES.includes(runtimeId) || !/^[A-Za-z0-9][A-Za-z0-9._@-]{0,79}$/.test(systemId)) return undefined;
  return { runtimeId, systemId };
}

/** Rank of an arm under the fixed order: built-in first, then lane, then dtype. */
function armRank(arm: string): [number, number, number] {
  const parsed = parseArm(arm)!;
  const builtIn = parsed.runtimeId === 'chrome-ai' ? 0 : 1;
  const lane = TASK_RUNTIMES.indexOf(parsed.runtimeId);
  const dtype = /@q8$/.test(parsed.systemId) ? 0 : /@fp16$/.test(parsed.systemId) ? 1 : /@fp32$/.test(parsed.systemId) ? 2 : 0;
  const defaultArm = /-default$/.test(parsed.systemId) ? 1 : 0;
  return [builtIn, lane * 4 + dtype, defaultArm];
}

function compareRank(a: [number, number, number], b: [number, number, number]): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

/** True when `arms` is already in the fixed order (equal ranks keep their given order). */
function isFixedOrder(arms: readonly string[]): boolean {
  for (let i = 1; i < arms.length; i++) if (compareRank(armRank(arms[i - 1]), armRank(arms[i])) > 0) return false;
  return true;
}

/**
 * Sort arms into the task's fixed order: Chrome's built-in systems first
 * (the options-of-record arm before a `-default` arm), then the fallbacks by
 * lane (`transformers-wasm`, `transformers-webgpu`, `mediapipe`) and dtype
 * (q8, fp16, fp32). Arms of equal rank keep their given order (the
 * translation directions in item-list order).
 *
 * @param arms - Arm ids (`taskArmId`).
 * @param order - `fixed`, or `reversed` for the exact reverse of the fixed order.
 * @returns A new array.
 * @throws {TypeError} When an entry is not an arm id.
 * @example
 * taskSystemOrder(['transformers-wasm/distilbart-cnn-6-6@q8', 'chrome-ai/chrome-summarizer'], 'fixed');
 * // ['chrome-ai/chrome-summarizer', 'transformers-wasm/distilbart-cnn-6-6@q8']
 */
export function taskSystemOrder(arms: readonly string[], order: TaskOrder): string[] {
  for (const arm of arms) if (!parseArm(arm)) throw new TypeError(`not a task arm id: ${JSON.stringify(arm)}`);
  const indexed = arms.map((arm, i) => ({ arm, i, rank: armRank(arm) }));
  indexed.sort((a, b) => compareRank(a.rank, b.rank) || a.i - b.i);
  const fixed = indexed.map((x) => x.arm);
  return order === 'fixed' ? fixed : fixed.reverse();
}

/**
 * The distinct runtimes of a system order, first appearance first (the
 * `runtimeOrder` a `chrome-ai-tasks` control run records).
 *
 * @param systemOrder - Arm ids in executed order.
 * @returns The runtime ids.
 * @example
 * taskRuntimeOrder(['chrome-ai/chrome-translator', 'transformers-wasm/opus-mt-en-de@q8']); // ['chrome-ai', 'transformers-wasm']
 */
export function taskRuntimeOrder(systemOrder: readonly string[]): BenchRuntimeId[] {
  const out: BenchRuntimeId[] = [];
  for (const arm of systemOrder) {
    const parsed = parseArm(arm);
    if (parsed && !out.includes(parsed.runtimeId)) out.push(parsed.runtimeId);
  }
  return out;
}

const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const isNonNegative = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const isText = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const isShort = (v: unknown, max = 200): v is string => typeof v === 'string' && v.length >= 1 && v.length <= max;

/** The problem with a `TaskDriverRecord`, or undefined. */
function driverError(value: unknown): string | undefined {
  const at = 'harness.control.tasks.driver';
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return `${at} must be an object`;
  const d = value as Record<string, unknown>;
  if (!isShort(d.driverVersion, 64)) return `${at}.driverVersion must be a string of 1 to 64 characters`;
  const launch = d.launch as Record<string, unknown> | null | undefined;
  if (
    typeof launch !== 'object' || launch === null ||
    !isShort(launch.executablePath, 1024) ||
    !Array.isArray(launch.args) || launch.args.length > 200 || !launch.args.every((a) => isText(a, 4096)) ||
    !Array.isArray(launch.ignoredDefaultArgs) || launch.ignoredDefaultArgs.length > 200 ||
    !launch.ignoredDefaultArgs.every((a) => isText(a, 4096)) ||
    !isText(launch.commandLine, 32_768)
  ) {
    return `${at}.launch must be { executablePath, args: string[], ignoredDefaultArgs: string[], commandLine }`;
  }
  if (!isShort(d.profileId, 128)) return `${at}.profileId must be a string of 1 to 128 characters`;
  if (!isText(d.chromeVersionText, TASK_CAPTURE_MAX_CHARS)) return `${at}.chromeVersionText must be a string of at most ${TASK_CAPTURE_MAX_CHARS} characters`;
  const startEnd = (key: string, check: (v: unknown) => boolean, shape: string): string | undefined => {
    const se = d[key] as Record<string, unknown> | null | undefined;
    if (typeof se !== 'object' || se === null || !check(se.start) || ('end' in se && se.end !== undefined && !check(se.end))) {
      return `${at}.${key} must be { start, end? } with each ${shape}`;
    }
    return undefined;
  };
  const components = (v: unknown) => {
    const c = v as Record<string, unknown> | null;
    return (
      typeof c === 'object' && c !== null && isText(c.text, TASK_CAPTURE_MAX_CHARS) && Array.isArray(c.parsed) && c.parsed.length <= 200 &&
      c.parsed.every((e) => {
        const x = e as Record<string, unknown> | null;
        return typeof x === 'object' && x !== null && isText(x.name, 200) && isText(x.id, 200) && isText(x.version, 100) && isText(x.status, 200);
      })
    );
  };
  const internals = (v: unknown) => {
    const c = v as Record<string, unknown> | null;
    if (typeof c !== 'object' || c === null || !isText(c.text, TASK_CAPTURE_MAX_CHARS)) return false;
    if ('performanceClass' in c && c.performanceClass !== undefined && !isText(c.performanceClass, 100)) return false;
    if ('criteria' in c && c.criteria !== undefined) {
      const cr = c.criteria as Record<string, unknown> | null;
      if (typeof cr !== 'object' || cr === null || Object.keys(cr).length > 100 || !Object.values(cr).every((x) => isText(x, 500))) return false;
    }
    if ('assets' in c && c.assets !== undefined) {
      if (!Array.isArray(c.assets) || c.assets.length > 200) return false;
      for (const a of c.assets) {
        const x = a as Record<string, unknown> | null;
        if (typeof x !== 'object' || x === null || !isShort(x.name)) return false;
        if (x.version !== undefined && !isText(x.version, 100)) return false;
        if (x.state !== undefined && !isText(x.state, 100)) return false;
      }
    }
    return true;
  };
  const folders = (v: unknown) =>
    typeof v === 'object' && v !== null && !Array.isArray(v) && Object.keys(v).length <= 500 &&
    Object.values(v as Record<string, unknown>).every((n) => isInt(n, 0, Number.MAX_SAFE_INTEGER));
  return (
    startEnd('components', components, 'a { text, parsed: { name, id, version, status }[] } capture') ??
    startEnd('onDeviceInternals', internals, 'a { text, performanceClass?, criteria?, assets? } capture') ??
    startEnd('freeDiskBytes', (v) => isInt(v, 0, Number.MAX_SAFE_INTEGER), 'a byte count') ??
    startEnd('profileFolderBytes', folders, 'an object of folder name to byte count')
  );
}

/**
 * The problem with a control marker's `tasks` record (and the run order it
 * implies), or undefined when it is right for the kind (since bench 0.10.0).
 * A `chrome-ai-tasks` marker must carry a well-formed `TaskSessionRecord`:
 * protocol `tasks/1`; a known phase, task and subset; a set that serves the
 * task; an item list `{ id, count, sha256 }`; a 1-based `sessionIndex`; a
 * `systemOrder` of distinct arm ids that is the task's fixed order or its
 * exact reverse, matching `order`; `repeat` only on an R session; and a
 * `runtimeOrder` equal to the distinct runtimes of `systemOrder`. Every other
 * kind carries no `tasks`. Shared by `createHarnessControl`, the task runner
 * and `validateRunShape`.
 *
 * @param control - A control marker whose `kind` is one of `CONTROL_KINDS`.
 * @returns The error message, or undefined.
 * @example
 * controlTasksError({ kind: 'fixed-order', runtimeOrder: [], tasks: {} });
 * // 'harness.control.tasks is set only on a chrome-ai-tasks control run, not on fixed-order'
 */
export function controlTasksError(control: { kind: string; runtimeOrder?: unknown; tasks?: unknown }): string | undefined {
  const tasks = control.tasks;
  if (control.kind !== 'chrome-ai-tasks') {
    return tasks === undefined ? undefined : `harness.control.tasks is set only on a chrome-ai-tasks control run, not on ${control.kind}`;
  }
  const at = 'harness.control.tasks';
  if (typeof tasks !== 'object' || tasks === null || Array.isArray(tasks)) return `${at} must be an object on a chrome-ai-tasks control run`;
  const t = tasks as Record<string, unknown>;
  if (t.protocol !== TASKS_PROTOCOL_VERSION) return `${at}.protocol must be "${TASKS_PROTOCOL_VERSION}"`;
  if (!TASK_PHASES.includes(t.phase as TaskPhase)) return `${at}.phase must be one of ${TASK_PHASES.join(', ')}`;
  if (!TASK_KINDS.includes(t.task as TaskKind)) return `${at}.task must be one of ${TASK_KINDS.join(', ')}`;
  const setTasks = TASK_SETS[t.set as TaskSet];
  if (!setTasks) return `${at}.set must be one of ${Object.keys(TASK_SETS).join(', ')}`;
  if (!setTasks.includes(t.task as TaskKind)) return `${at}.set ${String(t.set)} does not serve the ${String(t.task)} task`;
  if (!TASK_SUBSETS.includes(t.subset as TaskSubset)) return `${at}.subset must be one of ${TASK_SUBSETS.join(', ')}`;
  const list = t.itemList as Record<string, unknown> | null | undefined;
  if (
    typeof list !== 'object' || list === null ||
    !isShort(list.id, 128) || !isInt(list.count, 1, TASK_LIST_MAX_ITEMS) ||
    typeof list.sha256 !== 'string' || !HEX64.test(list.sha256)
  ) {
    return `${at}.itemList must be { id, count (1 to ${TASK_LIST_MAX_ITEMS}), sha256 (64 hex) }`;
  }
  if (!isInt(t.sessionIndex, 1, 10_000)) return `${at}.sessionIndex must be an integer from 1 to 10000`;
  if (!TASK_ORDERS.includes(t.order as TaskOrder)) return `${at}.order must be fixed or reversed`;
  if (typeof t.processCold !== 'boolean') return `${at}.processCold must be a boolean`;
  if ('repeat' in t && t.repeat !== undefined) {
    if (t.subset !== 'R') return `${at}.repeat is set only on an R session`;
    if (!isInt(t.repeat, 1, 100)) return `${at}.repeat must be an integer from 1 to 100`;
  }
  const order = t.systemOrder;
  if (!Array.isArray(order) || order.length === 0 || order.length > 200) return `${at}.systemOrder must list 1 to 200 arm ids`;
  for (const arm of order) {
    if (!parseArm(arm)) return `${at}.systemOrder entry ${JSON.stringify(arm)} is not an arm id <runtimeId>/<systemId> on ${TASK_RUNTIMES.join(', ')}`;
  }
  if (new Set(order).size !== order.length) return `${at}.systemOrder lists an arm twice`;
  const arms = order as string[];
  const fixed = isFixedOrder(arms);
  const reversed = isFixedOrder([...arms].reverse());
  if (!fixed && !reversed) {
    return `${at}.systemOrder is neither the task's fixed order (built-in first, then lane and dtype) nor its exact reverse`;
  }
  if ((t.order === 'fixed' && !fixed) || (t.order === 'reversed' && !reversed)) {
    return `${at}.systemOrder is not in the ${String(t.order)} order`;
  }
  const expected = taskRuntimeOrder(arms);
  const given = control.runtimeOrder;
  if (!Array.isArray(given) || given.length !== expected.length || given.some((id, i) => id !== expected[i])) {
    return `harness.control.runtimeOrder must be the runtimes of harness.control.tasks.systemOrder in executed order [${expected.join(', ')}]`;
  }
  if ('driver' in t && t.driver !== undefined) return driverError(t.driver);
  return undefined;
}

/** The problem with an item's truncation record, or undefined. */
function truncationError(it: Record<string, unknown>, at: string, runtimeId: string): string | undefined {
  const keys = ['inputTruncated', 'inputTokens', 'modelMaxTokens'] as const;
  const present = keys.filter((k) => k in it && it[k] !== undefined);
  if (present.length === 0) return undefined;
  if (present.length !== 3) return `${at}: inputTruncated, inputTokens and modelMaxTokens are set all three together`;
  if (runtimeId === 'chrome-ai' || runtimeId === 'mediapipe') {
    return keys.every((k) => it[k] === null) ? undefined : `${at}: the truncation record is null on a ${runtimeId} item (no tokenizer)`;
  }
  if (!isInt(it.inputTokens, 0, 10_000_000) || !isInt(it.modelMaxTokens, 1, 10_000_000) || typeof it.inputTruncated !== 'boolean') {
    return `${at}: a fallback item's truncation record is { inputTruncated: boolean, inputTokens, modelMaxTokens } (integers)`;
  }
  if (it.inputTruncated !== (it.inputTokens as number) > (it.modelMaxTokens as number)) {
    return `${at}: inputTruncated must be inputTokens > modelMaxTokens`;
  }
  return undefined;
}

/** The problem with one `TaskIteration`, or undefined. */
function taskIterationError(value: unknown, j: number, task: TaskKind, runtimeId = ''): string | undefined {
  const at = `iterations[${j}]`;
  if (typeof value !== 'object' || value === null) return `${at} must be an object`;
  const it = value as Record<string, unknown>;
  if (!isShort(it.itemId, 256)) return `${at}.itemId must be a string of 1 to 256 characters`;
  if (it.index !== j) return `${at}.index must be ${j} (items run in list order, one per call)`;
  if (!['delta', 'cumulative-converted', 'none'].includes(it.chunkMode as string)) return `${at}.chunkMode must be delta, cumulative-converted or none`;
  if (typeof it.text !== 'string') return `${at}.text must be a string`;
  if (!Array.isArray(it.chunks)) return `${at}.chunks must be an array`;
  if (!Array.isArray(it.gates)) return `${at}.gates must be an array`;
  if (it.chunkMode === 'none') {
    const c = it.chunks as Array<Record<string, unknown>>;
    if (c.length !== 1 || c[0]?.t !== it.endT || c[0]?.c !== (it.text as string).length) {
      return `${at}: a non-streaming item records exactly one chunk { t: endT, c: text.length }`;
    }
  }
  if (typeof it.outputSha256 !== 'string' || it.outputSha256 !== sha256HexSync(it.text as string)) {
    return `${at}.outputSha256 does not match the SHA-256 of the item's text`;
  }
  if (typeof it.sourceSha256 !== 'string' || !HEX64.test(it.sourceSha256)) return `${at}.sourceSha256 must be 64 hex`;
  if (!isInt(it.inputChars, 0, 10_000_000)) return `${at}.inputChars must be a non-negative integer`;
  if ('source' in it && it.source !== undefined) {
    if (task !== 'translate') return `${at}.source is set only on a translate cell`;
    if (typeof it.source !== 'string' || it.source.length > TASK_TEXT_MAX_CHARS) return `${at}.source must be a string of at most ${TASK_TEXT_MAX_CHARS} characters`;
    if (sha256HexSync(it.source) !== it.sourceSha256) return `${at}.sourceSha256 does not match the SHA-256 of source`;
    if (it.source.length !== it.inputChars) return `${at}.inputChars must equal source.length`;
  } else if (task === 'translate') {
    return `${at}.source is required on a translate cell`;
  }
  if ('inputUsage' in it && it.inputUsage !== undefined) {
    const u = it.inputUsage as Record<string, unknown> | null;
    if (typeof u !== 'object' || u === null || !isNonNegative(u.value) || (u.unit !== 'chrome-quota' && u.unit !== 'tokens')) {
      return `${at}.inputUsage must be { value (non-negative), unit: "chrome-quota" | "tokens" }`;
    }
  }
  if ('detect' in it && it.detect !== undefined) {
    if (task !== 'detect-language') return `${at}.detect is set only on a detect-language cell`;
    const d = it.detect;
    if (!Array.isArray(d) || d.length > TASK_DETECT_MAX_CANDIDATES) return `${at}.detect must list at most ${TASK_DETECT_MAX_CANDIDATES} candidates`;
    for (const cand of d) {
      const x = cand as Record<string, unknown> | null;
      if (typeof x !== 'object' || x === null || !isShort(x.language, 35) || typeof x.confidence !== 'number' || !(x.confidence >= 0 && x.confidence <= 1)) {
        return `${at}.detect entries must be { language (1 to 35 chars), confidence (0 to 1) }`;
      }
    }
  }
  if ('targetToken' in it && it.targetToken !== undefined) {
    if (task !== 'translate') return `${at}.targetToken is set only on a translate cell`;
    if (typeof it.targetToken !== 'string' || !/^>>[A-Za-z_]{2,16}<<$/.test(it.targetToken)) return `${at}.targetToken must look like ">>cmn_Hans<<"`;
  }
  const truncation = truncationError(it, at, runtimeId);
  if (truncation) return truncation;
  if ('error' in it && it.error !== undefined) {
    const e = it.error as Record<string, unknown> | null;
    if (typeof e !== 'object' || e === null || !isShort(e.name, 200) || !isText(e.message, 4000) || ('cause' in e && e.cause !== undefined && !isText(e.cause, 4000))) {
      return `${at}.error must be { name, message, cause? }`;
    }
    if (it.text !== '') return `${at}: an item that failed carries an empty text`;
  }
  return undefined;
}

/**
 * The problem with a cell's task record, or undefined when it is fine
 * (since bench 0.10.0). On a `chrome-ai-tasks` control run every cell is a
 * task cell: its `workloadKind` is the session's task, its arm
 * (`<runtimeId>/<model.benchModelId>`) is in `systemOrder`, it carries a
 * `task` record and no `quality`, and each iteration is a well-formed
 * `TaskIteration`: `index` 0 to n-1 in order, distinct item ids (at most the
 * list's count), `outputSha256` (and, on translation, `sourceSha256` over
 * `source`) recomputing, `detect` only on a detect cell and bounded, a
 * non-streaming item's single `{ t: endT, c: text.length }` chunk, and an
 * empty text on a failed item. Any other run carries no `task` record and no
 * task workload kind.
 *
 * @param cell - A cell-shaped value.
 * @param control - The run's `harness.control`, when it has one.
 * @returns The error message, or undefined.
 * @example
 * taskCellError({ runtimeId: 'webllm', task: { api: 'x' } }, null);
 * // 'task is set only on a cell of a chrome-ai-tasks control run'
 */
export function taskCellError(
  cell: Record<string, unknown>,
  control?: { kind?: unknown; tasks?: unknown } | null,
): string | undefined {
  const isTaskKind = TASK_KINDS.includes(cell.workloadKind as TaskKind);
  if (control?.kind !== 'chrome-ai-tasks') {
    if (cell.task !== undefined) return 'task is set only on a cell of a chrome-ai-tasks control run';
    if (isTaskKind) return `workloadKind ${String(cell.workloadKind)} is used only on a chrome-ai-tasks control run`;
    return undefined;
  }
  const tasks = control.tasks as { task?: TaskKind; systemOrder?: unknown; itemList?: { count?: unknown } } | undefined;
  if (!tasks || typeof tasks !== 'object') return undefined; // the session record's own error is reported
  if (cell.workloadKind !== tasks.task) return `workloadKind must be the session's task ${String(tasks.task)}, got ${JSON.stringify(cell.workloadKind)}`;
  const model = cell.model as { benchModelId?: unknown } | undefined;
  const arm = taskArmId(String(cell.runtimeId), String(model?.benchModelId));
  if (!Array.isArray(tasks.systemOrder) || !tasks.systemOrder.includes(arm)) return `arm ${arm} is not in harness.control.tasks.systemOrder`;
  if (cell.quality !== undefined) return 'a task cell carries no quality record';
  const record = cell.task as Record<string, unknown> | null | undefined;
  if (typeof record !== 'object' || record === null || Array.isArray(record)) return 'task is required on every cell of a chrome-ai-tasks control run';
  if (!isShort(record.api, 100)) return 'task.api must be a string of 1 to 100 characters';
  for (const key of ['availabilityBefore', 'availabilityAtCreate', 'availabilityAfter'] as const) {
    if (key in record && record[key] !== undefined && !isShort(record[key], 32)) return `task.${key} must be a string of 1 to 32 characters`;
  }
  if ('inputQuota' in record && record.inputQuota !== undefined && record.inputQuota !== null && !isNonNegative(record.inputQuota)) {
    return 'task.inputQuota must be a non-negative number or null';
  }
  if ('download' in record && record.download !== undefined) {
    const d = record.download as Record<string, unknown> | null;
    if (typeof d !== 'object' || d === null || !Array.isArray(d.events) || d.events.length > 10_000 || !isNonNegative(d.wallMs)) {
      return 'task.download must be { events: { t, loaded, total }[], wallMs, profileBytesDelta? }';
    }
    for (const e of d.events) {
      const x = e as Record<string, unknown> | null;
      if (typeof x !== 'object' || x === null || typeof x.t !== 'number' || !isNonNegative(x.loaded) || !isNonNegative(x.total)) {
        return 'task.download.events entries must be { t, loaded, total }';
      }
    }
    if ('profileBytesDelta' in d && d.profileBytesDelta !== undefined && !(typeof d.profileBytesDelta === 'number' && Number.isInteger(d.profileBytesDelta))) {
      return 'task.download.profileBytesDelta must be an integer';
    }
  }
  const iterations = cell.iterations;
  if (!Array.isArray(iterations)) return undefined; // reported by the base shape check
  const count = typeof tasks.itemList?.count === 'number' ? tasks.itemList.count : Number.POSITIVE_INFINITY;
  if (iterations.length > count) return `the cell ran ${iterations.length} items, more than the list's ${count}`;
  const seen = new Set<string>();
  for (let j = 0; j < iterations.length; j++) {
    const error = taskIterationError(iterations[j], j, tasks.task as TaskKind, String(cell.runtimeId));
    if (error) return error;
    const id = (iterations[j] as { itemId: string }).itemId;
    if (seen.has(id)) return `iterations[${j}].itemId ${JSON.stringify(id)} repeats an item of the cell`;
    seen.add(id);
  }
  return undefined;
}

/**
 * The problem with the cell order of a `chrome-ai-tasks` run, or undefined:
 * every arm of `systemOrder` has at least one cell, and the cells run arm by
 * arm in that order.
 *
 * @param cells - The run's cells (shape-checked).
 * @param systemOrder - `harness.control.tasks.systemOrder`.
 * @returns The error message, or undefined.
 */
export function taskCellOrderError(
  cells: ReadonlyArray<{ runtimeId?: unknown; model?: { benchModelId?: unknown } }>,
  systemOrder: readonly string[],
): string | undefined {
  let last = -1;
  const covered = new Set<string>();
  for (const cell of cells) {
    const arm = taskArmId(String(cell.runtimeId), String(cell.model?.benchModelId));
    const pos = systemOrder.indexOf(arm);
    if (pos < 0) continue;
    if (pos < last) return `cell of ${arm} runs after a later arm of harness.control.tasks.systemOrder`;
    last = pos;
    covered.add(arm);
  }
  const missing = systemOrder.find((arm) => !covered.has(arm));
  return missing ? `no cell records the arm ${missing} of harness.control.tasks.systemOrder` : undefined;
}
