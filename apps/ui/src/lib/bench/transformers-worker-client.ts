/**
 * Main-thread client for the Transformers.js worker (transformers-worker.ts).
 * Presents the worker's model as the structural `doStream` / `doGenerate` /
 * `doEmbed` the bench runner consumes. Chunk timestamps are taken on the main
 * thread when a message arrives, so the trace measures what a page sees from
 * a worker-hosted model, which is how an application would run it.
 */

import type { BenchEmbeddingModel, BenchLanguageModel, BenchStreamChunk } from '@localmode/bench';
import type { WorkerRequest, WorkerResponse } from './transformers-worker';

type Device = 'webgpu' | 'wasm';

/** A push queue an async generator can drain while messages keep arriving. */
class MessageQueue<T> {
  private items: T[] = [];
  private waiters: Array<(item: T) => void> = [];
  push(item: T): void {
    const waiter = this.waiters.shift();
    if (waiter) waiter(item);
    else this.items.push(item);
  }
  next(): Promise<T> {
    const item = this.items.shift();
    if (item !== undefined) return Promise.resolve(item);
    return new Promise((resolve) => this.waiters.push(resolve));
  }
}

function toError(msg: Extract<WorkerResponse, { type: 'error' }>): Error {
  const cause = msg.cause !== undefined ? Object.assign(new Error(msg.cause), { name: msg.causeName ?? 'Error', stack: msg.causeStack }) : undefined;
  const error = new Error(msg.message, cause ? { cause } : undefined);
  error.name = msg.name;
  return error;
}

/** One worker, one model at a time. */
export class TransformersWorkerLane {
  private readonly worker: Worker;
  private nextId = 1;
  private readonly queues = new Map<number, MessageQueue<WorkerResponse>>();

  constructor() {
    this.worker = new Worker(new URL('./transformers-worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      this.queues.get(e.data.id)?.push(e.data);
    };
    this.worker.onerror = (e) => {
      const error: WorkerResponse = { id: -1, type: 'error', name: 'WorkerError', message: e.message || 'worker error' };
      for (const q of this.queues.values()) q.push(error);
    };
  }

  private send(req: WorkerRequest, transfer?: Transferable[]): MessageQueue<WorkerResponse> {
    const queue = new MessageQueue<WorkerResponse>();
    this.queues.set(req.id, queue);
    this.worker.postMessage(req, transfer ?? []);
    return queue;
  }

  private abort(id: number): void {
    this.worker.postMessage({ id, type: 'abort' } satisfies WorkerRequest);
  }

  /** Preload + construct the model inside the worker; resolves when it is ready. */
  async load(
    kind: 'llm' | 'embedding',
    modelId: string,
    device: Device,
    options: { onProgress?: (pct: number | undefined) => void; abortSignal?: AbortSignal },
  ): Promise<{ dimensions?: number }> {
    const id = this.nextId++;
    const queue = this.send({ id, type: 'load', kind, modelId, device });
    const onAbort = () => this.abort(id);
    options.abortSignal?.addEventListener('abort', onAbort, { once: true });
    try {
      for (;;) {
        const msg = await queue.next();
        if (msg.type === 'progress') options.onProgress?.(msg.pct);
        else if (msg.type === 'loaded') return { dimensions: msg.dimensions };
        else if (msg.type === 'error') throw toError(msg);
      }
    } finally {
      options.abortSignal?.removeEventListener('abort', onAbort);
      this.queues.delete(id);
    }
  }

  /** The worker-hosted LLM as the bench's structural language model. */
  languageModel(modelId: string): BenchLanguageModel {
    const lane = this;
    const model: BenchLanguageModel = {
      modelId: `transformers:${modelId}`,
      provider: 'transformers',
      async *doStream(options): AsyncIterable<BenchStreamChunk> {
        const id = lane.nextId++;
        const { abortSignal, ...rest } = options;
        const queue = lane.send({ id, type: 'stream', options: rest });
        const onAbort = () => lane.abort(id);
        abortSignal?.addEventListener('abort', onAbort, { once: true });
        try {
          for (;;) {
            const msg = await queue.next();
            if (msg.type === 'chunk') {
              yield { text: msg.text, done: msg.done, finishReason: msg.finishReason, usage: msg.usage };
              if (msg.done) return;
            } else if (msg.type === 'error') {
              throw toError(msg);
            }
          }
        } finally {
          abortSignal?.removeEventListener('abort', onAbort);
          lane.queues.delete(id);
        }
      },
      async doGenerate(options) {
        let text = '';
        let finishReason = 'stop';
        let usage: BenchStreamChunk['usage'];
        for await (const chunk of model.doStream!(options)) {
          text += chunk.text;
          if (chunk.done) {
            finishReason = chunk.finishReason ?? finishReason;
            usage = chunk.usage;
          }
        }
        return {
          text,
          finishReason,
          usage: usage ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0, durationMs: 0 },
        };
      },
    };
    return model;
  }

  /** The worker-hosted embedder as the bench's structural embedding model. */
  embeddingModel(modelId: string, dimensions: number): BenchEmbeddingModel {
    const lane = this;
    return {
      modelId: `transformers:${modelId}`,
      provider: 'transformers',
      dimensions,
      async doEmbed({ values, abortSignal }) {
        const id = lane.nextId++;
        const queue = lane.send({ id, type: 'embed', values });
        const onAbort = () => lane.abort(id);
        abortSignal?.addEventListener('abort', onAbort, { once: true });
        try {
          for (;;) {
            const msg = await queue.next();
            if (msg.type === 'embedded') return { embeddings: msg.buffers.map((b) => new Float32Array(b)) };
            if (msg.type === 'error') throw toError(msg);
          }
        } finally {
          abortSignal?.removeEventListener('abort', onAbort);
          lane.queues.delete(id);
        }
      },
    };
  }

  /** Unload the model and terminate the worker (its ONNX runtime dies with it). */
  async dispose(): Promise<void> {
    const id = this.nextId++;
    const queue = this.send({ id, type: 'dispose' });
    await Promise.race([queue.next(), new Promise((r) => setTimeout(r, 5_000))]);
    this.queues.delete(id);
    this.worker.terminate();
  }
}
