/**
 * @file generate-photo-search-fixtures.mjs
 * @description Deterministically (re)generates the committed image fixtures that
 * drive `e2e/blocks/photo-search.spec.ts`. Run from `apps/ui`:
 *
 *   node e2e/fixtures/generate-photo-search-fixtures.mjs
 *
 * The set is designed so a REAL CLIP model produces stable, separable rankings:
 *
 * - `football.jpg` + `football-copy.jpg` — a real football-match photograph
 *   (the same content as `public/test-assets/portrait.jpg`) and a BYTE-IDENTICAL
 *   copy of it. The copy embeds to the same vector, so cosine similarity is
 *   ~1.0: the KNOWN duplicate pair the Duplicates lane asserts at threshold.
 *   The real photo is also the strongest text→image signal — the text lane
 *   queries for it.
 * - `apple.png` / `car.png` / `tree.png` / `dog.png` — four visually distinct
 *   scenes (big color emoji + caption + a distinct background), rendered by a
 *   Chromium screenshot of styled HTML (no extra deps, byte-stable). They are
 *   the DISTINCT photos: unique in the Duplicates lane, and each carries a
 *   plausible zero-shot category under the photo label set (apple→food,
 *   car→vehicles, tree→nature, dog→animals). `dog.png` backs the "dog → animals"
 *   categorization example.
 *
 * The spec locks its assertions to what a real CLIP run actually produces
 * against these fixtures (probe-then-pin) — see the spec header for the record.
 */
import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(HERE, 'photo-search');
const PORTRAIT = path.resolve(HERE, '..', '..', 'public', 'test-assets', 'portrait.jpg');

/** A distinct emoji "photo": big centered glyph + caption on a solid background. */
function sceneHtml(emoji, caption, background, captionColor) {
  return `<!doctype html><html><head><meta charset="utf-8" />
<style>
  html,body{margin:0;padding:0}
  .scene{width:400px;height:400px;display:flex;flex-direction:column;align-items:center;
    justify-content:center;gap:16px;background:${background};font-family:-apple-system,Segoe UI,sans-serif}
  .glyph{font-size:220px;line-height:1}
  .caption{font-size:34px;font-weight:700;color:${captionColor};letter-spacing:0.5px}
</style></head>
<body><div class="scene"><div class="glyph">${emoji}</div><div class="caption">${caption}</div></div></body></html>`;
}

const SCENES = [
  { file: 'apple.png', emoji: '🍎', caption: 'a red apple', bg: '#fff4e6', fg: '#b91c1c' },
  { file: 'car.png', emoji: '🚗', caption: 'a blue car', bg: '#e0f2fe', fg: '#1d4ed8' },
  { file: 'tree.png', emoji: '🌳', caption: 'a green tree', bg: '#e7f7e2', fg: '#15803d' },
  { file: 'dog.png', emoji: '🐕', caption: 'a dog', bg: '#f3ead9', fg: '#92400e' },
];

async function renderPng(browser, html, outPath) {
  const page = await browser.newPage({ viewport: { width: 400, height: 400 }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  // Give color-emoji fonts a moment to load before the screenshot.
  await page.waitForTimeout(200);
  await page.screenshot({ path: outPath });
  await page.close();
}

await mkdir(OUT_DIR, { recursive: true });
const browser = await chromium.launch();
try {
  // Real photo + its exact duplicate (byte-identical → cosine ~1.0).
  await copyFile(PORTRAIT, path.join(OUT_DIR, 'football.jpg'));
  await copyFile(PORTRAIT, path.join(OUT_DIR, 'football-copy.jpg'));

  for (const scene of SCENES) {
    await renderPng(browser, sceneHtml(scene.emoji, scene.caption, scene.bg, scene.fg), path.join(OUT_DIR, scene.file));
  }
  console.log(
    'Generated e2e/fixtures/photo-search/: football.jpg, football-copy.jpg, apple.png, car.png, tree.png, dog.png',
  );
} finally {
  await browser.close();
}
