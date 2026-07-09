/**
 * Transformers Reranker Tests
 *
 * Red-first regression tests for the cross-encoder reranker fix found by
 * real-Chrome verification of useRerank (react-use-rerank change): the old
 * implementation scored `pipe([query, doc])` as a batch of two independent
 * texts, so every document got the same constant score (exactly 0 for
 * single-logit models after a LABEL_0 inversion heuristic).
 *
 * The TransformersRerankerModel class runs unmodified; only its external
 * dependency (@huggingface/transformers) is mocked, with a scoring function
 * that depends on the DOCUMENT of each (query, document) pair — a
 * pair-blind implementation cannot pass these tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Per-document relevance logits keyed by a marker word in the document. */
const DOC_LOGITS: Record<string, number> = {
  encryption: 4.0, // most relevant
  cooking: -2.0,
  sports: -3.0,
};

function logitForDocument(doc: string): number {
  for (const [marker, logit] of Object.entries(DOC_LOGITS)) {
    if (doc.includes(marker)) return logit;
  }
  return -5.0;
}

/** Calls captured at the mocked tokenizer/model boundary. */
const tokenizerCalls: Array<{ texts: string[]; options: Record<string, unknown> }> = [];
const modelCalls: Array<Record<string, unknown>> = [];

vi.mock('@huggingface/transformers', () => {
  const tokenizer = (texts: string[], options: { text_pair: string[] }) => {
    tokenizerCalls.push({ texts, options });
    // Encoded batch carries the pair texts through so the mock model can
    // score per document — like a real cross-encoder, unlike the old
    // pipeline path where the document never reached the model.
    return { __texts: texts, __pairs: options.text_pair };
  };

  const model = async (inputs: { __texts: string[]; __pairs: string[] }) => {
    modelCalls.push(inputs);
    if (!Array.isArray(inputs.__pairs)) {
      throw new Error('mock model: text_pair missing — inputs are not cross-encoder pairs');
    }
    const logits = inputs.__pairs.map(logitForDocument);
    return {
      logits: {
        dims: [logits.length, 1],
        data: Float32Array.from(logits),
      },
    };
  };
  (model as unknown as { config: { id2label: Record<string, string> } }).config = {
    id2label: { '0': 'LABEL_0' },
  };

  return {
    AutoTokenizer: { from_pretrained: vi.fn(async () => tokenizer) },
    AutoModelForSequenceClassification: { from_pretrained: vi.fn(async () => model) },
    env: { backends: { onnx: { logLevel: 'error' } } },
  };
});

import { rerank } from '@localmode/core';
import { transformers } from '../src/index.js';
import { TransformersRerankerModel } from '../src/implementations/reranker.js';

const QUERY = 'What keeps data private in the browser?';
const DOCUMENTS = [
  'The sports match went into overtime.',
  'On-device encryption keeps user data local.',
  'A cooking recipe for pasta sauce.',
];

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

beforeEach(() => {
  vi.clearAllMocks();
  tokenizerCalls.length = 0;
  modelCalls.length = 0;
});

describe('TransformersRerankerModel', () => {
  it('encodes (query, document) cross-encoder pairs via text_pair', async () => {
    const model = new TransformersRerankerModel('Xenova/ms-marco-MiniLM-L-6-v2');
    await model.doRerank({ query: QUERY, documents: DOCUMENTS });

    expect(tokenizerCalls).toHaveLength(1);
    expect(tokenizerCalls[0].texts).toEqual([QUERY, QUERY, QUERY]);
    expect(tokenizerCalls[0].options.text_pair).toEqual(DOCUMENTS);
    expect(tokenizerCalls[0].options.padding).toBe(true);
    expect(tokenizerCalls[0].options.truncation).toBe(true);
  });

  it('ranks by document relevance with sigmoid scores, original indices intact', async () => {
    const model = new TransformersRerankerModel('Xenova/ms-marco-MiniLM-L-6-v2');
    const { results } = await model.doRerank({ query: QUERY, documents: DOCUMENTS });

    expect(results).toHaveLength(3);
    // encryption doc (original index 1) must rank first
    expect(results[0].index).toBe(1);
    expect(results[0].text).toBe(DOCUMENTS[1]);
    expect(results[0].score).toBeCloseTo(sigmoid(4.0), 10);
    expect(results[1].index).toBe(2);
    expect(results[1].score).toBeCloseTo(sigmoid(-2.0), 10);
    expect(results[2].index).toBe(0);
    expect(results[2].score).toBeCloseTo(sigmoid(-3.0), 10);
    // Scores must differ (the old pair-blind path returned a constant)
    expect(new Set(results.map((r) => r.score)).size).toBe(3);
    for (let i = 1; i < results.length; i++) {
      expect(results[i].score).toBeLessThan(results[i - 1].score);
    }
  });

  it('honors topK', async () => {
    const model = new TransformersRerankerModel('Xenova/ms-marco-MiniLM-L-6-v2');
    const { results } = await model.doRerank({ query: QUERY, documents: DOCUMENTS, topK: 2 });

    expect(results).toHaveLength(2);
    expect(results[0].index).toBe(1);
  });

  it('batches long document lists and observes abort between batches', async () => {
    const model = new TransformersRerankerModel('Xenova/ms-marco-MiniLM-L-6-v2');
    const manyDocs = Array.from({ length: 20 }, (_, i) => `document ${i} about cooking`);

    // 20 docs / batch size 8 → 3 forward passes
    await model.doRerank({ query: QUERY, documents: manyDocs });
    expect(modelCalls).toHaveLength(3);

    // Abort mid-run: signal aborted after the first batch → throws, no result
    modelCalls.length = 0;
    const controller = new AbortController();
    const origPush = modelCalls.push.bind(modelCalls);
    modelCalls.push = (...args) => {
      controller.abort();
      return origPush(...args);
    };
    await expect(
      model.doRerank({ query: QUERY, documents: manyDocs, abortSignal: controller.signal })
    ).rejects.toThrow();
    expect(modelCalls.length).toBeLessThan(3);
    modelCalls.push = origPush;
  });

  it('works end-to-end through core rerank() and the provider factory', async () => {
    const { results, usage, response } = await rerank({
      model: transformers.reranker('Xenova/ms-marco-MiniLM-L-6-v2'),
      query: QUERY,
      documents: DOCUMENTS,
      topK: 2,
    });

    expect(results).toHaveLength(2);
    expect(results[0].index).toBe(1);
    expect(Number.isFinite(results[0].score)).toBe(true);
    expect(usage.inputTokens).toBeGreaterThan(0);
    expect(response.modelId).toBe('transformers:Xenova/ms-marco-MiniLM-L-6-v2');
  });

  it('multi-class heads use softmax over the positive class', async () => {
    // Swap the mocked model for a 2-class head for this test via a fresh instance
    const twoClassModel = async (inputs: { __pairs: string[] }) => {
      const rows = inputs.__pairs.map((doc) => {
        const logit = logitForDocument(doc);
        return [-logit / 2, logit / 2]; // class 1 = relevant
      });
      return {
        logits: {
          dims: [rows.length, 2],
          data: Float32Array.from(rows.flat()),
        },
      };
    };
    const hf = await import('@huggingface/transformers');
    (
      hf.AutoModelForSequenceClassification.from_pretrained as unknown as {
        mockImplementationOnce: (fn: () => Promise<unknown>) => void;
      }
    ).mockImplementationOnce(async () => twoClassModel);

    const model = new TransformersRerankerModel('some/two-class-reranker');
    const { results } = await model.doRerank({ query: QUERY, documents: DOCUMENTS });

    expect(results[0].index).toBe(1);
    const l = logitForDocument(DOCUMENTS[1]);
    const expected = Math.exp(l / 2) / (Math.exp(l / 2) + Math.exp(-l / 2));
    expect(results[0].score).toBeCloseTo(expected, 10);
  });
});
