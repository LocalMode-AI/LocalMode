/**
 * Transformers Document QA Model Implementation
 *
 * Implements DocumentQAModel interface using Transformers.js (Donut, LayoutLM, etc.)
 *
 * @packageDocumentation
 */

import type {
  DocumentQAModel,
  TableQAModel,
  DocumentQAUsage,
  DocInput,
  TableData,
} from '@localmode/core';

// Alias for internal use
type DocumentInput = DocInput;
import type { ModelSettings, TransformersDevice, ModelLoadProgress } from '../types.js';

// Use generic callable type since we may use different pipeline tasks (Florence-2 vs Donut)
type DocQAPipeline = (doc: unknown, question: unknown, ...args: unknown[]) => Promise<unknown>;

/**
 * Document QA model implementation using Transformers.js
 *
 * Implements both DocumentQAModel and TableQAModel interfaces.
 */
export class TransformersDocumentQAModel implements DocumentQAModel, TableQAModel {
  readonly modelId: string;
  readonly provider = 'transformers';

  private pipeline: DocQAPipeline | null = null;
  private loadPromise: Promise<DocQAPipeline> | null = null;

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

  private async loadPipeline(): Promise<DocQAPipeline> {
    if (this.pipeline) {
      return this.pipeline;
    }

    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');

      // Suppress ONNX runtime warnings about node execution providers
      env.backends.onnx.logLevel = 'error';

      // Florence-2 uses 'image-text-to-text' pipeline; traditional models use 'document-question-answering'
      const isFlorence = this.baseModelId.toLowerCase().includes('florence');
      const task = isFlorence ? 'image-text-to-text' : 'document-question-answering';

      const pipe = await (pipeline as Function)(task, this.baseModelId, {
        device: this.settings.device ?? 'auto',
        dtype: this.settings.quantized === true ? 'q8' : undefined,
        progress_callback: this.settings.onProgress,
      }) as DocQAPipeline;

      this.pipeline = pipe;
      return pipe;
    })();

    return this.loadPromise;
  }

  private async prepareDocument(document: DocumentInput): Promise<string | Blob> {
    if (typeof document === 'string') {
      // If it's a URL or path, return as-is
      return document;
    }
    if (document instanceof Blob) {
      return document;
    }
    if (document instanceof ArrayBuffer) {
      return new Blob([document], { type: 'application/pdf' });
    }
    // For ImageData or other types, return as unknown and let the pipeline handle it
    return document as unknown as string;
  }

  async doAskDocument(options: {
    document: DocumentInput;
    questions: string[];
    abortSignal?: AbortSignal;
    providerOptions?: Record<string, Record<string, unknown>>;
  }): Promise<{
    answers: Array<{ answer: string; score: number }>;
    usage: DocumentQAUsage;
  }> {
    const { document, questions, abortSignal } = options;
    const startTime = Date.now();

    abortSignal?.throwIfAborted();

    const pipe = await this.loadPipeline();

    abortSignal?.throwIfAborted();

    const preparedDoc = await this.prepareDocument(document);

    const answers: Array<{ answer: string; score: number }> = [];

    const isFlorence = this.baseModelId.toLowerCase().includes('florence');

    for (const question of questions) {
      abortSignal?.throwIfAborted();

      let answer: { answer: string; score: number };

      if (isFlorence) {
        // Florence-2 uses text prompt with the question embedded
        const prompt = `<DocVQA> ${question}`;
        const output = await pipe(preparedDoc as unknown as string, prompt);
        const results = Array.isArray(output) ? output : [output];
        const generated = String((results[0] as Record<string, unknown>).generated_text ?? '');
        answer = {
          answer: generated.replace(/<[^>]+>/g, '').trim() || 'No answer found',
          score: generated ? 0.5 : 0,
        };
      } else {
        // Standard document-question-answering pipeline returns { answer, score }
        const output = await pipe(preparedDoc as unknown as string, question);
        const result = Array.isArray(output) ? output[0] : output;
        answer = {
          answer: String((result as Record<string, unknown>).answer ?? ''),
          score: Number((result as Record<string, unknown>).score ?? 0),
        };
      }

      answers.push(answer);
    }

    return {
      answers,
      usage: {
        durationMs: Date.now() - startTime,
      },
    };
  }

  async doAskTable(options: {
    table: TableData;
    questions: string[];
    abortSignal?: AbortSignal;
    providerOptions?: Record<string, Record<string, unknown>>;
  }): Promise<{
    answers: Array<{ answer: string; cells?: string[]; aggregator?: string; score: number }>;
    usage: DocumentQAUsage;
  }> {
    const { table, questions, abortSignal } = options;
    const startTime = Date.now();

    abortSignal?.throwIfAborted();

    // For table QA, we use the question-answering approach with table context
    // Transformers.js doesn't have a dedicated table-qa pipeline,
    // so we convert the table to text and use it as context

    // Convert table to text representation (currently unused, for future implementation)
    // const _tableContext = [table.headers.join(' | '), ...table.rows.map((row) => row.join(' | '))].join('\n');
    void table; // Acknowledge table parameter is received for future use

    // Use standard QA pipeline with table as context
    await this.loadPipeline();

    abortSignal?.throwIfAborted();

    // For table QA, we need to find a way to process it
    // This is a simplified implementation - real table QA would use TAPAS
    const answers: Array<{ answer: string; cells?: string[]; aggregator?: string; score: number }> = questions.map(() => ({
      answer: 'Table QA requires TAPAS model. Please use a dedicated table QA model.',
      score: 0.5,
    }));

    return {
      answers,
      usage: {
        durationMs: Date.now() - startTime,
      },
    };
  }
}

/**
 * Create a document QA model using Transformers.js
 */
export function createDocumentQAModel(
  modelId: string,
  settings?: ModelSettings
): TransformersDocumentQAModel {
  return new TransformersDocumentQAModel(modelId, settings);
}

