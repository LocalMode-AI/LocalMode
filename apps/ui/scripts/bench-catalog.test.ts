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
    case 'wllama-webgpu':
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
      'wllama-webgpu',
    ]);
  });

  it('the wllama-webgpu lane mirrors every wllama entry exactly, with WebGPU required', () => {
    // Protocol v3 splits llama.cpp into a CPU lane and a WebGPU lane over the
    // same GGUF files; the WebGPU lane is derived so the two cannot drift.
    const cpu = BENCH_MODELS.filter((m) => m.runtimeId === 'wllama');
    const gpu = BENCH_MODELS.filter((m) => m.runtimeId === 'wllama-webgpu');
    expect(gpu.map((m) => m.providerModelId)).toEqual(cpu.map((m) => m.providerModelId));
    for (const g of gpu) {
      const c = cpu.find((m) => m.providerModelId === g.providerModelId)!;
      expect(g.requiresWebGPU).toBe(true);
      expect(g.displayName).toContain('WebGPU');
      const { runtimeId: _r, displayName: _d, requiresWebGPU: _w, ...gRest } = g;
      const { runtimeId: _r2, displayName: _d2, requiresWebGPU: _w2, ...cRest } = c;
      expect(gRest).toEqual(cRest);
    }
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

  it('declared sizes match the files each lane downloads from Hugging Face (within 10%)', () => {
    // The declared size selects a cell's decode-rate envelope class at
    // validation and feeds the runner's download estimate, so it must be the
    // real download. Byte counts were read from the Hugging Face tree API
    // (2026-09-28) for exactly the files each provider fetches:
    //   Transformers.js 4.2.0, dtype q4 (the provider default): config.json,
    //     generation_config.json, tokenizer.json, tokenizer_config.json and
    //     the q4 decoder with its external data. Gemma 4 loads through
    //     Gemma4ForConditionalGeneration, which also creates the audio encoder
    //     (fp32: no dtype is given for it) and the fp16 vision encoder, plus
    //     processor_config.json and chat_template.jinja.
    //   WebLLM 0.2.83: mlc-chat-config.json, tensor-cache.json, every
    //     params_shard_*.bin and tokenizer.json (the model library .wasm, about
    //     5.6 MB, is not counted).
    //   LiteRT and llama.cpp: the single .litertlm / .gguf file.
    const VERIFIED_DOWNLOAD_BYTES: Record<string, number> = {
      'SmolLM2-135M-Instruct-q0f16-MLC': 271_206_869,
      'Qwen3-0.6B-q4f16_1-MLC': 346_926_408,
      'Llama-3.2-1B-Instruct-q4f16_1-MLC': 704_397_819,
      'onnx-community/Qwen3-0.6B-ONNX': 928_224_461,
      'onnx-community/Llama-3.2-1B-Instruct-ONNX': 1_704_451_656,
      'onnx-community/gemma-4-E2B-it-ONNX': 5_163_395_208,
      'qwen3-0.6B': 614_236_160,
      'gemma-4-E2B': 2_008_432_640,
      'SmolLM2-135M-Instruct-Q4_K_M': 105_454_432,
      'Qwen3-0.6B-Q4_K_M': 396_705_472,
      'Llama-3.2-1B-Instruct-Q4_K_M': 807_694_464,
      'Gemma-4-E2B-IT-Q4_K_M': 3_462_680_032,
      'bge-small-en-v1.5-Q8_0': 36_806_944,
    };
    const sized = BENCH_MODELS.filter((m) => m.sizeBytes !== undefined);
    expect(sized.length).toBeGreaterThan(0);
    for (const m of sized) {
      const verified = VERIFIED_DOWNLOAD_BYTES[m.providerModelId];
      expect(verified, `${m.runtimeId} / ${m.providerModelId} has no verified size`).toBeDefined();
      const drift = Math.abs(m.sizeBytes! - verified) / verified;
      expect(
        drift,
        `${m.runtimeId} / ${m.providerModelId} declares ${m.sizeBytes}, downloads ${verified}`,
      ).toBeLessThanOrEqual(0.1);
    }
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
