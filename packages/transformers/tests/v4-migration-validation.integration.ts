/**
 * TJS v4 Migration Validation — Post-Migration Smoke Tests
 *
 * These tests validate that the unified @huggingface/transformers@4.x
 * pipelines produce correct output for embedding, classification, and STT.
 * Originally used to compare v3 vs v4 outputs side-by-side (v3 results
 * preserved in v4-validation-report.json for reference).
 *
 * Run with: pnpm --filter @localmode/transformers test:validate
 *
 * Known gap: Captioner (image-to-text) requires OffscreenCanvas which is
 * unavailable in Node.js. Validate manually in a browser.
 *
 * @packageDocumentation
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';

interface PipelineResult {
  ok: boolean;
  error?: string;
  data?: unknown;
}

function runIsolated(script: string): PipelineResult {
  const code = `
    (async () => {
      try {
        const tjs = await import('@huggingface/transformers');
        tjs.env.backends.onnx.logLevel = 'error';
        ${script}
      } catch (e) {
        process.stdout.write(JSON.stringify({ ok: false, error: String(e.stack || e) }));
      }
    })();
  `;
  const result = execFileSync('node', ['--input-type=module', '-e', code], {
    encoding: 'utf-8',
    timeout: 240_000,
    maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
  });
  return JSON.parse(result.trim());
}

describe('TJS v4 Post-Migration Smoke Tests', () => {
  it('feature-extraction pipeline produces 384-dim embeddings', () => {
    const result = runIsolated(`
      const pipe = await tjs.pipeline('feature-extraction', 'Xenova/bge-small-en-v1.5', { dtype: 'fp32' });
      const output = await pipe('The quick brown fox', { pooling: 'mean', normalize: true });
      const arr = Array.from(output.data);
      process.stdout.write(JSON.stringify({ ok: true, data: { dims: arr.length, nonZero: arr.some(v => v !== 0) } }));
    `);
    expect(result.ok).toBe(true);
    const data = result.data as { dims: number; nonZero: boolean };
    expect(data.dims).toBe(384);
    expect(data.nonZero).toBe(true);
  }, 300_000);

  it('text-classification pipeline produces POSITIVE label', () => {
    const result = runIsolated(`
      const pipe = await tjs.pipeline('text-classification', 'Xenova/distilbert-base-uncased-finetuned-sst-2-english', { dtype: 'fp32' });
      const output = await pipe('I love this product');
      const top = Array.from(output).sort((a, b) => b.score - a.score)[0];
      process.stdout.write(JSON.stringify({ ok: true, data: { label: top.label, score: top.score } }));
    `);
    expect(result.ok).toBe(true);
    const data = result.data as { label: string; score: number };
    expect(data.label).toBe('POSITIVE');
    expect(data.score).toBeGreaterThan(0.99);
  }, 300_000);

  it('automatic-speech-recognition pipeline produces non-empty text', () => {
    const result = runIsolated(`
      const pipe = await tjs.pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', { dtype: 'fp32' });
      const samples = new Float32Array(16000);
      for (let i = 0; i < samples.length; i++) {
        samples[i] = 0.3 * Math.sin(2 * Math.PI * 440 * (i / 16000));
      }
      const output = await pipe(samples);
      process.stdout.write(JSON.stringify({ ok: true, data: { text: output.text, hasText: output.text.trim().length > 0 } }));
    `);
    expect(result.ok).toBe(true);
    const data = result.data as { text: string; hasText: boolean };
    expect(data.hasText).toBe(true);
  }, 300_000);

  it('no implementation file references the removed @huggingface/transformers-v4 alias', () => {
    const result = runIsolated(`
      const fs = await import('node:fs');
      const path = await import('node:path');
      const dir = '${process.cwd()}/packages/transformers/src';
      const walk = (d) => {
        let files = [];
        for (const f of fs.readdirSync(d)) {
          const full = path.join(d, f);
          if (fs.statSync(full).isDirectory()) files.push(...walk(full));
          else if (f.endsWith('.ts')) files.push(full);
        }
        return files;
      };
      const violations = [];
      for (const f of walk(dir)) {
        const content = fs.readFileSync(f, 'utf-8');
        if (content.includes('transformers-v4')) violations.push(f);
      }
      process.stdout.write(JSON.stringify({ ok: violations.length === 0, data: { violations } }));
    `);
    expect(result.ok).toBe(true);
  });
});
