/**
 * @file render-hook-with-mocks.ts
 * @description Testing helper for @localmode/react hooks with mock models
 */

import { renderHook } from '@testing-library/react';
import type { RenderHookOptions, RenderHookResult } from '@testing-library/react';

/**
 * Render a hook with @testing-library/react, pre-configured for @localmode/react testing.
 * This is a convenience wrapper — use createMockEmbeddingModel() etc. from @localmode/core/testing
 * to create mock models for your hook options.
 *
 * @param hook - The hook function to render
 * @param options - Optional renderHook configuration
 * @returns The renderHook result
 *
 * @example
 * ```ts
 * import { renderHookWithMocks } from '@localmode/react/testing';
 * import { useEmbed } from '@localmode/react';
 * import { createMockEmbeddingModel } from '@localmode/core/testing';
 *
 * const { result } = renderHookWithMocks(() =>
 *   useEmbed({ model: createMockEmbeddingModel() })
 * );
 * ```
 */
export function renderHookWithMocks<TResult>(
  hook: () => TResult,
  options?: RenderHookOptions<unknown>
): RenderHookResult<TResult, unknown> {
  return renderHook(hook, options);
}
