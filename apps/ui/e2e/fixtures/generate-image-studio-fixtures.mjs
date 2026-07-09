/**
 * @file generate-image-studio-fixtures.mjs
 * @description Deterministically (re)generates the committed image fixtures that
 * drive `e2e/blocks/image-studio.spec.ts`. Run from `apps/ui`:
 *
 *   node e2e/fixtures/generate-image-studio-fixtures.mjs
 *
 * Both are rendered by a Chromium screenshot of styled HTML (the same
 * dependency-free, byte-stable technique as the photo-search / kb fixtures):
 *
 * - `subject.png` (512×384) — a clean outdoor-style scene with three clearly
 *   separable regions (a light-blue SKY band, a green GROUND band, and a large
 *   dark centered SUBJECT). SegFormer (ADE20K) reliably segments it into
 *   multiple masks, so the highest-scoring mask is PARTIAL — applying it as an
 *   alpha channel yields a meaningfully transparent background with an opaque
 *   subject (the background-removal correctness assertion). A clean subject on a
 *   contrasting ground is exactly the input that makes segmentation separable.
 * - `sr-input.png` (96×64) — a small, high-frequency image (sharp text + thin
 *   stripes + hard color edges). Small so Swin2SR 2x/4x runs fast with an EXACT
 *   dimension check (2x → 192×128, 4x → 384×256); high-frequency so the upscaled
 *   output is a real, content-bearing super-resolution (not a flat no-op copy).
 *
 * The football-scene photo (`public/test-assets/portrait.jpg`, 800×533) is the
 * captioning fixture — referenced in-place by the spec, not copied here.
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(HERE, 'image-studio');

/** A clean, separable scene: sky band, ground band, a big dark centered subject. */
const SUBJECT_HTML = `<!doctype html><html><head><meta charset="utf-8" />
<style>
  html,body{margin:0;padding:0}
  .scene{position:relative;width:512px;height:384px;overflow:hidden}
  .sky{position:absolute;inset:0 0 45% 0;background:linear-gradient(#7fb8ee,#cfe8ff)}
  .ground{position:absolute;inset:55% 0 0 0;background:linear-gradient(#3f8a3f,#2f6b2f)}
  .subject{position:absolute;left:50%;top:24%;transform:translateX(-50%);
    width:150px;height:250px;border-radius:75px 75px 24px 24px;
    background:linear-gradient(#3a2a1a,#1f150c);box-shadow:0 12px 30px rgba(0,0,0,.35)}
  .head{position:absolute;left:50%;top:16%;transform:translateX(-50%);
    width:96px;height:96px;border-radius:50%;background:#4a3826}
</style></head>
<body><div class="scene">
  <div class="sky"></div>
  <div class="ground"></div>
  <div class="head"></div>
  <div class="subject"></div>
</div></body></html>`;

/** A tiny high-frequency image: sharp text + thin stripes + hard color edges. */
const SR_HTML = `<!doctype html><html><head><meta charset="utf-8" />
<style>
  html,body{margin:0;padding:0}
  .tile{width:96px;height:64px;position:relative;
    background:repeating-linear-gradient(90deg,#111 0 4px,#fff 4px 8px)}
  .band{position:absolute;left:0;right:0;top:20px;height:24px;
    background:repeating-linear-gradient(0deg,#c026d3 0 3px,#facc15 3px 6px)}
  .txt{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
    font-family:-apple-system,Segoe UI,sans-serif;font-weight:800;font-size:28px;color:#0ea5e9;
    -webkit-text-stroke:2px #082f49}
</style></head>
<body><div class="tile"><div class="band"></div><div class="txt">SR</div></div></body></html>`;

async function renderPng(browser, html, width, height, outPath) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForTimeout(150);
  await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width, height } });
  await page.close();
}

await mkdir(OUT_DIR, { recursive: true });
const browser = await chromium.launch();
try {
  await renderPng(browser, SUBJECT_HTML, 512, 384, path.join(OUT_DIR, 'subject.png'));
  await renderPng(browser, SR_HTML, 96, 64, path.join(OUT_DIR, 'sr-input.png'));
  console.log('Generated e2e/fixtures/image-studio/: subject.png (512×384), sr-input.png (96×64)');
} finally {
  await browser.close();
}
