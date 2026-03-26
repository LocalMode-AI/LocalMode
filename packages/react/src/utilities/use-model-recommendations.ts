/**
 * @file use-model-recommendations.ts
 * @description Hook for getting model recommendations based on device capabilities
 */

import { useState, useEffect, useRef, useCallback } from 'react';

const IS_SERVER = typeof window === 'undefined';

/**
 * Options for the {@link useModelRecommendations} hook.
 *
 * Mirrors {@link RecommendationOptions} from `@localmode/core`.
 */
export interface UseModelRecommendationsOptions {
  /** Required task category to filter by */
  readonly task:
    | 'embedding'
    | 'classification'
    | 'zero-shot'
    | 'ner'
    | 'reranking'
    | 'generation'
    | 'translation'
    | 'summarization'
    | 'fill-mask'
    | 'question-answering'
    | 'speech-to-text'
    | 'text-to-speech'
    | 'image-classification'
    | 'image-captioning'
    | 'object-detection'
    | 'segmentation'
    | 'ocr'
    | 'document-qa'
    | 'image-features'
    | 'image-to-image'
    | 'multimodal-embedding';

  /** Optional maximum model download size in MB */
  readonly maxSizeMB?: number;

  /** Optional maximum memory requirement in MB */
  readonly maxMemoryMB?: number;

  /** Optional list of provider names to include */
  readonly providers?: string[];

  /** Optional flag to only include models that recommend WebGPU */
  readonly requireWebGPU?: boolean;

  /** Maximum number of recommendations to return (default: 5) */
  readonly limit?: number;
}

/**
 * Return type for the {@link useModelRecommendations} hook.
 */
export interface UseModelRecommendationsReturn {
  /** Ranked model recommendations (empty array when loading or on error) */
  recommendations: ReadonlyArray<{
    readonly entry: {
      readonly modelId: string;
      readonly provider: string;
      readonly task: string;
      readonly name: string;
      readonly sizeMB: number;
      readonly minMemoryMB?: number;
      readonly dimensions?: number;
      readonly recommendedDevice: 'webgpu' | 'wasm' | 'cpu';
      readonly speedTier: 'fast' | 'medium' | 'slow';
      readonly qualityTier: 'low' | 'medium' | 'high';
      readonly description?: string;
    };
    readonly score: number;
    readonly reasons: string[];
  }>;

  /** Detected device capabilities (null during SSR or before detection). Shape matches DeviceCapabilities from @localmode/core. */
  capabilities: {
    readonly browser?: { name: string; version: string };
    readonly device?: { type: string; platform: string };
    readonly hardware?: { cores: number; memory?: number; gpu?: string };
    readonly features?: Record<string, boolean>;
    readonly storage?: { quota: number; usage: number; available: number; persisted: boolean };
    [key: string]: unknown;
  } | null;

  /** True while detection is in progress */
  isLoading: boolean;

  /** Error state */
  error: { message: string } | null;

  /** Re-trigger detection and recommendation computation */
  refresh: () => void;
}

/** Noop function used for SSR */
const noop = () => {};

/**
 * Hook for getting model recommendations based on device capabilities.
 *
 * Runs `detectCapabilities()` on mount (client-side only, skipped during SSR)
 * then passes the result to `recommendModels()` with the provided options.
 *
 * @param options - Recommendation options (task, constraints)
 * @returns Recommendations, capabilities, loading state, error, and refresh function
 *
 * @example
 * ```tsx
 * import { useModelRecommendations } from '@localmode/react';
 *
 * function ModelPicker() {
 *   const { recommendations, isLoading } = useModelRecommendations({
 *     task: 'embedding',
 *     limit: 3,
 *   });
 *
 *   if (isLoading) return <p>Detecting device...</p>;
 *
 *   return (
 *     <ul>
 *       {recommendations.map((rec) => (
 *         <li key={rec.entry.modelId}>
 *           {rec.entry.name} — score: {rec.score}
 *         </li>
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 */
export function useModelRecommendations(
  options: UseModelRecommendationsOptions,
): UseModelRecommendationsReturn {
  const [recommendations, setRecommendations] = useState<UseModelRecommendationsReturn['recommendations']>([]);
  const [capabilities, setCapabilities] = useState<Record<string, unknown> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<{ message: string } | null>(null);
  const mountedRef = useRef(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (IS_SERVER) return;

    setIsLoading(true);
    setError(null);

    import('@localmode/core')
      .then(async ({ detectCapabilities, recommendModels }) => {
        const caps = await detectCapabilities();
        if (!mountedRef.current) return;

        const recs = recommendModels(caps, {
          task: options.task,
          maxSizeMB: options.maxSizeMB,
          maxMemoryMB: options.maxMemoryMB,
          providers: options.providers,
          requireWebGPU: options.requireWebGPU,
          limit: options.limit,
        });

        if (mountedRef.current) {
          setCapabilities(caps as unknown as Record<string, unknown>);
          setRecommendations(recs);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (mountedRef.current) {
          setError({
            message: err instanceof Error ? err.message : 'Failed to detect capabilities',
          });
          setRecommendations([]);
          setIsLoading(false);
        }
      });
  }, [
    refreshKey,
    options.task,
    options.maxSizeMB,
    options.maxMemoryMB,
    options.requireWebGPU,
    options.limit,
    // providers is an array — serialize for dependency comparison
    options.providers?.join(','),
  ]);

  if (IS_SERVER) {
    return {
      recommendations: [],
      capabilities: null,
      isLoading: false,
      error: null,
      refresh: noop,
    };
  }

  return { recommendations, capabilities, isLoading, error, refresh };
}
