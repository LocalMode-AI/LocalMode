'use client';

import { useState } from 'react';

import { ModelCatalogCard, type CatalogEntry } from './model-catalog-card';

const ENTRIES: CatalogEntry[] = [
  {
    id: 'llama-3.2-1b',
    name: 'Llama 3.2 1B Instruct',
    size: '1.2 GB',
    description: 'Compact instruction-tuned chat model with tool calling.',
    architecture: 'llama',
    parameters: '1.2B',
    quantization: 'Q4_K_M',
    contextLength: 8192,
    tools: true,
    reasoning: true,
  },
  {
    id: 'gemma-4-e2b',
    name: 'Gemma 4 E2B',
    size: '2.4 GB',
    description: 'Multimodal model with image understanding.',
    architecture: 'gemma',
    parameters: '2B',
    contextLength: 32768,
    vision: true,
    tools: true,
  },
];

/**
 * Demo for ModelCatalogCard. Renders two catalog tiles with capability badges
 * and a selected ring driven by local state.
 */
export default function ModelCatalogCardDemo() {
  const [selected, setSelected] = useState('llama-3.2-1b');
  return (
    <div className="flex flex-wrap gap-4">
      {ENTRIES.map((e) => (
        <ModelCatalogCard
          key={e.id}
          entry={e}
          selected={selected === e.id}
          onClick={setSelected}
        />
      ))}
    </div>
  );
}
