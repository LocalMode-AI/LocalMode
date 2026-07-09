'use client';

import { VectorStorageObservability } from './vector-storage-observability';

/**
 * Demo for VectorStorageObservability. Renders a representative compression-stats
 * badge, a three-tier estimate with SQ8 active, and a WebGPU-accelerated latency
 * badge. Wire `stats` to getCompressionStats() and `searchLatencyMs` to real
 * search timing in your app.
 */
export default function VectorStorageObservabilityDemo() {
  return (
    <VectorStorageObservability
      stats={{
        ratio: 4.0,
        originalSizeBytes: 15_360,
        compressedSizeBytes: 3_840,
        vectorCount: 1_000,
      }}
      tier="sq8"
      searchLatencyMs={12}
      webgpuAccelerated
    />
  );
}
