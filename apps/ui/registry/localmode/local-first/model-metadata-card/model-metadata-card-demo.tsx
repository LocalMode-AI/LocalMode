'use client';

import { GGUFMetadataCard } from './model-metadata-card';

/**
 * Demo for GGUFMetadataCard. Renders a representative parsed GGUF metadata set;
 * absent optional fields are omitted from the grid.
 */
export default function ModelMetadataCardDemo() {
  return (
    <GGUFMetadataCard
      metadata={{
        architecture: 'llama',
        parameters: 1235814400,
        quantization: 'Q4_K_M',
        contextLength: 8192,
        embeddingDimension: 2048,
        vocabSize: 128256,
        headCount: 32,
        layerCount: 16,
        fileSizeBytes: 1_288_490_188,
        license: 'llama3.2',
      }}
    />
  );
}
