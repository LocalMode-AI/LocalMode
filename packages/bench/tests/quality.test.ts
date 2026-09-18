import { describe, expect, it } from 'vitest';
import {
  formatMMLUPrompt,
  parseMMLUAnswer,
  runMMLUFidelity,
  runSTSQuality,
} from '../src/quality.js';
import { TINY_MMLU } from '../src/datasets/tiny-mmlu.js';
import { STSB_SUBSET } from '../src/datasets/stsb/stsb-subset.js';
import { spearman } from '../src/stats.js';
import type { BenchEmbeddingModel, BenchLanguageModel } from '../src/adapter.js';

describe('bundled datasets', () => {
  it('tinyMMLU has 100 well-formed items', () => {
    expect(TINY_MMLU).toHaveLength(100);
    for (const item of TINY_MMLU) {
      expect(item.choices).toHaveLength(4);
      expect(item.answer).toBeGreaterThanOrEqual(0);
      expect(item.answer).toBeLessThanOrEqual(3);
      expect(item.question.length).toBeGreaterThan(0);
    }
  });

  it('STS-B subset has 100 scored pairs', () => {
    expect(STSB_SUBSET).toHaveLength(100);
    for (const pair of STSB_SUBSET) {
      expect(pair.score).toBeGreaterThanOrEqual(0);
      expect(pair.score).toBeLessThanOrEqual(5);
      expect(pair.s1.length).toBeGreaterThan(0);
      expect(pair.s2.length).toBeGreaterThan(0);
    }
  });
});

describe('parseMMLUAnswer()', () => {
  const choices = ['first option', 'second option', 'third option', 'fourth option'] as const;

  it('parses bare letters, punctuation, and "Answer:" forms', () => {
    expect(parseMMLUAnswer('B', choices)).toBe(1);
    expect(parseMMLUAnswer(' C.', choices)).toBe(2);
    expect(parseMMLUAnswer('(D)', choices)).toBe(3);
    expect(parseMMLUAnswer('Answer: A', choices)).toBe(0);
    expect(parseMMLUAnswer('the answer is B', choices)).toBe(1);
  });

  it('falls back to matching the choice text and rejects ambiguity', () => {
    expect(parseMMLUAnswer('third option', choices)).toBe(2);
    expect(parseMMLUAnswer('I am not sure about this one', choices)).toBeNull();
  });
});

describe('runMMLUFidelity()', () => {
  function oracleModel(correctEvery: number): BenchLanguageModel {
    let call = 0;
    return {
      modelId: 'mock:oracle',
      provider: 'mock',
      async doGenerate({ prompt }: { prompt: string }) {
        const index = call++;
        const item = TINY_MMLU[index];
        expect(prompt).toContain(item.question);
        const letter =
          index % correctEvery === 0
            ? ['A', 'B', 'C', 'D'][item.answer]
            : ['A', 'B', 'C', 'D'][(item.answer + 1) % 4];
        return {
          text: ` ${letter}`,
          finishReason: 'stop',
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, durationMs: 1 },
        };
      },
    };
  }

  it('scores an all-correct oracle at 1.0 and a half-correct one at 0.5', async () => {
    const perfect = await runMMLUFidelity(oracleModel(1), 10);
    expect(perfect.score).toBe(1);
    expect(perfect.n).toBe(10);
    const half = await runMMLUFidelity(oracleModel(2), 10);
    expect(half.score).toBe(0.5);
    expect(half.details).toHaveLength(10);
  });

  it('uses the fixed prompt template', () => {
    const prompt = formatMMLUPrompt(TINY_MMLU[0]);
    expect(prompt).toContain('A. ');
    expect(prompt).toContain('D. ');
    expect(prompt.endsWith('Answer:')).toBe(true);
  });
});

describe('runSTSQuality()', () => {
  it('achieves rho ~= 1 for an embedder that encodes the human score', async () => {
    let pairIndex = 0;
    const oracle: BenchEmbeddingModel = {
      modelId: 'mock:sts-oracle',
      provider: 'mock',
      dimensions: 2,
      async doEmbed({ values }: { values: string[] }) {
        const score = STSB_SUBSET[pairIndex++].score;
        // Two unit vectors at an angle that shrinks as the score grows,
        // so cosine(s1, s2) is monotonic in the human score.
        const theta = ((5 - score) / 5) * (Math.PI / 3);
        return {
          embeddings: values.map((_, i) => {
            const angle = i === 0 ? 0 : theta;
            return new Float32Array([Math.cos(angle), Math.sin(angle)]);
          }),
        };
      },
    };
    const result = await runSTSQuality(oracle, 50);
    expect(result.n).toBe(50);
    expect(result.score).toBeGreaterThan(0.99);
  });

  it('spearman is the scoring function (sanity anchor)', () => {
    expect(spearman([1, 2, 3], [10, 20, 30])).toBeCloseTo(1, 10);
  });
});
