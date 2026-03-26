/**
 * @file read-file.ts
 * @description Browser utility for reading a File as a data URL string
 */

/**
 * Read a browser File object as a data URL string.
 *
 * Uses the FileReader API to convert the file contents into a
 * base64-encoded data URL suitable for passing to image/audio
 * processing functions.
 *
 * @param file - The File to read
 * @returns Promise resolving to a data URL string (e.g., `data:image/png;base64,...`)
 * @throws Rejects with the FileReader error if reading fails
 *
 * @example
 * ```ts
 * import { readFileAsDataUrl } from '@localmode/react';
 *
 * const dataUrl = await readFileAsDataUrl(imageFile);
 * await execute(dataUrl); // pass to ML model
 * ```
 */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
