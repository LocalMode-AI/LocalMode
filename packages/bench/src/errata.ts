/**
 * Per-cell errata: a dataset-level list of published cells that enter no
 * aggregate, each with the reason it is excluded. An erratum is an exclusion,
 * never a re-score: the run file is unchanged, the cell keeps its status and
 * values, and every aggregate that leaves it out counts it in a visible
 * "excluded by erratum" tally.
 *
 * The dataset keeps the list in `index/errata.json`: a JSON array of
 * {@link ErratumEntry} objects.
 */

/** Dataset-relative path of the errata file. */
export const ERRATA_FILE = 'index/errata.json';

/**
 * One erratum: the cells of one run that are excluded from every aggregate.
 *
 * An entry names only cells recorded `ok`: a cell with any other status
 * already enters no aggregate, so it needs no entry (and the validator
 * refuses one, since it would inflate the tally without excluding anything).
 */
export interface ErratumEntry {
  /** The run the cells belong to. */
  runId: string;
  /** Cell ids (`runtimeId/benchModelId/workloadId`) of that run, each recorded `ok`. */
  cellIds: string[];
  /** Why the cells are excluded: what is wrong with them, stated for a reader of the dataset. */
  reason: string;
  /** When the erratum was recorded (ISO 8601 date or date-time). */
  recordedAt: string;
  /** Where the evidence is documented (a dataset README section, an issue, a commit). */
  reference: string;
}

/** The cells an errata list excludes, keyed for lookup. */
export interface ErrataExclusions {
  /** True when the cell is listed. */
  has(runId: string, cellId: string): boolean;
  /** Number of listed cells. */
  readonly size: number;
}

/** What an aggregate left out because of errata. */
export interface ErrataTally {
  /** Cells that would have entered the aggregate and were excluded. */
  cells: number;
  /** Distinct runs those cells belong to. */
  runs: number;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$/;
const ENTRY_KEYS = new Set(['runId', 'cellIds', 'reason', 'recordedAt', 'reference']);

function nonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Check the shape of an errata file's parsed JSON.
 *
 * @param value - The parsed contents of `index/errata.json`.
 * @returns Human-readable errors; empty when the value is a well-formed list.
 * @example
 * const errors = validateErrataShape(JSON.parse(text));
 * @see validateErrata
 */
export function validateErrataShape(value: unknown): string[] {
  if (!Array.isArray(value)) return ['errata: not a JSON array'];
  const errors: string[] = [];
  const seen = new Set<string>();
  value.forEach((entry: unknown, i) => {
    const at = `errata[${i}]`;
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      errors.push(`${at}: not an object`);
      return;
    }
    const e = entry as Record<string, unknown>;
    for (const key of Object.keys(e)) {
      if (!ENTRY_KEYS.has(key)) errors.push(`${at}: unknown field "${key}"`);
    }
    if (!nonEmptyString(e.runId)) errors.push(`${at}.runId: must be a non-empty string`);
    if (!nonEmptyString(e.reason)) errors.push(`${at}.reason: must be a non-empty string`);
    if (!nonEmptyString(e.reference)) errors.push(`${at}.reference: must be a non-empty string`);
    if (typeof e.recordedAt !== 'string' || !ISO_DATE.test(e.recordedAt) || Number.isNaN(Date.parse(e.recordedAt))) {
      errors.push(`${at}.recordedAt: must be an ISO 8601 date or date-time`);
    }
    if (!Array.isArray(e.cellIds) || e.cellIds.length === 0) {
      errors.push(`${at}.cellIds: must be a non-empty array`);
      return;
    }
    e.cellIds.forEach((cellId: unknown, j) => {
      if (!nonEmptyString(cellId)) {
        errors.push(`${at}.cellIds[${j}]: must be a non-empty string`);
        return;
      }
      if (typeof e.runId !== 'string') return;
      const key = `${e.runId}\u0000${cellId}`;
      if (seen.has(key)) errors.push(`${at}.cellIds[${j}]: ${e.runId} ${cellId} is listed more than once`);
      seen.add(key);
    });
  });
  return errors;
}

/** The part of a run (or of an index entry) the errata validator reads. */
export interface ErrataRunRef {
  runId: string;
  /** The run's cells; a cell without `status` (an index entry's cell) counts as `ok`. */
  cells: ReadonlyArray<{ cellId: string; status?: string }>;
}

/**
 * Check an errata list against the dataset it applies to: the list must be
 * well-formed, and every entry must name a run in the dataset and, in that
 * run, cells that exist and are recorded `ok`.
 *
 * @param errata - The parsed contents of `index/errata.json`.
 * @param runs - Every run of the dataset (run files, or index entries).
 * @returns Human-readable errors; empty when the list may be applied.
 * @example
 * const errors = validateErrata(errata, runs);
 * if (errors.length > 0) throw new Error(errors.join('\n'));
 * @see validateErrataShape
 */
export function validateErrata(errata: unknown, runs: Iterable<ErrataRunRef>): string[] {
  const shape = validateErrataShape(errata);
  if (shape.length > 0) return shape;
  const byRun = new Map<string, Map<string, string>>();
  for (const run of runs) {
    byRun.set(run.runId, new Map(run.cells.map((c) => [c.cellId, c.status ?? 'ok'])));
  }
  const errors: string[] = [];
  (errata as ErratumEntry[]).forEach((entry, i) => {
    const cells = byRun.get(entry.runId);
    if (!cells) {
      errors.push(`errata[${i}]: run ${entry.runId} is not in the dataset`);
      return;
    }
    entry.cellIds.forEach((cellId, j) => {
      const status = cells.get(cellId);
      if (status === undefined) {
        errors.push(`errata[${i}].cellIds[${j}]: run ${entry.runId} has no cell ${cellId}`);
      } else if (status !== 'ok') {
        errors.push(
          `errata[${i}].cellIds[${j}]: cell ${cellId} of run ${entry.runId} is ${status}, ` +
            'which enters no aggregate; an erratum names only ok cells',
        );
      }
    });
  });
  return errors;
}

/**
 * Index an errata list for lookup. Does not validate: call
 * {@link validateErrata} first.
 *
 * @param errata - Erratum entries (an empty list excludes nothing).
 * @returns The listed (runId, cellId) pairs.
 * @example
 * const excluded = errataExclusions(errata);
 * excluded.has(run.runId, cell.cellId);
 */
export function errataExclusions(errata: readonly ErratumEntry[] = []): ErrataExclusions {
  const keys = new Set<string>();
  for (const entry of errata) {
    for (const cellId of entry.cellIds) keys.add(`${entry.runId}\u0000${cellId}`);
  }
  return {
    has: (runId, cellId) => keys.has(`${runId}\u0000${cellId}`),
    get size() {
      return keys.size;
    },
  };
}
