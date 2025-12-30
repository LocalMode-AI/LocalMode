/**
 * Transformers Question Answering Model Implementation
 *
 * Implements QuestionAnsweringModel interface using Transformers.js (DistilBERT, RoBERTa, etc.)
 *
 * @packageDocumentation
 */

import type {
  QuestionAnsweringModel,
  QuestionAnsweringUsage,
  ExtractedAnswer,
} from '@localmode/core';
import type { ModelSettings, TransformersDevice, ModelLoadProgress } from '../types.js';

// Dynamic import types
type QAPipeline = Awaited<
  ReturnType<typeof import('@huggingface/transformers').pipeline<'question-answering'>>
>;

/**
 * Question answering model implementation using Transformers.js
 */
export class TransformersQuestionAnsweringModel implements QuestionAnsweringModel {
  readonly modelId: string;
  readonly provider = 'transformers';

  private pipeline: QAPipeline | null = null;
  private loadPromise: Promise<QAPipeline> | null = null;

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

  private async loadPipeline(): Promise<QAPipeline> {
    if (this.pipeline) {
      return this.pipeline;
    }

    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = (async () => {
      const { pipeline } = await import('@huggingface/transformers');

      const pipe = await pipeline('question-answering', this.baseModelId, {
        device: this.settings.device ?? 'auto',
        dtype: this.settings.quantized !== false ? 'q8' : 'fp32',
        progress_callback: this.settings.onProgress,
      });

      this.pipeline = pipe;
      return pipe;
    })();

    return this.loadPromise;
  }

  async doAnswer(options: {
    questions: Array<{ question: string; context: string }>;
    topK?: number;
    abortSignal?: AbortSignal;
    providerOptions?: Record<string, Record<string, unknown>>;
  }): Promise<{
    results: ExtractedAnswer[][];
    usage: QuestionAnsweringUsage;
  }> {
    const { questions, topK = 1, abortSignal } = options;
    const startTime = Date.now();

    abortSignal?.throwIfAborted();

    const pipe = await this.loadPipeline();

    abortSignal?.throwIfAborted();

    const allResults: ExtractedAnswer[][] = [];
    let totalInputTokens = 0;

    for (const { question, context } of questions) {
      abortSignal?.throwIfAborted();

      // Question-answering pipeline returns { answer, score, start, end }
      const output = await pipe(question, context, { top_k: topK });

      const results = (Array.isArray(output) ? output : [output]) as Array<Record<string, unknown>>;

      const answers: ExtractedAnswer[] = results.map((result) => ({
        answer: String(result.answer ?? ''),
        score: Number(result.score ?? 0),
        start: Number(result.start ?? 0),
        end: Number(result.end ?? 0),
      }));

      allResults.push(answers);
      totalInputTokens += question.split(/\s+/).length + context.split(/\s+/).length;
    }

    return {
      results: allResults,
      usage: {
        inputTokens: totalInputTokens,
        durationMs: Date.now() - startTime,
      },
    };
  }
}

/**
 * Create a question answering model using Transformers.js
 */
export function createQuestionAnsweringModel(
  modelId: string,
  settings?: ModelSettings
): TransformersQuestionAnsweringModel {
  return new TransformersQuestionAnsweringModel(modelId, settings);
}

