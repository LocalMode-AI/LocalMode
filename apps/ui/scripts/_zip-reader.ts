/**
 * @file _zip-reader.ts
 * @description An independent reader for the stored (uncompressed) ZIP
 * archives "Download all" saves, used by the unit tests to check the archive
 * writer from the outside: it walks the central directory, checks every
 * local header against it, and verifies each entry's CRC-32 with Node's own
 * `zlib.crc32` (not the writer's table). The leading underscore keeps Vitest
 * from globbing it as a suite.
 */
import { crc32 } from 'node:zlib';

export interface ReadZipEntry {
  name: string;
  data: Buffer;
}

export function readStoredZip(bytes: Uint8Array): ReadZipEntry[] {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('no end-of-central-directory record');
  const count = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (cdOffset + cdSize !== eocd) throw new Error('central directory does not end at the end record');
  const out: ReadZipEntry[] = [];
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error(`bad central header ${i}`);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const compSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    if (method !== 0 || compSize !== size) throw new Error(`${name}: not stored`);
    if (buf.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`${name}: bad local header`);
    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    if (buf.subarray(localOffset + 30, localOffset + 30 + localNameLen).toString('utf8') !== name) {
      throw new Error(`${name}: local name differs`);
    }
    if (buf.readUInt32LE(localOffset + 14) !== crc) throw new Error(`${name}: local CRC differs`);
    const start = localOffset + 30 + localNameLen + localExtraLen;
    const data = Buffer.from(buf.subarray(start, start + size));
    if (crc32(data) !== crc) throw new Error(`${name}: CRC mismatch`);
    out.push({ name, data });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}
