/**
 * Five-item pilot lists for tasks.spec.ts, cut from the locally held sample
 * files (`TASK_SAMPLES_DIR`, default the sibling data checkout) into served
 * JSON lines (`TASK_SAMPLES_DIR`). The item texts never enter the repository: the spec writes
 * them to a temporary directory served on 127.0.0.1 only. The page accepts a
 * list only if its digest equals the pin in src/lib/bench/task-item-lists.ts.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Where the sample files live (JSON lines with `id`, `source`, ...); required. */
export const TASK_SAMPLES_DIR = process.env.TASK_SAMPLES_DIR ?? '';

interface SampleRow {
  id: string;
  source: string;
  source_lang_bcp47?: string;
  target_lang_bcp47?: string;
  direction?: string;
}

export interface ServedItem {
  id: string;
  text: string;
  sha256: string;
  src?: string;
  tgt?: string;
}

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

function readRows(file: string): SampleRow[] {
  if (!TASK_SAMPLES_DIR) throw new Error('set TASK_SAMPLES_DIR to the directory holding the sample files');
  const full = path.join(TASK_SAMPLES_DIR, file);
  if (!existsSync(full)) throw new Error(`sample file ${full} is missing; set TASK_SAMPLES_DIR to the sample checkout`);
  return readFileSync(full, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as SampleRow);
}

function toItem(row: SampleRow, translate = false): ServedItem {
  return {
    id: row.id,
    text: row.source,
    sha256: sha256(row.source),
    ...(translate ? { src: row.source_lang_bcp47!, tgt: row.target_lang_bcp47! } : {}),
  };
}

/** The pilot lists, by list id. Translation uses en-de and de-en (the language pack the test profile holds). */
export function pilotLists(): Record<string, ServedItem[]> {
  const summarize = readRows('subset_latency_summarization.jsonl').slice(0, 5).map((r) => toItem(r));
  const flores = readRows('subset_latency_translation.jsonl');
  const enDe = flores.filter((r) => r.direction === 'en-de').slice(0, 3);
  const deEn = flores.filter((r) => r.direction === 'de-en').slice(0, 2);
  const translate = [...enDe, ...deEn].map((r) => toItem(r, true));
  const detect = readRows('subset_latency_lid.jsonl').slice(0, 5).map((r) => toItem(r));
  return {
    'pilot-e2e-summarize-cnndm-5': summarize,
    'pilot-e2e-translate-flores-5': translate,
    'pilot-e2e-detect-flores-5': detect,
    'pilot-e2e-summarize-cnndm-1': summarize.slice(0, 1),
    'pilot-e2e-translate-flores-1': translate.slice(0, 1),
  };
}

/** A whole sample list as the page fetches it (the summarize S list for the pilot-sizing lane). */
export function sampleLists(): Record<string, ServedItem[]> {
  return { 'summarize-cnndm-test-S': readRows('subset_crossdevice_summarization.jsonl').map((r) => toItem(r)) };
}

/** The list digest: SHA-256 over `<id>\t<sha256>\n` per item. */
export function listDigest(items: readonly ServedItem[]): string {
  return sha256(items.map((i) => `${i.id}\t${i.sha256}\n`).join(''));
}

/** JSON lines body of a list. */
export function listBody(items: readonly ServedItem[]): string {
  return items.map((i) => JSON.stringify(i)).join('\n') + '\n';
}

if (process.argv[1] && process.argv[1].endsWith('task-items.ts')) {
  for (const [id, items] of Object.entries(pilotLists())) console.log(id, items.length, listDigest(items));
}
