/**
 * A minimal ZIP writer for "Download all" on /bench/run: entries are stored
 * without compression, so every file inside the archive is byte for byte the
 * file a single download saves. One archive is one download, which Chrome
 * allows from a click even where it blocks a page's repeated downloads.
 * Everything in this module is pure.
 */

/** One file to put in the archive. */
export interface ZipEntry {
  /** File name inside the archive (ASCII or UTF-8; no directories needed). */
  name: string;
  data: Uint8Array;
  /** Modification time recorded for the entry. */
  modified: Date;
}

let crcTable: Uint32Array | null = null;

/** CRC-32 (IEEE 802.3, as ZIP uses it) of `data`. */
export function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** MS-DOS date and time fields (local time, two-second resolution; years before 1980 read as 1980). */
function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/**
 * Build a ZIP archive whose entries are stored uncompressed.
 *
 * @param entries - The files, in archive order. Names must be unique.
 * @returns The archive bytes.
 * @throws {Error} When a name repeats or the archive would need ZIP64 (over 4 GB or 65,535 entries).
 * @example
 * const zip = createStoredZip([{ name: 'a.json', data: new TextEncoder().encode('{}'), modified: new Date() }]);
 */
export function createStoredZip(entries: ZipEntry[]): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const seen = new Set<string>();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  if (entries.length > 0xffff) throw new Error('Too many files for one archive.');
  for (const entry of entries) {
    if (seen.has(entry.name)) throw new Error(`Duplicate file name in archive: ${entry.name}`);
    seen.add(entry.name);
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;
    const { time, date } = dosDateTime(entry.modified);
    // Bit 11: the name is UTF-8.
    const flags = 0x0800;

    const local = new Uint8Array(30 + name.length + size);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, flags, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);
    local.set(entry.data, 30 + name.length);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, flags, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, name.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);

    locals.push(local);
    centrals.push(central);
    offset += local.length;
    if (offset > 0xffffffff) throw new Error('The archive is too large (over 4 GB).');
  }
  const centralSize = centrals.reduce((acc, c) => acc + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + centralSize + end.length);
  let at = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
