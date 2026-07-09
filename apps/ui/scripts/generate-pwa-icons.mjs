/**
 * @file generate-pwa-icons.mjs
 * @description One-shot generator for the PWA raster icons from the black CloudOff
 * mark (mirrors src/app/icon.svg — a rounded-rect CloudOff design, black
 * instead of blue, cloud a bit larger). The visible icons (192/512/apple) use the
 * rounded mark; the maskable 512 is full-bleed (no transparent margin) so the OS
 * mask never clips into transparency. Also emits public/favicon.ico (16/32/48 PNG
 * frames of the same rounded mark). Re-run: `node scripts/generate-pwa-icons.mjs`.
 */
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// CloudOff glyph (lucide), scaled 12× (~288px) and centered in the 512 canvas.
const GLYPH =
  '<g transform="translate(112,112) scale(12)" stroke="white" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" fill="none">' +
  '<path d="m2 2 20 20"/>' +
  '<path d="M5.782 5.782A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.307-.193"/>' +
  '<path d="M21.532 16.5A4.5 4.5 0 0 0 17.5 10h-1.79A7.008 7.008 0 0 0 10 5.07"/></g>';

// Visible icon: full-bleed rounded square (no margin) + subtle inset border, black.
const ROUNDED =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">' +
  '<rect width="512" height="512" rx="96" fill="#0a0a0a"/>' +
  '<rect x="4" y="4" width="504" height="504" rx="92" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="8"/>' +
  GLYPH +
  '</svg>';

// Maskable: full-bleed black (the OS applies its own mask shape). Same cloud size,
// which stays inside the maskable safe zone.
const MASKABLE =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">' +
  '<rect width="512" height="512" fill="#0a0a0a"/>' +
  GLYPH +
  '</svg>';

const iconsDir = path.join(appDir, 'public/icons');
await mkdir(iconsDir, { recursive: true });

async function png(src, size, outPath) {
  await sharp(Buffer.from(src)).resize(size, size).png().toFile(outPath);
  console.log(`  ${path.relative(appDir, outPath)} (${size}x${size})`);
}

// Multi-resolution .ico assembled from PNG frames (PNG-in-ICO is supported by
// every modern browser). sharp renders the frames; we write the ICO container.
async function ico(src, sizes, outPath) {
  const frames = [];
  for (const s of sizes) frames.push({ size: s, buf: await sharp(Buffer.from(src)).resize(s, s).png().toBuffer() });
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(frames.length, 4);
  const entries = Buffer.alloc(16 * frames.length);
  let offset = 6 + 16 * frames.length;
  frames.forEach((f, i) => {
    const e = entries.subarray(i * 16, i * 16 + 16);
    e.writeUInt8(f.size >= 256 ? 0 : f.size, 0); // width (0 = 256)
    e.writeUInt8(f.size >= 256 ? 0 : f.size, 1); // height
    e.writeUInt16LE(1, 4); // color planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(f.buf.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += f.buf.length;
  });
  await writeFile(outPath, Buffer.concat([header, entries, ...frames.map((f) => f.buf)]));
  console.log(`  ${path.relative(appDir, outPath)} (${sizes.join('/')} PNG frames)`);
}

console.log('[pwa-icons] generating…');
await png(ROUNDED, 192, path.join(iconsDir, 'icon-192x192.png'));
await png(ROUNDED, 512, path.join(iconsDir, 'icon-512x512.png'));
await png(MASKABLE, 512, path.join(iconsDir, 'icon-512x512-maskable.png'));
await png(ROUNDED, 180, path.join(appDir, 'src/app/apple-icon.png'));
await ico(ROUNDED, [16, 32, 48], path.join(appDir, 'public/favicon.ico'));
console.log('[pwa-icons] done');
