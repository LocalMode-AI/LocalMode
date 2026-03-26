/**
 * Evaluation Metric Functions
 *
 * Pure math metric functions for classification, text generation,
 * retrieval, and vector quality evaluation. Zero dependencies.
 *
 * @packageDocumentation
 */

import { ValidationError } from '../errors/index.js';
import type { ConfusionMatrix } from './types.js';

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Validate that predictions and labels arrays are non-empty and equal length.
 * @internal
 */
function validatePredictionsAndLabels(
  predictions: unknown[],
  labels: unknown[],
  metricName: string,
): void {
  if (predictions.length === 0) {
    throw new ValidationError(
      `${metricName} requires at least one prediction`,
      'Provide a non-empty array of predictions.',
    );
  }
  if (predictions.length !== labels.length) {
    throw new ValidationError(
      `${metricName} requires predictions and labels to have equal length, got ${predictions.length} predictions and ${labels.length} labels`,
      'Ensure predictions and labels arrays have the same length.',
    );
  }
}

/**
 * Get all unique labels from predictions and labels arrays.
 * @internal
 */
function getUniqueLabels(predictions: string[], labels: string[]): string[] {
  const labelSet = new Set<string>();
  for (const p of predictions) labelSet.add(p);
  for (const l of labels) labelSet.add(l);
  return Array.from(labelSet).sort();
}

/**
 * Tokenize a string by splitting on whitespace and filtering empty tokens.
 * @internal
 */
function tokenize(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

/**
 * Get n-grams from a list of tokens.
 * @internal
 */
function getNgrams(tokens: string[], n: number): string[] {
  const ngrams: string[] = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    ngrams.push(tokens.slice(i, i + n).join(' '));
  }
  return ngrams;
}

/**
 * Count occurrences of each item in an array.
 * @internal
 */
function countItems(items: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  return counts;
}

// ============================================================================
// Classification Metrics
// ============================================================================

/**
 * Compute the fraction of correct predictions.
 *
 * Returns the number of indices where `predictions[i] === labels[i]`
 * divided by the total number of items.
 *
 * @param predictions - Array of predicted labels
 * @param labels - Array of ground-truth labels
 * @returns Accuracy score between 0 and 1
 *
 * @example
 * ```ts
 * import { accuracy } from '@localmode/core';
 *
 * const score = accuracy(
 *   ['cat', 'dog', 'bird'],
 *   ['cat', 'dog', 'bird'],
 * );
 * // score === 1.0
 * ```
 *
 * @throws {ValidationError} If arrays are empty or have mismatched lengths
 *
 * @see {@link f1Score} for F1 metric
 * @see {@link confusionMatrix} for detailed breakdown
 */
export function accuracy(predictions: string[], labels: string[]): number {
  validatePredictionsAndLabels(predictions, labels, 'accuracy');

  let correct = 0;
  for (let i = 0; i < predictions.length; i++) {
    if (predictions[i] === labels[i]) correct++;
  }
  return correct / predictions.length;
}

/**
 * Compute macro-averaged precision across all classes.
 *
 * For each unique label, computes `TP / (TP + FP)`, then averages across
 * all labels. Classes with zero predictions (TP + FP = 0) have precision 0.
 *
 * @param predictions - Array of predicted labels
 * @param labels - Array of ground-truth labels
 * @returns Macro-averaged precision between 0 and 1
 *
 * @example
 * ```ts
 * import { precision } from '@localmode/core';
 *
 * const score = precision(['pos', 'neg'], ['pos', 'neg']);
 * // score === 1.0
 * ```
 *
 * @throws {ValidationError} If arrays are empty or have mismatched lengths
 *
 * @see {@link recall} for macro-averaged recall
 * @see {@link f1Score} for F1 metric
 */
export function precision(predictions: string[], labels: string[]): number {
  validatePredictionsAndLabels(predictions, labels, 'precision');

  const allLabels = getUniqueLabels(predictions, labels);
  let totalPrecision = 0;

  for (const label of allLabels) {
    let tp = 0;
    let fp = 0;
    for (let i = 0; i < predictions.length; i++) {
      if (predictions[i] === label) {
        if (labels[i] === label) {
          tp++;
        } else {
          fp++;
        }
      }
    }
    const denominator = tp + fp;
    totalPrecision += denominator === 0 ? 0 : tp / denominator;
  }

  return totalPrecision / allLabels.length;
}

/**
 * Compute macro-averaged recall across all classes.
 *
 * For each unique label, computes `TP / (TP + FN)`, then averages across
 * all labels. Classes with zero actual instances (TP + FN = 0) have recall 0.
 *
 * @param predictions - Array of predicted labels
 * @param labels - Array of ground-truth labels
 * @returns Macro-averaged recall between 0 and 1
 *
 * @example
 * ```ts
 * import { recall } from '@localmode/core';
 *
 * const score = recall(['pos', 'neg'], ['pos', 'neg']);
 * // score === 1.0
 * ```
 *
 * @throws {ValidationError} If arrays are empty or have mismatched lengths
 *
 * @see {@link precision} for macro-averaged precision
 * @see {@link f1Score} for F1 metric
 */
export function recall(predictions: string[], labels: string[]): number {
  validatePredictionsAndLabels(predictions, labels, 'recall');

  const allLabels = getUniqueLabels(predictions, labels);
  let totalRecall = 0;

  for (const label of allLabels) {
    let tp = 0;
    let fn = 0;
    for (let i = 0; i < predictions.length; i++) {
      if (labels[i] === label) {
        if (predictions[i] === label) {
          tp++;
        } else {
          fn++;
        }
      }
    }
    const denominator = tp + fn;
    totalRecall += denominator === 0 ? 0 : tp / denominator;
  }

  return totalRecall / allLabels.length;
}

/**
 * Compute F1 score with configurable averaging.
 *
 * - **`'macro'`** (default): Compute F1 per class, then unweighted average.
 * - **`'micro'`**: Compute global TP/FP/FN, then F1 from global precision/recall.
 * - **`'weighted'`**: Compute F1 per class, weighted by class support.
 *
 * @param predictions - Array of predicted labels
 * @param labels - Array of ground-truth labels
 * @param options - Configuration options
 * @param options.average - Averaging mode: `'macro'`, `'micro'`, or `'weighted'`
 * @returns F1 score between 0 and 1
 *
 * @example
 * ```ts
 * import { f1Score } from '@localmode/core';
 *
 * // Macro F1 (default)
 * const macro = f1Score(['cat', 'dog'], ['cat', 'dog']);
 *
 * // Micro F1
 * const micro = f1Score(predictions, labels, { average: 'micro' });
 *
 * // Weighted F1
 * const weighted = f1Score(predictions, labels, { average: 'weighted' });
 * ```
 *
 * @throws {ValidationError} If arrays are empty or have mismatched lengths
 *
 * @see {@link precision} for precision metric
 * @see {@link recall} for recall metric
 * @see {@link accuracy} for accuracy metric
 */
export function f1Score(
  predictions: string[],
  labels: string[],
  options?: { average?: 'micro' | 'macro' | 'weighted' },
): number {
  validatePredictionsAndLabels(predictions, labels, 'f1Score');

  const average = options?.average ?? 'macro';
  const allLabels = getUniqueLabels(predictions, labels);

  if (average === 'micro') {
    // Global TP, FP, FN across all classes
    let globalTP = 0;
    let globalFP = 0;
    let globalFN = 0;

    for (const label of allLabels) {
      for (let i = 0; i < predictions.length; i++) {
        if (predictions[i] === label && labels[i] === label) globalTP++;
        else if (predictions[i] === label && labels[i] !== label) globalFP++;
        else if (predictions[i] !== label && labels[i] === label) globalFN++;
      }
    }

    const microPrecision = globalTP + globalFP === 0 ? 0 : globalTP / (globalTP + globalFP);
    const microRecall = globalTP + globalFN === 0 ? 0 : globalTP / (globalTP + globalFN);
    const denominator = microPrecision + microRecall;
    return denominator === 0 ? 0 : (2 * microPrecision * microRecall) / denominator;
  }

  // Compute per-class F1
  const perClassF1: number[] = [];
  const perClassSupport: number[] = [];

  for (const label of allLabels) {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    let support = 0;

    for (let i = 0; i < predictions.length; i++) {
      if (labels[i] === label) support++;
      if (predictions[i] === label && labels[i] === label) tp++;
      else if (predictions[i] === label && labels[i] !== label) fp++;
      else if (predictions[i] !== label && labels[i] === label) fn++;
    }

    const classPrecision = tp + fp === 0 ? 0 : tp / (tp + fp);
    const classRecall = tp + fn === 0 ? 0 : tp / (tp + fn);
    const classDenom = classPrecision + classRecall;
    const classF1 = classDenom === 0 ? 0 : (2 * classPrecision * classRecall) / classDenom;

    perClassF1.push(classF1);
    perClassSupport.push(support);
  }

  if (average === 'weighted') {
    const totalSupport = perClassSupport.reduce((sum, s) => sum + s, 0);
    if (totalSupport === 0) return 0;

    let weightedSum = 0;
    for (let i = 0; i < perClassF1.length; i++) {
      weightedSum += perClassF1[i] * perClassSupport[i];
    }
    return weightedSum / totalSupport;
  }

  // macro: unweighted average
  return perClassF1.reduce((sum, f) => sum + f, 0) / perClassF1.length;
}

// ============================================================================
// Text Generation Metrics
// ============================================================================

/**
 * Compute BLEU-4 score for text generation evaluation.
 *
 * Uses whitespace tokenization, modified n-gram precision for n = 1..4,
 * brevity penalty, and geometric mean. This is a simplified implementation
 * suitable for comparing models against each other.
 *
 * @param candidate - Generated text
 * @param references - Array of reference texts (at least one required)
 * @returns BLEU score between 0 and 1
 *
 * @example
 * ```ts
 * import { bleuScore } from '@localmode/core';
 *
 * const score = bleuScore(
 *   'the cat sat on the mat',
 *   ['the cat sat on the mat'],
 * );
 * // score === 1.0
 * ```
 *
 * @throws {ValidationError} If references array is empty
 *
 * @see {@link rougeScore} for ROUGE metric
 */
export function bleuScore(candidate: string, references: string[]): number {
  if (references.length === 0) {
    throw new ValidationError(
      'bleuScore requires at least one reference',
      'Provide a non-empty array of reference texts.',
    );
  }

  const candidateTokens = tokenize(candidate);

  // Empty candidate produces 0
  if (candidateTokens.length === 0) return 0;

  const refTokenArrays = references.map(tokenize);

  // Compute modified n-gram precision for n = 1..4
  const maxN = 4;
  const precisions: number[] = [];

  for (let n = 1; n <= maxN; n++) {
    const candidateNgrams = getNgrams(candidateTokens, n);

    if (candidateNgrams.length === 0) {
      precisions.push(0);
      continue;
    }

    const candidateCounts = countItems(candidateNgrams);

    // For each n-gram, compute the max count across all references
    const maxRefCounts = new Map<string, number>();
    for (const refTokens of refTokenArrays) {
      const refNgrams = getNgrams(refTokens, n);
      const refCounts = countItems(refNgrams);
      for (const [ngram, count] of refCounts) {
        maxRefCounts.set(ngram, Math.max(maxRefCounts.get(ngram) ?? 0, count));
      }
    }

    // Clipped counts: min(candidate count, max ref count)
    let clippedTotal = 0;
    let candidateTotal = 0;
    for (const [ngram, count] of candidateCounts) {
      candidateTotal += count;
      clippedTotal += Math.min(count, maxRefCounts.get(ngram) ?? 0);
    }

    precisions.push(candidateTotal === 0 ? 0 : clippedTotal / candidateTotal);
  }

  // If any precision is 0, BLEU is 0 (geometric mean with zero)
  if (precisions.some((p) => p === 0)) return 0;

  // Geometric mean of precisions
  const logAvg = precisions.reduce((sum, p) => sum + Math.log(p), 0) / maxN;

  // Brevity penalty
  const candidateLength = candidateTokens.length;
  // Find the closest reference length
  let closestRefLength = refTokenArrays[0].length;
  let minDiff = Math.abs(candidateLength - closestRefLength);
  for (let i = 1; i < refTokenArrays.length; i++) {
    const diff = Math.abs(candidateLength - refTokenArrays[i].length);
    if (diff < minDiff) {
      minDiff = diff;
      closestRefLength = refTokenArrays[i].length;
    }
  }

  const bp =
    candidateLength >= closestRefLength
      ? 1
      : Math.exp(1 - closestRefLength / candidateLength);

  return bp * Math.exp(logAvg);
}

/**
 * Compute ROUGE score for summarization evaluation.
 *
 * Supports ROUGE-1 (unigram), ROUGE-2 (bigram), and ROUGE-L (LCS) variants.
 * Uses whitespace tokenization and computes the F1 variant.
 *
 * This is a simplified implementation suitable for comparing models.
 *
 * @param candidate - Generated summary text
 * @param reference - Reference summary text
 * @param options - Configuration options
 * @param options.type - ROUGE variant: `'rouge-1'`, `'rouge-2'`, or `'rouge-l'`
 * @returns ROUGE F1 score between 0 and 1
 *
 * @example
 * ```ts
 * import { rougeScore } from '@localmode/core';
 *
 * // ROUGE-1 (default)
 * const r1 = rougeScore('the cat sat', 'the cat sat');
 * // r1 === 1.0
 *
 * // ROUGE-L
 * const rl = rougeScore('the cat is on the mat', 'the cat sat on the mat', {
 *   type: 'rouge-l',
 * });
 * ```
 *
 * @see {@link bleuScore} for BLEU metric
 */
export function rougeScore(
  candidate: string,
  reference: string,
  options?: { type?: 'rouge-1' | 'rouge-2' | 'rouge-l' },
): number {
  const type = options?.type ?? 'rouge-1';

  const candidateTokens = tokenize(candidate);
  const referenceTokens = tokenize(reference);

  // Empty inputs produce 0
  if (candidateTokens.length === 0 || referenceTokens.length === 0) return 0;

  if (type === 'rouge-l') {
    // LCS-based F1
    const lcsLen = longestCommonSubsequenceLength(candidateTokens, referenceTokens);
    if (lcsLen === 0) return 0;

    const lcsPrecision = lcsLen / candidateTokens.length;
    const lcsRecall = lcsLen / referenceTokens.length;
    return (2 * lcsPrecision * lcsRecall) / (lcsPrecision + lcsRecall);
  }

  // ROUGE-1 or ROUGE-2: n-gram overlap F1
  const n = type === 'rouge-2' ? 2 : 1;
  const candidateNgrams = getNgrams(candidateTokens, n);
  const referenceNgrams = getNgrams(referenceTokens, n);

  if (candidateNgrams.length === 0 || referenceNgrams.length === 0) return 0;

  const candidateCounts = countItems(candidateNgrams);
  const referenceCounts = countItems(referenceNgrams);

  // Count overlapping n-grams
  let overlap = 0;
  for (const [ngram, count] of candidateCounts) {
    overlap += Math.min(count, referenceCounts.get(ngram) ?? 0);
  }

  if (overlap === 0) return 0;

  const ngramPrecision = overlap / candidateNgrams.length;
  const ngramRecall = overlap / referenceNgrams.length;
  return (2 * ngramPrecision * ngramRecall) / (ngramPrecision + ngramRecall);
}

/**
 * Compute LCS length between two token arrays.
 * @internal
 */
function longestCommonSubsequenceLength(a: string[], b: string[]): number {
  const m = a.length;
  const n = b.length;

  // Use two rows for space efficiency
  let prev = new Array<number>(n + 1).fill(0);
  let curr = new Array<number>(n + 1).fill(0);

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1] + 1;
      } else {
        curr[j] = Math.max(prev[j], curr[j - 1]);
      }
    }
    // Swap rows
    [prev, curr] = [curr, prev];
    curr.fill(0);
  }

  return prev[n];
}

// ============================================================================
// Vector Quality Metrics
// ============================================================================

/**
 * Compute cosine distance between two vectors.
 *
 * Computes `1 - cosineSimilarity(a, b)` where cosine similarity is
 * `dotProduct(a, b) / (magnitude(a) * magnitude(b))`.
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns Cosine distance between 0 (identical direction) and 2 (opposite direction).
 *   Returns 1.0 for zero vectors.
 *
 * @example
 * ```ts
 * import { evalCosineDistance } from '@localmode/core';
 *
 * const dist = evalCosineDistance(
 *   new Float32Array([1, 0, 0]),
 *   new Float32Array([1, 0, 0]),
 * );
 * // dist === 0.0
 * ```
 *
 * @throws {ValidationError} If vectors have different dimensions
 *
 * @see {@link mrr} for retrieval evaluation
 * @see {@link ndcg} for ranking evaluation
 */
export function cosineDistance(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new ValidationError(
      `cosineDistance requires vectors of equal dimensions, got ${a.length} and ${b.length}`,
      'Ensure both vectors have the same number of dimensions.',
    );
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitudeA = Math.sqrt(normA);
  const magnitudeB = Math.sqrt(normB);

  // Zero vector: treat as no similarity
  if (magnitudeA === 0 || magnitudeB === 0) return 1.0;

  const similarity = dot / (magnitudeA * magnitudeB);
  return 1 - similarity;
}

// ============================================================================
// Retrieval Metrics
// ============================================================================

/**
 * Compute Mean Reciprocal Rank (MRR) for retrieval evaluation.
 *
 * For each query, finds the rank (1-indexed) of the first relevant item
 * in the ranked results. The reciprocal rank is `1 / rank`. If no relevant
 * item is found, the reciprocal rank is 0. MRR is the mean across all queries.
 *
 * @param rankedResults - Array of ranked result ID lists, one per query
 * @param relevantIds - Array of relevant ID sets, one per query
 * @returns MRR score between 0 and 1
 *
 * @example
 * ```ts
 * import { mrr } from '@localmode/core';
 *
 * const score = mrr(
 *   [['a', 'b', 'c'], ['d', 'e', 'f']],
 *   [['b'], ['f']],
 * );
 * // score === (1/2 + 1/3) / 2
 * ```
 *
 * @throws {ValidationError} If arrays are empty or have mismatched lengths
 *
 * @see {@link ndcg} for NDCG metric
 */
export function mrr(rankedResults: string[][], relevantIds: string[][]): number {
  if (rankedResults.length === 0) {
    throw new ValidationError(
      'mrr requires at least one query',
      'Provide a non-empty array of ranked results.',
    );
  }
  if (rankedResults.length !== relevantIds.length) {
    throw new ValidationError(
      `mrr requires rankedResults and relevantIds to have equal length, got ${rankedResults.length} and ${relevantIds.length}`,
      'Ensure rankedResults and relevantIds arrays have the same length.',
    );
  }

  let totalRR = 0;

  for (let q = 0; q < rankedResults.length; q++) {
    const relevant = new Set(relevantIds[q]);
    let reciprocalRank = 0;

    for (let r = 0; r < rankedResults[q].length; r++) {
      if (relevant.has(rankedResults[q][r])) {
        reciprocalRank = 1 / (r + 1);
        break;
      }
    }

    totalRR += reciprocalRank;
  }

  return totalRR / rankedResults.length;
}

/**
 * Compute Normalized Discounted Cumulative Gain (NDCG).
 *
 * DCG = `sum(relevanceScores[item] / log2(rank + 1))` for ranks 1..k.
 * IDCG is computed by sorting all known relevant items by descending score.
 * NDCG = DCG / IDCG.
 *
 * @param rankedResults - Array of result IDs in ranked order
 * @param relevanceScores - Map of item IDs to relevance scores
 * @param k - Evaluation depth (defaults to `rankedResults.length`)
 * @returns NDCG score between 0 and 1. Returns 0 when IDCG is 0 or results are empty.
 *
 * @example
 * ```ts
 * import { ndcg } from '@localmode/core';
 *
 * // Perfect ranking
 * const score = ndcg(['a', 'b', 'c'], { a: 3, b: 2, c: 1 });
 * // score === 1.0
 *
 * // NDCG at k=2
 * const atK = ndcg(['a', 'b', 'c', 'd'], { a: 3, b: 2, c: 1, d: 0 }, 2);
 * ```
 *
 * @see {@link mrr} for Mean Reciprocal Rank
 */
export function ndcg(
  rankedResults: string[],
  relevanceScores: Record<string, number>,
  k?: number,
): number {
  if (rankedResults.length === 0) return 0;

  const evalK = k ?? rankedResults.length;

  // Compute DCG
  let dcg = 0;
  for (let i = 0; i < Math.min(evalK, rankedResults.length); i++) {
    const relevance = relevanceScores[rankedResults[i]] ?? 0;
    dcg += relevance / Math.log2(i + 2); // rank is 1-indexed: log2(rank + 1) = log2(i + 2)
  }

  // Compute IDCG: sort all relevance scores descending, take top k
  const idealScores = Object.values(relevanceScores)
    .filter((s) => s > 0)
    .sort((a, b) => b - a);

  let idcg = 0;
  for (let i = 0; i < Math.min(evalK, idealScores.length); i++) {
    idcg += idealScores[i] / Math.log2(i + 2);
  }

  if (idcg === 0) return 0;

  return dcg / idcg;
}

// ============================================================================
// Confusion Matrix
// ============================================================================

/**
 * Build a structured confusion matrix from predictions and labels.
 *
 * The matrix is a 2D array where `matrix[i][j]` is the count of samples
 * with true label `labels[i]` predicted as `labels[j]`. Labels are sorted
 * alphabetically.
 *
 * @param predictions - Array of predicted labels
 * @param labels - Array of ground-truth labels
 * @returns Structured confusion matrix with helper methods
 *
 * @example
 * ```ts
 * import { confusionMatrix } from '@localmode/core';
 *
 * const cm = confusionMatrix(
 *   ['pos', 'neg', 'pos', 'pos'],
 *   ['pos', 'pos', 'neg', 'pos'],
 * );
 *
 * console.log(cm.labels);               // ['neg', 'pos']
 * console.log(cm.truePositives('pos'));  // 2
 * console.log(cm.falsePositives('pos')); // 1
 * ```
 *
 * @throws {ValidationError} If arrays are empty or have mismatched lengths
 *
 * @see {@link accuracy} for overall accuracy
 * @see {@link f1Score} for F1 metric
 */
export function confusionMatrix(predictions: string[], labels: string[]): ConfusionMatrix {
  validatePredictionsAndLabels(predictions, labels, 'confusionMatrix');

  const sortedLabels = getUniqueLabels(predictions, labels);
  const labelIndex = new Map<string, number>();
  for (let i = 0; i < sortedLabels.length; i++) {
    labelIndex.set(sortedLabels[i], i);
  }

  const size = sortedLabels.length;
  const matrix: number[][] = Array.from({ length: size }, () => new Array<number>(size).fill(0));

  for (let i = 0; i < predictions.length; i++) {
    const trueIdx = labelIndex.get(labels[i])!;
    const predIdx = labelIndex.get(predictions[i])!;
    matrix[trueIdx][predIdx]++;
  }

  const total = predictions.length;

  return {
    matrix,
    labels: sortedLabels,

    truePositives(label: string): number {
      const idx = labelIndex.get(label);
      if (idx === undefined) return 0;
      return matrix[idx][idx];
    },

    falsePositives(label: string): number {
      const idx = labelIndex.get(label);
      if (idx === undefined) return 0;
      // Sum of column idx minus diagonal
      let colSum = 0;
      for (let i = 0; i < size; i++) {
        colSum += matrix[i][idx];
      }
      return colSum - matrix[idx][idx];
    },

    trueNegatives(label: string): number {
      const idx = labelIndex.get(label);
      if (idx === undefined) return 0;
      const tp = matrix[idx][idx];
      // FP: column sum - diagonal
      let fp = 0;
      for (let i = 0; i < size; i++) {
        fp += matrix[i][idx];
      }
      fp -= tp;
      // FN: row sum - diagonal
      let fn = 0;
      for (let j = 0; j < size; j++) {
        fn += matrix[idx][j];
      }
      fn -= tp;
      return total - tp - fp - fn;
    },

    falseNegatives(label: string): number {
      const idx = labelIndex.get(label);
      if (idx === undefined) return 0;
      // Sum of row idx minus diagonal
      let rowSum = 0;
      for (let j = 0; j < size; j++) {
        rowSum += matrix[idx][j];
      }
      return rowSum - matrix[idx][idx];
    },
  };
}
