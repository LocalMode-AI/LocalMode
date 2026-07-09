/**
 * @file generate-kb-fixtures.mjs
 * @description Deterministic generator for the knowledge-base block's E2E
 * fixtures (e2e/blocks/knowledge-base.spec.ts). Regenerate with:
 *
 *   node e2e/fixtures/generate-kb-fixtures.mjs        (from apps/ui)
 *
 * Produces, next to this script:
 * - kb-fixture.pdf   — minimal hand-encoded one-page TEXT-BASED PDF (raw PDF
 *                      syntax, no deps) whose extractable text is
 *                      "LocalMode processes documents entirely in the browser
 *                      using WebAssembly". Drives the PDF-ingest lane.
 * - kb-ocr.png       — 960×200 white PNG with one machine-printed line
 *                      "LOCAL FIRST OCR TEST" (Playwright screenshot of styled
 *                      HTML — deterministic, no extra deps). Drives the TrOCR
 *                      OCR-ingest lane.
 * - kb-invoice.png   — 800×1000 synthetic invoice (INVOICE #4021, Vendor:
 *                      Acme Corp, Total: $1,234.56), same technique. Drives
 *                      the Donut document-QA lane.
 * - kb-pinecone.json — Pinecone-format export ({ vectors: [{ id, values,
 *                      metadata }] }, 3 records, 384-dim seeded-PRNG vectors,
 *                      metadata.text/title/category). Shape grounded in
 *                      packages/core/src/import-export/parsers/pinecone.ts +
 *                      detect.ts. Drives the import lane's direct path.
 * - kb-export.csv    — CSV export with header `id,title,category,text` and 3
 *                      text-only rows (no vector column). Shape grounded in
 *                      packages/core/src/import-export/parsers/csv.ts +
 *                      detect.ts. Drives the import lane's re-embed path.
 *
 * PNG rendering uses the Chromium bundled with @playwright/test (an apps/ui
 * devDependency), so a clean `pnpm install` is the only prerequisite.
 */

import { writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const FIXTURES_DIR = path.dirname(fileURLToPath(import.meta.url));

/* ────────────────────────────── kb-fixture.pdf ───────────────────────────── */

/**
 * Hand-encodes a minimal, valid, single-page text PDF (PDF 1.4): catalog →
 * pages → page → Helvetica font + one content stream with two Tj text lines.
 * The xref table offsets are computed programmatically, so the file parses in
 * strict readers (verified against pdfjs-dist, the same library
 * @localmode/pdfjs wraps).
 */
function buildPdf() {
  const line1 = 'LocalMode processes documents entirely';
  const line2 = 'in the browser using WebAssembly';
  const content = `BT\n/F1 18 Tf\n72 700 Td\n(${line1}) Tj\n0 -24 Td\n(${line2}) Tj\nET`;

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  // Everything is ASCII, so latin1 round-trips bytes 1:1.
  return Buffer.from(pdf, 'latin1');
}

/* ─────────────────────────── kb-ocr / kb-invoice ─────────────────────────── */

/** One machine-printed line, ideal input for TrOCR (line-level printed OCR). */
const OCR_HTML = `<!doctype html><html><body style="margin:0">
  <div style="width:960px;height:200px;background:#ffffff;display:flex;align-items:center;justify-content:center">
    <span style="font:700 64px Arial, Helvetica, sans-serif;letter-spacing:6px;color:#000000">LOCAL FIRST OCR TEST</span>
  </div>
</body></html>`;

/** Simple machine-printed invoice layout for Donut DocVQA. */
const INVOICE_HTML = `<!doctype html><html><body style="margin:0">
  <div style="width:800px;height:1000px;background:#ffffff;color:#000000;font-family:Arial, Helvetica, sans-serif;padding:56px;box-sizing:border-box">
    <div style="display:flex;justify-content:space-between;align-items:baseline">
      <span style="font-size:44px;font-weight:700;letter-spacing:2px">INVOICE</span>
      <span style="font-size:28px;font-weight:700">#4021</span>
    </div>
    <hr style="border:none;border-top:3px solid #000;margin:24px 0" />
    <p style="font-size:24px;margin:12px 0">Vendor: Acme Corp</p>
    <p style="font-size:24px;margin:12px 0">Date: 2026-06-15</p>
    <p style="font-size:24px;margin:12px 0">Bill To: LocalMode Labs</p>
    <table style="width:100%;margin-top:40px;border-collapse:collapse;font-size:22px">
      <tr style="border-bottom:2px solid #000;text-align:left">
        <th style="padding:10px 0">Description</th><th style="padding:10px 0;text-align:right">Amount</th>
      </tr>
      <tr><td style="padding:10px 0">Consulting services</td><td style="padding:10px 0;text-align:right">$1,000.00</td></tr>
      <tr><td style="padding:10px 0">On-device model tuning</td><td style="padding:10px 0;text-align:right">$234.56</td></tr>
    </table>
    <hr style="border:none;border-top:3px solid #000;margin:32px 0" />
    <p style="font-size:32px;font-weight:700;text-align:right;margin:0">Total: $1,234.56</p>
  </div>
</body></html>`;

/** Renders an HTML string to a PNG via headless Chromium at scale factor 1. */
async function renderPng(browser, html, width, height, outPath) {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: outPath });
  await page.close();
}

/* ─────────────────────── kb-pinecone.json / kb-export.csv ────────────────── */

/** Seeded mulberry32 PRNG so regenerated vectors are byte-identical. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 384 dims matches the block's default embedding model
 * (Xenova/bge-small-en-v1.5), so these records land in the Data tab's
 * direct-import lane (text + usable vector). The vectors themselves are
 * discarded on import (the engine re-embeds text), so seeded pseudo-random
 * values rounded to 4 decimals keep the fixture small and deterministic.
 */
const VECTOR_DIMS = 384;

const PINECONE_RECORDS = [
  {
    id: 'px-1',
    title: 'Solar panel maintenance',
    category: 'energy',
    text: 'Cleaning solar panels every few months and checking the inverter keeps photovoltaic output high through the summer.',
  },
  {
    id: 'px-2',
    title: 'Sourdough starter care',
    category: 'baking',
    text: 'Feed a sourdough starter twice a day with equal parts flour and water until it doubles in size reliably.',
  },
  {
    id: 'px-3',
    title: 'Basics of birdwatching',
    category: 'nature',
    text: 'A pair of binoculars and a regional field guide are enough to identify most backyard songbirds.',
  },
];

const CSV_RECORDS = [
  {
    id: 'csv-1',
    title: 'Houseplant watering guide',
    category: 'home',
    text: 'Most houseplants prefer soil that dries slightly between waterings and overwatering is the most common cause of root rot.',
  },
  {
    id: 'csv-2',
    title: 'Beginner chess openings',
    category: 'games',
    text: 'Control the center with pawns and develop knights before bishops in the opening.',
  },
  {
    id: 'csv-3',
    title: 'Trail running safety',
    category: 'sports',
    text: 'Carry water and tell someone your route before running remote trails alone.',
  },
];

function buildPineconeJson() {
  const random = mulberry32(0x5eed);
  const vectors = PINECONE_RECORDS.map((record) => ({
    id: record.id,
    values: Array.from({ length: VECTOR_DIMS }, () =>
      Number((random() * 2 - 1).toFixed(4)),
    ),
    metadata: { title: record.title, category: record.category, text: record.text },
  }));
  return JSON.stringify({ vectors }, null, 2);
}

function buildCsv() {
  // Field values deliberately contain no commas/quotes/newlines, so no RFC
  // 4180 quoting is needed and the file stays trivially diffable.
  const header = 'id,title,category,text';
  const rows = CSV_RECORDS.map(
    (record) => `${record.id},${record.title},${record.category},${record.text}`,
  );
  return `${header}\n${rows.join('\n')}\n`;
}

/* ────────────────────────────────── main ─────────────────────────────────── */

const browser = await chromium.launch();
try {
  await writeFile(path.join(FIXTURES_DIR, 'kb-fixture.pdf'), buildPdf());
  await renderPng(browser, OCR_HTML, 960, 200, path.join(FIXTURES_DIR, 'kb-ocr.png'));
  await renderPng(browser, INVOICE_HTML, 800, 1000, path.join(FIXTURES_DIR, 'kb-invoice.png'));
  await writeFile(path.join(FIXTURES_DIR, 'kb-pinecone.json'), buildPineconeJson());
  await writeFile(path.join(FIXTURES_DIR, 'kb-export.csv'), buildCsv());
  console.log('Generated kb-fixture.pdf, kb-ocr.png, kb-invoice.png, kb-pinecone.json, kb-export.csv');
} finally {
  await browser.close();
}
