/**
 * Regenerate src/lib/bench/task-item-lists.ts from a directory of sample
 * lists (JSON lines with `id`, `source`, `source_sha256`, optional
 * `text_sha256`, translation `source_lang_bcp47` / `target_lang_bcp47`) and
 * its `SHA256SUMS`. Every list file must hash to its `SHA256SUMS` line and
 * every row's text to its own digest; then each list is pinned by file name,
 * file SHA-256, item count and item digest (SHA-256 over `<id>\t<text sha256>\n`).
 * The five-item lists of the e2e spec are kept as they are.
 *
 * Usage: pnpm exec tsx scripts/pin-task-item-lists.ts <samples-dir>
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const sha = (b: string | Buffer) => createHash('sha256').update(b).digest('hex');

/** Which task, set and subset each sample file is. */
export const SAMPLE_FILES: Record<string, { task: string; set: string; subset: string }> = {
  'summarization_cnndm.jsonl': { task: 'summarize', set: 'cnndm-test', subset: 'full' },
  'summarization_cnndm_reserve.jsonl': { task: 'summarize', set: 'cnndm-reserve', subset: 'full' },
  'summarization_xsum.jsonl': { task: 'summarize', set: 'xsum-test', subset: 'full' },
  'subset_crossdevice_summarization.jsonl': { task: 'summarize', set: 'cnndm-test', subset: 'S' },
  'subset_repeats_summarization.jsonl': { task: 'summarize', set: 'cnndm-test', subset: 'R' },
  'subset_latency_summarization.jsonl': { task: 'summarize', set: 'cnndm-test', subset: 'L' },
  'pilot_summarization.jsonl': { task: 'summarize', set: 'cnndm-test', subset: 'pilot' },
  'translation_flores.jsonl': { task: 'translate', set: 'flores-devtest', subset: 'full' },
  'subset_crossdevice_translation.jsonl': { task: 'translate', set: 'flores-devtest', subset: 'S' },
  'subset_repeats_translation.jsonl': { task: 'translate', set: 'flores-devtest', subset: 'R' },
  'subset_latency_translation.jsonl': { task: 'translate', set: 'flores-devtest', subset: 'L' },
  'pilot_translation.jsonl': { task: 'translate', set: 'flores-devtest', subset: 'pilot' },
  'lid_flores.jsonl': { task: 'detect-language', set: 'flores-devtest', subset: 'full' },
  'lid_wili.jsonl': { task: 'detect-language', set: 'wili-test', subset: 'full' },
  'subset_crossdevice_lid.jsonl': { task: 'detect-language', set: 'flores-devtest', subset: 'S' },
  'subset_repeats_lid.jsonl': { task: 'detect-language', set: 'flores-devtest', subset: 'R' },
  'subset_latency_lid.jsonl': { task: 'detect-language', set: 'flores-devtest', subset: 'L' },
  'pilot_lid.jsonl': { task: 'detect-language', set: 'flores-devtest', subset: 'pilot' },
};

/** The page list id of a sample list: `<task>-<set>-<subset>`. */
export function sampleListId(spec: { task: string; set: string; subset: string }): string {
  return `${spec.task}-${spec.set}-${spec.subset}`;
}

function main(dir: string): void {
  const sums = new Map(
    readFileSync(path.join(dir, 'SHA256SUMS'), 'utf8')
      .trim()
      .split('\n')
      .map((l) => {
        const [hash, name] = l.trim().split(/\s+/);
        return [name, hash] as const;
      }),
  );
  const entries: string[] = [];
  for (const [file, spec] of Object.entries(SAMPLE_FILES)) {
    const bytes = readFileSync(path.join(dir, file));
    const fileSha = sha(bytes);
    if (sums.get(file) !== fileSha) throw new Error(`${file}: SHA-256 ${fileSha} is not the SHA256SUMS value ${sums.get(file)}`);
    const rows = bytes.toString('utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as Record<string, string>);
    const lines: string[] = [];
    for (const row of rows) {
      const expected = row.text_sha256 ?? row.source_sha256;
      const text = row.source;
      if (sha(text) !== expected) throw new Error(`${file} ${row.id}: text does not match its digest`);
      lines.push(`${row.id}\t${expected}\n`);
    }
    entries.push(
      `  { id: '${sampleListId(spec)}', task: '${spec.task}', set: '${spec.set}', subset: '${spec.subset}', count: ${rows.length}, sha256: '${sha(lines.join(''))}', file: '${file}', fileSha256: '${fileSha}' },`,
    );
  }
  const target = path.resolve(__dirname, '..', 'src', 'lib', 'bench', 'task-item-lists.ts');
  const source = readFileSync(target, 'utf8');
  const start = source.indexOf('  // BEGIN sample lists');
  const end = source.indexOf('  // END sample lists');
  if (start < 0 || end < 0) throw new Error('task-item-lists.ts has no sample-list markers');
  writeFileSync(target, `${source.slice(0, start)}  // BEGIN sample lists (scripts/pin-task-item-lists.ts)\n${entries.join('\n')}\n${source.slice(end)}`);
  console.log(`pinned ${entries.length} lists`);
}

if (process.argv[1]?.endsWith('pin-task-item-lists.ts')) main(process.argv[2] ?? '');
