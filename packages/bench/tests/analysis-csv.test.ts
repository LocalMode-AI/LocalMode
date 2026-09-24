/**
 * Analysis CSV exports: the additive columns of iterations.csv and the
 * per-cell (cells.csv) and per-run (runs.csv) files. Legacy columns are
 * checked against the output the exporters produced before these columns
 * existed, captured verbatim from the same fixtures.
 */

import { describe, expect, it } from 'vitest';
import {
  aggregateRuns,
  rowsToCSV,
  runsToCellsCSV,
  runsToLongCSV,
  runsToRunsCSV,
  runtimeVersionColumn,
  summarizeCell,
  validateSubmission,
  type BenchCellResult,
  type LLMIteration,
} from '../src/index.js';
import { LLAMA_CELL, makeAnalysisRun, makeSecondAnalysisRun } from './fixtures/analysis-runs.js';
import { LITERT_BURST_ITERATION } from './fixtures/litert-burst-iteration.js';

// Output of runsToLongCSV / rowsToCSV for [makeAnalysisRun(), makeSecondAnalysisRun()]
// before the additive columns were introduced.
const LEGACY_ITERATIONS_CSV = [
  'runId,createdAt,protocol,suite,deviceClass,deviceSubclass,browser,browserVersion,os,gpuVendor,gpuArchitecture,cores,deviceMemoryGB,crossOriginIsolated,fingerprintMflops,runtimeId,runtimeVersion,benchModelId,providerModelId,quantization,sizeBytes,workloadId,resolvedBackend,iteration,ttftMs,decodeCharsPerSec,generatedChars,overallCharsPerSec,streamIncremental,durationMs,loadMs,loadCached,status',
  'analysis-run-0001,2026-09-22T10:00:00.000Z,localmode-bench/5,thorough,macos/apple-metal-3,macos/apple-m1-pro,Google Chrome,145.0.7632.159,macOS,apple,metal-3,10,8,true,1234.57,wllama,3.5.1,qwen3-0.6b,unsloth/Qwen3-0.6B-GGUF:Qwen3-0.6B-Q4_K_M.gguf,Q4_K_M,462000000,chat-pp128-tg128,wasm,1,100,97.83,49,85.96,true,570,2500.5,false,ok',
  'analysis-run-0001,2026-09-22T10:00:00.000Z,localmode-bench/5,thorough,macos/apple-metal-3,macos/apple-m1-pro,Google Chrome,145.0.7632.159,macOS,apple,metal-3,10,8,true,1234.57,wllama,3.5.1,qwen3-0.6b,unsloth/Qwen3-0.6B-GGUF:Qwen3-0.6B-Q4_K_M.gguf,Q4_K_M,462000000,chat-pp128-tg128,wasm,2,100,97.83,49,85.96,true,570,2500.5,false,ok',
  'analysis-run-0001,2026-09-22T10:00:00.000Z,localmode-bench/5,thorough,macos/apple-metal-3,macos/apple-m1-pro,Google Chrome,145.0.7632.159,macOS,apple,metal-3,10,8,true,1234.57,transformers-wasm,4.2.0,bge-small-en,Xenova/bge-small-en-v1.5,,,embed-batch32,wasm,1,,,,,,1000,150,true,ok',
  'analysis-run-0001,2026-09-22T10:00:00.000Z,localmode-bench/5,thorough,macos/apple-metal-3,macos/apple-m1-pro,Google Chrome,145.0.7632.159,macOS,apple,metal-3,10,8,true,1234.57,transformers-wasm,4.2.0,bge-small-en,Xenova/bge-small-en-v1.5,,,embed-batch32,wasm,2,,,,,,1000,150,true,ok',
  'analysis-run-0001,2026-09-22T10:00:00.000Z,localmode-bench/5,thorough,macos/apple-metal-3,macos/apple-m1-pro,Google Chrome,145.0.7632.159,macOS,apple,metal-3,10,8,true,1234.57,transformers-wasm,4.2.0,bge-small-en,Xenova/bge-small-en-v1.5,,,quality-sts-100,wasm,,,,,,,,,,ok',
  'analysis-run-0001,2026-09-22T10:00:00.000Z,localmode-bench/5,thorough,macos/apple-metal-3,macos/apple-m1-pro,Google Chrome,145.0.7632.159,macOS,apple,metal-3,10,8,true,1234.57,wllama,3.5.1,gemma-4-e2b,unsloth/gemma-4-E2B-it-GGUF:gemma-4-E2B-it-Q4_K_M.gguf,,,quality-mmlu-25,wasm,,,,,,,,,,error',
  'analysis-run-0001,2026-09-22T10:00:00.000Z,localmode-bench/5,thorough,macos/apple-metal-3,macos/apple-m1-pro,Google Chrome,145.0.7632.159,macOS,apple,metal-3,10,8,true,1234.57,chrome-ai,,gemini-nano,chrome-ai:gemini-nano,,,chat-pp128-tg128,unknown,,,,,,,,,,skipped',
  'analysis-run-0001,2026-09-22T10:00:00.000Z,localmode-bench/5,thorough,macos/apple-metal-3,macos/apple-m1-pro,Google Chrome,145.0.7632.159,macOS,apple,metal-3,10,8,true,1234.57,litert,0.12.1,qwen3-0.6b,qwen3-0.6b,,614000000,chat-pp128-tg128,webgpu,1,,,613,20.36,false,30107.84,1000,true,invalid',
  'analysis-run-0002,2026-09-21T08:30:00.000Z,localmode-bench/4,quick,macos/no-webgpu,macos/no-webgpu,Safari,26.5.2,macOS,,,8,,true,,transformers-wasm,4.2.0,bge-small-en,Xenova/bge-small-en-v1.5,,,embed-batch32,wasm,1,,,,,,1000,150,true,ok',
  'analysis-run-0002,2026-09-21T08:30:00.000Z,localmode-bench/4,quick,macos/no-webgpu,macos/no-webgpu,Safari,26.5.2,macOS,,,8,,true,,transformers-wasm,4.2.0,bge-small-en,Xenova/bge-small-en-v1.5,,,embed-batch32,wasm,2,,,,,,1000,150,true,ok',
];

const LEGACY_LEADERBOARD_CSV = [
  'protocol,deviceClass,deviceSubclass,runtimeId,benchModelId,modelName,workloadId,submissions,ttftMs,decodeCharsPerSec,overallCharsPerSec,singleLatencyMs,batchTextsPerSec,loadColdMs,loadWarmMs,qualityScore,qualityParseRate,resolvedBackends,browsers,highVariance,provisional',
  'localmode-bench/5,macos/apple-metal-3,macos/apple-m1-pro,transformers-wasm,bge-small-en,"BGE Small EN (ONNX, WASM)",embed-batch32,1,,,,,32,,150,,,wasm,Google Chrome,false,true',
  'localmode-bench/5,macos/apple-metal-3,macos/apple-m1-pro,transformers-wasm,bge-small-en,"BGE Small EN (ONNX, WASM)",quality-sts-100,1,,,,,,,,0.81,,wasm,Google Chrome,false,true',
  'localmode-bench/5,macos/apple-metal-3,macos/apple-m1-pro,wllama,qwen3-0.6b,"Qwen3 0.6B (GGUF, CPU)",chat-pp128-tg128,1,100,97.83,85.96,,,2500.5,,,,wasm,Google Chrome,false,true',
  'localmode-bench/4,macos/no-webgpu,macos/no-webgpu,transformers-wasm,bge-small-en,"BGE Small EN (ONNX, WASM)",embed-batch32,1,,,,,32,,150,,,wasm,Safari,false,true',
];

const runs = () => [makeAnalysisRun(), makeSecondAnalysisRun()];
const lines = (csv: string) => csv.replace(/\n$/, '').split('\n');

describe('legacy columns stay byte-identical', () => {
  it('leaderboard.csv is unchanged', () => {
    expect(lines(rowsToCSV(aggregateRuns(runs())))).toEqual(LEGACY_LEADERBOARD_CSV);
  });

  it('iterations.csv keeps the old header and every old field as a prefix, row for row', () => {
    const out = lines(runsToLongCSV(runs()));
    expect(out).toHaveLength(LEGACY_ITERATIONS_CSV.length);
    out.forEach((line, i) => {
      expect(line.startsWith(`${LEGACY_ITERATIONS_CSV[i]},`)).toBe(true);
    });
  });
});

describe('iterations.csv additive columns', () => {
  const NEW_COLUMNS = [
    'cellId', 'chunkCount', 'generatedTokensApprox', 'generatedTokensFidelity', 'tokensPerSecApprox',
    'finishReason', 'gates', 'embedCount',
  ];

  it('appends the new columns after the legacy header', () => {
    expect(lines(runsToLongCSV(runs()))[0]).toBe(`${LEGACY_ITERATIONS_CSV[0]},${NEW_COLUMNS.join(',')}`);
  });

  it('carries the exact per-iteration values for every cell shape', () => {
    const out = lines(runsToLongCSV(runs()));
    const tail = (i: number) => out[i].slice(LEGACY_ITERATIONS_CSV[i].length + 1);
    // llama.cpp, coherent: 11 chunks, 10 after the first over 460 ms.
    expect(tail(1)).toBe('wllama/qwen3-0.6b/chat-pp128-tg128,11,10,estimated,21.74,length,,');
    expect(tail(2)).toBe('wllama/qwen3-0.6b/chat-pp128-tg128,11,9,estimated,21.74,stop,,');
    // Embedding iterations: no stream fields, the batch size.
    expect(tail(3)).toBe('transformers-wasm/bge-small-en/embed-batch32,,,,,,,32');
    expect(tail(4)).toBe('transformers-wasm/bge-small-en/embed-batch32,,,,,,,32');
    // Cells without timed iterations keep their single placeholder row.
    expect(tail(5)).toBe('transformers-wasm/bge-small-en/quality-sts-100,,,,,,,');
    expect(tail(6)).toBe('wllama/gemma-4-e2b/quality-mmlu-25,,,,,,,');
    expect(tail(7)).toBe('chrome-ai/gemini-nano/chat-pp128-tg128,,,,,,,');
    // Terminal-burst trace: chunk count kept, no tok/s, gates joined with |.
    expect(tail(8)).toBe('litert/qwen3-0.6b/chat-pp128-tg128,128,,,,stop,started-hidden|hidden-during-run,');
    expect(tail(10)).toBe('transformers-wasm/bge-small-en/embed-batch32,,,,,,,32');
  });

  it('tokensPerSecApprox is the per-iteration decode chunk rate whose median the cell summary reports', () => {
    const summary = summarizeCell(LLAMA_CELL);
    expect(summary.streamIncremental).toBe(true);
    expect(summary.decodeChunksPerSec?.median).toBeCloseTo(10 / 0.46, 9);
    expect(Math.round(summary.decodeChunksPerSec!.median * 100) / 100).toBe(21.74);
  });

  it('leaves tokensPerSecApprox empty for every iteration of a cell that fails the coherence gate', () => {
    // One coherent iteration and one terminal burst: the cell summary derives
    // no decode metric at all, so no iteration may carry a tok/s value.
    const mixed: BenchCellResult = {
      ...LLAMA_CELL,
      cellId: 'wllama/qwen3-0.6b/chat-pp512-tg128',
      workloadId: 'chat-pp512-tg128',
      iterations: [LLAMA_CELL.iterations[0] as LLMIteration, LITERT_BURST_ITERATION],
    };
    expect(summarizeCell(mixed).streamIncremental).toBe(false);
    expect(summarizeCell(mixed).decodeChunksPerSec).toBeUndefined();
    const run = { ...makeAnalysisRun(), cells: [mixed] };
    const out = lines(runsToLongCSV([run]));
    const header = out[0].split(',');
    const at = (row: number, col: string) => out[row].split(',')[header.indexOf(col)];
    expect(out).toHaveLength(3);
    expect(at(1, 'tokensPerSecApprox')).toBe('');
    expect(at(2, 'tokensPerSecApprox')).toBe('');
    expect(at(1, 'chunkCount')).toBe('11');
    expect(at(2, 'chunkCount')).toBe('128');
    // The legacy per-iteration decode column is untouched by the cell-level rule.
    expect(at(1, 'decodeCharsPerSec')).toBe('97.83');
    // The burst iteration has no provider usage: empty, not zero.
    expect(at(2, 'generatedTokensApprox')).toBe('');
    expect(at(2, 'generatedTokensFidelity')).toBe('');
  });
});

describe('cells.csv', () => {
  const HEADER = [
    'runId', 'protocol', 'cellId', 'runtimeId', 'runtimeVersion', 'benchModelId', 'workloadId', 'workloadKind',
    'resolvedBackend', 'status', 'invalidReasons', 'iterationCount', 'discardedIterationCount', 'attemptCount',
    'warmupMs', 'loadMs', 'loadCached', 'loadDeclaredBytes', 'loadProgressEvents', 'loadProgressSpanMs',
    'n_threads', 'n_threads_used', 'multithread', 'n_ctx', 'n_gpu_layers', 'offloadedLayers', 'webgpu_adapter',
    'cache_prompt', 'mmproj', 'dtype', 'device', 'worker',
    'memoryBaseline', 'memoryPostLoad', 'memoryPostRun', 'memoryAtError', 'memoryApi',
    'qualityTaskId', 'qualityScore', 'qualityN', 'qualityParseRate', 'errorName', 'errorMessage', 'errorCause',
  ].join(',');

  it('emits one row per cell, in run then cell order, with exact values', () => {
    expect(lines(runsToCellsCSV(runs()))).toEqual([
      HEADER,
      'analysis-run-0001,localmode-bench/5,wllama/qwen3-0.6b/chat-pp128-tg128,wllama,3.5.1,qwen3-0.6b,chat-pp128-tg128,llm-generate,wasm,ok,,2,0,0,' +
        '333.33,2500.5,false,462000000,3,2400.25,' +
        '5,5,true,2048,0,0/29,true,false,false,,,,' +
        '10000000,600000000,610000000,,uaSpecific,' +
        ',,,,,,',
      'analysis-run-0001,localmode-bench/5,transformers-wasm/bge-small-en/embed-batch32,transformers-wasm,4.2.0,bge-small-en,embed-batch32,embed-batch,wasm,ok,,2,0,0,' +
        '42.5,150,true,,,,' +
        ',,,,,,,,,fp32,wasm,true,' +
        '50000000,80000000,81000000,,legacyHeap,' +
        ',,,,,,',
      'analysis-run-0001,localmode-bench/5,transformers-wasm/bge-small-en/quality-sts-100,transformers-wasm,4.2.0,bge-small-en,quality-sts-100,quality-sts,wasm,ok,,0,0,1,' +
        ',,,,,,' +
        ',,,,,,,,,,,,' +
        ',,,,,' +
        'stsb-100,0.8123,100,,,,',
      'analysis-run-0001,localmode-bench/5,wllama/gemma-4-e2b/quality-mmlu-25,wllama,3.5.1,gemma-4-e2b,quality-mmlu-25,quality-mmlu,wasm,error,,0,0,0,' +
        ',,,,,,' +
        '5,5,true,2048,0,0/36,true,false,false,,,,' +
        '10983134,3943637029,,3943800639,uaSpecific,' +
        ',,,,Error,quality lane failed,std::bad_alloc',
      'analysis-run-0001,localmode-bench/5,chrome-ai/gemini-nano/chat-pp128-tg128,chrome-ai,,gemini-nano,chat-pp128-tg128,llm-generate,unknown,skipped,runtime unavailable: Prompt API not supported,0,0,0,' +
        ',,,,,,' +
        ',,,,,,,,,,,,' +
        ',,,,,' +
        ',,,,,,',
      'analysis-run-0001,localmode-bench/5,litert/qwen3-0.6b/chat-pp128-tg128,litert,0.12.1,qwen3-0.6b,chat-pp128-tg128,llm-generate,webgpu,invalid,timed iteration overlapped a hidden tab|second reason,1,0,0,' +
        ',1000,true,,0,,' +
        ',,,,,,,,,,,,' +
        ',,,,,' +
        ',,,,,,',
      'analysis-run-0002,localmode-bench/4,transformers-wasm/bge-small-en/embed-batch32,transformers-wasm,4.2.0,bge-small-en,embed-batch32,embed-batch,wasm,ok,,2,0,0,' +
        '42.5,150,true,,,,' +
        ',,,,,,,,,fp32,wasm,true,' +
        '50000000,80000000,81000000,,legacyHeap,' +
        ',,,,,,',
    ]);
  });

  it('writes an unknown cache probe as empty, and a single progress event as a zero span', () => {
    const run = makeAnalysisRun();
    run.cells = [
      { ...LLAMA_CELL, load: { cached: undefined, startT: 0, endT: 10, progress: [{ t: 4, pct: 100 }] } },
    ];
    const [header, row] = lines(runsToCellsCSV([run])).map((l) => l.split(','));
    expect(row[header.indexOf('loadCached')]).toBe('');
    expect(row[header.indexOf('loadProgressEvents')]).toBe('1');
    expect(row[header.indexOf('loadProgressSpanMs')]).toBe('0');
    expect(row[header.indexOf('loadDeclaredBytes')]).toBe('');
  });

  it('quotes fields that carry commas or quotes', () => {
    const run = makeAnalysisRun();
    run.cells = [{ ...run.cells[3], error: { name: 'Error', message: 'failed, "badly"' } }];
    expect(lines(runsToCellsCSV([run]))[1]).toContain(',Error,"failed, ""badly""",');
  });
});

describe('runs.csv', () => {
  const HEADER = [
    'runId', 'createdAt', 'protocol', 'schemaVersion', 'harnessName', 'harnessVersion', 'harnessAppVersion',
    'harnessCommit', 'suite', 'qualityLane', 'deviceClass', 'deviceSubclass', 'browser', 'browserVersion',
    'browserEngine', 'os', 'osVersion', 'osArchitecture', 'deviceType', 'hardwareConcurrency', 'coresClamped',
    'deviceMemoryGB', 'deviceMemoryCapped', 'screenWidth', 'screenHeight', 'screenDpr', 'gpuAvailable', 'gpuVendor',
    'gpuArchitecture', 'gpuDevice', 'gpuDescription', 'gpuIsFallbackAdapter', 'gpuModel', 'crossOriginIsolated',
    'timerResolutionUs', 'fingerprintMflops', 'cellsTotal', 'cellsOk', 'cellsInvalid', 'cellsError', 'cellsSkipped',
    'suiteDurationMs', 'scrubbedAt', 'validationOk', 'validationFlags',
    'seriesId', 'seriesIndex', 'seriesCount', 'coldStart',
    'rv_huggingface_transformers', 'rv_litert_lm_core', 'rv_wllama_wllama',
  ].join(',');

  it('emits one row per run with runtime versions over the union of all runs', () => {
    expect(lines(runsToRunsCSV(runs()))).toEqual([
      HEADER,
      'analysis-run-0001,2026-09-22T10:00:00.000Z,localmode-bench/5,3,@localmode/bench,0.8.2,2.15.2,abc1234,thorough,true,' +
        'macos/apple-metal-3,macos/apple-m1-pro,Google Chrome,145.0.7632.159,Blink,macOS,15.5,arm,desktop,10,false,8,true,' +
        '1512,982,2,true,apple,metal-3,,,false,Apple M1 Pro,true,5,1234.57,' +
        '6,3,1,1,1,90000.5,,true,,' +
        ',,,,' +
        '4.2.0,,3.5.1',
      'analysis-run-0002,2026-09-21T08:30:00.000Z,localmode-bench/4,2,@localmode/bench,0.7.0,,,quick,false,' +
        'macos/no-webgpu,macos/no-webgpu,Safari,26.5.2,WebKit,macOS,15.5,,,8,true,,false,' +
        ',,,false,,,,,,,true,5,,' +
        '1,1,0,0,0,,,false,reject:fingerprint-missing,' +
        ',,,,' +
        ',0.12.1,3.4.0',
    ]);
  });

  it('reports the same validation verdict and flags validateSubmission gives the archive', () => {
    const second = makeSecondAnalysisRun();
    const report = validateSubmission(second, { anyProtocol: true });
    expect(report.ok).toBe(false);
    expect(report.flags.map((f) => `${f.severity}:${f.code}`)).toEqual(['reject:fingerprint-missing']);
  });

  it('names runtime-version columns after the npm package', () => {
    expect(runtimeVersionColumn('@huggingface/transformers')).toBe('rv_huggingface_transformers');
    expect(runtimeVersionColumn('@litert-lm/core')).toBe('rv_litert_lm_core');
    expect(runtimeVersionColumn('@mlc-ai/web-llm')).toBe('rv_mlc_ai_web_llm');
  });

  it('is independent of run input order in its columns and follows it in its rows', () => {
    const reversed = lines(runsToRunsCSV([makeSecondAnalysisRun(), makeAnalysisRun()]));
    const forward = lines(runsToRunsCSV(runs()));
    expect(reversed[0]).toBe(forward[0]);
    expect(reversed.slice(1)).toEqual([forward[2], forward[1]]);
  });
});
