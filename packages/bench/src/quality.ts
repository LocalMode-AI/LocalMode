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

/**
 * Generation budget for MMLU items (part of the versioned protocol). Large
 * enough to absorb an empty Qwen3-style `<think></think>` block plus a
 * verbose "The answer is B." — the v1 budget of 8 truncated before any
 * parseable letter on thinking-mode builds, scoring fidelity as 0.
 */
export const MMLU_MAX_TOKENS = 48;

/** Cap on each stored raw output (auditability without payload bloat). */
export const MMLU_OUTPUT_CAP = 400;

/** Fixed MCQ prompt template (part of the versioned protocol). */
export function formatMMLUPrompt(
  item: (typeof TINY_MMLU)[number],
  promptSuffix?: string,
): string {
  const choices = item.choices.map((c, i) => `${LETTERS[i]}. ${c}`).join('\n');
  return (
    `The following is a multiple choice question about ${item.subject.replace(/_/g, ' ')}.\n\n` +
    `${item.question}\n${choices}\n\n` +
    `Answer with only the letter (A, B, C, or D) of the correct choice.${promptSuffix ?? ''}\nAnswer:`
  );
}

/**
 * Remove reasoning blocks from a response. Closed `<think>...</think>` blocks
 * are dropped; an unterminated block drops the remainder (the answer never
 * surfaced within the generation budget).
 */
function stripReasoning(response: string): string {
  const closed = response.replace(/<think>[\s\S]*?<\/think>/gi, ' ');
  const open = closed.search(/<think>/i);
  return open === -1 ? closed : closed.slice(0, open);
}

/**
 * Parse the answer letter from a model response. Reasoning blocks are
 * stripped first; markdown emphasis around the letter is ignored. Accepts
 * "B", "B.", "(B)", "**B**", "Answer: B", "Option C", "choice (B)", or a
 * response beginning with the exact choice text. Letters are matched
 * case-sensitively after a keyword so the article "a" ("the answer is a
 * bit unclear") is never read as answer A; a lowercase letter counts only
 * when it is the whole reply or leads it as "b." / "b)".
 *
 * @returns 0-3, or null when no unambiguous answer is present.
 */
export function parseMMLUAnswer(response: string, choices: readonly string[]): number | null {
  const trimmed = stripReasoning(response).trim();
  const emphasisFree = trimmed.replace(/[*`_]/g, '').trim();
  const keyed = emphasisFree.match(
    /(?:^|(?:[Aa]nswer|ANSWER)\s*(?:is)?\s*[:-]?\s*|(?:[Oo]ption|OPTION|[Cc]hoice|CHOICE)\s*[:-]?\s*)\(?([ABCD])\)?(?=[\s.,)!]|$)/,
  );
  if (keyed) return LETTERS.indexOf(keyed[1] as (typeof LETTERS)[number]);
  const leadingLower = emphasisFree.match(/^\(?([abcd])(?:\)|\.|$)/);
  if (leadingLower) return LETTERS.indexOf(leadingLower[1].toUpperCase() as (typeof LETTERS)[number]);
  const lower = trimmed.toLowerCase();
  for (let i = 0; i < choices.length; i++) {
    if (lower.startsWith(choices[i].toLowerCase().slice(0, Math.max(8, choices[i].length)))) return i;
  }
  return null;
}

/**
 * Run the tinyMMLU fidelity task on a language model (temperature 0,
 * `MMLU_MAX_TOKENS` budget, greedy answer parsing). Unparseable answers count
 * as wrong; raw outputs and the parse rate are recorded so the score is
 * auditable and recomputable server-side.
 *
 * @param model - Any structurally-compatible LanguageModel.
 * @param items - Number of items from the 100-item set (25 or 100).
 * @returns Accuracy in [0,1] with per-item correctness details and outputs.
 */
export async function runMMLUFidelity(
  model: BenchLanguageModel,
  items: number,
  options?: {
    abortSignal?: AbortSignal;
    onProgress?: (done: number, total: number) => void;
    /** Appended to the instruction line of every item (from the model catalog). */
    promptSuffix?: string;
  },
): Promise<QualityResult> {
  const subset = TINY_MMLU.slice(0, items);
  const details: number[] = [];
  const outputs: string[] = [];
  let correct = 0;
  let parsed = 0;
  for (let i = 0; i < subset.length; i++) {
    if (options?.abortSignal?.aborted) throw abortDomException();
    const item = subset[i];
    const result = await model.doGenerate({
      prompt: formatMMLUPrompt(item, options?.promptSuffix),
      maxTokens: MMLU_MAX_TOKENS,
      temperature: 0,
      abortSignal: options?.abortSignal,
    });
    // Score exactly the text that is stored: the server re-parses `outputs`
    // and rejects any disagreement, so client and server must see one string.
    const output = result.text.slice(0, MMLU_OUTPUT_CAP);
    const answer = parseMMLUAnswer(output, item.choices);
    if (answer !== null) parsed++;
    const ok = answer === item.answer ? 1 : 0;
    correct += ok;
    details.push(ok);
    outputs.push(output);
    options?.onProgress?.(i + 1, subset.length);
  }
  return {
    taskId: `tinymmlu-${items}`,
    score: subset.length === 0 ? 0 : correct / subset.length,
    n: subset.length,
    details,
    outputs,
    parseRate: subset.length === 0 ? 0 : parsed / subset.length,
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
