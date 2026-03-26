/**
 * Model Recommendation Engine
 *
 * Synchronous function that ranks models from the registry against
 * device capabilities, producing scored recommendations with reasons.
 *
 * @packageDocumentation
 */

import type {
  DeviceCapabilities,
  ModelRegistryEntry,
  ModelRecommendation,
  RecommendationOptions,
} from './types.js';
import { getModelRegistry } from './model-registry.js';

// ============================================================================
// Scoring Constants
// ============================================================================

/** Weight for device fit in the composite score */
const DEVICE_FIT_WEIGHT = 0.5;

/** Weight for quality tier in the composite score */
const QUALITY_WEIGHT = 0.3;

/** Weight for speed tier in the composite score */
const SPEED_WEIGHT = 0.2;

/** Quality tier numeric values (0-100 scale) */
const QUALITY_SCORES: Record<string, number> = {
  high: 100,
  medium: 60,
  low: 30,
};

/** Speed tier numeric values (0-100 scale) */
const SPEED_SCORES: Record<string, number> = {
  fast: 100,
  medium: 60,
  slow: 30,
};

/** Default maximum number of recommendations */
const DEFAULT_LIMIT = 5;

// ============================================================================
// recommendModels()
// ============================================================================

/**
 * Recommend models from the registry based on device capabilities.
 *
 * This is a **synchronous** pure function. Call {@link detectCapabilities}
 * first (async) and pass the result here.
 *
 * The function filters the registry to models matching the requested task,
 * applies optional constraints (size, memory, provider, WebGPU), excludes
 * models that exceed available storage or device memory, scores remaining
 * candidates, and returns up to `limit` results sorted by score descending.
 *
 * @param capabilities - Pre-detected device capabilities from `detectCapabilities()`
 * @param options - Filtering and ranking options
 * @returns Ranked array of model recommendations (may be empty)
 *
 * @example
 * ```typescript
 * import { detectCapabilities, recommendModels } from '@localmode/core';
 *
 * const caps = await detectCapabilities();
 * const recs = recommendModels(caps, { task: 'embedding' });
 *
 * for (const rec of recs) {
 *   console.log(`${rec.entry.name} — score: ${rec.score}`);
 *   console.log(`  Reasons: ${rec.reasons.join(', ')}`);
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Filter by provider and size
 * const recs = recommendModels(caps, {
 *   task: 'generation',
 *   providers: ['webllm'],
 *   maxSizeMB: 1000,
 *   limit: 3,
 * });
 * ```
 */
export function recommendModels(
  capabilities: DeviceCapabilities,
  options: RecommendationOptions,
): ModelRecommendation[] {
  const { task, maxSizeMB, maxMemoryMB, providers, requireWebGPU, limit = DEFAULT_LIMIT } = options;
  const registry = getModelRegistry();

  // Derived device values
  const availableStorageMB = capabilities.storage.availableBytes / (1024 * 1024);
  const deviceMemoryMB = capabilities.hardware.memory
    ? capabilities.hardware.memory * 1024
    : undefined;
  const hasWebGPU = capabilities.features.webgpu;
  const isMobile = capabilities.device.type === 'mobile';

  // Step 1-2: Filter by task and optional constraints
  const candidates = registry.filter((entry) => {
    // Must match task
    if (entry.task !== task) return false;

    // Apply maxSizeMB constraint
    if (maxSizeMB !== undefined && entry.sizeMB > maxSizeMB) return false;

    // Apply maxMemoryMB constraint
    if (maxMemoryMB !== undefined && entry.minMemoryMB !== undefined && entry.minMemoryMB > maxMemoryMB) return false;

    // Apply providers filter
    if (providers !== undefined && providers.length > 0 && !providers.includes(entry.provider)) return false;

    // Apply requireWebGPU filter
    if (requireWebGPU === true && entry.recommendedDevice !== 'webgpu') return false;

    // Step 3: Exclude models exceeding available storage
    if (entry.sizeMB > availableStorageMB) return false;

    // Step 4: Exclude models exceeding device memory (when known)
    if (
      deviceMemoryMB !== undefined &&
      entry.minMemoryMB !== undefined &&
      entry.minMemoryMB > deviceMemoryMB
    ) {
      return false;
    }

    return true;
  });

  // Step 5-6: Score and generate reasons for each candidate
  const scored: ModelRecommendation[] = candidates.map((entry) => {
    const { score, reasons } = scoreModel(entry, {
      availableStorageMB,
      deviceMemoryMB,
      hasWebGPU,
      isMobile,
    });
    return { entry, score, reasons };
  });

  // Step 7: Sort by score descending, limit results
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

// ============================================================================
// Scoring Implementation
// ============================================================================

interface ScoringContext {
  availableStorageMB: number;
  deviceMemoryMB: number | undefined;
  hasWebGPU: boolean;
  isMobile: boolean;
}

/**
 * Score a single model entry against device context.
 * Returns a score (0-100) and human-readable reasons.
 */
function scoreModel(
  entry: ModelRegistryEntry,
  ctx: ScoringContext,
): { score: number; reasons: string[] } {
  const reasons: string[] = [];

  // --- Device Fit (0-100) ---
  let deviceFit = 0;

  // Storage headroom: smaller fraction of available = better
  const storageFraction = entry.sizeMB / ctx.availableStorageMB;
  if (storageFraction <= 0.1) {
    deviceFit += 40;
    reasons.push(
      `Fits within available storage (${entry.sizeMB} MB of ${Math.round(ctx.availableStorageMB)} MB)`,
    );
  } else if (storageFraction <= 0.3) {
    deviceFit += 30;
    reasons.push(
      `Fits within available storage (${entry.sizeMB} MB of ${Math.round(ctx.availableStorageMB)} MB)`,
    );
  } else if (storageFraction <= 0.6) {
    deviceFit += 20;
    reasons.push(
      `Fits within available storage (${entry.sizeMB} MB of ${Math.round(ctx.availableStorageMB)} MB)`,
    );
  } else {
    deviceFit += 10;
    reasons.push(
      `Fits but uses most available storage (${entry.sizeMB} MB of ${Math.round(ctx.availableStorageMB)} MB)`,
    );
  }

  // Memory headroom (when known)
  if (ctx.deviceMemoryMB !== undefined && entry.minMemoryMB !== undefined) {
    const memoryFraction = entry.minMemoryMB / ctx.deviceMemoryMB;
    if (memoryFraction <= 0.25) {
      deviceFit += 30;
    } else if (memoryFraction <= 0.5) {
      deviceFit += 20;
    } else {
      deviceFit += 10;
    }
  } else {
    // Memory unknown or not specified — give neutral score
    deviceFit += 15;
  }

  // Device match: model's recommended device matches available features
  if (entry.recommendedDevice === 'webgpu') {
    if (ctx.hasWebGPU) {
      deviceFit += 30;
      reasons.push('WebGPU available for GPU acceleration');
    } else {
      // WebGPU recommended but not available — penalize but don't exclude
      deviceFit += 5;
      reasons.push('WebGPU recommended but not available, may run slower via WASM fallback');
    }
  } else if (entry.recommendedDevice === 'wasm') {
    deviceFit += 25;
    reasons.push('WASM device, universally compatible');
  } else {
    // cpu
    deviceFit += 20;
    reasons.push('CPU device, no special hardware required');
  }

  // Cap device fit at 100
  deviceFit = Math.min(100, deviceFit);

  // --- Quality Tier (0-100) ---
  const qualityScore = QUALITY_SCORES[entry.qualityTier] ?? 50;
  if (entry.qualityTier === 'high') {
    reasons.push('High quality model');
  } else if (entry.qualityTier === 'medium') {
    reasons.push('Medium quality model');
  }

  // --- Speed Tier (0-100) ---
  // On mobile/low-end devices, fast models get a bonus
  let speedScore = SPEED_SCORES[entry.speedTier] ?? 50;
  if (ctx.isMobile && entry.speedTier === 'fast') {
    speedScore = 100;
    reasons.push('Compact model suitable for mobile device');
  }

  // --- Composite Score ---
  const score = Math.round(
    DEVICE_FIT_WEIGHT * deviceFit +
    QUALITY_WEIGHT * qualityScore +
    SPEED_WEIGHT * speedScore,
  );

  // Ensure score is in [0, 100]
  return { score: Math.max(0, Math.min(100, score)), reasons };
}
