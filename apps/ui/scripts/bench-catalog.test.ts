/**
 * Drift guard: every BENCH_MODELS entry must exactly match its provider
 * catalog (id exists; sizeBytes, contextLength, url agree). The bench catalog
 * is intentionally static data (keeps provider runtimes out of the page
 * bundle) — this test is what makes that duplication safe.
 */

import { describe, expect, it } from 'vitest';
import { WEBLLM_MODELS } from '@localmode/webllm';
import { WLLAMA_MODELS } from '@localmode/wllama';
import { LITERT_MODELS } from '@localmode/litert';
import { TRANSFORMERS_LLM_MODELS } from '@localmode/transformers';
import { BENCH_MODELS, SUITE_MODELS } from '../src/lib/bench/catalog';

type CatalogEntry = {
  sizeBytes?: number;
  contextLength?: number;
  url?: string;
};

function providerEntry(runtimeId: string, providerModelId: string): CatalogEntry | undefined {
  switch (runtimeId) {
    case 'webllm':
      return (WEBLLM_MODELS as Record<string, CatalogEntry>)[providerModelId];
    case 'wllama':
      return (WLLAMA_MODELS as Record<string, CatalogEntry>)[providerModelId];
    case 'litert':
      return (LITERT_MODELS as Record<string, CatalogEntry>)[providerModelId];
    case 'transformers-webgpu':
    case 'transformers-wasm':
      return (TRANSFORMERS_LLM_MODELS as Record<string, CatalogEntry>)[providerModelId];
    default:
      return undefined;
  }
}

describe('bench catalog drift guard', () => {
  const catalogBacked = BENCH_MODELS.filter(
    (m) =>
      m.task === 'llm' &&
      m.runtimeId !== 'chrome-ai' &&
      m.runtimeId !== 'mediapipe',
  );

  it('covers the headline Qwen3 pairing across four runtimes', () => {
    const lanes = BENCH_MODELS.filter((m) => m.benchModelId === 'qwen3-0.6b').map(
      (m) => m.runtimeId,
    );
    expect(lanes.sort()).toEqual([
      'litert',
      'transformers-wasm',
      'transformers-webgpu',
      'webllm',
      'wllama',
    ]);
  });

  it.each(catalogBacked.map((m) => [m.runtimeId, m.providerModelId, m] as const))(
    '%s / %s matches the provider catalog',
    (runtimeId, providerModelId, model) => {
      const entry = providerEntry(runtimeId, providerModelId);
      expect(entry, `${providerModelId} missing from ${runtimeId} catalog`).toBeDefined();
      if (model.sizeBytes !== undefined) expect(entry!.sizeBytes).toBe(model.sizeBytes);
      if (model.contextLength !== undefined) expect(entry!.contextLength).toBe(model.contextLength);
      if (model.url !== undefined) expect(entry!.url).toBe(model.url);
    },
  );

  it('wllama embedding lane matches the provider catalog', () => {
    const bge = BENCH_MODELS.find(
      (m) => m.runtimeId === 'wllama' && m.task === 'embedding',
    )!;
    const entry = (WLLAMA_MODELS as Record<string, CatalogEntry>)[bge.providerModelId];
    expect(entry).toBeDefined();
    expect(entry.sizeBytes).toBe(bge.sizeBytes);
    expect(entry.url).toBe(bge.url);
  });

  it('every suite references only existing benchModelIds', () => {
    const known = new Set(BENCH_MODELS.map((m) => m.benchModelId));
    for (const ids of Object.values(SUITE_MODELS)) {
      for (const id of ids) expect(known.has(id), `unknown benchModelId ${id}`).toBe(true);
    }
  });

  it('quality prompt suffixes are uniform across every runtime of a pairing', () => {
    // Fidelity compares runtimes on identical inputs: a suffix on one lane of
    // a benchModelId must appear verbatim on every lane of that benchModelId.
    const byPairing = new Map<string, Set<string | undefined>>();
    for (const m of BENCH_MODELS.filter((m) => m.task === 'llm')) {
      (byPairing.get(m.benchModelId) ?? byPairing.set(m.benchModelId, new Set()).get(m.benchModelId)!)
        .add(m.qualityPromptSuffix);
    }
    for (const [id, suffixes] of byPairing) {
      expect(suffixes.size, `mixed qualityPromptSuffix on ${id}`).toBe(1);
    }
    // Qwen3 ships thinking-mode builds: the no-think suffix is load-bearing.
    expect(byPairing.get('qwen3-0.6b')).toEqual(new Set([' /no_think']));
  });
});
