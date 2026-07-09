/**
 * WllamaRerankerModel Tests
 *
 * Regression tests for the reranker fixes found by real-Chrome verification
 * of useRerank (react-use-rerank change):
 * - `createRerank` only exists in @wllama/wllama >= 3.5.x (the runtime CDN
 *   pin was 3.2.3, which has no rerank API at all — every real rerank failed
 *   with "wllamaInstance.createRerank is not a function").
 * - `createRerank` requires the model to be loaded with `embeddings: true`
 *   and `pooling_type: 'rank'`; the loader passed neither.
 *
 * Mocks OUR loader seam (src/wllama-loader.js) per the package's documented
 * test pattern; the WllamaRerankerModel class and core rerank() run unmodified.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockState = {
  loadModelFromUrl: vi.fn(),
  createRerank: vi.fn(),
};

vi.mock('../src/wllama-loader.js', () => ({
  WLLAMA_CDN_ESM: 'https://cdn.jsdelivr.net/npm/@wllama/wllama@3.5.1/esm/index.js',
  WLLAMA_CDN_WASM: 'https://cdn.jsdelivr.net/npm/@wllama/wllama@3.5.1/src/wasm/wllama.wasm',
  importWllama: async () => ({
    Wllama: function MockWllama() {
      return {
        loadModelFromUrl: (...args: unknown[]) => mockState.loadModelFromUrl(...args),
        createRerank: (...args: unknown[]) => mockState.createRerank(...args),
        exit: vi.fn().mockResolvedValue(undefined),
      };
    },
  }),
}));

import { rerank } from '@localmode/core';
import { WllamaRerankerModel } from '../src/reranker.js';

const QUERY = 'What keeps data private in the browser?';
const DOCUMENTS = [
  'The sports match went into overtime.',
  'On-device encryption keeps user data local.',
  'A cooking recipe for pasta sauce.',
];

beforeEach(() => {
  vi.clearAllMocks();
  mockState.loadModelFromUrl.mockResolvedValue(undefined);
  // wllama's createRerank returns results sorted by relevance, highest first
  mockState.createRerank.mockResolvedValue({
    model: 'test',
    object: 'list',
    usage: { prompt_tokens: 10, total_tokens: 10 },
    results: [
      { index: 1, relevance_score: 3.2 },
      { index: 2, relevance_score: -1.5 },
      { index: 0, relevance_score: -2.75 },
    ],
  });
});

describe('WllamaRerankerModel', () => {
  it('loads the model in reranking mode (embeddings + rank pooling)', async () => {
    const model = new WllamaRerankerModel('jina-reranker-v2-base-multilingual-Q4_K_M');
    await model.doRerank({ query: QUERY, documents: DOCUMENTS });

    expect(mockState.loadModelFromUrl).toHaveBeenCalledTimes(1);
    const [url, options] = mockState.loadModelFromUrl.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(url).toContain('jina-reranker-v2-base-multilingual-Q4_K_M.gguf');
    // Without these flags 3.5.x createRerank rejects — the context must be
    // created in reranking mode.
    expect(options.embeddings).toBe(true);
    expect(options.pooling_type).toBe('rank');
  });

  it('passes query/documents/top_n through to createRerank and maps results', async () => {
    const model = new WllamaRerankerModel('jina-reranker-v2-base-multilingual-Q4_K_M');
    const result = await model.doRerank({ query: QUERY, documents: DOCUMENTS, topK: 2 });

    expect(mockState.createRerank).toHaveBeenCalledWith({
      query: QUERY,
      documents: DOCUMENTS,
      top_n: 2,
    });
    expect(result.results[0]).toEqual({
      index: 1,
      score: 3.2,
      text: DOCUMENTS[1],
    });
    expect(result.results.map((r) => r.index)).toEqual([1, 2, 0]);
    expect(result.usage.inputTokens).toBeGreaterThan(0);
  });

  it('omits top_n when topK is not set', async () => {
    const model = new WllamaRerankerModel('jina-reranker-v2-base-multilingual-Q4_K_M');
    await model.doRerank({ query: QUERY, documents: DOCUMENTS });

    expect(mockState.createRerank).toHaveBeenCalledWith({
      query: QUERY,
      documents: DOCUMENTS,
    });
  });

  it('works end-to-end through core rerank()', async () => {
    const { results, response } = await rerank({
      model: new WllamaRerankerModel('bge-reranker-v2-m3-Q4_K_M'),
      query: QUERY,
      documents: DOCUMENTS,
    });

    expect(results[0].index).toBe(1);
    expect(results[0].text).toBe(DOCUMENTS[1]);
    expect(response.modelId).toBe('wllama:bge-reranker-v2-m3-Q4_K_M');
  });

  it('wraps load failures in ModelLoadError', async () => {
    mockState.loadModelFromUrl.mockRejectedValueOnce(new Error('network down'));
    const model = new WllamaRerankerModel('jina-reranker-v2-base-multilingual-Q4_K_M');

    await expect(model.doRerank({ query: QUERY, documents: DOCUMENTS })).rejects.toMatchObject({
      name: 'ModelLoadError',
    });
  });
});
