/**
 * Dedicated worker for the Transformers.js WASM lane. ONNX Runtime Web runs
 * its WASM inference on the calling thread, and Transformers.js chains every
 * token on microtasks, so a generation on the page's main thread leaves the
 * page unable to repaint until the whole request ends: the runner looked
 * frozen for minutes on slow devices. In a worker the page stays live, the
 * watchdog timers can fire, and each lane gets its own ONNX runtime instance
 * (a failed session elsewhere cannot poison this one). Model files still
 * come from the shared Cache API, so cache state is identical to the main
 * thread's. Messages are the whole contract; see transformers-worker-client.ts.
 */

import type { EmbeddingModel, LanguageModel } from '@localmode/core';

type Device = 'webgpu' | 'wasm';

/** Requests from the client. */
export type WorkerRequest =
  | { id: number; type: 'load'; kind: 'llm' | 'embedding'; modelId: string; device: Device }
  | {
      id: number;
      type: 'stream';
      options: { prompt: string; systemPrompt?: string; maxTokens?: number; temperature?: number };
    }
  | { id: number; type: 'embed'; values: string[] }
  | { id: number; type: 'abort' }
  | { id: number; type: 'dispose' };

/** Responses to the client. */
export type WorkerResponse =
  | { id: number; type: 'progress'; pct?: number }
  | { id: number; type: 'loaded'; dimensions?: number }
  | {
      id: number;
      type: 'chunk';
      text: string;
      done: boolean;
      finishReason?: string;
      usage?: { inputTokens: number; outputTokens: number; totalTokens: number; durationMs: number };
    }
  | { id: number; type: 'embedded'; buffers: ArrayBuffer[] }
  | { id: number; type: 'disposed' }
  | { id: number; type: 'error'; name: string; message: string; cause?: string; causeName?: string; causeStack?: string };

const scope = self as unknown as { postMessage(msg: WorkerResponse, transfer?: Transferable[]): void; onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null };

let model: LanguageModel | EmbeddingModel | null = null;
const controllers = new Map<number, AbortController>();

function reply(msg: WorkerResponse, transfer?: Transferable[]): void {
  scope.postMessage(msg, transfer);
}

function describe(id: number, error: unknown): WorkerResponse {
  const e = error as { name?: string; message?: string; cause?: unknown } | undefined;
  const cause = e?.cause;
  return {
    id,
    type: 'error',
    name: e?.name ?? 'Error',
    message: e?.message ?? String(error),
    cause: cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : undefined,
    causeName: cause instanceof Error && cause.name !== 'Error' ? cause.name : undefined,
    causeStack: cause instanceof Error && cause.stack ? cause.stack.slice(0, 4_000) : undefined,
  };
}

async function unloadModel(): Promise<void> {
  const unload = (model as { unload?: () => Promise<void> | void } | null)?.unload;
  if (typeof unload === 'function') await unload.call(model);
  model = null;
}

async function handle(req: WorkerRequest): Promise<void> {
  const { id } = req;
  try {
    switch (req.type) {
      case 'load': {
        const mod = await import('@localmode/transformers');
        const controller = new AbortController();
        controllers.set(id, controller);
        await mod.preloadModel(req.modelId, {
          device: req.device,
          onProgress: (p: { progress?: number; loaded?: number; total?: number }) => {
            const pct =
              typeof p.progress === 'number'
                ? p.progress
                : typeof p.loaded === 'number' && typeof p.total === 'number' && p.total > 0
                  ? (p.loaded / p.total) * 100
                  : undefined;
            reply({ id, type: 'progress', pct });
          },
        });
        controller.signal.throwIfAborted();
        await unloadModel();
        if (req.kind === 'llm') {
          model = mod.transformers.languageModel(req.modelId, { device: req.device });
          reply({ id, type: 'loaded' });
        } else {
          const embedder = mod.transformers.embedding(req.modelId, { device: req.device });
          model = embedder;
          reply({ id, type: 'loaded', dimensions: embedder.dimensions });
        }
        controllers.delete(id);
        return;
      }
      case 'stream': {
        const llm = model as LanguageModel | null;
        if (!llm) throw new Error('no model loaded in the worker');
        const controller = new AbortController();
        controllers.set(id, controller);
        try {
          if (llm.doStream) {
            for await (const chunk of llm.doStream({ ...req.options, abortSignal: controller.signal })) {
              reply({ id, type: 'chunk', text: chunk.text, done: chunk.done, finishReason: chunk.finishReason, usage: chunk.usage });
              if (chunk.done) return;
            }
            reply({ id, type: 'chunk', text: '', done: true });
          } else {
            const result = await llm.doGenerate({ ...req.options, abortSignal: controller.signal });
            reply({ id, type: 'chunk', text: result.text, done: true, finishReason: result.finishReason, usage: result.usage });
          }
        } finally {
          controllers.delete(id);
        }
        return;
      }
      case 'embed': {
        const embedder = model as EmbeddingModel | null;
        if (!embedder) throw new Error('no model loaded in the worker');
        const controller = new AbortController();
        controllers.set(id, controller);
        try {
          const { embeddings } = await embedder.doEmbed({ values: req.values, abortSignal: controller.signal });
          // Copy so the transferred buffers never alias the model's own memory.
          const buffers = embeddings.map((v) => Float32Array.from(v).buffer);
          reply({ id, type: 'embedded', buffers }, buffers);
        } finally {
          controllers.delete(id);
        }
        return;
      }
      case 'abort': {
        controllers.get(id)?.abort(Object.assign(new Error('aborted by the runner'), { name: 'AbortError' }));
        return;
      }
      case 'dispose': {
        await unloadModel();
        reply({ id, type: 'disposed' });
        return;
      }
    }
  } catch (error) {
    controllers.delete(id);
    reply(describe(id, error));
  }
}

scope.onmessage = (e) => {
  void handle(e.data);
};
