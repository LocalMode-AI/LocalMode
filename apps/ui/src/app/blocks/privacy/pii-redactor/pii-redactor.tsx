'use client';

/**
 * @file pii-redactor.tsx
 * @description PII Redactor block (`/blocks/privacy/pii-redactor`) — on-device NER PII detection + typed-placeholder redaction + a differential-privacy demonstration.
 */
import { useRef, useState } from 'react';
import { Copy, Download, FileText, Loader2, ScanLine, Check } from 'lucide-react';

import {
  createPrivacyBudget,
  dpEmbeddingMiddleware,
  wrapEmbeddingModel,
  embed,
  redactPII,
  type PrivacyBudget,
} from '@localmode/core';
import { transformers } from '@localmode/transformers';
import { useExtractEntities } from '@localmode/react';

import { RedactedTextDisplay } from '@/components/redacted-text-display';
import { EntityStatsBar } from '@/components/entity-stats-bar';
import {
  EntityRelationshipGraph,
  type NodeTypeRegistry,
} from '@/components/entity-relationship-graph';
import {
  DifferentialPrivacyControls,
  DpAppliedBadge,
  type PrivacyBudgetState,
} from '@/components/differential-privacy-controls';
import { cn } from '@/lib/utils';

/** A detected entity with BIO prefix stripped and source offsets captured. */
interface DetectedEntity {
  /** Entity surface text. */
  text: string;
  /** Entity type with any `B-`/`I-` prefix stripped (PER/LOC/ORG/MISC). */
  type: string;
  /** Start offset in the source text. */
  start: number;
  /** End offset (exclusive). */
  end: number;
  /** Confidence score (0–1). */
  score: number;
}

/** Minimum confidence — detections below this are dropped as noise. */
const CONFIDENCE_THRESHOLD = 0.5;

/**
 * Map raw NER entities to display entities: strip BIO prefixes (safety pass —
 * the provider already aggregates), keep offsets, and drop low-confidence noise.
 */
function mapEntities(
  entities: { text: string; type: string; start: number; end: number; score: number }[],
): DetectedEntity[] {
  return entities
    .map((e) => ({
      text: e.text,
      type: e.type.replace(/^[BI]-/, ''),
      start: e.start,
      end: e.end,
      score: e.score,
    }))
    .filter((e) => e.score >= CONFIDENCE_THRESHOLD && e.end > e.start);
}

/**
 * Produce the redacted text: replace each INCLUDED entity type with a
 * `[<TYPE>]` placeholder in reverse offset order (so earlier offsets stay
 * valid), then run the core `redactPII()` regex pass for structured PII
 * (emails, phones, SSNs, credit cards). Excluded types are left as plain text.
 */
function redactText(
  text: string,
  entities: DetectedEntity[],
  includedTypes: ReadonlySet<string>,
): string {
  const sorted = entities
    .filter((e) => includedTypes.has(e.type))
    .sort((a, b) => b.start - a.start);
  let redacted = text;
  for (const entity of sorted) {
    redacted = redacted.slice(0, entity.start) + `[${entity.type}]` + redacted.slice(entity.end);
  }
  return redactPII(redacted, { emails: true, phones: true, ssn: true, creditCards: true });
}

/** Tally detected entities by type. */
function countByType(entities: DetectedEntity[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of entities) counts[e.type] = (counts[e.type] ?? 0) + 1;
  return counts;
}

/** Node colors for the relationship graph (parity with the results registry). */
const NODE_REGISTRY: NodeTypeRegistry = {
  PER: { color: 'var(--color-sky-500, #0ea5e9)' },
  LOC: { color: 'var(--color-emerald-500, #10b981)' },
  ORG: { color: 'var(--color-violet-500, #8b5cf6)' },
  MISC: { color: 'var(--color-amber-500, #f59e0b)' },
};

/**
 * Build a co-occurrence graph over detected entities: one node per distinct
 * (text, type) with a mention-count weight, and an edge between entities that
 * appear consecutively in the source (shared-context relationship).
 */
function buildEntityGraph(entities: DetectedEntity[]) {
  const nodeMap = new Map<string, { id: string; label: string; type: string; weight: number }>();
  for (const e of entities) {
    const id = `${e.type}:${e.text.toLowerCase()}`;
    const existing = nodeMap.get(id);
    if (existing) existing.weight += 1;
    else nodeMap.set(id, { id, label: e.text, type: e.type, weight: 1 });
  }

  const ordered = [...entities].sort((a, b) => a.start - b.start);
  const edgeSet = new Set<string>();
  const edges: { source: string; target: string }[] = [];
  for (let i = 0; i < ordered.length - 1; i++) {
    const a = `${ordered[i].type}:${ordered[i].text.toLowerCase()}`;
    const b = `${ordered[i + 1].type}:${ordered[i + 1].text.toLowerCase()}`;
    if (a === b) continue;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (edgeSet.has(key)) continue;
    edgeSet.add(key);
    edges.push({ source: a, target: b });
  }
  return { nodes: [...nodeMap.values()], edges };
}

/**
 * A deterministic scalar signature of an embedding vector (sum of components).
 * Identical inputs through the same model yield an identical signature, so a
 * differential-privacy-noised embedding is observably different from the
 * non-noised baseline.
 */
function embeddingSignature(vec: Float32Array | number[]): string {
  let sum = 0;
  for (const v of vec) sum += v;
  return sum.toFixed(6);
}

/** The NER model — BIO-tagged bert-base-NER (~110MB), PER/LOC/ORG/MISC. */
const NER_MODEL_ID = 'Xenova/bert-base-NER';
/** The embedding model for the DP demonstration (~23MB, 384 dims). */
const EMBEDDING_MODEL_ID = 'Xenova/all-MiniLM-L6-v2';

/** DP epsilon range (parity with the document-redactor showcase). */
const MIN_EPSILON = 0.5;
const MAX_EPSILON = 10.0;
const EPSILON_STEP = 0.5;
const DEFAULT_EPSILON = 1.0;
const MAX_BUDGET_EPSILON = 10.0;

/**
 * Sample document with a known PII set (persons, orgs, locations, an email, a
 * phone number, and an SSN). Verbatim parity with the document-redactor
 * showcase so scan results stay deterministic.
 */
const SAMPLE_DOCUMENT =
  'John Smith met with Dr. Sarah Johnson at the Microsoft headquarters in Seattle, Washington on March 15th. They discussed the upcoming partnership with Google and the European Union regulations. Contact John at john.smith@example.com or call +1-555-0123. His social security number is 123-45-6789.';

let nerSingleton: ReturnType<typeof transformers.ner> | null = null;
/** Lazily create (never download) the NER model singleton. */
function getNERModel() {
  if (!nerSingleton) nerSingleton = transformers.ner(NER_MODEL_ID);
  return nerSingleton;
}

let embeddingModel: ReturnType<typeof transformers.embedding> | null = null;
/** Lazily create (never download) the embedding model singleton. */
function getEmbeddingModel() {
  if (!embeddingModel) embeddingModel = transformers.embedding(EMBEDDING_MODEL_ID);
  return embeddingModel;
}

type Phase = 'idle' | 'scanning' | 'ready' | 'error';

interface DpResult {
  epsilon: number;
  dims: number;
  plainSig: string;
  noisySig: string;
}

const ENTITY_LABELS: Record<string, string> = {
  PER: 'Person',
  LOC: 'Location',
  ORG: 'Organization',
  MISC: 'Misc',
};

export function PiiRedactorBlock() {
  const nerModel = useState(() => getNERModel())[0];
  const { execute, cancel } = useExtractEntities({ model: nerModel });

  const [input, setInput] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);

  // Frozen copy of the text a scan ran against + its detected entities, so
  // per-type toggles recompute the redaction against the same source.
  const [scannedText, setScannedText] = useState('');
  const [entities, setEntities] = useState<DetectedEntity[]>([]);
  const [includedTypes, setIncludedTypes] = useState<ReadonlySet<string>>(() => new Set());
  const [copied, setCopied] = useState(false);

  // Differential privacy.
  const [dpEnabled, setDpEnabled] = useState(false);
  const [epsilon, setEpsilon] = useState(DEFAULT_EPSILON);
  const [dpResult, setDpResult] = useState<DpResult | null>(null);
  const [budgetState, setBudgetState] = useState<PrivacyBudgetState | null>(null);
  const budgetRef = useRef<PrivacyBudget | null>(null);

  const hasResult = phase === 'ready' && scannedText.length > 0;
  const detectedTypes = Object.keys(countByType(entities));
  const redacted = hasResult ? redactText(scannedText, entities, includedTypes) : '';
  const graph = hasResult ? buildEntityGraph(entities) : { nodes: [], edges: [] };

  const loadSample = () => setInput(SAMPLE_DOCUMENT);

  const readBudget = (budget: PrivacyBudget): PrivacyBudgetState => ({
    consumed: budget.consumed(),
    maxEpsilon: MAX_BUDGET_EPSILON,
  });

  const runDpDemo = async (redactedText: string) => {
    if (!budgetRef.current) {
      budgetRef.current = await createPrivacyBudget({
        maxEpsilon: MAX_BUDGET_EPSILON,
        onExhausted: 'warn',
        persistKey: 'privacy-vault-dp-budget',
      });
    }
    const budget = budgetRef.current;
    const baseModel = getEmbeddingModel();
    // Non-noised baseline (deterministic) — for the DP-off comparison witness.
    const plain = await embed({ model: baseModel, value: redactedText });
    // Noised embedding via the DP middleware (consumes epsilon from the budget).
    const wrapped = wrapEmbeddingModel({
      model: baseModel,
      middleware: dpEmbeddingMiddleware({ epsilon, mechanism: 'gaussian' }, budget),
    });
    const noisy = await embed({ model: wrapped, value: redactedText });
    setDpResult({
      epsilon,
      dims: noisy.embedding.length,
      plainSig: embeddingSignature(plain.embedding),
      noisySig: embeddingSignature(noisy.embedding),
    });
    setBudgetState(readBudget(budget));
  };

  const scan = async () => {
    if (!input.trim() || phase === 'scanning') return;
    setPhase('scanning');
    setError(null);
    setDpResult(null);
    try {
      const data = await execute(input);
      if (!data) {
        // Aborted / cancelled — leave prior state.
        setPhase((p) => (p === 'scanning' ? 'idle' : p));
        return;
      }
      const mapped = mapEntities(data.entities);
      setScannedText(input);
      setEntities(mapped);
      setIncludedTypes(new Set(mapped.map((e) => e.type)));
      setPhase('ready');
      if (dpEnabled) {
        const redactedText = redactText(input, mapped, new Set(mapped.map((e) => e.type)));
        await runDpDemo(redactedText);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed');
      setPhase('error');
    }
  };

  const toggleType = (type: string) => {
    setIncludedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const copyRedacted = async () => {
    try {
      await navigator.clipboard.writeText(redacted);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — no-op */
    }
  };

  const exportClean = () => {
    const blob = new Blob([redacted], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'redacted.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const modelStatus = phase === 'scanning' ? 'loading' : phase === 'ready' ? 'ready' : phase;

  return (
    <div className="flex flex-col gap-4 p-4">
      <p className="text-xs text-muted-foreground">
        Detect and redact PII on-device with bert-base-NER, then demonstrate differential privacy.
      </p>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="redact-input" className="text-sm font-medium">
            Document to scan
          </label>
          <button
            type="button"
            onClick={loadSample}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <FileText className="size-3.5" aria-hidden="true" /> Load sample
          </button>
        </div>
        <textarea
          id="redact-input"
          value={input}
          disabled={phase === 'scanning'}
          onChange={(e) => setInput(e.target.value)}
          rows={5}
          placeholder="Paste text containing names, organizations, locations, emails, phone numbers, or SSNs…"
          className="w-full resize-y rounded-lg border border-input bg-background p-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={scan}
            disabled={!input.trim() || phase === 'scanning'}
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {phase === 'scanning' ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <ScanLine className="size-4" aria-hidden="true" />
            )}
            {phase === 'scanning' ? 'Scanning…' : 'Scan for PII'}
          </button>
          {phase === 'scanning' && (
            <button
              type="button"
              onClick={cancel}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Cancel
            </button>
          )}
          <span
            role="status"
            data-status={modelStatus}
            className="basis-full text-xs text-muted-foreground sm:basis-auto"
          >
            {phase === 'idle' && 'Model loads on Scan (bert-base-NER ~110 MB).'}
            {phase === 'scanning' && 'Running on-device NER…'}
            {phase === 'ready' && `${entities.length} entities detected.`}
            {phase === 'error' && 'Scan failed.'}
          </span>
        </div>
        {error && (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive"
          >
            {error}
          </p>
        )}
      </div>

      {(phase === 'scanning' || hasResult) && (
        <>
          {hasResult && (
            <>
              {/* Accessible witness for the exact-entity assertion — the real
                  detection output (surface form + type), also readable by AT as
                  a labeled list. Visually hidden, present in the a11y tree. */}
              <ul aria-label="Detected PII entities" className="sr-only">
                {entities.map((e, i) => (
                  <li key={i} data-entity-text={e.text} data-entity-type={e.type}>
                    {e.text} ({e.type})
                  </li>
                ))}
              </ul>
              <EntityStatsBar entities={entities} />

              {detectedTypes.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">Redact:</span>
                  {detectedTypes.map((type) => {
                    const on = includedTypes.has(type);
                    return (
                      <button
                        key={type}
                        type="button"
                        data-included={on}
                        aria-pressed={on}
                        onClick={() => toggleType(type)}
                        className={cn(
                          'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          on
                            ? 'border-primary/40 bg-primary/10 text-primary'
                            : 'border-border bg-background text-muted-foreground line-through',
                        )}
                      >
                        {ENTITY_LABELS[type] ?? type}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">Redacted output</span>
              {hasResult && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={copyRedacted}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {copied ? (
                      <Check className="size-3.5" aria-hidden="true" />
                    ) : (
                      <Copy className="size-3.5" aria-hidden="true" />
                    )}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    type="button"
                    onClick={exportClean}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Download className="size-3.5" aria-hidden="true" /> Export Clean
                  </button>
                </div>
              )}
            </div>
            <div role="group" aria-label="Redacted output">
              <RedactedTextDisplay
                text={redacted}
                entities={[]}
                isScanning={phase === 'scanning'}
                emptyState="Scan a document to see the redacted output."
              />
            </div>
          </div>

          {hasResult && graph.nodes.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">Entity relationships</span>
              <EntityRelationshipGraph
                nodes={graph.nodes}
                edges={graph.edges}
                registry={NODE_REGISTRY}
                height={280}
                showExport={false}
              />
            </div>
          )}
        </>
      )}

      {/* Differential privacy demonstration. */}
      <div className="flex flex-col gap-2">
        <DifferentialPrivacyControls
          enabled={dpEnabled}
          onEnabledChange={setDpEnabled}
          epsilon={epsilon}
          onEpsilonChange={setEpsilon}
          minEpsilon={MIN_EPSILON}
          maxEpsilon={MAX_EPSILON}
          step={EPSILON_STEP}
          budget={budgetState ?? undefined}
        />
        {budgetState && (
          <span
            data-consumed={budgetState.consumed.toFixed(1)}
            data-max={budgetState.maxEpsilon.toFixed(1)}
            className="text-xs text-muted-foreground"
          >
            Privacy budget: {budgetState.consumed.toFixed(1)} / {budgetState.maxEpsilon.toFixed(1)} ε
            consumed
          </span>
        )}
        {dpResult && (
          <div className="flex flex-col gap-1">
            <DpAppliedBadge epsilon={dpResult.epsilon} dimensions={dpResult.dims} />
            {/* Accessible witness for the DP behavioral assertions: the baseline
                vs noised embedding signatures + dimensionality + epsilon. */}
            <span
              aria-label="Differential privacy embedding signatures"
              data-plain-sig={dpResult.plainSig}
              data-noisy-sig={dpResult.noisySig}
              data-dims={dpResult.dims}
              data-epsilon={dpResult.epsilon}
              className="font-mono text-[10px] text-muted-foreground"
            >
              baseline {dpResult.plainSig} · noised {dpResult.noisySig}
            </span>
          </div>
        )}
        {dpEnabled && !dpResult && (
          <p className="text-xs text-muted-foreground">
            Scan with DP enabled to noise the redacted text&apos;s embedding
            (all-MiniLM-L6-v2 ~23&#160;MB).
          </p>
        )}
      </div>
    </div>
  );
}
