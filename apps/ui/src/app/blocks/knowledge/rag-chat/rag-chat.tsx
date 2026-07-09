'use client';

/**
 * @file rag-chat.tsx
 * @description Grounded RAG chat over your own corpus (text paste + sample corpus + PDF ingest with off/recursive/semantic chunking) — streaming token-by-token answers with inline citations and page-attributed sources, over a Core ⇄ LangChain engine toggle.
 * @constraint No model bytes on page load: the embedding model downloads on first ingest, the granite answer model on first ask (engine-owned lazy singletons).
 */

import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Loader2, Trash2, X } from 'lucide-react';
import {
  createKnowledgeBaseEngine,
  isWebGPUSupported,
  recursiveChunk,
  type ChunkingMode,
  type DocumentSource,
  type KBSearchResult,
  type KnowledgeBaseEngine,
  type RawDocument,
} from '@localmode/core';
import { useKnowledgeBase } from '@localmode/react';
import { transformers, isModelCached } from '@localmode/transformers';

import { DownloadProgress, ModelDownloader } from '@/components/model-downloader';
import {
  ChunkBoundaryVisualizer,
  type ChunkInfo,
} from '@/components/chunk-boundary-visualizer';
import { FileDropzone, type RejectedFile } from '@/components/file-dropzone';
import { IndexedDocumentCard } from '@/components/indexed-document-card';
import { SegmentedModePicker } from '@/components/segmented-mode-picker';
import { ParameterSlider } from '@/components/parameter-slider';
import { MultiStepPipelineTracker } from '@/components/pipeline-tracker';
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from '@/components/sources';
import { SourceCitationList } from '@/components/source-citation-list';
import {
  InlineCitation,
  InlineCitationCard,
  InlineCitationCardBody,
  InlineCitationCardTrigger,
  InlineCitationCarousel,
  InlineCitationSource,
  InlineCitationQuote,
} from '@/components/inline-citation';
import { cn } from '@/lib/utils';

/* ─────────────────────────────── constants ────────────────────────────── */

/** Embedding model that defines the corpus space (~34 MB). */
const DEFAULT_EMBEDDING_MODEL_ID = 'Xenova/bge-small-en-v1.5';

/** Display metadata for the embedding model card. */
const EMBEDDING_MODEL_META: Record<string, { name: string; size: string }> = {
  'Xenova/bge-small-en-v1.5': { name: 'BGE Small EN v1.5', size: '34 MB' },
};

/** Small instruct model both engines use for grounded answers (loads on first ask). */
const ANSWER_MODEL_ID = 'onnx-community/granite-4.0-350m-ONNX-web';

/** Generation budget for the LangChain engine's ChatLocalMode. */
const GENERATION_MAX_TOKENS = 512;

/** Retrieval depth for grounded asks (matches both engines' DEFAULT_ASK_TOP_K). */
const RAG_TOP_K = 4;

/** Max upload size for the PDF lane. */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Idle status wording (block-root status line). */
const IDLE_STATUS =
  'idle - load the sample corpus (or add text / a PDF) to index and ask grounded questions';

type EngineKind = KnowledgeBaseEngine['kind'];

const ENGINE_LABELS: Record<EngineKind, string> = {
  core: 'Core',
  langchain: 'LangChain',
};

/** Human labels for the document-source badge. */
const SOURCE_LABELS: Record<DocumentSource, string> = {
  text: 'Text',
  sample: 'Sample',
  pdf: 'PDF',
  ocr: 'OCR',
  import: 'Import',
};

/** Combined pipeline-tracker steps (the engine phase reports one busy span). */
const PDF_STEPS = ['Extract', 'Chunk · Embed · Store'];

/** Seed questions that hit the sample corpus (privacy doc is a known winner). */
const RAG_SEED_QUESTIONS = [
  'How is personal data kept private and encrypted on the device?',
];

const BTN_PRIMARY =
  'inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background';
const BTN_SECONDARY =
  'inline-flex h-8 items-center rounded-md border border-border px-3 text-sm disabled:opacity-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';
const PILL =
  'rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';
const INPUT =
  'h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-[3px] focus-visible:ring-ring/50';

/**
 * Fixed sample corpus: EXACTLY ONE doc (`Privacy and encryption on device`) is
 * about privacy/encryption, so a grounded ask about privacy has a known winner
 * for the E2E round-trip. The soups doc is intentionally the longest (feeds the
 * chunk-preview demo).
 */
const SAMPLE_CORPUS: Array<Omit<RawDocument, 'id' | 'addedAt'>> = [
  {
    title: 'Privacy and encryption on device',
    category: 'security',
    source: 'sample',
    text: 'Privacy and encryption go hand in hand: encrypting personal data with AES-GCM keys derived on the device keeps private information confidential, and no plaintext ever leaves the browser.',
  },
  {
    title: 'Spring vegetable gardening',
    category: 'home',
    source: 'sample',
    text: 'Plant tomatoes and peppers after the last frost. Water seedlings daily and mulch the beds to keep weeds down through the warm months.',
  },
  {
    title: 'Road cycling basics',
    category: 'sports',
    source: 'sample',
    text: 'A correct saddle height prevents knee pain on long rides. Carry a spare tube, tire levers, and a mini pump on every road ride.',
  },
  {
    title: 'Fresh pasta dough',
    category: 'food',
    source: 'sample',
    text: 'Combine flour and eggs, knead for ten minutes, and rest the dough for half an hour before rolling thin sheets for tagliatelle.',
  },
  {
    title: 'Backyard astronomy',
    category: 'science',
    source: 'sample',
    text: 'A small refractor telescope shows the rings of Saturn and the moons of Jupiter. Dark skies away from city lights reveal the Milky Way.',
  },
  {
    title: 'Budgeting for beginners',
    category: 'money',
    source: 'sample',
    text: 'Track monthly income and expenses, build a three-month emergency fund first, and automate transfers into savings on payday.',
  },
  {
    title: 'Marathon training plan',
    category: 'sports',
    source: 'sample',
    text: 'Increase weekly mileage by no more than ten percent. Long slow runs on weekends build the aerobic base needed for race day.',
  },
  {
    title: 'A year of soups',
    category: 'food',
    source: 'sample',
    text: 'In spring, light broths with peas, asparagus, and fresh herbs make a bright start to the season. A simple stock simmered from vegetable trimmings carries delicate flavors without overpowering them. Summer calls for chilled soups: gazpacho blends ripe tomatoes, cucumber, and peppers into a refreshing bowl that needs no stove at all. When autumn arrives, roasted squash and root vegetables become velvety purees, finished with cream and a pinch of nutmeg. Winter is the season of slow simmering: beans, lentils, and smoked meats braise for hours until the broth turns rich and deeply savory, perfect with crusty bread by the fire.',
  },
];

/* ─────────────────────────────── session ──────────────────────────────── */

/** The frozen session shape the ingest + RAG surfaces consume (built from the hook). */
interface RagSession {
  engine: KnowledgeBaseEngine;
  engineKind: EngineKind;
  documents: RawDocument[];
  addDocuments: (docs: Array<Omit<RawDocument, 'id' | 'addedAt'>>) => Promise<void>;
  removeDocument: (docId: string) => Promise<void>;
  clearAll: () => Promise<void>;
  chunking: ChunkingMode;
  setChunking: (mode: ChunkingMode) => void;
  chunkSize: number;
  setChunkSize: (n: number) => void;
  busy: boolean;
  error: string | null;
}

/* ────────────────────────────── pure helpers ──────────────────────────── */

/** "docTitle · p. N" when the chunk carries PDF page attribution. */
function sourceTitle(result: KBSearchResult) {
  const { docTitle, page } = result.metadata;
  return page != null ? `${docTitle} · p. ${page}` : docTitle;
}

/** Rerank score replaces the raw vector score when a rerank stage ran (none here). */
function sourceScore(result: KBSearchResult) {
  return result.rerankScore ?? result.score;
}

function clip(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function formatDuration(ms: number) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

function isAbort(err: unknown) {
  return err instanceof DOMException && err.name === 'AbortError';
}

/** Derive a display title from pasted text: first non-empty line, ≤64 chars. */
function deriveTitle(text: string) {
  const firstLine = text
    .split('\n')
    .map((l) => l.replace(/^#+\s*/, '').trim())
    .find((l) => l.length > 0);
  if (!firstLine) return 'Untitled note';
  return firstLine.length > 64 ? `${firstLine.slice(0, 64).trimEnd()}…` : firstLine;
}

/** Count whitespace-separated words. */
function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Short relative-time label for a document's `addedAt` timestamp. */
function formatRelativeTime(timestamp: number) {
  const deltaMs = Date.now() - timestamp;
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Cheap arithmetic chunk-count estimate under the current chunking config —
 * the session exposes only aggregate chunk stats, not per-document counts.
 */
function estimateChunkCount(textLength: number, mode: ChunkingMode, chunkSize: number) {
  if (mode === 'off') return 1;
  const size = mode === 'semantic' ? 500 : Math.max(1, chunkSize);
  return Math.max(1, Math.ceil(textLength / size));
}

/* ──────────────────────────── in-flight PDF state ─────────────────────── */

interface PdfPipelineState {
  step: 'extract' | 'ingest';
  fileIndex: number;
  fileCount: number;
  fileName: string;
}

interface PdfFileError {
  fileName: string;
  message: string;
}

/* ─────────────────────────────── RagChatBlock ─────────────────────────── */

/**
 * The RAG Chat block: owns the corpus via `useKnowledgeBase` WITH the Core ⇄
 * LangChain toggle. Creating an engine loads nothing (lazy singletons); the
 * embedding model downloads on the first ingest and the granite answer model on
 * the first ask, so nothing fetches on page load.
 */
export function RagChatBlock() {
  // The hook calls createEngine(kind) with ONLY `kind`, so the current embedding
  // model id is read from a ref kept in sync with the hook's state.
  const idRef = useRef(DEFAULT_EMBEDDING_MODEL_ID);

  // Core engine is statically imported (core is always loaded); the LangChain
  // engine is dynamically imported so its module stays out of the default path
  // until the toggle first selects it.
  const createEngine = useCallback(async (kind: EngineKind): Promise<KnowledgeBaseEngine> => {
    const embeddingModel = transformers.embedding(idRef.current);
    const getLanguageModel = async () => {
      // WebGPU adapter pre-probe (chat/kb pattern): adapterless browsers expose
      // navigator.gpu with no usable adapter, so pin the device explicitly.
      const device = (await isWebGPUSupported()) ? 'webgpu' : 'wasm';
      return transformers.languageModel(ANSWER_MODEL_ID, { device });
    };
    if (kind === 'langchain') {
      const { createLangChainKnowledgeBaseEngine, ChatLocalMode } = await import(
        '@localmode/langchain'
      );
      return createLangChainKnowledgeBaseEngine({
        embeddingModel,
        getChatModel: async () =>
          new ChatLocalMode({ model: await getLanguageModel(), maxTokens: GENERATION_MAX_TOKENS }),
      });
    }
    return createKnowledgeBaseEngine({ embeddingModel, getLanguageModel });
  }, []);

  const kb = useKnowledgeBase({
    embeddingModelId: DEFAULT_EMBEDDING_MODEL_ID,
    createEmbeddingModel: (id, onProgress) =>
      transformers.embedding(id, {
        onProgress: (p) => onProgress(p as Parameters<typeof onProgress>[0]),
      }),
    isModelCached: (id) => isModelCached(id),
    createEngine,
  });
  // Keep the id ref in sync so createEngine always sees the active model id.
  idRef.current = kb.embeddingModelId;

  const requestEngineKind = (kind: EngineKind) => {
    if (kb.busy || !kb.engine || kind === kb.engineKind) return;
    kb.setEngineKind(kind);
  };

  // ── block-root status line ──
  const progressTick = kb.reingestProgress ?? kb.ingestProgress;
  const working = kb.busy || (!kb.engine && kb.documents.length > 0);
  const statusText = working
    ? kb.modelStatus === 'loading'
      ? `loading embedding model… ${Math.round(kb.modelProgress * 100)}%`
      : progressTick
        ? `indexing - ${progressTick.phase} ${progressTick.completed}/${progressTick.total}`
        : kb.switching
          ? `re-ingesting ${kb.documents.length} docs through the ${ENGINE_LABELS[kb.engineKind]} engine…`
          : 'indexing…'
    : kb.error
      ? 'error'
      : kb.documents.length > 0
        ? `ready - ${kb.documents.length} docs indexed, ${kb.stats?.chunks ?? 0} chunks`
        : IDLE_STATUS;

  const modelMeta =
    EMBEDDING_MODEL_META[kb.embeddingModelId] ?? { name: kb.embeddingModelId, size: '' };
  const reingestFraction =
    kb.reingestProgress && kb.reingestProgress.total > 0
      ? kb.reingestProgress.completed / kb.reingestProgress.total
      : 0;

  const session: RagSession | null = kb.engine
    ? {
        engine: kb.engine,
        engineKind: kb.engineKind,
        documents: kb.documents,
        addDocuments: kb.addDocuments,
        removeDocument: kb.removeDocument,
        clearAll: kb.clearAll,
        chunking: kb.chunking,
        setChunking: kb.setChunking,
        chunkSize: kb.chunkSize,
        setChunkSize: kb.setChunkSize,
        busy: kb.busy,
        error: kb.error,
      }
    : null;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
      {/* ── status + error ── */}
      <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
        {statusText}
      </p>
      {kb.error && (
        <p className="text-xs text-destructive">
          {kb.error}
        </p>
      )}

      {/* ── engine toggle + corpus stats ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div
          data-engine={kb.engineKind}
          role="group"
          aria-label="Pipeline engine"
          className="inline-flex items-center rounded-md border border-border bg-muted/40 p-0.5"
        >
          {(Object.keys(ENGINE_LABELS) as EngineKind[]).map((kind) => (
            <button
              key={kind}
              type="button"
              data-engine-option={kind}
              aria-pressed={kb.engineKind === kind}
              onClick={() => requestEngineKind(kind)}
              disabled={!kb.engine || kb.busy}
              className={cn(
                'inline-flex h-7 items-center rounded px-2.5 text-xs font-medium transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                kb.engineKind === kind
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {ENGINE_LABELS[kind]} engine
            </button>
          ))}
        </div>

        <span
          data-docs={kb.documents.length}
          data-chunks={kb.stats?.chunks ?? 0}
          role="group"
          aria-label="Corpus size"
          className="ml-auto text-xs tabular-nums text-muted-foreground"
        >
          {kb.documents.length} docs · {kb.stats?.chunks ?? 0} chunks
          {kb.stats ? ` · ${kb.stats.dimensions}d` : ''}
        </span>
      </div>

      {/* ── embedding-model status (downloads on first ingest) ── */}
      <div
        data-status={kb.modelStatus}
        data-model-id={kb.embeddingModelId}
        role="group"
        aria-label="Embedding model status"
      >
        {kb.modelStatus === 'idle' ? (
          <p className="text-xs text-muted-foreground">
            Embedding model: <span className="font-medium">{modelMeta.name}</span>
            {modelMeta.size ? ` (${modelMeta.size})` : ''} - not loaded. It downloads on the first
            ingest or an engine switch; the granite answer model downloads on the first ask.
          </p>
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
      </div>

      {/* ── engine-switch re-ingest progress ── */}
      {kb.switching && (
        <div
          data-phase={kb.reingestProgress?.phase ?? 'model'}
          role="status"
          aria-live="polite"
          aria-label="Re-ingest progress"
          className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-3"
        >
          <p className="text-xs font-medium">
            Re-ingesting {kb.documents.length} document{kb.documents.length === 1 ? '' : 's'} through
            the {ENGINE_LABELS[kb.engineKind]} engine
            {kb.reingestProgress
              ? ` - ${kb.reingestProgress.phase} ${kb.reingestProgress.completed}/${kb.reingestProgress.total}`
              : '…'}
          </p>
          <DownloadProgress value={reingestFraction} complete={false} />
        </div>
      )}

      {/* ── ingest + grounded RAG ── */}
      {session ? (
        <div className="flex flex-col gap-8">
          <IngestSection session={session} />
          <RagPanel session={session} />
        </div>
      ) : (
        <p className="p-4 text-sm text-muted-foreground">
          {kb.switching || kb.documents.length > 0 ? 'Re-ingesting the corpus…' : 'Preparing engine…'}
        </p>
      )}
    </div>
  );
}

/* ─────────────────────────────── IngestSection ────────────────────────── */

/**
 * Corpus ingest: text paste (+ sample corpus), chunking controls with a live
 * boundary preview, and a multi-file PDF lane (dynamic `@localmode/pdfjs`, per-
 * page text kept for page attribution). Every mutation flows through the
 * session, which downloads the embedding model on the first ingest.
 */
function IngestSection({ session }: { session: RagSession }) {
  const [draft, setDraft] = useState('');
  const [pdfPipeline, setPdfPipeline] = useState<PdfPipelineState | null>(null);
  const [pdfErrors, setPdfErrors] = useState<PdfFileError[]>([]);
  const pdfAbortRef = useRef<AbortController | null>(null);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);

  const busy = session.busy;
  const draftTrimmed = draft.trim();

  // Chunk preview of the current draft, computed with the SAME core
  // `recursiveChunk` the engine uses. Semantic boundaries need the embedding
  // model (loaded at ingest), so semantic mode previews the recursive split.
  const previewChunks: ChunkInfo[] = !draftTrimmed
    ? []
    : session.chunking === 'off'
      ? [{ text: draftTrimmed, chunkIndex: 0, rightSimilarity: null }]
      : recursiveChunk(draftTrimmed, { size: session.chunkSize }).map((c) => ({
          text: c.text,
          chunkIndex: c.index,
          rightSimilarity: null,
        }));
  const previewChars = previewChunks.reduce((sum, c) => sum + c.text.length, 0);
  const previewAvg =
    previewChunks.length > 0 ? Math.round(previewChars / previewChunks.length) : 0;

  const addDraft = async () => {
    if (!draftTrimmed || busy) return;
    await session.addDocuments([
      { title: deriveTitle(draftTrimmed), text: draftTrimmed, source: 'text' },
    ]);
    setDraft('');
  };

  const loadSamples = async () => {
    if (busy || session.documents.length > 0) return;
    await session.addDocuments(SAMPLE_CORPUS);
  };

  const ingestPDFs = async (files: File[]) => {
    if (busy || pdfPipeline) return;
    setPdfErrors([]);

    const controller = new AbortController();
    pdfAbortRef.current = controller;

    const docs: Array<Omit<RawDocument, 'id' | 'addedAt'>> = [];
    const errors: PdfFileError[] = [];

    // Step 1 — extract each file locally (cancellable, per-file progress).
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setPdfPipeline({ step: 'extract', fileIndex: i, fileCount: files.length, fileName: file.name });
      try {
        const { extractPDFText } = await import('@localmode/pdfjs');
        const result = await extractPDFText(file, {
          includePageNumbers: false,
          pageSeparator: '\n\n',
          abortSignal: controller.signal,
        });
        if (!result.text.trim()) {
          errors.push({
            fileName: file.name,
            message: 'No extractable text - the PDF may be scanned images or protected.',
          });
          continue;
        }
        docs.push({
          title: file.name,
          text: result.text,
          source: 'pdf',
          meta: { pages: result.pageCount, sizeBytes: file.size },
          pages: result.pages.map((p) => ({ page: p.pageNumber, text: p.text })),
        });
      } catch (err) {
        if (controller.signal.aborted || isAbort(err)) {
          setPdfPipeline(null);
          setPdfErrors(errors);
          return; // Cancelled — nothing was ingested.
        }
        errors.push({ fileName: file.name, message: errorMessage(err) });
      }
    }

    setPdfErrors(errors);

    // Step 2 — chunk → embed → store through the session (single busy span).
    if (docs.length > 0) {
      setPdfPipeline({ step: 'ingest', fileIndex: files.length, fileCount: files.length, fileName: '' });
      try {
        await session.addDocuments(docs);
      } finally {
        setPdfPipeline(null);
      }
    } else {
      setPdfPipeline(null);
    }
  };

  const onPdfReject = (rejected: RejectedFile[]) => {
    setPdfErrors((prev) => [
      ...prev,
      ...rejected.map((r) => ({ fileName: r.file.name, message: r.reason })),
    ]);
  };

  const deleteDocument = async (docId: string) => {
    if (busy || deletingDocId) return;
    setDeletingDocId(docId);
    try {
      await session.removeDocument(docId);
    } finally {
      setDeletingDocId(null);
    }
  };

  const clearAll = async () => {
    if (busy) return;
    setConfirmingClear(false);
    await session.clearAll();
  };

  return (
    <div className="flex flex-col gap-8">
      {session.error && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {session.error}
        </p>
      )}

      {/* ── Text lane ── */}
      <section className="flex flex-col gap-3">
        <header>
          <h2 className="text-sm font-semibold">Add text</h2>
          <p className="text-xs text-muted-foreground">
            Paste a note or document. The first line becomes its title.
          </p>
        </header>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={5}
          placeholder="Paste text to index into the corpus…"
          aria-label="Text to index"
          className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void addDraft()}
            disabled={!draftTrimmed || busy}
            className={BTN_PRIMARY}
          >
            Add to corpus
          </button>
          {session.documents.length === 0 && (
            <button
              type="button"
              onClick={() => void loadSamples()}
              disabled={busy}
              className={BTN_SECONDARY}
            >
              Load sample corpus
            </button>
          )}
          {busy && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              Indexing corpus…
            </span>
          )}
        </div>
      </section>

      {/* ── Chunking controls + draft preview ── */}
      <section className="flex flex-col gap-3">
        <header>
          <h2 className="text-sm font-semibold">Chunking</h2>
          <p className="text-xs text-muted-foreground">
            Applied by the engine on every ingest. Off stores one vector per document.
          </p>
        </header>
        <div>
          <SegmentedModePicker<ChunkingMode>
            aria-label="Chunking mode"
            items={[
              { id: 'off', label: 'Off' },
              { id: 'recursive', label: 'Recursive' },
              { id: 'semantic', label: 'Semantic' },
            ]}
            selectedId={session.chunking}
            onSelect={session.setChunking}
          />
        </div>
        {session.chunking === 'recursive' && (
          <div className="max-w-sm">
            <ParameterSlider
              label="Chunk size"
              value={session.chunkSize}
              onChange={session.setChunkSize}
              min={128}
              max={1024}
              step={32}
              unit="chars"
              disabled={busy}
              description="Target characters per recursive chunk."
            />
          </div>
        )}
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            {previewChunks.length > 0
              ? `Draft preview: ${previewChunks.length} ${previewChunks.length === 1 ? 'chunk' : 'chunks'} · avg ${previewAvg} chars · ${countWords(draftTrimmed)} words`
              : 'Draft preview: paste text above to preview its chunks.'}
          </p>
          {session.chunking === 'semantic' && previewChunks.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Semantic boundaries and similarity scores are computed with the embedding model during
              ingest - this preview shows an approximate recursive split.
            </p>
          )}
          <ChunkBoundaryVisualizer
            mode={session.chunking}
            chunks={previewChunks}
            maxCharsPerChunk={200}
          />
        </div>
      </section>

      {/* ── PDF lane ── */}
      <section className="flex flex-col gap-3">
        <header>
          <h2 className="text-sm font-semibold">PDF documents</h2>
          <p className="text-xs text-muted-foreground">
            Text is extracted per page, so grounded answers cite the page a source came from.
          </p>
        </header>
        <div>
          <FileDropzone
            accept={['application/pdf']}
            maxSize={MAX_FILE_SIZE}
            multiple
            disabled={busy && !pdfPipeline}
            processing={pdfPipeline !== null}
            processingLabel={
              pdfPipeline?.step === 'extract'
                ? `Extracting ${pdfPipeline.fileName}…`
                : 'Indexing into the corpus…'
            }
            label="Drop PDFs or click to browse"
            onUpload={(files) => void ingestPDFs(files)}
            onReject={onPdfReject}
          />
        </div>
        {pdfPipeline && (
          <div className="flex flex-col gap-2">
            <MultiStepPipelineTracker
              steps={PDF_STEPS}
              completed={pdfPipeline.step === 'extract' ? 0 : 1}
              currentStep={pdfPipeline.step === 'extract' ? PDF_STEPS[0] : PDF_STEPS[1]}
            />
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {pdfPipeline.step === 'extract' ? (
                <>
                  <span>
                    Extracting file {pdfPipeline.fileIndex + 1}/{pdfPipeline.fileCount} -{' '}
                    {pdfPipeline.fileName}
                  </span>
                  <button
                    type="button"
                    onClick={() => pdfAbortRef.current?.abort()}
                    className="inline-flex h-6 items-center rounded-md border border-border px-2 text-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <span>
                  Chunking, embedding, and storing through the engine - the session reports a single
                  busy phase for this span.
                </span>
              )}
            </div>
          </div>
        )}
        {pdfErrors.length > 0 && (
          <div role="alert" className="flex flex-col gap-1 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-destructive">
                {pdfErrors.length} {pdfErrors.length === 1 ? 'file' : 'files'} failed
              </p>
              <button
                type="button"
                onClick={() => setPdfErrors([])}
                aria-label="Dismiss PDF errors"
                className="text-destructive/70 hover:text-destructive focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </div>
            {pdfErrors.map((e, i) => (
              <p key={`${e.fileName}-${i}`} className="text-xs text-destructive">
                {e.fileName}: {e.message}
              </p>
            ))}
          </div>
        )}
      </section>

      {/* ── Document list ── */}
      <section className="flex flex-col gap-3">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">
              Corpus ({session.documents.length}{' '}
              {session.documents.length === 1 ? 'document' : 'documents'})
            </h2>
            <p className="text-xs text-muted-foreground">
              Chunk counts are estimates under the current chunking config.
            </p>
          </div>
          {session.documents.length > 0 &&
            (confirmingClear ? (
              <span className="inline-flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void clearAll()}
                  disabled={busy}
                  className="inline-flex h-8 items-center rounded-md bg-destructive px-3 text-sm font-medium text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  Confirm clear all
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingClear(false)}
                  className={BTN_SECONDARY}
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingClear(true)}
                disabled={busy}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-sm text-destructive disabled:opacity-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
                Clear all
              </button>
            ))}
        </header>

        <div className="flex flex-col gap-2">
          {session.documents.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
              No documents yet - add text, load the sample corpus, or drop a PDF.
            </p>
          ) : (
            session.documents.map((doc) => {
              const pageCount =
                doc.pages?.length ??
                (typeof doc.meta?.pages === 'number' ? doc.meta.pages : undefined);
              const sizeBytes =
                typeof doc.meta?.sizeBytes === 'number' ? doc.meta.sizeBytes : undefined;
              return (
                <article
                  key={doc.id}
                  data-doc-id={doc.id}
                  className="flex flex-col gap-1"
                >
                  <IndexedDocumentCard
                    filename={doc.title}
                    chunkCount={estimateChunkCount(doc.text.length, session.chunking, session.chunkSize)}
                    pageCount={pageCount}
                    sizeBytes={sizeBytes}
                  />
                  <div className="flex flex-wrap items-center gap-2 px-1 text-xs text-muted-foreground">
                    <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-foreground">
                      {SOURCE_LABELS[doc.source]}
                    </span>
                    {doc.category && (
                      <span className="rounded border border-border px-1.5 py-0.5">{doc.category}</span>
                    )}
                    <span>{formatRelativeTime(doc.addedAt)}</span>
                    <button
                      type="button"
                      onClick={() => void deleteDocument(doc.id)}
                      disabled={busy || deletingDocId !== null}
                      aria-label={`Delete ${doc.title}`}
                      aria-busy={deletingDocId === doc.id}
                      className="ml-auto inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-destructive hover:bg-destructive/10 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      {deletingDocId === doc.id ? (
                        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Trash2 className="size-3.5" aria-hidden="true" />
                      )}
                      Delete
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}

/* ─────────────────────────────── RagPanel ─────────────────────────────── */

interface RagEntry {
  id: string;
  question: string;
  answer: string;
  sources: KBSearchResult[];
  durationMs: number;
}

/**
 * Grounded RAG chat: `session.engine.ask(question, { topK, onToken, abortSignal })`
 * streams token-by-token through the engine-owned generator (granite-4.0-350M);
 * `onToken` deltas append into the live answer area. The finished `AskResult`
 * renders with `[n]` markers upgraded to hovercard citations resolved to the
 * retrieved sources, page-attributed `Sources` + `SourceCitationList`, and the
 * wall-clock duration. Cancellable mid-stream. Switching the engine re-asks
 * through the newly-selected engine over the SAME corpus, preserving citations.
 */
function RagPanel({ session }: { session: RagSession }) {
  const [question, setQuestion] = useState('');
  const [entries, setEntries] = useState<RagEntry[]>([]);
  const [streaming, setStreaming] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const hasCorpus = session.documents.length > 0;
  const canAsk = hasCorpus && !isAsking && !session.busy && question.trim().length > 0;

  // Sample-question pills: curated seeds (known corpus winners) + doc titles.
  const suggestions = [
    ...(hasCorpus ? RAG_SEED_QUESTIONS : []),
    ...session.documents.slice(0, 2).map((doc) => `What does "${doc.title}" cover?`),
  ];

  const ask = async () => {
    const q = question.trim();
    if (!canAsk || !q) return;
    setError(null);
    setStreaming('');
    setIsAsking(true);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await session.engine.ask(q, {
        topK: RAG_TOP_K,
        // onToken delivers generation deltas (core streaming convention).
        onToken: (text) => setStreaming((prev) => prev + text),
        abortSignal: controller.signal,
      });
      setEntries((prev) => [{ id: crypto.randomUUID(), question: q, ...result }, ...prev]);
      setQuestion('');
    } catch (err) {
      if (!controller.signal.aborted && !isAbort(err)) {
        setError(errorMessage(err));
      }
    } finally {
      setIsAsking(false);
      setStreaming('');
      abortRef.current = null;
    }
  };

  const cancel = () => abortRef.current?.abort();

  const latest = entries[0] ?? null;
  // While a new ask streams, every completed entry is "history"; when idle the
  // newest entry is promoted to the answer area and history shows the rest.
  const historyEntries = isAsking ? entries : entries.slice(1);

  return (
    <section className="flex flex-col gap-4">
      <header>
        <h2 className="text-sm font-semibold">Ask your corpus</h2>
        <p className="text-xs text-muted-foreground">
          Answers stream token-by-token through the {ENGINE_LABELS[session.engineKind]} engine
          (granite-4.0-350M), grounded on the retrieved sources with inline citations.
        </p>
      </header>

      {error && (
        <p className="text-xs text-destructive">
          {error}
        </p>
      )}

      {!hasCorpus && (
        <p className="text-xs text-muted-foreground">
          The corpus is empty - add text, load the sample corpus, or drop a PDF above to ask grounded
          questions.
        </p>
      )}

      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Try:</span>
          {suggestions.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setQuestion(q)}
              className={PILL}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void ask();
            }
          }}
          placeholder="Ask a question about your documents…"
          aria-label="Question about your documents"
          className={INPUT}
        />
        <button
          type="button"
          onClick={() => void ask()}
          disabled={!canAsk}
          className={BTN_PRIMARY}
        >
          {isAsking ? 'Answering…' : 'Ask'}
        </button>
        {isAsking && (
          <button
            type="button"
            onClick={cancel}
            className={BTN_SECONDARY}
          >
            Cancel
          </button>
        )}
      </div>

      {/* Current answer: streaming text while in-flight, else the newest entry. */}
      {(isAsking || latest) && (
        <div className="rounded-lg border border-border bg-card p-3">
          {isAsking ? (
            <>
              <p className="text-xs text-muted-foreground">Retrieving + generating…</p>
              <p
                role="group"
                aria-label="Answer"
                className="mt-1 whitespace-pre-wrap text-sm leading-relaxed"
              >
                {streaming || '…'}
              </p>
            </>
          ) : latest ? (
            <>
              <p className="text-sm font-medium">{latest.question}</p>
              <div role="group" aria-label="Answer" className="mt-1">
                <CitedAnswer answer={latest.answer} sources={latest.sources} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                <span data-ms={String(latest.durationMs)} role="group" aria-label="Answer duration">
                  generated in {formatDuration(latest.durationMs)}
                </span>
                {' · '}
                {latest.sources.length} retrieved{' '}
                {latest.sources.length === 1 ? 'chunk' : 'chunks'}
                {' · '}
                {ENGINE_LABELS[session.engineKind]} engine
              </p>
              <div className="mt-2 flex flex-col gap-2">
                <div
                  role="group"
                  aria-label="Retrieved sources"
                  data-count={String(latest.sources.length)}
                >
                  <Sources
                    data-count={String(latest.sources.length)}
                    defaultOpen
                  >
                    <SourcesTrigger count={latest.sources.length} />
                    <SourcesContent>
                      {latest.sources.map((s, i) => (
                        <Source
                          key={s.id}
                          source={{
                            id: s.id,
                            title: `${i + 1}. ${sourceTitle(s)}`,
                            excerpt: clip(s.metadata.text, 180),
                            score: sourceScore(s),
                          }}
                        />
                      ))}
                    </SourcesContent>
                  </Sources>
                </div>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* Earlier answers (history preserved within the session). */}
      {historyEntries.length > 0 && (
        <div
          data-count={String(entries.length)}
          className="flex flex-col gap-2"
        >
          <p className="text-xs font-medium text-muted-foreground">Earlier answers</p>
          {historyEntries.map((entry) => (
            <div key={entry.id} className="rounded-lg border border-border p-3">
              <p className="text-sm font-medium">{entry.question}</p>
              <div className="mt-1">
                <CitedAnswer answer={entry.answer} sources={entry.sources} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                generated in {formatDuration(entry.durationMs)}
              </p>
              <SourceCitationList
                sources={entry.sources.map((s) => ({
                  title: sourceTitle(s),
                  text: s.metadata.text,
                  score: sourceScore(s),
                }))}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ─────────────────────────────── CitedAnswer ──────────────────────────── */

/**
 * Renders an answer with `[n]` markers upgraded to hovercard citations resolved
 * to the retrieved sources. Lossless: markers that don't resolve to a retrieved
 * source (and answers with no markers at all) render as plain text.
 */
function CitedAnswer({ answer, sources }: { answer: string; sources: KBSearchResult[] }) {
  const nodes: ReactNode[] = [];
  const markers = /\[(\d+)\]/g;
  let last = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  while ((match = markers.exec(answer)) !== null) {
    const n = Number(match[1]);
    const source = n >= 1 && n <= sources.length ? sources[n - 1] : undefined;
    // Unresolvable marker → leave the literal text in the next plain slice.
    if (!source) continue;

    if (match.index > last) {
      nodes.push(<span key={key++}>{answer.slice(last, match.index)}</span>);
    }
    nodes.push(
      <InlineCitation key={key++}>
        <InlineCitationCard>
          <InlineCitationCardTrigger label={n} />
          <InlineCitationCardBody>
            <InlineCitationCarousel count={1}>
              <InlineCitationSource
                title={sourceTitle(source)}
                excerpt={`similarity ${(sourceScore(source) * 100).toFixed(0)}%`}
              >
                <InlineCitationQuote>{clip(source.metadata.text, 220)}</InlineCitationQuote>
              </InlineCitationSource>
            </InlineCitationCarousel>
          </InlineCitationCardBody>
        </InlineCitationCard>
      </InlineCitation>,
    );
    last = match.index + match[0].length;
  }
  nodes.push(<span key={key++}>{answer.slice(last)}</span>);

  return <p className="whitespace-pre-wrap text-sm leading-relaxed">{nodes}</p>;
}
