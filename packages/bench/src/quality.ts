/**
 * Quality-fidelity lane. Scores measure runtime/quantization fidelity of a
 * model build (do this runtime's weights + kernels reproduce expected answers),
 * NOT model capability — the bundled public sets are assumed to be in every
 * model's training data. Always run at temperature 0, outside timed regions.
 */

import type { QualityResult } from './types.js';
import type { BenchEmbeddingModel, BenchLanguageModel } from './adapter.js';
import { TINY_MMLU } from './datasets/tiny-mmlu.js';
import { STSB_SUBSET } from './datasets/stsb/stsb-subset.js';
import { spearman } from './stats.js';
import { abortDomException } from './timing.js';

const LETTERS = ['A', 'B', 'C', 'D'] as const;

/** Fixed MCQ prompt template (part of the versioned protocol). */
export function formatMMLUPrompt(item: (typeof TINY_MMLU)[number]): string {
  const choices = item.choices.map((c, i) => `${LETTERS[i]}. ${c}`).join('\n');
  return (
    `The following is a multiple choice question about ${item.subject.replace(/_/g, ' ')}.\n\n` +
    `${item.question}\n${choices}\n\n` +
    `Answer with only the letter (A, B, C, or D) of the correct choice.\nAnswer:`
  );
}

/**
 * Parse the answer letter from a model response. Accepts "B", "B.", "(B)",
 * "Answer: B", or a response beginning with the exact choice text.
 *
 * @returns 0-3, or null when no unambiguous answer is present.
 */
export function parseMMLUAnswer(response: string, choices: readonly string[]): number | null {
  const trimmed = response.trim();
  const letterMatch = trimmed.match(/(?:^|answer\s*(?:is)?\s*[:-]?\s*)\(?([ABCD])\)?(?=[\s.,)!]|$)/i);
  if (letterMatch) return LETTERS.indexOf(letterMatch[1].toUpperCase() as (typeof LETTERS)[number]);
  const lower = trimmed.toLowerCase();
  for (let i = 0; i < choices.length; i++) {
    if (lower.startsWith(choices[i].toLowerCase().slice(0, Math.max(8, choices[i].length)))) return i;
  }
  return null;
}

/**
 * Run the tinyMMLU fidelity task on a language model (temperature 0,
 * `maxTokens` 8, greedy answer parsing). Unparseable answers count as wrong.
 *
 * @param model - Any structurally-compatible LanguageModel.
 * @param items - Number of items from the 100-item set (25 or 100 in v1).
 * @returns Accuracy in [0,1] with per-item correctness details.
 */
export async function runMMLUFidelity(
  model: BenchLanguageModel,
  items: number,
  options?: { abortSignal?: AbortSignal; onProgress?: (done: number, total: number) => void },
): Promise<QualityResult> {
  const subset = TINY_MMLU.slice(0, items);
  const details: number[] = [];
  let correct = 0;
  for (let i = 0; i < subset.length; i++) {
    if (options?.abortSignal?.aborted) throw abortDomException();
    const item = subset[i];
    const result = await model.doGenerate({
      prompt: formatMMLUPrompt(item),
      maxTokens: 8,
      temperature: 0,
      abortSignal: options?.abortSignal,
    });
    const parsed = parseMMLUAnswer(result.text, item.choices);
    const ok = parsed === item.answer ? 1 : 0;
    correct += ok;
    details.push(ok);
    options?.onProgress?.(i + 1, subset.length);
  }
  return {
    taskId: `tinymmlu-${items}`,
    score: subset.length === 0 ? 0 : correct / subset.length,
    n: subset.length,
    details,
  };
}

/** Cosine similarity of two vectors. */
function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const den = Math.sqrt(na) * Math.sqrt(nb);
  return den === 0 ? 0 : dot / den;
}

/**
 * Run the STS-B embedding-quality task: Spearman correlation of cosine
 * similarities against human scores over the bundled pair subset.
 *
 * @param model - Any structurally-compatible EmbeddingModel.
 * @param pairs - Number of pairs from the 100-pair set.
 * @returns Spearman rho with per-pair cosine details.
 */
export async function runSTSQuality(
  model: BenchEmbeddingModel,
  pairs: number,
  options?: { abortSignal?: AbortSignal; onProgress?: (done: number, total: number) => void },
): Promise<QualityResult> {
  const subset = STSB_SUBSET.slice(0, pairs);
  const sims: number[] = [];
  const humanScores: number[] = [];
  for (let i = 0; i < subset.length; i++) {
    if (options?.abortSignal?.aborted) throw abortDomException();
    const pair = subset[i];
    const { embeddings } = await model.doEmbed({
      values: [pair.s1, pair.s2],
      abortSignal: options?.abortSignal,
    });
    sims.push(cosine(embeddings[0], embeddings[1]));
    humanScores.push(pair.score);
    options?.onProgress?.(i + 1, subset.length);
  }
  return {
    taskId: `stsb-${pairs}`,
    score: sims.length >= 2 ? spearman(sims, humanScores) : 0,
    n: subset.length,
    details: sims.map((s) => Math.round(s * 10_000) / 10_000),
  };
}
