'use client';

/**
 * @file semantic-search.tsx
 * @description Semantic Search block — a two-tab Ingest / Search knowledge base over ONE shared corpus via `useKnowledgeBase`, with a core-pipeline ⇄ LangChain engine toggle, three-lane ingest (text + PDF + OCR) with live chunk-boundary preview, and reranked vector search with facets and preset/calibrated thresholds. No model bytes download until an explicit in-block action.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Check,
  ClipboardPaste,
  Copy,
  FileText,
  Loader2,
  ScanText,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  getDefaultThreshold,
  isWebGPUSupported,
  recursiveChunk,
  type ChunkingMode,
  type EmbeddingModel,
  type EngineStats,
  type KBSearchResult,
  type KnowledgeBaseEngine,
  type OCRModel,
  type RawDocument,
  type RerankerModel,
} from '@localmode/core';
import {
  useCalibrateThreshold,
  useExtractText,
  useKnowledgeBase,
  useRerank,
} from '@localmode/react';
import { isModelCached, transformers } from '@localmode/transformers';
import { wllama } from '@localmode/wllama';

import { CapabilityGate } from '@/components/capability-gate';
import { CategoryFacetList } from '@/components/category-facet-list';
import { ChunkBoundaryVisualizer, type ChunkInfo } from '@/components/chunk-boundary-visualizer';
import { CosineSimilarityMeter } from '@/components/cosine-similarity-meter';
import { FileDropzone, type RejectedFile } from '@/components/file-dropzone';
import { IndexedDocumentCard } from '@/components/indexed-document-card';
import { MediaDropzone, type MediaDropzoneRejection } from '@/components/media-dropzone';
import { DownloadProgress, ModelDownloader } from '@/components/model-downloader';
import { OptionList, type Option } from '@/components/option-list';
import { ParameterSlider } from '@/components/parameter-slider';
import { MultiStepPipelineTracker } from '@/components/pipeline-tracker';
import { ScoredResultBarList } from '@/components/scored-result-bar-list';
import { SegmentedModePicker } from '@/components/segmented-mode-picker';
import { TopResultCard } from '@/components/top-result-card';
import { formatBytes, readFileAsDataUrl } from '@/lib/browser-utils';
import { cn } from '@/lib/utils';

/* ─────────────────────────────── constants ────────────────────────────── */

/** Default embedding model (D5); the Ingest tab may switch it. */
const DEFAULT_EMBEDDING_MODEL_ID = 'Xenova/bge-small-en-v1.5';

/**
 * Small instruct model that would back grounded answers. This block ships no
 * Ask surface, so `getLanguageModel` is never invoked — but the frozen
 * `KnowledgeBaseEngine` contract requires the factory, so a lazy (never-loaded)
 * one is supplied with the chat-block WebGPU pre-probe.
 */
const ANSWER_MODEL_ID = 'onnx-community/granite-4.0-350m-ONNX-web';

/** Generation budget for the (unused) LangChain grounded-answer path. */
const ANSWER_MAX_TOKENS = 512;

/** Display metadata for the embedding models the block recommends (D5). */
const EMBEDDING_MODEL_META: Record<string, { name: string; size: string }> = {
  'Xenova/bge-small-en-v1.5': { name: 'BGE Small EN v1.5', size: '34 MB' },
  'Xenova/all-MiniLM-L6-v2': { name: 'all-MiniLM-L6-v2', size: '23 MB' },
};

type EngineKind = KnowledgeBaseEngine['kind'];

const ENGINE_LABELS: Record<EngineKind, string> = {
  core: 'Core',
  langchain: 'LangChain',
};

/** Idle status wording (no download until an explicit ingest action). */
const IDLE_STATUS = 'idle - load the sample corpus or add documents, then search';

const TABS = [
  { id: 'ingest', label: 'Ingest' },
  { id: 'search', label: 'Search' },
] as const;

type TabId = (typeof TABS)[number]['id'];

/** Icon per tab, so the segmented control reads clearly as two views. */
const TAB_ICONS: Record<TabId, typeof Upload> = { ingest: Upload, search: Search };

/**
 * Everything the two panels receive — the same shape the retired knowledge-base
 * tabs consumed, built here from the `useKnowledgeBase` hook return. Block-local
 * (not a core contract): the panels render this and call back.
 */
export interface SemanticSearchSession {
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
  embeddingModelId: string;
  setEmbeddingModelId: (id: string) => void;
  busy: boolean;
  error: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ingest panel — constants
// ─────────────────────────────────────────────────────────────────────────────

/** Max upload size for both the PDF and OCR lanes. */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Accepted OCR image MIME types. */
const OCR_ACCEPT = ['image/jpeg', 'image/png', 'image/webp'];

/** Embedding models selectable for the corpus. */
const EMBEDDING_MODELS = [
  { id: 'Xenova/bge-small-en-v1.5', label: 'bge-small-en-v1.5 · 384d (default)' },
  { id: 'Xenova/all-MiniLM-L6-v2', label: 'all-MiniLM-L6-v2 · 384d' },
] as const;

/** One OCR model catalog entry (ids grounded in the transformers OCR provider). */
interface OCRModelEntry {
  id: string;
  name: string;
  size: string;
  generative: boolean;
  description: string;
}

/** The three OCR models (TrOCR line-level + two generative document models). */
const OCR_MODELS: OCRModelEntry[] = [
  {
    id: 'Xenova/trocr-small-printed',
    name: 'TrOCR Small',
    size: '~120MB',
    generative: false,
    description: 'Fast line-level printed text recognition',
  },
  {
    id: 'onnx-community/GLM-OCR-ONNX',
    name: 'GLM-OCR',
    size: '~652MB',
    generative: true,
    description: 'Generative - document-level OCR with table & formula support',
  },
  {
    id: 'onnx-community/LightOnOCR-2-1B-ONNX',
    name: 'LightOnOCR-2',
    size: '~700MB',
    generative: true,
    description: 'Generative - fast end-to-end document OCR, 11 languages',
  },
];

/** Recognition modes for generative OCR models (prompt drives the decoder). */
const OCR_MODES = [
  { id: 'text', label: 'Text', prompt: 'Text Recognition:' },
  { id: 'table', label: 'Table', prompt: 'Table Recognition:' },
  { id: 'formula', label: 'Formula', prompt: 'Formula Recognition:' },
] as const;

type OCRModeId = (typeof OCR_MODES)[number]['id'];

/**
 * Fixed sample corpus (carried VERBATIM from the retired knowledge-base shell):
 * EXACTLY ONE doc (`Privacy and encryption on device`) is about
 * privacy/encryption, so the query "privacy and encryption" has a known winner
 * for the reranked-known-winner E2E round-trip. The soups doc is intentionally
 * the longest (feeds the chunking demos).
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

// ─────────────────────────────────────────────────────────────────────────────
// Ingest panel — pure helpers
// ─────────────────────────────────────────────────────────────────────────────

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
 * Estimated chunk count for a document under the CURRENT chunking config. The
 * session exposes only aggregate chunk stats (not per-document counts), so the
 * card shows a cheap arithmetic estimate rather than re-running the chunker.
 */
function estimateChunkCount(textLength: number, mode: ChunkingMode, chunkSize: number) {
  if (mode === 'off') return 1;
  // Semantic mode derives its own windows; ~500 chars matches the core default.
  const size = mode === 'semantic' ? 500 : Math.max(1, chunkSize);
  return Math.max(1, Math.ceil(textLength / size));
}

/** Human labels for the document-source badge. */
const SOURCE_LABELS: Record<RawDocument['source'], string> = {
  text: 'Text',
  sample: 'Sample',
  pdf: 'PDF',
  ocr: 'OCR',
  import: 'Import',
};

/** Module-level OCR model cache so switching back to a model reuses its pipeline. */
const ocrModelCache = new Map<string, OCRModel>();

/** Lazily-created, cached OCR model for the given catalog id. */
function getOCRModel(modelId: string) {
  let model = ocrModelCache.get(modelId);
  if (!model) {
    model = transformers.ocr(modelId);
    ocrModelCache.set(modelId, model);
  }
  return model;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ingest panel — local state shapes
// ─────────────────────────────────────────────────────────────────────────────

/** In-flight PDF pipeline state ('extract' is tracked locally; 'ingest' spans the engine phase). */
interface PdfPipelineState {
  step: 'extract' | 'ingest';
  fileIndex: number;
  fileCount: number;
  fileName: string;
}

/** A per-file PDF lane failure (validation or extraction). */
interface PdfFileError {
  fileName: string;
  message: string;
}

/** The image currently loaded in the OCR lane. */
interface OcrImage {
  fileName: string;
  sizeBytes: number;
  dataUrl: string;
}

/** Combined pipeline-tracker steps: the engine phase is one step because the
 * session contract exposes no per-phase (chunk/embed/store) progress. */
const PDF_STEPS = ['Extract', 'Chunk · Embed · Store'];

// ─────────────────────────────────────────────────────────────────────────────
// Ingest panel — component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The Ingest panel. Self-contained: every mutation flows through
 * `session.addDocuments` / `session.removeDocument` / `session.clearAll` and
 * the session's chunking / embedding-model setters.
 */
export function IngestPanel({ session }: { session: SemanticSearchSession }) {
  // ── Text lane ──────────────────────────────────────────────────────────────
  const [draft, setDraft] = useState('');

  // ── PDF lane ───────────────────────────────────────────────────────────────
  const [pdfPipeline, setPdfPipeline] = useState<PdfPipelineState | null>(null);
  const [pdfErrors, setPdfErrors] = useState<PdfFileError[]>([]);
  const pdfAbortRef = useRef<AbortController | null>(null);

  // ── OCR lane ───────────────────────────────────────────────────────────────
  const [ocrModelId, setOcrModelId] = useState(OCR_MODELS[0].id);
  const [ocrModeId, setOcrModeId] = useState<OCRModeId>('text');
  const [ocrImage, setOcrImage] = useState<OcrImage | null>(null);
  const [ocrLaneError, setOcrLaneError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // ── Document list ──────────────────────────────────────────────────────────
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);

  const selectedOcrModel = OCR_MODELS.find((m) => m.id === ocrModelId) ?? OCR_MODELS[0];
  const selectedOcrMode = OCR_MODES.find((m) => m.id === ocrModeId) ?? OCR_MODES[0];

  const extract = useExtractText({
    model: getOCRModel(ocrModelId),
    prompt: selectedOcrModel.generative ? selectedOcrMode.prompt : undefined,
  });
  const extractedText = extract.data?.text ?? '';

  const busy = session.busy;

  // ── Derived: chunk preview of the current text-lane draft ─────────────────
  // Computed with the SAME core `recursiveChunk` the engine's recursive mode
  // uses. Semantic boundaries need the embedding model (explicit load), so
  // semantic mode shows the recursive approximation with a caption.
  const draftTrimmed = draft.trim();
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
  const previewAvg = previewChunks.length > 0 ? Math.round(previewChars / previewChunks.length) : 0;

  // ── Text lane actions ──────────────────────────────────────────────────────

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

  // ── PDF lane actions ───────────────────────────────────────────────────────

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
        if (controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
          setPdfPipeline(null);
          setPdfErrors(errors);
          return; // Cancelled — nothing was ingested.
        }
        errors.push({ fileName: file.name, message: err instanceof Error ? err.message : String(err) });
      }
    }

    setPdfErrors(errors);

    // Step 2 — chunk → embed → store through the session (no per-phase
    // progress in the frozen contract; `session.busy` covers this span).
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

  const cancelPdfExtract = () => {
    pdfAbortRef.current?.abort();
  };

  const onPdfReject = (rejected: RejectedFile[]) => {
    setPdfErrors((prev) => [
      ...prev,
      ...rejected.map((r) => ({ fileName: r.file.name, message: r.reason })),
    ]);
  };

  // ── OCR lane actions ───────────────────────────────────────────────────────

  const onOcrFiles = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setOcrLaneError(null);
    extract.reset();
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setOcrImage({ fileName: file.name, sizeBytes: file.size, dataUrl });
    } catch (err) {
      setOcrLaneError(err instanceof Error ? err.message : String(err));
    }
  };

  const onOcrReject = (rejections: MediaDropzoneRejection[]) => {
    setOcrLaneError(rejections[0]?.reason ?? 'File rejected.');
  };

  const runOcr = async () => {
    if (!ocrImage || extract.isLoading) return;
    setOcrLaneError(null);
    await extract.execute(ocrImage.dataUrl);
  };

  const copyExtracted = async () => {
    if (!extractedText) return;
    await navigator.clipboard.writeText(extractedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const indexOcrText = async () => {
    if (!ocrImage || !extractedText.trim() || busy) return;
    await session.addDocuments([
      {
        title: ocrImage.fileName,
        text: extractedText.trim(),
        source: 'ocr',
        meta: { ocrModel: ocrModelId, sizeBytes: ocrImage.sizeBytes },
      },
    ]);
    // One-action flow: the lane resets once the text joins the corpus.
    resetOcrLane();
  };

  const resetOcrLane = () => {
    extract.reset();
    setOcrImage(null);
    setOcrLaneError(null);
    setCopied(false);
  };

  const selectOcrModel = (option: Option) => {
    if (option.id === ocrModelId) return;
    setOcrModelId(option.id);
    // A different model means the previous extraction no longer applies.
    extract.reset();
  };

  // ── Document list actions ──────────────────────────────────────────────────

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

  const ocrWordCount = countWords(extractedText);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-8">
      {session.error && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {session.error}
        </p>
      )}

      {/* ── Text lane (ingest source 1 of 3) ──────────────────────────────── */}
      <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
        <header className="flex items-start gap-2.5">
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
            <ClipboardPaste className="size-4" aria-hidden="true" />
          </span>
          <div className="flex flex-col gap-0.5">
            <h2 className="text-sm font-semibold">Paste text</h2>
            <p className="text-xs text-muted-foreground">
              Paste a note or document. The first line becomes its title.
            </p>
          </div>
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
            className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Add to corpus
          </button>
          {session.documents.length === 0 && (
            <button
              type="button"
              onClick={() => void loadSamples()}
              disabled={busy}
              className="inline-flex h-8 items-center rounded-md border border-border px-3 text-sm disabled:opacity-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
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

      {/* ── Chunking controls + draft preview ─────────────────────────────── */}
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
          <ChunkBoundaryVisualizer mode={session.chunking} chunks={previewChunks} maxCharsPerChunk={200} />
        </div>
      </section>

      {/* ── PDF lane (ingest source 2 of 3) ───────────────────────────────── */}
      <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
        <header className="flex items-start gap-2.5">
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
            <FileText className="size-4" aria-hidden="true" />
          </span>
          <div className="flex flex-col gap-0.5">
            <h2 className="text-sm font-semibold">Upload PDF documents</h2>
            <p className="text-xs text-muted-foreground">
              Text is extracted per page, so search results carry page attribution.
            </p>
          </div>
        </header>
        <div role="group" aria-label="PDF upload">
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
                    onClick={cancelPdfExtract}
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

      {/* ── OCR lane (ingest source 3 of 3) ───────────────────────────────── */}
      <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
        <header className="flex items-start gap-2.5">
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
            <ScanText className="size-4" aria-hidden="true" />
          </span>
          <div className="flex flex-col gap-0.5">
            <h2 className="text-sm font-semibold">Scan images (OCR)</h2>
            <p className="text-xs text-muted-foreground">
              Extract text from an image, then index it into the corpus. The OCR model downloads on
              the first run.
            </p>
          </div>
        </header>

        <div
          role="group"
          aria-label="OCR model selector"
          className="max-w-lg"
        >
          <OptionList
            prompt="OCR model"
            options={OCR_MODELS.map((m) => ({
              id: m.id,
              label: `${m.name} · ${m.size}`,
              description: m.description,
            }))}
            selectedId={ocrModelId}
            onSelect={selectOcrModel}
            disabled={extract.isLoading}
          />
        </div>

        {selectedOcrModel.generative && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">Recognition mode</p>
            <SegmentedModePicker<OCRModeId>
              aria-label="OCR recognition mode"
              items={OCR_MODES.map((m) => ({ id: m.id, label: m.label }))}
              selectedId={ocrModeId}
              onSelect={(id) => {
                setOcrModeId(id);
                // A different prompt means the previous extraction no longer applies.
                extract.reset();
              }}
            />
          </div>
        )}

        {!ocrImage ? (
          <div role="group" aria-label="OCR image upload">
            <MediaDropzone
              accept={OCR_ACCEPT}
              maxSize={MAX_FILE_SIZE}
              multiple={false}
              title="Drop an image here"
              subtitle="or click to browse"
              onFiles={(files) => void onOcrFiles(files)}
              onReject={onOcrReject}
            />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <figure className="flex flex-col gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={ocrImage.dataUrl}
                alt={`Source image: ${ocrImage.fileName}`}
                className="max-h-80 w-full rounded-lg border border-border object-contain"
              />
              <figcaption className="truncate text-xs text-muted-foreground" title={ocrImage.fileName}>
                {ocrImage.fileName}
              </figcaption>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void runOcr()}
                  disabled={extract.isLoading}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  {extract.isLoading && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
                  {extract.isLoading ? 'Extracting…' : 'Extract text'}
                </button>
                {extract.isLoading && (
                  <button
                    type="button"
                    onClick={extract.cancel}
                    className="inline-flex h-8 items-center rounded-md border border-border px-3 text-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="button"
                  onClick={resetOcrLane}
                  disabled={extract.isLoading}
                  className="inline-flex h-8 items-center rounded-md border border-border px-3 text-sm disabled:opacity-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  Reset
                </button>
              </div>
            </figure>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Extracted text
                  {extractedText && (
                    <span className="ml-1.5 font-normal">
                      · {ocrWordCount} {ocrWordCount === 1 ? 'word' : 'words'}
                    </span>
                  )}
                </p>
                {extractedText && (
                  <button
                    type="button"
                    onClick={() => void copyExtracted()}
                    className={cn(
                      'inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                      copied && 'border-primary/40 text-primary',
                    )}
                  >
                    {copied ? (
                      <Check className="size-3.5" aria-hidden="true" />
                    ) : (
                      <Copy className="size-3.5" aria-hidden="true" />
                    )}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                )}
              </div>
              <pre
                role="group"
                aria-label="Extracted OCR text"
                className="min-h-40 flex-1 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-card p-3 text-sm text-card-foreground"
              >
                {extractedText ||
                  (extract.isLoading ? 'Extracting…' : 'Run extraction to see the text here.')}
              </pre>
              <button
                type="button"
                onClick={() => void indexOcrText()}
                disabled={!extractedText.trim() || busy || extract.isLoading}
                className="inline-flex h-8 w-fit items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Index into corpus
              </button>
            </div>
          </div>
        )}

        {(ocrLaneError || extract.error) && (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {ocrLaneError ?? extract.error?.message}
          </p>
        )}
      </section>

      {/* ── Embedding model + document list ───────────────────────────────── */}
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
                  className="inline-flex h-8 items-center rounded-md border border-border px-3 text-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
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

        <div className="flex max-w-md flex-col gap-1.5">
          <label htmlFor="semantic-search-embed-model-select" className="text-xs font-medium">
            Embedding model
          </label>
          <select
            id="semantic-search-embed-model-select"
            value={session.embeddingModelId}
            onChange={(e) => session.setEmbeddingModelId(e.target.value)}
            disabled={busy}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
          >
            {EMBEDDING_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Switching re-indexes the corpus with the new model.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {session.documents.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
              No documents yet - add text, load the sample corpus, drop a PDF, or scan an image.
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
                  aria-label="Indexed document"
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
                    {typeof doc.meta?.ocrModel === 'string' && (
                      <span className="truncate">via {doc.meta.ocrModel}</span>
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

// ─────────────────────────────────────────────────────────────────────────────
// Search panel — constants & catalogs
// ─────────────────────────────────────────────────────────────────────────────

/** Over-fetch factor applied when reranking ("topK × 3"). */
const RERANK_OVERFETCH = 3;

/**
 * Fallback minimum-score preset when the active embedding model has no entry in
 * core `MODEL_THRESHOLD_PRESETS`.
 */
const FALLBACK_PRESET_THRESHOLD = 0.5;

/** Reranker provider lane. */
type RerankerProvider = 'transformers' | 'wllama';

/** One selectable reranker model (both providers). */
interface RerankerOption {
  /** Provider-native model id (transformers HF id / wllama catalog id). */
  id: string;
  provider: RerankerProvider;
  label: string;
  /** Approximate download size, shown in the first-search download note. */
  size: string;
}

/**
 * Reranker catalog: transformers ONNX cross-encoders ⇄ wllama GGUF
 * cross-encoders (`packages/wllama/src/models.ts` reranker entries).
 */
const RERANKER_OPTIONS: RerankerOption[] = [
  {
    id: 'Xenova/ms-marco-MiniLM-L-6-v2',
    provider: 'transformers',
    label: 'MS MARCO MiniLM L-6 (cross-encoder)',
    size: '~23MB',
  },
  {
    id: 'Xenova/bge-reranker-base',
    provider: 'transformers',
    label: 'BGE Reranker Base (cross-encoder)',
    size: '~112MB',
  },
  {
    id: 'jina-reranker-v2-base-multilingual-Q4_K_M',
    provider: 'wllama',
    label: 'Jina Reranker v2 (GGUF)',
    size: '163MB',
  },
  {
    id: 'bge-reranker-v2-m3-Q4_K_M',
    provider: 'wllama',
    label: 'BGE Reranker v2 M3 (GGUF)',
    size: '218MB',
  },
];

/** Threshold source mode (spec: "preset or corpus-calibrated"). */
type ThresholdMode = 'preset' | 'calibrated';

const THRESHOLD_MODES: Array<{ id: ThresholdMode; label: string }> = [
  { id: 'preset', label: 'Preset' },
  { id: 'calibrated', label: 'Calibrated' },
];

/** Quantization display mode for the informational preview panel. */
type QuantMode = 'off' | 'sq8' | 'pq';

const QUANT_MODES: Array<{ id: QuantMode; label: string }> = [
  { id: 'off', label: 'Off (float32)' },
  { id: 'sq8', label: 'SQ8 (4×)' },
  { id: 'pq', label: 'PQ (8-32×)' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Search panel — module-level model singletons (created lazily; NOTHING
// downloads at construction — both providers fetch weights on first inference
// call)
// ─────────────────────────────────────────────────────────────────────────────

const rerankerCache = new Map<string, RerankerModel>();

/** Get (or create) the reranker model instance for a catalog option. */
function getRerankerModel(option: RerankerOption): RerankerModel {
  const cached = rerankerCache.get(option.id);
  if (cached) return cached;
  const model =
    option.provider === 'wllama' ? wllama.reranker(option.id) : transformers.reranker(option.id);
  rerankerCache.set(option.id, model);
  return model;
}

const embeddingCache = new Map<string, EmbeddingModel>();

/**
 * Embedding model for threshold calibration. The block's model picker ids
 * (bge-small ⇄ MiniLM) are transformers ids, so this resolves through the
 * transformers provider and reuses the SAME already-downloaded model the corpus
 * was ingested with — no extra weights move.
 */
function getEmbeddingModel(modelId: string): EmbeddingModel {
  const cached = embeddingCache.get(modelId);
  if (cached) return cached;
  const model = transformers.embedding(modelId);
  embeddingCache.set(modelId, model);
  return model;
}

// ─────────────────────────────────────────────────────────────────────────────
// Search panel — helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Clamp to the 0–1 range the score-driven primitives expect. Raw vector cosine
 * scores already sit in 0–1; transformers rerank scores are sigmoid
 * probabilities (0–1); wllama GGUF relevance scores can exceed the range, so
 * displays clamp while raw values stay available in the per-result rows and the
 * preserved `data-raw-score` / `data-rerank-score` attributes.
 */
function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** The effective ranking score for display: rerank score when present. */
function displayScore(result: KBSearchResult): number {
  return clamp01(result.rerankScore ?? result.score);
}

/** Source / category / page badges for one search hit. */
function ResultBadges({ result }: { result: KBSearchResult }) {
  const { source, category, page } = result.metadata;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge>{source}</Badge>
      {category && <Badge tone="accent">{category}</Badge>}
      {page !== undefined && <Badge tone="page">p. {page}</Badge>}
    </span>
  );
}

/** Tiny themed metadata chip. */
function Badge({
  children,
  tone = 'muted',
}: {
  children: ReactNode;
  tone?: 'muted' | 'accent' | 'page';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-1.5 py-0.5 text-[0.65rem] font-medium',
        tone === 'muted' && 'bg-muted text-muted-foreground',
        tone === 'accent' && 'bg-primary/10 text-primary',
        tone === 'page' && 'border border-border bg-card text-card-foreground',
      )}
    >
      {children}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Search panel — component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The Search panel. Presentational + hook-driven over the block session: the
 * shell owns the corpus, engine lifecycle, status, and errors; this panel
 * renders and calls back through `session.engine.search`.
 */
export function SearchPanel({ session }: { session: SemanticSearchSession }) {
  // ── Query & controls state ────────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const [topK, setTopK] = useState(5);
  const [rerankEnabled, setRerankEnabled] = useState(true);
  const [rerankerId, setRerankerId] = useState(RERANKER_OPTIONS[0].id);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [thresholdMode, setThresholdMode] = useState<ThresholdMode>('preset');

  // ── Result state (null = no search run yet) ───────────────────────────────
  const [results, setResults] = useState<KBSearchResult[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchMs, setSearchMs] = useState<number | null>(null);
  const [rerankMs, setRerankMs] = useState<number | null>(null);

  // ── Informational quantization/GPU preview state (see contract gap) ───────
  const [quantMode, setQuantMode] = useState<QuantMode>('off');
  const [gpuPreview, setGpuPreview] = useState(false);
  const [stats, setStats] = useState<EngineStats | null>(null);

  const selectedReranker =
    RERANKER_OPTIONS.find((option) => option.id === rerankerId) ?? RERANKER_OPTIONS[0];

  // Reranker model download is gated behind the FIRST reranked search — the
  // hook only touches the model inside execute(); construction is lazy.
  const rerankOp = useRerank({ model: getRerankerModel(selectedReranker) });

  // Calibration embeds the corpus with the block's active embedding model.
  const {
    calibration,
    isCalibrating,
    error: calibrationError,
    calibrate,
  } = useCalibrateThreshold({ model: getEmbeddingModel(session.embeddingModelId) });

  // Sync live engine stats for the informational storage estimates — external
  // system (the engine) → state, re-read when the corpus or engine changes.
  useEffect(() => {
    let active = true;
    session.engine
      .stats()
      .then((next) => {
        if (active) setStats(next);
      })
      .catch(() => {
        if (active) setStats(null);
      });
    return () => {
      active = false;
    };
  }, [session.engine, session.documents]);

  // ── Derived state ─────────────────────────────────────────────────────────
  const documents = session.documents;
  const corpusEmpty = documents.length === 0;

  const presetThreshold =
    getDefaultThreshold(session.embeddingModelId) ?? FALLBACK_PRESET_THRESHOLD;
  const activeThreshold =
    thresholdMode === 'calibrated' && calibration ? calibration.threshold : presetThreshold;
  const thresholdLabel =
    thresholdMode === 'calibrated'
      ? isCalibrating
        ? 'calibrating…'
        : calibration
          ? `calibrated ${calibration.threshold.toFixed(2)} from ${calibration.sampleSize} docs`
          : `preset ${presetThreshold.toFixed(2)} (calibration pending)`
      : `preset ${presetThreshold.toFixed(2)}`;

  const categoryCounts = documents.reduce<Record<string, number>>((acc, doc) => {
    if (doc.category) acc[doc.category] = (acc[doc.category] ?? 0) + 1;
    return acc;
  }, {});
  const categories = Object.keys(categoryCounts);

  const searched = results !== null;
  const top = results?.[0] ?? null;

  const rawBytes = stats ? stats.chunks * stats.dimensions * 4 : null;

  const errorText =
    searchError ?? rerankOp.error?.message ?? calibrationError?.message ?? null;

  // ── Actions ───────────────────────────────────────────────────────────────

  /**
   * Run the real engine search (+ optional rerank stage). Over-fetches topK × 3
   * when reranking, reorders by cross-encoder score (attached as `rerankScore`;
   * the raw vector score stays in `score` per the contract), then truncates to
   * topK. Wall-clock latency measured per stage. execute() returns null on
   * failure/cancel — the raw vector ordering is preserved; a rerank is NEVER
   * fabricated.
   */
  const runSearch = async (category: string | null = selectedCategory) => {
    const trimmed = query.trim();
    if (!trimmed || isSearching || session.busy || corpusEmpty) return;

    setSearchError(null);
    setIsSearching(true);
    setSearchMs(null);
    setRerankMs(null);

    try {
      const fetchK = rerankEnabled ? topK * RERANK_OVERFETCH : topK;
      const searchStartedAt = performance.now();
      const hits = await session.engine.search(trimmed, {
        topK: fetchK,
        filter: category ? { category } : undefined,
        minScore: activeThreshold,
      });
      setSearchMs(Math.round(performance.now() - searchStartedAt));

      let ranked = hits;
      if (rerankEnabled && hits.length > 0) {
        const rerankStartedAt = performance.now();
        const reranked = await rerankOp.execute({
          query: trimmed,
          documents: hits.map((hit) => hit.metadata.text),
        });
        if (reranked) {
          ranked = reranked.results.map((doc) => ({
            ...hits[doc.index],
            rerankScore: doc.score,
          }));
          setRerankMs(Math.round(performance.now() - rerankStartedAt));
        }
        // execute() returns null on failure/cancel — fall back to the raw
        // vector ordering and surface rerankOp.error; never fake a rerank.
      }

      setResults(ranked.slice(0, topK));
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSearching(false);
    }
  };

  /** Facet click: filter is a real per-search metadata filter. */
  const handleCategorySelect = (category: string | null) => {
    setSelectedCategory(category);
    // Re-run the real filtered search if a search has already been run.
    if (searched) void runSearch(category);
  };

  /**
   * Threshold mode switch. Selecting "Calibrated" with no calibration yet runs
   * core `calibrateThreshold` over the raw-document corpus texts — explicit user
   * action, reusing the already-loaded embedding model.
   */
  const handleThresholdMode = (mode: ThresholdMode) => {
    setThresholdMode(mode);
    if (mode === 'calibrated' && !calibration && !isCalibrating && documents.length >= 2) {
      void calibrate(documents.map((doc) => doc.text));
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      {/* Query row. */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void runSearch();
          }}
          placeholder="Search the knowledge base…"
          aria-label="Search query"
          className="h-8 min-w-40 flex-1 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        <button
          type="button"
          onClick={() => void runSearch()}
          disabled={!query.trim() || isSearching || session.busy || corpusEmpty}
          className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {isSearching ? (rerankOp.isLoading ? 'Reranking…' : 'Searching…') : 'Search'}
        </button>
        <span
          data-ms={searchMs === null ? undefined : String(searchMs)}
          className="text-xs tabular-nums text-muted-foreground"
        >
          {searchMs !== null ? `search ${searchMs}ms` : 'search -'}
        </span>
        <span
          data-ms={rerankMs === null ? undefined : String(rerankMs)}
          role="group"
          aria-label="Rerank latency"
          className="text-xs tabular-nums text-muted-foreground"
        >
          {rerankMs !== null ? `rerank ${rerankMs}ms` : rerankEnabled ? 'rerank -' : 'rerank off'}
        </span>
      </div>

      {errorText && <p className="text-xs text-destructive">{errorText}</p>}
      {corpusEmpty && (
        <p className="text-xs text-muted-foreground">
          The corpus is empty - ingest documents in the Ingest tab, then search here.
        </p>
      )}

      {/* Search settings: top-K, rerank stage, threshold. */}
      <section className="grid gap-4 rounded-lg border border-border bg-card p-4 md:grid-cols-3">
        <div data-value={String(topK)}>
          <ParameterSlider
            label="Top-K"
            value={topK}
            onChange={(value) => setTopK(Math.round(value))}
            min={1}
            max={20}
            step={1}
            unit="results"
            description={`Results returned; rerank over-fetches ×${RERANK_OVERFETCH} candidates.`}
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">Rerank stage</span>
            <button
              type="button"
              role="switch"
              aria-checked={rerankEnabled}
              aria-label="Rerank stage"
              data-state={rerankEnabled ? 'on' : 'off'}
              onClick={() => setRerankEnabled((enabled) => !enabled)}
              className={cn(
                'inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                rerankEnabled
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-muted text-muted-foreground',
              )}
            >
              {rerankEnabled ? 'On' : 'Off'}
            </button>
          </div>
          <select
            aria-label="Reranker model"
            value={rerankerId}
            onChange={(event) => setRerankerId(event.target.value)}
            disabled={!rerankEnabled || rerankOp.isLoading}
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50"
          >
            <optgroup label="Transformers (ONNX cross-encoders)">
              {RERANKER_OPTIONS.filter((option) => option.provider === 'transformers').map(
                (option) => (
                  <option key={option.id} value={option.id}>
                    {option.label} · {option.size}
                  </option>
                ),
              )}
            </optgroup>
            <optgroup label="wllama (GGUF cross-encoders)">
              {RERANKER_OPTIONS.filter((option) => option.provider === 'wllama').map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label} · {option.size}
                </option>
              ))}
            </optgroup>
          </select>
          <p className="text-xs text-muted-foreground">
            Reranker model ({selectedReranker.size}) downloads on the first reranked search - nothing
            is fetched until then.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Minimum score</span>
          <div data-value={thresholdMode}>
            <SegmentedModePicker
              aria-label="Similarity threshold source"
              items={THRESHOLD_MODES}
              selectedId={thresholdMode}
              onSelect={handleThresholdMode}
            />
          </div>
          <span
            data-threshold={String(activeThreshold)}
            className="text-xs tabular-nums text-muted-foreground"
            aria-busy={isCalibrating}
          >
            {thresholdLabel}
          </span>
          {thresholdMode === 'calibrated' && (
            <button
              type="button"
              onClick={() => void calibrate(documents.map((doc) => doc.text))}
              disabled={isCalibrating || documents.length < 2}
              className="inline-flex h-7 w-fit items-center rounded-md border border-border px-2.5 text-xs disabled:opacity-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {isCalibrating ? 'Calibrating…' : 'Recalibrate'}
            </button>
          )}
          {thresholdMode === 'calibrated' && documents.length < 2 && (
            <p className="text-xs text-muted-foreground">
              Calibration needs at least 2 documents in the corpus.
            </p>
          )}
        </div>
      </section>

      {/* Facets + results. */}
      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        <div>
          <h2 className="mb-2 text-sm font-medium">Categories</h2>
          <CategoryFacetList
            categories={categories}
            counts={categoryCounts}
            selected={selectedCategory}
            onSelect={handleCategorySelect}
          />
          {categories.length === 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              No categories yet - the sample corpus and categorized ingests populate this list.
            </p>
          )}
        </div>

        <div
          role="region"
          aria-label="Search results"
          className="flex min-w-0 flex-col gap-4"
        >
          {/* Result summary: count / top-title / top-score (raw vector). */}
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-medium">
              Results:{' '}
              <span
                role="group"
                aria-label="Result count"
              >
                {results?.length ?? 0}
              </span>
            </span>
            {top && (
              <>
                <span
                  role="group"
                  aria-label="Top result title"
                >
                  {top.metadata.docTitle}
                </span>
                <span
                  data-score={String(top.score)}
                  role="group"
                  aria-label="Top result score"
                  className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground"
                  title="Raw vector similarity of the best hit"
                >
                  {(clamp01(top.score) * 100).toFixed(1)}%
                </span>
              </>
            )}
          </div>

          {top && (
            <div className="grid items-start gap-4 lg:grid-cols-[1fr_auto]">
              <TopResultCard
                label={top.metadata.docTitle}
                score={displayScore(top)}
                title={
                  top.rerankScore !== undefined
                    ? `Top result - reranked by ${selectedReranker.label}`
                    : 'Top result - vector ranked'
                }
                description={
                  <span className="flex flex-col gap-1.5">
                    <ResultBadges result={top} />
                    <span className="line-clamp-3">{top.metadata.text}</span>
                    <span className="tabular-nums">
                      vector {top.score.toFixed(3)}
                      {top.rerankScore !== undefined && ` · rerank ${top.rerankScore.toFixed(3)}`}
                    </span>
                  </span>
                }
              />
              <CosineSimilarityMeter
                similarity={clamp01(top.score)}
                caption="raw vector score (query ↔ top chunk)"
              />
            </div>
          )}

          {/* Remaining hits — bars use the rerank score when present. */}
          <ScoredResultBarList
            isLoading={isSearching}
            sort={false}
            results={(results ?? []).slice(1).map((result) => ({
              label: `${result.metadata.docTitle} - chunk ${result.metadata.chunkIndex + 1}`,
              score: displayScore(result),
            }))}
            emptyState={
              searched
                ? results && results.length > 0
                  ? 'No further results'
                  : 'No results above the minimum score'
                : 'Run a search to see ranked results'
            }
          />

          {/* Per-result attribution rows — carry the contract id + raw + rerank scores. */}
          {results && results.length > 0 && (
            <ol className="flex flex-col gap-2">
              {results.map((result, rank) => (
                <li
                  key={result.id}
                  data-id={result.id}
                  data-raw-score={String(result.score)}
                  data-rerank-score={result.rerankScore === undefined ? '' : String(result.rerankScore)}
                  className="rounded-md border border-border bg-card px-3 py-2"
                >
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-mono text-xs text-muted-foreground">#{rank + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {result.metadata.docTitle}
                    </span>
                    <ResultBadges result={result} />
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {result.metadata.text}
                  </p>
                  <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                    vector {result.score.toFixed(3)}
                    {result.rerankScore !== undefined && ` · rerank ${result.rerankScore.toFixed(3)}`}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {/* Quantization + WebGPU — INFORMATIONAL PREVIEW: the KnowledgeBaseEngine
          contract exposes no quantization or GPU options, so these controls do
          not change how vectors are stored or searched. Sizes are honest
          estimates from live engine.stats(). */}
      <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-medium">
            Vector storage &amp; acceleration{' '}
            <span className="font-normal text-muted-foreground">(preview)</span>
          </h2>
          <a
            href="https://localmode.dev/docs/core/vector-quantization"
            target="_blank"
            rel="noopener noreferrer"
            className="w-fit text-xs text-primary underline underline-offset-2 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            View the implementation
          </a>
        </div>
        <div data-value={quantMode}>
          <SegmentedModePicker
            aria-label="Vector quantization preview"
            items={QUANT_MODES}
            selectedId={quantMode}
            onSelect={setQuantMode}
          />
        </div>
        <p className="text-xs tabular-nums text-muted-foreground">
          {stats && rawBytes !== null
            ? quantMode === 'off'
              ? `${stats.chunks} chunks × ${stats.dimensions} dims ≈ ${formatBytes(rawBytes)} at float32`
              : quantMode === 'sq8'
                ? `SQ8 would store ≈ ${formatBytes(rawBytes / 4)} (4× smaller than ${formatBytes(rawBytes)} float32)`
                : `PQ would store ≈ ${formatBytes(rawBytes / 32)} - ${formatBytes(rawBytes / 8)} (8-32× smaller than ${formatBytes(rawBytes)} float32)`
            : 'Ingest documents to see live storage estimates.'}
        </p>
        <CapabilityGate
          requires="webgpu"
          fallback={
            <p className="text-xs text-muted-foreground">
              WebGPU is not available on this device - vector search runs on the CPU/WASM fallback
              path. Chrome/Edge 113+ ship WebGPU.
            </p>
          }
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              role="switch"
              aria-checked={gpuPreview}
              data-state={gpuPreview ? 'on' : 'off'}
              onClick={() => setGpuPreview((enabled) => !enabled)}
              className={cn(
                'inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                gpuPreview
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-muted text-muted-foreground',
              )}
            >
              WebGPU-accelerated search {gpuPreview ? 'on' : 'off'}
            </button>
            <span className="text-xs text-muted-foreground">WebGPU detected on this device.</span>
          </div>
        </CapabilityGate>
        <p className="text-xs text-muted-foreground">
          Preview only: the knowledge-base engine contract exposes no quantization or GPU options, so
          these controls do not change how vectors are stored or searched. Sizes are honest estimates
          from live engine stats.
        </p>
      </section>
    </div>
  );
}

/* ─────────────────────────── SemanticSearchBlock ──────────────────────────── */

/**
 * The Semantic Search block. Owns the full knowledge-base session through
 * `useKnowledgeBase` (raw-document store, embedding-model load lifecycle,
 * chunking config, and switch-driven re-ingest on either an engine-kind toggle
 * OR an embedding-model switch) and renders the Ingest + Search panels over it.
 */
export function SemanticSearchBlock() {
  const [activeTab, setActiveTab] = useState<TabId>('ingest');

  // The hook passes ONLY `kind` to `createEngine`; the CURRENT embedding-model
  // id is read from a ref kept in sync with the hook's state each render.
  const idRef = useRef(DEFAULT_EMBEDDING_MODEL_ID);

  const kb = useKnowledgeBase({
    embeddingModelId: DEFAULT_EMBEDDING_MODEL_ID,
    chunking: 'recursive',
    chunkSize: 512,
    createEmbeddingModel: (id, onProgress) =>
      transformers.embedding(id, {
        // Transformers.js emits the AnyLoadProgress-compatible shape the hook
        // normalizes into `modelProgress` / `modelProgressValue`.
        onProgress: (p) => onProgress(p as Parameters<typeof onProgress>[0]),
      }),
    isModelCached: (id) => isModelCached(id),
    // Creating an engine loads NOTHING (lazy singletons) — safe on mount and on
    // every engineKind × embeddingModelId change.
    createEngine: async (kind) => {
      const embeddingModel = transformers.embedding(idRef.current);
      const getLanguageModel = async () => {
        // Adapterless-safe device probe (chat/kb pattern): pin the device so the
        // transformers LM does not auto-pick webgpu on `navigator.gpu` presence.
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
            new ChatLocalMode({ model: await getLanguageModel(), maxTokens: ANSWER_MAX_TOKENS }),
        });
      }
      const { createKnowledgeBaseEngine } = await import('@localmode/core');
      return createKnowledgeBaseEngine({ embeddingModel, getLanguageModel });
    },
  });
  // Keep the id ref current for the next `createEngine` invocation (runs before
  // the hook's post-render switch effect fires).
  idRef.current = kb.embeddingModelId;

  const requestEngineKind = (kind: EngineKind) => {
    if (kb.busy || !kb.engine || kind === kb.engineKind) return;
    kb.setEngineKind(kind);
  };

  // ── the session handed to both panels ──
  const session: SemanticSearchSession | null = kb.engine
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
        embeddingModelId: kb.embeddingModelId,
        setEmbeddingModelId: kb.setEmbeddingModelId,
        busy: kb.busy,
        error: kb.error,
      }
    : null;

  // ── status line ──
  const errorText = kb.error;
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
    : errorText
      ? 'error'
      : kb.documents.length > 0
        ? `ready - ${kb.documents.length} docs indexed, ${kb.stats?.chunks ?? 0} chunks`
        : IDLE_STATUS;

  const modelMeta =
    EMBEDDING_MODEL_META[kb.embeddingModelId] ?? { name: kb.embeddingModelId, size: '' };
  const reingest = kb.reingestProgress;
  const reingestFraction = reingest && reingest.total > 0 ? reingest.completed / reingest.total : 0;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4">
      {/* ── status + error ── */}
      <p
        role="status"
        aria-live="polite"
        className="text-xs text-muted-foreground"
      >
        {statusText}
      </p>
      {errorText && (
        <p className="text-xs text-destructive">
          {errorText}
        </p>
      )}

      {/* ── header strip: engine toggle + corpus stats ── */}
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

      {/* ── embedding-model status (useModelLoad + model-downloader) ── */}
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
            ingest or an engine/model switch.
          </p>
        ) : (
          <ModelDownloader
            name={modelMeta.name}
            size={modelMeta.size || undefined}
            category="Embedding"
            progress={kb.modelProgressValue}
            cached={kb.modelCached}
            ready={kb.modelStatus === 'ready'}
            className="max-w-sm"
          />
        )}
      </div>

      {/* ── engine/model switch re-ingest progress ── */}
      {kb.switching && (
        <div
          data-phase={reingest?.phase ?? 'model'}
          role="status"
          aria-live="polite"
          aria-label="Re-ingest progress"
          className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-3"
        >
          <p className="text-xs font-medium">
            Re-ingesting {kb.documents.length} document{kb.documents.length === 1 ? '' : 's'} through
            the {ENGINE_LABELS[kb.engineKind]} engine
            {reingest ? ` - ${reingest.phase} ${reingest.completed}/${reingest.total}` : '…'}
          </p>
          <DownloadProgress value={reingestFraction} complete={false} />
        </div>
      )}

      {/* ── tab strip: a prominent two-view segmented control ── */}
      <div
        role="tablist"
        aria-label="Semantic search"
        className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted/50 p-1"
      >
        {TABS.map((tab) => {
          const Icon = TAB_ICONS[tab.id];
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                selected
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── tab panels: both stay mounted (they gate their own model work) ── */}
      <div
        data-tab={activeTab}
        role="group"
        aria-label="Active tab"
        className="min-h-48"
      >
        {session ? (
          <>
            <div role="tabpanel" aria-label="Ingest" className={cn(activeTab !== 'ingest' && 'hidden')}>
              <IngestPanel session={session} />
            </div>
            <div role="tabpanel" aria-label="Search" className={cn(activeTab !== 'search' && 'hidden')}>
              <SearchPanel session={session} />
            </div>
          </>
        ) : (
          <p className="p-4 text-sm text-muted-foreground">
            {kb.switching || kb.documents.length > 0
              ? 'Re-ingesting the corpus…'
              : 'Preparing engine…'}
          </p>
        )}
      </div>
    </div>
  );
}
