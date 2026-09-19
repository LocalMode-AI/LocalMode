'use client';

/**
 * @file bench-runner.tsx
 * @description Client runner for the LocalMode Bench: suite + lane selection with
 * availability preflight (no provider code loads until Run), live progress,
 * results table, JSON export, and leaderboard submission. Every model download
 * happens strictly behind the explicit Run action.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  BenchCellResult,
  BenchModelRef,
  BenchRunResult,
  BenchSuiteId,
  CellSummary,
  PlannedCell,
} from '@localmode/bench';
import {
  computeRunDigest,
  EMBED_WORKLOADS,
  LLM_WORKLOADS,
  QUALITY_WORKLOADS,
  RUN_POLICIES,
  runBenchmarkSuite,
} from '@localmode/bench';
import { BENCH_MODELS, SUITE_MODELS } from '@/lib/bench/catalog';
import { wllamaAvailability } from '@/lib/bench/adapters';
import { benchBuildCommit, benchRuntimeVersions } from '@/lib/bench/runtime-versions';
import { Button } from '@/registry/localmode/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/registry/localmode/ui/card';
import { Badge } from '@/registry/localmode/ui/badge';
import { Progress } from '@/registry/localmode/ui/progress';
import { Switch } from '@/registry/localmode/ui/switch';
import { Label } from '@/registry/localmode/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/registry/localmode/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/registry/localmode/ui/table';

const HARNESS_VERSION = '0.3.1';

type Phase = 'idle' | 'running' | 'done' | 'error';

interface LaneAvailability {
  ok: boolean;
  reason?: string;
}

/** Lightweight availability probes - no provider packages are imported here. */
async function probeLaneAvailability(): Promise<{
  lanes: Record<string, LaneAvailability>;
  webgpu: boolean;
}> {
  let webgpu = false;
  try {
    const gpu = (navigator as { gpu?: { requestAdapter(): Promise<unknown | null> } }).gpu;
    webgpu = gpu ? (await Promise.race([
      gpu.requestAdapter(),
      new Promise<null>((r) => setTimeout(() => r(null), 3000)),
    ])) !== null : false;
  } catch {
    webgpu = false;
  }
  let chromeAI: LaneAvailability = { ok: false, reason: 'Prompt API not supported' };
  try {
    const factory = (globalThis as { LanguageModel?: { availability(): Promise<string> } })
      .LanguageModel;
    if (factory) {
      const availability = await factory.availability();
      chromeAI =
        availability === 'available'
          ? { ok: true }
          : { ok: false, reason: `Gemini Nano ${availability}` };
    }
  } catch {
    chromeAI = { ok: false, reason: 'availability probe failed' };
  }
  const gpuGate: LaneAvailability = webgpu ? { ok: true } : { ok: false, reason: 'no WebGPU' };
  const wllamaGate = await wllamaAvailability();
  return {
    lanes: {
      'transformers-webgpu': gpuGate,
      'transformers-wasm': { ok: true },
      webllm: gpuGate,
      wllama: wllamaGate.ok ? { ok: true } : { ok: false, reason: wllamaGate.reason },
      litert: { ok: true },
      'chrome-ai': chromeAI,
      mediapipe: { ok: true },
    },
    webgpu,
  };
}

/**
 * Phones and tablets cannot hold the Standard or Thorough suites: those load
 * several runtimes' multi-hundred-megabyte WASM heaps in one page (the heaps
 * never shrink) and mobile browsers kill the tab well before that, which lost
 * the whole run on an iPhone. Mobile devices run the Quick suite.
 */
function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const uaData = (navigator as { userAgentData?: { mobile?: boolean } }).userAgentData;
  if (uaData?.mobile === true) return true;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

function formatBytes(bytes?: number): string {
  if (!bytes) return '-';
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

function formatMs(ms?: number): string {
  if (ms === undefined) return '-';
  return ms >= 10_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}

function laneKey(model: BenchModelRef): string {
  return `${model.runtimeId}/${model.benchModelId}`;
}

/**
 * Paid-study session read from the URL (`?PROLIFIC_PID=<id>&cc=<code>`).
 * The participant id is never stored or published as-is: the run carries a
 * short SHA-256 prefix so a payment can be verified against a dataset row
 * without the dataset revealing who ran it. The completion code is shown only
 * after the run finishes and the submission attempt has resolved, whether it
 * succeeded or not (payment is on attempt, never on our infrastructure).
 */
interface StudySession {
  participantHash: string;
  completionCode: string | null;
}

const PROLIFIC_COMPLETE_URL = 'https://app.prolific.com/submissions/complete?cc=';

async function readStudySession(): Promise<StudySession | null> {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const pid = params.get('PROLIFIC_PID')?.trim();
  if (!pid) return null;
  const code = params.get('cc')?.trim() || null;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pid));
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  return { participantHash: hex.slice(0, 12), completionCode: code && /^[A-Za-z0-9]{4,32}$/.test(code) ? code : null };
}

export function BenchRunner() {
  const [suite, setSuite] = useState<Exclude<BenchSuiteId, 'custom'>>('quick');
  const [availability, setAvailability] = useState<{
    lanes: Record<string, LaneAvailability>;
    webgpu: boolean;
  } | null>(null);
  const [disabledLanes, setDisabledLanes] = useState<Set<string>>(new Set());
  const [includeQuality, setIncludeQuality] = useState(false);
  const [autoSubmit, setAutoSubmit] = useState(true);
  const [phase, setPhase] = useState<Phase>('idle');
  const [statusLine, setStatusLine] = useState('');
  const [cellProgress, setCellProgress] = useState<{ index: number; total: number } | null>(null);
  const [loadPct, setLoadPct] = useState<number | null>(null);
  const [result, setResult] = useState<BenchRunResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<
    | { kind: 'idle' }
    | { kind: 'submitting' }
    | { kind: 'done'; flagged: boolean; url?: string }
    | { kind: 'failed'; message: string }
  >({ kind: 'idle' });
  const abortRef = useRef<AbortController | null>(null);
  const [study, setStudy] = useState<StudySession | null>(null);
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    let cancelled = false;
    probeLaneAvailability().then((a) => {
      if (!cancelled) setAvailability(a);
    });
    readStudySession().then((s) => {
      if (!cancelled) setStudy(s);
    });
    setMobile(isMobileDevice());
    return () => {
      cancelled = true;
    };
  }, []);

  /** Model lanes for the selected suite, annotated with availability.
   *  A runtime lane can be usable while a specific model still needs WebGPU
   *  (e.g. LiteRT runs Qwen3 on CPU but its Gemma 4 build is GPU-compiled). */
  const lanes = useMemo(() => {
    const ids = SUITE_MODELS[suite];
    return BENCH_MODELS.filter((m) => ids.includes(m.benchModelId)).map((model) => {
      const lane = availability?.lanes[model.runtimeId];
      const modelGate = model.requiresWebGPU && availability?.webgpu === false;
      const available = (lane?.ok ?? false) && !modelGate;
      return { model, available, reason: modelGate ? 'no WebGPU' : lane?.reason };
    });
  }, [suite, availability]);

  const activeLanes = lanes.filter((l) => l.available && !disabledLanes.has(laneKey(l.model)));
  const totalDownload = activeLanes.reduce((acc, l) => acc + (l.model.sizeBytes ?? 0), 0);

  const buildCells = useCallback((): PlannedCell[] => {
    const cells: PlannedCell[] = [];
    const llmWorkloads = suite === 'quick' ? [LLM_WORKLOADS[0]] : [...LLM_WORKLOADS];
    for (const { model } of activeLanes) {
      if (model.task === 'llm') {
        for (const workload of llmWorkloads) cells.push({ model, workload });
        if (includeQuality) cells.push({ model, workload: QUALITY_WORKLOADS[0] });
      } else {
        for (const workload of EMBED_WORKLOADS) cells.push({ model, workload });
        if (includeQuality) cells.push({ model, workload: QUALITY_WORKLOADS[2] });
      }
    }
    return cells;
  }, [activeLanes, suite, includeQuality]);

  const submitRun = useCallback(async (run: BenchRunResult) => {
    setSubmitState({ kind: 'submitting' });
    try {
      const res = await fetch('/api/bench/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(run),
      });
      const body = (await res.json()) as {
        ok: boolean;
        flagged?: boolean;
        url?: string;
        message?: string;
        code?: string;
      };
      if (body.ok) {
        setSubmitState({ kind: 'done', flagged: body.flagged ?? false, url: body.url });
      } else {
        setSubmitState({
          kind: 'failed',
          message: body.message ?? body.code ?? `Submission failed (${res.status})`,
        });
      }
    } catch {
      setSubmitState({ kind: 'failed', message: 'Network error during submission.' });
    }
  }, []);

  const run = useCallback(async () => {
    setPhase('running');
    setResult(null);
    setErrorMessage(null);
    setSubmitState({ kind: 'idle' });
    setStatusLine('Preparing…');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      // Nonce first so the whole run is bound to this session.
      let nonce: string | undefined;
      try {
        const res = await fetch('/api/bench/nonce');
        if (res.ok) nonce = ((await res.json()) as { nonce: string }).nonce;
      } catch {
        // Offline / dev - the run still works, submission may be rejected.
      }

      const [{ createLLMAdapters, createEmbedAdapters }] = await Promise.all([
        import('@/lib/bench/adapters'),
      ]);
      const suiteResult = await runBenchmarkSuite({
        suite,
        cells: buildCells(),
        policy: RUN_POLICIES[suite],
        llmAdapters: createLLMAdapters(),
        embedAdapters: createEmbedAdapters(),
        harness: {
          name: '@localmode/bench',
          version: HARNESS_VERSION,
          appVersion: 'localmode.ai',
          runtimeVersions: benchRuntimeVersions(),
          commit: benchBuildCommit(),
        },
        userReportedDevice: study ? `prolific:${study.participantHash}` : undefined,
        abortSignal: controller.signal,
        hooks: {
          onPhase: (p) => setStatusLine(p === 'fingerprint' ? 'Hardware calibration…' : `Phase: ${p}`),
          onCellStart: (cellId, index, total) => {
            setCellProgress({ index: index + 1, total });
            setLoadPct(null);
            setStatusLine(`Running ${cellId}`);
          },
          onLoadProgress: (_cellId, pct) => setLoadPct(pct ?? null),
          onIteration: (cellId, i, total) => setStatusLine(`Running ${cellId} - iteration ${i}/${total}`),
        },
      });
      suiteResult.nonce = nonce;
      suiteResult.digest = await computeRunDigest(suiteResult);
      setResult(suiteResult);
      setPhase('done');
      setStatusLine('Suite complete');
      // Publishing was disclosed next to the Run button; opt-out via the toggle.
      if (autoSubmit) void submitRun(suiteResult);
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        setPhase('idle');
        setStatusLine('Cancelled');
      } else {
        setPhase('error');
        setErrorMessage((error as Error).message ?? String(error));
      }
    } finally {
      abortRef.current = null;
      setCellProgress(null);
      setLoadPct(null);
    }
  }, [suite, buildCells, autoSubmit, submitRun, study]);

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  const exportJson = useCallback(() => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `localmode-bench-${result.runId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result]);

  const summaries: CellSummary[] = result?.clientSummaries ?? [];
  const cellById = new Map<string, BenchCellResult>(result?.cells.map((c) => [c.cellId, c]) ?? []);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Configure the run</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="bench-suite">Suite</Label>
              <Select
                value={suite}
                onValueChange={(v) => setSuite(v as typeof suite)}
                disabled={phase === 'running'}
              >
                <SelectTrigger id="bench-suite" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="quick">Quick (~10 min)</SelectItem>
                  <SelectItem value="standard" disabled={mobile}>
                    Standard{mobile ? ' (desktop only)' : ''}
                  </SelectItem>
                  <SelectItem value="thorough" disabled={mobile}>
                    Thorough{mobile ? ' (desktop only)' : ''}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="bench-quality"
                checked={includeQuality}
                onCheckedChange={setIncludeQuality}
                disabled={phase === 'running'}
              />
              <Label htmlFor="bench-quality">Include quality-fidelity lane</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="bench-publish"
                checked={autoSubmit}
                onCheckedChange={setAutoSubmit}
                disabled={phase === 'running'}
              />
              <Label htmlFor="bench-publish">Publish results to the public leaderboard</Label>
            </div>
          </div>

          <div className="flex flex-col gap-2" role="group" aria-label="Model lanes">
            {lanes.map(({ model, available, reason }) => {
              const key = laneKey(model);
              const checked = available && !disabledLanes.has(key);
              return (
                <div
                  key={key}
                  className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">{model.displayName}</span>
                    <span className="text-xs text-muted-foreground">
                      {model.runtimeId} · {formatBytes(model.sizeBytes)}
                      {model.quantization ? ` · ${model.quantization}` : ''}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {!available && (
                      <Badge variant="outline" className="text-muted-foreground">
                        {reason ?? 'unavailable'}
                      </Badge>
                    )}
                    <Switch
                      checked={checked}
                      disabled={!available || phase === 'running'}
                      onCheckedChange={(on) => {
                        setDisabledLanes((prev) => {
                          const next = new Set(prev);
                          if (on) next.delete(key);
                          else next.add(key);
                          return next;
                        });
                      }}
                      aria-label={`Include ${model.displayName}`}
                    />
                  </div>
                </div>
              );
            })}
            {availability === null && (
              <p className="text-sm text-muted-foreground">Probing device capabilities…</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={run} disabled={phase === 'running' || activeLanes.length === 0}>
              {phase === 'running' ? 'Running…' : 'Run benchmark'}
            </Button>
            {phase === 'running' && (
              <Button variant="outline" onClick={cancel}>
                Cancel
              </Button>
            )}
            <span className="text-sm text-muted-foreground">
              {activeLanes.length} lanes · est. download {formatBytes(totalDownload)} (cached models
              skip the download)
            </span>
          </div>
          {mobile && (
            <p className="text-xs text-muted-foreground" role="note">
              Phones and tablets run the Quick suite. Standard and Thorough load several runtimes
              in one page and need more browser memory than a mobile browser allows; the tab would
              be killed partway through and the run lost.
            </p>
          )}
          {study && (
            <p className="text-xs text-muted-foreground" role="note">
              Paid study session detected: your completion code appears on this page once the run
              finishes and the upload attempt completes. Keep this tab open until then.
            </p>
          )}
          {suite !== 'quick' && (
            <p className="text-xs text-muted-foreground" role="note">
              {suite === 'thorough'
                ? 'Thorough loads several multi-gigabyte models in one page and peaks above 8 GB of browser memory'
                : 'Standard runs every runtime in one page and peaks near 9 GB of browser memory'}
              : 16 GB of RAM is recommended, and close other heavy tabs and apps first, or the
              browser may run out of memory partway through.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Models download only when you press Run. Keep this tab visible and your device plugged
            in - hidden tabs invalidate timed runs. With publishing on, the result uploads to the
            open dataset automatically when the run completes: timings, device environment, and the
            generated text for the fixed public prompts. No personal data. Turn the toggle off to
            keep the run local (JSON export only).
          </p>
        </CardContent>
      </Card>

      {(phase === 'running' || statusLine) && (
        <Card>
          <CardHeader>
            <CardTitle>Progress</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p role="status" className="text-sm">
              {statusLine}
              {cellProgress ? ` (cell ${cellProgress.index}/${cellProgress.total})` : ''}
            </p>
            {loadPct !== null && (
              <div className="flex items-center gap-3">
                <Progress value={loadPct} className="max-w-md" aria-label="Model download progress" />
                <span className="text-xs tabular-nums text-muted-foreground">
                  {Math.round(loadPct)}%
                </span>
              </div>
            )}
            {phase === 'error' && errorMessage && (
              <p className="text-sm text-destructive">Benchmark failed: {errorMessage}</p>
            )}
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>Results</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cell</TableHead>
                    <TableHead>Backend</TableHead>
                    <TableHead className="text-right">Load</TableHead>
                    <TableHead className="text-right">TTFT (med)</TableHead>
                    <TableHead className="text-right">Decode chars/s</TableHead>
                    <TableHead className="text-right">Embed ms / texts-s</TableHead>
                    <TableHead className="text-right">Quality</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summaries.map((s) => {
                    const cell = cellById.get(s.cellId);
                    return (
                      <TableRow key={s.cellId}>
                        <TableCell className="max-w-64 truncate font-mono text-xs">{s.cellId}</TableCell>
                        <TableCell>{cell?.resolvedBackend ?? '-'}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMs(s.loadMs)}
                          {s.loadCached === true ? ' (warm)' : s.loadCached === false ? ' (cold)' : ''}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatMs(s.ttftMs?.median)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {s.decodeCharsPerSec ? (
                            Math.round(s.decodeCharsPerSec.median)
                          ) : s.overallCharsPerSec ? (
                            <span title="End-to-end rate (prefill + decode): this stream is not incremental, so a pure decode rate cannot be measured.">
                              {Math.round(s.overallCharsPerSec.median)}
                              <span className="text-xs text-muted-foreground"> e2e</span>
                            </span>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {s.singleLatencyMs
                            ? formatMs(s.singleLatencyMs.median)
                            : s.batchTextsPerSec
                              ? `${Math.round(s.batchTextsPerSec.median)}/s`
                              : '-'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {s.qualityScore !== undefined ? s.qualityScore.toFixed(3) : '-'}
                          {s.qualityParseRate !== undefined && s.qualityParseRate < 1 && (
                            <span
                              className="text-xs text-muted-foreground"
                              title="Share of items whose answer could be parsed. Unparsed items count as wrong, so a low share means the score is limited by output format, not fidelity."
                            >
                              {' '}({Math.round(s.qualityParseRate * 100)}% parsed)
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={s.status === 'ok' ? 'default' : 'outline'}>
                            {s.status}
                            {s.highVariance ? ' · high variance' : ''}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" onClick={exportJson}>
                Export JSON
              </Button>
              {(submitState.kind === 'failed' ||
                (submitState.kind === 'idle' && !autoSubmit)) && (
                <Button onClick={() => result && submitRun(result)}>
                  {submitState.kind === 'failed' ? 'Retry submission' : 'Submit to leaderboard'}
                </Button>
              )}
              {submitState.kind === 'submitting' && (
                <p role="status" className="text-sm text-muted-foreground">
                  Publishing to the leaderboard…
                </p>
              )}
              {submitState.kind === 'done' && (
                <p role="status" className="text-sm">
                  {submitState.flagged
                    ? 'Submitted - flagged by integrity checks, pending review.'
                    : 'Submitted to the public dataset.'}{' '}
                  {submitState.url && (
                    <a
                      className="underline underline-offset-2"
                      href={submitState.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View the raw run
                    </a>
                  )}
                </p>
              )}
              {submitState.kind === 'failed' && (
                <p role="status" className="text-sm text-destructive">
                  {submitState.message}
                </p>
              )}
            </div>
            {study?.completionCode && (submitState.kind === 'done' || submitState.kind === 'failed') && (
              <div
                role="region"
                aria-label="Study completion code"
                className="rounded-md border border-border bg-muted/40 p-3 text-sm"
              >
                <p>
                  Your Prolific completion code:{' '}
                  <code className="rounded bg-muted px-1 font-mono text-base">{study.completionCode}</code>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {submitState.kind === 'failed'
                    ? 'The upload did not go through, but you are still paid for the attempt: enter the code on Prolific and message the researcher with a screenshot of this page.'
                    : 'Enter it on Prolific to finish the study.'}{' '}
                  <a
                    className="underline underline-offset-2"
                    href={`${PROLIFIC_COMPLETE_URL}${encodeURIComponent(study.completionCode)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Complete on Prolific
                  </a>
                </p>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Published runs are public raw JSON in the open dataset on GitHub (timings,
              environment, generated text for the fixed public prompts). No personal data is
              collected.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
