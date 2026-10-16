/**
 * Hand a file to the browser's download manager through a temporary object
 * URL. The browser may still refuse it (Chrome blocks a site's repeated
 * automatic downloads unless the user allows them); the page cannot detect
 * that, which is why finished runs are also kept under Saved exports.
 */

/**
 * Trigger a download of `blob` as `filename`.
 *
 * @param blob - The file contents.
 * @param filename - The suggested file name.
 */
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  // Revoke later: a page that reloads right after (a series) must not cut the save short.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Trigger a download of a JSON text file. */
export function triggerTextDownload(text: string, filename: string): void {
  triggerDownload(new Blob([text], { type: 'application/json' }), filename);
}
