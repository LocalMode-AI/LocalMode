/**
 * `revision` pins the Hugging Face revision every model load requests:
 * provider-level and model-level settings reach Transformers.js as the
 * `revision` load option, defaulting to 'main'. Transformers.js is mocked at
 * its module boundary; the provider code under test runs unmodified.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: Array<{ fn: string; id: string; options: Record<string, unknown> }> = [];

vi.mock('@huggingface/transformers', () => {
  const record = (fn: string) =>
    vi.fn(async (id: string, options: Record<string, unknown> = {}) => {
      calls.push({ fn, id, options });
      return {};
    });
  return {
    env: { backends: { onnx: { wasm: {} } }, useCustomCache: false },
    pipeline: vi.fn(async (task: string, id: string, options: Record<string, unknown>) => {
      calls.push({ fn: `pipeline:${task}`, id, options });
      const pipe = async () => {
        if (task === 'summarization') return [{ summary_text: 'short' }];
        if (task === 'translation') return [{ translation_text: 'Hallo' }];
        if (task === 'feature-extraction') return { data: new Float32Array([0.1, 0.2]) };
        if (task === 'text-classification') return [{ label: 'POSITIVE', score: 0.9 }];
        return [];
      };
      return Object.assign(pipe, { dispose: vi.fn() });
    }),
    AutoTokenizer: { from_pretrained: record('AutoTokenizer') },
    AutoModelForSequenceClassification: { from_pretrained: record('AutoModelForSequenceClassification') },
  };
});

import { createTransformers } from '../src/index.js';

const PIN = '6b476295a3cf27d5b20e8c8b847a54ab8e5d0df9';

describe('revision setting', () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it("requests revision 'main' when none is set", async () => {
    const t = createTransformers();
    await t.summarizer('Xenova/distilbart-cnn-6-6', { device: 'wasm' }).doSummarize({ texts: ['a b c'] });
    await t.translator('Xenova/opus-mt-en-de', { device: 'wasm' }).doTranslate({ texts: ['Hello'] });
    await t.embedding('Xenova/bge-small-en-v1.5', { device: 'wasm' }).doEmbed({ values: ['x'] });
    expect(calls.map((c) => c.fn)).toEqual([
      'pipeline:summarization',
      'pipeline:translation',
      'pipeline:feature-extraction',
    ]);
    for (const c of calls) expect(c.options.revision).toBe('main');
  });

  it('passes a model-level revision to the pipeline', async () => {
    const t = createTransformers();
    await t.summarizer('Xenova/distilbart-cnn-6-6', { revision: PIN }).doSummarize({ texts: ['a b c'] });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ fn: 'pipeline:summarization', id: 'Xenova/distilbart-cnn-6-6' });
    expect(calls[0].options.revision).toBe(PIN);
  });

  it('applies a provider-level revision, which a model-level one overrides', async () => {
    const t = createTransformers({ revision: 'v1' });
    await t.classifier('Xenova/distilbert-base-uncased-finetuned-sst-2-english').doClassify({ texts: ['good'] });
    await t.translator('Xenova/opus-mt-en-de', { revision: 'v2' }).doTranslate({ texts: ['Hello'] });
    expect(calls.map((c) => c.options.revision)).toEqual(['v1', 'v2']);
  });

  it('pins the tokenizer and the model of a from_pretrained load to the same revision', async () => {
    const t = createTransformers();
    const reranker = t.reranker('Xenova/ms-marco-MiniLM-L-6-v2', { revision: PIN });
    await reranker.doRerank({ query: 'q', documents: ['d'] }).catch(() => undefined);
    const loads = calls.filter((c) => !c.fn.startsWith('pipeline'));
    expect(loads.map((c) => c.fn).sort()).toEqual(['AutoModelForSequenceClassification', 'AutoTokenizer']);
    for (const c of loads) expect(c.options.revision).toBe(PIN);
  });
});
