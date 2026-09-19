/**
 * Validation: structural schema checks, deterministic summary recomputation
 * from raw traces (the same code runs client- and server-side), and versioned
 * plausibility/integrity checks for community submissions. Flags are attached,
 * never silently dropped — flagged runs are quarantined publicly.
 */

import type {
  BenchCellResult,
  BenchRunResult,
  CellSummary,
  EmbedIteration,
  LLMIteration,
  MetricSummary,
  PlausibilityFlag,
  ValidationReport,
} from './types.js';
import { BENCH_PROTOCOL_VERSION, BENCH_SCHEMA_VERSION } from './types.js';
import { summarize } from './stats.js';
import { parseMMLUAnswer } from './quality.js';
import { TINY_MMLU } from './datasets/tiny-mmlu.js';
import { MIN_GENERATED_CHARS } from './protocol.js';

/** Version of the plausibility rule set (recorded alongside moderation). */
export const PLAUSIBILITY_RULES_VERSION = 2;

/**
 * Minimum fraction of the request that the visible chunk stream must span for
 * the trace to count as incremental. LiteRT-LM's web surface delivers every
 * chunk in a terminal burst (~0.8ms of a 30s request), so TTFT/decode derived
 * from such a trace are timing artifacts; a real token stream spans most of
 * the request by construction.
 */
export const STREAM_COHERENCE_MIN_SPAN_RATIO = 0.2;

/** Decode-rate envelopes (chars/sec) per model-size class — deliberately loose. */
const DECODE_ENVELOPE_CHARS_PER_SEC: Array<{ maxBytes: number; max: number }> = [
  { maxBytes: 500_000_000, max: 4_000 },
  { maxBytes: 1_000_000_000, max: 2_500 },
  { maxBytes: 2_000_000_000, max: 1_500 },
  { maxBytes: Number.POSITIVE_INFINITY, max: 1_000 },
];

/** Max plausible embedding throughput (texts/sec) — loose upper bound. */
const EMBED_ENVELOPE_TEXTS_PER_SEC = 2_000;

/** GPU-identity substrings that mean the "GPU" is a software or virtual renderer. */
const SOFTWARE_RENDERER_PATTERNS: readonly RegExp[] = [
  /swiftshader/i,
  /llvmpipe/i,
  /softpipe/i,
  /\bwarp\b/i,
  /microsoft basic render/i,
  /parallels/i,
  /vmware/i,
  /virtio/i,
  /virtualbox/i,
];

/**
 * Structural validation of a submitted result. Returns human-readable errors
 * (empty array = shape ok). Deliberately hand-rolled: this package is
 * zero-dependency and the checks double as executable schema documentation.
 */
export function validateRunShape(value: unknown): string[] {
  const errors: string[] = [];
  const push = (msg: string) => {
    if (errors.length < 50) errors.push(msg);
  };
  if (typeof value !== 'object' || value === null) return ['result must be an object'];
  const run = value as Record<string, unknown>;

  if (run.protocol !== BENCH_PROTOCOL_VERSION) push(`protocol must be "${BENCH_PROTOCOL_VERSION}"`);
  if (run.schemaVersion !== BENCH_SCHEMA_VERSION) push(`schemaVersion must be ${BENCH_SCHEMA_VERSION}`);
  if (typeof run.runId !== 'string' || run.runId.length < 8 || run.runId.length > 64) {
    push('runId must be a string (8-64 chars)');
  }
  if (typeof run.createdAt !== 'string' || Number.isNaN(Date.parse(run.createdAt as string))) {
    push('createdAt must be an ISO date string');
  }
  const harness = run.harness as Record<string, unknown> | undefined;
  if (!harness || typeof harness.name !== 'string' || typeof harness.version !== 'string') {
    push('harness {name, version} is required');
  }
  if (!['quick', 'standard', 'thorough', 'custom'].includes(run.suite as string)) {
    push('suite must be quick|standard|thorough|custom');
  }
  const env = run.environment as Record<string, unknown> | undefined;
  if (!env || typeof env !== 'object') push('environment is required');
  else {
    const browser = env.browser as Record<string, unknown> | undefined;
    if (!browser || typeof browser.name !== 'string') push('environment.browser.name is required');
    if (!env.os || typeof (env.os as Record<string, unknown>).platform !== 'string') {
      push('environment.os.platform is required');
    }
  }
  if (!Array.isArray(run.cells)) push('cells must be an array');
  else if ((run.cells as unknown[]).length === 0) push('cells must not be empty');
  else if ((run.cells as unknown[]).length > 500) push('cells exceeds the 500-cell limit');
  else {
    (run.cells as unknown[]).forEach((c, i) => validateCellShape(c, i, push));
  }
  if (!Array.isArray(run.events)) push('events must be an array');
  return errors;
}

function validateCellShape(value: unknown, index: number, push: (m: string) => void): void {
  if (typeof value !== 'object' || value === null) {
    push(`cells[${index}] must be an object`);
    return;
  }
  const cell = value as Record<string, unknown>;
  const at = `cells[${index}]`;
  if (typeof cell.cellId !== 'string') push(`${at}.cellId must be a string`);
  if (typeof cell.runtimeId !== 'string') push(`${at}.runtimeId must be a string`);
  if (typeof cell.workloadId !== 'string') push(`${at}.workloadId must be a string`);
  if (!['ok', 'invalid', 'error', 'skipped'].includes(cell.status as string)) {
    push(`${at}.status must be ok|invalid|error|skipped`);
  }
  const model = cell.model as Record<string, unknown> | undefined;
  if (!model || typeof model.benchModelId !== 'string' || typeof model.providerModelId !== 'string') {
    push(`${at}.model {benchModelId, providerModelId} is required`);
  }
  const quality = cell.quality as Record<string, unknown> | undefined;
  if (quality && Array.isArray(quality.outputs)) {
    if ((quality.outputs as unknown[]).some((o) => typeof o !== 'string' || (o as string).length > 500)) {
      push(`${at}.quality.outputs must be strings of at most 500 chars`);
    }
  }
  if (!Array.isArray(cell.iterations)) {
    push(`${at}.iterations must be an array`);
    return;
  }
  (cell.iterations as unknown[]).forEach((it, j) => {
    if (typeof it !== 'object' || it === null) {
      push(`${at}.iterations[${j}] must be an object`);
      return;
    }
    const iter = it as Record<string, unknown>;
    if (typeof iter.startT !== 'number' || typeof iter.endT !== 'number') {
      push(`${at}.iterations[${j}] needs numeric startT/endT`);
    }
    if ('chunks' in iter && !Array.isArray(iter.chunks)) {
      push(`${at}.iterations[${j}].chunks must be an array`);
    }
    if ('text' in iter && typeof iter.text === 'string' && (iter.text as string).length > 20_000) {
      push(`${at}.iterations[${j}].text exceeds 20000 chars`);
    }
  });
}

/** True when the iteration array is the LLM shape (has chunk traces). */
function isLLMIterations(iterations: BenchCellResult['iterations']): iterations is LLMIteration[] {
  return iterations.length > 0 && 'chunks' in iterations[0];
}

/**
 * True when an iteration's chunk trace is genuinely incremental: at least two
 * chunks, and the visible stream spans at least
 * `STREAM_COHERENCE_MIN_SPAN_RATIO` of the request wall time. Anything else
 * (a doGenerate fallback's single chunk, or a runtime that computes the whole
 * generation and flushes it in a terminal burst) carries no usable TTFT or
 * decode timing.
 */
export function isIncrementalStream(it: LLMIteration): boolean {
  const nonEmpty = it.chunks.filter((c) => c.c > 0);
  if (nonEmpty.length < 2) return false;
  const span = nonEmpty[nonEmpty.length - 1].t - nonEmpty[0].t;
  const total = it.endT - it.startT;
  return total > 0 && span / total >= STREAM_COHERENCE_MIN_SPAN_RATIO;
}

/**
 * Recompute a cell's summary purely from its raw iteration traces.
 * This function IS the metric definition:
 * - TTFT = first non-empty chunk timestamp − startT
 * - decode rate = (chars after first chunk) / (endT_lastChunk − t_firstChunk)
 * - prefill tok/s ≈ approxPromptTokens / TTFT (approximate by construction)
 * - overall rate = total chars / (endT − startT), always derivable
 * TTFT/decode/prefill are derived only when EVERY iteration passes the
 * stream-coherence test (`streamIncremental`); overall rate and total wall
 * time are reported for all LLM lanes.
 */
export function summarizeCell(
  cell: BenchCellResult,
  highVarianceCv = 0.05,
  approxPromptTokens?: number,
): CellSummary {
  const out: CellSummary = {
    cellId: cell.cellId,
    status: cell.status,
    highVariance: false,
  };
  if (cell.load) {
    out.loadMs = cell.load.endT - cell.load.startT;
    out.loadCached = cell.load.cached;
  }
  if (cell.quality) {
    out.qualityScore = cell.quality.score;
    if (cell.quality.parseRate !== undefined) out.qualityParseRate = cell.quality.parseRate;
  }
  if (cell.iterations.length === 0) return out;

  if (isLLMIterations(cell.iterations)) {
    const incremental = cell.iterations.every(isIncrementalStream);
    out.streamIncremental = incremental;
    const ttfts: number[] = [];
    const decodeRates: number[] = [];
    const chunkRates: number[] = [];
    const genChars: number[] = [];
    const prefillRates: number[] = [];
    const totals: number[] = [];
    const overallRates: number[] = [];
    for (const it of cell.iterations) {
      const totalChars = it.chunks.reduce((acc, c) => acc + c.c, 0);
      const totalMs = it.endT - it.startT;
      if (totalMs > 0) {
        totals.push(totalMs);
        if (totalChars > 0) overallRates.push((totalChars / totalMs) * 1000);
      }
      genChars.push(totalChars);
      if (!incremental) continue;
      const first = it.chunks.find((c) => c.c > 0);
      if (!first) continue;
      const ttftMs = first.t - it.startT;
      ttfts.push(ttftMs);
      const last = it.chunks[it.chunks.length - 1];
      const decodeChars = totalChars - first.c;
      const decodeMs = last.t - first.t;
      if (decodeMs > 0 && decodeChars > 0) {
        decodeRates.push((decodeChars / decodeMs) * 1000);
        chunkRates.push(((it.chunks.length - 1) / decodeMs) * 1000);
      }
      if (approxPromptTokens && ttftMs > 0) prefillRates.push((approxPromptTokens / ttftMs) * 1000);
    }
    if (ttfts.length > 0) out.ttftMs = summarize(ttfts);
    if (decodeRates.length > 0) out.decodeCharsPerSec = summarize(decodeRates);
    if (chunkRates.length > 0) out.decodeChunksPerSec = summarize(chunkRates);
    if (genChars.length > 0) out.generatedChars = summarize(genChars);
    if (prefillRates.length > 0) out.prefillTokPerSecApprox = summarize(prefillRates);
    if (totals.length > 0) out.totalMs = summarize(totals);
    if (overallRates.length > 0) out.overallCharsPerSec = summarize(overallRates);
  } else {
    const iters = cell.iterations as EmbedIteration[];
    const durations = iters.map((it) => it.endT - it.startT).filter((d) => d > 0);
    if (durations.length > 0) {
      if (iters[0].count === 1) out.singleLatencyMs = summarize(durations);
      else {
        out.batchTextsPerSec = summarize(
          iters.filter((it) => it.endT - it.startT > 0).map((it) => (it.count / (it.endT - it.startT)) * 1000),
        );
      }
    }
  }

  const metrics: Array<MetricSummary | undefined> = [
    out.ttftMs,
    out.decodeCharsPerSec,
    out.overallCharsPerSec,
    out.singleLatencyMs,
    out.batchTextsPerSec,
  ];
  out.highVariance = metrics.some((m) => m !== undefined && m.n >= 2 && m.cv > highVarianceCv);
  return out;
}

/** Recompute all cell summaries for a run (workload prompt sizes looked up). */
export function summarizeRun(
  run: BenchRunResult,
  highVarianceCv = 0.05,
  promptTokensByWorkload?: ReadonlyMap<string, number>,
): CellSummary[] {
  const defaults = new Map<string, number>([
    ['chat-pp128-tg128', 128],
    ['chat-pp512-tg128', 512],
  ]);
  const lookup = promptTokensByWorkload ?? defaults;
  return run.cells.map((cell) => summarizeCell(cell, highVarianceCv, lookup.get(cell.workloadId)));
}

/**
 * Versioned plausibility/integrity checks over a submitted run. Returns flags;
 * `severity: 'reject'` flags route the run to quarantine, `warn` flags are
 * displayed. Rules (v1): timestamp monotonicity, decode-rate envelopes,
 * duration consistency, timer-grid conformance, fingerprint sanity,
 * environment cross-field consistency.
 */
export function checkPlausibility(run: BenchRunResult): PlausibilityFlag[] {
  const flags: PlausibilityFlag[] = [];
  const flag = (code: string, message: string, severity: 'warn' | 'reject', cellId?: string) =>
    flags.push({ code, message, severity, ...(cellId ? { cellId } : {}) });

  // Fingerprint sanity: the matmul must have run and be within silicon reality.
  if (!run.fingerprint) {
    flag('fingerprint-missing', 'no hardware fingerprint in submission', 'reject');
  } else if (
    run.fingerprint.mflops <= 1 ||
    run.fingerprint.mflops > 100_000 ||
    !Number.isFinite(run.fingerprint.checksum)
  ) {
    flag('fingerprint-implausible', `fingerprint mflops=${run.fingerprint.mflops}`, 'reject');
  }

  const grid = run.environment.timerResolutionUs;

  for (const cell of run.cells) {
    if (cell.status !== 'ok') continue;

    if (cell.load && cell.load.endT < cell.load.startT) {
      flag('load-time-reversed', 'load endT precedes startT', 'reject', cell.cellId);
    }

    if (isLLMIterations(cell.iterations)) {
      for (const it of cell.iterations) {
        // Monotonic chunk timestamps within [startT, endT].
        let prev = it.startT;
        let monotonic = true;
        for (const c of it.chunks) {
          if (c.t < prev) monotonic = false;
          prev = c.t;
        }
        if (!monotonic || it.endT < prev) {
          flag('trace-not-monotonic', 'chunk timestamps are not monotonic', 'reject', cell.cellId);
          break;
        }
        // Text length must equal the chunk-length sum.
        const chunkChars = it.chunks.reduce((acc, c) => acc + c.c, 0);
        if (it.text.length !== chunkChars) {
          flag('text-chunk-mismatch', `text length ${it.text.length} != chunk sum ${chunkChars}`, 'reject', cell.cellId);
          break;
        }
      }

      const summary = summarizeCell(cell);
      // A healthy timed iteration generates real text. The runner gates
      // near-empty generations as invalid; an `ok` cell carrying them means
      // the client skipped that gate.
      if (
        cell.iterations.some((it) => (it as LLMIteration).text.length < MIN_GENERATED_CHARS)
      ) {
        flag(
          'degenerate-generation',
          `an ok cell has a timed iteration with fewer than ${MIN_GENERATED_CHARS} generated chars`,
          'reject',
          cell.cellId,
        );
      }
      const size = cell.model.sizeBytes ?? Number.POSITIVE_INFINITY;
      const envelope = DECODE_ENVELOPE_CHARS_PER_SEC.find((e) => size <= e.maxBytes);
      if (envelope && summary.decodeCharsPerSec && summary.decodeCharsPerSec.median > envelope.max) {
        flag(
          'decode-rate-envelope',
          `decode ${Math.round(summary.decodeCharsPerSec.median)} chars/s exceeds envelope ${envelope.max} for model size`,
          'reject',
          cell.cellId,
        );
      }
      // Overall rate conflates prefill + decode, so it is bounded by the same
      // envelope: it can never legitimately exceed the pure decode rate.
      if (envelope && summary.overallCharsPerSec && summary.overallCharsPerSec.median > envelope.max) {
        flag(
          'overall-rate-envelope',
          `overall ${Math.round(summary.overallCharsPerSec.median)} chars/s exceeds envelope ${envelope.max} for model size`,
          'reject',
          cell.cellId,
        );
      }
      if (summary.ttftMs && summary.ttftMs.median < 1) {
        flag('ttft-implausible', `median TTFT ${summary.ttftMs.median}ms < 1ms`, 'reject', cell.cellId);
      }

      // Timer-grid conformance: chunk timestamps should sit on the reported grid.
      if (grid !== null && grid !== undefined && grid >= 4) {
        const quantumMs = grid / 1000;
        let offGrid = 0;
        let total = 0;
        for (const it of cell.iterations) {
          for (const c of it.chunks) {
            total++;
            const remainder = Math.abs(c.t / quantumMs - Math.round(c.t / quantumMs));
            if (remainder > 0.01) offGrid++;
          }
        }
        if (total >= 20 && offGrid / total > 0.5) {
          flag('timer-grid', `${offGrid}/${total} chunk timestamps off the ${grid}us timer grid`, 'warn', cell.cellId);
        }
      }
    } else if (cell.quality?.taskId.startsWith('tinymmlu') && cell.quality.outputs) {
      // MMLU scores are recomputable from the stored raw outputs: re-parse
      // every output against the bundled item set and compare with the
      // submitted per-item details and score.
      const { outputs, details, score, n } = cell.quality;
      if (outputs.length !== n || !details || details.length !== n) {
        flag('quality-outputs-mismatch', 'quality outputs/details length disagrees with n', 'reject', cell.cellId);
      } else {
        let recomputed = 0;
        let agree = true;
        for (let i = 0; i < n; i++) {
          const item = TINY_MMLU[i];
          if (!item) break;
          const ok = parseMMLUAnswer(outputs[i], item.choices) === item.answer ? 1 : 0;
          recomputed += ok;
          if (ok !== details[i]) agree = false;
        }
        if (!agree || Math.abs(recomputed / n - score) > 1e-9) {
          flag(
            'quality-details-mismatch',
            `submitted MMLU score ${score} disagrees with recompute ${recomputed / n} from raw outputs`,
            'reject',
            cell.cellId,
          );
        }
      }
    } else if (cell.iterations.length > 0) {
      const summary = summarizeCell(cell);
      if (summary.batchTextsPerSec && summary.batchTextsPerSec.median > EMBED_ENVELOPE_TEXTS_PER_SEC) {
        flag(
          'embed-rate-envelope',
          `embedding throughput ${Math.round(summary.batchTextsPerSec.median)} texts/s exceeds envelope`,
          'reject',
          cell.cellId,
        );
      }
      if (summary.singleLatencyMs && summary.singleLatencyMs.median < 0.05) {
        flag('embed-latency-implausible', 'sub-50us embedding latency', 'reject', cell.cellId);
      }
    }
  }

  // Cross-field consistency: Apple GPU should not report a Windows platform.
  const vendor = run.environment.gpu.vendor?.toLowerCase() ?? '';
  const platform = run.environment.os.platform.toLowerCase();
  if (vendor === 'apple' && platform.includes('windows')) {
    flag('env-cross-field', 'Apple GPU adapter with Windows platform', 'reject');
  }

  // Software/virtual renderer detection: cloud VMs and virtualized desktops
  // expose SwiftShader/WARP-class adapters whose "GPU" numbers are CPU numbers.
  // A GPU-lane result from such an environment is rejected; a WASM/CPU-only run
  // is merely annotated (software rendering does not affect those lanes).
  const gpuIdentity = [
    run.environment.gpu.vendor,
    run.environment.gpu.architecture,
    run.environment.gpu.device,
    run.environment.gpu.description,
    run.environment.webglRenderer,
  ]
    .filter(Boolean)
    .join(' ');
  if (SOFTWARE_RENDERER_PATTERNS.some((p) => p.test(gpuIdentity))) {
    const hasGpuLane = run.cells.some(
      (cell) => cell.status === 'ok' && /webgpu|^gpu$/.test(cell.resolvedBackend),
    );
    flag(
      'software-renderer',
      `GPU identity matches a software/virtual renderer: "${gpuIdentity.slice(0, 120)}"`,
      hasGpuLane ? 'reject' : 'warn',
    );
  }

  return flags;
}

/**
 * Full validation pipeline for a submission: shape, digest-independent
 * summary recompute, client-summary agreement (>1% relative disagreement on
 * medians is flagged), and plausibility rules.
 */
export function validateSubmission(run: BenchRunResult): ValidationReport {
  const shapeErrors = validateRunShape(run);
  if (shapeErrors.length > 0) {
    return { ok: false, shapeErrors, flags: [], summaries: [] };
  }
  const summaries = summarizeRun(run);
  const flags = checkPlausibility(run);

  if (run.clientSummaries) {
    const byId = new Map(summaries.map((s) => [s.cellId, s]));
    for (const client of run.clientSummaries) {
      const server = byId.get(client.cellId);
      if (!server) continue;
      for (const key of [
        'ttftMs',
        'decodeCharsPerSec',
        'totalMs',
        'overallCharsPerSec',
        'singleLatencyMs',
        'batchTextsPerSec',
      ] as const) {
        const c = client[key]?.median;
        const s = server[key]?.median;
        if (c !== undefined && s !== undefined && s !== 0 && Math.abs(c - s) / Math.abs(s) > 0.01) {
          flags.push({
            code: 'client-summary-disagrees',
            cellId: client.cellId,
            message: `${key} client median ${c} vs recomputed ${s}`,
            severity: 'reject',
          });
        }
      }
    }
  }

  return {
    ok: flags.every((f) => f.severity !== 'reject'),
    shapeErrors: [],
    flags,
    summaries,
  };
}
