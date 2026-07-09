/**
 * Transformers Reranker Model Implementation
 *
 * Implements RerankerModel interface using Transformers.js
 *
 * Cross-encoder rerankers score (query, document) PAIRS: the tokenizer must
 * encode the query as `text` and the document as `text_pair` so both go
 * through the model together ([CLS] query [SEP] document [SEP]). The previous
 * implementation routed pairs through the text-classification pipeline as
 * `pipe([query, doc])`, which transformers.js treats as a batch of two
 * INDEPENDENT texts — the document never influenced the score, and single-
 * logit cross-encoders (e.g. Xenova/ms-marco-MiniLM-L-6-v2) came back with
 * softmax(1 logit) = 1.0 for every input, which a LABEL_0 inversion heuristic
 * then mapped to a constant 0. Found by real-Chrome verification of
 * `useRerank` (react-use-rerank change); fixed with the canonical
 * AutoTokenizer + AutoModelForSequenceClassification approach.
 *
 * @packageDocumentation
 */

import type { RerankerModel, RankedDocument, RerankUsage } from '@localmode/core';
import type { ModelSettings, TransformersDevice, ModelLoadProgress } from '../types.js';
import { installResilientModelCache } from '../resilient-cache.js';

/** Minimal structural type for the tokenizer's encoded batch output. */
type EncodedBatch = Record<string, unknown>;

/** Minimal structural type for the pieces of PreTrainedTokenizer we use. */
interface RerankTokenizer {
  (texts: string[], options: { text_pair: string[]; padding: boolean; truncation: boolean }): EncodedBatch;
}

/** Minimal structural type for the pieces of the sequence-classification model we use. */
interface RerankModel {
  (inputs: EncodedBatch): Promise<{ logits: { dims: number[]; data: ArrayLike<number> } }>;
  config?: { id2label?: Record<string, string> };
}

/** Documents scored per forward pass — bounds padding memory and keeps abort checks frequent. */
const RERANK_BATCH_SIZE = 8;

/** Numerically standard logistic sigmoid. */
function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * Reranker model implementation using Transformers.js
 *
 * Rerankers score query-document pairs for relevance. They're typically
 * used after initial retrieval to improve result quality.
 */
export class TransformersRerankerModel implements RerankerModel {
  readonly modelId: string;
  readonly provider = 'transformers';

  private tokenizer: RerankTokenizer | null = null;
  private model: RerankModel | null = null;
  private loadPromise: Promise<void> | null = null;

  constructor(
    private baseModelId: string,
    private settings: {
      device?: TransformersDevice;
      quantized?: boolean;
      onProgress?: (progress: ModelLoadProgress) => void;
    } = {}
  ) {
    this.modelId = `transformers:${baseModelId}`;
  }

  private async loadModel(): Promise<void> {
    if (this.tokenizer && this.model) {
      return;
    }

    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = (async () => {
      const { AutoTokenizer, AutoModelForSequenceClassification, env } = await import(
        '@huggingface/transformers'
      );

      // Suppress ONNX runtime warnings about node execution providers
      env.backends.onnx.logLevel = 'error';
      installResilientModelCache(env);

      const [tokenizer, model] = await Promise.all([
        AutoTokenizer.from_pretrained(this.baseModelId, {
          progress_callback: this.settings.onProgress,
        }),
        AutoModelForSequenceClassification.from_pretrained(this.baseModelId, {
          device: this.settings.device ?? 'auto',
          dtype: this.settings.quantized === true ? 'q8' : 'fp32',
          progress_callback: this.settings.onProgress,
        }),
      ]);

      this.tokenizer = tokenizer as unknown as RerankTokenizer;
      this.model = model as unknown as RerankModel;
    })();

    return this.loadPromise;
  }

  /**
   * Index of the "relevant" class in the model's logits.
   *
   * Single-logit cross-encoders (the common case: ms-marco MiniLM, BGE, Jina)
   * emit one relevance logit at index 0. Two-class rerankers conventionally
   * put the positive class at index 1; when the config names its labels we
   * pick the one that reads as relevant/positive.
   */
  private positiveClassIndex(numLabels: number): number {
    if (numLabels === 1) {
      return 0;
    }
    const id2label = this.model?.config?.id2label;
    if (id2label) {
      for (const [id, label] of Object.entries(id2label)) {
        if (
          /relevant|positive|yes|true|entail/i.test(label) &&
          !/not|non|ir|contradict/i.test(label)
        ) {
          return Number(id);
        }
      }
    }
    return 1;
  }

  async doRerank(options: {
    query: string;
    documents: string[];
    topK?: number;
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
    providerOptions?: Record<string, Record<string, unknown>>;
  }): Promise<{
    results: RankedDocument[];
    usage: RerankUsage;
  }> {
    const { query, documents, topK, abortSignal } = options;
    const startTime = Date.now();

    abortSignal?.throwIfAborted();

    await this.loadModel();

    abortSignal?.throwIfAborted();

    const tokenizer = this.tokenizer!;
    const model = this.model!;

    // Score (query, document) pairs in bounded batches so long inputs don't
    // blow up padding memory and cancellation is observed between batches.
    const scoredDocs: Array<{ index: number; score: number; text: string }> = [];
    let totalTokens = 0;

    for (let start = 0; start < documents.length; start += RERANK_BATCH_SIZE) {
      abortSignal?.throwIfAborted();

      const chunk = documents.slice(start, start + RERANK_BATCH_SIZE);

      // Encode each pair as query [SEP] document — text_pair is what makes
      // this a cross-encoder input rather than two unrelated texts.
      const inputs = tokenizer(new Array<string>(chunk.length).fill(query), {
        text_pair: chunk,
        padding: true,
        truncation: true,
      });

      const { logits } = await model(inputs);
      const [batchSize, numLabels] = [logits.dims[0], logits.dims[logits.dims.length - 1]];
      const positiveIndex = this.positiveClassIndex(numLabels);

      for (let row = 0; row < batchSize; row++) {
        let score: number;
        if (numLabels === 1) {
          // Single relevance logit → sigmoid gives a 0-1 relevance score
          score = sigmoid(Number(logits.data[row]));
        } else {
          // Multi-class head → softmax, take the positive class probability
          const rowLogits: number[] = [];
          for (let l = 0; l < numLabels; l++) {
            rowLogits.push(Number(logits.data[row * numLabels + l]));
          }
          const max = Math.max(...rowLogits);
          const exps = rowLogits.map((v) => Math.exp(v - max));
          const sum = exps.reduce((a, b) => a + b, 0);
          score = exps[positiveIndex] / sum;
        }

        const docIndex = start + row;
        scoredDocs.push({
          index: docIndex,
          score,
          text: documents[docIndex],
        });

        // Estimate tokens
        totalTokens += Math.ceil(
          (query.split(/\s+/).length + documents[docIndex].split(/\s+/).length) * 1.3
        );
      }
    }

    // Sort by score descending
    scoredDocs.sort((a, b) => b.score - a.score);

    // Apply topK if specified
    const results = topK ? scoredDocs.slice(0, topK) : scoredDocs;

    return {
      results,
      usage: {
        inputTokens: totalTokens,
        durationMs: Date.now() - startTime,
      },
    };
  }
}

/**
 * Create a reranker model using Transformers.js
 */
export function createRerankerModel(
  modelId: string,
  settings?: ModelSettings
): TransformersRerankerModel {
  return new TransformersRerankerModel(modelId, settings);
}
