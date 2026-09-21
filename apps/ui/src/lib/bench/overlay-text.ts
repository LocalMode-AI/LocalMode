/**
 * Plain-language text for the run overlay. The overlay is read by study
 * participants; the raw error, its cause, and its stack stay on the cell's
 * `attempts` in the run record.
 */

/** A short reason for a retry: what went wrong, without stack fragments or driver paths. */
export function describeRetryCause(error: { name: string; message: string; cause?: string }): string {
  const firstLine = (error.message || error.name)
    .split('\n')[0]
    .replace(/\s+at\s+\S+\s*\(.*$/, '')
    .trim();
  if (error.name === 'TimeoutError') return firstLine.startsWith('load') ? 'the model load stalled' : 'the step stalled';
  if (/DEVICE_REMOVED|device lost|device was lost/i.test(firstLine)) return 'the GPU device was lost';
  if (/bad_alloc|allocation failed|out of memory|insufficient memory/i.test(`${firstLine} ${error.cause ?? ''}`)) {
    return 'the browser ran out of memory';
  }
  if (/Failed to fetch|Cannot fetch|network/i.test(firstLine)) return 'a download failed';
  const short = firstLine.length > 90 ? `${firstLine.slice(0, 87)}…` : firstLine;
  return `${error.name}: ${short}`;
}
