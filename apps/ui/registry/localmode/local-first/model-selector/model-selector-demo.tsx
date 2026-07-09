'use client';

import { useState } from 'react';
import { useCapabilities } from '@localmode/react';

import { ModelSelector, type SelectableModel } from './model-selector';

const FULL_MODELS: SelectableModel[] = [
  { id: 'llama-3.2-1b', name: 'Llama 3.2 1B', backend: 'webgpu', category: 'Chat', size: '1.2 GB', tools: true, cached: true },
  { id: 'qwen3-0.6b', name: 'Qwen3 0.6B', backend: 'litert', category: 'Chat', size: '0.6 GB', tools: true },
  { id: 'gemma-4-e2b', name: 'Gemma 4 E2B', backend: 'webgpu', category: 'Vision', size: '2.4 GB', vision: true },
  { id: 'bge-small', name: 'bge-small-en-v1.5', backend: 'onnx', category: 'Embedding', size: '34 MB', cached: true },
  { id: 'whisper-base', name: 'Whisper Base', backend: 'wasm', category: 'Speech', size: '74 MB' },
];

// A single-backend CLIP catalog — the selector hides the backend-filter row
// entirely instead of showing three disabled zero-count chips.
const CLIP_MODELS: SelectableModel[] = [
  { id: 'clip-vit', name: 'CLIP ViT-B/32', backend: 'onnx', category: 'Multimodal', size: '340 MB', cached: true },
  { id: 'siglip', name: 'SigLIP Base', backend: 'onnx', category: 'Multimodal', size: '812 MB' },
];

/**
 * Demo for ModelSelector. Reads real WebGPU support from useCapabilities so the
 * WebGPU-only models de-emphasize on devices without it (their "Requires WebGPU"
 * reason stays at full contrast). The catalog toggle shows how a single-backend
 * catalog auto-hides the filter row. Selection + callbacks are wired to local
 * state; no model is actually downloaded or deleted here.
 */
export default function ModelSelectorDemo() {
  const { capabilities } = useCapabilities();
  const [catalog, setCatalog] = useState<'full' | 'clip'>('full');
  const [selectedId, setSelectedId] = useState('bge-small');
  const [lastAction, setLastAction] = useState<string | null>(null);

  const models = catalog === 'full' ? FULL_MODELS : CLIP_MODELS;

  return (
    <div className="flex flex-col gap-2">
      <div
        role="group"
        aria-label="Catalog"
        className="inline-flex w-fit rounded-lg border border-border bg-muted p-1 text-sm"
      >
        <button
          type="button"
          aria-pressed={catalog === 'full'}
          onClick={() => {
            setCatalog('full');
            setSelectedId('bge-small');
          }}
          className={catalog === 'full' ? 'rounded-md bg-background px-3 py-1 font-medium shadow-sm' : 'px-3 py-1 text-muted-foreground'}
        >
          Multi-backend
        </button>
        <button
          type="button"
          aria-pressed={catalog === 'clip'}
          onClick={() => {
            setCatalog('clip');
            setSelectedId('clip-vit');
          }}
          className={catalog === 'clip' ? 'rounded-md bg-background px-3 py-1 font-medium shadow-sm' : 'px-3 py-1 text-muted-foreground'}
        >
          CLIP (single backend)
        </button>
      </div>

      <ModelSelector
        models={models}
        selectedId={selectedId}
        hasWebGPU={Boolean(capabilities?.features.webgpu)}
        onSelect={(id) => {
          setSelectedId(id);
          setLastAction(`selected ${id}`);
        }}
        onDownload={(id) => setLastAction(`download ${id}`)}
        onDelete={(id) => setLastAction(`delete ${id}`)}
      />
      {lastAction && (
        <p className="text-xs text-muted-foreground">Last action: {lastAction}</p>
      )}
    </div>
  );
}
