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
import type { OrtOperatorProfile } from '@localmode/bench';
import { gzipText, installOrtProfileConsole, runOrtProfilePass, type ProfilableModel } from './ort-profile';

// ONNX Runtime binds the console when its WASM module initialises, so the
// profile capture of the `ort-profile` control kind must be in place before
// this worker first loads the runtime. Outside a capture every call reaches
// the console unchanged.
installOrtProfileConsole();

type Device = 'webgpu' | 'wasm';

/** Which build of the provider and Transformers.js the worker loads. */
type RuntimeSet = 'pinned' | 'current';

/**
 * The provider and Transformers.js modules of a runtime set: the pinned ones,
 * or the `current-releases` control kind's bundle (the provider source built
 * against the current Transformers.js release) with that release. The
 * provider and the module whose `env` is set must be one Transformers.js
 * instance, so both come from the same set.
 */
async function loadModules(runtime: RuntimeSet | undefined) {
  if (runtime === 'current') {
    const [mod, tjs] = await Promise.all([
      import('./current-releases/transformers.generated.js'),
      import('@huggingface/transformers-current'),
    ]);
    return { mod, tjs: tjs as unknown as typeof import('@huggingface/transformers') };
  }
  const [mod, tjs] = await Promise.all([import('@localmode/transformers'), import('@huggingface/transformers')]);
  return { mod, tjs };
}

/**
 * Lane settings a load may override. Absent fields keep the protocol's
 * configuration: the provider's dtype (`q4` for a language model, `fp32` for
 * an embedding model) and ONNX Runtime's own WASM thread count.
 */
export interface WorkerLaneSettings {
  /** Load the model's `q8` files (Transformers.js's default on the WASM device). */
  dtype?: 'q8';
  /** ONNX Runtime WASM thread count (`env.backends.onnx.wasm.numThreads`), set before the worker's first session. */
  numThreads?: number;
  /** Load the `current-releases` bundle instead of the pinned provider and Transformers.js. */
  runtime?: RuntimeSet;
}

/** A profiling pass request (the `ort-profile` control kind), run in a fresh worker. */
export interface WorkerProfilePass {
  cellId: string;
  request: { prompt: string; systemPrompt?: string; temperature?: number; maxTokens: number };
  warmupTokens: number;
  keepRaw: boolean;
}

/** Requests from the client. */
export type WorkerRequest =
  | { id: number; type: 'load'; kind: 'llm' | 'embedding'; modelId: string; device: Device; settings?: WorkerLaneSettings }
  | {
      id: number;
      type: 'stream';
      options: { prompt: string; systemPrompt?: string; maxTokens?: number; temperature?: number };
    }
  | { id: number; type: 'embed'; values: string[] }
  | { id: number; type: 'profile-pass'; modelId: string; device: Device; settings?: WorkerLaneSettings; pass: WorkerProfilePass }
  | { id: number; type: 'abort' }
  | { id: number; type: 'dispose' };

/** Responses to the client. */
export type WorkerResponse =
  | { id: number; type: 'progress'; pct?: number }
  | {
      id: number;
      type: 'loaded';
      dimensions?: number;
      /** The WASM thread count ONNX Runtime initialised with in this worker (read back after the first session). */
      numThreads?: number;
    }
  | {
      id: number;
      type: 'chunk';
      text: string;
      done: boolean;
      finishReason?: string;
      usage?: { inputTokens: number; outputTokens: number; totalTokens: number; durationMs: number };
    }
  | { id: number; type: 'embedded'; buffers: ArrayBuffer[] }
  | { id: number; type: 'profiled'; profile: OrtOperatorProfile; rawGzip?: ArrayBuffer }
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
        const { mod, tjs } = await loadModules(req.settings?.runtime);
        const controller = new AbortController();
        controllers.set(id, controller);
        const settings = req.settings ?? {};
        // The provider and this module share one Transformers.js instance, so
        // this is the ONNX Runtime env every session in this worker reads.
        // Each load runs in a fresh worker, so this precedes its first session.
        const wasmEnv = tjs.env.backends.onnx.wasm as { numThreads?: number; initTimeout?: number } | undefined;
        if (settings.numThreads !== undefined) {
          if (!wasmEnv) throw new Error('Transformers.js exposes no ONNX Runtime WASM env to set the thread count on');
          wasmEnv.numThreads = settings.numThreads;
        }
        const onProgress = (p: { progress?: number; loaded?: number; total?: number }) => {
          const pct =
            typeof p.progress === 'number'
              ? p.progress
              : typeof p.loaded === 'number' && typeof p.total === 'number' && p.total > 0
                ? (p.loaded / p.total) * 100
                : undefined;
          reply({ id, type: 'progress', pct });
        };
        if (req.kind === 'llm' && settings.dtype !== undefined) {
          // preloadModel loads a language model's q4 files whatever the device;
          // this does the same download plus throwaway session at the dtype asked for.
          mod.installResilientModelCache(tjs.env);
          const pipe = await tjs.pipeline('text-generation', req.modelId, {
            device: req.device,
            dtype: settings.dtype,
            progress_callback: onProgress,
          } as Record<string, unknown>);
          await (pipe as { dispose?: () => Promise<void> | void }).dispose?.();
        } else {
          await mod.preloadModel(req.modelId, {
            device: req.device,
            onProgress,
            ...(settings.dtype === 'q8' ? { quantized: true } : {}),
          });
        }
        controller.signal.throwIfAborted();
        // ONNX Runtime fills its flags (initTimeout among them) on the env it
        // initialises from; without them the thread count set above never
        // reached the runtime, and the lane would run on an unrecorded setting.
        const initialised = typeof wasmEnv?.initTimeout === 'number';
        if (settings.numThreads !== undefined && !initialised) {
          throw new Error('ONNX Runtime did not initialise from the Transformers.js env the thread count was set on');
        }
        const numThreads = initialised && typeof wasmEnv?.numThreads === 'number' ? wasmEnv.numThreads : undefined;
        await unloadModel();
        if (req.kind === 'llm') {
          model = mod.transformers.languageModel(req.modelId, {
            device: req.device,
            ...(settings.dtype !== undefined ? { dtype: settings.dtype } : {}),
          });
          reply({ id, type: 'loaded', numThreads });
        } else {
          const embedder = mod.transformers.embedding(req.modelId, {
            device: req.device,
            ...(settings.dtype === 'q8' ? { quantized: true } : {}),
          });
          model = embedder;
          reply({ id, type: 'loaded', dimensions: embedder.dimensions, numThreads });
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
      case 'profile-pass': {
        const { mod } = await loadModules(req.settings?.runtime);
        const settings = req.settings ?? {};
        const result = await runOrtProfilePass({
          cellId: req.pass.cellId,
          request: req.pass.request,
          warmupTokens: req.pass.warmupTokens,
          keepRaw: req.pass.keepRaw,
          createModel: () =>
            mod.transformers.languageModel(req.modelId, {
              device: req.device,
              ...(settings.dtype !== undefined ? { dtype: settings.dtype } : {}),
              sessionOptions: { enableProfiling: true },
            }) as unknown as ProfilableModel,
        });
        const rawGzip = result.rawJson !== undefined ? (await gzipText(result.rawJson)).buffer : undefined;
        reply({ id, type: 'profiled', profile: result.profile, ...(rawGzip ? { rawGzip } : {}) }, rawGzip ? [rawGzip] : undefined);
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
