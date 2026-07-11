'use client';

/**
 * @file vector-data-manager.tsx
 * @description Core-only knowledge-base data manager over an owned corpus: 4-format vector import (Pinecone/ChromaDB/CSV/JSONL + native JSON) with auto-detect + preview + re-embed toggle, native JSON/CSV/JSONL export (round-trippable), embedding-drift banner + cancellable reindex, and storage + vector observability with adaptive batch sizing.
 * @constraint Core engine only — never imports @localmode/langchain, @localmode/wllama, or @localmode/pdfjs; getLanguageModel is lazy and never invoked (this block never generates).
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardPaste,
  FileText,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Square,
  Upload,
} from 'lucide-react';
import {
  downloadBlob,
  useAdaptiveBatchSize,
  useImportExport,
  useKnowledgeBase,
  useStorageQuota,
  type AnyLoadProgress,
} from '@localmode/react';
import {
  createKnowledgeBaseEngine,
  exportToCSV,
  exportToJSONL,
  isWebGPUSupported,
} from '@localmode/core';
import type {
  ChunkingMode,
  DocumentSource,
  EngineStats,
  ImportRecord,
  KnowledgeBaseEngine,
  RawDocument,
} from '@localmode/core';
import { transformers, isModelCached } from '@localmode/transformers';

import {
  VectorImportFlow,
  type ImportProgressLike,
  type PreviewRecord as FlowPreviewRecord,
} from '@/components/vector-import-flow';
import { VectorExportPanel } from '@/components/vector-export-panel';
import { FormatDetectionBadge } from '@/components/format-detection-badge';
import { StorageMeter } from '@/components/storage-meter';
import { VectorStorageObservability } from '@/components/vector-storage-observability';
import {
  EmbeddingDriftBanner,
  type ReindexProgressLike,
} from '@/components/embedding-drift-banner';
import { AdaptiveBatchCard } from '@/components/adaptive-batch-card';
import { ModelDownloader } from '@/components/model-downloader';
import { cn } from '@/lib/utils';

// ─── Constants ──────────────────────────────────────────────────────

/** Default embedding model for the re-embed lane (~34 MB). */
const DEFAULT_EMBEDDING_MODEL_ID = 'Xenova/bge-small-en-v1.5';

/**
 * Embedding models the block offers. The second model is the drift-driver: a
 * genuine model switch re-ingests the owned corpus through the new embedding
 * space (both 384-d, so imports never dimension-mismatch), which is what makes
 * the drift banner + reindex a real, exercisable capability.
 */
const EMBEDDING_MODEL_META: Record<string, { name: string; size: string }> = {
  'Xenova/bge-small-en-v1.5': { name: 'BGE Small EN v1.5', size: '34 MB' },
  'Xenova/all-MiniLM-L6-v2': { name: 'all-MiniLM-L6-v2', size: '23 MB' },
};
const EMBEDDING_MODEL_IDS = Object.keys(EMBEDDING_MODEL_META);

/**
 * Grounded-answer model id handed to `getLanguageModel` — a lazy factory this
 * block NEVER invokes (there is no ask/generate surface here), so this model
 * never downloads. Named only to satisfy the engine contract.
 */
const ANSWER_MODEL_ID = 'onnx-community/granite-4.0-350m-ONNX-web';

/** Maximum accepted import file size (50MB — data-migrator parity). */
const MAX_FILE_SIZE = 50 * 1024 * 1024;

/** Accepted file extensions (content sniffing decides the actual format). */
const SUPPORTED_EXTENSIONS = ['.json', '.jsonl', '.csv'];

/** Records shown in the preview table. */
const MAX_PREVIEW_RECORDS = 10;

/** Fallback dimensionality when the engine has not reported stats yet. */
const DEFAULT_DIMENSIONS = 384;

/** Marker + id for the block's own lossless export format. */
const NATIVE_MARKER = 'localmode-kb';
const NATIVE_FORMAT_ID = 'native-json';

/** Display labels for detected formats. */
const FORMAT_LABELS: Record<string, string> = {
  pinecone: 'Pinecone JSON',
  chroma: 'ChromaDB JSON',
  csv: 'CSV',
  jsonl: 'JSONL',
  [NATIVE_FORMAT_ID]: 'Native JSON (knowledge base)',
};

/** Badge styling for the native format (the four externals are built in). */
const FORMAT_COLOR_MAP = {
  [NATIVE_FORMAT_ID]: {
    badge: 'bg-primary/10 text-primary border-primary/30',
    dot: 'bg-primary',
  },
};

/** Export formats offered by the panel (native JSON is round-trip lossless). */
const EXPORT_FORMATS = [
  {
    id: NATIVE_FORMAT_ID,
    label: 'Native JSON',
    description:
      'Lossless document array (titles, text, sources, categories, pages, metadata) - round-trip re-importable.',
  },
  {
    id: 'csv',
    label: 'CSV',
    description: 'id + text + metadata columns (no vectors) for spreadsheets.',
  },
  {
    id: 'jsonl',
    label: 'JSONL',
    description: 'One id + text + metadata record per line (no vectors).',
  },
];

const VALID_SOURCES: DocumentSource[] = ['text', 'sample', 'pdf', 'ocr', 'import'];

/** A short note used to seed the corpus without an import file. */
const SAMPLE_NOTE =
  'Privacy and encryption on device: encrypting personal data with AES-GCM keys derived on the device keeps private information confidential, and no plaintext ever leaves the browser. Local-first vector search then runs entirely offline over the encrypted-at-rest corpus.';

// ─── Local session contract (built from the useKnowledgeBase hook) ──

/**
 * The shape the data-management body reads. A local UI contract (NOT a core
 * type): the block builds it from the `useKnowledgeBase` return so the body
 * stays a pure consumer of session state + mutations, exactly as the retired
 * knowledge-base Data tab did.
 */
interface Session {
  engine: KnowledgeBaseEngine;
  engineKind: 'core';
  documents: RawDocument[];
  addDocuments: (docs: Array<Omit<RawDocument, 'id' | 'addedAt'>>) => Promise<void>;
  removeDocument: (docId: string) => Promise<void>;
  clearAll: () => Promise<void>;
  chunking: ChunkingMode;
  setChunking: (mode: ChunkingMode) => void;
  chunkSize: number;
  setChunkSize: (n: number) => void;
  embeddingModelId: string;
  setEmbeddingModelId: (id: string) => void;
  busy: boolean;
  error: string | null;
}

// ─── Types ──────────────────────────────────────────────────────────

/** What `session.addDocuments` accepts (the insert shape). */
type DocDraft = Omit<RawDocument, 'id' | 'addedAt'>;

/** The lossless native export envelope. */
interface NativeExport {
  format: typeof NATIVE_MARKER;
  version: 1;
  exportedAt: string;
  embeddingModelId: string;
  engine: { kind: 'core' | 'langchain'; documents: number; chunks: number; dimensions: number };
  documents: RawDocument[];
}

/** Import lanes derived from a parse (see the raw-vector gap note below). */
interface ImportLanes {
  direct: DocDraft[];
  needsEmbed: DocDraft[];
  vectorOnly: number;
  vectorOnlyMismatched: number;
  empty: number;
}

/** Everything the preview/confirm stage needs, computed once at parse time. */
interface ImportPlan {
  formatId: string;
  fileName: string | null;
  totalRecords: number;
  recordsWithVectors: number;
  recordsWithTextOnly: number;
  dimensions: number | null;
  lanes: ImportLanes;
  previewRows: FlowPreviewRecord[];
}

/** Completion stats. */
interface ImportStats {
  imported: number;
  skipped: number;
  reEmbedded: number;
  totalParsed: number;
  formatId: string;
  durationMs: number;
  cancelled: boolean;
}

/** Fingerprint of the last completed full ingest (docs + model). */
interface IngestFingerprint {
  modelId: string;
  docsKey: string;
}

// ─── Pure helpers ───────────────────────────────────────────────────

/** First non-empty line of a text, trimmed for title derivation. */
function firstLine(text: string) {
  return text.split('\n').find((l) => l.trim().length > 0)?.trim().slice(0, 80) ?? '';
}

/** Truncate text for preview rows. */
function truncate(text: string, max = 80) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Human duration ("840ms" / "2.4s"). */
function formatDuration(ms: number) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

/** Strip a `RawDocument` down to the shape `addDocuments` accepts. */
function toDraft(doc: RawDocument): DocDraft {
  return {
    title: doc.title,
    text: doc.text,
    source: doc.source,
    ...(doc.category !== undefined ? { category: doc.category } : {}),
    ...(doc.meta !== undefined ? { meta: doc.meta } : {}),
    ...(doc.pages !== undefined ? { pages: doc.pages } : {}),
  };
}

/** Coerce one entry of a native export back into a valid `RawDocument`. */
function coerceNativeDocument(raw: unknown, index: number): RawDocument {
  if (raw === null || typeof raw !== 'object') {
    throw new Error(`Native export document #${index + 1} is not an object.`);
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.title !== 'string' || typeof obj.text !== 'string') {
    throw new Error(
      `Native export document #${index + 1} is missing its "title"/"text" string fields.`,
    );
  }
  const source = VALID_SOURCES.includes(obj.source as DocumentSource)
    ? (obj.source as DocumentSource)
    : 'import';
  const meta: Record<string, string | number> = {};
  if (obj.meta !== null && typeof obj.meta === 'object') {
    for (const [k, v] of Object.entries(obj.meta as Record<string, unknown>)) {
      if (typeof v === 'string' || typeof v === 'number') meta[k] = v;
    }
  }
  const pages = Array.isArray(obj.pages)
    ? obj.pages.filter(
        (p): p is { page: number; text: string } =>
          p !== null &&
          typeof p === 'object' &&
          typeof (p as { page?: unknown }).page === 'number' &&
          typeof (p as { text?: unknown }).text === 'string',
      )
    : undefined;
  return {
    id: typeof obj.id === 'string' && obj.id ? obj.id : `import-${index}`,
    title: obj.title,
    text: obj.text,
    source,
    ...(typeof obj.category === 'string' ? { category: obj.category } : {}),
    ...(Object.keys(meta).length > 0 ? { meta } : {}),
    ...(pages && pages.length > 0 ? { pages } : {}),
    addedAt: typeof obj.addedAt === 'number' ? obj.addedAt : Date.now(),
  };
}

/**
 * Sniff the block's own lossless export format. Returns `null` when the content
 * is not a native export (the four external formats fall through to core
 * detection); throws when the marker is present but the envelope is malformed.
 */
function parseNativeExport(content: string): NativeExport | null {
  const trimmed = content.trim();
  if (!trimmed.startsWith('{')) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null; // Not whole-content JSON — let core detection handle it.
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;
  if (obj.format !== NATIVE_MARKER) return null;
  if (!Array.isArray(obj.documents)) {
    throw new Error('Native knowledge-base export is malformed: expected a "documents" array.');
  }
  const documents = obj.documents.map(coerceNativeDocument);
  const engine =
    obj.engine !== null && typeof obj.engine === 'object'
      ? (obj.engine as Record<string, unknown>)
      : {};
  return {
    format: NATIVE_MARKER,
    version: 1,
    exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : '',
    embeddingModelId: typeof obj.embeddingModelId === 'string' ? obj.embeddingModelId : '',
    engine: {
      kind: engine.kind === 'langchain' ? 'langchain' : 'core',
      documents: typeof engine.documents === 'number' ? engine.documents : documents.length,
      chunks: typeof engine.chunks === 'number' ? engine.chunks : 0,
      dimensions: typeof engine.dimensions === 'number' ? engine.dimensions : 0,
    },
    documents,
  };
}

/** Map an external `ImportRecord` to a session document draft. */
function externalRecordToDraft(record: ImportRecord, formatId: string): DocDraft {
  const md = record.metadata ?? {};
  const title =
    typeof md.title === 'string' && md.title.trim().length > 0
      ? md.title
      : firstLine(record.text ?? '') || record.id;
  const meta: Record<string, string | number> = {
    importFormat: formatId,
    importId: record.id,
  };
  for (const [k, v] of Object.entries(md)) {
    if (k === 'title' || k === 'category') continue;
    if (typeof v === 'string' || typeof v === 'number') meta[k] = v;
  }
  return {
    title,
    text: record.text ?? '',
    source: 'import',
    ...(typeof md.category === 'string' ? { category: md.category } : {}),
    meta,
  };
}

/** Categorize parsed external records into import lanes. */
function buildExternalLanes(
  records: ImportRecord[],
  formatId: string,
  targetDims: number | null,
): ImportLanes {
  const direct: DocDraft[] = [];
  const needsEmbed: DocDraft[] = [];
  let vectorOnly = 0;
  let vectorOnlyMismatched = 0;
  let empty = 0;
  for (const r of records) {
    const hasText = typeof r.text === 'string' && r.text.trim().length > 0;
    const dimsUsable = r.vector != null && (targetDims === null || r.vector.length === targetDims);
    if (hasText && dimsUsable) {
      direct.push(externalRecordToDraft(r, formatId));
    } else if (hasText) {
      needsEmbed.push(externalRecordToDraft(r, formatId));
    } else if (r.vector != null) {
      vectorOnly++;
      if (targetDims !== null && r.vector.length !== targetDims) vectorOnlyMismatched++;
    } else {
      empty++;
    }
  }
  return { direct, needsEmbed, vectorOnly, vectorOnlyMismatched, empty };
}

/** Serialize a corpus document for CSV/JSONL export (round-trippable). */
function docToImportRecord(doc: RawDocument): ImportRecord {
  return {
    id: doc.id,
    text: doc.text,
    metadata: {
      title: doc.title,
      source: doc.source,
      ...(doc.category !== undefined ? { category: doc.category } : {}),
      ...(doc.meta ?? {}),
    },
  };
}

/** Count documents by a key extractor (per-source/category breakdowns). */
function countBy(docs: RawDocument[], key: (d: RawDocument) => string) {
  const counts: Record<string, number> = {};
  for (const d of docs) {
    const k = key(d);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

// ─── Small presentational bits ──────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function PreviewStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-border bg-background px-2 py-1.5">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );
}

// ─── Data-management body ───────────────────────────────────────────

/**
 * Import / export / storage / drift / batching over the owned core corpus.
 *
 * Import and reindex are REAL — they run through the engine's `ingest` / `clear`
 * over the block-owned corpus (no frozen-session estimate). The remaining
 * observability gaps are disclosed in-UI:
 * - Raw-vector import: `addDocuments` only accepts text documents, so
 *   text-bearing records are re-embedded (their source vectors are discarded)
 *   and vector-only records are skipped.
 * - Compression stats: `createKnowledgeBaseEngine` encapsulates its VectorDB and
 *   does not expose it, so the observability card shows a Raw-F32 size estimate
 *   (chunks × dims × 4) rather than live `getCompressionStats()`.
 * - Per-document chunk counts: `engine.stats()` reports totals only, so the card
 *   breaks the corpus down by source/category document counts instead.
 */
function DataManager({ session }: { session: Session }) {
  const { quota, refresh: refreshQuota } = useStorageQuota();

  // Gate navigator-derived values behind a client mount (hydration safety).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // ── Engine stats (refreshed whenever the corpus settles) ─────────
  const [engineStats, setEngineStats] = useState<EngineStats | null>(null);
  useEffect(() => {
    if (session.busy) return;
    let alive = true;
    void session.engine
      .stats()
      .then((s) => {
        if (alive) setEngineStats(s);
      })
      .catch(() => {
        if (alive) setEngineStats(null);
      });
    return () => {
      alive = false;
    };
  }, [session.engine, session.busy, session.documents]);

  const targetDims = engineStats && engineStats.dimensions > 0 ? engineStats.dimensions : null;

  // ── Adaptive batch sizing (ingest context; drives import/reindex batches) ─
  const batch = useAdaptiveBatchSize({
    taskType: 'ingestion',
    modelDimensions: targetDims ?? DEFAULT_DIMENSIONS,
  });

  // ── Import state (parse/preview grounded in useImportExport → core) ──
  const {
    parsePreview,
    isParsing,
    error: parseError,
    reset: resetParse,
  } = useImportExport({
    db: { dimensions: targetDims ?? DEFAULT_DIMENSIONS, addMany: async () => {} },
  });

  const [stage, setStage] = useState<'idle' | 'preview' | 'importing' | 'complete'>('idle');
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [reEmbed, setReEmbed] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [importProgress, setImportProgress] = useState<ImportProgressLike | null>(null);
  const [importStats, setImportStats] = useState<ImportStats | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const importAbortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Export state ─────────────────────────────────────────────────
  const [exportingFormat, setExportingFormat] = useState<string | null>(null);
  const [lastExport, setLastExport] = useState<{
    formatId: string;
    records: number;
    bytes: number;
    at: string;
  } | null>(null);

  // ── Drift + reindex state ────────────────────────────────────────
  const [lastIngest, setLastIngest] = useState<IngestFingerprint | null>(null);
  const [reindexRunning, setReindexRunning] = useState(false);
  const [reindexProgress, setReindexProgress] = useState<ReindexProgressLike | null>(null);
  const [reindexError, setReindexError] = useState<string | null>(null);
  const reindexAbortRef = useRef<AbortController | null>(null);
  const prevBusyRef = useRef(session.busy);

  const docsKey = session.documents.map((d) => d.id).join('|');

  // Fingerprint the corpus after every successfully settled ingest. The hook
  // re-ingests the whole corpus on a model change, so at any error-free
  // busy→idle transition the stored vectors match the active model; a stale
  // fingerprint (model changed, no clean settle) is what the drift banner
  // reports.
  useEffect(() => {
    const wasBusy = prevBusyRef.current;
    prevBusyRef.current = session.busy;
    if (session.busy) return;
    if (session.documents.length === 0) {
      setLastIngest(null);
      return;
    }
    if (session.error) return; // Failed ingest — keep the stale fingerprint.
    if (
      wasBusy ||
      lastIngest === null ||
      (lastIngest.docsKey !== docsKey && lastIngest.modelId === session.embeddingModelId)
    ) {
      setLastIngest({ modelId: session.embeddingModelId, docsKey });
    }
  }, [
    session.busy,
    session.error,
    session.documents.length,
    session.embeddingModelId,
    docsKey,
    lastIngest,
  ]);

  const drift =
    lastIngest !== null &&
    session.documents.length > 0 &&
    lastIngest.modelId !== session.embeddingModelId;

  const importing = stage === 'importing';
  const busyAny =
    session.busy || importing || reindexRunning || exportingFormat !== null || isParsing;

  // ── Import handlers ──────────────────────────────────────────────

  const resetImport = () => {
    importAbortRef.current?.abort();
    resetParse();
    setStage('idle');
    setPlan(null);
    setReEmbed(false);
    setImportProgress(null);
    setImportStats(null);
    setImportError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  /** Parse content into a plan (native sniff first, then core detection). */
  const handleContent = async (content: string, fileName: string | null) => {
    resetParse();
    setImportError(null);
    setImportStats(null);
    setImportProgress(null);
    setPlan(null);

    if (!content.trim()) {
      setImportError('The provided content is empty.');
      return;
    }

    // 1. The block's own lossless format.
    let native: NativeExport | null = null;
    try {
      native = parseNativeExport(content);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
      return;
    }
    if (native) {
      if (native.documents.length === 0) {
        setImportError('Native knowledge-base export contains no documents.');
        return;
      }
      setPlan({
        formatId: NATIVE_FORMAT_ID,
        fileName,
        totalRecords: native.documents.length,
        recordsWithVectors: 0,
        recordsWithTextOnly: native.documents.length,
        dimensions: native.engine.dimensions > 0 ? native.engine.dimensions : null,
        lanes: {
          direct: native.documents.map(toDraft),
          needsEmbed: [],
          vectorOnly: 0,
          vectorOnlyMismatched: 0,
          empty: 0,
        },
        previewRows: native.documents.slice(0, MAX_PREVIEW_RECORDS).map((d) => ({
          id: d.id,
          text: truncate(`${d.title} - ${d.text}`),
          hasVector: false,
        })),
      });
      setStage('preview');
      return;
    }

    // 2. Pinecone / ChromaDB / CSV / JSONL via useImportExport → core.
    const result = await parsePreview({ content });
    if (!result) return; // Hook error state renders below.
    setPlan({
      formatId: result.format,
      fileName,
      totalRecords: result.totalRecords,
      recordsWithVectors: result.recordsWithVectors,
      recordsWithTextOnly: result.recordsWithTextOnly,
      dimensions: result.dimensions,
      lanes: buildExternalLanes(result.records, result.format, targetDims),
      previewRows: result.records.slice(0, MAX_PREVIEW_RECORDS).map((r) => ({
        id: r.id,
        ...(r.text ? { text: truncate(r.text) } : {}),
        hasVector: r.vector != null,
      })),
    });
    setStage('preview');
  };

  const handleFile = async (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      setImportError(
        `File is ${(file.size / (1024 * 1024)).toFixed(1)} MB - the import limit is 50 MB.`,
      );
      return;
    }
    const content = await file.text();
    await handleContent(content, file.name);
  };

  /** Confirmed import: batched `addDocuments` with cancel between batches. */
  const runImport = async () => {
    if (!plan || stage !== 'preview' || session.busy || reindexRunning) return;
    const docs = reEmbed ? [...plan.lanes.direct, ...plan.lanes.needsEmbed] : plan.lanes.direct;
    if (docs.length === 0) return;

    const controller = new AbortController();
    importAbortRef.current = controller;
    setStage('importing');
    setImportError(null);
    setImportProgress({ phase: 'validating', overallCompleted: 0, overallTotal: docs.length });

    const started = performance.now();
    const batchSize = Math.max(1, batch.batchSize);
    let imported = 0;
    try {
      for (let i = 0; i < docs.length; i += batchSize) {
        if (controller.signal.aborted) break;
        setImportProgress({
          phase: 'embedding',
          overallCompleted: imported,
          overallTotal: docs.length,
        });
        await session.addDocuments(docs.slice(i, i + batchSize));
        imported += Math.min(batchSize, docs.length - i);
        setImportProgress({
          phase: 'importing',
          overallCompleted: imported,
          overallTotal: docs.length,
        });
      }
      setImportStats({
        imported,
        skipped: plan.totalRecords - imported,
        reEmbedded: reEmbed ? Math.max(0, imported - plan.lanes.direct.length) : 0,
        totalParsed: plan.totalRecords,
        formatId: plan.formatId,
        durationMs: performance.now() - started,
        cancelled: controller.signal.aborted,
      });
      setStage('complete');
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
      setStage('preview');
    } finally {
      setImportProgress(null);
      importAbortRef.current = null;
      void refreshQuota();
    }
  };

  const cancelImport = () => importAbortRef.current?.abort();

  // ── Export handlers ──────────────────────────────────────────────

  const exportDisabled = busyAny || session.documents.length === 0;

  const handleExport = (formatId: string) => {
    if (exportDisabled) return;
    setExportingFormat(formatId);
    try {
      let content: string;
      let filename: string;
      let mime: string;
      if (formatId === NATIVE_FORMAT_ID) {
        const envelope: NativeExport = {
          format: NATIVE_MARKER,
          version: 1,
          exportedAt: new Date().toISOString(),
          embeddingModelId: session.embeddingModelId,
          engine: {
            kind: session.engineKind,
            documents: session.documents.length,
            chunks: engineStats?.chunks ?? 0,
            dimensions: engineStats?.dimensions ?? 0,
          },
          documents: session.documents,
        };
        content = JSON.stringify(envelope, null, 2);
        filename = 'knowledge-base-export.json';
        mime = 'application/json';
      } else {
        const records = session.documents.map(docToImportRecord);
        if (formatId === 'csv') {
          content = exportToCSV(records, { includeVectors: false });
          filename = 'knowledge-base-export.csv';
          mime = 'text/csv';
        } else {
          content = exportToJSONL(records, { includeVectors: false });
          filename = 'knowledge-base-export.jsonl';
          mime = 'application/jsonl';
        }
      }
      downloadBlob(content, filename, mime);
      setLastExport({
        formatId,
        records: session.documents.length,
        bytes: new Blob([content]).size,
        at: new Date().toISOString(),
      });
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    } finally {
      setExportingFormat(null);
    }
  };

  // ── Reindex (drift repair + same-model re-embed) ─────────────────

  const reindex = async () => {
    if (session.busy || reindexRunning || importing || session.documents.length === 0) return;
    const controller = new AbortController();
    reindexAbortRef.current = controller;
    setReindexRunning(true);
    setReindexError(null);
    const snapshot = session.documents.map(toDraft);
    setReindexProgress({ completed: 0, total: snapshot.length, phase: 'embedding' });
    try {
      // Re-assert the current model id first (harmless when the hook no-ops a
      // same-value set); the snapshot clear→re-add below is the guaranteed
      // same-model re-embed route over the owned corpus.
      session.setEmbeddingModelId(session.embeddingModelId);
      await session.clearAll();
      const batchSize = Math.max(1, batch.batchSize);
      let completed = 0;
      for (let i = 0; i < snapshot.length; i += batchSize) {
        if (controller.signal.aborted) break;
        await session.addDocuments(snapshot.slice(i, i + batchSize));
        completed += Math.min(batchSize, snapshot.length - i);
        setReindexProgress({
          completed,
          total: snapshot.length,
          phase: completed === snapshot.length ? 'indexing' : 'embedding',
        });
      }
      if (!controller.signal.aborted) {
        setLastIngest({ modelId: session.embeddingModelId, docsKey: '' });
      }
    } catch (err) {
      setReindexError(err instanceof Error ? err.message : String(err));
    } finally {
      setReindexRunning(false);
      setReindexProgress(null);
      reindexAbortRef.current = null;
      void refreshQuota();
    }
  };

  const cancelReindex = () => reindexAbortRef.current?.abort();

  // ── Derived display values ───────────────────────────────────────

  const docsToImport = plan
    ? reEmbed
      ? plan.lanes.direct.length + plan.lanes.needsEmbed.length
      : plan.lanes.direct.length
    : 0;
  const importErrorMessage = importError ?? parseError?.message ?? null;
  const dimensionMismatch =
    plan !== null &&
    plan.dimensions !== null &&
    targetDims !== null &&
    plan.dimensions !== targetDims;

  const chunkCount = engineStats?.chunks ?? 0;
  const dims = engineStats?.dimensions ?? 0;
  const estimatedBytes = chunkCount * dims * 4;
  const sourceCounts = countBy(session.documents, (d) => d.source);
  const categoryCounts = countBy(session.documents, (d) => d.category ?? 'uncategorized');

  return (
    <div className="flex flex-col gap-4">
      {/* ── Drift banner (session model ≠ last-full-ingest model) ── */}
      {drift && lastIngest && (
        <div
          data-stored-model={lastIngest.modelId}
          data-current-model={session.embeddingModelId}
          data-affected-docs={session.documents.length}
          data-affected-chunks={chunkCount}
          className="flex flex-col gap-1.5"
        >
          <EmbeddingDriftBanner
            className="max-w-none"
            storedModelId={lastIngest.modelId}
            currentModelId={session.embeddingModelId}
            isReindexing={reindexRunning}
            progress={reindexProgress}
            onReindex={() => void reindex()}
            onCancel={cancelReindex}
          />
          <p className="text-xs text-muted-foreground">
            Affected: {session.documents.length} document
            {session.documents.length === 1 ? '' : 's'} · {chunkCount} chunk
            {chunkCount === 1 ? '' : 's'}
            {session.busy && ' · corpus ingest in progress - reindex is available when idle'}
          </p>
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {/* ════════ Left column: import + export ════════ */}
        <div className="flex min-w-0 flex-col gap-4">
          <SectionCard title="Import vectors">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Pinecone JSON · ChromaDB JSON · CSV · JSONL · Native JSON (≤50{' '}MB)
              </span>
              {(plan || isParsing) && (
                <span
                  role="group"
                  aria-label="Detected import format"
                  className="inline-flex"
                >
                  <FormatDetectionBadge format={plan?.formatId ?? null} colorMap={FORMAT_COLOR_MAP} />
                </span>
              )}
            </div>

            {importErrorMessage && (
              <p
                className="flex items-start gap-1.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
              >
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1">{importErrorMessage}</span>
              </p>
            )}

            {/* Idle: dropzone + paste lane */}
            {stage === 'idle' && (
              <div className="flex flex-col gap-3">
                <div
                  role="button"
                  aria-label="Import file upload"
                  tabIndex={0}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files[0];
                    if (file) void handleFile(file);
                  }}
                  className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border p-6 text-center transition-colors hover:border-primary/50"
                >
                  <Upload className="size-6 text-muted-foreground" aria-hidden="true" />
                  <p className="text-sm font-medium">Drop an export file or click to browse</p>
                  <p className="text-xs text-muted-foreground">
                    {SUPPORTED_EXTENSIONS.join(', ')} - the format is auto-detected from content
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={SUPPORTED_EXTENSIONS.join(',')}
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleFile(file);
                    }}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="vdm-import-paste-input"
                    className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
                  >
                    <ClipboardPaste className="size-3.5" aria-hidden="true" />
                    Or paste export content
                  </label>
                  <textarea
                    id="vdm-import-paste-input"
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    rows={3}
                    placeholder='{"vectors": [...]} · {"ids": [...]} · CSV · JSONL'
                    className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
                  />
                  <button
                    type="button"
                    disabled={!pasteText.trim() || isParsing}
                    onClick={() => void handleContent(pasteText, null)}
                    className="self-end rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
                  >
                    {isParsing ? 'Parsing…' : 'Parse pasted content'}
                  </button>
                </div>
              </div>
            )}

            {/* Preview / importing */}
            {plan && (stage === 'preview' || stage === 'importing') && (
              <div
                role="group"
                aria-label="Import preview"
                data-total-records={plan.totalRecords}
                data-with-vectors={plan.recordsWithVectors}
                data-text-only={plan.recordsWithTextOnly}
                data-dimensions={plan.dimensions ?? ''}
                data-importable={docsToImport}
                className="flex min-w-0 flex-col gap-3 overflow-x-auto"
              >
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <FileText className="size-3.5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 truncate font-medium text-foreground">
                    {plan.fileName ?? 'Pasted content'}
                  </span>
                  <span>· {FORMAT_LABELS[plan.formatId] ?? plan.formatId}</span>
                </p>

                <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  <PreviewStat label="Total" value={plan.totalRecords.toLocaleString()} />
                  <PreviewStat label="With vectors" value={plan.recordsWithVectors.toLocaleString()} />
                  <PreviewStat label="Text-only" value={plan.recordsWithTextOnly.toLocaleString()} />
                  <PreviewStat
                    label="Dimensions"
                    value={plan.dimensions !== null ? String(plan.dimensions) : '-'}
                  />
                </dl>

                {dimensionMismatch && (
                  <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      Dimension mismatch: source {plan.dimensions}d vs current index {targetDims}d.
                      Text-bearing records are re-embedded with the session model.
                    </span>
                  </p>
                )}

                {/* GAP: raw-vector insert is not part of the addDocuments API. */}
                {plan.lanes.vectorOnly > 0 && (
                  <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      {plan.lanes.vectorOnly} vector-only record
                      {plan.lanes.vectorOnly === 1 ? '' : 's'} will be skipped: the corpus only
                      accepts text documents (raw-vector insert is not part of the engine&apos;s ingest
                      API).
                      {plan.lanes.vectorOnlyMismatched > 0 &&
                        ` ${plan.lanes.vectorOnlyMismatched} of them also mismatch the current index dimensions.`}
                    </span>
                  </p>
                )}

                {plan.recordsWithVectors > 0 && plan.lanes.direct.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Text-bearing records import as documents and are re-embedded by the engine -
                    their source vectors are not inserted.
                  </p>
                )}

                {/* Re-embed toggle */}
                {plan.lanes.needsEmbed.length > 0 && (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium">Re-embed records without usable vectors</p>
                      <p className="text-xs text-muted-foreground">
                        {plan.lanes.needsEmbed.length} record
                        {plan.lanes.needsEmbed.length === 1 ? ' has' : 's have'} text but a missing
                        or dimension-mismatched vector. Enable to embed them with the session model (
                        {session.embeddingModelId}); otherwise they are skipped.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={reEmbed}
                      disabled={importing}
                      onClick={() => setReEmbed((v) => !v)}
                      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
                        reEmbed ? 'bg-primary' : 'bg-muted'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 size-4 rounded-full bg-background shadow transition-all ${
                          reEmbed ? 'left-[1.125rem]' : 'left-0.5'
                        }`}
                      />
                      <span className="sr-only">Re-embed records without usable vectors</span>
                    </button>
                  </div>
                )}

                {/* First-N record table + phased progress (the primitive's role) */}
                <VectorImportFlow
                  className="max-w-none"
                  records={plan.previewRows}
                  progress={importProgress}
                  isImporting={importing}
                />

                {/* sr-only progress mirror for the E2E driver */}
                {importing && importProgress && (
                  <span
                    className="sr-only"
                    data-phase={importProgress.phase}
                    data-completed={importProgress.overallCompleted}
                    data-total={importProgress.overallTotal}
                  >
                    {importProgress.phase} {importProgress.overallCompleted}/
                    {importProgress.overallTotal}
                  </span>
                )}

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={resetImport}
                    disabled={importing}
                    className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
                  >
                    Change file
                  </button>
                  {importing ? (
                    <button
                      type="button"
                      onClick={cancelImport}
                      className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      <Square className="size-3.5" aria-hidden="true" />
                      Cancel import
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={docsToImport === 0 || session.busy || reindexRunning}
                      onClick={() => void runImport()}
                      className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50"
                    >
                      <Play className="size-3.5" aria-hidden="true" />
                      Import {docsToImport.toLocaleString()} of {plan.totalRecords.toLocaleString()}{' '}
                      records
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Completion stats */}
            {stage === 'complete' && importStats && (
              <div
                role="group"
                aria-label="Import result"
                data-imported={importStats.imported}
                data-skipped={importStats.skipped}
                data-reembedded={importStats.reEmbedded}
                data-total={importStats.totalParsed}
                data-format={importStats.formatId}
                data-cancelled={importStats.cancelled ? 'true' : 'false'}
                data-duration-ms={Math.round(importStats.durationMs)}
                className="flex flex-col gap-2"
              >
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  {importStats.cancelled ? (
                    <>
                      <AlertTriangle className="size-4 shrink-0 text-amber-500" aria-hidden="true" />
                      Import cancelled
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="size-4 shrink-0 text-emerald-500" aria-hidden="true" />
                      Import complete
                    </>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  Imported {importStats.imported.toLocaleString()} · Skipped{' '}
                  {importStats.skipped.toLocaleString()} · Re-embedded{' '}
                  {importStats.reEmbedded.toLocaleString()} ·{' '}
                  {FORMAT_LABELS[importStats.formatId] ?? importStats.formatId} ·{' '}
                  {formatDuration(importStats.durationMs)}
                </p>
                <button
                  type="button"
                  onClick={resetImport}
                  className="inline-flex items-center gap-1.5 self-start rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <RotateCcw className="size-3.5" aria-hidden="true" />
                  Import another file
                </button>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Export corpus">
            <div
              role="group"
              aria-label="Export panel"
              data-record-count={session.documents.length}
              data-exporting={exportingFormat ?? undefined}
              data-last-format={lastExport?.formatId ?? undefined}
              data-last-records={lastExport?.records ?? undefined}
              data-last-bytes={lastExport?.bytes ?? undefined}
              className="min-w-0 overflow-x-auto"
            >
              <VectorExportPanel
                className="max-w-none"
                formats={EXPORT_FORMATS}
                recordCount={session.documents.length}
                exporting={exportingFormat ?? false}
                {...(lastExport ? { lastExport } : {})}
                onExport={handleExport}
                disabled={exportDisabled}
              />
            </div>
            {/* sr-only driver mirrors — the export panel exposes no internal
                testids; these buttons invoke the exact same handler. */}
            <div className="sr-only">
              {EXPORT_FORMATS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  disabled={exportDisabled}
                  onClick={() => handleExport(f.id)}
                  className="focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  Export {f.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Exports carry the raw documents and metadata. Stored vectors are regenerated by
              re-embedding on import. Native JSON is lossless and round-trip re-importable; CSV/JSONL
              round-trip text + metadata.
            </p>
          </SectionCard>
        </div>

        {/* ════════ Right column: storage, observability, maintenance, batching ════════ */}
        <div className="flex min-w-0 flex-col gap-4">
          <SectionCard title="Storage">
            <div
              role="group"
              aria-label="Storage usage"
              data-used-bytes={quota?.usedBytes ?? undefined}
              data-quota-bytes={quota?.quotaBytes ?? undefined}
              className="min-w-0 overflow-x-auto"
            >
              <StorageMeter
                className="max-w-none"
                quota={
                  quota && quota.quotaBytes > 0
                    ? { usedBytes: quota.usedBytes, quotaBytes: quota.quotaBytes }
                    : undefined
                }
              />
            </div>
          </SectionCard>

          <SectionCard title="Vector storage">
            <div
              role="group"
              aria-label="Vector storage stats"
              data-docs={session.documents.length}
              data-chunks={chunkCount}
              data-dimensions={dims}
              className="flex min-w-0 flex-col gap-3 overflow-x-auto"
            >
              <VectorStorageObservability
                className="max-w-none"
                stats={{
                  ratio: 1,
                  originalSizeBytes: estimatedBytes,
                  compressedSizeBytes: estimatedBytes,
                  vectorCount: chunkCount,
                }}
                tier="raw"
              />
              <p className="text-xs text-muted-foreground">
                {session.documents.length} document{session.documents.length === 1 ? '' : 's'} ·{' '}
                {chunkCount} chunk{chunkCount === 1 ? '' : 's'} ·{' '}
                {dims > 0 ? `${dims}d vectors` : 'dimensions unknown'} (engine: {session.engineKind})
              </p>
              {(sourceCounts.length > 0 || categoryCounts.length > 0) && (
                <dl className="flex flex-col gap-1 text-xs text-muted-foreground">
                  {sourceCounts.length > 0 && (
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      <dt className="font-medium text-foreground">By source:</dt>
                      {sourceCounts.map(([source, count]) => (
                        <dd key={source} className="tabular-nums">
                          {source} · {count}
                        </dd>
                      ))}
                    </div>
                  )}
                  {categoryCounts.length > 0 && (
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      <dt className="font-medium text-foreground">By category:</dt>
                      {categoryCounts.map(([category, count]) => (
                        <dd key={category} className="tabular-nums">
                          {category} · {count}
                        </dd>
                      ))}
                    </div>
                  )}
                </dl>
              )}
              {/* GAP: getCompressionStats() needs the VectorDB handle, which
                  createKnowledgeBaseEngine encapsulates and does not expose. */}
              <p className="text-xs text-muted-foreground">
                Sizes are estimated as chunks × dimensions × 4 bytes (Raw F32). Live compression
                stats via <code className="font-mono">getCompressionStats()</code> need the
                underlying VectorDB, which the core engine encapsulates; per-document chunk counts
                are likewise unavailable (<code className="font-mono">engine.stats()</code> reports
                totals only).
              </p>
            </div>
          </SectionCard>

          <SectionCard title="Maintenance">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium">Reindex corpus</p>
                <p className="text-xs text-muted-foreground">
                  Re-embeds all {session.documents.length} document
                  {session.documents.length === 1 ? '' : 's'} ({chunkCount} chunk
                  {chunkCount === 1 ? '' : 's'}) with the active model and chunking mode (
                  {session.chunking}).
                </p>
              </div>
              {reindexRunning ? (
                <button
                  type="button"
                  onClick={cancelReindex}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <Square className="size-3.5" aria-hidden="true" />
                  Cancel
                </button>
              ) : (
                <button
                  type="button"
                  disabled={session.busy || importing || session.documents.length === 0}
                  onClick={() => void reindex()}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50"
                >
                  <RefreshCw className="size-3.5" aria-hidden="true" />
                  Reindex
                </button>
              )}
            </div>
            {reindexRunning && reindexProgress && (
              <p className="text-xs tabular-nums text-muted-foreground">
                {reindexProgress.phase === 'indexing' ? 'Rebuilding index' : 'Re-embedding'} -{' '}
                {reindexProgress.completed}/{reindexProgress.total} documents
              </p>
            )}
            {reindexError && (
              <p className="flex items-start gap-1.5 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                {reindexError}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Reindex snapshots the documents, clears the index, and re-adds them in batches of{' '}
              {Math.max(1, batch.batchSize)}. Cancelling stops between batches - documents from the
              snapshot not yet re-added are not restored.
            </p>
          </SectionCard>

          <div
            data-batch-size={batch.batchSize}
            className="flex flex-col gap-1.5"
          >
            {mounted && <AdaptiveBatchCard className="max-w-none" result={batch} />}
            <p className="text-xs text-muted-foreground">
              Used as the ingest batch size for imports and reindexing on this device.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── The block ──────────────────────────────────────────────────────

/**
 * Vector Data Manager block: an owned core knowledge-base corpus with a
 * 4-format import lane, round-trippable export, drift + reindex, and storage /
 * vector observability. Locked to the core engine (no core⇄langchain toggle);
 * the second embedding model is the drift-driver. No model bytes download until
 * an explicit in-block action (load, seed, import, or a model switch).
 */
export function VectorDataManagerBlock() {
  // The hook calls `createEngine(kind)` on mount and on every embedding-model
  // change, passing ONLY `kind` — so read the current model id from a ref kept
  // in sync each render. createKnowledgeBaseEngine is imported statically (core
  // only): no langchain module is ever referenced.
  const idRef = useRef(DEFAULT_EMBEDDING_MODEL_ID);
  const kb = useKnowledgeBase({
    embeddingModelId: DEFAULT_EMBEDDING_MODEL_ID,
    engineKind: 'core',
    createEmbeddingModel: (id, onProgress) =>
      transformers.embedding(id, { onProgress: (p) => onProgress(p as AnyLoadProgress) }),
    isModelCached: (id) => isModelCached(id),
    createEngine: () => {
      const embeddingModel = transformers.embedding(idRef.current);
      // Lazy + never invoked: this block has no ask/generate surface, so the
      // answer model never downloads. The device pre-probe follows the
      // chat/kb pattern for the (unused) path.
      const getLanguageModel = async () => {
        const device = (await isWebGPUSupported()) ? 'webgpu' : 'wasm';
        return transformers.languageModel(ANSWER_MODEL_ID, { device });
      };
      return createKnowledgeBaseEngine({ embeddingModel, getLanguageModel });
    },
  });
  useEffect(() => {
    idRef.current = kb.embeddingModelId;
  });

  const [seedText, setSeedText] = useState('');

  const addSeed = async () => {
    const text = seedText.trim();
    if (!text || !kb.engine || kb.busy) return;
    await kb.addDocuments([{ title: firstLine(text) || 'Untitled note', text, source: 'text' }]);
    setSeedText('');
  };

  // Build the local session from the hook return (rendered only when ready).
  const session: Session | null = kb.engine
    ? {
        engine: kb.engine,
        engineKind: 'core',
        documents: kb.documents,
        addDocuments: kb.addDocuments,
        removeDocument: kb.removeDocument,
        clearAll: kb.clearAll,
        chunking: kb.chunking,
        setChunking: kb.setChunking,
        chunkSize: kb.chunkSize,
        setChunkSize: kb.setChunkSize,
        embeddingModelId: kb.embeddingModelId,
        setEmbeddingModelId: kb.setEmbeddingModelId,
        busy: kb.busy,
        error: kb.error,
      }
    : null;

  const modelMeta = EMBEDDING_MODEL_META[kb.embeddingModelId] ?? {
    name: kb.embeddingModelId,
    size: '',
  };

  const statusText = kb.busy
    ? kb.modelStatus === 'loading'
      ? `loading embedding model… ${Math.round(kb.modelProgress * 100)}%`
      : kb.switching
        ? `re-embedding ${kb.documents.length} docs through ${modelMeta.name}…`
        : 'working…'
    : kb.error
      ? 'error'
      : kb.documents.length > 0
        ? `ready - ${kb.documents.length} docs · ${kb.stats?.chunks ?? 0} chunks`
        : 'idle - import an export file or add a note to build the corpus';

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4">
      {/* ── status + error (block-root driver contract) ── */}
      <p
        role="status"
        aria-live="polite"
        className="text-xs text-muted-foreground"
      >
        {statusText}
      </p>
      {kb.error && (
        <p className="text-xs text-destructive">
          {kb.error}
        </p>
      )}

      {/* ── embedding-model gate (explicit-action download) ── */}
      <div
        role="group"
        aria-label="Embedding model status"
        data-status={kb.modelStatus}
        data-model-id={kb.embeddingModelId}
        className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Embedding model
          </span>
          <div
            role="group"
            aria-label="Embedding model"
            className="inline-flex items-center rounded-md border border-border bg-muted/40 p-0.5"
          >
            {EMBEDDING_MODEL_IDS.map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={kb.embeddingModelId === id}
                disabled={kb.busy || !kb.engine || kb.embeddingModelId === id}
                onClick={() => kb.setEmbeddingModelId(id)}
                className={cn(
                  'inline-flex h-7 items-center rounded px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  kb.embeddingModelId === id
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                  (kb.busy || !kb.engine) && kb.embeddingModelId !== id && 'opacity-60',
                )}
              >
                {EMBEDDING_MODEL_META[id].name}
              </button>
            ))}
          </div>
        </div>

        {kb.modelStatus === 'idle' ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium">{modelMeta.name}</span>
              {modelMeta.size ? ` (${modelMeta.size})` : ''} - not loaded. It downloads on Load, the
              first import/seed, or a model switch.
            </p>
            <button
              type="button"
              disabled={!kb.engine || kb.busy}
              onClick={() => void kb.loadModel()}
              className="inline-flex h-7 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
            >
              Load embedding model
            </button>
          </div>
        ) : (
          <ModelDownloader
            name={modelMeta.name}
            size={modelMeta.size || undefined}
            category="Embedding"
            progress={kb.modelProgressValue}
            cached={kb.modelCached}
            ready={kb.modelReady}
            className="max-w-sm"
          />
        )}
        <p className="text-xs text-muted-foreground">
          Switching the model re-embeds the whole corpus through the new space (drift banner appears
          until the re-ingest settles).
        </p>
      </div>

      {/* ── seed lane (text-paste → one document) ── */}
      <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Seed the corpus
          </span>
          <button
            type="button"
            onClick={() => setSeedText(SAMPLE_NOTE)}
            className="inline-flex h-7 items-center rounded-md border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            Load sample
          </button>
        </div>
        <textarea
          aria-label="Seed text"
          value={seedText}
          onChange={(e) => setSeedText(e.target.value)}
          rows={3}
          placeholder="Paste a note or passage to add it as a document…"
          className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
        />
        <button
          type="button"
          disabled={!kb.engine || kb.busy || !seedText.trim()}
          onClick={() => void addSeed()}
          className="inline-flex h-8 items-center gap-1.5 self-start rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
        >
          <Plus className="size-3.5" aria-hidden="true" />
          {kb.busy ? 'Adding…' : 'Add note'}
        </button>
      </div>

      {/* ── data-management body (import / export / storage / drift / batch) ── */}
      {session ? (
        <DataManager session={session} />
      ) : (
        <p className="p-4 text-sm text-muted-foreground">Preparing engine…</p>
      )}
    </div>
  );
}
