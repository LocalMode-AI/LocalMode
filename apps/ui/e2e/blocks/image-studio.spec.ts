/**
 * @file image-studio.spec.ts
 * @description E2E for the three split image blocks under the image-studio
 * category (split-image-privacy Wave 2), driving each block's canonical route
 * (`/blocks/image-studio/<block>`) via accessibility selectors
 * (`getByRole`/`getByLabel`/`getByText`) ONLY — no `data-testid` — against a
 * production build in real Chromium. Every model boundary is REAL — no mocks:
 *
 *   - background-remover: real SegFormer (Xenova/segformer-b0-finetuned-ade-512-
 *     512, ~15MB) segmentation → best-mask alpha compositing. The produced PNG is
 *     decoded at the BYTE level (a from-scratch zlib-inflate + defilter RGBA
 *     decoder here) to assert IHDR color type 6 AND a real alpha variance —
 *     a meaningfully transparent background with an opaque subject.
 *   - image-enhancer: real Swin2SR super-resolution — 2x (Xenova/swin2SR-
 *     lightweight-x2-64, ~50MB), 4x (Xenova/swin2SR-classical-sr-x4-64), and
 *     Restore (Xenova/swin2SR-realworld-sr-x4-64-bsrgan-psnr). Asserts EXACT
 *     output dimensions (2×/4× the input) in the DOM AND the downloaded PNG.
 *   - image-captioner: real ViT-GPT2 (Xenova/vit-gpt2-image-captioning, ~230MB) —
 *     asserts the caption for the known football-scene fixture contains an
 *     expected subject term, plus clipboard copy / add-another / remove / clear.
 *
 * Shared page (describe.serial): each lane navigates to its block's route in one
 * browser context so the transformers model cache is reused; a single test would
 * blow the per-test ceiling. Console-error policy: hard fail on any console error
 * outside the documented allowlist. Selectors are role/label/text only.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import {
  expect,
  test,
  type BrowserContext,
  type ConsoleMessage,
  type Page,
  type Request,
} from '@playwright/test';

/* ────────────────────────────── fixtures ────────────────────────────── */

const FIXTURES_DIR = path.resolve(__dirname, '..', 'fixtures', 'image-studio');
/** Clean-subject scene for segmentation (sky / ground / subject → partial mask). */
const SUBJECT_IMG = path.join(FIXTURES_DIR, 'subject.png');
/** Small high-frequency image for super-resolution (exact 2×/4× dimension check). */
const SR_IMG = path.join(FIXTURES_DIR, 'sr-input.png');
/** Football-match photo (COCO person/ball content) for captioning. */
const CAPTION_IMG = path.resolve(__dirname, '..', '..', 'public', 'test-assets', 'portrait.jpg');

const SR_INPUT_W = 96;
const SR_INPUT_H = 64;

for (const [label, p] of [
  ['subject.png', SUBJECT_IMG],
  ['sr-input.png', SR_IMG],
  ['portrait.jpg', CAPTION_IMG],
] as const) {
  if (!existsSync(p)) {
    throw new Error(
      `Missing image-studio fixture ${label}: ${p}. Regenerate the generated ones with ` +
        `node e2e/fixtures/generate-image-studio-fixtures.mjs (see e2e/fixtures/README.md).`,
    );
  }
}

/* ────────────────────────────── routes ────────────────────────────── */

const CATEGORY_ROUTE = '/blocks/image-studio';
const ROUTE = {
  'background-remover': '/blocks/image-studio/background-remover',
  'image-enhancer': '/blocks/image-studio/image-enhancer',
  'image-captioner': '/blocks/image-studio/image-captioner',
} as const;

/* ────────────────────────────── timeouts ────────────────────────────── */

const SEG_TIMEOUT_MS = 10 * 60 * 1000; // cold SegFormer (~15MB) + segmentation
const SR_TIMEOUT_MS = 10 * 60 * 1000; // cold Swin2SR (~45–50MB) + super-resolution
const CAPTION_TIMEOUT_MS = 12 * 60 * 1000; // cold ViT-GPT2 (~230MB) + captioning

/* ─────────────────────── console capture + allowlist ─────────────────────── */

interface CapturedError {
  text: string;
  url: string;
}

/**
 * Documented console-error allowlist. Default policy is EMPTY; each entry is
 * narrow (matched on the failing resource URL) with a justification.
 */
const CONSOLE_ERROR_ALLOWLIST: ReadonlyArray<{
  reason: string;
  matches: (e: CapturedError) => boolean;
}> = [
  {
    // WHY HARMLESS: Transformers.js probes HuggingFace for OPTIONAL model
    // sidecar files (config/preprocessor variants) when loading the SegFormer,
    // Swin2SR, and ViT-GPT2 models; HF answers 404 and the library falls back
    // cleanly (real segmentation/SR/captioning succeed — the correctness
    // assertions prove it). Chrome still logs the 404 as a console error.
    // SCOPE: only resource errors whose URL is a HuggingFace host + a .json/.txt
    // sidecar. WHO/WHEN: root-caused during blocks-image-studio task 5.2, same
    // mechanism documented in vision-lab.spec.ts + photo-search.spec.ts.
    reason: 'benign HF 404: optional model sidecar-file probe (library falls back)',
    matches: (e) =>
      /huggingface\.co|hf\.co/i.test(e.url) && /\.(json|txt)(\?|$)/i.test(e.url),
  },
];

const MODEL_REQUEST_PATTERNS = [
  /huggingface\.co/i,
  /hf\.co/i,
  /cdn-lfs/i,
  /\.onnx(\?|$)/i,
  /\.wasm(\?|$)/i,
];

/* ────────────────────────── PNG byte-level decoder ────────────────────────── */

interface PngInfo {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  /** Defiltered RGBA bytes (only when colorType 6 + 8-bit); else null. */
  data: Buffer | null;
}

function paeth(a: number, b: number, c: number) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/** Decode a PNG buffer to its IHDR + (for 8-bit RGBA) defiltered RGBA pixels. */
function decodePng(buf: Buffer): PngInfo {
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) {
    throw new Error('not a PNG (bad signature)');
  }
  let pos = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat: Buffer[] = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(data));
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + len; // length(4) + type(4) + data(len) + crc(4)
  }

  if (colorType !== 6 || bitDepth !== 8) {
    return { width, height, bitDepth, colorType, data: null };
  }

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  let rp = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[rp++];
    for (let x = 0; x < stride; x++) {
      const rawByte = raw[rp++];
      const left = x >= bpp ? out[y * stride + x - bpp] : 0;
      const up = y > 0 ? out[(y - 1) * stride + x] : 0;
      const upLeft = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0;
      let val: number;
      switch (filter) {
        case 0:
          val = rawByte;
          break;
        case 1:
          val = rawByte + left;
          break;
        case 2:
          val = rawByte + up;
          break;
        case 3:
          val = rawByte + ((left + up) >> 1);
          break;
        case 4:
          val = rawByte + paeth(left, up, upLeft);
          break;
        default:
          throw new Error(`unsupported PNG filter ${filter}`);
      }
      out[y * stride + x] = val & 0xff;
    }
  }
  return { width, height, bitDepth, colorType, data: out };
}

/** Compute alpha statistics over a decoded RGBA buffer. */
function alphaStats(png: PngInfo) {
  if (!png.data) throw new Error(`cannot read alpha: colorType ${png.colorType}, bitDepth ${png.bitDepth}`);
  const total = png.width * png.height;
  let transparent = 0;
  let opaque = 0;
  for (let i = 0; i < total; i++) {
    const a = png.data[i * 4 + 3];
    if (a === 0) transparent++;
    else if (a === 255) opaque++;
  }
  return {
    total,
    transparent,
    opaque,
    transparentFraction: transparent / total,
    opaqueFraction: opaque / total,
  };
}

/* ─────────────────────────── shared page + capture ─────────────────────────── */

let context: BrowserContext;
let page: Page;
let allMessages: string[];
let consoleErrors: CapturedError[];
const modelRequests: string[] = [];

test.describe.configure({ mode: 'serial' });
// Locator actions must never hang unbounded (config sets no global actionTimeout);
// long waits are expressed as explicit expect() timeouts instead.
test.use({ actionTimeout: 60_000 });

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  page = await context.newPage();
  allMessages = [];
  consoleErrors = [];
  page.on('console', (msg: ConsoleMessage) => {
    const { url } = msg.location();
    allMessages.push(`[${msg.type()}] ${msg.text()}${url ? ` (${url})` : ''}`);
    if (msg.type() === 'error') consoleErrors.push({ text: msg.text(), url });
  });
  page.on('pageerror', (err) => {
    allMessages.push(`[pageerror] ${err.message}`);
    consoleErrors.push({ text: `[pageerror] ${err.message}`, url: '' });
  });
  page.on('request', (req: Request) => {
    const url = req.url();
    if (MODEL_REQUEST_PATTERNS.some((p) => p.test(url))) modelRequests.push(url);
  });
});

test.afterAll(async () => {
  await context?.close();
});

test.afterEach(async ({}, testInfo) => {
  await testInfo.attach('console-log', {
    body: allMessages.join('\n') || '(none)',
    contentType: 'text/plain',
  });
  const allowlisted = consoleErrors.filter((e) => CONSOLE_ERROR_ALLOWLIST.some((a) => a.matches(e)));
  const failing = consoleErrors.filter((e) => !allowlisted.includes(e));
  if (failing.length > 0 || allowlisted.length > 0) {
    await testInfo.attach('console-errors', {
      body: [
        ...allowlisted.map((e) => `ALLOWLISTED ${e.text} (${e.url})`),
        ...failing.map((e) => `FAILING ${e.text} (${e.url})`),
      ].join('\n'),
      contentType: 'text/plain',
    });
  }
  expect(failing.map((e) => `${e.text} (${e.url})`), 'no non-allowlisted console errors').toEqual([]);
});

/* ────────────────────────────── helpers ────────────────────────────── */

/** Navigate to a block's canonical route and confirm its live block mounted. */
async function gotoBlock(slug: keyof typeof ROUTE) {
  await page.goto(ROUTE[slug]);
  await expect(page.locator('[data-block-preview]').first()).toBeVisible();
}

/**
 * Drop a file onto the block's dropzone. The MediaDropzone hidden `<input
 * type=file>` is `aria-hidden` by design, so it has no accessible name — it is
 * targeted by its semantic tag (never a testid). Exactly one dropzone/input is
 * mounted per block state, so `.first()` is unambiguous.
 */
async function dropInto(file: string) {
  await page.locator('input[type="file"]').first().setInputFiles(file);
}

/* ────────────────────────────── lanes ────────────────────────────── */

test('category page and each block page load fetch zero model bytes', async () => {
  // The category page mounts all three blocks (each gates its own load); every
  // canonical block page mounts one. None may fetch a model byte on load.
  for (const route of [CATEGORY_ROUTE, ...Object.values(ROUTE)]) {
    await page.goto(route);
    await expect(page.locator('[data-block-preview]').first()).toBeVisible();
    await page.waitForLoadState('networkidle');
  }
  expect(modelRequests, 'no model bytes on any page load').toEqual([]);
  await page.goto(CATEGORY_ROUTE);
  await page.screenshot({ path: 'e2e-artifacts/screenshots/image-studio-category.png', fullPage: true });
});

test('background-remover: cancel mid-run, then real SegFormer removal → transparent PNG (byte-level alpha)', async () => {
  test.setTimeout(SEG_TIMEOUT_MS + 2 * 60 * 1000);
  await gotoBlock('background-remover');
  // Scope block-content text to the live preview — the hidden Code tab renders
  // the block source (same status strings) into the DOM.
  const block = page.locator('[data-block-preview]');
  const dropzone = page.getByRole('button', { name: /Drop an image to remove its background/i });
  await expect(dropzone).toBeVisible();
  const result = page.getByRole('group', { name: 'Background removal result' });
  const doneStatus = block.getByText('Background removed — transparent PNG ready');

  // Cancel lane: cold first run shows the processing overlay (download window);
  // cancelling returns the block to a usable idle state with no result. The
  // Cancel button only renders while segmentation is in flight.
  await dropInto(SUBJECT_IMG);
  const cancelBtn = page.getByRole('button', { name: 'Cancel' });
  await expect(cancelBtn).toBeVisible({ timeout: 60_000 });
  await cancelBtn.click();
  await expect(doneStatus).toHaveCount(0, { timeout: 30_000 });
  await expect(result).toHaveCount(0);
  // Reset back to the dropzone for the success run.
  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(dropzone).toBeVisible();

  // Success lane: real segmentation → best-mask alpha compositing.
  await dropInto(SUBJECT_IMG);
  await expect(doneStatus).toBeVisible({ timeout: SEG_TIMEOUT_MS });
  await expect(result).toBeVisible();
  // IMG-1: SegFormer masks carry no per-mask confidence (score 0), so the block
  // no longer renders a meaningless "0%" confidence badge — assert its absence.
  await expect(block.getByText('Best mask confidence')).toHaveCount(0);
  await page.screenshot({ path: 'e2e-artifacts/screenshots/image-studio-remove-bg.png', fullPage: true });

  // Download the transparent PNG → decode its bytes → assert real alpha channel.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download PNG' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^background-removed-\d+\.png$/);
  const filePath = await download.path();
  const bytes = readFileSync(filePath);
  const png = decodePng(bytes);
  await test.info().attach('remove-bg-png', {
    body: JSON.stringify({ ...png, data: png.data ? `<${png.data.length} bytes>` : null }, null, 2),
    contentType: 'application/json',
  });
  expect(png.colorType, 'downloaded PNG must be RGBA (IHDR color type 6)').toBe(6);
  const stats = alphaStats(png);
  await test.info().attach('remove-bg-alpha-stats', {
    body: JSON.stringify(stats, null, 2),
    contentType: 'application/json',
  });
  // Real background removal: a meaningful transparent-background fraction AND an
  // opaque subject — coarse invariants (design D6), not an exact mask.
  expect(stats.transparentFraction, 'background actually removed (transparent pixels)').toBeGreaterThan(0.03);
  expect(stats.transparentFraction, 'not the whole image transparented').toBeLessThan(0.97);
  expect(stats.opaqueFraction, 'subject stays opaque').toBeGreaterThan(0.03);
});

test('image-enhancer: real Swin2SR 2x round-trip + exact dimensions + download, 4x, Restore, toggle, invalid-file', async () => {
  test.setTimeout(3 * SR_TIMEOUT_MS);
  await gotoBlock('image-enhancer');
  const block = page.locator('[data-block-preview]');
  // Active mode = the aria-pressed toggle in the "Enhancement mode" group.
  await expect(page.getByRole('button', { name: '2x Upscale' })).toHaveAttribute('aria-pressed', 'true');
  const result = page.getByRole('group', { name: 'Enhanced result' });

  // ── 2x (default) ──────────────────────────────────────────────────────────
  await dropInto(SR_IMG);
  // The result group renders only once super-resolution completes.
  await expect(result).toBeVisible({ timeout: SR_TIMEOUT_MS });
  await expect(result).toHaveAttribute('data-scale', '2');
  await expect(result).toHaveAttribute('data-width', String(SR_INPUT_W * 2));
  await expect(result).toHaveAttribute('data-height', String(SR_INPUT_H * 2));
  // User-visible output dimensions in the info panel.
  await expect(block.getByText(`${SR_INPUT_W * 2}×${SR_INPUT_H * 2}`)).toBeVisible();
  await expect(block.getByText('Enhanced 2x').first()).toBeVisible();
  await page.screenshot({ path: 'e2e-artifacts/screenshots/image-studio-enhance-2x.png', fullPage: true });

  // Download → decode IHDR → exact 2× dimensions in the saved file.
  const [dl2x] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download Enhanced PNG' }).click(),
  ]);
  expect(dl2x.suggestedFilename()).toMatch(/^enhanced-2x-\d+\.png$/);
  const png2x = decodePng(readFileSync(await dl2x.path()));
  expect(png2x.width, 'downloaded 2x PNG width').toBe(SR_INPUT_W * 2);
  expect(png2x.height, 'downloaded 2x PNG height').toBe(SR_INPUT_H * 2);

  // Toggle Original/Enhanced must not re-run inference (no new model request).
  const before = modelRequests.length;
  await result.getByRole('tab', { name: 'Original' }).click();
  await result.getByRole('tab', { name: 'Enhanced' }).click();
  await expect(result).toHaveAttribute('data-scale', '2');
  expect(modelRequests.length, 'toggle triggers no inference').toBe(before);

  // ── 4x ────────────────────────────────────────────────────────────────────
  await page.getByRole('button', { name: '4x Upscale' }).click();
  await expect(page.getByRole('button', { name: '4x Upscale' })).toHaveAttribute('aria-pressed', 'true');
  await expect(result).toHaveAttribute('data-scale', '4', { timeout: SR_TIMEOUT_MS });
  await expect(result).toHaveAttribute('data-width', String(SR_INPUT_W * 4));
  await expect(result).toHaveAttribute('data-height', String(SR_INPUT_H * 4));
  await page.screenshot({ path: 'e2e-artifacts/screenshots/image-studio-enhance-4x.png', fullPage: true });

  // ── Restore (gated: design D3 verified this variant in real Chrome) ─────────
  await page.getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByRole('button', { name: 'Restore' })).toHaveAttribute('aria-pressed', 'true');
  // Restore is also 4×; wait for the fresh run to settle on the restore result.
  await expect(block.getByText('Swin2SR Restore')).toBeVisible({ timeout: SR_TIMEOUT_MS });
  await expect(result).toHaveAttribute('data-scale', '4');
  await expect(result).toHaveAttribute('data-width', String(SR_INPUT_W * 4));
  await expect(result).toHaveAttribute('data-height', String(SR_INPUT_H * 4));

  // Invalid file rejected before inference — reset to the dropzone, drop a .txt.
  await page.getByRole('button', { name: 'Upload new' }).click();
  const enhanceDropzone = page.getByRole('button', { name: /Drop an image to enhance/i });
  await expect(enhanceDropzone).toBeVisible();
  const requestsBefore = modelRequests.length;
  const badFile = path.join(os.tmpdir(), 'image-studio-bad-enhance.txt');
  writeFileSync(badFile, 'not an image');
  await dropInto(badFile);
  await expect(block.getByRole('alert')).toBeVisible();
  expect(modelRequests.length, 'invalid enhance upload makes no model request').toBe(requestsBefore);
});

test('image-captioner: subject-term caption + copy + add-another + remove-single + clear-all + reject unsupported', async () => {
  test.setTimeout(CAPTION_TIMEOUT_MS + 2 * 60 * 1000);
  await gotoBlock('image-captioner');
  const block = page.locator('[data-block-preview]');
  const captions = page.getByRole('list', { name: 'Captions' });
  const cards = captions.getByRole('listitem');

  // Caption a known football-scene photo (real ViT-GPT2).
  await dropInto(CAPTION_IMG);
  await expect(cards).toHaveCount(1, { timeout: CAPTION_TIMEOUT_MS });
  await expect(block.getByText('1 image captioned')).toBeVisible();
  const caption = (await cards.first().innerText()).toLowerCase();
  await test.info().attach('caption-text', { body: caption, contentType: 'text/plain' });
  // ViT-GPT2 on the football scene → a person/sport subject term.
  const SUBJECT_TERMS = [
    'man',
    'men',
    'people',
    'person',
    'player',
    'soccer',
    'football',
    'ball',
    'field',
    'group',
    'game',
    'crowd',
    'boy',
  ];
  expect(SUBJECT_TERMS.some((t) => caption.includes(t)), `caption "${caption}" names a subject`).toBe(true);
  await page.screenshot({ path: 'e2e-artifacts/screenshots/image-studio-caption.png', fullPage: true });

  // Copy caption → clipboard + transient "copied" state.
  const expected = await cards.first().locator('p').first().innerText();
  await cards.first().getByRole('button', { name: /^Copy caption/ }).click();
  await expect(cards.first().getByRole('button', { name: 'Caption copied' })).toBeVisible();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toBe(expected);

  // Add another image (valid type) → count increments (model already cached).
  await dropInto(SR_IMG);
  await expect(cards).toHaveCount(2, { timeout: CAPTION_TIMEOUT_MS });

  // Remove a single card via the gallery's native delete affordance.
  await page.getByRole('button', { name: 'Delete image' }).first().click();
  await expect(cards).toHaveCount(1);

  // Clear All empties the gallery + resets the count.
  await page.getByRole('button', { name: 'Clear All' }).click();
  await expect(cards).toHaveCount(0);
  await expect(block.getByText(/images? captioned/)).toHaveCount(0);

  // Reject an unsupported file type — no model call, dismissible error.
  const requestsBefore = modelRequests.length;
  const badFile = path.join(os.tmpdir(), 'image-studio-not-an-image.txt');
  writeFileSync(badFile, 'this is not an image');
  await dropInto(badFile);
  await expect(block.getByRole('alert')).toBeVisible();
  expect(modelRequests.length, 'rejected file makes no model request').toBe(requestsBefore);
});
