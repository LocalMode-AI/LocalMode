'use client';

/**
 * @file document-qa.tsx
 * @description Document QA block — extractive SQuAD QA grounded on a core-engine corpus (topK-1 search) or a pasted document, plus Donut invoice/document QA over an uploaded image, each with High/Medium/Low confidence tiers.
 * @constraint Core engine only — never imports @localmode/langchain or @localmode/wllama.
 */

import { useRef, useState } from 'react';
import { Loader2, Trash2, X } from 'lucide-react';
import {
  answerQuestion,
  askDocument,
  createKnowledgeBaseEngine,
  isWebGPUSupported,
  type DocumentQAModel,
  type KBSearchResult,
  type KnowledgeBaseEngine,
  type QuestionAnsweringModel,
  type RawDocument,
} from '@localmode/core';
import {
  readFileAsDataUrl,
  useAnswerQuestion,
  useAskDocument,
  useKnowledgeBase,
  useModelLoad,
  type UseModelLoadReturn,
} from '@localmode/react';
import { isModelCached, transformers } from '@localmode/transformers';

import {
  ConfidenceScoreBadge,
  resolveTier,
  type ConfidenceTier,
} from '@/components/confidence-score-badge';
import { ModelDownloader } from '@/components/model-downloader';
import { FileDropzone, type RejectedFile } from '@/components/file-dropzone';
import { IndexedDocumentCard } from '@/components/indexed-document-card';
import { MediaDropzone, type MediaDropzoneRejection } from '@/components/media-dropzone';
import { MultiStepPipelineTracker } from '@/components/pipeline-tracker';

/* ─────────────────────────────── constants ────────────────────────────── */

/** Corpus embedding model (grounds the extractive "Corpus top chunk" mode). */
const EMBEDDING_MODEL_ID = 'Xenova/bge-small-en-v1.5';
const EMBEDDING_MODEL_META = { name: 'BGE Small EN v1.5', size: '~34 MB' };

/**
 * A grounded-answer language model for the engine contract. Document QA never
 * calls `engine.ask()` (it uses standalone QA models + a topK-1 search), so
 * this factory is never invoked — but it must be a valid `LanguageModel`
 * factory so `createKnowledgeBaseEngine` typechecks. Constructed lazily behind
 * a WebGPU adapter probe (chat/write pattern), so it downloads nothing.
 */
const ANSWER_MODEL_ID = 'onnx-community/granite-4.0-350m-ONNX-web';

/** Extractive QA model (packages/transformers QUESTION_ANSWERING_MODELS.DISTILBERT_SQUAD). */
const QA_MODEL_ID = 'Xenova/distilbert-base-cased-distilled-squad';
const QA_MODEL_SIZE = '~260 MB';

/** Document QA model (packages/transformers DOCUMENT_QA_MODELS.DONUT_DOCVQA). */
const DONUT_MODEL_ID = 'Xenova/donut-base-finetuned-docvqa';
const DONUT_MODEL_SIZE = '~800 MB';

/** Accepted document-image types (invoice-qa parity). */
const DOC_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
/** Max document-image / PDF size in bytes. */
const MAX_FILE_SIZE = 10_000_000;

/** Sample context paragraph for extractive QA (qa-bot parity). */
const QA_SAMPLE_CONTEXT = `The Amazon rainforest, also known as Amazonia, is a moist broadleaf tropical rainforest in the Amazon biome that covers most of the Amazon basin of South America. This basin encompasses 7,000,000 km2, of which 5,500,000 km2 are covered by the rainforest. This region includes territory belonging to nine nations and 3,344 formally acknowledged indigenous territories. The majority of the forest is contained within Brazil, with 60% of the rainforest, followed by Peru with 13%, Colombia with 10%, and with minor amounts in Bolivia, Ecuador, French Guiana, Guyana, Suriname, and Venezuela. The Amazon represents over half of the planet's remaining rainforests.`;

/** Suggestion pills grounded in the sample document (qa-bot's 3 + one more). */
const QA_SAMPLE_QUESTIONS = [
  'How large is the Amazon basin?',
  'Which country has the most rainforest?',
  'How many nations have territory in the basin?',
  'What share of the planet’s remaining rainforests does the Amazon represent?',
];

/** Example document-QA questions (invoice-qa parity — all 5). */
const DONUT_EXAMPLE_QUESTIONS = [
  'What is the total amount?',
  'What is the invoice number?',
  'Who is the sender?',
  'What is the date?',
  'What is the billing address?',
];

/** Confidence tier display labels (qa-bot High/Medium/Low). */
const TIER_LABEL: Record<ConfidenceTier, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

/** Human labels for the document-source badge. */
const SOURCE_LABELS: Record<RawDocument['source'], string> = {
  text: 'Text',
  sample: 'Sample',
  pdf: 'PDF',
  ocr: 'OCR',
  import: 'Import',
};

/**
 * Fixed sample corpus (rag-block parity): EXACTLY ONE doc (`Privacy and
 * encryption on device`) is about privacy/encryption, so the query
 * "privacy and encryption" has a known winner for the corpus-grounded path.
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

const BTN_PRIMARY =
  'inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background';
const BTN_SECONDARY =
  'inline-flex h-8 items-center rounded-md border border-border px-3 text-sm disabled:opacity-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';
const PILL =
  'rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';
const INPUT =
  'h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-[3px] focus-visible:ring-ring/50';

/* ─────────────────────────────── helpers ──────────────────────────────── */

/** "docTitle · p. N" when the chunk carries PDF page attribution. */
function sourceTitle(result: KBSearchResult) {
  const { docTitle, page } = result.metadata;
  return page != null ? `${docTitle} · p. ${page}` : docTitle;
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

/** Estimated chunk count for a document under the default recursive chunking. */
function estimateChunkCount(textLength: number, chunkSize: number) {
  return Math.max(1, Math.ceil(textLength / Math.max(1, chunkSize)));
}

/** Segmented-control button styling. */
function segButtonClass(active: boolean) {
  return `rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
    active
      ? 'bg-background font-medium text-foreground shadow-sm'
      : 'text-muted-foreground hover:text-foreground'
  }`;
}

/* ─────────────────────────── DocumentQaBlock ───────────────────────────── */

const ASK_MODES = [
  { id: 'extractive', label: 'Extractive QA', testid: 'document-qa:mode-extractive' },
  { id: 'donut', label: 'Document QA', testid: 'document-qa:mode-donut' },
] as const;

type AskMode = (typeof ASK_MODES)[number]['id'];

/** What the extractive corpus-grounding path reads from the shared session. */
interface Corpus {
  engine: KnowledgeBaseEngine;
  documents: RawDocument[];
  busy: boolean;
}

/**
 * Document QA block. Owns a right-sized corpus through `useKnowledgeBase`
 * LOCKED to the core engine (no toggle UI, never references LangChain), plus
 * two standalone QA surfaces:
 *
 * - **Extractive QA** — `Xenova/distilbert-base-cased-distilled-squad` over a
 *   grounding context that is either the corpus top chunk
 *   (`engine.search(question, { topK: 1 })`) or a pasted document; answers
 *   render with High/Medium/Low confidence tiers.
 * - **Document QA** — `Xenova/donut-base-finetuned-docvqa` over an uploaded
 *   invoice/receipt image ("What is the total amount?"), gated behind an
 *   explicit ~800 MB load.
 *
 * Every model download is gated behind an explicit in-block action.
 */
export function DocumentQaBlock() {
  // createEngine is passed ONLY `kind`; it reads the current embedding-model id
  // from a ref kept in sync with the hook (the createEngine ref trick).
  const idRef = useRef(EMBEDDING_MODEL_ID);

  const kb = useKnowledgeBase({
    embeddingModelId: EMBEDDING_MODEL_ID,
    engineKind: 'core', // LOCKED to core — no toggle UI.
    createEmbeddingModel: (id, onProgress) =>
      transformers.embedding(id, {
        onProgress: (p) => onProgress(p as Parameters<typeof onProgress>[0]),
      }),
    isModelCached: (id) => isModelCached(id),
    // Core engine for EVERY kind — @localmode/langchain is never referenced, so
    // no langchain module ever loads. Constructing the engine downloads nothing
    // (lazy singletons), so this is safe on mount.
    createEngine: () => {
      const embeddingModel = transformers.embedding(idRef.current);
      const getLanguageModel = async () => {
        // Probed but never actually called (document-qa uses standalone QA
        // models + topK-1 search, not engine.ask). Adapterless-safe device pin.
        const device = (await isWebGPUSupported()) ? 'webgpu' : 'wasm';
        return transformers.languageModel(ANSWER_MODEL_ID, { device });
      };
      return createKnowledgeBaseEngine({ embeddingModel, getLanguageModel });
    },
  });
  idRef.current = kb.embeddingModelId;

  const [mode, setMode] = useState<AskMode>('extractive');
  const [draft, setDraft] = useState('');
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);

  // ── PDF lane ──
  const [pdfPipeline, setPdfPipeline] = useState<{
    step: 'extract' | 'ingest';
    fileIndex: number;
    fileCount: number;
    fileName: string;
  } | null>(null);
  const [pdfErrors, setPdfErrors] = useState<Array<{ fileName: string; message: string }>>([]);
  const pdfAbortRef = useRef<AbortController | null>(null);

  const busy = kb.busy;
  const draftTrimmed = draft.trim();
  const hasDocs = kb.documents.length > 0;

  /* ── ingest actions ── */

  const addDraft = async () => {
    if (!draftTrimmed || busy) return;
    await kb.addDocuments([
      { title: deriveTitle(draftTrimmed), text: draftTrimmed, source: 'text' },
    ]);
    setDraft('');
  };

  const loadSamples = async () => {
    if (busy || hasDocs) return;
    await kb.addDocuments(SAMPLE_CORPUS);
  };

  const ingestPDFs = async (files: File[]) => {
    if (busy || pdfPipeline) return;
    setPdfErrors([]);

    const controller = new AbortController();
    pdfAbortRef.current = controller;

    const docs: Array<Omit<RawDocument, 'id' | 'addedAt'>> = [];
    const errors: Array<{ fileName: string; message: string }> = [];

    // Step 1 — extract each file locally (cancellable, per-page attribution).
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
        await kb.addDocuments(docs);
      } finally {
        setPdfPipeline(null);
      }
    } else {
      setPdfPipeline(null);
    }
  };

  const deleteDocument = async (docId: string) => {
    if (busy || deletingDocId) return;
    setDeletingDocId(docId);
    try {
      await kb.removeDocument(docId);
    } finally {
      setDeletingDocId(null);
    }
  };

  const clearAll = async () => {
    if (busy) return;
    setConfirmingClear(false);
    await kb.clearAll();
  };

  /* ── status line ── */

  const errorText = kb.error;
  const tick = kb.ingestProgress;
  const working = busy || (!kb.engine && hasDocs);
  const statusText = working
    ? kb.modelStatus === 'loading'
      ? `loading embedding model… ${Math.round(kb.modelProgress * 100)}%`
      : tick
        ? `indexing - ${tick.phase} ${tick.completed}/${tick.total}`
        : 'indexing…'
    : errorText
      ? 'error'
      : hasDocs
        ? `ready - ${kb.documents.length} docs indexed, ${kb.stats?.chunks ?? 0} chunks`
        : 'idle - paste text, load the sample corpus, or upload a document image to begin';

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
      {/* ── block-root status ── */}
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

      {/* ── embedding-model gate (grounds the corpus path; ~34 MB) ── */}
      <div
        data-status={kb.modelStatus}
        data-model-id={kb.embeddingModelId}
        role="group"
        aria-label="Embedding model status"
      >
        {kb.modelStatus === 'idle' ? (
          <p className="text-xs text-muted-foreground">
            Corpus embedding model: <span className="font-medium">{EMBEDDING_MODEL_META.name}</span>{' '}
            ({EMBEDDING_MODEL_META.size}) - not loaded. It downloads on the first corpus ingest.
          </p>
        ) : (
          <ModelDownloader
            name={EMBEDDING_MODEL_META.name}
            size={EMBEDDING_MODEL_META.size}
            category="Embedding"
            progress={kb.modelProgressValue}
            cached={kb.modelCached}
            ready={kb.modelReady}
            className="max-w-sm"
          />
        )}
      </div>

      {/* ── slim ingest: text paste + sample corpus + PDF (page-attributed) ── */}
      <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
        <header>
          <h2 className="text-sm font-semibold">Corpus</h2>
          <p className="text-xs text-muted-foreground">
            Optional - feed the extractive “Corpus top chunk” grounding. The Donut Document QA tool
            works standalone.
          </p>
        </header>

        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={4}
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
          {!hasDocs && (
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

        {/* PDF lane — extracted per page, so grounding carries page attribution. */}
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
            onReject={(rejected: RejectedFile[]) =>
              setPdfErrors((prev) => [
                ...prev,
                ...rejected.map((r) => ({ fileName: r.file.name, message: r.reason })),
              ])
            }
          />
        </div>
        {pdfPipeline && (
          <div className="flex flex-col gap-2">
            <MultiStepPipelineTracker
              steps={['Extract', 'Chunk · Embed · Store']}
              completed={pdfPipeline.step === 'extract' ? 0 : 1}
              currentStep={pdfPipeline.step === 'extract' ? 'Extract' : 'Chunk · Embed · Store'}
            />
            {pdfPipeline.step === 'extract' && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
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
              </div>
            )}
          </div>
        )}
        {pdfErrors.length > 0 && (
          <div
            role="alert"
            className="flex flex-col gap-1 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2"
          >
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

        {/* Corpus document list */}
        {hasDocs && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span
                data-docs={kb.documents.length}
                data-chunks={kb.stats?.chunks ?? 0}
                role="group"
                aria-label="Corpus size"
                className="text-xs tabular-nums text-muted-foreground"
              >
                {kb.documents.length} docs · {kb.stats?.chunks ?? 0} chunks
                {kb.stats ? ` · ${kb.stats.dimensions}d` : ''}
              </span>
              {confirmingClear ? (
                <span className="inline-flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void clearAll()}
                    disabled={busy}
                    className="inline-flex h-7 items-center rounded-md bg-destructive px-3 text-xs font-medium text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    Confirm clear all
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingClear(false)}
                    className="inline-flex h-7 items-center rounded-md border border-border px-3 text-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingClear(true)}
                  disabled={busy}
                  className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-3 text-xs text-destructive disabled:opacity-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                  Clear all
                </button>
              )}
            </div>
            <div className="flex flex-col gap-2">
              {kb.documents.map((doc) => {
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
                      chunkCount={estimateChunkCount(doc.text.length, kb.chunkSize)}
                      pageCount={pageCount}
                      sizeBytes={sizeBytes}
                    />
                    <div className="flex flex-wrap items-center gap-2 px-1 text-xs text-muted-foreground">
                      <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-foreground">
                        {SOURCE_LABELS[doc.source]}
                      </span>
                      {doc.category && (
                        <span className="rounded border border-border px-1.5 py-0.5">
                          {doc.category}
                        </span>
                      )}
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
              })}
            </div>
          </div>
        )}
      </section>

      {/* ── QA mode switch ── */}
      <div
        data-mode={mode}
        role="group"
        aria-label="QA mode"
        className="inline-flex w-fit items-center gap-1 rounded-lg border border-border bg-muted/50 p-1"
      >
        {ASK_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            aria-pressed={mode === m.id}
            onClick={() => setMode(m.id)}
            className={segButtonClass(mode === m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Both panels stay mounted so per-mode history survives mode switches. */}
      <section hidden={mode !== 'extractive'} aria-label="Extractive QA">
        {kb.engine ? (
          <ExtractiveQaPanel
            corpus={{ engine: kb.engine, documents: kb.documents, busy: kb.busy }}
          />
        ) : (
          <p className="p-4 text-sm text-muted-foreground">Preparing engine…</p>
        )}
      </section>
      <section hidden={mode !== 'donut'} aria-label="Document QA">
        <DonutQaPanel />
      </section>
    </div>
  );
}

/* ───────────────────── (a) Extractive QA — qa-bot parity ───────────────── */

interface ExtractiveEntry {
  id: string;
  question: string;
  answer: string;
  score: number;
  /** What the answer was grounded on (chunk title or "pasted document"). */
  contextLabel: string;
}

function ExtractiveQaPanel({ corpus }: { corpus: Corpus }) {
  // Explicit gated load: instance creation is lazy/download-free; the Load
  // button drives load() whose warmup runs a REAL answerQuestion inference.
  const load = useModelLoad<QuestionAnsweringModel>({
    key: QA_MODEL_ID,
    create: (onProgress) => transformers.questionAnswering(QA_MODEL_ID, { onProgress }),
    warmup: (model) =>
      answerQuestion({
        model,
        question: 'What is ready?',
        context: 'The extractive QA model is ready.',
      }),
  });

  // useModelLoad creates the instance in a client mount effect — null for one tick.
  if (!load.model) return null;
  return <ExtractiveQaSurface corpus={corpus} load={load} model={load.model} />;
}

function ExtractiveQaSurface({
  corpus,
  load,
  model,
}: {
  corpus: Corpus;
  load: UseModelLoadReturn<QuestionAnsweringModel>;
  model: QuestionAnsweringModel;
}) {
  const qa = useAnswerQuestion({ model });

  const [contextSource, setContextSource] = useState<'corpus' | 'pasted'>('pasted');
  const [pastedContext, setPastedContext] = useState('');
  const [question, setQuestion] = useState('');
  const [entries, setEntries] = useState<ExtractiveEntry[]>([]);
  const [isGrounding, setIsGrounding] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const groundingAbortRef = useRef<AbortController | null>(null);

  const busy = isGrounding || qa.isLoading;
  const hasCorpus = corpus.documents.length > 0;
  const wordCount = pastedContext.trim() ? pastedContext.trim().split(/\s+/).length : 0;

  const canRun =
    load.status === 'ready' &&
    !busy &&
    question.trim().length > 0 &&
    (contextSource === 'pasted'
      ? pastedContext.trim().length > 0
      : hasCorpus && !corpus.busy);

  const ask = async () => {
    const q = question.trim();
    if (!canRun || !q) return;
    setLocalError(null);

    // Resolve the grounding context per the selected source.
    let context: string;
    let contextLabel: string;
    if (contextSource === 'corpus') {
      const controller = new AbortController();
      groundingAbortRef.current = controller;
      setIsGrounding(true);
      try {
        const hits = await corpus.engine.search(q, { topK: 1, abortSignal: controller.signal });
        const top = hits[0];
        if (!top) {
          setLocalError(
            'No indexed chunk matched the question - ingest documents or switch to a pasted context.',
          );
          return;
        }
        context = top.metadata.text;
        contextLabel = sourceTitle(top);
      } catch (err) {
        if (!controller.signal.aborted && !isAbort(err)) {
          setLocalError(errorMessage(err));
        }
        return;
      } finally {
        setIsGrounding(false);
        groundingAbortRef.current = null;
      }
    } else {
      context = pastedContext.trim();
      contextLabel = 'pasted document';
    }

    const result = await qa.execute({ question: q, context });
    if (result) {
      setEntries((prev) => [
        { id: crypto.randomUUID(), question: q, answer: result.answer, score: result.score, contextLabel },
        ...prev,
      ]);
      setQuestion('');
    }
  };

  const cancel = () => {
    groundingAbortRef.current?.abort();
    qa.cancel();
  };

  const errorText = localError ?? qa.error?.message ?? load.error?.message ?? null;

  return (
    <div className="flex flex-col gap-4">
      {/* Explicit gated model load — nothing downloads until clicked. */}
      {load.status !== 'ready' && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void load.load().catch(() => {/* surfaced via load.error */})}
            disabled={load.status === 'loading'}
            className={BTN_PRIMARY}
          >
            {load.status === 'loading'
              ? `Loading DistilBERT-SQuAD… ${Math.round(load.progress * 100)}%`
              : `Load DistilBERT-SQuAD (${QA_MODEL_SIZE})`}
          </button>
          <span className="text-xs text-muted-foreground">
            Extractive answers run a local SQuAD model - nothing downloads until you click.
          </span>
        </div>
      )}

      {errorText && (
        <p className="text-xs text-destructive">
          {errorText}
        </p>
      )}

      {/* Context source toggle: corpus top chunk ⇄ pasted document. */}
      <div
        role="group"
        aria-label="Context source"
        className="inline-flex w-fit items-center gap-1 rounded-lg border border-border bg-muted/50 p-1"
      >
        <button
          type="button"
          aria-pressed={contextSource === 'corpus'}
          onClick={() => setContextSource('corpus')}
          className={segButtonClass(contextSource === 'corpus')}
        >
          Corpus top chunk
        </button>
        <button
          type="button"
          aria-pressed={contextSource === 'pasted'}
          onClick={() => setContextSource('pasted')}
          className={segButtonClass(contextSource === 'pasted')}
        >
          Pasted document
        </button>
      </div>

      {contextSource === 'corpus' ? (
        <p className="text-xs text-muted-foreground">
          {hasCorpus
            ? `Each ask retrieves the best-matching chunk from the ${corpus.documents.length}-document corpus and extracts the answer from it.`
            : 'The corpus is empty - add documents above, or switch to a pasted document.'}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <textarea
            value={pastedContext}
            onChange={(e) => setPastedContext(e.target.value)}
            placeholder="Paste a paragraph of text to ask questions about…"
            rows={5}
            aria-label="Document context"
            className="w-full rounded-md border border-input bg-background p-3 text-sm leading-relaxed"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setPastedContext(QA_SAMPLE_CONTEXT)}
              className={BTN_SECONDARY}
            >
              Load sample document
            </button>
            {wordCount > 0 && (
              <span className="text-xs text-muted-foreground">
                {wordCount.toLocaleString()} words
              </span>
            )}
          </div>
          {pastedContext.trim().length > 0 && (
            <div
              role="group"
              aria-label="Suggested questions"
              className="flex flex-wrap items-center gap-2"
            >
              <span className="text-xs text-muted-foreground">Try:</span>
              {QA_SAMPLE_QUESTIONS.map((q) => (
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
        </div>
      )}

      {/* Question input + run/cancel. */}
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
          placeholder="Ask about the context…"
          aria-label="Question"
          className={INPUT}
        />
        <button
          type="button"
          onClick={() => void ask()}
          disabled={!canRun}
          className={BTN_PRIMARY}
        >
          {busy ? 'Answering…' : 'Ask'}
        </button>
        {busy && (
          <button
            type="button"
            onClick={cancel}
            className={BTN_SECONDARY}
          >
            Cancel
          </button>
        )}
      </div>

      {/* History — newest first; the newest item carries the answer testids. */}
      {entries.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">
              {entries.length} {entries.length === 1 ? 'answer' : 'answers'}
            </p>
            <button
              type="button"
              onClick={() => setEntries([])}
              className={BTN_SECONDARY}
            >
              Clear history
            </button>
          </div>
          <ol
            data-count={String(entries.length)}
            aria-label="Answer history"
            className="flex flex-col gap-2"
          >
            {entries.map((entry, i) => (
              <li
                key={entry.id}
                className="rounded-lg border border-border bg-card p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium">{entry.question}</p>
                  <button
                    type="button"
                    aria-label={`Delete answer to "${entry.question}"`}
                    onClick={() => setEntries((prev) => prev.filter((e) => e.id !== entry.id))}
                    className="rounded p-1 text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
                <p
                  className="mt-1 whitespace-pre-wrap text-sm leading-relaxed"
                  {...(i === 0
                    ? {
                        role: 'group',
                        'aria-label': 'Latest answer',
                      }
                    : {})}
                >
                  {entry.answer}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span
                    {...(i === 0
                      ? {
                          'data-score': String(entry.score),
                          role: 'group',
                          'aria-label': 'Answer confidence',
                        }
                      : {})}
                  >
                    <ConfidenceScoreBadge
                      score={entry.score}
                      precision={1}
                      label={`${TIER_LABEL[resolveTier(entry.score)]} confidence`}
                    />
                  </span>
                  <span className="text-xs text-muted-foreground">
                    grounded on: {entry.contextLabel}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

/* ─────────────── (b) Document / invoice QA — invoice-qa parity ──────────── */

interface DonutEntry {
  id: string;
  question: string;
  answer: string;
  score: number;
}

/**
 * Tiny synthetic document image for the Donut warmup — the gated load forces
 * the provider download to completion with one REAL (throwaway) inference.
 */
function warmupDocumentImage() {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 48;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000000';
    ctx.font = '12px sans-serif';
    ctx.fillText('TOTAL: $42', 8, 24);
  }
  return canvas.toDataURL('image/png');
}

function DonutQaPanel() {
  const load = useModelLoad<DocumentQAModel>({
    key: DONUT_MODEL_ID,
    create: (onProgress) => transformers.documentQA(DONUT_MODEL_ID, { onProgress }),
    warmup: (model) =>
      askDocument({ model, document: warmupDocumentImage(), question: 'What is the total?' }),
  });

  if (!load.model) return null;
  return <DonutQaSurface load={load} model={load.model} />;
}

function DonutQaSurface({
  load,
  model,
}: {
  load: UseModelLoadReturn<DocumentQAModel>;
  model: DocumentQAModel;
}) {
  const doc = useAskDocument({ model });

  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [entries, setEntries] = useState<DonutEntry[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const canAsk =
    load.status === 'ready' &&
    !doc.isLoading &&
    imageDataUrl !== null &&
    question.trim().length > 0;

  const onFiles = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setUploadError(null);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setImageDataUrl(dataUrl);
      // New document → new Q&A session (invoice-qa behavior).
      setEntries([]);
      doc.reset();
    } catch {
      setUploadError('Failed to read the uploaded file');
    }
  };

  const ask = async () => {
    const q = question.trim();
    if (!canAsk || !imageDataUrl || !q) return;
    const result = await doc.execute({ document: imageDataUrl, question: q });
    if (result) {
      setEntries((prev) => [
        { id: crypto.randomUUID(), question: q, answer: result.answer, score: result.score },
        ...prev,
      ]);
      setQuestion('');
    }
  };

  const reset = () => {
    setImageDataUrl(null);
    setEntries([]);
    setQuestion('');
    setUploadError(null);
    doc.reset();
  };

  const errorText = uploadError ?? doc.error?.message ?? load.error?.message ?? null;

  return (
    <div className="flex flex-col gap-4">
      {/* Explicit gated model load — the button carries the Donut download size. */}
      {load.status !== 'ready' && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void load.load().catch(() => {/* surfaced via load.error */})}
            disabled={load.status === 'loading'}
            className={BTN_PRIMARY}
          >
            {load.status === 'loading'
              ? `Loading Donut DocVQA… ${Math.round(load.progress * 100)}%`
              : `Load Donut DocVQA (${DONUT_MODEL_SIZE})`}
          </button>
          <span className="text-xs text-muted-foreground">
            Document QA runs Donut locally - this is a large download; nothing fetches until you
            click.
          </span>
        </div>
      )}

      {errorText && (
        <p className="text-xs text-destructive">
          {errorText}
        </p>
      )}

      <div role="group" aria-label="Document image upload">
        {imageDataUrl ? (
          <div className="flex flex-col gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- data-URL preview */}
            <img
              src={imageDataUrl}
              alt="Uploaded document"
              className="max-h-80 w-auto self-start rounded-lg border border-border"
            />
            <MediaDropzone
              addAnother
              accept={DOC_IMAGE_TYPES}
              maxSize={MAX_FILE_SIZE}
              multiple={false}
              processing={doc.isLoading}
              processingLabel="Answering…"
              onFiles={(files) => void onFiles(files)}
              onReject={(rejections: MediaDropzoneRejection[]) =>
                setUploadError(rejections[0]?.reason ?? 'File rejected')
              }
            />
          </div>
        ) : (
          <MediaDropzone
            accept={DOC_IMAGE_TYPES}
            maxSize={MAX_FILE_SIZE}
            multiple={false}
            title="Drop a document image"
            subtitle="Invoice, receipt, or form - then ask about it"
            onFiles={(files) => void onFiles(files)}
            onReject={(rejections: MediaDropzoneRejection[]) =>
              setUploadError(rejections[0]?.reason ?? 'File rejected')
            }
          />
        )}
      </div>

      {imageDataUrl && (
        <>
          <div
            role="group"
            aria-label="Suggested document questions"
            className="flex flex-wrap items-center gap-2"
          >
            <span className="text-xs text-muted-foreground">Try:</span>
            {DONUT_EXAMPLE_QUESTIONS.map((q) => (
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
              placeholder="What is the total amount?"
              aria-label="Document question"
              className={INPUT}
            />
            <button
              type="button"
              onClick={() => void ask()}
              disabled={!canAsk}
              className={BTN_PRIMARY}
            >
              {doc.isLoading ? 'Answering…' : 'Ask'}
            </button>
            {doc.isLoading && (
              <button
                type="button"
                onClick={doc.cancel}
                className={BTN_SECONDARY}
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={reset}
              className={BTN_SECONDARY}
            >
              Reset
            </button>
          </div>
        </>
      )}

      {/* History — newest first; the newest item carries the answer testids. */}
      {entries.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">
              {entries.length} {entries.length === 1 ? 'answer' : 'answers'}
            </p>
            <button
              type="button"
              onClick={() => setEntries([])}
              className={BTN_SECONDARY}
            >
              Clear history
            </button>
          </div>
          <ol
            data-count={String(entries.length)}
            className="flex flex-col gap-2"
          >
            {entries.map((entry, i) => (
              <li key={entry.id} className="rounded-lg border border-border bg-card p-3">
                <p className="text-sm font-medium">{entry.question}</p>
                <p
                  className="mt-1 whitespace-pre-wrap text-sm leading-relaxed"
                  {...(i === 0
                    ? {
                        role: 'group',
                        'aria-label': 'Latest document answer',
                      }
                    : {})}
                >
                  {entry.answer}
                </p>
                <span
                  className="mt-2 inline-flex"
                  {...(i === 0
                    ? {
                        'data-score': String(entry.score),
                        role: 'group',
                        'aria-label': 'Document answer confidence',
                      }
                    : {})}
                >
                  <ConfidenceScoreBadge
                    score={entry.score}
                    precision={1}
                    label={`${TIER_LABEL[resolveTier(entry.score)]} confidence`}
                  />
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
